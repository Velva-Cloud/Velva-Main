import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import NavBar from '../../../components/NavBar';
import ServerSidebar from '../../../components/ServerSidebar';
import { useRequireAuth } from '../../../utils/guards';
import api from '../../../utils/api';
import { useToast } from '../../../components/Toast';
import { getUserRole } from '../../../utils/auth';

type AccessUser = { id: number; email: string; role: 'VIEWER' | 'OPERATOR' | 'ADMIN' };

export default function ServerUsersPage() {
  useRequireAuth();
  const toast = useToast();
  const router = useRouter();
  const { id } = router.query;

  const role = useMemo(() => getUserRole(), []);
  const [srvName, setSrvName] = useState<string>('');
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [email, setEmail] = useState('');
  const [perm, setPerm] = useState<'VIEWER' | 'OPERATOR' | 'ADMIN'>('VIEWER');
  const [busy, setBusy] = useState(false);

  const fetchServer = async () => {
    if (!id) return;
    try {
      const res = await api.get(`/servers/${id}`);
      setSrvName(res.data?.name || String(id));
    } catch {}
  };

  useEffect(() => { fetchServer(); }, [id]);

  const loadUsers = async () => {
    if (!id) return;
    try {
      const res = await api.get(`/servers/${id}/access`);
      const items = (res.data || []) as Array<{ userId: number; email: string; role: 'VIEWER' | 'OPERATOR' | 'ADMIN' }>;
      setUsers(items.map(i => ({ id: i.userId, email: i.email, role: i.role })));
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Failed to load access list', 'error');
    }
  };

  useEffect(() => { loadUsers(); }, [id]);

  const addUser = async () => {
    setBusy(true);
    try {
      await api.post(`/servers/${id}/access`, { email: email.trim(), role: perm });
      toast.show('Access granted', 'success');
      await loadUsers();
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Failed to add user', 'error');
    } finally {
      setBusy(false);
      setEmail('');
      setPerm('VIEWER');
    }
  };

  const removeUser = async (uid: number) => {
    setBusy(true);
    try {
      await api.delete(`/servers/${id}/access/${uid}`);
      toast.show('Access removed', 'success');
      await loadUsers();
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Failed to remove user', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head><title>Users • {srvName || id}</title></Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex gap-6">
          <ServerSidebar serverId={id || ''} current="users" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold">Users & Access • {srvName}</h1>
              <a href={`/servers/${id}`} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Back to overview</a>
            </div>

            <section className="card p-4 mt-4">
              <h2 className="font-semibold mb-3">Invite User</h2>
              <div className="grid gap-3 md:grid-cols-3">
                <input className="input" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
                <select className="input" value={perm} onChange={(e) => setPerm(e.target.value as any)}>
                  <option value="VIEWER">Viewer (read-only)</option>
                  <option value="OPERATOR">Operator (console/files)</option>
                  <option value="ADMIN">Admin (all server actions)</option>
                </select>
                <button onClick={addUser} disabled={busy || !email.trim()} className={`px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>Invite</button>
              </div>
              <p className="text-xs text-slate-400 mt-2">Note: backend API for user access is planned. This UI will connect to it once available.</p>
            </section>

            <section className="card p-4 mt-4">
              <h2 className="font-semibold mb-3">Current Access</h2>
              <div className="grid gap-2">
                {users.length === 0 && <div className="text-sm text-slate-400">No users yet.</div>}
                {users.map(u => (
                  <div key={u.id} className="flex items-center justify-between px-2 py-1 rounded hover:bg-slate-800/50">
                    <div>
                      <div className="font-semibold">{u.email}</div>
                      <div className="text-xs text-slate-400">{u.role}</div>
                    </div>
                    <button onClick={() => removeUser(u.id)} className="text-xs px-2 py-0.5 rounded border border-slate-800 hover:bg-slate-800">Remove</button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}