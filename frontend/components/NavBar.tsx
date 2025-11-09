import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getUserRole } from '../utils/auth';
import api from '../utils/api';

export default function NavBar() {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [openConsole, setOpenConsole] = useState(false);
  const consoleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const t = localStorage.getItem('token');
      setToken(t);
      // First try role from token
      const local = getUserRole();
      setRole(local);
      // Then verify with API to pick up role changes without requiring logout
      api.get('/users/me')
        .then(res => {
          const r = (res.data?.role || '').toString().toUpperCase();
          if (r) setRole(r);
        })
        .catch(() => {
          // ignore; keep local role
        });
    }
  }, []);

  // Close Console dropdown when clicking outside
  useEffect(() => {
    const handler = (ev: MouseEvent) => {
      if (!consoleRef.current) return;
      const target = ev.target as Node;
      if (consoleRef.current.contains(target)) return;
      setOpenConsole(false);
    };
    if (openConsole) {
      document.addEventListener('mousedown', handler);
    }
    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, [openConsole]);

  const logout = () => {
    localStorage.removeItem('token');
    window.location.href = '/';
  };

  const canSupport = role && (role === 'SUPPORT' || role === 'ADMIN' || role === 'OWNER');
  const canAdmin = role && (role === 'ADMIN' || role === 'OWNER');

  return (
    <nav className="sticky top-0 z-40 backdrop-blur">
      <div className="border-b border-slate-800 bg-gradient-to-b from-[#0a0f1a]/90 to-[#0a0f1a]/70">
        <div className="container flex items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="https://velvacloud.com/logo.png"
              alt="VelvaCloud"
              className="h-8 w-auto"
            />
            <span className="sr-only">VelvaCloud</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-4">
            <Link href="/dashboard" className="nav-link">Dashboard</Link>
            {token && <Link href="/billing" className="nav-link">Billing</Link>}

            {(canSupport || canAdmin) && (
              <div className="relative" ref={consoleRef}>
                <button
                  className="nav-link inline-flex items-center gap-1"
                  onClick={() => setOpenConsole((v) => !v)}
                >
                  Console
                  <svg width="16" height="16" viewBox="0 0 20 20" className={`transition-transform ${openConsole ? 'rotate-180' : ''}`}>
                    <path d="M5 7l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
                {openConsole && (
                  <div className="absolute right-0 mt-2 w-44 rounded-lg bg-slate-900/90 border border-slate-800 shadow-lg p-2">
                    {canSupport && (
                      <>
                        <Link href="/support/inbox" className="dropdown-link">Support • Inbox</Link>
                        <Link href="/support/users" className="dropdown-link">Support • Users</Link>
                        <Link href="/support/servers" className="dropdown-link">Support • Servers</Link>
                      </>
                    )}
                    {canAdmin && (
                      <>
                        <Link href="/admin" className="dropdown-link">Admin Home</Link>
                        <Link href="/admin/logs" className="dropdown-link">Admin • Logs</Link>
                        <Link href="/admin/plans" className="dropdown-link">Admin • Plans</Link>
                        <Link href="/admin/create-server" className="dropdown-link">Admin • Create Server</Link>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

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

            {(canSupport || canAdmin) && (
              <>
                <div className="text-xs uppercase text-slate-400 mt-2">Console</div>
                {canSupport && (
                  <>
                    <Link href="/support/inbox" className="mobile-link">Support • Inbox</Link>
                    <Link href="/support/users" className="mobile-link">Support • Users</Link>
                    <Link href="/support/servers" className="mobile-link">Support • Servers</Link>
                  </>
                )}
                {canAdmin && (
                  <>
                    <Link href="/admin" className="mobile-link">Admin Home</Link>
                    <Link href="/admin/logs" className="mobile-link">Admin • Logs</Link>
                    <Link href="/admin/plans" className="mobile-link">Admin • Plans</Link>
                  </>
                )}
              </>
            )}

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