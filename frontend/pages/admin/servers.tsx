import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRequireAdmin } from '../../utils/guards';
import api from '../../utils/api';
import { useToast } from '../../components/Toast';
import AdminLayout from '../../components/AdminLayout';

type Server = {
  id: number;
  userId: number;
  planId: number;
  nodeId?: number | null;
  name: string;
  status: 'running' | 'stopped' | 'suspended';
  createdAt: string;
};

type PlanLite = { id: number; name: string };
type NodeLite = { id: number; name: string };

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
  const [plans, setPlans] = useState<PlanLite[]>([]);
  const [nodes, setNodes] = useState<NodeLite[]>([]);
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
  const [editPlanId, setEditPlanId] = useState<number | ''>('');
  const [editNodeId, setEditNodeId] = useState<number | ''>('');
  const [editUserId, setEditUserId] = useState<number | ''>('');
  const [chosenUserEmail, setChosenUserEmail] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // user search
  const [userQuery, setUserQuery] = useState('');
  const debouncedUserQuery = useDebounce(userQuery, 300);
  const [userOpts, setUserOpts] = useState<{ id: number; email: string }[]>([]);
  const [userLoading, setUserLoading] = useState(false);

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

  const fetchPlansAndNodes = async () => {
    try {
      const [plansRes, nodesRes] = await Promise.all([
        api.get('/plans/admin', { params: { page: 1, pageSize: 1000 } }),
        api.get('/nodes', { params: { page: 1, pageSize: 1000 } }),
      ]);
      const planItems = (plansRes.data?.items || plansRes.data || []) as any[];
      const nodeItems = (nodesRes.data?.items || nodesRes.data || []) as any[];
      setPlans(planItems.map((p) => ({ id: p.id, name: p.name })));
      setNodes(nodeItems.map((n) => ({ id: n.id, name: n.name })));
    } catch {
      // non-fatal
    }
  };

  useEffect(() => {
    fetchServers();
  }, [page]);

  useEffect(() => {
    fetchPlansAndNodes();
  }, []);

  useEffect(() => {
    // user email search
    if (debouncedUserQuery && debouncedUserQuery.length >= 3) {
      setUserLoading(true);
      api
        .get('/users', { params: { search: debouncedUserQuery, page: 1, pageSize: 10 } })
        .then((res) => {
          const data = res.data as Paged<{ id: number; email: string }>;
          setUserOpts(data.items || []);
        })
        .catch(() => setUserOpts([]))
        .finally(() => setUserLoading(false));
    } else {
      setUserOpts([]);
      setUserLoading(false);
    }
  }, [debouncedUserQuery]);

  const beginEdit = (s: Server) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditStatus(s.status);
    setEditPlanId(s.planId);
    setEditNodeId(s.nodeId ?? '');
    setEditUserId(s.userId);
    setChosenUserEmail('');
    setUserQuery('');
    setUserOpts([]);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditStatus('stopped');
    setEditPlanId('');
    setEditNodeId('');
    setEditUserId('');
    setChosenUserEmail('');
    setUserQuery('');
    setUserOpts([]);
    setSaving(false);
  };

  const saveEdit = async (s: Server) => {
    if (nameError) {
      toast.show(nameError, 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: any = { name: editName.trim(), status: editStatus };
      if (editPlanId !== '') payload.planId = Number(editPlanId);
      if (editNodeId !== '') payload.nodeId = Number(editNodeId);
      if (editUserId !== '') payload.userId = Number(editUserId);
      const res = await api.patch(`/servers/${s.id}`, payload);
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
      <AdminLayout title="Admin • Servers">
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
                          <label className="block">
                            <div className="text-sm mb-1">Plan</div>
                            <select
                              value={editPlanId === '' ? '' : Number(editPlanId)}
                              onChange={(e) => setEditPlanId(e.target.value === '' ? '' : Number(e.target.value))}
                              className="input"
                            >
                              <option value="">Keep unchanged</option>
                              {plans.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} (#{p.id})
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <div className="text-sm mb-1">Node</div>
                            <select
                              value={editNodeId === '' ? '' : Number(editNodeId)}
                              onChange={(e) => setEditNodeId(e.target.value === '' ? '' : Number(e.target.value))}
                              className="input"
                            >
                              <option value="">Keep unchanged</option>
                              {nodes.map((n) => (
                                <option key={n.id} value={n.id}>
                                  {n.name} (#{n.id})
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="md:col-span-3">
                            <div className="grid md:grid-cols-3 gap-3">
                              <label className="block md:col-span-2">
                                <div className="text-sm mb-1">Transfer to user (search email)</div>
                                <input
                                  value={chosenUserEmail || userQuery}
                                  onChange={(e) => {
                                    setChosenUserEmail('');
                                    setUserQuery(e.target.value);
                                  }}
                                  className="input"
                                  placeholder="Type at least 3 characters"
                                />
                                {userLoading ? (
                                  <div className="text-xs text-slate-400 mt-1">Searching…</div>
                                ) : userOpts.length > 0 ? (
                                  <div className="mt-1 max-h-40 overflow-auto rounded border border-slate-800 bg-slate-900/70">
                                    {userOpts.map((u) => (
                                      <button
                                        type="button"
                                        key={u.id}
                                        onClick={() => {
                                          setEditUserId(u.id);
                                          setChosenUserEmail(u.email);
                                          setUserOpts([]);
                                          setUserQuery('');
                                        }}
                                        className="w-full text-left px-3 py-1 hover:bg-slate-800 text-sm"
                                      >
                                        {u.email} (#{u.id})
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                                {editUserId !== '' && chosenUserEmail && (
                                  <div className="text-xs text-slate-400 mt-1">Selected: {chosenUserEmail} (ID {editUserId})</div>
                                )}
                              </label>
                              <div className="flex items-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditUserId('');
                                    setChosenUserEmail('');
                                    setUserQuery('');
                                    setUserOpts([]);
                                  }}
                                  className="px-3 py-2 rounded border border-slate-800 hover:bg-slate-800"
                                >
                                  Clear selection
                                </button>
                              </div>
                            </div>
                          </div>
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
      </AdminLayout>
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