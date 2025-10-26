import Head from 'next/head';
import { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import FormField from '../../components/FormField';
import Table from '../../components/Table';
import { useRequireAdmin } from '../../utils/guards';
import api from '../../utils/api';
import { useToast } from '../../components/Toast';

type UserItem = {
  id: number;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'SUPPORT' | 'USER';
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
};

export default function StaffProfiles() {
  useRequireAdmin();
  const toast = useToast();
  const [items, setItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      // Load all users and filter staff roles client-side
      const res = await api.get('/users', { params: { role: 'ALL', pageSize: 500 } });
      const list: UserItem[] = (res.data?.items || []).filter((u: any) =>
        u.role === 'SUPPORT' || u.role === 'ADMIN' || u.role === 'OWNER'
      );
      setItems(list);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateField = (id: number, key: keyof UserItem, value: string) => {
    setItems(prev => prev.map(u => (u.id === id ? { ...u, [key]: value } : u)));
  };

  const saveProfile = async (u: UserItem) => {
    setSavingId(u.id);
    try {
      await api.patch(`/users/${u.id}/profile`, {
        firstName: (u.firstName || '').trim() || null,
        lastName: (u.lastName || '').trim() || null,
        title: (u.title || '').trim() || null,
      });
      toast.show('Profile saved', 'success');
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to save';
      toast.show(msg, 'error');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <>
      <Head>
        <title>Admin • Staff Profiles</title>
      </Head>
      <AdminLayout title="Admin • Staff Profiles" actions={<button onClick={load} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Refresh</button>}>
        {err && <div className="mb-3 text-red-400">{err}</div>}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (<div key={i} className="p-4 card animate-pulse"><div className="h-4 w-40 bg-slate-800 rounded" /></div>))}
          </div>
        ) : (
          <div className="card p-4">
            <Table
              headers={[
                'Email',
                'Role',
                'First name',
                'Last name',
                'Title',
                'Actions',
              ]}
            >
              {items.map(u => (
                <tr key={u.id}>
                  <td className="align-top px-3 py-2">{u.email}</td>
                  <td className="align-top px-3 py-2">{u.role}</td>
                  <td className="align-top px-3 py-2">
                    <FormField label="">
                      <input className="input" value={u.firstName || ''} onChange={(e) => updateField(u.id, 'firstName', e.target.value)} placeholder="e.g., Ethan" />
                    </FormField>
                  </td>
                  <td className="align-top px-3 py-2">
                    <FormField label="">
                      <input className="input" value={u.lastName || ''} onChange={(e) => updateField(u.id, 'lastName', e.target.value)} placeholder="e.g., Hill" />
                    </FormField>
                  </td>
                  <td className="align-top px-3 py-2">
                    <FormField label="">
                      <input className="input" value={u.title || ''} onChange={(e) => updateField(u.id, 'title', e.target.value)} placeholder="e.g., Support Engineer" />
                    </FormField>
                  </td>
                  <td className="align-top px-3 py-2">
                    <button
                      onClick={() => saveProfile(u)}
                      className={`btn btn-primary ${savingId === u.id ? 'opacity-70 cursor-not-allowed' : ''}`}
                      disabled={savingId === u.id}
                    >
                      {savingId === u.id ? 'Saving…' : 'Save'}
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </AdminLayout>
    </>
  );
}