import Head from 'next/head';
import NavBar from '../../components/NavBar';
import { useRequireAdmin } from '../../utils/guards';
import SystemStatus from '../../components/SystemStatus';

export default function AdminIndex() {
  useRequireAdmin();

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

        <section className="grid md:grid-cols-2 gap-4">
          <a href="/admin/plans" className="card p-5 hover:bg-slate-800/60">
            <h3 className="font-semibold">Plans</h3>
            <p className="text-slate-400 text-sm">Manage pricing plans and resources.</p>
          </a>
          <a href="/admin/nodes" className="card p-5 hover:bg-slate-800/60">
            <h3 className="font-semibold">Nodes</h3>
            <p className="text-slate-400 text-sm">Manage nodes and capacity.</p>
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