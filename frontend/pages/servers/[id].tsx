import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import NavBar from '../../components/NavBar';
import ServerSidebar from '../../components/ServerSidebar';
import { useRequireAuth } from '../../utils/guards';
import api from '../../utils/api';
import { getUserRole } from '../../utils/auth';
import { useToast } from '../../components/Toast';

type ProvisionStatus = {
  lastEvent: 'provision_ok' | 'provision_failed' | 'provision_request' | null;
  lastError?: string | null;
  at?: string | Date | null;
} | null;

type Server = {
  id: number;
  userId: number;
  planId: number;
  nodeId?: number | null;
  name: string;
  status: 'running' | 'stopped' | 'suspended';
  createdAt: string;
  mockIp?: string;
  consoleOutput?: string;
  provisionStatus?: ProvisionStatus;
};

type FsItem = { name: string; type: 'file' | 'dir'; size?: number | null; mtime?: string | Date };

// simple utility to draw a small area line chart with svg (placeholder)
function MiniArea({ points, color = '#60a5fa' }: { points: number[]; color?: string }) {
  const w = 380;
  const h = 120;
  const pad = 6;
  const max = Math.max(1, ...points);
  const step = (w - pad * 2) / Math.max(1, points.length - 1);
  const d = points
    .map((p, i) => {
      const x = pad + i * step;
      const y = h - pad - (p / max) * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
  const area = `${d} L ${w - pad},${h - pad} L ${pad},${h - pad} Z`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="block">
      <path d={area} fill={`${color}26`} />
      <path d={d} stroke={color} strokeWidth="2" fill="none" />
    </svg>
  );
}

// Live metrics row + hooks
function MetricsRow({ serverId, createdAt, diskLimitMb }: { serverId: number; createdAt: string; diskLimitMb?: number | null }) {
  const [cpu, setCpu] = useState<number | null>(null);
  const [ramPct, setRamPct] = useState<number | null>(null);
  const [players, setPlayers] = useState<string>('—');
  const [diskStr, setDiskStr] = useState<string>('—');
  const [cpuPoints, setCpuPoints] = useState<number[]>([]);
  const [ramPoints, setRamPoints] = useState<number[]>([]);
  const [visible, setVisible] = useState<boolean>(typeof document === 'undefined' ? true : document.visibilityState === 'visible');

  const pullOnce = async () => {
    try {
      const res = await api.get(`/servers/${serverId}/metrics`);
      const m = res.data || {};
      const c = Number(m.cpuPercent ?? 0);
      const usage = Number(m.mem?.usage ?? 0);
      const limit = Number(m.mem?.limit ?? 0) || 1;
      const pct = Math.max(0, Math.min(100, (usage / limit) * 100));
      setCpu(Number(c.toFixed(1)));
      setRamPct(Number(pct.toFixed(1)));

      if (m.players && typeof m.players.online === 'number' && typeof m.players.max === 'number') {
        setPlayers(`${m.players.online}/${m.players.max}`);
      } else {
        setPlayers('—');
      }

      const used = Number(m.disk?.usedBytes ?? 0);
      if (used > 0) {
        const limitMb = typeof diskLimitMb === 'number' && diskLimitMb > 0 ? diskLimitMb : null;
        const usedMb = used / (1024 * 1024);
        const usedStr = usedMb >= 1024 ? `${(usedMb / 1024).toFixed(2)} GB` : `${usedMb.toFixed(1)} MB`;
        if (limitMb) {
          const p = Math.min(100, Math.max(0, (usedMb / limitMb) * 100));
          setDiskStr(`${usedStr} • ${p.toFixed(1)}%`);
        } else {
          setDiskStr(usedStr);
        }
      } else {
        setDiskStr('—');
      }

      setCpuPoints(prev => [...prev.slice(-59), Number(c.toFixed(1))]);
      setRamPoints(prev => [...prev.slice(-59), Number(pct.toFixed(1))]);
    } catch {
      // ignore transient
    }
  };

  // Start/stop polling based on page visibility
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible');
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis);
      // also refresh immediately on focus becoming visible
      if (document.visibilityState === 'visible') pullOnce();
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  }, [serverId, diskLimitMb]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    // pull immediately, then at 30s cadence
    pullOnce();
    const t = setInterval(() => { if (alive) pullOnce(); }, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [visible, serverId, diskLimitMb]);

  const pill = (label: string, value: string, tone: 'sky' | 'violet' | 'emerald' | 'amber' | 'slate' = 'slate') => (
    <div className={`px-3 py-2 rounded-lg border bg-slate-900/60 ${tone === 'emerald' ? 'border-emerald-700' : tone === 'amber' ? 'border-amber-700' : tone === 'violet' ? 'border-violet-700' : tone === 'sky' ? 'border-sky-700' : 'border-slate-700'}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );

  return (
    <>
      <div className="relative z-10 mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {pill('CPU', cpu !== null ? `${cpu}%` : '—', 'violet')}
        {pill('RAM', ramPct !== null ? `${ramPct}%` : '—', 'emerald')}
        {pill('DISK', diskStr, 'sky')}
        {pill('Players', players, 'amber')}
        {pill('Uptime', new Date(createdAt).toLocaleDateString(), 'slate')}
      </div>

      {/* performance mini charts */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
          <div className="text-xs text-slate-400 mb-1">CPU % (last 60 samples)</div>
          <MiniArea points={cpuPoints.length ? cpuPoints : [0]} color="#60a5fa" />
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
          <div className="text-xs text-slate-400 mb-1">RAM % (last 60 samples)</div>
          <MiniArea points={ramPoints.length ? ramPoints : [0]} color="#34d399" />
        </div>
      </div>
    </>
  );
}

export default function ServerPage() {
  useRequireAuth();
  const toast = useToast();
  const router = useRouter();
  const { id } = router.query;

  const [srv, setSrv] = useState<Server | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  // Console state (needed for Overview quick console snippets later)
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [cmd, setCmd] = useState('');
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // File manager state
  const [fmPath, setFmPath] = useState('/');
  const [fmItems, setFmItems] = useState<FsItem[]>([]);
  const [uploading, setUploading] = useState(false);

  const role = useMemo(() => getUserRole(), []);
  const canControl = role === 'ADMIN' || role === 'OWNER' || role === 'SUPPORT';

  const fetchServer = async () => {
    if (!id) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get(`/servers/${id}`);
      setSrv(res.data || null);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load server');
      setSrv(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServer();
  }, [id]);

  const call = async (action: 'start' | 'stop' | 'restart') => {
    if (!srv) return;
    setBusy(true);
    setErr(null);
    try {
      const payload: any = {};
      if (role === 'SUPPORT') {
        if (!reason.trim()) {
          toast.show('Reason is required for support actions', 'error');
          setBusy(false);
          return;
        }
        payload.reason = reason.trim();
      }
      await api.post(`/servers/${srv.id}/${action}`, payload);
      await fetchServer();
      toast.show(`Server ${action}ed`, 'success');
      if (role === 'SUPPORT') setReason('');
    } catch (e: any) {
      const msg = e?.response?.data?.message || `Failed to ${action} server`;
      setErr(msg);
      toast.show(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const retryProvision = async () => {
    if (!srv) return;
    setBusy(true);
    try {
      await api.post(`/servers/${srv.id}/provision`);
      await fetchServer();
      toast.show('Provision request sent', 'success');
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Failed to request provisioning', 'error');
    } finally {
      setBusy(false);
    }
  };

  const startConsole = async () => {
    if (!id) return;
    try {
      abortRef.current = new AbortController();
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      const res = await fetch(`${api.defaults.baseURL}/servers/${id}/logs`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';
      const pump = async (): Promise<void> => {
        const r = await reader.read();
        if (r.done) return;
        const chunk = decoder.decode(r.value, { stream: true });
        buffer += chunk;
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const part = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const line = part.split('\n').find(l => l.startsWith('data: '));
          if (line) {
            try {
              const payload = JSON.parse(line.slice(6));
              setConsoleLines(prev => [...prev, payload]);
            } catch {
              setConsoleLines(prev => [...prev, line.slice(6)]);
            }
          }
        }
        await pump();
      };
      pump();
    } catch {}
  };

  const stopConsole = () => {
    try { abortRef.current?.abort(); } catch {}
    abortRef.current = null;
    try { readerRef.current?.cancel(); } catch {}
    readerRef.current = null;
  };

  useEffect(() => {
    if (id) {
      setConsoleLines([]);
      startConsole();
    }
    return () => stopConsole();
  }, [id]);

  const runCmd = async () => {
    if (!srv || !cmd.trim()) return;
    setBusy(true);
    try {
      const res = await api.post(`/servers/${srv.id}/exec`, { cmd: cmd.trim() });
      const out = (res.data?.output || '').toString();
      if (out) setConsoleLines(prev => [...prev, `$ ${cmd.trim()}`, out]);
      setCmd('');
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Command failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const loadDir = async (p: string) => {
    if (!srv) return;
    try {
      const res = await api.get(`/servers/${srv.id}/fs/list`, { params: { path: p } });
      setFmItems((res.data?.items || []) as FsItem[]);
      setFmPath(res.data?.path || p);
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Failed to list directory', 'error');
    }
  };

  useEffect(() => {
    if (srv) loadDir('/');
  }, [srv?.id]);

  const renderProvisionBadge = (ps: ProvisionStatus) => {
    if (!ps || !ps.lastEvent) {
      return <span className="inline-flex items-center px-2 py-0.5 text-xs rounded bg-slate-800 border border-slate-700 text-slate-300">No provision data</span>;
    }
    const ts = ps.at ? new Date(ps.at as any).toLocaleString() : '';
    if (ps.lastEvent === 'provision_ok') {
      return <span className="inline-flex items-center px-2 py-0.5 text-xs rounded bg-emerald-700/30 border border-emerald-700 text-emerald-300">Provisioned • {ts}</span>;
    }
    if (ps.lastEvent === 'provision_failed') {
      return <span title={ps.lastError || undefined} className="inline-flex items-center px-2 py-0.5 text-xs rounded bg-red-700/30 border border-red-700 text-red-300">Provision failed • {ts}</span>;
    }
    return <span className="inline-flex items-center px-2 py-0.5 text-xs rounded bg-indigo-700/30 border border-indigo-700 text-indigo-300">Provision requested • {ts}</span>;
  };

  const statusPill = (label: string, value: string, tone: 'sky' | 'violet' | 'emerald' | 'amber' | 'slate' = 'slate') => (
    <div className={`px-3 py-2 rounded-lg border bg-slate-900/60 ${tone === 'emerald' ? 'border-emerald-700' : tone === 'amber' ? 'border-amber-700' : tone === 'violet' ? 'border-violet-700' : tone === 'sky' ? 'border-sky-700' : 'border-slate-700'}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );

  return (
    <>
      <Head>
        <title>Server • {srv?.name || id}</title>
      </Head>
      <NavBar />
      <main className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-4 card animate-pulse">
                <div className="h-4 w-40 bg-slate-800 rounded" />
                <div className="mt-2 h-3 w-64 bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        ) : !srv ? (
          <div className="card p-10 text-center">
            <h3 className="text-xl font-semibold mb-2">Server not found</h3>
            <p className="text-slate-400">It may not exist or you do not have access.</p>
          </div>
        ) : (
          <div className="flex gap-6">
            <ServerSidebar serverId={srv.id} current="overview" />
            <div className="flex-1">
              {/* Hero */}
              <section className="relative overflow-hidden rounded-lg border border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-900/40 to-slate-900 p-6">
                <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ backgroundImage: 'url(/banner-pattern.png)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <div className="relative z-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                  <div>
                    <div className="text-sm text-slate-300">Overview</div>
                    <h1 className="text-2xl md:text-3xl font-semibold">{srv.name}</h1>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full border ${
                        srv.status === 'running'
                          ? 'bg-emerald-600/20 text-emerald-300 border-emerald-700'
                          : srv.status === 'suspended'
                          ? 'bg-amber-600/20 text-amber-200 border-amber-700'
                          : 'bg-slate-600/20 text-slate-300 border-slate-700'
                      }`}>{srv.status}</span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-300">{srv.mockIp || 'address pending'}</span>
                    </div>
                  </div>
                  {/* Quick actions */}
                  {canControl && (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => call('start')} disabled={busy} className={`px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>Start</button>
                      <button onClick={() => call('stop')} disabled={busy} className={`px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>Stop</button>
                      <button onClick={() => call('restart')} disabled={busy} className={`px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>Restart</button>
                      <button onClick={retryProvision} disabled={busy} className={`px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>Provision</button>
                    </div>
                  )}
                </div>

                {/* Status row */}
                <MetricsRow serverId={srv.id} createdAt={srv.createdAt} diskLimitMb={(srv as any).planDiskMb ?? null} />
              </section>

              {err && <div className="mt-3 text-red-400">{err}</div>}

              {/* Details cards */}
              <div className="mt-6 grid gap-6 lg:grid-cols-3">
                <section className="card p-4 lg:col-span-2">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold">Server Performance</h2>
                    <div className="text-xs text-slate-400">Last hour</div>
                  </div>
                  <MiniArea points={[5, 12, 20, 18, 30, 24, 26, 35, 28, 40, 38, 42]} color="#60a5fa" />
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <MiniArea points={[10, 12, 8, 14, 18, 16, 20, 22, 21, 25, 24, 26]} color="#34d399" />
                    <MiniArea points={[2, 4, 3, 5, 8, 7, 11, 10, 9, 12, 11, 13]} color="#fbbf24" />
                    <MiniArea points={[1, 2, 2, 3, 4, 3, 5, 6, 7, 6, 8, 9]} color="#a78bfa" />
                  </div>
                </section>

                <section className="card p-4">
                  <h2 className="font-semibold mb-3">Player History</h2>
                  <MiniArea points={[0, 1, 2, 3, 3, 5, 8, 6, 7, 9, 8, 10]} color="#f472b6" />
                  <div className="mt-2 text-xs text-slate-400">Connected players over time</div>
                </section>
              </div>

              {/* Facts and metadata */}
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <section className="card p-4">
                  <h2 className="font-semibold mb-3">Details</h2>
                  <div className="grid gap-3 grid-cols-2">
                    <div>
                      <div className="text-sm text-slate-400">Plan</div>
                      <div className="font-semibold">{(srv as any).planName ? `${(srv as any).planName} (#${srv.planId})` : `#${srv.planId}`}</div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-400">Node</div>
                      <div className="font-semibold">{(srv as any).nodeName ? `${(srv as any).nodeName} (#${srv.nodeId})` : (srv.nodeId ? `#${srv.nodeId}` : '—')}</div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-400">Address</div>
                      <div className="font-semibold">{srv.mockIp || '—'}</div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-400">Created</div>
                      <div className="font-semibold">{new Date(srv.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-sm text-slate-400">Provision</div>
                      <div className="font-semibold">{renderProvisionBadge(srv.provisionStatus || null)}</div>
                    </div>
                  </div>
                </section>

                <section className="card p-4">
                  <h2 className="font-semibold mb-3">Quick Console</h2>
                  <pre className="text-xs bg-slate-900 border border-slate-800 rounded p-3 overflow-auto" style={{ minHeight: 120, maxHeight: 160 }}>
                    {consoleLines.length ? consoleLines.slice(-30).join('\n') : 'Streaming logs…'}
                  </pre>
                  <div className="mt-2 flex gap-2">
                    <input className="input flex-1" placeholder="send command…" value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runCmd(); }} />
                    <button onClick={runCmd} className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600">Run</button>
                    <a href={`/servers/${srv.id}/console`} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Open Console</a>
                  </div>
                </section>
              </div>

              {/* Support-only reason input and suspend toggle kept accessible but subtle */}
              {canControl && (
                <section className="card p-4 mt-6">
                  <h2 className="font-semibold mb-2">Manage</h2>
                  {role === 'SUPPORT' && (
                    <div className="mb-2">
                      <div className="text-sm mb-1">Reason (required for support)</div>
                      <input className="input w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for action" />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {srv.status !== 'suspended' ? (
                      <button
                        onClick={async () => {
                          if (role === 'SUPPORT' && !reason.trim()) {
                            toast.show('Reason is required for support actions', 'error');
                            return;
                          }
                          setBusy(true);
                          try {
                            await api.post(`/servers/${srv.id}/suspend`, role === 'SUPPORT' ? { reason: reason.trim() } : {});
                            await fetchServer();
                            toast.show('Server suspended', 'success');
                            if (role === 'SUPPORT') setReason('');
                          } catch (e: any) {
                            toast.show(e?.response?.data?.message || 'Failed to suspend', 'error');
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className={`px-3 py-1 rounded bg-red-700 hover:bg-red-600 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          if (role === 'SUPPORT' && !reason.trim()) {
                            toast.show('Reason is required for support actions', 'error');
                            return;
                          }
                          setBusy(true);
                          try {
                            await api.post(`/servers/${srv.id}/unsuspend`, role === 'SUPPORT' ? { reason: reason.trim() } : {});
                            await fetchServer();
                            toast.show('Server unsuspended', 'success');
                            if (role === 'SUPPORT') setReason('');
                          } catch (e: any) {
                            toast.show(e?.response?.data?.message || 'Failed to unsuspend', 'error');
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className={`px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        Unsuspend
                      </button>
                    )}
                    <a href="/dashboard" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Back to dashboard</a>
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  );
}