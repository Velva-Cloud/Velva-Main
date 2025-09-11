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
          <a href="/transactions" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 transition">Transactions</a>
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
                      {sub.plan?.name || `Plan #${sub.planId}`} • {gbp(sub.plan?.pricePerMonth)} / mo
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
                <div className="grid gap-6 md:grid-cols-2">
                  {plans.map((p) => {
                    const isCurrent = sub?.planId === p.id && sub?.status === 'active';
                    const ramMB = Number(p?.resources?.ramMB) || 0;
                    const ramGB = ramMB ? Math.round((ramMB / 1024) * 10) / 10 : null;
                    const cpu = p?.resources?.cpu;
                    const disk = p?.resources?.diskGB;

                    const ramRange = p?.resources?.ramRange;
                    const isCustom = !!ramRange;
                    const minGB = isCustom ? Math.round((ramRange.minMB || 0) / 1024) : null;
                    const maxGB = isCustom ? Math.round((ramRange.maxMB || 0) / 1024) : null;
                    const perGB = isCustom ? (p?.resources?.pricePerGB ?? null) : null;

                    const selectedGB = isCustom
                      ? (customGB[p.id] ?? (minGB || 32))
                      : ramGB;

                    const estimated = isCustom && perGB && selectedGB ? perGB * selectedGB : null;

                    return (
                      <div
                        key={p.id}
                        className="p-6 rounded-xl bg-slate-900/70 border border-slate-800 shadow-lg hover:shadow-xl hover:shadow-indigo-500/10 transition-transform duration-200 hover:-translate-y-0.5"
                      >
                        <div className="flex items-start justify-between gap-5">
                          <div>
                            <div className="text-sm uppercase tracking-wide text-slate-400">Server plan</div>
                            <div className="mt-1 font-semibold text-lg">
                              {isCustom ? 'Custom RAM' : (ramGB ? `${ramGB} GB RAM` : p.name)}
                            </div>
                            <div className="mt-2 text-3xl font-extrabold bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent drop-shadow">
                              {isCustom ? (estimated ? `${gbp(estimated)} / mo` : `From ${gbp(((minGB || 32) * (perGB || 0)))}/mo`) : `${gbp(p.pricePerMonth)} / mo`}
                            </div>
                          </div>
                          {isCurrent ? (
                            <span className="px-3 py-1 rounded bg-emerald-700 text-white text-sm self-start">Current</span>
                          ) : null}
                        </div>

                        {/* Feature list */}
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

                        {/* Custom slider */}
                        {isCustom && (
                          <div className="mt-5">
                            <label htmlFor={`ram-${p.id}`} className="text-sm text-slate-400">
                              Select RAM: <span className="font-semibold text-slate-200">{selectedGB} GB</span>
                            </label>
                            <input
                              id={`ram-${p.id}`}
                              type="range"
                              min={minGB || 32}
                              max={maxGB || 128}
                              step={1}
                              value={selectedGB || (minGB || 32)}
                              onChange={(e) => setCustomGB((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))}
                              className="w-full mt-2 accent-indigo-500"
                            />
                            {perGB ? (
                              <div className="mt-1 text-sm text-slate-400">
                                Estimated: <span className="font-semibold text-slate-200">{gbp((selectedGB || 0) * perGB)} / mo</span>
                              </div>
                            ) : null}
                          </div>
                        )}

                        {/* CTAs */}
                        <div className="flex flex-wrap gap-3 mt-6">
                          {!isCurrent && (
                            <button
                              onClick={() => onSubscribe(p.id, isCustom ? selectedGB || minGB || 32 : undefined)}
                              disabled={busy}
                              className={`px-4 py-2 rounded bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white shadow-lg hover:opacity-90 transition ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                              {sub ? 'Switch' : 'Subscribe'}
                            </button>
                          )}

                          {/* Stripe CTA hidden for custom until per-GB Stripe flow is implemented */}
                          {!isCustom && (
                            <button
                              onClick={async () => {
                                try {
                                  setBusy(true);
                                  const res = await api.post('/billing/stripe/checkout', { planId: p.id });
                                  window.location.href = res.data.url;
                                } catch (e: any) {
                                  const msg = e?.response?.data?.message || 'Failed to create Stripe session';
                                  toast.show(msg, 'error');
                                } finally {
                                  setBusy(false);
                                }
                              }}
                              className="px-4 py-2 rounded border border-indigo-700/40 hover:bg-indigo-900/30 transition shadow"
                              disabled={busy}
                            >
                              Subscribe with Stripe
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
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