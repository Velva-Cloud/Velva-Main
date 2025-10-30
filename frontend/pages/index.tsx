import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import NavBar from '../components/NavBar';

type Plan = {
  id: number;
  name: string;
  pricePerMonth: string | number;
  resources: Record<string, any>;
};

const gbp = (v: number | string | undefined | null) => {
  if (v == null) return '—';
  const num = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(Number(num))) return '—';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(Number(num));
};

function ramGB(plan?: Plan) {
  const mb = Number(plan?.resources?.ramMB || 0);
  return mb > 0 ? Math.round((mb / 1024) * 10) / 10 : null;
}

function pickPlanFor(tierGB: number, plans: Plan[]): Plan | null {
  // Prefer exact match by GB, else closest above, else closest overall
  const withRam = plans
    .map(p => ({ p, g: ramGB(p) || 0 }))
    .filter(x => x.g > 0)
    .sort((a, b) => a.g - b.g);
  const exact = withRam.find(x => Math.round(x.g) === tierGB);
  if (exact) return exact.p;
  const above = withRam.find(x => x.g >= tierGB);
  if (above) return above.p;
  return withRam.length ? withRam[0].p : null;
}

function PlanCard({ plan, label, highlight }: { plan: Plan | null; label: string; highlight?: boolean }) {
  const price = plan ? gbp(plan.pricePerMonth) : '—';
  const g = plan ? ramGB(plan) : null;
  const cpu = plan ? (plan.resources?.cpu ?? null) : null;
  const disk = plan ? (plan.resources?.diskGB ?? null) : null;

  return (
    <div className={`relative rounded-xl border ${highlight ? 'border-sky-700' : 'border-slate-800'} bg-slate-900/60 card p-5`}>
      {highlight && (
        <div className="absolute -top-3 left-4 text-xs bg-emerald-600 text-emerald-50 px-2 py-0.5 rounded-full border border-emerald-700">Most Popular</div>
      )}
      <div className="text-3xl font-extrabold">
        {label.toUpperCase()} <span className="text-sm font-semibold text-slate-400">RAM</span>
      </div>
      <div className="mt-1 subtle text-sm">Pro • Premium 24/7 Server</div>

      <div className="mt-4">
        <a className="btn btn-primary w-full" href="/register">Start Free Trial</a>
      </div>

      <div className="mt-4 border-t border-slate-800 pt-3 space-y-2 text-sm">
        <div className="font-semibold">{label} RAM</div>
        <div className="flex items-center gap-1">
          <span className="text-slate-300">Price:</span>
          <span className="font-semibold">{price}/mo</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-300">Includes:</span>
          <span className="font-semibold">{g ? `${g}GB` : label} RAM{cpu ? ` • ${cpu} CPU` : ''}{disk ? ` • ${disk}GB SSD` : ''}</span>
        </div>
        {/* Placeholder power image (logo for now) */}
        <div className="pt-2">
          <img src="https://velvacloud.com/logo.png" alt="Power tier" className="h-10 w-auto opacity-80" />
        </div>
      </div>
    </div>
  );
}

function CustomCard() {
  return (
    <div className="relative rounded-xl border border-slate-800 bg-slate-900/60 card p-5">
      <div className="text-2xl font-extrabold">Build Your Own Server</div>
      <div className="mt-1 subtle text-sm">32GB+ RAM • Save & Swap Instances • Fully Custom</div>
      <div className="mt-4">
        <a className="btn btn-primary w-full" href="/register">Get Started</a>
      </div>
      <div className="mt-4 border-t border-slate-800 pt-3 space-y-2 text-sm">
        <div className="font-semibold">32GB - 256GB RAM</div>
        <div>Choose your size, storage and location. Great for large worlds and communities.</div>
        <div className="pt-2">
          <img src="https://velvacloud.com/logo.png" alt="Custom power" className="h-10 w-auto opacity-80" />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    api.get('/plans').then((res) => setPlans(res.data));
  }, []);

  const tierPlans = useMemo(() => {
    const tiers = [4, 8, 16, 32];
    const picks = tiers.map(gb => ({ gb, plan: pickPlanFor(gb, plans) }));
    return picks;
  }, [plans]);

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
            <a className="btn border border-slate-700 hover:bg-slate-800" href="#plans">View packages</a>
          </div>

          {/* Decorative gradients */}
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-50">
            <div className="absolute -top-20 left-10 h-64 w-64 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle at 30% 30%, rgba(109,40,217,0.3), transparent 60%)' }} />
            <div className="absolute top-20 right-10 h-64 w-64 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle at 70% 30%, rgba(6,182,212,0.25), transparent 60%)' }} />
          </div>
        </section>

        {/* Preset packages + custom */}
        <section id="plans" className="grid xl:grid-cols-5 lg:grid-cols-4 sm:grid-cols-2 gap-6">
          {tierPlans.map((t, idx) => (
            <PlanCard key={t.gb} plan={t.plan} label={`${t.gb}GB`} highlight={t.gb === 4} />
          ))}
          <CustomCard />
        </section>

        {/* Fallback if API has no plans at all */}
        {plans.length === 0 && (
          <section className="mt-10">
            <div className="col-span-full card p-10 text-center relative overflow-hidden">
              <div className="absolute inset-0 -z-10 opacity-40" style={{ background: 'radial-gradient(500px 200px at 20% 0%, rgba(109,40,217,0.25), transparent 60%), radial-gradient(500px 200px at 80% 100%, rgba(6,182,212,0.25), transparent 60%)' }} />
              <img src="https://velvacloud.com/logo.png" alt="VelvaCloud" className="mx-auto h-16 w-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No plans found</h3>
              <p className="subtle mb-5">You can still create an account and build your own server size.</p>
              <div className="flex items-center justify-center gap-3">
                <a href="/register" className="btn btn-primary">Get Started</a>
                <a href="/admin/plans" className="btn border border-slate-700 hover:bg-slate-800">Admin: Create plans</a>
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}