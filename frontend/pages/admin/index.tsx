import Head from 'next/head';
import NavBar from '../../components/NavBar';
import { useRequireAdmin } from '../../utils/guards';
import SystemStatus from '../../components/SystemStatus';
import Link from 'next/link';

export default function AdminHome() {
  useRequireAdmin();

  return (
    <>
      <Head>
        <title>Admin • Overview</title>
      </Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-4">Admin</h1>

        <div className="grid gap-4 md:grid-cols-2 mb-8">
          <SystemStatus />
          <div className="card p-4">
            <h2 className="font-semibold mb-2">Quick links</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link href="/admin/plans" className="px-3 py-2 rounded border border-slate-800 hover:bg-slate-800">Plans</Link>
              <Link href="/admin/nodes" className="px-3 py-2 rounded border border-slate-800 hover:bg-slate-800">Nodes</Link>
              <Link href="/admin/users" className="px-3 py-2 rounded border border-slate-800 hover:bg-slate-800">Users</Link>
              <Link href="/admin/logs" className="px-3 py-2 rounded border border-slate-800 hover:bg-slate-800">Logs</Link>
              <Link href="/admin/transactions" className="px-3 py-2 rounded border border-slate-800 hover:bg-slate-800">Transactions</Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card p-4">
            <h3 className="font-semibold mb-1">Plans</h3>
            <p className="text-sm text-slate-400 mb-3">Create and manage subscription plans.</p>
            <Link href="/admin/plans" className="btn btn-primary">Manage plans</Link>
          </div>
          <div className="card p-4">
            <h3 className="font-semibold mb-1">Nodes</h3>
            <p className="text-sm text-slate-400 mb-3">Add/edit nodes, toggle active, and ping status.</p>
            <Link href="/admin/nodes" className="btn btn-primary">Manage nodes</Link>
          </div>
          <div className="card p-4">
            <h3 className="font-semibold mb-1">Users</h3>
            <p className="text-sm text-slate-400 mb-3">List, search, filter, and quickly update roles.</p>
            <Link href="/admin/users" className="btn btn-primary">Manage users</Link>
          </div>
          <div className="card p-4">
            <h3 className="font-semibold mb-1">Logs</h3>
            <p className="text-sm text-slate-400 mb-3">View recent activity logs.</p>
            <Link href="/admin/logs" className="btn btn-primary">View logs</Link>
          </div>
        </div>
      </main>
    </>
  );
}