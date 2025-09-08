import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function NavBar() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() =&gt; {
    if (typeof window !== 'undefined') {
      setToken(localStorage.getItem('token'));
    }
  }, []);

  const logout = () =&gt; {
    localStorage.removeItem('token');
    window.location.href = '/';
  };

  return (
    &lt;nav className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800"&gt;
      &lt;Link href="/" className="font-semibold text-lg"&gt;HostX&lt;/Link&gt;
      &lt;div className="flex items-center gap-4"&gt;
        &lt;Link href="/dashboard" className="hover:underline"&gt;Dashboard&lt;/Link&gt;
        {!token ? (
          &lt;&gt;
            &lt;Link href="/login" className="hover:underline"&gt;Login&lt;/Link&gt;
            &lt;Link href="/register" className="hover:underline"&gt;Register&lt;/Link&gt;
          &lt;/&gt;
        ) : (
          &lt;button onClick={logout} className="px-3 py-1 bg-red-600 rounded"&gt;Logout&lt;/button&gt;
        )}
      &lt;/div&gt;
    &lt;/nav&gt;
  );
}