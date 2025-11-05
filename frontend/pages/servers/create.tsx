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
    // Web
    {
      id: 'nginx:alpine',
      label: 'Nginx (web)',
      description: 'Lightweight web server suitable for static sites and reverse proxy.',
      img: '/images/nginx.png',
      fallback: 'https://avatars.githubusercontent.com/u/529617?s=200&v=4',
    },

    // Minecraft
    {
      id: 'itzg/minecraft-server',
      label: 'Minecraft (Java)',
      description: 'Java edition server image with extensive env configuration.',
      img: '/images/minecraft.png',
      fallback: 'https://raw.githubusercontent.com/itzg/docker-minecraft-server/master/logo.png',
    },
    {
      id: 'itzg/minecraft-bedrock-server',
      label: 'Minecraft (Bedrock)',
      description: 'Bedrock edition server for Windows/console players.',
      img: '/images/minecraft-bedrock.png',
      fallback: 'https://raw.githubusercontent.com/itzg/docker-minecraft-server/master/logo.png',
    },

    // Valheim
    {
      id: 'lloesche/valheim-server',
      label: 'Valheim',
      description: 'Full-featured Valheim dedicated server.',
      img: '/images/valheim.png',
      fallback: 'https://raw.githubusercontent.com/lloesche/valheim-server-docker/master/img/valheim.png',
    },

    // Palworld
    {
      id: 'thijsvanloef/palworld-server-docker',
      label: 'Palworld',
      description: 'Popular survival server; configure with env vars for admin/password.',
      img: '/images/palworld.png',
      fallback: 'https://raw.githubusercontent.com/THIJsvanLoEF/Palworld-Server-Docker/main/.github/img/logo.png',
    },

    // Rust
    {
      id: 'didstopia/rust-server',
      label: 'Rust',
      description: 'Rust dedicated server with SteamCMD.',
      img: '/images/rust.png',
      fallback: 'https://raw.githubusercontent.com/didstopia/rust-server/master/.github/logo.png',
    },

    // CSGO / CS 1.6 / TF2 / GMod / L4D2 via cm2network
    {
      id: 'cm2network/csgo',
      label: 'Counter-Strike: Global Offensive',
      description: 'CS:GO dedicated server.',
      img: '/images/csgo.png',
      fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4',
    },
    {
      id: 'cm2network/counter-strike',
      label: 'Counter-Strike 1.6',
      description: 'Classic Counter-Strike 1.6 server.',
      img: '/images/cs16.png',
      fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4',
    },
    {
      id: 'cm2network/tf2',
      label: 'Team Fortress 2',
      description: 'TF2 dedicated server.',
      img: '/images/tf2.png',
      fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4',
    },
    {
      id: 'cm2network/gmod',
      label: 'Garry\'s Mod',
      description: 'GMod dedicated server.',
      img: '/images/gmod.png',
      fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4',
    },
    {
      id: 'cm2network/l4d2',
      label: 'Left 4 Dead 2',
      description: 'L4D2 dedicated server.',
      img: '/images/l4d2.png',
      fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4',
    },

    // Factorio
    {
      id: 'factoriotools/factorio',
      label: 'Factorio',
      description: 'Factorio dedicated server (popular automation game).',
      img: '/images/factorio.png',
      fallback: 'https://raw.githubusercontent.com/factoriotools/factorio-docker/master/logo.png',
    },

    // Space Engineers (Wine/SteamCMD based)
    {
      id: 'ich777/steamcmd',
      label: 'Space Engineers (via SteamCMD/WINE)',
      description: 'Run Space Engineers dedicated server using SteamCMD/WINE; requires specific env vars (GAME_ID etc.).',
      img: '/images/space-engineers.png',
      fallback: 'https://raw.githubusercontent.com/ich777/docker-templates/master/img/steamcmd.png',
    },

    // 7 Days to Die
    {
      id: 'didstopia/7dtd-server',
      label: '7 Days to Die',
      description: '7DtD dedicated server with SteamCMD.',
      img: '/images/7dtd.png',
      fallback: 'https://raw.githubusercontent.com/didstopia/7dtd-server/master/.github/logo.png',
    },

    // Project Zomboid
    {
      id: 'cyrinux/pzserver',
      label: 'Project Zomboid',
      description: 'Project Zomboid dedicated server.',
      img: '/images/pz.png',
      fallback: 'https://raw.githubusercontent.com/cyrinux/docker-project-zomboid-server/master/pz.webp',
    },

    // ARK: Survival Evolved
    {
      id: 'Hermsi1337/ark-server',
      label: 'ARK: Survival Evolved',
      description: 'ARK dedicated server.',
      img: '/images/ark.png',
      fallback: 'https://raw.githubusercontent.com/Hermsi1337/docker-ark-server/master/.github/images/logo.png',
    },

    // Terraria
    {
      id: 'beardedio/terraria',
      label: 'Terraria',
      description: 'Terraria dedicated server.',
      img: '/images/terraria.png',
      fallback: 'https://raw.githubusercontent.com/ryanrhee/terraria/master/icon.png',
    },

    // V Rising
    {
      id: 'devidian/vrising-server',
      label: 'V Rising',
      description: 'V Rising dedicated server.',
      img: '/images/vrising.png',
      fallback: 'https://raw.githubusercontent.com/Didstopia/docker-images/master/vrising/logo.png',
    },

    // Satisfactory
    {
      id: 'wolveix/satisfactory-server',
      label: 'Satisfactory',
      description: 'Satisfactory dedicated server (early access).',
      img: '/images/satisfactory.png',
      fallback: 'https://raw.githubusercontent.com/wolveix/satisfactory-server/main/.github/assets/logo.png',
    },

    // Conan Exiles
    {
      id: 'notruffy/conanexiles',
      label: 'Conan Exiles',
      description: 'Conan Exiles dedicated server.',
      img: '/images/conan.png',
      fallback: 'https://raw.githubusercontent.com/ich777/docker-templates/master/img/conanexiles.png',
    },

    // Don\'t Starve Together
    {
      id: 'jammsen/docker-dontstarvetogether',
      label: "Don't Starve Together",
      description: 'DST dedicated server.',
      img: '/images/dst.png',
      fallback: 'https://raw.githubusercontent.com/jammsen/docker-dontstarvetogether/master/.github/img/dst.png',
    },

    // Unturned
    {
      id: 'didstopia/unturned',
      label: 'Unturned',
      description: 'Unturned dedicated server.',
      img: '/images/unturned.png',
      fallback: 'https://raw.githubusercontent.com/didstopia/docker-images/master/unturned/logo.png',
    },

    // ECO
    {
      id: 'nicolas654/eco-server',
      label: 'Eco',
      description: 'Eco dedicated server.',
      img: '/images/eco.png',
      fallback: 'https://raw.githubusercontent.com/Nicolas654/docker-eco-server/main/icon.png',
    },

    // Pavlov VR
    {
      id: 'cm2network/pavlov',
      label: 'Pavlov VR',
      description: 'Pavlov VR dedicated server (Linux).',
      img: '/images/pavlov.png',
      fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4',
    },

    // Mordhau
    {
      id: 'cm2network/mordhau',
      label: 'MORDHAU',
      description: 'MORDHAU dedicated server.',
      img: '/images/mordhau.png',
      fallback: 'https://avatars.githubusercontent.com/u/39604295?s=200&v=4',
    },
  ];

  // Advanced settings presets per image (no port fields; ports are auto-assigned by the system)
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
    'didstopia/7dtd-server': [
      { key: 'SDTD_ServerName', label: 'Server name' },
      { key: 'SDTD_ServerPassword', label: 'Server password' },
    ],
    'cyrinux/pzserver': [
      { key: 'SERVER_NAME', label: 'Server name' },
      { key: 'ADMIN_PASSWORD', label: 'Admin password' },
      { key: 'SERVER_PASSWORD', label: 'Server password' },
    ],
    'Hermsi1337/ark-server': [
      { key: 'SESSION_NAME', label: 'Session name' },
      { key: 'SERVER_PASSWORD', label: 'Server password' },
      { key: 'SERVER_ADMIN_PASSWORD', label: 'Admin password' },
      { key: 'MAP', label: 'Map', placeholder: 'TheIsland' },
    ],
    'beardedio/terraria': [
      { key: 'WORLD', label: 'World name' },
      { key: 'PASSWORD', label: 'Server password' },
    ],
    'devidian/vrising-server': [
      { key: 'SERVER_NAME', label: 'Server name' },
      { key: 'SERVER_PASSWORD', label: 'Server password' },
    ],
    'wolveix/satisfactory-server': [
      // Satisfactory typically auto-configures ports; omit user-set port fields
    ],
    'notruffy/conanexiles': [
      { key: 'SERVER_NAME', label: 'Server name' },
      { key: 'SERVER_PASSWORD', label: 'Server password' },
    ],
    'jammsen/docker-dontstarvetogether': [
      { key: 'SERVER_NAME', label: 'Server name' },
      { key: 'SERVER_PASSWORD', label: 'Server password' },
    ],
    'didstopia/unturned': [
      { key: 'SERVER_NAME', label: 'Server name' },
      { key: 'SERVER_PASSWORD', label: 'Server password' },
    ],
    'nicolas654/eco-server': [
      { key: 'SERVER_NAME', label: 'Server name' },
      { key: 'SERVER_PASSWORD', label: 'Server password' },
    ],
    'cm2network/pavlov': [
      { key: 'SERVER_NAME', label: 'Server name' },
      { key: 'SERVER_PASSWORD', label: 'Server password' },
    ],
    'cm2network/mordhau': [
      { key: 'SERVER_NAME', label: 'Server name' },
      { key: 'SERVER_PASSWORD', label: 'Server password' },
    ],
    // Space Engineers via SteamCMD/WINE (generic template)
    'ich777/steamcmd': [
      { key: 'GAME_ID', label: 'Steam GAME_ID', placeholder: '298740' },
      { key: 'USERNAME', label: 'Steam username' },
      { key: 'PASSWRD', label: 'Steam password' },
      { key: 'SERVERNAME', label: 'Server name' },
    ],
  };

  const [advancedEnv, setAdvancedEnv] = useState<Record<string, string>>({});
  
  // Provisioner selection: default Docker, allow SteamCMD for SRCDS titles
  const isSRCDS = useMemo(() => ['cm2network/csgo', 'cm2network/counter-strike', 'cm2network/tf2', 'cm2network/gmod', 'cm2network/l4d2', 'cm2network/mordhau'].includes(image), [image]);
  const [provisioner, setProvisioner] = useState<'docker' | 'steamcmd'>(isSRCDS ? 'steamcmd' : 'docker');
  
  useEffect(() => {
    // When switching image, default to steamcmd for SRCDS; docker otherwise
    setProvisioner((prev) => (['cm2network/csgo', 'cm2network/counter-strike', 'cm2network/tf2', 'cm2network/gmod', 'cm2network/l4d2', 'cm2network/mordhau'].includes(image) ? 'steamcmd' : 'docker'));
  }, [image]);
  
  // Map SRCDS image to Steam appId
  function steamAppIdFor(imageId: string): number | null {
    switch (imageId) {
      case 'cm2network/csgo': return 740;
      case 'cm2network/gmod': return 4020;
      case 'cm2network/tf2': return 232250;
      case 'cm2network/l4d2': return 222860;
      case 'cm2network/mordhau': return 629760;
      case 'cm2network/counter-strike': return 90; // CS 1.6 (legacy HLDS)
      default: return null;
    }
  }

  // SteamCMD settings (generic + SRCDS common controls)
  const [steamBranch, setSteamBranch] = useState('public');
  const [steamArgsText, setSteamArgsText] = useState('');
  const [srStartMap, setSrStartMap] = useState('');
  const [srMaxPlayers, setSrMaxPlayers] = useState<number | ''>('');
  const [srTickrate, setSrTickrate] = useState<number | ''>('');
  const [srGsltToken, setSrGsltToken] = useState('');

  // Reset advanced env when image changes
  useEffect(() => {
    setAdvancedEnv({});
  }, [image]);

  const planSummary = (() => {
    const ramMB = Number(sub?.plan?.resources?.ramMB) || 0;
    const ramGB = ramMB ? Math.round((ramMB / 1024) * 10) / 10 : null;
    const cpu = sub?.plan?.resources?.cpu;
    const disk = sub?.plan?.resources?.diskGB;
    return ramGB ? `${ramGB} GB RAM${cpu ? ` • ${cpu} CPU` : ''}${disk ? ` • ${disk} GB SSD` : ''}` : sub?.plan?.name || '—';
  })();

  // Search support for images
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

      // Build env object from advanced settings
      const env: Record<string, string> = {};
      Object.entries(advancedEnv).forEach(([k, v]) => {
        const vv = (v || '').toString().trim();
        if (vv.length > 0) env[k] = vv;
      });

      // Build steam options if provisioner is steamcmd
      const steamApp = steamAppIdFor(image);
      const body: any = { name: name.trim(), planId, image: image.trim() || undefined, env: env };

      if (provisioner === 'steamcmd') {
        body.provisioner = 'steamcmd';
        // Build args from SRCDS controls + extra text
        const args: string[] = [];
        if (srStartMap.trim()) args.push('+map', srStartMap.trim());
        if (srMaxPlayers && Number(srMaxPlayers) > 0) args.push('-maxplayers', String(srMaxPlayers));
        if (srTickrate && Number(srTickrate) > 0) args.push('-tickrate', String(srTickrate));
        if (srGsltToken.trim()) args.push('+sv_setsteamaccount', srGsltToken.trim());
        // Append extra args (lines)
        const extra = steamArgsText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        args.push(...extra);

        if (steamApp) {
          body.steam = { appId: steamApp, branch: steamBranch.trim() || 'public', args };
        } else {
          // Generic steamcmd without appId mapping; backend/daemon will validate
          body.steam = { appId: 0, branch: steamBranch.trim() || 'public', args };
        }
        // Agent ignores image for steamcmd
        body.image = undefined;
      }

      const res = await api.post('/servers', body);
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
                            disabled={!sub || sub.status !== 'active' || limitReached}
                          >
                            <div className="flex items-center gap-3">
                              <img
                                src={img.img}
                                onError={(e) => { (e.currentTarget as HTMLImageElement).src = img.fallback; }}
                                alt={img.label}
                                className="h-16 w-16 rounded object-contain object-center bg-slate-800"
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

                    {/* SteamCMD controls (available whenever provisioner is steamcmd, for any supported image) */}
                    {provisioner === 'steamcmd' && (
                      <div className="mt-4">
                        <div className="text-sm font-medium mb-2">SteamCMD settings</div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <div className="text-xs mb-1">Branch</div>
                            <input className="input" value={steamBranch} onChange={(e) => setSteamBranch(e.target.value)} placeholder="public" />
                          </div>
                          <div className="md:col-span-2">
                            <div className="text-xs mb-1">Extra launch args (one per line)</div>
                            <textarea className="input min-h-[80px]" value={steamArgsText} onChange={(e) => setSteamArgsText(e.target.value)} placeholder="-someFlag value&#10;+exec server.cfg" />
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

                  {/* Provisioner selection for SRCDS */}
                  {isSRCDS && (
                    <div className="mt-4">
                      <div className="text-sm font-medium mb-2">Provisioner</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className={`p-3 rounded border ${provisioner === 'steamcmd' ? 'border-sky-600 bg-sky-900/20' : 'border-slate-800'}`}>
                          <input type="radio" name="prov" checked={provisioner === 'steamcmd'} onChange={() => setProvisioner('steamcmd')} />
                          <span className="ml-2">SteamCMD (recommended for SRCDS titles)</span>
                        </label>
                        <label className={`p-3 rounded border ${provisioner === 'docker' ? 'border-sky-600 bg-sky-900/20' : 'border-slate-800'}`}>
                          <input type="radio" name="prov" checked={provisioner === 'docker'} onChange={() => setProvisioner('docker')} />
                          <span className="ml-2">Docker</span>
                        </label>
                      </div>
                      <div className="text-xs subtle mt-2">
                        Docker uses community images; SteamCMD installs official dedicated server files via Steam.
                      </div>
                    </div>
                  )}

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