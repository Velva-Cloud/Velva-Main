import Head from 'next/head';
import { FormEvent, useState } from 'react';
import api from '../utils/api';
import NavBar from '../components/NavBar';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      const res = await api.post('/auth/register', { email, password });
      const token = res.data.access_token;
      localStorage.setItem('token', token);
      window.location.href = '/dashboard';
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Register failed');
    }
  };

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api';
  return (
    <>
      <Head>
        <title>Register - HostX</title>
      </Head>
      <NavBar />
      <main className="max-w-md mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-6">Create your account</h1>
        {err && <p className="mb-4 text-red-400">{err}</p>}
        <form onSubmit={onSubmit} className="space-y-4">
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700" />
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 8 chars)" type="password" className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700" />
          <button className="w-full bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded">Register</button>
        </form>

        <div className="mt-6 space-y-3">
          <a href={`${apiBase}/auth/google`} className="block w-full text-center bg-red-600 hover:bg-red-500 px-4 py-2 rounded">Continue with Google</a>
          <a href={`${apiBase}/auth/discord`} className="block w-full text-center bg-[#5865F2] hover:brightness-110 px-4 py-2 rounded">Continue with Discord</a>
        </div>
      </main>
    </>
  );
}