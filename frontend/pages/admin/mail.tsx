import Head from 'next/head';
import { useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import FormField from '../../components/FormField';
import { useRequireAdmin } from '../../utils/guards';
import api from '../../utils/api';
import { useToast } from '../../components/Toast';

export default function AdminMail() {
  useRequireAdmin();
  const toast = useToast();

  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('<p>Hello from VelvaCloud</p>');
  const [text, setText] = useState('');
  const [fromKind, setFromKind] = useState<'default' | 'support' | 'no_reply'>('support');
  const [fromLocal, setFromLocal] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sendMail = async () => {
    setErr(null);
    if (!to.trim() || !subject.trim() || (!html.trim() && !text.trim())) {
      setErr('Recipient, subject and HTML or text are required');
      return;
    }
    setSending(true);
    try {
      await api.post('/settings/mail/send', {
        to: to.trim(),
        subject: subject.trim(),
        html,
        text: text.trim() || undefined,
        fromKind,
        fromLocal: fromKind === 'support' && fromLocal.trim() ? fromLocal.trim() : undefined,
      });
      toast.show('Email sent', 'success');
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to send email';
      setErr(msg);
      toast.show(msg, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin • Mail</title>
      </Head>
      <AdminLayout title="Admin • Mail">
        {err && <div className="mb-3 text-red-400">{err}</div>}
        <div className="card p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="To">
              <input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="user@example.com" />
            </FormField>
            <FormField label="Subject">
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
            </FormField>
            <FormField label="From identity">
              <select className="input" value={fromKind} onChange={(e) => setFromKind(e.target.value as any)}>
                <option value="support">Support (internal)</option>
                <option value="no_reply">No-reply (events)</option>
                <option value="default">Default (fromEmail)</option>
              </select>
            </FormField>
            {fromKind === 'support' && (
              <FormField label="Custom from (local-part)">
                <input
                  className="input"
                  value={fromLocal}
                  onChange={(e) => setFromLocal(e.target.value)}
                  placeholder="e.g. alice"
                />
                <div className="text-xs subtle mt-1">This sends from alice@velvacloud.com (or your configured support domain).</div>
              </FormField>
            )}
            <div className="md:col-span-2">
              <FormField label="HTML">
                <textarea className="input font-mono text-xs" rows={8} value={html} onChange={(e) => setHtml(e.target.value)} placeholder="<p>Hello</p>" />
              </FormField>
            </div>
            <div className="md:col-span-2">
              <FormField label="Plain text (optional)">
                <textarea className="input font-mono text-xs" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Hello" />
              </FormField>
            </div>
          </div>
          <div className="mt-3">
            <button onClick={sendMail} disabled={sending} className={`btn btn-primary ${sending ? 'opacity-70 cursor-not-allowed' : ''}`}>
              {sending ? 'Sending…' : 'Send email'}
            </button>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}