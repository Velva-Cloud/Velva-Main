import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function NavBar() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setToken(localStorage.getItem('token'));
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    window.location.href = '/';
  };

  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
      <Link href="/" className="font-semibold text-lg">HostX</Link>
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="hover:underline">Dashboard</Link>
        {!token ? (
          <>
            <Link href="/login" className="hover:underline">Login</Link>
            <Link href="/register" className="hover:underline">Register</Link>
          </>
        ) : (
          <button onClick={logout} className="px-3 py-1 bg-red-600 rounded">Logout</button>
        )}
      </div>
    </nav>
  );
}