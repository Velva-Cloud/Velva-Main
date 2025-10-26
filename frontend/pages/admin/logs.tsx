import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import { getUserRole } from '../../utils/auth';
import AdminLayout from '../../components/AdminLayout';
import FormField from '../../components/FormField';

type Log = {
  id: number;
  action: string;
  metadata?: any;
  timestamp: string;
  user?: { id: number; email: string } | null;
};

type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

const ACTIONS = ['login', 'server_create', 'plan_change'] as const;
type ActionType = (typeof ACTIONS)[number] | '';
type GroupBy = 'none' | 'action' | 'user' | 'server';

export default function AdminLogs() {
  const role = useMemo(() => (typeof window !== 'undefined' ? getUserRole() : null), []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.replace('/login');
      return;
    }
    if (!(role === 'SUPPORT' || role === 'ADMIN' || role === 'OWNER')) {
      window.location.replace('/dashboard');
    }
  }, [role]);

  const isSupport = role === 'SUPPORT';

  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [action, setAction] = useState<ActionType>('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Support-scoped filters
  const [userId, setUserId] = useState<number | ''>('');
  const [serverId, setServerId] = useState<number | ''>('');

  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchLogs = async () => {
    setLoading(true);
    setErr(null);
    try {
      const params: any = { page, pageSize };
      if (action) params.action = action;
      if (!isSupport) {
        if (q) params.q = q;
        if (from) params.from = from;
        if (to) params.to = to;
      } else {
        if (userId !== '') params.userId = userId;
        if (serverId !== '') params.serverId = serverId;
        if (from) params.from = from;
        if (to) params.to = to;
      }
      const url = isSupport ? '/logs/support' : '/logs';
      const res = await api.get(url, { params });
      const data = res.data as Paged<Log>;
      setLogs(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, action, pageSize, role]);

  const applyFilters = () => {
    setPage(1);
    fetchLogs();
  };

  const exportCsv = () => {
    if (isSupport) return; // export is admin-only
    const params = new URLSearchParams();
    if (action) params.set('action', action);
    if (q) params.set('q', q);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    window.location.href = `/api/logs/export?${params.toString()}`;
  };

  const grouped = useMemo(() => {
    if (groupBy === 'none') return null;
    const map = new Map<string, Log[]>();
    const keyFn =
      groupBy === 'action'
        ? (l: Log) => l.action
        : groupBy === 'user'
        ? (l: Log) => (l.user ? `${l.user.email ?? 'unknown'} (#${l.user.id})` : 'unknown user')
        : (l: Log) => {
            const sid = (l.metadata && typeof l.metadata === 'object' && 'serverId' in l.metadata) ? (l.metadata as any).serverId : undefined;
            return sid ? `server #${sid}` : 'server: unknown';
          };
    for (const l of logs) {
      const k = keyFn(l) || 'unknown';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(l);
    }
    const entries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [, arr] of entries) {
      arr.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
    }
    return entries;
  }, [logs, groupBy]);

  const allCollapsed = useMemo(() => {
    if (!grouped || grouped.length === 0) return false;
    return grouped.every(([label]) => expanded[label] === false);
  }, [grouped, expanded]);

  const allExpanded = useMemo(() => {
    if (!grouped || grouped.length === 0) return false;
    return grouped.every(([label]) => expanded[label] !== false);
  }, [grouped, expanded]);

  const setAll = (value: boolean) => {
    if (!grouped) return;
    const next: Record<string, boolean> = {};
    for (const [label] of grouped) next[label] = value;
    setExpanded(next);
  };

  useEffect(() => {
    setExpanded({});
  }, [groupBy, logs]);

  return (
    <>
      <Head>
        <title>{isSupport ? 'Support • Logs' : 'Admin • Logs'}</title>
      </Head>
      <AdminLayout
        title={isSupport ? 'Support • Logs' : 'Admin • Logs'}
        actions={
          <div className="card p-3">
            <div className="flex flex-wrap items-end gap-3">
              <FormField label="Action">
                <select value={action} onChange={e => setAction(e.target.value as ActionType)} className="input">
                  <option value="">All</option>
                  {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </FormField>
              {!isSupport ? (
                <>
                  <FormField label="User email contains">
                    <input value={q} onChange={e => setQ(e.target.value)} className="input" placeholder="email@domain.com" />
                  </FormField>
                </>
              ) : (
                <>
                  <FormField label="User ID">
                    <input type="number" value={userId} onChange={e => setUserId(e.target.value === '' ? '' : Number(e.target.value))} className="input" placeholder="e.g. 42" />
                  </FormField>
                  <FormField label="Server ID">
                    <input type="number" value={serverId} onChange={e => setServerId(e.target.value === '' ? '' : Number(e.target.value))} className="input" placeholder="e.g. 101" />
                  </FormField>
                </>
              )}
              <FormField label="From">
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" />
              </FormField>
              <FormField label="To">
                <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" />
              </FormField>
              <FormField label="Group by">
                <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)} className="input">
                  <option value="none">None</option>
                  <option value="action">Action</option>
                  <option value="user">User</option>
                  <option value="server">Server</option>
                </select>
              </FormField>
              <button onClick={applyFilters} className="btn btn-primary">Apply</button>
              {!isSupport && (
                <div className="ml-auto">
                  <button onClick={exportCsv} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Export CSV</button>
                </div>
              )}
              {groupBy !== 'none' && grouped && grouped.length > 0 && (
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => setAll(true)} disabled={allExpanded} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 disabled:opacity-50">Expand all</button>
                  <button onClick={() => setAll(false)} disabled={allCollapsed} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 disabled:opacity-50">Collapse all</button>
                </div>
              )}
            </div>
          </div>
        }
      >
        {err && <div className="mb-4 text-red-400">{err}</div>}

        {loading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="p-3 card animate-pulse">
                <div className="h-4 w-64 bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="card p-10 text-center">
            <h3 className="text-xl font-semibold mb-2">No logs</h3>
            <p className="text-slate-400">Activity will appear here.</p>
          </div>
        ) : (
          <>
            {groupBy === 'none' ? (
              <div className="space-y-2">
                {logs.map((l) => (
                  <div key={l.id} className="p-3 card">
                    <div className="text-sm">
                      <span className="text-slate-400">{new Date(l.timestamp).toLocaleString()}</span>
                      <span className="mx-2">•</span>
                      <span className="font-semibold">{l.action}</span>
                      {l.user && (
                        <>
                          <span className="mx-2">•</span>
                          <span className="text-slate-300">{l.user.email}</span>
                        </>
                      )}
                    </div>
                    {l.metadata && <pre className="mt-2 text-xs bg-slate-800/70 rounded p-2 overflow-auto">{JSON.stringify(l.metadata, null, 2)}</pre>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                {grouped!.map(([label, arr]) => {
                  const isOpen = expanded[label] !== false;
                  return (
                    <div key={label} className="card p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold">{label}</h3>
                        <div className="flex items-center gap-2">
                          <div className="text-sm text-slate-400">{arr.length} item{arr.length !== 1 ? 's' : ''}</div>
                          <button
                            onClick={() => setExpanded((prev) => ({ ...prev, [label]: !isOpen }))}
                            className="px-2 py-0.5 rounded border border-slate-800 hover:bg-slate-800 text-sm"
                          >
                            {isOpen ? 'Collapse' : 'Expand'}
                          </button>
                        </div>
                      </div>
                      {isOpen && (
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
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-slate-400">
                Page {page} of {totalPages} • {total} total
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
              </div>
            </div>
          </>
        )}
      </AdminLayout>
    </>
  );
}
      