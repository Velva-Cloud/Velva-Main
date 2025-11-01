import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import NavBar from '../components/NavBar';
import { useRequireAuth } from '../utils/guards';

type Server = {
  id: number;
  name: string;
  status: string;
  planId: number;
  plan?: { id: number; name: string } | null;
  node?: { id: number; name: string } | null;
};

type Plan = {
  id: number;
  name: string;
  pricePerMonth?: string;
  resources?: any;
};

type Subscription = {
  id: number;
  planId: number;
  status: 'active' | 'past_due' | 'canceled' | 'expired';
  plan?: Plan;
};

type Me = { id: number; email: string; role: string; suspended?: boolean } | null;

type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export default function Dashboard() {
  useRequireAuth();

  const [servers, setServers] = useState<Server[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [me, setMe] = useState<Me>(null);
  const [name, setName] = useState('');
  const [planId, setPlanId] = useState<number | ''>('');
  const [image, setImage] = useState('nginx:alpine');
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const nameError = useMemo(() => {
    const n = name.trim();
    if (n.length < 3) return 'Name must be at least 3 characters';
    if (n.length > 32) return 'Name must be at most 32 characters';
    if (!/^[A-Za-z0-9_-]+$/.test(n)) return 'Only letters, numbers, dash and underscore allowed';
    return null;
  }, [name]);

  const maxServers = Number(sub?.plan?.resources?.maxServers ?? 1);
  const limitReached = sub ? total >= maxServers : true;
  const suspended = !!me?.suspended;

  const fetchServers = async () => {
    try {
      const res = await api.get('/servers', { params: { page, pageSize } });
      const data = res.data as Paged<Server>;
      setServers(data.items);
      setTotal(data.total);
    } catch {
      setServers([]);
      setTotal(0);
    }
  };

  useEffect(() => {
    fetchServers();
  }, [page]);

  useEffect(() => {
    // Load me + subscription and plans
    Promise.all([
      api.get('/users/me').catch(() => ({ data: null })),
      api.get('/subscriptions/me').catch(() => ({ data: null })),
      api.get('/plans'),
    ])
      .then(([meRes, subRes, plansRes]) => {
        setMe(meRes.data as any);
        const subData = subRes.data as any;
        setSub(subData);
        const data = plansRes.data as any;
        const list: any[] = Array.isArray(data) ? data : (data?.items ?? []);
        const normalized: Plan[] = list
          .map((p: any) => ({ id: p.id, name: p.name, pricePerMonth: p.pricePerMonth, resources: p.resources }))
          .filter((p: any) => p.id !== undefined);

        // Only allow selecting the subscribed plan on the dashboard
        const filtered = subData ? normalized.filter(p => p.id === subData.planId) : normalized;
        setPlans(filtered);
        if (filtered.length > 0) setPlanId(filtered[0].id);
      })
      .catch(() => {
        setPlans([]);
        setSub(null);
      });
  }, []);

  const createServer = async () => {
    setErr(null);
    try {
      if (suspended) {
        setErr('Your account is suspended. Please contact support.');
        return;
      }
      if (!sub || sub.status !== 'active') {
        setErr('You need an active subscription to create a server.');
        return;
      }
      if (!planId) {
        setErr('Please select a plan');
        return;
      }
      if (limitReached) {
        setErr(`Your plan allows up to ${maxServers} server${maxServers > 1 ? 's' : ''}.`);
        return;
      }
      if (nameError) {
        setErr(nameError);
        return;
      }
      setCreating(true);
      const res = await api.post('/servers', { name: name.trim(), planId, image: image.trim() || undefined });
      setServers([res.data, ...servers]);
      setTotal((t) => t + 1);
      setName('');
      setImage('nginx:alpine');
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to create server');
    } finally {
      setCreating(false);
    }
  };

  const planSummary = (() => {
    const ramMB = Number(sub?.plan?.resources?.ramMB) || 0;
    const ramGB = ramMB ? Math.round((ramMB / 1024) * 10) / 10 : null;
    const cpu = sub?.plan?.resources?.cpu;
    const disk = sub?.plan?.resources?.diskGB;
    return ramGB ? `${ramGB} GB RAM${cpu ? ` • ${cpu} CPU` : ''}${disk ? ` • ${disk} GB SSD` : ''}` : sub?.plan?.name || '—';
  })();

  return (
    <>
      <Head>
        <title>Dashboard • VelvaCloud</title>
      </Head>
      <NavBar />
      <main className="container px-6 py-10">
        {/* Overview cards */}
        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card p-4">
            <div className="subtle text-sm">Total servers</div>
            <div className="text-2xl font-semibold mt-1">{total}</div>
          </div>
          <div className="card p-4">
            <div className="subtle text-sm">Subscription</div>
            <div className="text-sm mt-1">{sub ? sub.status.toUpperCase() : 'NONE'}</div>
          </div>
          <div className="card p-4">
            <div className="subtle text-sm">Plan</div>
            <div className="text-sm mt-1">{planSummary}</div>
          </div>
          <div className="card p-4">
            <div className="subtle text-sm">Usage</div>
            <div className="text-sm mt-1">{sub ? `${Math.min(total, maxServers)} / ${maxServers}` : '—'}</div>
          </div>
        </section>

        {suspended && (
          <div className="mb-6 p-3 rounded border border-amber-800 bg-amber-900/30 text-amber-200">
            Your account is currently suspended. You can view servers but cannot perform actions. Please contact support.
          </div>
        )}

        {/* Create server CTA */}
        <section className="card p-5 mb-8">
          {!sub ? (
            <div className="flex items-center justify-between">
              <div className="subtle">No active subscription. Choose a server size to subscribe.</div>
              <a className="btn btn-primary" href="/billing">Go to Billing</a>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-sm subtle">
                Configure a new server with name, plan, and game/application image on the creation page.
              </div>
              <a
                href="/servers/create"
                className={`btn btn-primary ${!sub || sub.status !== 'active' || limitReached ? 'opacity-70 cursor-not-allowed' : ''}`}
                aria-disabled={!sub || sub.status !== 'active' || limitReached}
              >
                Create server
              </a>
            </div>
          )}
        </section>

        {/* Server list */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Your Servers</h2>
            <div className="text-sm subtle">Page {page} of {totalPages} • {total} total</div>
          </div>

          {servers.length === 0 ? (
            <div className="relative overflow-hidden card p-10 text-center">
              <img src="https://velvacloud.com/logo.png" alt="VelvaCloud" className="mx-auto h-16 w-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No servers yet</h3>
              <p className="subtle mb-5">Use the creation page to spin up your first server.</p>
              <a href="/servers/create" className={`btn btn-primary ${!sub || sub.status !== 'active' || limitReached ? 'opacity-70 cursor-not-allowed' : ''}`} aria-disabled={!sub || sub.status !== 'active' || limitReached}>Create server</a>
            </div>
          ) : (
            <>
              <ul className="space-y-3">
                {servers.map((s) => {
                  const chipClass =
                    s.status === 'running'
                      ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-700'
                      : s.status === 'suspended'
                      ? 'bg-amber-600/30 text-amber-200 border border-amber-700'
                      : 'bg-slate-600/30 text-slate-300 border border-slate-700';
                  return (
                    <li key={s.id} className="p-4 card">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold break-words">
                            <a className="hover:underline" href={`/servers/${s.id}`}>{s.name}</a>
                            <span className={`ml-2 inline-block text-xs px-2 py-0.5 rounded-full ${chipClass}`}>{s.status}</span>
                          </div>
                          <div className="text-sm subtle">
                            Plan {s.plan?.name ? `${s.plan.name} (#${s.planId})` : `#${s.planId}`}
                            {s.node ? <> • Node {s.node.name} (#{s.node.id})</> : null}
                          </div>
                        </div>
                        <div className="text-sm subtle">ID #{s.id}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center justify-between mt-4">
                <div />
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">Prev</button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}