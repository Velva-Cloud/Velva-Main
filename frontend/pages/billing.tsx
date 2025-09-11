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
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Billing • Choose your server size</h1>
          <a href="/transactions" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Transactions</a>
        </div>

        {err && <div className="mb-4 text-red-400">{err}</div>}

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
        ) : (
          <>
            <section className="mb-8 p-4 card">
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
                      {sub.plan?.name || `Plan #${sub.planId}`} • ${sub.plan?.pricePerMonth ?? '-'} / mo
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
                          className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500"
                          disabled={busy}
                        >
                          Update payment method
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="mt-2">
                    <button onClick={onCancel} disabled={busy} className={`px-3 py-1 rounded bg-red-600 hover:bg-red-500 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>
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
                <div className="grid gap-3 md:grid-cols-2">
                  {plans.map((p) => {
                    const isCurrent = sub?.planId === p.id && sub?.status === 'active';
                    const ramMB = Number(p?.resources?.ramMB) || 0;
                    const ramGB = ramMB ? Math.round((ramMB / 1024) * 10) / 10 : null;
                    const cpu = p?.resources?.cpu;
                    const disk = p?.resources?.diskGB;
                    return (
                      <div key={p.id} className="p-4 card">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold">
                              {ramGB ? `${ramGB} GB RAM` : p.name}
                            </div>
                            <div className="text-sm text-slate-400">${p.pricePerMonth} / mo</div>
                          </div>
                          {isCurrent ? (
                            <span className="px-3 py-1 rounded bg-emerald-700 text-white">Current</span>
                          ) : (
                            <button
                              onClick={() => onSubscribe(p.id)}
                              disabled={busy}
                              className={`px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                              {sub ? 'Switch' : 'Subscribe'}
                            </button>
                          )}
                        </div>
                        <div className="mt-2 text-sm text-slate-300">
                          <div className="flex flex-wrap gap-3">
                            {ramGB ? <span>{ramGB} GB RAM</span> : null}
                            {cpu ? <span>{cpu} CPU units</span> : null}
                            {disk ? <span>{disk} GB SSD</span> : null}
                          </div>
                          <div className="text-slate-400 mt-1">Install any supported game after creating your server.</div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
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
                            className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500"
                            disabled={busy}
                          >
                            Subscribe with Stripe
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="mt-6">
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
                className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800"
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