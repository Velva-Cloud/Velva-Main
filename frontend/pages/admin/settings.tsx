import Head from 'next/head';
import { useEffect, useState } from 'react';
import NavBar from '../../components/NavBar';
import { useRequireAdmin } from '../../utils/guards';
import SystemStatus from '../../components/SystemStatus';
import api from '../../utils/api';
import { useToast } from '../../components/Toast';

type MailSettings = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  fromEmail: string;
  fromName?: string;
};

export default function AdminSettings() {
  useRequireAdmin();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [mail, setMail] = useState<MailSettings>({
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    fromEmail: '',
    fromName: '',
  });

  const fetchSettings = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get('/settings/mail');
      const data = res.data || {};
      setMail({
        host: data.host || '',
        port: data.port || 587,
        secure: !!data.secure,
        user: data.user || '',
        pass: data.pass || '',
        fromEmail: data.fromEmail || '',
        fromName: data.fromName || '',
      });
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await api.post('/settings/mail', {
        ...mail,
        port: Number(mail.port),
        secure: !!mail.secure,
        user: mail.user || undefined,
        pass: mail.pass || undefined,
        fromName: mail.fromName || undefined,
      });
      toast.show('Settings saved', 'success');
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to save settings';
      setErr(msg);
      toast.show(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin • Settings</title>
      </Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Admin • Settings</h1>
          <div className="w-full max-w-sm ml-4">
            <SystemStatus />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <a href="/admin/plans" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Plans</a>
          <a href="/admin/nodes" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Nodes</a>
          <a href="/admin/users" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Users</a>
          <a href="/admin/logs" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Logs</a>
          <a href="/admin/transactions" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Transactions</a>
          <a href="/admin/settings" className="px-3 py-1 rounded border border-slate-700 bg-slate-800/60">Settings</a>
        </div>

        {err && <div className="mb-4 text-red-400">{err}</div>}

        <section className="card p-4">
          <h2 className="font-semibold mb-3">Email (SMTP)</h2>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-4 card animate-pulse">
                  <div className="h-4 w-40 bg-slate-800 rounded" />
                  <div className="mt-2 h-3 w-64 bg-slate-800 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="text-sm mb-1">Host</div>
                <input className="input" value={mail.host} onChange={e => setMail(m => ({ ...m, host: e.target.value }))} placeholder="mail.example.com" />
              </label>
              <label className="block">
                <div className="text-sm mb-1">Port</div>
                <input className="input" type="number" value={mail.port} onChange={e => setMail(m => ({ ...m, port: Number(e.target.value) }))} placeholder="587" />
              </label>
              <label className="block">
                <div className="text-sm mb-1">Secure (TLS)</div>
                <select className="input" value={mail.secure ? '1' : '0'} onChange={e => setMail(m => ({ ...m, secure: e.target.value === '1' }))}>
                  <option value="0">No</option>
                  <option value="1">Yes</option>
                </select>
              </label>
              <div />
              <label className="block">
                <div className="text-sm mb-1">Username</div>
                <input className="input" value={mail.user || ''} onChange={e => setMail(m => ({ ...m, user: e.target.value }))} placeholder="user@example.com" />
              </label>
              <label className="block">
                <div className="text-sm mb-1">Password</div>
                <input className="input" type="password" value={mail.pass || ''} onChange={e => setMail(m => ({ ...m, pass: e.target.value }))} placeholder="••••••••" />
              </label>
              <label className="block">
                <div className="text-sm mb-1">From email</div>
                <input className="input" value={mail.fromEmail} onChange={e => setMail(m => ({ ...m, fromEmail: e.target.value }))} placeholder="no-reply@example.com" />
              </label>
              <label className="block">
                <div className="text-sm mb-1">From name (optional)</div>
                <input className="input" value={mail.fromName || ''} onChange={e => setMail(m => ({ ...m, fromName: e.target.value }))} placeholder="VelvaCloud" />
              </label>

              <div className="md:col-span-2 mt-2">
                <button onClick={save} disabled={saving} className={`btn btn-primary ${saving ? 'opacity-70 cursor-not-allowed' : ''}`}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}