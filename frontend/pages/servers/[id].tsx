import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import NavBar from '../../components/NavBar';
import { useRequireAuth } from '../../utils/guards';
import api from '../../utils/api';
import { getUserRole } from '../../utils/auth';
import { useToast } from '../../components/Toast';

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
};

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

            <section className="card p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Console</h2>
                <button onClick={fetchServer} disabled={busy} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Refresh</button>
              </div>
              <pre className="mt-3 text-xs bg-slate-800/70 rounded p-3 overflow-auto" style={{ minHeight: 200 }}>
                {srv.consoleOutput || 'Loading…'}
              </pre>
            </section>
          </>
        )}
      </main>
    </>
  );
}