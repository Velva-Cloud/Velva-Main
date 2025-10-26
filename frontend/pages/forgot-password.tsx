import Head from 'next/head';
import { FormEvent, useState } from 'react';
import NavBar from '../components/NavBar';
import api from '../utils/api';
import { useToast } from '../components/Toast';

export default function ForgotPassword() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
      toast.show('If the email exists, a reset link has been sent.', 'success');
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to request reset';
      setErr(msg);
      toast.show(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Forgot Password • VelvaCloud</title>
      </Head>
      <NavBar />
      <main className="container px-6 py-12">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-extrabold heading-gradient">Reset your password</h1>
            <p className="subtle mt-2">We’ll email you a reset link.</p>
          </div>
          <div className="card p-6">
            {sent ? (
              <div className="subtle">
                If the account exists, we&apos;ve sent a reset link to <span className="font-semibold text-slate-200">{email}</span>.
                Check your inbox and follow the instructions.
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                {err && <p className="text-red-400">{err}</p>}
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email"
                  type="email"
                  className="input"
                />
                <button className={`btn btn-primary w-full ${loading ? 'opacity-70 cursor-not-allowed' : ''}`} disabled={loading} aria-busy={loading}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
                <div className="text-sm subtle">
                  Remembered your password? <a href="/login" className="text-sky-400 hover:underline">Back to login</a>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </>
  );
}