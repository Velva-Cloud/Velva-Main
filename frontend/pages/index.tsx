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
        <title>VelvaCloud — Simple, Fast Hosting</title>
        <meta name="description" content="VelvaCloud — lightning-fast hosting with simple plans. Get started in minutes." />
      </Head>
      <NavBar />
      <main className="max-w-6xl mx-auto px-6 py-16">
        <section className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/60 border border-slate-700 text-xs mb-4">
            <span>☁️</span>
            <span className="text-slate-300">VelvaCloud</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold leading-tight">
            Build and scale with <span className="text-sky-400">Velva</span><span className="text-white">Cloud</span>
          </h1>
          <p className="mt-4 text-slate-300 max-w-2xl mx-auto">
            Simple plans. Clean dashboard. Mock server provisioning for the MVP—real provisioning coming soon.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <a className="btn btn-primary" href="/register">Get started</a>
            <a className="btn border border-slate-700 hover:bg-slate-800" href="#plans">View plans</a>
          </div>
        </section>

        <section id="plans" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((p) => (
            <div key={p.id} className="card p-5">
              <h3 className="text-xl font-semibold mb-1">{p.name}</h3>
              <p className="text-3xl font-extrabold mb-2">${p.pricePerMonth}<span className="text-base text-slate-400">/mo</span></p>
              <pre className="text-xs bg-slate-800/70 p-2 rounded mb-4 overflow-auto">{JSON.stringify(p.resources, null, 2)}</pre>
              <a href="/register" className="btn btn-primary w-full">Select</a>
            </div>
          ))}
          {plans.length === 0 && (
            <div className="col-span-full text-center text-slate-400">No plans yet. Sign in as admin and create some.</div>
          )}
        </section>
      </main>
    </>
  );
}