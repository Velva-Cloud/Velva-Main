import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../utils/api';
import NavBar from '../../components/NavBar';
import { useRequireAuth } from '../../utils/guards';

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

export default function CreateServerPage() {
  useRequireAuth();
  const router = useRouter();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [me, setMe] = useState<Me>(null);

  const [name, setName] = useState('');
  const [planId, setPlanId] = useState<number | ''>('');
  const [image, setImage] = useState('nginx:alpine');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [total, setTotal] = useState(0);

  const nameError = useMemo(() => {
    const n = name.trim();
    if (n.length < 3) return 'Name must be at least 3 characters';
    if (n.length > 32) return 'Name must be at most 32 characters';
    if (!/^[A-Za-z0-9_-]+$/.test(n)) return 'Only letters, numbers, dash and underscore allowed';
    return null;
  }, [name]);

  useEffect(() => {
    // Load me + subscription and plans and current usage
    Promise.all([
      api.get('/users/me').catch(() => ({ data: null })),
      api.get('/subscriptions/me').catch(() => ({ data: null })),
      api.get('/plans'),
      api.get('/servers', { params: { page: 1, pageSize: 1 } }).catch(() => ({ data: { total: 0 } })),
    ])
      .then(([meRes, subRes, plansRes, serversRes]) => {
        setMe(meRes.data as any);
        const subData = subRes.data as any;
        setSub(subData);
        const data = plansRes.data as any;
        const list: any[] = Array.isArray(data) ? data : (data?.items ?? []);
        const normalized: Plan[] = list
          .map((p: any) => ({ id: p.id, name: p.name, pricePerMonth: p.pricePerMonth, resources: p.resources }))
          .filter((p: any) => p.id !== undefined);

        // Only allow selecting the subscribed plan on the creation page if subscription exists
        const filtered = subData ? normalized.filter(p => p.id === subData.planId) : normalized;
        setPlans(filtered);
        if (filtered.length > 0) setPlanId(filtered[0].id);

        const serversData = serversRes.data as any;
        setTotal(Number(serversData?.total ?? 0));
      })
      .catch(() => {
        setPlans([]);
        setSub(null);
        setTotal(0);
      });
  }, []);

  const maxServers = Number(sub?.plan?.resources?.maxServers ?? 1);
  const limitReached = sub ? total >= maxServers : true;
  const suspended = !!me?.suspended;

  const images = [
    {
      id: 'nginx:alpine',
      label: 'Nginx (web)',
      description: 'Lightweight web server suitable for static sites and reverse proxy.',
      img: '/images/nginx.png', // optional local placeholder if available
      fallback: 'https://avatars.githubusercontent.com/u/529617?s=200&v=4',
    },
    {
      id: 'itzg/minecraft-server',
      label: 'Minecraft (Java)',
      description: 'Popular Java edition server image with extensive env configuration.',
      img: '/images/minecraft.png',
      fallback: 'https://raw.githubusercontent.com/itzg/docker-minecraft-server/master/logo.png',
    },
  ];

  const planSummary = (() => {
    const ramMB = Number(sub?.plan?.resources?.ramMB) || 0;
    const ramGB = ramMB ? Math.round((ramMB / 1024) * 10) / 10 : null;
    const cpu = sub?.plan?.resources?.cpu;
    const disk = sub?.plan?.resources?.diskGB;
    return ramGB ? `${ramGB} GB RAM${cpu ? ` • ${cpu} CPU` : ''}${disk ? ` • ${disk} GB SSD` : ''}` : sub?.plan?.name || '—';
  })();

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
      // After creation, redirect to server page
      const server = res.data as { id: number };
      router.push(`/servers/${server.id}`);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to create server');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Head>
        <title>Create Server • VelvaCloud</title>
      </Head>
      <NavBar />
      <main className="container px-6 py-10">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold mb-2">Create a new server</h1>
          <p className="subtle mb-6">
            Configure your server name, select a plan, and choose a game/application image.
          </p>

          {!sub ? (
            <div className="card p-5 mb-8">
              <div className="flex items-center justify-between">
                <div className="subtle">No active subscription. Choose a server size to subscribe.</div>
                <a className="btn btn-primary" href="/billing">Go to Billing</a>
              </div>
            </div>
          ) : (
            <>
              {suspended && (
                <div className="mb-6 p-3 rounded border border-amber-800 bg-amber-900/30 text-amber-200">
                  Your account is currently suspended. You can view servers but cannot perform actions. Please contact support.
                </div>
              )}

              <section className="card p-5 mb-8">
                <div className="grid gap-4">
                  <div>
                    <div className="text-sm mb-1">Server name</div>
                    <input
                      id="server-name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g., my-server"
                      className="input"
                      aria-invalid={!!nameError}
                      disabled={!sub || sub.status !== 'active' || limitReached}
                    />
                    {(nameError) && <div className="text-red-400 mt-1 text-sm">{nameError}</div>}
                  </div>

                  <div>
                    <div className="text-sm mb-1">Plan</div>
                    <select
                      value={planId}
                      onChange={e => setPlanId(Number(e.target.value))}
                      className="input"
                      aria-label="Select server size"
                      disabled={!sub || sub.status !== 'active' || plans.length === 0 || limitReached}
                    >
                      {plans.map(p => {
                        const ramMB = Number((p as any)?.resources?.ramMB) || 0;
                        const ramGB = ramMB ? Math.round((ramMB / 1024) * 10) / 10 : null;
                        const cpu = (p as any)?.resources?.cpu;
                        const disk = (p as any)?.resources?.diskGB;
                        const labelParts = [];
                        if (ramGB) labelParts.push(`${ramGB} GB RAM`);
                        if (cpu) labelParts.push(`${cpu} CPU`);
                        if (disk) labelParts.push(`${disk} GB SSD`);
                        const label = labelParts.length ? `${labelParts.join(' • ')} • ${p.pricePerMonth}/mo` : p.name;
                        return <option key={p.id} value={p.id}>{label}</option>;
                      })}
                    </select>
                  </div>

                  <div>
                    <div className="text-sm mb-2">Game/Application image</div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {images.map(img => {
                        const selected = image === img.id;
                        return (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => setImage(img.id)}
                            className={`text-left p-3 rounded border ${selected ? 'border-sky-600 bg-sky-900/20' : 'border-slate-800 hover:bg-slate-800'} transition`}
                            disabled={!sub || sub.status !== 'active' || limitReached}
                          >
                            <div className="flex items-center gap-3">
                              <img
                                src={img.img}
                                onError={(e) => { (e.currentTarget as HTMLImageElement).src = img.fallback; }}
                                alt={img.label}
                                className="h-10 w-10 rounded object-contain bg-slate-800"
                              />
                              <div>
                                <div className="font-medium">{img.label}</div>
                                <div className="text-xs subtle">{img.id}</div>
                                <div className="text-xs subtle mt-1">{img.description}</div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs subtle">
                      Subscription: <span className="text-slate-200 font-medium">{sub.status.toUpperCase()}</span> • Plan {planSummary} • Usage {Math.min(total, maxServers)} / {maxServers}
                    </div>
                    <button
                      onClick={createServer}
                      disabled={creating || !sub || sub.status !== 'active' || limitReached}
                      className={`btn btn-primary ${creating || !sub || sub.status !== 'active' || limitReached ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                      {creating ? 'Creating…' : 'Create server'}
                    </button>
                  </div>
                  {(err) && <div className="text-red-400 mt-1">{err}</div>}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}