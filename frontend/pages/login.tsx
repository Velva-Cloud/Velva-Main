import Head from 'next/head';
import { FormEvent, useState } from 'react';
import api from '../utils/api';
import NavBar from '../components/NavBar';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      const res = await api.post('/auth/login', { email, password });
      const token = res.data.access_token;
      localStorage.setItem('token', token);
      window.location.href = '/dashboard';
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Login failed');
    }
  };

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';
  return (
    <>
      <Head>
        <title>Login • VelvaCloud</title>
      </Head>
      <NavBar />
      <main className="max-w-md mx-auto px-6 py-12">
        <div className="card p-6">
          <h1 className="text-2xl font-semibold mb-6">Welcome back</h1>
          {err && <p className="mb-4 text-red-400">{err}</p>}
          <form onSubmit={onSubmit} className="space-y-4">
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" className="input" />
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" className="input" />
            <button className="btn btn-primary w-full">Login</button>
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