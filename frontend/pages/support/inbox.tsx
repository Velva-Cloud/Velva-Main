import Head from 'next/head';
import { useEffect, useState } from 'react';
import NavBar from '../../components/NavBar';
import { useRequireAdmin } from '../../utils/guards';
import api from '../../utils/api';
import { useToast } from '../../components/Toast';

type Msg = {
  id: number;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  subject: string;
  html?: string | null;
  text?: string | null;
  createdAt: string;
  read: boolean;
};

export default function SupportInbox() {
  // Allow SUPPORT, ADMIN, OWNER
  useRequireAdmin();
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [alias, setAlias] = useState<string>('');

  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const loadInbox = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get('/settings/mail/inbox');
      setMsgs((res.data?.items || []) as Msg[]);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load inbox');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInbox();
    (async () => {
      try {
        const a = await api.get('/settings/mail/alias');
        setAlias(a.data?.email || '');
      } catch {}
    })();
  }, []);

  const send = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      toast.show('To, subject and body are required', 'error');
      return;
    }
    setSending(true);
    try {
      await api.post('/settings/mail/send', {
        to: to.trim(),
        subject: subject.trim(),
        html: `<p>${body.trim()}</p>`,
        text: body.trim(),
        fromKind: 'support',
      });
      toast.show('Sent', 'success');
      setTo('');
      setSubject('');
      setBody('');
      loadInbox();
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to send';
      toast.show(msg, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Head>
        <title>Support • Inbox</title>
      </Head>
      <NavBar />
      <main className="container px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Support Inbox</h1>
          <button onClick={loadInbox} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Refresh</button>
        </div>

        {err && <div className="mb-4 text-red-400">{err}</div>}

        <section className="card p-4 mb-6">
          <h2 className="font-semibold mb-3">Compose</h2>
          <div className="subtle text-sm mb-2">From: <span className="text-slate-200 font-medium">{alias || 'your-alias@velvacloud.com'}</span></div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-sm mb-1">To</div>
              <input className="input" placeholder="user@example.com" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <div className="text-sm mb-1">Subject</div>
              <input className="input" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm mb-1">Body</div>
              <textarea className="input" rows={6} placeholder="Write your message…" value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
          </div>
          <div className="mt-3">
            <button onClick={send} disabled={sending} className={`btn btn-primary ${sending ? 'opacity-70 cursor-not-allowed' : ''}`}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-3">Inbox</h2>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="p-3 card animate-pulse"><div className="h-4 w-40 bg-slate-800 rounded" /></div>
              ))}
            </div>
          ) : msgs.length === 0 ? (
            <div className="card p-10 text-center">
              <h3 className="text-xl font-semibold mb-2">No messages</h3>
              <p className="subtle">Incoming messages to your staff email will appear here.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {msgs.map(m => (
                <li key={m.id} className="p-3 card">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{m.subject}</div>
                    <div className="text-xs subtle">{new Date(m.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="text-sm subtle mt-1">{m.direction === 'inbound' ? `From ${m.from}` : `To ${m.to}`}</div>
                  {m.text ? <div className="text-sm mt-2">{m.text}</div> : m.html ? <div className="text-sm mt-2" dangerouslySetInnerHTML={{ __html: m.html }} /> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}