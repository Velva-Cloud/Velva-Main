import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import NavBar from '../../components/NavBar';
import { useRequireAdmin } from '../../utils/guards';
import { useToast } from '../../components/Toast';
import SystemStatus from '../../components/SystemStatus';
import Modal from '../../components/Modal';

type User = {
  id: number;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'SUPPORT' | 'USER';
  createdAt: string;
  lastLogin?: string | null;
  suspended?: boolean;
};

type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export default function AdminUsers() {
  useRequireAdmin();
  const toast = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'ALL' | User['role']>('ALL');

  const debouncedSearch = useDebounce(search, 300);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchUsers = async (params?: { search?: string; role?: string; page?: number; pageSize?: number }) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get('/users', { params });
      const data = res.data as Paged<User>;
      setUsers(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  // Reset to first page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, role]);

  useEffect(() => {
    fetchUsers({ search: debouncedSearch || undefined, role: role !== 'ALL' ? role : undefined, page, pageSize });
  }, [debouncedSearch, role, page]);

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

  const openEdit = (u: User) => {
    setEditingUser(u);
    setNewEmail(u.email);
    setEmailErr(null);
  };

  const validateEmail = (value: string) => {
    const v = value.trim();
    // Simple email format check
    const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
    if (!valid) return 'Enter a valid email address';
    return null;
  };

  const saveEmail = async () => {
    if (!editingUser) return;
    const errMsg = validateEmail(newEmail);
    setEmailErr(errMsg);
    if (errMsg) return;
    setSaving(true);
    try {
      await api.patch(`/users/${editingUser.id}/email`, { email: newEmail.trim() });
      setUsers((list) => list.map((u) => (u.id === editingUser.id ? { ...u, email: newEmail.trim() } : u)));
      toast.show('Email updated', 'success');
      setEditingUser(null);
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to update email';
      setEmailErr(msg);
      toast.show(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (u: User) => {
    if (!confirm(`Delete user ${u.email}? This removes their servers, subscriptions and logs.`)) return;
    const prev = [...users];
    setUsers((list) => list.filter((it) => it.id !== u.id));
    setTotal((t) => Math.max(0, t - 1));
    try {
      await api.delete(`/users/${u.id}`);
      toast.show('User deleted', 'success');
    } catch (e: any) {
      setUsers(prev);
      toast.show(e?.response?.data?.message || 'Failed to delete user', 'error');
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
          <a href="/admin/servers" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Servers</a>
          <a href="/admin/users" className="px-3 py-1 rounded border border-slate-700 bg-slate-800/60">Users</a>
          <a href="/admin/logs" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Logs</a>
          <a href="/admin/transactions" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Transactions</a>
          <a href="/admin/settings" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Settings</a>
          <a href="/admin/finance" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Finance</a>
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
          <>
            <div className="space-y-3">
              {users.map((u) => (
                <div key={u.id} className="p-4 card flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      {u.email}
                      {u.suspended ? <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-700 text-white">suspended</span> : null}
                    </div>
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
                    {!u.suspended ? (
                      <button
                        onClick={async () => {
                          if (!confirm(`Suspend user ${u.email}?`)) return;
                          try {
                            await api.post(`/users/${u.id}/suspend`, {});
                            setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, suspended: true } : x)));
                            toast.show('User suspended', 'success');
                          } catch (e: any) {
                            toast.show(e?.response?.data?.message || 'Failed to suspend user', 'error');
                          }
                        }}
                        className="px-3 py-1 rounded bg-amber-700 hover:bg-amber-600"
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          if (!confirm(`Unsuspend user ${u.email}?`)) return;
                          try {
                            await api.post(`/users/${u.id}/unsuspend`, {});
                            setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, suspended: false } : x)));
                            toast.show('User unsuspended', 'success');
                          } catch (e: any) {
                            toast.show(e?.response?.data?.message || 'Failed to unsuspend user', 'error');
                          }
                        }}
                        className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600"
                      >
                        Unsuspend
                      </button>
                    )}
                    <button onClick={() => openEdit(u)} className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600">Edit email</button>
                    <button onClick={() => deleteUser(u)} className="px-3 py-1 rounded bg-red-700 hover:bg-red-600">Delete</button>
                  </div>
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

      <Modal
        open={!!editingUser}
        onClose={() => (!saving ? setEditingUser(null) : null)}
        title="Edit user email"
      >
        <div className="space-y-3">
          <div>
            <div className="text-sm mb-1">Email</div>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value);
                if (emailErr) setEmailErr(null);
              }}
              className="input w-full"
              placeholder="name@example.com"
              aria-invalid={!!emailErr}
            />
            {emailErr && <div className="text-xs text-red-400 mt-1">{emailErr}</div>}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              className={`px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={() => setEditingUser(null)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className={`px-4 py-2 rounded btn-primary ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={saveEmail}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
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