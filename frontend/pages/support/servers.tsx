import Head from 'next/head';
import { useEffect, useState } from 'react';
import NavBar from '../../components/NavBar';
import { useRequireSupport } from '../../utils/guards';
import api from '../../utils/api';
import SystemStatus from '../../components/SystemStatus';
import { useToast } from '../../components/Toast';

type Server = {
  id: number;
  userId: number;
  planId: number;
  name: string;
  status: 'running' | 'stopped' | 'suspended';
  createdAt: string;
};

type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export default function SupportServers() {
  useRequireSupport();
  const toast = useToast();

  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchServers = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get('/servers', { params: { all: 1, page, pageSize } });
      const data = res.data as Paged<Server>;
      setServers(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load servers');
      setServers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, [page]);

  const act = async (s: Server, action: 'start' | 'stop' | 'restart' | 'suspend' | 'unsuspend') => {
    if (!reason.trim()) {
      toast.show('Enter a reason (required for support)', 'error');
      return;
    }
    setBusyId(s.id);
    try {
      await api.post(`/servers/${s.id}/${action}`, { reason: reason.trim() });
      await fetchServers();
      toast.show(`Server ${action}ed`, 'success');
      setReason('');
    } catch (e: any) {
      toast.show(e?.response?.data?.message || `Failed to ${action} server`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Head>
        <title>Support • Servers</title>
      </Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Support • Servers</h1>
          <div className="w-full max-w-sm ml-4">
            <SystemStatus />
          </div>
        </div>

        <div className="card p-3 mb-4">
          <div className="grid gap-3 md:grid-cols-3 items-end">
            <label className="block md:col-span-2">
              <div className="text-sm mb-1">Reason (required for actions)</div>
              <input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Why are you performing this action?" />
            </label>
            <div className="text-sm text-slate-400">Click action buttons per-row</div>
          </div>
        </div>

        {err && <div className="mb-4 text-red-400">{err}</div>}

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-4 card animate-pulse">
                <div className="h-4 w-56 bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        ) : servers.length === 0 ? (
          <div className="card p-10 text-center">
            <h3 className="text-xl font-semibold mb-2">No servers</h3>
            <p className="text-slate-400">There are no servers to display.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {servers.map((s) => (
                <div key={s.id} className="p-4 card flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold"><a className="hover:underline" href={`/servers/${s.id}`}>#{s.id} • {s.name}</a></div>
                    <div className="text-sm text-slate-400">user #{s.userId} • plan #{s.planId} • {new Date(s.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${
                        s.status === 'running'
                          ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-700'
                          : s.status === 'suspended'
                          ? 'bg-amber-600/30 text-amber-200 border border-amber-700'
                          : 'bg-slate-600/30 text-slate-300 border border-slate-700'
                      }`}>{s.status}</span>
                    <button onClick={() => act(s, 'start')} disabled={busyId === s.id} className={`px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 ${busyId === s.id ? 'opacity-60 cursor-not-allowed' : ''}`}>Start</button>
                    <button onClick={() => act(s, 'stop')} disabled={busyId === s.id} className={`px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 ${busyId === s.id ? 'opacity-60 cursor-not-allowed' : ''}`}>Stop</button>
                    <button onClick={() => act(s, 'restart')} disabled={busyId === s.id} className={`px-2 py-1 rounded bg-indigo-700 hover:bg-indigo-600 ${busyId === s.id ? 'opacity-60 cursor-not-allowed' : ''}`}>Restart</button>
                    {s.status !== 'suspended' ? (
                      <button onClick={() => act(s, 'suspend')} disabled={busyId === s.id} className={`px-2 py-1 rounded bg-red-700 hover:bg-red-600 ${busyId === s.id ? 'opacity-60 cursor-not-allowed' : ''}`}>Suspend</button>
                    ) : (
                      <button onClick={() => act(s, 'unsuspend')} disabled={busyId === s.id} className={`px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 ${busyId === s.id ? 'opacity-60 cursor-not-allowed' : ''}`}>Unsuspend</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-slate-400">Page {page} of {totalPages} • {total} total</div>
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