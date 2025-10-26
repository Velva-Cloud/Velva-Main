import Head from 'next/head';
import { FormEvent, useState } from 'react';
import api from '../utils/api';
import NavBar from '../components/NavBar';
import { useToast } from '../components/Toast';

export default function Login() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const token = res.data.access_token;
      localStorage.setItem('token', token);
      toast.show('Logged in', 'success');
      window.location.href = '/dashboard';
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Login failed';
      setErr(msg);
      toast.show(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Login • VelvaCloud</title>
      </Head>
      <NavBar />
      <main className="container px-6 py-12">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-extrabold heading-gradient">Welcome back</h1>
            <p className="subtle mt-2">Sign in to continue to your dashboard.</p>
          </div>
          <div className="card p-6">
            {err && <p className="mb-4 text-red-400">{err}</p>}
            <form onSubmit={onSubmit} className="space-y-4">
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" className="input" />
              <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" className="input" />
              <button className={`btn btn-primary w-full ${loading ? 'opacity-70 cursor-not-allowed' : ''}`} disabled={loading} aria-busy={loading}>
                {loading ? 'Logging in…' : 'Login'}
              </button>
            </form>

            <div className="mt-3 text-sm flex items-center justify-between">
              <a href="/forgot-password" className="text-sky-400 hover:underline">Forgot password</a>
              <a href="/register" className="text-sky-400 hover:underline">Create account</a>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}