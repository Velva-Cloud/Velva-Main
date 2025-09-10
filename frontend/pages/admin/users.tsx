import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import NavBar from '../../components/NavBar';
import { useRequireAdmin } from '../../utils/guards';
import { useToast } from '../../components/Toast';
import SystemStatus from '../../components/SystemStatus';

type User = {
  id: number;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'SUPPORT' | 'USER';
  createdAt: string;
  lastLogin?: string | null;
};

export default function AdminUsers() {
  useRequireAdmin();
  const toast = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'ALL' | User['role']>('ALL');

  const debouncedSearch = useDebounce(search, 300);

  const fetchUsers = async (params?: { search?: string; role?: string }) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get('/users', { params });
      setUsers(res.data);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers({ search: debouncedSearch || undefined, role: role !== 'ALL' ? role : undefined });
  }, [debouncedSearch, role]);

  const setUserRole = async (id: number, newRole: User['role']) => {
    const confirmMsg = `Change this user's role to ${newRole}?`;
    if (!confirm(confirmMsg)) return;
    const prev = users.find((u) => u.id === id);
    if (!prev) return;
    // optimistic
    setUsers((list) => list.map((u) => (u.id === id ? { ...u, role: newRole } : u)));
    try {
      await api.patch(`/users/${id}/role`, { role: newRole });
      toast.show('Role updated', 'success');
    } catch (e: any) {
      setUsers((list) => list.map((u) => (u.id === id ? prev : u)));
      toast.show(e?.response?.data?.message || 'Failed to update role', 'error');
    }
  };

  return (
    <>
      <Head>
        <title>Admin • Users</title>
      </Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Admin • Users</h1>
          <div className="w-full max-w-sm ml-4">
            <SystemStatus />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <a href="/admin/plans" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Plans</a>
          <a href="/admin/nodes" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Nodes</a>
          <a href="/admin/users" className="px-3 py-1 rounded border border-slate-700 bg-slate-800/60">Users</a>
          <a href="/admin/logs" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Logs</a>
        </div>

        {err && <div className="mb-4 text-red-400">{err}</div>}

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
          <div className="space-y-3">
            {users.map((u) => (
              <div key={u.id} className="p-4 card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{u.email}</div>
                  <div className="text-sm text-slate-400">ID {u.id} • joined {new Date(u.createdAt).toLocaleString()} {u.lastLogin ? `• last login ${new Date(u.lastLogin).toLocaleString()}` : ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-300">Role</label>
                  <select value={u.role} onChange={(e) => setUserRole(u.id, e.target.value as User['role'])} className="input">
                    <option value="OWNER">OWNER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="SUPPORT">SUPPORT</option>
                    <option value="USER">USER</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function useDebounce<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}