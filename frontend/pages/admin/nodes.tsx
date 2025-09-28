import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import NavBar from '../../components/NavBar';
import { useRequireAdmin } from '../../utils/guards';
import { useToast } from '../../components/Toast';
import SystemStatus from '../../components/SystemStatus';

type NodeRec = {
  id: number;
  name: string;
  location: string;
  ip: string;
  status: 'online' | 'offline';
  capacity: number;
  approved?: boolean;
  apiUrl?: string | null;
  publicIp?: string | null;
  lastSeenAt?: string | null;
  capacityCpuCores?: number | null;
  capacityMemoryMb?: number | null;
  capacityDiskMb?: number | null;
};

type JoinCode = { code: string; expiresAt: string; used?: boolean; usedAt?: string | null; usedNodeId?: number | null };

type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export default function AdminNodes() {
  useRequireAdmin();
  const toast = useToast();

  const [nodes, setNodes] = useState<NodeRec[]>([]);
  const [pending, setPending] = useState<NodeRec[]>([]);
  const [joinCodes, setJoinCodes] = useState<JoinCode[]>([]);
  const [lastCode, setLastCode] = useState<JoinCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // form
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [ip, setIp] = useState('');
  const [capacity, setCapacity] = useState<number | ''>('');
  const [creating, setCreating] = useState(false);

  const [ttlMinutes, setTtlMinutes] = useState<number>(15);

  const nameError = useMemo(() => (name.trim() ? null : 'Name is required'), [name]);
  const locError = useMemo(() => (location.trim() ? null : 'Location is required'), [location]);
  const ipError = useMemo(() => (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) ? null : 'Enter a valid IPv4 address'), [ip]);
  const capError = useMemo(() => (typeof capacity === 'number' && capacity > 0 ? null : 'Capacity must be a positive integer'), [capacity]);

  const fetchNodes = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [resAll, resPending, resCodes] = await Promise.all([
        api.get('/nodes', { params: { page, pageSize } }),
        api.get('/nodes', { params: { pending: 1, page: 1, pageSize: 50 } }),
        api.get('/nodes/join-codes'),
      ]);
      const data = resAll.data as Paged<NodeRec>;
      setNodes(data.items);
      setTotal(data.total);
      setPending((resPending.data as Paged<NodeRec>).items);
      setJoinCodes((resCodes.data.items || []) as JoinCode[]);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load nodes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNodes();
  }, [page]);

  const createNode = async () => {
    if (nameError || locError || ipError || capError) {
      setErr(nameError || locError || ipError || capError);
      return;
    }
    setCreating(true);
    setErr(null);
    try {
      const res = await api.post('/nodes', { name, location, ip, capacity: Number(capacity) });
      setNodes((prev) => [res.data, ...prev]);
      setTotal((t) => t + 1);
      setName('');
      setLocation('');
      setIp('');
      setCapacity('');
      toast.show('Node added', 'success');
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Failed to add node';
      setErr(msg);
      toast.show(msg, 'error');
    } finally {
      setCreating(false);
    }
  };

  const generateJoinCode = async () => {
    try {
      const res = await api.post('/nodes/join-codes', { ttlMinutes });
      setLastCode(res.data as JoinCode);
      await fetchNodes();
      toast.show('Join code generated', 'success');
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Failed to generate code', 'error');
    }
  };

  const revokeCode = async (code: string) => {
    setBusyCode(code);
    try {
      await api.delete(`/nodes/join-codes/${encodeURIComponent(code)}`);
      await fetchNodes();
      toast.show('Join code revoked', 'success');
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Failed to revoke code', 'error');
    } finally {
      setBusyCode(null);
    }
  };

  const toggle = async (id: number) => {
    setBusyId(id);
    const old = nodes.find((n) => n.id === id);
    if (!old) return;
    // optimistic
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status: n.status === 'online' ? 'offline' : 'online' } : n)));
    try {
      await api.patch(`/nodes/${id}/toggle`);
      toast.show('Node status toggled', 'success');
    } catch (e: any) {
      // revert
      setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, status: old.status } : n)));
      toast.show(e?.response?.data?.message || 'Failed to toggle node', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const saveInline = async (id: number, patch: Partial<NodeRec>) => {
    setBusyId(id);
    const prev = nodes.find((n) => n.id === id);
    if (!prev) return;
    setNodes((list) => list.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    try {
      await api.patch(`/nodes/${id}`, patch);
      toast.show('Node updated', 'success');
    } catch (e: any) {
      setNodes((list) => list.map((n) => (n.id === id ? prev : n)));
      toast.show(e?.response?.data?.message || 'Failed to update node', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const ping = async (id: number) => {
    setBusyId(id);
    try {
      const res = await api.get(`/nodes/${id}/ping`);
      if (res.data.reachable) {
        toast.show(`Ping OK in ${res.data.ms}ms`, 'success');
      } else {
        toast.show(`Ping failed (${res.data.error || 'unreachable'})`, 'error');
      }
    } catch {
      toast.show('Ping failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (id: number) => {
    setBusyId(id);
    try {
      await api.post(`/nodes/${id}/approve`);
      toast.show('Node approved', 'success');
      await fetchNodes();
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Failed to approve', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const deny = async (id: number) => {
    if (!confirm('Deny (delete) this pending node?')) return;
    setBusyId(id);
    try {
      await api.post(`/nodes/${id}/deny`);
      toast.show('Node denied', 'success');
      await fetchNodes();
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Failed to deny', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const panelUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-panel-url';
  const agentImage = process.env.NEXT_PUBLIC_AGENT_IMAGE || 'ghcr.io/velva-cloud/velva-daemon:latest';

  return (
    <>
      <Head>
        <title>Admin • Nodes</title>
      </Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Admin • Nodes</h1>
          <div className="w-full max-w-sm ml-4">
            <SystemStatus />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <a href="/admin/plans" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Plans</a>
          <a href="/admin/nodes" className="px-3 py-1 rounded border border-slate-700 bg-slate-800/60">Nodes</a>
          <a href="/admin/servers" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Servers</a>
          <a href="/admin/users" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Users</a>
          <a href="/admin/logs" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Logs</a>
          <a href="/admin/transactions" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Transactions</a>
          <a href="/admin/settings" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Settings</a>
          <a href="/admin/finance" className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Finance</a>
        </div>

        {err && <div className="mb-4 text-red-400">{err}</div>}

        {/* One-time join codes */}
        <section className="mb-8 p-4 card">
          <h2 className="font-semibold mb-3">One-time join codes</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <div className="text-sm mb-1">TTL (minutes)</div>
              <input type="number" min={1} max={1440} value={ttlMinutes} onChange={(e) => setTtlMinutes(Math.max(1, Math.min(1440, Number(e.target.value || 1))))} className="input w-32" />
            </label>
            <button onClick={generateJoinCode} className="btn btn-primary">Generate code</button>
          </div>

          {lastCode && (
            <div className="mt-4">
              <div className="text-sm text-slate-400 mb-2">Latest code (expires {new Date(lastCode.expiresAt).toLocaleString()}):</div>
              <div className="flex items-center gap-2">
                <div className="px-3 py-2 rounded bg-slate-800 border border-slate-700 font-mono">{lastCode.code}</div>
                <button
                  onClick={() => navigator.clipboard.writeText(lastCode.code)}
                  className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600"
                >
                  Copy code
                </button>
              </div>
              <div className="mt-3 text-sm text-slate-400">One-liner for your node:</div>
              <pre className="mt-2 p-3 rounded bg-slate-900 border border-slate-800 text-xs overflow-x-auto">
{`docker run -d --name vc-agent --restart=always \\
  --network host \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -v /opt/vc-agent/certs:/certs \\
  -e PANEL_URL=${panelUrl} \\
  -e JOIN_CODE=${lastCode.code} \\
  ${agentImage}`}
              </pre>
              <button
                onClick={() => {
                  const cmd = `docker run -d --name vc-agent --restart=always --network host -v /var/run/docker.sock:/var/run/docker.sock -v /opt/vc-agent/certs:/certs -e PANEL_URL=${panelUrl} -e JOIN_CODE=${lastCode.code} ${agentImage}`;
                  navigator.clipboard.writeText(cmd);
                  toast.show('Command copied', 'success');
                }}
                className="mt-2 px-3 py-1 rounded bg-slate-700 hover:bg-slate-600"
              >
                Copy command
              </button>
              <div className="mt-2 text-xs text-slate-500">Image: {agentImage}. You can override via NEXT_PUBLIC_AGENT_IMAGE.</div>
            </div>
          )}

          {joinCodes.length > 0 && (
            <div className="mt-6">
              <div className="text-sm font-semibold mb-2">Active join codes</div>
              <div className="space-y-2">
                {joinCodes.map((c) => (
                  <div key={c.code} className="flex items-center justify-between p-2 rounded border border-slate-800 bg-slate-900/50">
                    <div className="font-mono">{c.code}</div>
                    <div className="text-sm text-slate-400">expires {new Date(c.expiresAt).toLocaleString()}</div>
                    <button onClick={() => revokeCode(c.code)} disabled={busyCode === c.code} className={`px-3 py-1 rounded bg-red-700 hover:bg-red-600 ${busyCode === c.code ? 'opacity-60 cursor-not-allowed' : ''}`}>Revoke</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Pending approvals */}
        {pending.length > 0 && (
          <section className="mb-8 p-4 card">
            <h2 className="font-semibold mb-3">Pending approvals</h2>
            <div className="space-y-3">
              {pending.map((n) => (
                <div key={n.id} className="p-3 rounded border border-slate-800 bg-slate-900/50">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">#{n.id} {n.name || 'New node'}</div>
                      <div className="text-sm text-slate-400">{n.location || 'Unknown'} • API {n.apiUrl || '—'} • Public IP {n.publicIp || '—'}</div>
                      {(n.capacityCpuCores || n.capacityMemoryMb || n.capacityDiskMb) ? (
                        <div className="text-xs text-slate-500 mt-1">
                          CPU {n.capacityCpuCores ?? '—'} • RAM {n.capacityMemoryMb ?? '—'} MB • Disk {n.capacityDiskMb ?? '—'} MB
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => approve(n.id)} disabled={busyId === n.id} className={`px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 ${busyId === n.id ? 'opacity-60 cursor-not-allowed' : ''}`}>Approve</button>
                      <button onClick={() => deny(n.id)} disabled={busyId === n.id} className={`px-3 py-1 rounded bg-red-700 hover:bg-red-600 ${busyId === n.id ? 'opacity-60 cursor-not-allowed' : ''}`}>Deny</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section id="create-node" className="mb-8 p-4 card">
          <h2 className="font-semibold mb-3">Add Node</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="block">
              <div className="text-sm mb-1">Name</div>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" aria-invalid={!!nameError} />
              {nameError && <div className="mt-1 text-xs text-red-400">{nameError}</div>}
            </label>
            <label className="block">
              <div className="text-sm mb-1">Location</div>
              <input value={location} onChange={(e) => setLocation(e.target.value)} className="input" aria-invalid={!!locError} />
              {locError && <div className="mt-1 text-xs text-red-400">{locError}</div>}
            </label>
            <label className="block">
              <div className="text-sm mb-1">IP</div>
              <input value={ip} onChange={(e) => setIp(e.target.value)} className="input" placeholder="192.168.1.10" aria-invalid={!!ipError} />
              {ipError && <div className="mt-1 text-xs text-red-400">{ipError}</div>}
            </label>
            <label className="block">
              <div className="text-sm mb-1">Capacity</div>
              <input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value === '' ? '' : Number(e.target.value))} className="input" aria-invalid={!!capError} />
              {capError && <div className="mt-1 text-xs text-red-400">{capError}</div>}
            </label>
          </div>
          <div className="mt-4">
            <button onClick={createNode} disabled={creating || !!nameError || !!locError || !!ipError || !!capError} className={`btn btn-primary ${creating ? 'opacity-70 cursor-not-allowed' : ''}`}>
              {creating ? 'Adding…' : 'Add Node'}
            </button>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Nodes</h2>
            <div className="text-sm text-slate-400">Page {page} of {totalPages} • {total} total</div>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-4 card animate-pulse">
                  <div className="h-4 w-40 bg-slate-800 rounded" />
                  <div className="mt-2 h-3 w-64 bg-slate-800 rounded" />
                </div>
              ))}
            </div>
          ) : nodes.length === 0 ? (
            <div className="relative overflow-hidden card p-10 text-center">
              <img src="https://velvacloud.com/logo.png" alt="VelvaCloud" className="mx-auto h-16 w-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No nodes yet</h3>
              <p className="text-slate-400 mb-5">Use the form above to add a node.</p>
              <a href="#create-node" className="btn btn-primary inline-flex">Add node</a>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {nodes.map((n) => (
                  <div key={n.id} className="p-4 card">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">
                          {n.name}
                          <span className={`ml-2 inline-block text-xs px-2 py-0.5 rounded-full ${n.status === 'online' ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-700' : 'bg-red-600/30 text-red-300 border border-red-700'}`}>{n.status}</span>
                          {n.approved === false ? <span className="ml-2 inline-block text-xs px-2 py-0.5 rounded-full bg-amber-600/30 text-amber-200 border border-amber-700">pending</span> : null}
                        </div>
                        <div className="text-sm text-slate-400">#{n.id} • {n.location} • {n.ip} • capacity {n.capacity}</div>
                        <div className="text-xs text-slate-500 mt-1">API: {n.apiUrl || '—'} • Last seen: {n.lastSeenAt ? new Date(n.lastSeenAt).toLocaleString() : '—'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => ping(n.id)} disabled={busyId === n.id} className={`px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 ${busyId === n.id ? 'opacity-60 cursor-not-allowed' : ''}`}>Ping</button>
                        <button onClick={() => toggle(n.id)} disabled={busyId === n.id} className={`px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 ${busyId === n.id ? 'opacity-60 cursor-not-allowed' : ''}`}>
                          {n.status === 'online' ? 'Set offline' : 'Set online'}
                        </button>
                        <button
                          onClick={() => {
                            const newName = prompt('Edit name', n.name);
                            if (newName !== null && newName.trim()) saveInline(n.id, { name: newName });
                          }}
                          className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            const val = prompt('Set capacity (max servers)', String(n.capacity));
                            if (val === null) return;
                            const num = Number(val);
                            if (!Number.isInteger(num) || num < 1) {
                              toast.show('Capacity must be a positive integer', 'error');
                              return;
                            }
                            saveInline(n.id, { capacity: num });
                          }}
                          className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600"
                        >
                          Set capacity
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm('Delete this node? Servers assigned to it will be detached.')) return;
                            setBusyId(n.id);
                            try {
                              await api.delete(`/nodes/${n.id}`);
                              setNodes((prev) => prev.filter((x) => x.id !== n.id));
                              setTotal((t) => Math.max(0, t - 1));
                              toast.show('Node deleted', 'success');
                            } catch (e: any) {
                              toast.show(e?.response?.data?.message || 'Failed to delete node', 'error');
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className={`px-3 py-1 rounded bg-red-700 hover:bg-red-600 ${busyId === n.id ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4">
                <div />
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">Prev</button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}