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
      <main className="max-w-md mx-auto px-6 py-12">
        <div className="card p-6">
          <h1 className="text-2xl font-semibold mb-6">Create your account</h1>
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

          <div className="mt-6 space-y-3">
            <a href={`${apiBase}/auth/google`} className="btn w-full bg-red-600 hover:bg-red-500">Continue with Google</a>
            <a href={`${apiBase}/auth/discord`} className="btn w-full" style={{ backgroundColor: '#5865F2', color: 'white' }}>Continue with Discord</a>
          </div>
        </div>
      </main>
    </>
  );
}