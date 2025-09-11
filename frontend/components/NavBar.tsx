import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getUserRole } from '../utils/auth';

export default function NavBar() {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const t = localStorage.getItem('token');
      setToken(t);
      setRole(getUserRole());
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    window.location.href = '/';
  };

  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 bg-[#0a0f1a]/80 backdrop-blur border-b border-slate-800">
      <Link href="/" className="flex items-center gap-3">
        <img
          src="https://velvacloud.com/logo.png"
          alt="VelvaCloud"
          className="h-8 w-auto"
        />
        <span className="sr-only">VelvaCloud</span>
      </Link>
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="hover:text-sky-300 transition-colors">Dashboard</Link>
        {token && <Link href="/billing" className="hover:text-sky-300 transition-colors">Billing</Link>}
        {role && (role === 'SUPPORT' || role === 'ADMIN' || role === 'OWNER') && (
          <>
            <Link href="/support/users" className="hover:text-sky-300 transition-colors">Support</Link>
            <Link href="/support/servers" className="hover:text-sky-300 transition-colors">Servers</Link>
            <Link href="/support/logs" className="hover:text-sky-300 transition-colors">Logs</Link>
          </>
        )}
        {role && (role === 'ADMIN' || role === 'OWNER') && (
          <Link href="/admin" className="hover:text-sky-300 transition-colors">Admin</Link>
        )}
        {!token ? (
          <>
            <Link href="/login" className="hover:text-sky-300 transition-colors">Login</Link>
            <Link href="/register" className="hover:text-sky-300 transition-colors">Register</Link>
          </>
        ) : (
          <button onClick={logout} className="px-3 py-1 rounded bg-red-600 hover:bg-red-500">Logout</button>
        )}
      </div>
    </nav>
  );
}