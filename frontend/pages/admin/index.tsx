import Head from 'next/head';
import NavBar from '../../components/NavBar';
import { useRequireAdmin } from '../../utils/guards';
import SystemStatus from '../../components/SystemStatus';
import { useState } from 'react';
import { useToast } from '../../components/Toast';
import api from '../../utils/api';

export default function AdminIndex() {
  useRequireAdmin();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [includeDaemon, setIncludeDaemon] = useState(false);

  const updatePlatform = async () => {
    setBusy(true);
    try {
      const res = await api.post('/status/platform/update', { includeDaemon });
      const restarted = res.data?.results?.map((r: any) => `${r.url || 'default'}: ${r.ok ? 'ok' : 'failed'}`).join(', ');
      toast.show(`Update requested${restarted ? ` • ${restarted}` : ''}`, 'success');
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Failed to update platform', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin • Panel</title>
      </Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Admin</h1>
          <div className="w-full max-w-sm ml-4">
            <SystemStatus />
          </div>
        </div>

        {/* Platform update card */}
        <section className="card p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Platform update</h3>
              <p className="text-slate-400 text-sm">Restart backend and frontend containers on all approved nodes. Optionally restart daemon.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={includeDaemon} onChange={(e) => setIncludeDaemon(e.target.checked)} />
                Include daemon
              </label>
              <button onClick={updatePlatform} disabled={busy} className={`px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>Update</button>
            </div>
          </div>
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          <a href="/admin/plans" className="card p-5 hover:bg-slate-800/60">
            <h3 className="font-semibold">Plans</h3>
            <p className="text-slate-400 text-sm">Manage pricing plans and resources.</p>
          </a>
          <a href="/admin/nodes" className="card p-5 hover:bg-slate-800/60">
            <h3 className="font-semibold">Nodes</h3>
            <p className="text-slate-400 text-sm">Manage nodes and capacity.</p>
          </a>
          <a href="/admin/servers" className="card p-5 hover:bg-slate-800/60">
            <h3 className="font-semibold">Servers</h3>
            <p className="text-slate-400 text-sm">Edit, reassign, or delete servers.</p>
          </a>
          <a href="/admin/users" className="card p-5 hover:bg-slate-800/60">
            <h3 className="font-semibold">Users</h3>
            <p className="text-slate-400 text-sm">Search, update, and delete users.</p>
          </a>
          <a href="/admin/logs" className="card p-5 hover:bg-slate-800/60">
            <h3 className="font-semibold">Logs</h3>
            <p className="text-slate-400 text-sm">Audit trails of important actions.</p>
          </a>
          <a href="/admin/transactions" className="card p-5 hover:bg-slate-800/60">
            <h3 className="font-semibold">Transactions</h3>
            <p className="text-slate-400 text-sm">View payments and statuses.</p>
          </a>
          <a href="/admin/settings" className="card p-5 hover:bg-slate-800/60">
            <h3 className="font-semibold">Settings</h3>
            <p className="text-slate-400 text-sm">Configure email (SMTP) and more.</p>
          </a>
          <a href="/admin/finance" className="card p-5 hover:bg-slate-800/60">
            <h3 className="font-semibold">Finance</h3>
            <p className="text-slate-400 text-sm">MRR, ARR, churn and plan distribution.</p>
          </a>
        </section>
      </main>
    </>
  );
}