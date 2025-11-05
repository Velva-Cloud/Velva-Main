import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import NavBar from '../components/NavBar';
import { useRequireAuth } from '../utils/guards';
import api from '../utils/api';
import { useToast } from '../components/Toast';

type Plan = {
  id: number;
  name: string;
  pricePerMonth: string;
  resources: any;
  isActive: boolean;
};

type Subscription = {
  id: number;
  planId: number;
  startDate: string;
  endDate?: string | null;
  status: 'active' | 'past_due' | 'canceled' | 'expired';
  plan?: Plan;
  nextRenewalDate?: string | Date;
  graceUntil?: string | Date | null;
};

const gbp = (v: number | string | undefined | null) => {
  if (v == null) return '—';
  const num = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(Number(num))) return '—';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(Number(num));
};

export default function Billing() {
  useRequireAuth();
  const toast = useToast();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string>('');
  const [currency, setCurrency] = useState<'GBP' | 'USD' | 'EUR'>('GBP');

  const refresh = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [plansRes, subRes] = await Promise.all([
        api.get('/plans'),
        api.get('/subscriptions/me').catch(() => ({ data: null })),
      ]);
      setPlans(plansRes.data || []);
      setSub(subRes.data);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load billing info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    let timer: any;
    const updateCountdown = () => {
      if (sub?.status === 'past_due' && sub.graceUntil) {
        const end = new Date(sub.graceUntil).getTime();
        const now = Date.now();
        const ms = end - now;
        if (ms <= 0) {
          setCountdown('0d 0h 0m');
          return;
        }
        const totalMinutes = Math.floor(ms / 60000);
        const days = Math.floor(totalMinutes / (60 * 24));
        const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
        const minutes = totalMinutes % 60;
        setCountdown(`${days}d ${hours}h ${minutes}m`);
      } else {
        setCountdown('');
      }
    };
    updateCountdown();
    timer = setInterval(updateCountdown, 30000);
    return () => clearInterval(timer);
  }, [sub?.status, sub?.graceUntil]);

  

  // Custom RAM selection per-plan (for custom plan)
  const [customGB, setCustomGB] = useState<Record<number, number>>({});

  const onSubscribe = async (planId: number, customRamGB?: number) => {
    setBusy(true);
    setErr(null);
    try {
      const payload: any = { planId };
      if (typeof customRamGB === 'number') payload.customRamGB = customRamGB;
      const res = await api.post('/subscriptions', payload);
      setSub(res.data);
      toast.show('Subscription updated', 'success');
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to subscribe';
      setErr(msg);
      toast.show(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async () => {
    if (!confirm('Cancel your subscription? Your access will remain until the end of the current period in future phases.')) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post('/subscriptions/cancel');
      toast.show('Subscription canceled', 'success');
      await refresh();
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to cancel';
      setErr(msg);
      toast.show(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  

  return (
    <>
      <Head>
        <title>Billing • VelvaCloud</title>
      </Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Billing • Choose your server size</h1>
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-400">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as any)}
              className="px-2 py-1 rounded bg-slate-800 border border-slate-700"
              aria-label="Select currency"
            >
              <option value="GBP">GBP</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
            <a href="/transactions" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 transition">Transactions</a>
          </div>
        </div>

        {err && <div className="mb-4 text-red-400">{err}</div>}

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 shadow animate-pulse">
                <div className="h-4 w-40 bg-slate-800 rounded" />
                <div className="mt-2 h-3 w-64 bg-slate-800 rounded" />
                <div className="mt-3 h-24 bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <section className="mb-8 p-6 rounded-xl bg-slate-900/60 border border-slate-800 shadow-lg">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold mb-3">Current Subscription</h2>
                {sub?.status === 'past_due' && (
                  <span className="px-3 py-1 rounded bg-amber-700 text-white">Past due</span>
                )}
              </div>
              {!sub ? (
                <div className="text-slate-400">You are not subscribed yet.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div>
                    <div className="text-sm text-slate-400">Plan</div>
                    <div className="font-semibold">
                      {(() => {
                        const resources: any = sub.plan?.resources || {};
                        const ramRange = resources?.ramRange;
                        const perGB = typeof resources?.pricePerGB === 'number' ? resources.pricePerGB : undefined;
                        if (ramRange && perGB) {
                          return (
                            <>
                              {sub.plan?.name || `Plan #${sub.planId}`} • {gbp(perGB)} per GB / mo
                            </>
                          );
                        }
                        return (
                          <>
                            {sub.plan?.name || `Plan #${sub.planId}`} • {gbp(sub.plan?.pricePerMonth)} / mo
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <div className="text-sm text-slate-400">Started on</div>
                      <div>{new Date(sub.startDate).toLocaleString()}</div>
                    </div>
                    {sub.nextRenewalDate && (
                      <div>
                        <div className="text-sm text-slate-400">Renews on</div>
                        <div>{new Date(sub.nextRenewalDate).toLocaleString()}</div>
                      </div>
                    )}
                  </div>
                  {sub.status === 'past_due' && sub.graceUntil && (
                    <div className="mt-2 p-3 rounded bg-amber-900/40 border border-amber-800">
                      <div className="text-sm text-amber-300">
                        Payment required. Your subscription will be canceled on{' '}
                        <strong>{new Date(sub.graceUntil).toLocaleString()}</strong>.
                      </div>
                      {countdown && (
                        <div className="text-xs text-amber-200 mt-1">Time remaining: {countdown}</div>
                      )}
                      <div className="mt-2">
                        <button
                          onClick={async () => {
                            try {
                              setBusy(true);
                              const res = await api.post('/billing/stripe/portal');
                              window.location.href = res.data.url;
                            } catch (e: any) {
                              const msg = e?.response?.data?.message || 'Failed to open Stripe portal';
                              toast.show(msg, 'error');
                            } finally {
                              setBusy(false);
                            }
                          }}
                          className="px-4 py-2 rounded bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:opacity-90 shadow-lg"
                          disabled={busy}
                        >
                          Update payment method
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="mt-2">
                    <button onClick={onCancel} disabled={busy} className={`px-4 py-2 rounded bg-red-600 hover:bg-red-500 transition ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>
                      Cancel subscription
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section>
              <h2 className="font-semibold mb-3">Server sizes</h2>
              {plans.length === 0 ? (
                <div className="text-slate-400">No active plans available.</div>
              ) : (
                <>
                  {/* Helpers to map plans to tiers */}
                  {(() => {
                    const ramGB = (p: Plan | null) => {
                      const mb = Number(p?.resources?.ramMB || 0);
                      return mb > 0 ? Math.round((mb / 1024) * 10) / 10 : null;
                    };
                    const pickPlanFor = (tierGB: number) => {
                      const withRam = plans
                        .map(p => ({ p, g: ramGB(p) || 0 }))
                        .filter(x => x.g > 0)
                        .sort((a, b) => a.g - b.g);
                      const exact = withRam.find(x => Math.round(x.g) === tierGB);
                      if (exact) return exact.p;
                      const above = withRam.find(x => x.g >= tierGB);
                      if (above) return above.p;
                      return withRam.length ? withRam[0].p : null;
                    };

                    const TierCard = ({ tier, highlight }: { tier: number; highlight?: boolean }) => {
                      const plan = pickPlanFor(tier);
                      const isCurrent = plan && sub?.planId === plan.id && sub?.status === 'active';
                      const price = plan ? gbp(plan.pricePerMonth) : '—';
                      const g = plan ? ramGB(plan) : null;
                      const cpu = plan ? (plan.resources?.cpu ?? null) : null;
                      const disk = plan ? (plan.resources?.diskGB ?? null) : null;

                      return (
                        <div className={`relative rounded-xl border ${highlight ? 'border-sky-700' : 'border-slate-800'} bg-slate-900/60 card p-5`}>
                          {highlight && (
                            <div className="absolute -top-3 left-4 text-xs bg-emerald-600 text-emerald-50 px-2 py-0.5 rounded-full border border-emerald-700">Most Popular</div>
                          )}
                          <div className="flex items-start justify-between">
                            <div className="text-3xl font-extrabold">
                              {tier}GB <span className="text-sm font-semibold text-slate-400">RAM</span>
                            </div>
                            {isCurrent ? <span className="px-3 py-1 rounded bg-emerald-700 text-white text-sm">Current</span> : null}
                          </div>
                          <div className="mt-1 subtle text-sm">Pro • Premium 24/7 Server</div>

                          <div className="mt-4">
                            <button
                              className="btn btn-primary w-full"
                              onClick={() => plan && onSubscribe(plan.id)}
                              disabled={busy || !plan}
                            >
                              {sub ? 'Switch' : 'Start Free Trial'}
                            </button>
                          </div>

                          <div className="mt-4 border-t border-slate-800 pt-3 space-y-2 text-sm">
                            <div className="pt-2 flex justify-center">
                              <img src="https://velvacloud.com/logo.png" alt="Power tier" className="h-20 w-auto opacity-80 mx-auto" />
                            </div>
                            <div className="font-semibold text-center">{tier}GB RAM</div>
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-slate-300">Price:</span>
                              <span className="font-semibold">{price}/mo</span>
                            </div>
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-slate-300">Includes:</span>
                              <span className="font-semibold">{g ? `${g}GB` : `${tier}GB`} RAM{cpu ? ` • ${cpu} CPU` : ''}{disk ? ` • ${disk}GB SSD` : ''}</span>
                            </div>
                            {!isCurrent && plan && (
                              <div className="pt-2">
                                <button
                                  onClick={async () => {
                                    try {
                                      setBusy(true);
                                      const payload: any = { planId: plan.id, currency: currency.toLowerCase() };
                                      const res = await api.post('/billing/stripe/checkout', payload);
                                      window.location.href = res.data.url;
                                    } catch (e: any) {
                                      const msg = e?.response?.data?.message || 'Failed to create Stripe session';
                                      toast.show(msg, 'error');
                                    } finally {
                                      setBusy(false);
                                    }
                                  }}
                                  className="px-4 py-2 rounded border border-indigo-700/40 hover:bg-indigo-900/30 transition shadow w-full"
                                  disabled={busy}
                                >
                                  Subscribe with Stripe
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    };

                    // Custom slider card
                    const CustomCard = () => {
                      const customPlan = plans.find(p => !!p?.resources?.ramRange);
                      // per-GB from explicit custom price or median of plan ratios
                      let perGb: number | null = null;
                      if (customPlan && typeof customPlan.resources?.pricePerGB === 'number') perGb = Number(customPlan.resources.pricePerGB);
                      if (perGb == null) {
                        const ratios = plans
                          .map(p => {
                            const mb = Number(p?.resources?.ramMB || 0);
                            const g = mb > 0 ? mb / 1024 : 0;
                            const price = Number(p.pricePerMonth);
                            if (g <= 0 || !isFinite(price) || price <= 0) return null;
                            return price / g;
                          })
                          .filter((x): x is number => typeof x === 'number') as number[];
                        const sorted = ratios.sort((a, b) => a - b);
                        perGb = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 2.5;
                      }
                      const minGB = 32, maxGB = 256;
                      const selected = customGB[-1] ?? minGB;
                      const price = gbp(selected * (perGb ?? 2.5));

                      return (
                        <div className="relative rounded-xl border border-slate-800 bg-slate-900/60 card p-5">
                          <div className="text-2xl font-extrabold">Build Your Own Server</div>
                          <div className="mt-1 subtle text-sm">{minGB}GB+ RAM • Fully Custom</div>

                          <div className="mt-4">
                            <div className="flex items-center justify-between text-sm">
                              <span className="subtle">RAM</span>
                              <span className="font-semibold">{selected} GB</span>
                            </div>
                            <input
                              type="range"
                              min={minGB}
                              max={maxGB}
                              step={1}
                              value={selected}
                              onChange={(e) => setCustomGB(prev => ({ ...prev, [-1]: Number(e.target.value) }))}
                              className="w-full mt-2 appearance-none h-2 rounded bg-slate-800 outline-none accent-cyan-500"
                            />
                            <div className="flex justify-between text-[11px] mt-1 text-slate-400">
                              <span>{minGB}GB</span>
                              <span>{maxGB}GB</span>
                            </div>
                          </div>

                          <div className="mt-3 text-3xl font-extrabold heading-gradient">{price}<span className="text-base text-slate-400"> / mo</span></div>

                          <div className="mt-3">
                            <button
                              className="btn btn-primary w-full"
                              onClick={() => onSubscribe(plans[0]?.id || 0, selected)}
                              disabled={busy}
                            >
                              {sub ? 'Switch' : 'Get Started'}
                            </button>
                          </div>

                          <div className="mt-4 border-t border-slate-800 pt-3 space-y-2 text-sm">
                            <div className="pt-2 flex justify-center">
                              <img src="https://velvacloud.com/logo.png" alt="Custom power" className="h-20 w-auto opacity-80 mx-auto" />
                            </div>
                            <div className="font-semibold text-center">{minGB}GB - {maxGB}GB RAM</div>
                            <div className="text-center">Choose your size, storage and location. Great for large worlds and communities.</div>
                            <div className="pt-2">
                              <button
                                onClick={async () => {
                                  try {
                                    setBusy(true);
                                    const payload: any = { planId: plans[0]?.id || 0, currency: currency.toLowerCase(), customRamGB: selected };
                                    const res = await api.post('/billing/stripe/checkout', payload);
                                    window.location.href = res.data.url;
                                  } catch (e: any) {
                                    const msg = e?.response?.data?.message || 'Failed to create Stripe session';
                                    toast.show(msg, 'error');
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                                className="px-4 py-2 rounded border border-indigo-700/40 hover:bg-indigo-900/30 transition shadow w-full"
                                disabled={busy}
                              >
                                Subscribe with Stripe
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    };

                    return (
                      <div className="grid gap-6 lg:grid-cols-3">
                        <TierCard tier={4} highlight />
                        <TierCard tier={8} />
                        <TierCard tier={16} />
                        <TierCard tier={32} />
                        <CustomCard />
                      </div>
                    );
                  })()}
                </>
              )}
            </section>

            <div className="mt-8">
              <button
                onClick={async () => {
                  try {
                    setBusy(true);
                    const res = await api.post('/billing/stripe/portal');
                    window.location.href = res.data.url;
                  } catch (e: any) {
                    const msg = e?.response?.data?.message || 'Failed to open Stripe portal';
                    toast.show(msg, 'error');
                  } finally {
                    setBusy(false);
                  }
                }}
                className="px-4 py-2 rounded border border-slate-800 hover:bg-slate-800 transition"
                disabled={busy}
              >
                Manage billing (Stripe)
              </button>
            </div>
          </>
        )}
      </main>
    </>
  );
}