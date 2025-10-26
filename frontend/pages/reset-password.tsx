import Head from 'next/head';
import { FormEvent, useMemo, useState } from 'react';
import NavBar from '../components/NavBar';
import { useRouter } from 'next/router';
import api from '../utils/api';
import { useToast } from '../components/Toast';

export default function ResetPassword() {
  const router = useRouter();
  const toast = useToast();
  const token = (router.query.token as string) || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordError = useMemo(() => (password.length >= 8 ? null : 'Password must be at least 8 characters'), [password]);
  const confirmError = useMemo(() => (confirm === password ? null : 'Passwords do not match'), [confirm, password]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (passwordError || confirmError || !token) {
      setErr(passwordError || confirmError || 'Invalid or missing token');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      toast.show('Password updated. Please sign in.', 'success');
      setTimeout(() => router.replace('/login'), 1200);
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to reset password';
      setErr(msg);
      toast.show(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Reset Password • VelvaCloud</title>
      </Head>
      <NavBar />
      <main className="container px-6 py-12">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-extrabold heading-gradient">Reset your password</h1>
            <p className="subtle mt-2">Enter a new password and confirm.</p>
          </div>
          <div className="card p-6">
            {done ? (
              <div className="subtle">Password updated. Redirecting…</div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                {err && <p className="text-red-400">{err}</p>}
                <input
                  type="password"
                  placeholder="New password (min 8 chars)"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!passwordError}
                />
                {passwordError && <div className="text-xs text-red-400 -mt-2">{passwordError}</div>}
                <input
                  type="password"
                  placeholder="Confirm new password"
                  className="input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={!!confirmError}
                />
                {confirmError && <div className="text-xs text-red-400 -mt-2">{confirmError}</div>}
                <button className={`btn btn-primary w-full ${loading ? 'opacity-70 cursor-not-allowed' : ''}`} disabled={loading} aria-busy={loading}>
                  {loading ? 'Updating…' : 'Update password'}
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