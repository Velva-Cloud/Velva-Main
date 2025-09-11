import Head from 'next/head';
import { useEffect, useState } from 'react';
import NavBar from '../components/NavBar';
import { useRequireAuth } from '../utils/guards';
import api from '../utils/api';

type Tx = {
  id: number;
  amount: string;
  currency: string;
  gateway: string;
  status: 'success' | 'failed' | 'pending';
  metadata?: any;
  createdAt: string;
  plan?: { id: number; name: string; pricePerMonth: string } | null;
};

type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

const STATUSES = ['success', 'failed', 'pending'] as const;
type StatusType = (typeof STATUSES)[number] | '';

export default function Transactions() {
  useRequireAuth();

  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [status, setStatus] = useState<StatusType>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const fetchTxs = async () => {
    setLoading(true);
    setErr(null);
    try {
      const params: any = { page, pageSize };
      if (status) params.status = status;
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.get('/transactions', { params });
      const data = res.data as Paged<Tx>;
      setTxs(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTxs();
  }, [page, status]);

  const applyFilters = () => {
    setPage(1);
    fetchTxs();
  };

  return (
    <>
      <Head>
        <title>Transactions • VelvaCloud</title>
      </Head>
      <NavBar />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Transactions</h1>
          <a href="/billing" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Billing</a>
        </div>

        <div className="card p-3 mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <div className="text-xs mb-1">Status</div>
              <select value={status} onChange={e => setStatus(e.target.value as StatusType)} className="input">
                <option value="">All</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
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
          </div>
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
            <p className="text-slate-400">You have no transactions yet.</p>
          </div>
        ) : (
          <>
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