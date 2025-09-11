import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import NavBar from '../../components/NavBar';
import SystemStatus from '../../components/SystemStatus';
import { useRequireAdmin } from '../../utils/guards';
import api from '../../utils/api';
import { useToast } from '../../components/Toast';

type Server = {
  id: number;
  userId: number;
  planId: number;
  nodeId?: number | null;
  name: string;
  status: 'running' | 'stopped' | 'suspended';
  createdAt: string;
};

type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

const STATUSES = ['running', 'stopped', 'suspended'] as const;

export default function AdminServers() {
  useRequireAdmin();
  const toast = useToast();

  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editStatus, setEditStatus] = useState<Server['status']>('stopped');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const nameError = useMemo(() => {
    if (editingId === null) return null;
    const n = editName.trim();
    if (n.length < 3 || n.length > 32) return 'Name must be 3-32 characters';
    if (!/^[A-Za-z0-9_-]+$/.test(n)) return 'Only letters, numbers, dash and underscore allowed';
    return null;
  }, [editingId, editName]);

  const fetchServers = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get('/servers', { params: { all: '1', page, pageSize } });
      const data = res.data as Paged<Server>;
      setServers(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load servers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, [page]);

  const beginEdit = (s: Server) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditStatus(s.status);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditStatus('stopped');
    setSaving(false);
  };

  const saveEdit = async (s: Server) => {
    if (nameError) {
      toast.show(nameError, 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch(`/servers/${s.id}`, { name: editName.trim(), status: editStatus });
      setServers((list) => list.map((it) => (it.id === s.id ? res.data : it)));
      toast.show('Server updated', 'success');
      cancelEdit();
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to update server';
      toast.show(msg, 'error');
      setSaving(false);
    }
  };

  const deleteServer = async (s: Server) => {
    if (!confirm(`Delete server "${s.name}" (ID ${s.id})? This cannot be undone.`)) return;
    setDeletingId(s.id);
    try {
      await api.delete(`/servers/${s.id}`);
      setServers((list) => list.filter((it) => it.id !== s.id));
      setTotal((t) => Math.max(0, t - 1));
      toast.show('Server deleted', 'success');
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to delete server';
      toast.show(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Head>
        <title>Admin • Servers</title>
      </Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Admin • Servers</h1>
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
          <a href="/admin/servers" className="px-3 py-1 rounded border border-slate-700 bg-slate-800/60">Servers</a>
        </div>

        {err && <div className="mb-4 text-red-400">{err}</div>}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Servers</h2>
            <div className="text-sm text-slate-400">Page {page} of {totalPages} • {total} total</div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="p-4 card animate-pulse">
                  <div className="h-4 w-56 bg-slate-800 rounded" />
                </div>
              ))}
            </div>
          ) : servers.length === 0 ? (
            <div className="card p-10 text-center">
              <h3 className="text-xl font-semibold mb-2">No servers</h3>
              <p className="text-slate-400">There are no servers to display.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {servers.map((s) => {
                  const isEditing = editingId === s.id;
                  return (
                    <div key={s.id} className="p-4 card">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-semibold break-words">
                            #{s.id} • {s.name}
                            <span
                              className={`ml-2 inline-block text-xs px-2 py-0.5 rounded-full ${
                                s.status === 'running'
                                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-700'
                                  : s.status === 'suspended'
                                  ? 'bg-amber-600/30 text-amber-200 border border-amber-700'
                                  : 'bg-slate-600/30 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {s.status}
                            </span>
                          </div>
                          <div className="text-sm text-slate-400">
                            user #{s.userId} • plan #{s.planId} {s.nodeId ? <>• node #{s.nodeId}</> : null} • created {new Date(s.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => (isEditing ? cancelEdit() : beginEdit(s))}
                            className="px-3 py-1 rounded border border-slate-700 hover:bg-slate-800"
                          >
                            {isEditing ? 'Cancel' : 'Edit'}
                          </button>
                          <button
                            onClick={() => deleteServer(s)}
                            disabled={deletingId === s.id}
                            className={`px-3 py-1 rounded bg-red-700 hover:bg-red-600 ${deletingId === s.id ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            {deletingId === s.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="mt-3 grid gap-3 md:grid-cols-3 items-end">
                          <label className="block">
                            <div className="text-sm mb-1">Name</div>
                            <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input" aria-invalid={!!nameError} />
                            {nameError && <div className="mt-1 text-xs text-red-400">{nameError}</div>}
                          </label>
                          <label className="block">
                            <div className="text-sm mb-1">Status</div>
                            <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as Server['status'])} className="input">
                              {STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="md:col-span-3">
                            <button
                              onClick={() => saveEdit(s)}
                              disabled={saving || !!nameError}
                              className={`btn btn-primary ${saving ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                              {saving ? 'Saving…' : 'Save changes'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mt-4">
                <div />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}