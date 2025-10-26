import Link from 'next/link';
import { useRouter } from 'next/router';

const nav = [
  { href: '/admin', label: 'Overview', icon: '📊' },
  { href: '/admin/plans', label: 'Plans', icon: '🧩' },
  { href: '/admin/nodes', label: 'Nodes', icon: '🧱' },
  { href: '/admin/queues', label: 'Queues', icon: '📦' },
  { href: '/admin/servers', label: 'Servers', icon: '🖥️' },
  { href: '/admin/users', label: 'Users', icon: '👥' },
  { href: '/admin/logs', label: 'Logs', icon: '📜' },
  { href: '/admin/transactions', label: 'Transactions', icon: '💳' },
  { href: '/admin/settings', label: 'Settings', icon: '⚙️' },
  { href: '/admin/finance', label: 'Finance', icon: '💼' },
];

export default function AdminSidebar() {
  const { pathname } = useRouter();

  return (
    <aside className="hidden md:block w-60 shrink-0">
      <div className="sticky top-16 space-y-1">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded border ${active ? 'border-slate-700 bg-slate-800/60' : 'border-slate-800 hover:bg-slate-800/60'}`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}