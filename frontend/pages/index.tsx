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

const gbp = (v: number | string | undefined | null) => {
  if (v == null) return '—';
  const num = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(Number(num))) return '—';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(Number(num));
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
          {plans.map((p) => {
            const ramMB = Number((p as any)?.resources?.ramMB) || 0;
            const ramGB = ramMB ? Math.round((ramMB / 1024) * 10) / 10 : null;
            const cpu = (p as any)?.resources?.cpu;
            const disk = (p as any)?.resources?.diskGB;

            const ramRange = (p as any)?.resources?.ramRange;
            const isCustom = !!ramRange;
            const minGB = isCustom ? Math.round((ramRange.minMB || 0) / 1024) : null;
            const maxGB = isCustom ? Math.round((ramRange.maxMB || 0) / 1024) : null;
            const perGB = isCustom ? ((p as any)?.resources?.pricePerGB ?? null) : null;

            return (
              <div key={p.id} className="p-6 rounded-xl bg-slate-900/70 border border-slate-800 shadow-lg">
                <div className="text-sm uppercase tracking-wide text-slate-400">Server plan</div>
                <div className="mt-1 font-semibold text-lg">
                  {isCustom ? 'Custom RAM' : (ramGB ? `${ramGB} GB RAM` : p.name)}
                </div>
                <div className="mt-2 text-3xl font-extrabold bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent drop-shadow">
                  {isCustom ? (perGB ? `${gbp(perGB)} per GB / mo` : 'Custom') : `${gbp(p.pricePerMonth)} / mo`}
                </div>

                <ul className="mt-4 space-y-2 text-sm text-slate-300">
                  {isCustom ? (
                    <>
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                        Choose {minGB}–{maxGB} GB RAM
                      </li>
                      {perGB ? (
                        <li className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                          {gbp(perGB)} per GB per month
                        </li>
                      ) : null}
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                        Install any supported game after creating your server
                      </li>
                    </>
                  ) : (
                    <>
                      {ramGB ? (
                        <li className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                          {ramGB} GB RAM
                        </li>
                      ) : null}
                      {cpu ? (
                        <li className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                          {cpu} CPU units
                        </li>
                      ) : null}
                      {disk ? (
                        <li className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                          {disk} GB SSD
                        </li>
                      ) : null}
                      <li className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                        Install any supported game after creating your server
                      </li>
                    </>
                  )}
                </ul>

                <a href="/register" className="btn btn-primary w-full mt-5">Select</a>
              </div>
            );
          })}
          {plans.length === 0 && (
            <div className="col-span-full card p-10 text-center relative overflow-hidden">
              <div
                className="absolute inset-0 -z-10 opacity-40"
                style={{
                  background:
                    'radial-gradient(500px 200px at 20% 0%, rgba(109,40,217,0.25), transparent 60%), radial-gradient(500px 200px at 80% 100%, rgba(6,182,212,0.25), transparent 60%)',
                }}
              />
              <img src="https://velvacloud.com/logo.png" alt="VelvaCloud" className="mx-auto h-16 w-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No plans available yet</h3>
              <p className="text-slate-400 mb-5">Check back soon, or sign in as an admin to create plans.</p>
              <div className="flex items-center justify-center gap-3">
                <a href="/login" className="btn border border-slate-700 hover:bg-slate-800">Sign in</a>
                <a href="/admin/plans" className="btn btn-primary">Create plans</a>
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}