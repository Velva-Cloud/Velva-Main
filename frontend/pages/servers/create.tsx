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

  const isAdmin = (me?.role === 'ADMIN' || me?.role === 'OWNER');

  const nameError = useMemo(() => {
    const n = name.trim();
    if (n.length < 3) return 'Name must be at least 3 characters';
    if (n.length > 32) return 'Name must be at most 32 characters';
    if (!/^[A-Za-z0-9_-]+$/.test(n)) return 'Only letters, numbers, dash and underscore allowed';
    return null;
  }, [name]);

  useEffect(() => {
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

        const filtered = (meRes.data && (meRes.data.role === 'ADMIN' || meRes.data.role === 'OWNER'))
          ? normalized
          : (subData ? normalized.filter(p => p.id === subData.planId) : normalized);
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
    { id: 'nginx:alpine', label: 'Nginx (web)', description: 'Lightweight web server suitable for static sites and reverse proxy.', img: '/images/nginx.png', fallback: 'https://avatars.githubusercontent.com/u/529617?s=200&v=4' },
    { id: 'itzg/minecraft-server', label: 'Minecraft (Java)', description: 'Java edition server image with extensive env configuration.', img: '/images/minecraft.png', fallback: 'https://raw.githubusercontent.com/itzg/docker-minecraft-server/master/logo.png' },
    { id: 'itzg/minecraft-bedrock-server', label: 'Minecraft (Bedrock)', description: 'Bedrock edition server for Windows/console players.', img: '/images/minecraft-bedrock.png', fallback: 'https://raw.githubusercontent.com/itzg/docker-minecraft-server/master/logo.png' },
    { id: 'lloesche/valheim-server', label: 'Valheim', description: 'Full-featured Valheim dedicated server.', img: '/images/valheim.png', fallback: 'https://raw.githubusercontent.com/lloesche/valheim-server-docker/master/img/valheim.png' },
    { id: 'thijsvanloef/palworld-server-docker', label: 'Palworld', description: 'Popular survival server; configure with env vars for admin/password.', img: '/images/palworld.png', fallback: 'https://raw.githubusercontent.com/THIJsvanLoEF/Palworld-Server-Docker/main/.github/img/logo.png' },
    { id: 'didstopia/rust-server', label: 'Rust', description: 'Rust dedicated server with SteamCMD.', img: '/images/rust.png', fallback: 'https://raw.githubusercontent.com/didstopia/rust-server/master/.github/logo.png' },
    { id: 'cm2network/csgo', label: 'Counter-Strike: Global Offensive', description: 'CS:GO dedicated server.', img: '/images/csgo.png', fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4' },
    { id: 'cm2network/counter-strike', label: 'Counter-Strike 1.6', description: 'Classic Counter-Strike 1.6 server.', img: '/images/cs16.png', fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4' },
    { id: 'cm2network/tf2', label: 'Team Fortress 2', description: 'TF2 dedicated server.', img: '/images/tf2.png', fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4' },
    { id: 'cm2network/gmod', label: 'Garry\'s Mod', description: 'GMod dedicated server.', img: '/images/gmod.png', fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4' },
    { id: 'cm2network/l4d2', label: 'Left 4 Dead 2', description: 'L4D2 dedicated server.', img: '/images/l4d2.png', fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4' },
    { id: 'factoriotools/factorio', label: 'Factorio', description: 'Factorio dedicated server (popular automation game).', img: '/images/factorio.png', fallback: 'https://raw.githubusercontent.com/factoriotools/factorio-docker/master/logo.png' },
    { id: 'cm2network/mordhau', label: 'MORDHAU', description: 'MORDHAU dedicated server.', img: '/images/mordhau.png', fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4' },
  ];

  const presetsByImage: Record<string, Array<{ key: string; label: string; placeholder?: string }>> = {
    'itzg/minecraft-server': [
      { key: 'EULA', label: 'EULA (TRUE/FALSE)', placeholder: 'TRUE' },
      { key: 'MOTD', label: 'MOTD', placeholder: 'Welcome to our server!' },
      { key: 'DIFFICULTY', label: 'Difficulty (peaceful/easy/normal/hard)', placeholder: 'normal' },
      { key: 'MAX_PLAYERS', label: 'Max players', placeholder: '20' },
      { key: 'ENABLE_RCON', label: 'Enable RCON (TRUE/FALSE)', placeholder: 'TRUE' },
      { key: 'RCON_PASSWORD', label: 'RCON password', placeholder: 'auto-generated if blank' },
      { key: 'SEED', label: 'World Seed', placeholder: 'optional' },
      { key: 'MODE', label: 'Gamemode (survival/creative/adventure)', placeholder: 'survival' },
      { key: 'ENABLE_AUTOPAUSE', label: 'Disable autopause (TRUE/FALSE)', placeholder: 'FALSE' },
      { key: 'MEMORY', label: 'Memory (e.g., 2048M)', placeholder: 'derived from plan if blank' },
    ],
    'factoriotools/factorio': [
      { key: 'FACTORIO_SERVER_NAME', label: 'Server name' },
      { key: 'FACTORIO_SERVER_PASSWORD', label: 'Server password' },
      { key: 'SAVE_NAME', label: 'Save name', placeholder: 'default' },
      { key: 'UPDATE_MODS_ON_START', label: 'Update mods on start (true/false)', placeholder: 'true' },
    ],
    'cm2network/csgo': [
      { key: 'SRCDS_TOKEN', label: 'GSLT Token' },
      { key: 'SRCDS_STARTMAP', label: 'Start map', placeholder: 'de_dust2' },
      { key: 'SRCDS_MAXPLAYERS', label: 'Max players', placeholder: '16' },
    ],
    'didstopia/rust-server': [
      { key: 'RUST_SERVER_NAME', label: 'Server name' },
      { key: 'RUST_SERVER_DESCRIPTION', label: 'Description' },
      { key: 'RUST_SERVER_URL', label: 'Server URL' },
      { key: 'RUST_RCON_PASSWORD', label: 'RCON password' },
    ],
    'lloesche/valheim-server': [
      { key: 'SERVER_NAME', label: 'Server name' },
      { key: 'SERVER_PASSWORD', label: 'Server password' },
      { key: 'WORLD_NAME', label: 'World name' },
      { key: 'PUBLIC', label: 'Public (1=Yes,0=No)', placeholder: '1' },
    ],
    'thijsvanloef/palworld-server-docker': [
      { key: 'SERVERNAME', label: 'Server name' },
      { key: 'SERVERPASSWORD', label: 'Server password' },
    ],
  };

  const [advancedEnv, setAdvancedEnv] = useState<Record<string, string>>({});

  const isSRCDS = useMemo(
    () => ['cm2network/csgo', 'cm2network/counter-strike', 'cm2network/tf2', 'cm2network/gmod', 'cm2network/l4d2', 'cm2network/mordhau'].includes(image),
    [image]
  );

  const planSummary = (() => {
    const ramMB = Number(sub?.plan?.resources?.ramMB) || 0;
    const ramGB = ramMB ? Math.round((ramMB / 1024) * 10) / 10 : null;
    const cpu = sub?.plan?.resources?.cpu;
    const disk = sub?.plan?.resources?.diskGB;
    return ramGB ? `${ramGB} GB RAM${cpu ? ` • ${cpu} CPU` : ''}${disk ? ` • ${disk} GB SSD` : ''}` : sub?.plan?.name || '—';
  })();

  const [search, setSearch] = useState('');
  const filteredImages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return images;
    return images.filter(i =>
      i.label.toLowerCase().includes(q) ||
      i.id.toLowerCase().includes(q) ||
      (i.description || '').toLowerCase().includes(q)
    );
  }, [search, images]);

  const createServer = async () => {
    setErr(null);
    try {
      if (suspended && !isAdmin) {
        setErr('Your account is suspended. Please contact support.');
        return;
      }
      if (!isAdmin) {
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
      } else {
        if (!planId) {
          setErr('Please select a plan');
          return;
        }
      }
      if (nameError) {
        setErr(nameError);
        return;
      }
      setCreating(true);

      const env: Record<string, string> = {};
      Object.entries(advancedEnv).forEach(([k, v]) => {
        const vv = (v || '').toString().trim();
        if (vv.length > 0) env[k] = vv;
      });

      const body: any = { name: name.trim(), planId, image: image.trim() || undefined, env };

      if (isSRCDS) {
        const appId = (() => {
          switch (image) {
            case 'cm2network/csgo': return 740;
            case 'cm2network/gmod': return 4020;
            case 'cm2network/tf2': return 232250;
            case 'cm2network/l4d2': return 222860;
            case 'cm2network/mordhau': return 629760;
            case 'cm2network/counter-strike': return 90;
            default: return 0;
          }
        })();
        body.steam = { appId, branch: 'public', args: [] };
      }

      const res = await api.post('/servers', body);
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

          {(!sub && !isAdmin) ? (
            <div className="card p-5 mb-8">
              <div className="flex items-center justify-between">
                <div className="subtle">No active subscription. Choose a server size to subscribe.</div>
                <a className="btn btn-primary" href="/billing">Go to Billing</a>
              </div>
            </div>
          ) : (
            <>
              {suspended && !isAdmin && (
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
                      disabled={!isAdmin && (!sub || sub.status !== 'active' || limitReached)}
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
                      disabled={!isAdmin && (!sub || sub.status !== 'active' || plans.length === 0 || limitReached)}
                    >
                      {plans.map(p => {
                        const ramMB = Number((p as any)?.resources?.ramMB) || 0;
                        const ramGB = ramMB ? Math.round((ramMB / 1024) * 10) / 10 : null;
                        const cpu = (p as any)?.resources?.cpu;
                        const disk = (p as any)?.resources?.diskGB;
                        const labelParts: string[] = [];
                        if (ramGB) labelParts.push(`${ramGB} GB RAM`);
                        if (cpu) labelParts.push(`${cpu} CPU`);
                        if (disk) labelParts.push(`${disk} GB SSD`);
                        const label = labelParts.length ? `${labelParts.join(' • ')} • ${p.pricePerMonth}/mo` : p.name;
                        return <option key={p.id} value={p.id}>{label}</option>;
                      })}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm">Game/Application image</div>
                      <input
                        type="text"
                        placeholder="Search images..."
                        className="input w-48"
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search images"
                      />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {filteredImages.map(img => {
                        const selected = image === img.id;
                        return (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => setImage(img.id)}
                            className={`text-left p-3 rounded border ${selected ? 'border-sky-600 bg-sky-900/20' : 'border-slate-800 hover:bg-slate-800'} transition`}
                            disabled={!isAdmin && (!sub || sub.status !== 'active' || limitReached)}
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

                  <div className="mt-4">
                    <div className="text-sm font-medium mb-2">Advanced settings</div>
                    <div className="text-xs subtle mb-2">
                      Only settings supported by the selected image are shown. Network ports are assigned automatically by the system.
                    </div>
                    <div className="grid gap-3">
                      {(presetsByImage[image] || []).map(p => (
                        <div key={p.key}>
                          <div className="text-xs mb-1">{p.label}</div>
                          <input
                            className="input"
                            placeholder={p.placeholder || ''}
                            value={advancedEnv[p.key] || ''}
                            onChange={(e) => setAdvancedEnv(prev => ({ ...prev, [p.key]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>

                    {isSRCDS && (
                      <div className="mt-4">
                        <div className="text-sm font-medium mb-2">SteamCMD settings</div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <div className="text-xs mb-1">Branch</div>
                            <input className="input" value={'public'} readOnly />
                          </div>
                          <div className="md:col-span-2">
                            <div className="text-xs mb-1">Extra launch args</div>
                            <input className="input" value={''} readOnly placeholder="Configured by admin on /admin/create-server" />
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="text-sm font-medium mb-2">SRCDS defaults</div>
                          <div className="text-xs subtle">
                            Defaults are applied. To customize SRCDS args, use the admin page.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs subtle">
                      {isAdmin ? (
                        <>Admin mode: creating for yourself. To assign to another user, use the admin page.</>
                      ) : (
                        <>Subscription: <span className="text-slate-200 font-medium">{sub?.status?.toUpperCase?.() || '—'}</span> • Plan {planSummary} • Usage {Math.min(total, maxServers)} / {maxServers}</>
                      )}
                    </div>
                    <button
                      onClick={createServer}
                      disabled={creating || (!isAdmin && (!sub || sub.status !== 'active' || limitReached))}
                      className={`btn btn-primary ${creating || (!isAdmin && (!sub || sub.status !== 'active' || limitReached)) ? 'opacity-70 cursor-not-allowed' : ''}`}
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

