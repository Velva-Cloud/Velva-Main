import Head from 'next/head';
import { FormEvent, useMemo, useState } from 'react';
import api from '../utils/api';
import NavBar from '../components/NavBar';
import { useToast } from '../components/Toast';

export default function Register() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordError = useMemo(() => (password.length >= 8 ? null : 'Password must be at least 8 characters'), [password]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (passwordError) {
      setErr(passwordError);
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/register', { email, password });
      const token = res.data.access_token;
      localStorage.setItem('token', token);
      toast.show('Account created', 'success');
      window.location.href = '/dashboard';
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Register failed';
      setErr(msg);
      toast.show(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

  return (
    <>
      <Head>
        <title>Register • VelvaCloud</title>
      </Head>
      <NavBar />
      <main className="container px-6 py-12">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-extrabold heading-gradient">Create your account</h1>
            <p className="subtle mt-2">Start your journey with VelvaCloud.</p>
          </div>
          <div className="card p-6">
            {err && <p className="mb-4 text-red-400">{err}</p>}
            <form onSubmit={onSubmit} className="space-y-4">
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" className="input" />
              <div>
                <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 8 chars)" type="password" className="input" aria-invalid={!!passwordError} />
                {passwordError && <div className="mt-1 text-xs text-red-400">{passwordError}</div>}
              </div>
              <button className={`btn btn-primary w-full ${loading ? 'opacity-70 cursor-not-allowed' : ''}`} disabled={loading} aria-busy={loading}>
                {loading ? 'Creating…' : 'Register'}
              </button>
            </form>

            <div className="mt-3 text-sm text-center">
              Already have an account? <a href="/login" className="text-sky-400 hover:underline">Sign in</a>
            </div>

            {/* Providers */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <a href={`${apiBase}/auth/google`} className="btn w-full border border-slate-700 hover:bg-slate-800/60">
                <span className="inline-flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.4-1.6 4.1-5.1 4.1-3 0-5.5-2.5-5.5-5.5S8 7 11 7c1.7 0 2.8.7 3.4 1.3l2.3-2.2C15.5 4.8 13.9 4 12 4 7.6 4 4 7.6 4 12s3.6 8 8 8c4.6 0 7.7-3.2 7.7-7.7 0-.5 0-.8-.1-1.2H12z"/>
                  </svg>
                  <span>Google</span>
                </span>
              </a>
              <a href={`${apiBase}/auth/discord`} className="btn w-full border border-slate-700 hover:bg-slate-800/60">
                <span className="inline-flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#5865F2" d="M20.317 4.369A19.791 19.791 0 0016.558 3c-.21.386-.45.94-.617 1.362a18.31 18.31 0 00-4.882 0C10.892 3.94 10.65 3.386 10.438 3a19.79 19.79 0 00-3.76 1.369C3.988 7.046 3.33 9.62 3.5 12.146c2.04 1.5 4.01 2.422 5.958 2.997.48-.66.91-1.36 1.285-2.092a11.55 11.55 0 01-1.926-.74c.162-.12.321-.246.473-.373 3.69 1.734 7.674 1.734 11.324 0 .155.127.314.253.474.373-.62.29-1.26.54-1.926.74.374.732.804 1.43 1.284 2.092 1.95-.575 3.92-1.497 5.959-2.997.33-4.17-1.083-6.745-2.998-7.777zM9.579 12.873c-.967 0-1.753-.88-1.753-1.962 0-1.081.786-1.962 1.753-1.962s1.753.88 1.753 1.962c0 1.081-.786 1.962-1.753 1.962zm4.842 0c-.967 0-1.753-.88-1.753-1.962 0-1.081.786-1.962 1.753-1.962s1.753.88 1.753 1.962c0 1.081-.786 1.962-1.753 1.962z"/>
                  </svg>
                  <span>Discord</span>
                </span>
              </a>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}