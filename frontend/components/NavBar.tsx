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
    <nav className="sticky top-0 z-40 flex items-center justify-between px-6 py-4 bg-[#0a0f1a]/80 backdrop-blur border-b border-slate-800">
      <Link href="/" className="font-semibold text-lg">
        <span className="text-white">Velva</span>
        <span className="text-sky-400">Cloud</span>
      </Link>
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="hover:text-sky-300 transition-colors">Dashboard</Link>
        {role && (role === 'ADMIN' || role === 'OWNER') && (
          <Link href="/admin/plans" className="hover:text-sky-300 transition-colors">Admin</Link>
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