import Link from 'next/link';
import { useRouter } from 'next/router';

type Props = {
  serverId: number | string;
  current?: 'overview' | 'files' | 'console' | 'users';
};

export default function ServerSidebar({ serverId, current = 'overview' }: Props) {
  const router = useRouter();
  const sid = serverId ? String(serverId) : '';

  const href = (suffix: string) => (sid ? `/servers/${sid}${suffix}` : '#');

  const Item = ({ to, label, active }: { to: string; label: string; active?: boolean }) => (
    <Link href={to} className={`block px-3 py-2 rounded ${active ? 'bg-slate-800 border border-slate-700' : 'hover:bg-slate-800/60'} transition`}>
      {label}
    </Link>
  );

  return (
    <aside className="w-56 shrink-0">
      <div className="card p-3 sticky top-4">
        <div className="text-xs text-slate-400 mb-2">Server</div>
        <Item to={href('')} label="Overview" active={current === 'overview'} />
        <Item to={href('/files')} label="Files" active={current === 'files'} />
        <Item to={href('/console')} label="Console" active={current === 'console'} />
        <Item to={href('/users')} label="Users & Access" active={current === 'users'} />
      </div>
    </aside>
  );
}