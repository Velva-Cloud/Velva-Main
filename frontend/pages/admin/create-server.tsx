import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../utils/api';
import NavBar from '../../components/NavBar';
import { useRequireAuth } from '../../utils/guards';

type Plan = { id: number; name: string; pricePerMonth?: string; resources?: any };
type Me = { id: number; email: string; role: string; suspended?: boolean } | null;

export default function AdminCreateServerPage() {
  useRequireAuth();
  const router = useRouter();

  const [me, setMe] = useState<Me>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState('');
  const [planId, setPlanId] = useState<number | ''>('');
  const [image, setImage] = useState('nginx:alpine');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      api.get('/plans'),
    ]).then(([meRes, plansRes]) => {
      setMe(meRes.data as any);
      const data = plansRes.data as any;
      const list: any[] = Array.isArray(data) ? data : (data?.items ?? []);
      const normalized: Plan[] = list
        .map((p: any) => ({ id: p.id, name: p.name, pricePerMonth: p.pricePerMonth, resources: p.resources }))
        .filter((p: any) => p.id !== undefined);
      setPlans(normalized);
      if (normalized.length > 0) setPlanId(normalized[0].id);
    }).catch(() => {
      setPlans([]);
    });
  }, []);

  // Admin-only assignment via email search
  const [assignUserId, setAssignUserId] = useState<number | ''>('');
  const [assignSearch, setAssignSearch] = useState('');
  const [assignResults, setAssignResults] = useState<Array<{ id: number; email: string; role: string }>>([]);
  const [assignLoading, setAssignLoading] = useState(false);

  async function triggerAssignSearch() {
    const q = assignSearch.trim();
    if (!q) {
      setAssignResults([]);
      return;
    }
    try {
      setAssignLoading(true);
      const res = await api.get('/users', { params: { search: q, pageSize: 10, page: 1 } });
      const data = res.data;
      const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
      const mapped = items.map((u: any) => ({ id: u.id, email: u.email, role: u.role }));
      setAssignResults(mapped);
    } catch {
      setAssignResults([]);
    } finally {
      setAssignLoading(false);
    }
  }

  const images = [
    { id: 'nginx:alpine', label: 'Nginx (web)', description: 'Lightweight web server', img: '/images/nginx.png', fallback: 'https://avatars.githubusercontent.com/u/529617?s=200&v=4' },
    { id: 'itzg/minecraft-server', label: 'Minecraft (Java)', description: 'Java edition server', img: '/images/minecraft.png', fallback: 'https://raw.githubusercontent.com/itzg/docker-minecraft-server/master/logo.png' },
    { id: 'itzg/minecraft-bedrock-server', label: 'Minecraft (Bedrock)', description: 'Bedrock edition server', img: '/images/minecraft-bedrock.png', fallback: 'https://raw.githubusercontent.com/itzg/docker-minecraft-server/master/logo.png' },
    { id: 'lloesche/valheim-server', label: 'Valheim', description: 'Valheim dedicated server', img: '/images/valheim.png', fallback: 'https://raw.githubusercontent.com/lloesche/valheim-server-docker/master/img/valheim.png' },
    { id: 'thijsvanloef/palworld-server-docker', label: 'Palworld', description: 'Palworld dedicated server', img: '/images/palworld.png', fallback: 'https://raw.githubusercontent.com/THIJsvanLoEF/Palworld-Server-Docker/main/.github/img/logo.png' },
    { id: 'didstopia/rust-server', label: 'Rust', description: 'Rust dedicated server (SteamCMD)', img: '/images/rust.png', fallback: 'https://raw.githubusercontent.com/didstopia/rust-server/master/.github/logo.png' },
    { id: 'cm2network/csgo', label: 'CS:GO', description: 'CS:GO dedicated server', img: '/images/csgo.png', fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4' },
    { id: 'cm2network/counter-strike', label: 'Counter-Strike 1.6', description: 'Classic CS 1.6 server', img: '/images/cs16.png', fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4' },
    { id: 'cm2network/tf2', label: 'Team Fortress 2', description: 'TF2 dedicated server', img: '/images/tf2.png', fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4' },
    { id: 'cm2network/gmod', label: 'Garry\'s Mod', description: 'GMod dedicated server', img: '/images/gmod.png', fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4' },
    { id: 'cm2network/l4d2', label: 'Left 4 Dead 2', description: 'L4D2 dedicated server', img: '/images/l4d2.png', fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4' },
    { id: 'factoriotools/factorio', label: 'Factorio', description: 'Factorio dedicated server', img: '/images/factorio.png', fallback: 'https://raw.githubusercontent.com/factoriotools/factorio-docker/master/logo.png' },
    { id: 'cm2network/mordhau', label: 'MORDHAU', description: 'MORDHAU dedicated server', img: '/images/mordhau.png', fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4' },
  ];

  const [advancedEnv, setAdvancedEnv] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const filteredImages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return images;
    return images.filter(i =>
      i.label.toLowerCase().includes(q) ||
      i.id.toLowerCase().includes(q) ||
      (i.description || '').toLowerCase().includes(q)
    );
  }, [search]);

  const isSRCDS = useMemo(
    () => ['cm2network/csgo', 'cm2network/counter-strike', 'cm2network/tf2', 'cm2network/gmod', 'cm2network/l4d2', 'cm2network/mordhau'].includes(image),
    [image]
  );

  function steamAppIdFor(imageId: string): number | null {
    switch (imageId) {
      case 'cm2network/csgo': return 740;
      case 'cm2network/gmod': return 4020;
      case 'cm2network/tf2': return 232250;
      case 'cm2network/l4d2': return 222860;
      case 'cm2network/mordhau': return 629760;
      case 'cm2network/counter-strike': return 90;
      default: return null;
    }
  }

  const [steamBranch, setSteamBranch] = useState('public');
  const [steamArgsText, setSteamArgsText] = useState('');
  const [srStartMap, setSrStartMap] = useState('');
  const [srMaxPlayers, setSrMaxPlayers] = useState<number | ''>('');
  const [srTickrate, setSrTickrate] = useState<number | ''>('');
  const [srGsltToken, setSrGsltToken] = useState('');

  useEffect(() => { setAdvancedEnv({}); }, [image]);

  const createServer = async () => {
    setErr(null);
    try {
      if (!isAdmin) {
        setErr('Forbidden');
        return;
      }
      if (!planId) {
        setErr('Please select a plan');
        return;
      }
      if (nameError) {
        setErr(nameError);
        return;
      }
      if (!assignUserId || Number(assignUserId) <= 0) {
        setErr('Please search and select a user to assign');
        return;
      }

      setCreating(true);

      const env: Record<string, string> = {};
      Object.entries(advancedEnv).forEach(([k, v]) => {
        const vv = (v || '').toString().trim();
        if (vv.length > 0) env[k] = vv;
      });

      const body: any = { name: name.trim(), planId, image: image.trim() || undefined, env, userId: Number(assignUserId) };

      if (isSRCDS) {
        const appId = steamAppIdFor(image) || 0;
        const args: string[] = [];
        if (srStartMap.trim()) args.push('+map', srStartMap.trim());
        if (srMaxPlayers && Number(srMaxPlayers) > 0) args.push('-maxplayers', String(srMaxPlayers));
        if (srTickrate && Number(srTickrate) > 0) args.push('-tickrate', String(srTickrate));
        if (srGsltToken.trim()) args.push('+sv_setsteamaccount', srGsltToken.trim());
        const extra = steamArgsText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        args.push(...extra);
        body.steam = { appId, branch: (steamBranch.trim() || 'public'), args };
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
        <title>Admin • Create Server • VelvaCloud</title>
      </Head>
      <NavBar />
      <main className="container px-6 py-10">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold mb-2">Admin • Create and assign a server</h1>
          <p className="subtle mb-6">
            Search for a user by email, choose a plan and image, and provision their server. Steam titles are installed via SteamCMD automatically.
          </p>

          {!isAdmin && (
            <div className="mb-6 p-3 rounded border border-red-800 bg-red-900/30 text-red-200">
              You need ADMIN/OWNER privileges to access this page.
            </div>
          )}

          <section className="card p-5 mb-8">
            <div className="grid gap-4">
              <div>
                <div className="text-sm mb-1">Assign to user</div>
                <div className="grid gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      className="input flex-1"
                      type="text"
                      placeholder="Search by email…"
                      value={assignSearch}
                      onChange={(e) => setAssignSearch(e.target.value)}
                    />
                    <button type="button" className="btn" onClick={triggerAssignSearch}>Search</button>
                  </div>
                  {assignLoading && <div className="text-xs subtle">Searching…</div>}
                  {assignResults.length > 0 && (
                    <div className="rounded border border-slate-800 bg-slate-900/60">
                      {assignResults.map(u => {
                        const selected = assignUserId === u.id;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => { setAssignUserId(u.id); setAssignSearch(`${u.email}`); }}
                            className={`w-full text-left px-3 py-2 border-b border-slate-800 last:border-b-0 ${selected ? 'bg-sky-900/30' : 'hover:bg-slate-800'}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="text-sm">{u.email}</div>
                              <div className="text-xs subtle">#{u.id} • {u.role}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {assignUserId ? (
                    <div className="text-xs">Selected user ID: <span className="text-slate-200 font-medium">{assignUserId}</span></div>
                  ) : (
                    <div className="text-xs subtle">Select a user to assign.</div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm mb-1">Server name</div>
                <input
                  id="server-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g., my-server"
                  className="input"
                  aria-invalid={!!nameError}
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

              {/* Advanced settings */}
              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Advanced settings</div>
                <div className="text-xs subtle mb-2">
                  Only settings supported by the selected image are shown. Network ports are assigned automatically by the system.
                </div>
                <div className="grid gap-3">
                  {/* Minimal presets for common images; admin can add env pairs freely */}
                  {Object.keys(advancedEnv).map((key) => (
                    <div key={key}>
                      <div className="text-xs mb-1">{key}</div>
                      <input
                        className="input"
                        value={advancedEnv[key] || ''}
                        onChange={(e) => setAdvancedEnv(prev => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <input className="input flex-1" placeholder="ENV KEY" id="env-key" />
                    <input className="input flex-1" placeholder="ENV VALUE" id="env-val" />
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        const keyEl = document.getElementById('env-key') as HTMLInputElement | null;
                        const valEl = document.getElementById('env-val') as HTMLInputElement | null;
                        const k = (keyEl?.value || '').trim();
                        const v = (valEl?.value || '').trim();
                        if (k) {
                          setAdvancedEnv(prev => ({ ...prev, [k]: v }));
                          if (keyEl) keyEl.value = '';
                          if (valEl) valEl.value = '';
                        }
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* SteamCMD controls: auto-shown for SRCDS/Steam titles */}
                {isSRCDS && (
                  <div className="mt-4">
                    <div className="text-sm font-medium mb-2">SteamCMD settings</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-xs mb-1">Branch</div>
                        <input className="input" value={steamBranch} onChange={(e) => setSteamBranch(e.target.value)} placeholder="public" />
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-xs mb-1">Extra launch args (one per line)</div>
                        <textarea className="input min-h-[80px]" value={steamArgsText} onChange={(e) => setSteamArgsText(e.target.value)} placeholder="-tickrate 66&#10;+exec server.cfg" />
                      </div>
                    </div>

                    {/* SRCDS common options */}
                    <div className="mt-3">
                      <div className="text-sm font-medium mb-2">SRCDS options</div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div>
                          <div className="text-xs mb-1">Start map</div>
                          <input className="input" value={srStartMap} onChange={(e) => setSrStartMap(e.target.value)} placeholder="de_dust2" />
                        </div>
                        <div>
                          <div className="text-xs mb-1">Max players</div>
                          <input className="input" type="number" value={srMaxPlayers || ''} onChange={(e) => setSrMaxPlayers(Number(e.target.value) || '')} placeholder="16" />
                        </div>
                        <div>
                          <div className="text-xs mb-1">Tickrate</div>
                          <input className="input" type="number" value={srTickrate || ''} onChange={(e) => setSrTickrate(Number(e.target.value) || '')} placeholder="66" />
                        </div>
                        <div className="md:col-span-3">
                          <div className="text-xs mb-1">GSLT Token (CS:GO)</div>
                          <input className="input" value={srGsltToken} onChange={(e) => setSrGsltToken(e.target.value)} placeholder="abcdef..." />
                          <div className="text-xs subtle mt-1">
                            Only required for CS:GO community servers.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs subtle">
                  Admin mode: create and assign to selected user.
                </div>
                <button
                  onClick={createServer}
                  disabled={creating || !isAdmin}
                  className={`btn btn-primary ${creating || !isAdmin ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {creating ? 'Creating…' : 'Create server'}
                </button>
              </div>
              {(err) && <div className="text-red-400 mt-1">{err}</div>}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}