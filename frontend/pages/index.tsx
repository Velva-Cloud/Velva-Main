import Head from 'next/head';
import { useEffect, useState } from 'react';
import api from '../utils/api';
import NavBar from '../components/NavBar';

type Plan = {
  id: number;
  name: string;
  pricePerMonth: string;
  resources: Record<string, any>;
};

export default function Home() {
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    api.get('/plans').then((res) => setPlans(res.data));
  }, []);

  return (
    <>
      <Head>
        <title>HostX - Game & App Hosting</title>
      </Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-12">
        <section className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-2">Fast, Reliable Hosting</h1>
          <p className="text-slate-300">Simple plans, instant server creation (mock in MVP).</p>
        </section>

        <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((p) => (
            <div key={p.id} className="rounded-lg border border-slate-800 bg-slate-900 p-5">
              <h3 className="text-xl font-semibold mb-2">{p.name}</h3>
              <p className="text-2xl font-bold mb-2">${p.pricePerMonth}/mo</p>
              <pre className="text-xs bg-slate-800 p-2 rounded mb-4 overflow-auto">{JSON.stringify(p.resources, null, 2)}</pre>
              <a href="/register" className="block text-center bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded">Get Started</a>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}