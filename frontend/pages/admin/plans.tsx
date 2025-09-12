import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import NavBar from '../../components/NavBar';
import { useRequireAdmin } from '../../utils/guards';
import { useToast } from '../../components/Toast';
import SystemStatus from '../../components/SystemStatus';

type Plan = {
  id: number;
  name: string;
  pricePerMonth: string;
  resources: any;
  isActive: boolean;
};

type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

const gbp = (v: number | string | undefined | null) => {
  if (v == null) return '—';
  const num = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(Number(num))) return '—';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(Number(num));
};

export default function AdminPlans() {
  useRequireAdmin();
  const toast = useToast();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // create form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [resources, setResources] = useState('{\n  "cpu": 2,\n  "memory": "4GB",\n  "storage": "50GB"\n}');
  const [isActive, setIsActive] = useState(true);
  const [creating, setCreating] = useState(false);

  // edit form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editResources, setEditResources] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const nameError = useMemo(() => (name.trim() ? null : 'Name is required'), [name]);
  const priceError = useMemo(() => (/^\d+(?:\.\d{1,2})?$/.test(price) ? null : 'Enter a valid price'), [price]);
  const resError = useMemo(() => {
    try {
      JSON.parse(resources);
      return null;
    } catch {
      return 'Resources must be valid JSON';
    }
  }, [resources]);

  const editNameError = useMemo(() => (editingId !== null && !editName.trim() ? 'Name is required' : null), [editingId, editName]);
  const editPriceError = useMemo(
    () => (editingId !== null && !/^\d+(?:\.\d{1,2})?$/.test(editPrice) ? 'Enter a valid price' : null),
    [editingId, editPrice]
  );
  const editResError = useMemo(() => {
    if (editingId === null) return null;
    try {
      JSON.parse(editResources);
      return null;
    } catch {
      return 'Resources must be valid JSON';
    }
  }, [editingId, editResources]);

  const fetchPlans = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get('/plans/admin', { params: { page, pageSize } });
      const data = res.data as Paged<Plan>;
      setPlans(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, [page]);

  const createPlan = async () => {
    if (nameError || priceError || resError) {
      setErr(nameError || priceError || resError);
      return;
    }
    setCreating(true);
    setErr(null);
    try {
      const res = await api.post('/plans', {
        name: name.trim(),
        pricePerMonth: price,
        resources: resources,
        isActive,
      });
      // Optimistically inject into current page if fits
      setPlans((list) => [...list, res.data]);
      setTotal((t) => t + 1);
      setName('');
      setPrice('');
      setResources('{\n  "cpu": 2,\n  "memory": "4GB",\n  "storage": "50GB"\n}');
      setIsActive(true);
      toast.show('Plan created', 'success');
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to create plan';
      setErr(msg);
      toast.show(msg, 'error');
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (p: Plan) => {
    const newActive = !p.isActive;
    const prev = [...plans];
    setPlans((list) => list.map((it) => (it.id === p.id ? { ...it, isActive: newActive } : it)));
    try {
      await api.patch(`/plans/${p.id}`, { isActive: newActive });
      toast.show('Plan updated', 'success');
    } catch (e: any) {
      setPlans(prev);
      toast.show(e?.response?.data?.message || 'Failed to update plan', 'error');
    }
  };

  const beginEdit = (p: Plan) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditPrice(String(p.pricePerMonth));
    try {
      setEditResources(JSON.stringify(p.resources ?? {}, null, 2));
    } catch {
      setEditResources('{}');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditPrice('');
    setEditResources('');
    setSavingEdit(false);
  };

  const saveEdit = async (p: Plan) => {
    if (editNameError || editPriceError || editResError) {
      toast.show(editNameError || editPriceError || editResError || 'Invalid input', 'error');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await api.patch(`/plans/${p.id}`, {
        name: editName.trim(),
        pricePerMonth: editPrice,
        resources: editResources,
      });
      setPlans((list) => list.map((it) => (it.id === p.id ? res.data : it)));
      toast.show('Plan updated', 'success');
      cancelEdit();
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Failed to update plan', 'error');
      setSavingEdit(false);
    }
  };

  const deletePlan = async (p: Plan) => {
    if (!confirm(`Delete plan "${p.name}"? This cannot be undone.`)) return;
    setDeletingId(p.id);
    try {
      await api.delete(`/plans/${p.id}`);
      setPlans((list) => list.filter((it) => it.id !== p.id));
      setTotal((t) => Math.max(0, t - 1));
      toast.show('Plan deleted', 'success');
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Failed to delete plan', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Head>
        <title>Admin • Plans</title>
      </Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Admin • Plans</h1>
          <div className="w-full max-w-sm ml-4">
            <SystemStatus />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <a href="/admin/plans" className="px-3 py-1 rounded border border-slate-700 bg-slate-800/60">Plans</a>
          <a href="/admin/nodes" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Nodes</a>
          <a href="/admin/servers" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Servers</a>
          <a href="/admin/users" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Users</a>
          <a href="/admin/logs" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Logs</a>
          <a href="/admin/transactions" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Transactions</a>
          <a href="/admin/settings" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Settings</a>
          <a href="/admin/finance" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Finance</a>
        </div>

        {err && <div className="mb-4 text-red-400">{err}</div>}

        <section className="mb-8 p-4 card">
          <h2 className="font-semibold mb-3">Create plan</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="block">
              <div className="text-sm mb-1">Name</div>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" aria-invalid={!!nameError} />
              {nameError && <div className="mt-1 text-xs text-red-400">{nameError}</div>}
            </label>
            <label className="block">
              <div className="text-sm mb-1">Price per month (GBP)</div>
              <input value={price} onChange={(e) => setPrice(e.target.value)} className="input" aria-invalid={!!priceError} placeholder="9.99" />
              {priceError && <div className="mt-1 text-xs text-red-400">{priceError}</div>}
            </label>
            <label className="block">
              <div className="text-sm mb-1">Active</div>
              <select value={isActive ? '1' : '0'} onChange={(e) => setIsActive(e.target.value === '1')} className="input">
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            </label>
            <div className="md:col-span-4">
              <div className="text-sm mb-1">Resources (JSON)</div>
              <textarea value={resources} onChange={(e) => setResources(e.target.value)} rows={6} className="input font-mono text-xs" />
              {resError && <div className="mt-1 text-xs text-red-400">{resError}</div>}
            </div>
          </div>
          <div className="mt-4">
            <button onClick={createPlan} disabled={creating || !!nameError || !!priceError || !!resError} className={`btn btn-primary ${creating ? 'opacity-70 cursor-not-allowed' : ''}`}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Existing plans</h2>
            <div className="text-sm text-slate-400">Page {page} of {totalPages} • {total} total</div>
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
          ) : plans.length === 0 ? (
            <div className="card p-10 text-center">
              <h3 className="text-xl font-semibold mb-2">No plans yet</h3>
              <p className="text-slate-400">Create your first plan above.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {plans.map((p) => {
                  const isCustom = !!p?.resources?.ramRange;
                  const isEditing = editingId === p.id;
                  return (
                    <div key={p.id} className="p-4 card flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">
                            {p.name}{' '}
                            <span
                              className={`ml-2 inline-block text-xs px-2 py-0.5 rounded-full ${
                                p.isActive ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-700' : 'bg-slate-600/30 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {p.isActive ? 'active' : 'inactive'}
                            </span>
                          </div>
                          <div className="text-sm text-slate-400">
                            #{p.id} • {isCustom ? `${gbp(p?.resources?.pricePerGB || 0)} per GB / mo` : `${gbp(p.pricePerMonth)} / mo`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleActive(p)} className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600">
                            {p.isActive ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            onClick={() => (isEditing ? cancelEdit() : beginEdit(p))}
                            className="px-3 py-1 rounded border border-slate-700 hover:bg-slate-800"
                          >
                            {isEditing ? 'Cancel' : 'Edit'}
                          </button>
                          <button
                            onClick={() => deletePlan(p)}
                            disabled={deletingId === p.id}
                            className={`px-3 py-1 rounded bg-red-700 hover:bg-red-600 ${deletingId === p.id ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            {deletingId === p.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="mt-2 grid gap-3 md:grid-cols-4">
                          <label className="block">
                            <div className="text-sm mb-1">Name</div>
                            <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input" aria-invalid={!!editNameError} />
                            {editNameError && <div className="mt-1 text-xs text-red-400">{editNameError}</div>}
                          </label>
                          <label className="block">
                            <div className="text-sm mb-1">Price per month (GBP)</div>
                            <input value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="input" aria-invalid={!!editPriceError} placeholder="9.99" />
                            {editPriceError && <div className="mt-1 text-xs text-red-400">{editPriceError}</div>}
                          </label>
                          <div className="md:col-span-4">
                            <div className="text-sm mb-1">Resources (JSON)</div>
                            <textarea value={editResources} onChange={(e) => setEditResources(e.target.value)} rows={6} className="input font-mono text-xs" />
                            {editResError && <div className="mt-1 text-xs text-red-400">{editResError}</div>}
                          </div>
                          <div className="md:col-span-4">
                            <button
                              onClick={() => saveEdit(p)}
                              disabled={savingEdit || !!editNameError || !!editPriceError || !!editResError}
                              className={`btn btn-primary ${savingEdit ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                              {savingEdit ? 'Saving…' : 'Save changes'}
                            </button>
                          </div>
                        </div>
                      )}

                      {isCustom && (
                        <div className="grid gap-2 md:grid-cols-3 items-end">
                          <label className="block md:col-span-2">
                            <div className="text-sm mb-1">Set price per GB (GBP)</div>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              defaultValue={p.resources?.pricePerGB ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setPlans((list) => list.map((it) => (it.id === p.id ? { ...it, resources: { ...it.resources, pricePerGB: val === '' ? undefined : Number(val) } } : it)));
                              }}
                              className="input"
                              placeholder="0.60"
                            />
                          </label>
                          <button
                            onClick={async () => {
                              const val = Number(p.resources?.pricePerGB);
                              if (!val || val <= 0) {
                                toast.show('Enter a valid price per GB', 'error');
                                return;
                              }
                              try {
                                const res = await api.post(`/plans/${p.id}/pergb`, { pricePerGB: val, deactivateOld: true });
                                // Replace plan in list
                                setPlans((list) => list.map((it) => (it.id === p.id ? res.data : it)));
                                toast.show('Per-GB price updated and Stripe price created', 'success');
                              } catch (e: any) {
                                toast.show(e?.response?.data?.message || 'Failed to update per-GB price', 'error');
                              }
                            }}
                            className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500"
                          >
                            Update per-GB & create Stripe price
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-4">
                <div />
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">Prev</button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}