import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getUserRole } from '../utils/auth';

export default function NavBar() {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

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

  const canAdmin = role === 'ADMIN' || role === 'OWNER';
  const canSupport = role === 'SUPPORT' || canAdmin;

  return (
    <nav className="sticky top-0 z-40 backdrop-blur">
      <div className="border-b border-slate-800 bg-gradient-to-b from-[#0a0f1a]/90 to-[#0a0f1a]/70">
        <div className="container flex items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="https://velvacloud.com/logo.png"
              alt="Logo"
              className="h-8 w-auto"
            />
            <span className="sr-only">Home</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-4">
            <Link href="/dashboard" className="nav-link">Dashboard</Link>
            {token && <Link href="/billing" className="nav-link">Billing</Link>}
            {canSupport && <Link href="/support/inbox" className="nav-link">Support</Link>}
            {canAdmin && <Link href="/admin" className="nav-link">Admin</Link>}
            {!token ? (
              <>
                <Link href="/login" className="nav-link">Login</Link>
                <Link href="/register" className="nav-link">Register</Link>
              </>
            ) : (
              <button onClick={logout} className="btn btn-danger">Logout</button>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded border border-slate-700 hover:bg-slate-800/60"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>

        {/* Mobile nav */}
        {open && (
          <div className="md:hidden px-6 pb-4 space-y-2">
            <Link href="/dashboard" className="mobile-link">Dashboard</Link>
            {token && <Link href="/billing" className="mobile-link">Billing</Link>}
            {canSupport && <Link href="/support/inbox" className="mobile-link">Support</Link>}
            {canAdmin && <Link href="/admin" className="mobile-link">Admin</Link>}
            {!token ? (
              <>
                <Link href="/login" className="mobile-link">Login</Link>
                <Link href="/register" className="mobile-link">Register</Link>
              </>
            ) : (
              <button onClick={logout} className="btn btn-danger w-full">Logout</button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}