import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import NavBar from '../../components/NavBar';
import { useRequireSupport } from '../../utils/guards';
import api from '../../utils/api';
import SystemStatus from '../../components/SystemStatus';

type LogItem = {
  id: number;
  action: string;
  timestamp: string;
  metadata?: any;
  user?: { id: number; email: string | null };
};

type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

type GroupBy = 'none' | 'action' | 'user' | 'server';

export default function SupportLogs() {
  useRequireSupport();

  const [items, setItems] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [userId, setUserId] = useState<number | ''>('');
  const [serverId, setServerId] = useState<number | ''>('');
  const [action, setAction] = useState<string | ''>('');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchLogs = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get('/logs/support', {
        params: {
          userId: userId === '' ? undefined : Number(userId),
          serverId: serverId === '' ? undefined : Number(serverId),
          action: action || undefined,
          from: from || undefined,
          to: to || undefined,
          page,
          pageSize,
        },
      });
      const data = res.data as Paged<LogItem>;
      setItems(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load logs');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [userId, serverId, action, from, to]);

  useEffect(() => {
    fetchLogs();
  }, [page]);

  // Grouping logic (client-side)
  const grouped = useMemo(() => {
    if (groupBy === 'none') return null;
    const map = new Map<string, LogItem[]>();
    const keyFn =
      groupBy === 'action'
        ? (l: LogItem) => l.action
        : groupBy === 'user'
        ? (l: LogItem) => (l.user ? `${l.user.email ?? 'unknown'} (#${l.user.id})` : 'unknown user')
        : (l: LogItem) => {
            const sid = (l.metadata && typeof l.metadata === 'object' && 'serverId' in l.metadata) ? (l.metadata as any).serverId : undefined;
            return sid ? `server #${sid}` : 'server: unknown';
          };
    for (const l of items) {
      const k = keyFn(l) || 'unknown';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(l);
    }
    // sort groups by label
    const entries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    // sort each group's items by timestamp desc
    for (const [, arr] of entries) {
      arr.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
    }
    return entries;
  }, [items, groupBy]);

  return (
    <>
      <Head>
        <title>Support • Logs</title>
      </Head>
      <NavBar />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Support • Logs (scoped)</h1>
          <div className="w-full max-w-sm ml-4">
            <SystemStatus />
          </div>
        </div>

        <div className="card p-4 mb-6">
          <div className="grid gap-3 md:grid-cols-6">
            <div>
              <div className="text-sm mb-1">User ID</div>
              <input type="number" value={userId} onChange={e => setUserId(e.target.value === '' ? '' : Number(e.target.value))} className="input" placeholder="e.g. 42" />
            </div>
            <div>
              <div className="text-sm mb-1">Server ID</div>
              <input type="number" value={serverId} onChange={e => setServerId(e.target.value === '' ? '' : Number(e.target.value))} className="input" placeholder="e.g. 101" />
            </div>
            <div>
              <div className="text-sm mb-1">Action</div>
              <select value={action} onChange={e => setAction(e.target.value)} className="input">
                <option value="">All</option>
                <option value="login">login</option>
                <option value="server_create">server_create</option>
                <option value="plan_change">plan_change</option>
              </select>
            </div>
            <div>
              <div className="text-sm mb-1">From</div>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" />
            </div>
            <div>
              <div className="text-sm mb-1">To</div>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" />
            </div>
            <div>
              <div className="text-sm mb-1">Group by</div>
              <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)} className="input">
                <option value="none">None</option>
                <option value="action">Action</option>
                <option value="user">User</option>
                <option value="server">Server</option>
              </select>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => { setUserId(''); setServerId(''); setAction(''); setFrom(''); setTo(''); }} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Clear</button>
            <button onClick={() => fetchLogs()} className="px-3 py-1 rounded btn-primary">Apply</button>
          </div>
        </div>

        {err && <div className="mb-4 text-red-400">{err}</div>}

        {loading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="p-4 card animate-pulse">
                <div className="h-4 w-64 bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="card p-10 text-center">
            <h3 className="text-xl font-semibold mb-2">No logs</h3>
            <p className="text-slate-400">Try changing filters like user or server id.</p>
          </div>
        ) : (
          <>
            {groupBy === 'none' ? (
              <>
                <div className="space-y-3">
                  {items.map((l) => (
                    <div key={l.id} className="p-4 card">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{l.action}</div>
                        <div className="text-sm text-slate-400">{new Date(l.timestamp).toLocaleString()}</div>
                      </div>
                      <div className="text-sm text-slate-300 mt-1">User: {l.user?.email ?? '—'} {l.user ? `(ID ${l.user.id})` : ''}</div>
                      {l.metadata ? (
                        <pre className="text-xs bg-slate-800/60 rounded p-2 mt-2 overflow-auto">{JSON.stringify(l.metadata, null, 2)}</pre>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-5">
                {grouped!.map(([label, arr]) => (
                  <div key={label} className="card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">{label}</h3>
                      <div className="text-sm text-slate-400">{arr.length} item{arr.length !== 1 ? 's' : ''}</div>
                    </div>
                    <div className="space-y-3">
                      {arr.map((l) => (
                        <div key={l.id} className="p-3 rounded border border-slate-800 bg-slate-900/50">
                          <div className="flex items-center justify-between">
                            <div className="font-medium">{l.action}</div>
                            <div className="text-sm text-slate-400">{new Date(l.timestamp).toLocaleString()}</div>
                          </div>
                          <div className="text-xs text-slate-400 mt-1">User: {l.user?.email ?? '—'} {l.user ? `(ID ${l.user.id})` : ''}</div>
                          {l.metadata ? (
                            <pre className="text-xs bg-slate-800/60 rounded p-2 mt-2 overflow-auto">{JSON.stringify(l.metadata, null, 2)}</pre>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-slate-400">Page {page} of {totalPages} • {total} total</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}