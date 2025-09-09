import Head from 'next/head';
import { useEffect, useState } from 'react';
import api from '../utils/api';
import NavBar from '../components/NavBar';

type Server = {
  id: number;
  name: string;
  status: string;
  planId: number;
};

type Plan = {
  id: number;
  name: string;
};

export default function Dashboard() {
  const [servers, setServers] = useState<Server[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState('');
  const [planId, setPlanId] = useState<number | ''>('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get('/servers')
      .then(res => setServers(res.data))
      .catch(() => setServers([]));

    api.get('/plans')
      .then(res => {
        const list = res.data as any[];
        setPlans(list.map(p => ({ id: p.id, name: p.name })));
        if (list.length > 0) setPlanId(list[0].id);
      })
      .catch(() => setPlans([]));
  }, []);

  const createServer = async () => {
    setErr(null);
    try {
      if (!planId) {
        setErr('Please select a plan');
        return;
      }
      const res = await api.post('/servers', { name, planId });
      setServers([res.data, ...servers]);
      setName('');
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to create server');
    }
  };

  return (
    <>
      <Head>
        <title>Dashboard - HostX</title>
      </Head>
      <NavBar />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-6">Your Servers</h1>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Server name"
            className="px-3 py-2 rounded bg-slate-800 border border-slate-700"
          />
          <select
            value={planId}
            onChange={e => setPlanId(Number(e.target.value))}
            className="px-3 py-2 rounded bg-slate-800 border border-slate-700"
          >
            {plans.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button onClick={createServer} className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded">Create (mock)</button>
          {err && <div className="text-red-400 w-full">{err}</div>}
        </div>

        <ul className="space-y-3">
          {servers.map(s => (
            <li key={s.id} className="p-4 bg-slate-900 rounded border border-slate-800">
              <div className="font-semibold">{s.name}</div>
              <div className="text-sm text-slate-300">Status: {s.status} • Plan #{s.planId}</div>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}