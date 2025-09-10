import Head from 'next/head';
import { useEffect, useState } from 'react';
import api from '../../utils/api';
import NavBar from '../../components/NavBar';
import { useRequireAdmin } from '../../utils/guards';

type Log = {
  id: number;
  action: string;
  metadata?: any;
  timestamp: string;
  user?: { id: number; email: string } | null;
};

export default function AdminLogs() {
  useRequireAdmin();

  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get('/logs');
      setLogs(res.data);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <>
      <Head>
        <title>Admin • Logs</title>
      </Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-4">Admin • Logs</h1>
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <a href="/admin/plans" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Plans</a>
          <a href="/admin/nodes" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Nodes</a>
          <a href="/admin/users" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Users</a>
          <a href="/admin/logs" className="px-3 py-1 rounded border border-slate-700 bg-slate-800/60">Logs</a>
        </div>
        {err && <div className="mb-4 text-red-400">{err}</div>}

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
        )}
      </main>
    </>
  );
}