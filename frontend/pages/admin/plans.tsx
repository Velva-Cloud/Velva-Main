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

export default function AdminPlans() {
  useRequireAdmin();
  const toast = useToast();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  // form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('9.99');
  const [cpu, setCpu] = useState(100);
  const [ramMB, setRamMB] = useState(2048);
  const [diskGB, setDiskGB] = useState(20);
  const [advanced, setAdvanced] = useState(false);
  const [resources, setResources] = useState('{\n  "cpu": 100,\n  "ramMB": 2048,\n  "diskGB": 20\n}');
  const [isActive, setIsActive] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const nameError = useMemo(() => (name.trim().length === 0 ? 'Name is required' : null), [name]);
  const priceError = useMemo(() => (/^\\d+(\\.\\d{1,2})?$/.test(price) ? null : 'Enter a valid decimal like 9.99'), [price]);
  const resourcesError = useMemo(() => {
    if (!advanced) return null;
    try {
      JSON.parse(resources);
      return null;
    } catch {
      return 'Resources must be valid JSON';
    }
  }, [advanced, resources]);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const res = await api.get('/plans/admin');
      setPlans(res.data);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load plans (are you ADMIN/OWNER?)');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const createPlan = async () => {
    setErr(null);
    if (nameError || priceError || resourcesError) {
      setErr(nameError || priceError || resourcesError);
      return;
    }
    setCreating(true);
    try {
      const resObj = advanced ? JSON.parse(resources) : { cpu, ramMB, diskGB };
      const res = await api.post('/plans', {
        name,
        pricePerMonth: price,
        resources: JSON.stringify(resObj),
        isActive,
      });
      setPlans((prev) => [res.data, ...prev]);
      setName('');
      setPrice('9.99');
      setCpu(100);
      setRamMB(2048);
      setDiskGB(20);
      setResources('{\n  "cpu": 100,\n  "ramMB": 2048,\n  "diskGB": 20\n}');
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

  const toggleActive = async (id: number, current: boolean) => {
    setErr(null);
    setBusyId(id);
    // optimistic update
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: !current } : p)));
    try {
      await api.patch(`/plans/${id}`, { isActive: !current });
      toast.show(`Plan ${!current ? 'activated' : 'deactivated'}`, 'success');
    } catch (e: any) {
      // revert
      setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: current } : p)));
      const msg = e?.response?.data?.message || 'Failed to update plan';
      setErr(msg);
      toast.show(msg, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const updatePrice = async (id: number, newPrice: string) => {
    if (!/^\\d+(\\.\\d{1,2})?$/.test(newPrice)) {
      toast.show('Enter a valid decimal like 9.99', 'error');
      return;
    }
    setErr(null);
    setBusyId(id);
    const prev = plans.find((p) => p.id === id)?.pricePerMonth;
    // optimistic
    setPlans((prevList) => prevList.map((p) => (p.id === id ? { ...p, pricePerMonth: newPrice } : p)));
    try {
      await api.patch(`/plans/${id}`, { pricePerMonth: newPrice });
      toast.show('Price updated', 'success');
    } catch (e: any) {
      // revert
      setPlans((prevList) => prevList.map((p) => (p.id === id ? { ...p, pricePerMonth: String(prev) } : p)));
      const msg = e?.response?.data?.message || 'Failed to update price';
      setErr(msg);
      toast.show(msg, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this plan?')) return;
    setErr(null);
    // optimistic remove
    const prev = plans;
    setPlans((p) => p.filter((x) => x.id !== id));
    try {
      await api.delete(`/plans/${id}`);
      toast.show('Plan deleted', 'success');
    } catch (e: any) {
      setPlans(prev);
      const msg = e?.response?.data?.message || 'Failed to delete plan (is it referenced by servers/subscriptions?)';
      setErr(msg);
      toast.show(msg, 'error');
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
          <a href="/admin/users" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Users</a>
          <a href="/admin/logs" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Logs</a>
        </div>

        {err && <div className="mb-4 text-red-400">{err}</div>}

        <section id="create-plan" className="mb-8 p-4 card">
          <h2 className="font-semibold mb-3">Create Plan</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <div className="text-sm mb-1">Name</div>
              <input aria-invalid={!!nameError} aria-describedby="name-err" value={name} onChange={e => setName(e.target.value)} className="input" />
              {nameError && <div id="name-err" className="mt-1 text-xs text-red-400">{nameError}</div>}
            </label>
            <label className="block">
              <div className="text-sm mb-1">Price per month (decimal string)</div>
              <input aria-invalid={!!priceError} aria-describedby="price-err" value={price} onChange={e => setPrice(e.target.value)} className="input" />
              {priceError && <div id="price-err" className="mt-1 text-xs text-red-400">{priceError}</div>}
            </label>
          </div>

          <div className="mt-4">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={advanced} onChange={e => setAdvanced(e.target.checked)} />
              <span>Advanced JSON</span>
            </label>
          </div>

          {!advanced ? (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="block">
                <div className="text-sm mb-1">CPU (%)</div>
                <input type="number" value={cpu} onChange={e => setCpu(Number(e.target.value))} className="input" />
              </label>
              <label className="block">
                <div className="text-sm mb-1">RAM (MB)</div>
                <input type="number" value={ramMB} onChange={e => setRamMB(Number(e.target.value))} className="input" />
              </label>
              <label className="block">
                <div className="text-sm mb-1">Disk (GB)</div>
                <input type="number" value={diskGB} onChange={e => setDiskGB(Number(e.target.value))} className="input" />
              </label>
            </div>
          ) : (
            <div className="mt-3">
              <div className="text-sm mb-1">Resources (JSON)</div>
              <textarea aria-invalid={!!resourcesError} aria-describedby="res-err" value={resources} onChange={e => setResources(e.target.value)} rows={6} className="textarea font-mono text-sm" />
              {resourcesError && <div id="res-err" className="mt-1 text-xs text-red-400">{resourcesError}</div>}
            </div>
          )}

          <label className="mt-3 inline-flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            <span>Active</span>
          </label>
          <div className="mt-4">
            <button onClick={createPlan} disabled={creating || !!nameError || !!priceError || !!resourcesError} aria-busy={creating} className={`btn btn-primary ${creating ? 'opacity-70 cursor-not-allowed' : ''}`}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-3">Existing Plans</h2>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-4 card animate-pulse">
                  <div className="h-4 w-40 bg-slate-800 rounded" />
                  <div className="mt-2 h-3 w-64 bg-slate-800 rounded" />
                  <div className="mt-3 h-24 bg-slate-800 rounded" />
                </div>
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="relative overflow-hidden card p-10 text-center">
              <div
                className="absolute inset-0 -z-10 opacity-40"
                style={{
                  background:
                    'radial-gradient(500px 200px at 20% 0%, rgba(109,40,217,0.25), transparent 60%), radial-gradient(500px 200px at 80% 100%, rgba(6,182,212,0.25), transparent 60%)',
                }}
              />
              <img src="https://velvacloud.com/logo.png" alt="VelvaCloud" className="mx-auto h-16 w-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No plans yet</h3>
              <p className="text-slate-400 mb-5">Use the form above to create your first plan.</p>
              <a href="#create-plan" className="btn btn-primary inline-flex">Create plan</a>
            </div>
          ) : (
            <div className="space-y-3">
              {plans.map(p => (
                <div key={p.id} className="p-4 card">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-sm text-slate-400">ID: {p.id} • ${p.pricePerMonth}/mo • {p.isActive ? 'Active' : 'Inactive'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleActive(p.id, p.isActive)} disabled={busyId === p.id} className={`px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 ${busyId === p.id ? 'opacity-60 cursor-not-allowed' : ''}`}>
                        {p.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => {
                        const newPrice = prompt('New price (decimal string):', String(p.pricePerMonth));
                        if (newPrice !== null) updatePrice(p.id, newPrice);
                      }} disabled={busyId === p.id} className={`px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 ${busyId === p.id ? 'opacity-60 cursor-not-allowed' : ''}`}>Edit Price</button>
                      <button onClick={() => remove(p.id)} className="px-3 py-1 rounded bg-red-600 hover:bg-red-500">Delete</button>
                    </div>
                  </div>
                  <pre className="mt-3 bg-slate-800 rounded p-2 text-xs overflow-auto">{JSON.stringify(p.resources, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}