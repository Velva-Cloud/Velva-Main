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
          </div>
        </div>
      </main>
    </>
  );
}