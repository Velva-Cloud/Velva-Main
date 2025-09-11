import Head from 'next/head';
import { useEffect, useState } from 'react';
import api from '../../utils/api';
import NavBar from '../../components/NavBar';
import { useRequireAdmin } from '../../utils/guards';
import SystemStatus from '../../components/SystemStatus';

type Log = {
  id: number;
  action: string;
  metadata?: any;
  timestamp: string;
  user?: { id: number; email: string } | null;
};

type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

const ACTIONS = ['login', 'server_create', 'plan_change'] as const;
type ActionType = (typeof ACTIONS)[number] | '';

export default function AdminLogs() {
  useRequireAdmin();

  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [action, setAction] = useState<ActionType>('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchLogs = async () => {
    setLoading(true);
    setErr(null);
    try {
      const params: any = { page, pageSize };
      if (action) params.action = action;
      if (q) params.q = q;
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.get('/logs', { params });
      const data = res.data as Paged<Log>;
      setLogs(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, action, pageSize]);

  const applyFilters = () => {
    setPage(1);
    fetchLogs();
  };

  const exportCsv = () => {
    const params = new URLSearchParams();
    if (action) params.set('action', action);
    if (q) params.set('q', q);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    window.location.href = `/api/logs/export?${params.toString()}`;
  };

  return (
    <>
      <Head>
        <title>Admin • Logs</title>
      </Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Admin • Logs</h1>
          <div className="w-full max-w-sm ml-4">
            <SystemStatus />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <a href="/admin/plans" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Plans</a>
          <a href="/admin/nodes" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Nodes</a>
          <a href="/admin/users" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Users</a>
          <a href="/admin/logs" className="px-3 py-1 rounded border border-slate-700 bg-slate-800/60">Logs</a>
          <a href="/admin/transactions" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Transactions</a>
        </div>
        {err && <div className="mb-4 text-red-400">{err}</div>}

        <div className="card p-3 mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <div className="text-xs mb-1">Action</div>
              <select value={action} onChange={e => setAction(e.target.value as ActionType)} className="input">
                <option value="">All</option>
                {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="block">
              <div className="text-xs mb-1">User email contains</div>
              <input value={q} onChange={e => setQ(e.target.value)} className="input" placeholder="email@domain.com" />
            </label>
            <label className="block">
              <div className="text-xs mb-1">From</div>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" />
            </label>
            <label className="block">
              <div className="text-xs mb-1">To</div>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" />
            </label>
            <button onClick={applyFilters} className="btn btn-primary">Apply</button>
            <div className="ml-auto">
              <button onClick={exportCsv} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Export CSV</button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="p-3 card animate-pulse">
                <div className="h-4 w-64 bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="card p-10 text-center">
            <h3 className="text-xl font-semibold mb-2">No logs</h3>
            <p className="text-slate-400">Activity will appear here.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {logs.map((l) => (
                <div key={l.id} className="p-3 card">
                  <div className="text-sm">
                    <span className="text-slate-400">{new Date(l.timestamp).toLocaleString()}</span>
                    <span className="mx-2">•</span>
                    <span className="font-semibold">{l.action}</span>
                    {l.user && (
                      <>
                        <span className="mx-2">•</span>
                        <span className="text-slate-300">{l.user.email}</span>
                      </>
                    )}
                  </div>
                  {l.metadata && <pre className="mt-2 text-xs bg-slate-800/70 rounded p-2 overflow-auto">{JSON.stringify(l.metadata, null, 2)}</pre>}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-slate-400">
                Page {page} of {totalPages} • {total} total
              </div>
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