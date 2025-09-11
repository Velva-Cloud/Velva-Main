import Head from 'next/head';
import { useEffect, useState } from 'react';
import api from '../../utils/api';
import NavBar from '../../components/NavBar';
import { useRequireAdmin } from '../../utils/guards';
import SystemStatus from '../../components/SystemStatus';

type Tx = {
  id: number;
  amount: string;
  currency: string;
  gateway: string;
  status: 'success' | 'failed' | 'pending';
  metadata?: any;
  createdAt: string;
  user?: { id: number; email: string } | null;
  plan?: { id: number; name: string; pricePerMonth: string } | null;
};

export default function AdminTransactions() {
  useRequireAdmin();

  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fetchTxs = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get('/transactions', { params: { all: 1 } });
      setTxs(res.data);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTxs();
  }, []);

  return (
    <>
      <Head>
        <title>Admin • Transactions</title>
      </Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Admin • Transactions</h1>
          <div className="w-full max-w-sm ml-4">
            <SystemStatus />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <a href="/admin/plans" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Plans</a>
          <a href="/admin/nodes" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Nodes</a>
          <a href="/admin/users" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Users</a>
          <a href="/admin/logs" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Logs</a>
          <a href="/admin/transactions" className="px-3 py-1 rounded border border-slate-700 bg-slate-800/60">Transactions</a>
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
        ) : txs.length === 0 ? (
          <div className="card p-10 text-center">
            <h3 className="text-xl font-semibold mb-2">No transactions</h3>
            <p className="text-slate-400">Transactions will appear here as users subscribe.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {txs.map((t) => (
              <div key={t.id} className="p-3 card">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div className="text-sm">
                    <span className="text-slate-400">{new Date(t.createdAt).toLocaleString()}</span>
                    <span className="mx-2">•</span>
                    <span className="font-semibold">{t.status.toUpperCase()}</span>
                    <span className="mx-2">•</span>
                    <span>{t.gateway}</span>
                    {t.user && (
                      <>
                        <span className="mx-2">•</span>
                        <span className="text-slate-300">{t.user.email}</span>
                      </>
                    )}
                    {t.plan && (
                      <>
                        <span className="mx-2">•</span>
                        <span className="text-slate-300">Plan: {t.plan.name}</span>
                      </>
                    )}
                  </div>
                  <div className="font-semibold">${t.amount} {t.currency}</div>
                </div>
                {t.metadata && <pre className="mt-2 text-xs bg-slate-800/70 rounded p-2 overflow-auto">{JSON.stringify(t.metadata, null, 2)}</pre>}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}