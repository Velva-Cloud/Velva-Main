import Head from 'next/head';
import { useEffect, useState } from 'react';
import api from '../../utils/api';
import NavBar from '../../components/NavBar';

type Plan = {
  id: number;
  name: string;
  pricePerMonth: string;
  resources: any;
  isActive: boolean;
};

export default function AdminPlans() {
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
    try {
      const resObj = advanced ? JSON.parse(resources) : { cpu, ramMB, diskGB };
      await api.post('/plans', {
        name,
        pricePerMonth: price,
        resources: JSON.stringify(resObj),
        isActive,
      });
      setName('');
      setPrice('9.99');
      setCpu(100);
      setRamMB(2048);
      setDiskGB(20);
      setResources('{\n  "cpu": 100,\n  "ramMB": 2048,\n  "diskGB": 20\n}');
      setIsActive(true);
      await fetchPlans();
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to create plan');
    }
  };

  const toggleActive = async (id: number, current: boolean) => {
    setErr(null);
    try {
      await api.patch(`/plans/${id}`, { isActive: !current });
      await fetchPlans();
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to update plan');
    }
  };

  const updatePrice = async (id: number, newPrice: string) => {
    setErr(null);
    try {
      await api.patch(`/plans/${id}`, { pricePerMonth: newPrice });
      await fetchPlans();
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to update price');
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this plan?')) return;
    setErr(null);
    try {
      await api.delete(`/plans/${id}`);
      await fetchPlans();
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to delete plan (is it referenced by servers/subscriptions?)');
    }
  };

  return (
    <>
      <Head>
        <title>Admin • Plans</title>
      </Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-6">Admin • Plans</h1>

        {err && <div className="mb-4 text-red-400">{err}</div>}

        <section id="create-plan" className="mb-8 p-4 card">
          <h2 className="font-semibold mb-3">Create Plan</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <div className="text-sm mb-1">Name</div>
              <input value={name} onChange={e => setName(e.target.value)} className="input" />
            </label>
            <label className="block">
              <div className="text-sm mb-1">Price per month (decimal string)</div>
              <input value={price} onChange={e => setPrice(e.target.value)} className="input" />
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
              <textarea value={resources} onChange={e => setResources(e.target.value)} rows={6} className="textarea font-mono text-sm" />
            </div>
          )}

          <label className="mt-3 inline-flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            <span>Active</span>
          </label>
          <div className="mt-4">
            <button onClick={createPlan} className="btn btn-primary">Create</button>
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-3">Existing Plans</h2>
          {loading ? (
            <div>Loading...</div>
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
                      <button onClick={() => toggleActive(p.id, p.isActive)} className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600">
                        {p.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => {
                        const newPrice = prompt('New price (decimal string):', String(p.pricePerMonth));
                        if (newPrice) updatePrice(p.id, newPrice);
                      }} className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600">Edit Price</button>
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