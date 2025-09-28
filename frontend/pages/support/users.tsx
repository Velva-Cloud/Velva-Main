import Head from 'next/head';
import { useEffect, useState } from 'react';
import api from '../../utils/api';
import NavBar from '../../components/NavBar';
import { useRequireSupport } from '../../utils/guards';
import SystemStatus from '../../components/SystemStatus';

type User = {
  id: number;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'SUPPORT' | 'USER';
  createdAt: string;
  lastLogin?: string | null;
  suspended?: boolean;
};

type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export default function SupportUsers() {
  useRequireSupport();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'ALL' | User['role']>('ALL');

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchUsers = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get('/users', { params: { search: search || undefined, role: role !== 'ALL' ? role : undefined, page, pageSize } });
      const data = res.data as Paged<User>;
      setUsers(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [search, role]);

  useEffect(() => {
    fetchUsers();
  }, [page, role]);

  return (
    <>
      <Head>
        <title>Support • Users</title>
      </Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Support • Users</h1>
          <div className="w-full max-w-sm ml-4">
            <SystemStatus />
          </div>
        </div>

        <div className="card p-4 mb-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-sm mb-1">Search</div>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Email contains…" className="input" />
            </div>
            <div>
              <div className="text-sm mb-1">Role</div>
              <select value={role} onChange={(e) => setRole(e.target.value as any)} className="input">
                <option value="ALL">All</option>
                <option value="OWNER">OWNER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="SUPPORT">SUPPORT</option>
                <option value="USER">USER</option>
              </select>
            </div>
          </div>
        </div>

        {err && <div className="mb-4 text-red-400">{err}</div>}

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-4 card animate-pulse">
                <div className="h-4 w-40 bg-slate-800 rounded" />
                <div className="mt-2 h-3 w-64 bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="card p-10 text-center">
            <h3 className="text-xl font-semibold mb-2">No users found</h3>
            <p className="text-slate-400">Try adjusting your search or role filter.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {users.map((u) => (
                <div key={u.id} className="p-4 card flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      {u.email}
                      {u.suspended ? <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-700 text-white">suspended</span> : null}
                    </div>
                    <div className="text-sm text-slate-400">
                      ID {u.id} • joined {new Date(u.createdAt).toLocaleString()} {u.lastLogin ? `• last login ${new Date(u.lastLogin).toLocaleString()}` : ''}
                    </div>
                  </div>
                  <div className="text-sm text-slate-300">Role: {u.role}</div>
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