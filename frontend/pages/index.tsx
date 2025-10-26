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
      <main className="container px-6 py-16">
        {/* Hero */}
        <section className="relative text-center mb-16">
          <div className="animate-fadeUp inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs mb-4">
            <span className="subtle">VelvaCloud</span>
          </div>
          <h1 className="animate-fadeUp text-5xl md:text-6xl font-extrabold leading-tight heading-gradient">
            Build. Deploy. Scale.
          </h1>
          <p className="animate-fadeUp mt-4 subtle max-w-2xl mx-auto">
            Simple plans. Clean dashboard. Lightning-fast hosting that feels delightful to use.
          </p>
          <div className="animate-fadeUp mt-8 flex items-center justify-center gap-3">
            <a className="btn btn-primary" href="/register">Get started</a>
            <a className="btn border border-slate-700 hover:bg-slate-800" href="#plans">View plans</a>
          </div>

          {/* Decorative gradients */}
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-50">
            <div className="absolute -top-20 left-10 h-64 w-64 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle at 30% 30%, rgba(109,40,217,0.3), transparent 60%)' }} />
            <div className="absolute top-20 right-10 h-64 w-64 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle at 70% 30%, rgba(6,182,212,0.25), transparent 60%)' }} />
          </div>
        </section>

        {/* Plans */}
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
              <div key={p.id} className="card p-6 rounded-xl">
                <div className="text-sm uppercase tracking-wide subtle">Server plan</div>
                <div className="mt-1 font-semibold text-lg">
                  {isCustom ? 'Custom RAM' : (ramGB ? `${ramGB} GB RAM` : p.name)}
                </div>
                <div className="mt-2 text-3xl font-extrabold heading-gradient">
                  {isCustom ? (perGB ? `${gbp(perGB)} per GB / mo` : 'Custom') : `${gbp(p.pricePerMonth)} / mo`}
                </div>

                <div className="mt-4 text-sm subtle">
                  {isCustom ? (
                    <>
                      Choose {minGB}–{maxGB} GB RAM. Install supported games after creating your server.
                    </>
                  ) : (
                    <>
                      {ramGB ? `${ramGB} GB RAM` : ''}{cpu ? ` • ${cpu} CPU` : ''}{disk ? ` • ${disk} GB SSD` : ''}
                    </>
                  )}
                </div>

                <a href="/register" className="btn btn-primary w-full mt-5">Select</a>
              </div>
            );
          })}
          {plans.length === 0 && (
            <div className="col-span-full card p-10 text-center relative overflow-hidden">
              <div className="absolute inset-0 -z-10 opacity-40" style={{ background: 'radial-gradient(500px 200px at 20% 0%, rgba(109,40,217,0.25), transparent 60%), radial-gradient(500px 200px at 80% 100%, rgba(6,182,212,0.25), transparent 60%)' }} />
              <img src="https://velvacloud.com/logo.png" alt="VelvaCloud" className="mx-auto h-16 w-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No plans available yet</h3>
              <p className="subtle mb-5">Check back soon, or sign in as an admin to create plans.</p>
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