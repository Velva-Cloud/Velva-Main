import Head from 'next/head';
import { useEffect, useState } from 'react';
import NavBar from '../../components/NavBar';
import { useRequireAdmin } from '../../utils/guards';
import SystemStatus from '../../components/SystemStatus';
import api from '../../utils/api';

type PlanDist = { planId: number; planName: string; count: number };
type Finance = {
  activeSubscribers: number;
  mrr: number;
  arr: number;
  arpu: number;
  churn30: number;
  revenue30: number;
  planDistribution: PlanDist[];
};

export default function AdminFinance() {
  useRequireAdmin();

  const [data, setData] = useState<Finance | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    api.get('/admin/finance')
      .then(res => setData(res.data))
      .catch(e => setErr(e?.response?.data?.message || 'Failed to load finance data'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Head>
        <title>Admin • Finance</title>
      </Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Admin • Finance</h1>
          <div className="w-full max-w-sm ml-4">
            <SystemStatus />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <a href="/admin/plans" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Plans</a>
          <a href="/admin/nodes" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Nodes</a>
          <a href="/admin/users" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Users</a>
          <a href="/admin/logs" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Logs</a>
          <a href="/admin/transactions" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Transactions</a>
          <a href="/admin/settings" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Settings</a>
          <a href="/admin/finance" className="px-3 py-1 rounded border border-slate-700 bg-slate-800/60">Finance</a>
        </div>

        {err && <div className="mb-4 text-red-400">{err}</div>}

        {loading || !data ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-4 card animate-pulse">
                <div className="h-4 w-40 bg-slate-800 rounded" />
                <div className="mt-2 h-3 w-64 bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <section className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="card p-4">
                <div className="text-slate-400 text-sm">Active subscribers</div>
                <div className="text-2xl font-semibold mt-1">{data.activeSubscribers}</div>
              </div>
              <div className="card p-4">
                <div className="text-slate-400 text-sm">MRR</div>
                <div className="text-2xl font-semibold mt-1">${data.mrr.toFixed(2)}</div>
              </div>
              <div className="card p-4">
                <div className="text-slate-400 text-sm">ARR</div>
                <div className="text-2xl font-semibold mt-1">${data.arr.toFixed(2)}</div>
              </div>
              <div className="card p-4">
                <div className="text-slate-400 text-sm">ARPU</div>
                <div className="text-2xl font-semibold mt-1">${data.arpu.toFixed(2)}</div>
              </div>
              <div className="card p-4">
                <div className="text-slate-400 text-sm">Churn (30d)</div>
                <div className="text-2xl font-semibold mt-1">{data.churn30}</div>
              </div>
              <div className="card p-4">
                <div className="text-slate-400 text-sm">Revenue (30d)</div>
                <div className="text-2xl font-semibold mt-1">${data.revenue30.toFixed(2)}</div>
              </div>
            </section>

            <section className="card p-4">
              <h2 className="font-semibold mb-3">Plan distribution (active)</h2>
              {data.planDistribution.length === 0 ? (
                <div className="text-slate-400">No active subscriptions.</div>
              ) : (
                <ul className="space-y-2">
                  {data.planDistribution.map((p) => (
                    <li key={p.planId} className="flex items-center justify-between">
                      <div>{p.planName}</div>
                      <div className="text-slate-300">{p.count}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}