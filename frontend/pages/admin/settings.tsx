import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRequireAdmin } from '../../utils/guards';
import api from '../../utils/api';
import { useToast } from '../../components/Toast';
import AdminLayout from '../../components/AdminLayout';
import FormField from '../../components/FormField';

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

  const [billingGraceDays, setBillingGraceDays] = useState<number>(3);

  const [testTo, setTestTo] = useState('');

  const fetchSettings = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [mailRes, billingRes] = await Promise.all([
        api.get('/settings/mail'),
        api.get('/settings/billing').catch(() => ({ data: { graceDays: 3 } })),
      ]);
      const data = mailRes.data || {};
      setMail({
        host: data.host || '',
        port: data.port || 587,
        secure: !!data.secure,
        user: data.user || '',
        pass: data.pass || '',
        fromEmail: data.fromEmail || '',
        fromName: data.fromName || '',
      });
      setBillingGraceDays(Number(billingRes.data?.graceDays || 3));
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
      await Promise.all([
        api.post('/settings/mail', {
          ...mail,
          port: Number(mail.port),
          secure: !!mail.secure,
          user: mail.user || undefined,
          pass: mail.pass || undefined,
          fromName: mail.fromName || undefined,
        }),
        api.post('/settings/billing', { graceDays: Number(billingGraceDays || 3) }),
      ]);
      toast.show('Settings saved', 'success');
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to save settings';
      setErr(msg);
      toast.show(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testTo.trim()) {
      toast.show('Enter a recipient email', 'error');
      return;
    }
    try {
      await api.post('/settings/mail/test', { to: testTo.trim() });
      toast.show('Test email sent (if SMTP is configured correctly)', 'success');
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to send test email';
      toast.show(msg, 'error');
    }
  };

  return (
    <>
      <Head>
        <title>Admin • Settings</title>
      </Head>
      <AdminLayout title="Admin • Settings">
        {err && <div className="mb-4 text-red-400">{err}</div>}

        <section className="card p-4 mb-6">
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
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Host">
                  <input className="input" value={mail.host} onChange={e => setMail(m => ({ ...m, host: e.target.value }))} placeholder="mail.example.com" />
                </FormField>
                <FormField label="Port">
                  <input className="input" type="number" value={mail.port} onChange={e => setMail(m => ({ ...m, port: Number(e.target.value) }))} placeholder="587" />
                </FormField>
                <FormField label="Secure (TLS)">
                  <select className="input" value={mail.secure ? '1' : '0'} onChange={e => setMail(m => ({ ...m, secure: e.target.value === '1' }))}>
                    <option value="0">No</option>
                    <option value="1">Yes</option>
                  </select>
                </FormField>
                <div />
                <FormField label="Username">
                  <input className="input" value={mail.user || ''} onChange={e => setMail(m => ({ ...m, user: e.target.value }))} placeholder="user@example.com" />
                </FormField>
                <FormField label="Password">
                  <input className="input" type="password" value={mail.pass || ''} onChange={e => setMail(m => ({ ...m, pass: e.target.value }))} placeholder="••••••••" />
                </FormField>
                <FormField label="From email">
                  <input className="input" value={mail.fromEmail} onChange={e => setMail(m => ({ ...m, fromEmail: e.target.value }))} placeholder="no-reply@example.com" />
                </FormField>
                <FormField label="From name (optional)">
                  <input className="input" value={mail.fromName || ''} onChange={e => setMail(m => ({ ...m, fromName: e.target.value }))} placeholder="VelvaCloud" />
                </FormField>

                <div className="md:col-span-2 mt-2 flex flex-wrap items-center gap-2">
                  <button onClick={save} disabled={saving} className={`btn btn-primary ${saving ? 'opacity-70 cursor-not-allowed' : ''}`}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <div className="flex items-center gap-2">
                    <input className="input" placeholder="Test recipient" value={testTo} onChange={e => setTestTo(e.target.value)} />
                    <button onClick={sendTest} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Send test</button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="card p-4">
          <h2 className="font-semibold mb-3">Billing</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Grace period (days)">
              <input className="input" type="number" min={1} max={60} value={billingGraceDays} onChange={e => setBillingGraceDays(Number(e.target.value))} />
            </FormField>
          </div>
          <div className="mt-3">
            <button onClick={save} disabled={saving} className={`btn btn-primary ${saving ? 'opacity-70 cursor-not-allowed' : ''}`}>Save</button>
          </div>
        </section>
      </AdminLayout>
    </>
  );
}