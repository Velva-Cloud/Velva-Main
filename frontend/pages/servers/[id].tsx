import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import NavBar from '../../components/NavBar';
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

  // Console state
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [cmd, setCmd] = useState('');
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // File manager state
  const [fmPath, setFmPath] = useState('/');
  const [fmItems, setFmItems] = useState<FsItem[]>([]);
  const [uploading, setUploading] = useState(false);

  const role = useMemo(() => getUserRole(), []);
  const canControl =
    role === 'ADMIN' || role === 'OWNER' || role === 'SUPPORT';

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

  // Lifecycle controls
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

  // Console: start SSE over fetch (so we can send Authorization header)
  const startConsole = async () => {
    if (!id) return;
    stopConsole();
    try {
      abortRef.current = new AbortController();
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      const res = await fetch(`${api.defaults.baseURL}/servers/${id}/logs`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) {
        toast.show('Failed to open console stream', 'error');
        return;
      }
      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';
      const pump = async (): Promise<void> => {
        const r = await reader.read();
        if (r.done) return;
        const chunk = decoder.decode(r.value, { stream: true });
        buffer += chunk;
        // SSE messages separated by double newline
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
    } catch {
      // ignore open errors
    }
  };

  const stopConsole = () => {
    try { abortRef.current?.abort(); } catch {}
    abortRef.current = null;
    try { readerRef.current?.cancel(); } catch {}
    readerRef.current = null;
  };

  useEffect(() => {
    // start console when server id changes
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
      if (out) {
        setConsoleLines(prev => [...prev, `$ ${cmd.trim()}`, out]);
      }
      setCmd('');
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Command failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  // File manager
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

  const goTo = async (name: string, type: 'file' | 'dir') => {
    if (type === 'dir') {
      const next = fmPath.endsWith('/') ? `${fmPath}${name}` : `${fmPath}/${name}`;
      await loadDir(next);
    }
  };

  const upDir = async () => {
    if (fmPath === '/' || !fmPath) return;
    const parts = fmPath.split('/').filter(Boolean);
    parts.pop();
    const next = '/' + parts.join('/');
    await loadDir(next || '/');
  };

  const handleUpload = async (files: FileList | null) => {
    if (!srv || !files || !files.length) return;
    setUploading(true);
    try {
      const f = files[0];
      const buf = await f.arrayBuffer();
      const base64 = typeof window !== 'undefined' ? btoa(String.fromCharCode(...new Uint8Array(buf))) : Buffer.from(buf).toString('base64');
      await api.post(`/servers/${srv.id}/fs/upload`, { filename: f.name, contentBase64: base64 }, { params: { path: fmPath } });
      toast.show('File uploaded', 'success');
      await loadDir(fmPath);
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const downloadItem = async (name: string) => {
    if (!srv) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      const p = fmPath.endsWith('/') ? `${fmPath}${name}` : `${fmPath}/${name}`;
      const res = await fetch(`${api.defaults.baseURL}/servers/${srv.id}/fs/download?path=${encodeURIComponent(p)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name.endsWith('.tar') ? name : name; // server sets content-disposition
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.show(e?.message || 'Download failed', 'error');
    }
  };

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

  return (
    <>
      <Head>
        <title>Server • {srv?.name || id}</title>
      </Head>
      <NavBar />
      <main className="max-w-4xl mx-auto px-6 py-10">
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
          <>
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-semibold">Server • {srv.name}</h1>
              <a href="/dashboard" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Back to dashboard</a>
            </div>

            {/* Layout: sidebar + main content */}
            <div className="flex gap-6">
              {/* Sidebar */}
              <div className="w-56 shrink-0">
                {/** inline sidebar to avoid extra import; we add a component too */}
                <div className="card p-3 sticky top-4">
                  <div className="text-xs text-slate-400 mb-2">Server</div>
                  <a className="block px-3 py-2 rounded bg-slate-800 border border-slate-700" href={`/servers/${srv.id}`}>Overview</a>
                  <a className="block px-3 py-2 rounded hover:bg-slate-800/60 transition mt-1" href={`/servers/${srv.id}/files`}>Files</a>
                  <a className="block px-3 py-2 rounded hover:bg-slate-800/60 transition mt-1" href={`/servers/${srv.id}/console`}>Console</a>
                  <a className="block px-3 py-2 rounded hover:bg-slate-800/60 transition mt-1" href={`/servers/${srv.id}/users`}>Users &amp; Access</a>
                </div>
              </div>
              {/* Main content */}
              <div className="flex-1">

            {err && <div className="mb-4 text-red-400">{err}</div>}

            <section className="card p-4 mb-6">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-sm text-slate-400">Status</div>
                  <div className="font-semibold">{srv.status}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400">Plan</div>
                  <div className="font-semibold">{(srv as any).planName ? `${(srv as any).planName} (#${srv.planId})` : `#${srv.planId}`}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400">Node</div>
                  <div className="font-semibold">{(srv as any).nodeName ? `${(srv as any).nodeName} (#${srv.nodeId})` : (srv.nodeId ? `#${srv.nodeId}` : '—')}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400">Mock IP</div>
                  <div className="font-semibold">{srv.mockIp || 'Loading…'}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400">Created</div>
                  <div className="font-semibold">{new Date(srv.createdAt).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400">Provision</div>
                  <div className="font-semibold">{renderProvisionBadge(srv.provisionStatus || null)}</div>
                </div>
              </div>

              {canControl && (
                <div className="mt-4">
                  {role === 'SUPPORT' && (
                    <div className="mb-2">
                      <div className="text-sm mb-1">Reason (required for support)</div>
                      <input
                        className="input w-full"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason for action"
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => call('start')} disabled={busy} className={`px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>Start</button>
                    <button onClick={() => call('stop')} disabled={busy} className={`px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>Stop</button>
                    <button onClick={() => call('restart')} disabled={busy} className={`px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>Restart</button>
                    <button onClick={retryProvision} disabled={busy} className={`px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>Retry provision</button>
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
                  </div>
                </div>
              )}
            </section>

            {/* Overview content */}
            <section className="card p-4 mb-6">
              <h2 className="font-semibold mb-3">Actions</h2>
              {canControl && (
                <div>
                  {role === 'SUPPORT' && (
                    <div className="mb-2">
                      <div className="text-sm mb-1">Reason (required for support)</div>
                      <input
                        className="input w-full"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason for action"
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => call('start')} disabled={busy} className={`px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>Start</button>
                    <button onClick={() => call('stop')} disabled={busy} className={`px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>Stop</button>
                    <button onClick={() => call('restart')} disabled={busy} className={`px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>Restart</button>
                    <button onClick={retryProvision} disabled={busy} className={`px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>Retry provision</button>
                  </div>
                </div>
              )}
            </section>

            <section className="card p-4">
              <h2 className="font-semibold mb-3">Statistics</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-sm text-slate-400">Status</div>
                  <div className="font-semibold">{srv.status}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400">Plan</div>
                  <div className="font-semibold">{(srv as any).planName ? `${(srv as any).planName} (#${srv.planId})` : `#${srv.planId}`}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400">Node</div>
                  <div className="font-semibold">{(srv as any).nodeName ? `${(srv as any).nodeName} (#${srv.nodeId})` : (srv.nodeId ? `#${srv.nodeId}` : '—')}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400">Mock IP</div>
                  <div className="font-semibold">{srv.mockIp || 'Loading…'}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400">Created</div>
                  <div className="font-semibold">{new Date(srv.createdAt).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400">Provision</div>
                  <div className="font-semibold">{renderProvisionBadge(srv.provisionStatus || null)}</div>
                </div>
              </div>
            </section>
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}