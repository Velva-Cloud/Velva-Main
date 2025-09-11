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

type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export default function Dashboard() {
  useRequireAuth();

  const [servers, setServers] = useState<Server[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [name, setName] = useState('');
  const [planId, setPlanId] = useState<number | ''>('');
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
    // Load subscription first, then plans so we can filter to the subscribed plan
    Promise.all([
      api.get('/subscriptions/me').catch(() => ({ data: null })),
      api.get('/plans'),
    ])
      .then(([subRes, plansRes]) => {
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
      const res = await api.post('/servers', { name: name.trim(), planId });
      setServers([res.data, ...servers]);
      setTotal((t) => t + 1);
      setName('');
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to create server');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Head>
        <title>Dashboard • VelvaCloud</title>
      </Head>
      <NavBar />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Your Servers</h1>
          <div className="text-sm text-slate-400">Page {page} of {totalPages} • {total} total</div>
        </div>

        {/* Plan usage / subscription indicator */}
        <div className="mb-4 p-3 rounded border border-slate-800 bg-slate-900">
          {!sub ? (
            <div className="flex items-center justify-between">
              <div className="text-slate-300">No active subscription. Choose a server size to subscribe.</div>
              <a className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500" href="/billing">Go to Billing</a>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-slate-300">
                <span className="font-semibold">Your plan:</span>{' '}
                {(() => {
                  const ramMB = Number(sub?.plan?.resources?.ramMB) || 0;
                  const ramGB = ramMB ? Math.round((ramMB / 1024) * 10) / 10 : null;
                  const cpu = sub?.plan?.resources?.cpu;
                  const disk = sub?.plan?.resources?.diskGB;
                  return (
                    <>
                      {ramGB ? `${ramGB} GB RAM` : sub.plan?.name}
                      {cpu ? ` • ${cpu} CPU units` : ''}
                      {disk ? ` • ${disk} GB SSD` : ''}
                    </>
                  );
                })()}
              </div>
              <div className="text-slate-300">
                Servers used: <span className={limitReached ? 'text-amber-400' : 'text-emerald-400'}>{total}</span> / {maxServers}
              </div>
            </div>
          )}
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <input
            id="server-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Server name"
            className="px-3 py-2 rounded bg-slate-800 border border-slate-700"
            aria-invalid={!!nameError}
            disabled={!sub || sub.status !== 'active' || limitReached}
          />
          <select
            value={planId}
            onChange={e => setPlanId(Number(e.target.value))}
            className="px-3 py-2 rounded bg-slate-800 border border-slate-700"
            aria-label="Select server size"
            disabled={!sub || sub.status !== 'active' || plans.length === 0 || limitReached}
          >
            {plans.map(p => {
              const ramMB = Number((p as any)?.resources?.ramMB) || 0;
              const ramGB = ramMB ? Math.round((ramMB / 1024) * 10) / 10 : null;
              const label = ramGB ? `${ramGB} GB RAM • ${p.pricePerMonth}/mo` : p.name;
              return <option key={p.id} value={p.id}>{label}</option>;
            })}
          </select>
          <button
            onClick={createServer}
            disabled={creating || !sub || sub.status !== 'active' || limitReached}
            className={`bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded ${creating || !sub || sub.status !== 'active' || limitReached ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {creating ? 'Creating…' : 'Create server'}
          </button>
          {(err || nameError) && <div className="text-red-400 w-full">{err || nameError}</div>}
        </div>

        {servers.length === 0 ? (
          <div className="relative overflow-hidden card p-10 text-center">
            <div
              className="absolute inset-0 -z-10 opacity-40"
              style={{
                background:
                  'radial-gradient(500px 200px at 20% 0%, rgba(109,40,217,0.25), transparent 60%), radial-gradient(500px 200px at 80% 100%, rgba(6,182,212,0.25), transparent 60%)',
              }}
            />
            <img src="https://velvacloud.com/logo.png" alt="VelvaCloud" className="mx-auto h-16 w-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No servers yet</h3>
            <p className="text-slate-400 mb-5">Use the form above to create your first server on VelvaCloud.</p>
            <button onClick={createServer} disabled={creating || !sub || sub.status !== 'active' || limitReached} className={`btn btn-primary ${creating || !sub || sub.status !== 'active' || limitReached ? 'opacity-70 cursor-not-allowed' : ''}`}>{creating ? 'Creating…' : 'Create server'}</button>
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {servers.map(s => (
                <li key={s.id} className="p-4 bg-slate-900 rounded border border-slate-800">
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-sm text-slate-300">Status: {s.status} • Plan #{s.planId}</div>
                </li>
              ))}
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
      </main>
    </>
  );
}