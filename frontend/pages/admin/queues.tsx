import Head from 'next/head';
import NavBar from '../../components/NavBar';
import { useEffect, useRef, useState } from 'react';
import { useRequireAuth } from '../../utils/guards';
import api from '../../utils/api';

type QueueDef = { name: string };
type JobItem = {
  id: string | number;
  name: string;
  data: any;
  attemptsMade: number;
  timestamp: number;
  finishedOn?: number | null;
  processedOn?: number | null;
  failedReason?: string | null;
  stacktrace?: string[] | null;
  state?: string;
};

const states = ['waiting', 'active', 'completed', 'failed', 'delayed'];

export default function AdminQueues() {
  useRequireAuth();

  const [queues, setQueues] = useState<QueueDef[]>([]);
  const [selected, setSelected] = useState<string>('provision');
  const [state, setState] = useState<string>('waiting');
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(20);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);

  const loadQueues = async () => {
    try {
      const res = await api.get('/admin/queues');
      const list: QueueDef[] = Array.isArray(res.data) ? res.data : [];
      setQueues(list);
      if (!selected && list.length) {
        setSelected(list[0].name);
      }
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load queues');
    }
  };

  const loadJobs = async () => {
    if (!selected) return;
    try {
      const res = await api.get(`/admin/queues/${selected}/jobs`, { params: { state, page, pageSize } });
      const items: JobItem[] = (res.data?.items || []).map((j: any) => ({
        id: j.id,
        name: j.name,
        data: j.data,
        attemptsMade: j.attemptsMade,
        timestamp: j.timestamp,
        finishedOn: j.finishedOn,
        processedOn: j.processedOn,
        failedReason: j.failedReason,
        stacktrace: j.stacktrace,
        state: j.state,
      }));
      setJobs(items);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to load jobs');
      setJobs([]);
    }
  };

  useEffect(() => {
    loadQueues();
  }, []);

  useEffect(() => {
    loadJobs();
  }, [selected, state, page]);

  // Subscribe to SSE for live updates
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token') || '';
    const base = (api.defaults.baseURL || '/api').replace(/\/+$/, '');
    const url = `${base}/admin/queues/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data || '{}');
        if (evt?.queue && evt.queue === selected) {
          loadJobs();
        }
      } catch {}
    };
    es.onerror = () => {
      // ignore; browser will retry
    };
    esRef.current = es;
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [selected, state]);

  const op = async (action: string, jobId?: string | number) => {
    if (!selected) return;
    setBusy(true);
    setErr(null);
    try {
      const path =
        action === 'retry' ? `/admin/queues/${selected}/${jobId}/retry` :
        action === 'remove' ? `/admin/queues/${selected}/${jobId}/remove` :
        action === 'promote' ? `/admin/queues/${selected}/${jobId}/promote` :
        action === 'pause' ? `/admin/queues/${selected}/pause` :
        action === 'resume' ? `/admin/queues/${selected}/resume` :
        action === 'drain' ? `/admin/queues/${selected}/drain` :
        action === 'clean_completed' ? `/admin/queues/${selected}/clean?state=completed` :
        action === 'clean_failed' ? `/admin/queues/${selected}/clean?state=failed` :
        '';
      if (!path) return;
      await api.post(path);
      await loadJobs();
    } catch (e: any) {
      setErr(e?.response?.data?.message || `Failed to ${action}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin • Queues</title>
      </Head>
      <NavBar />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Job Queues</h1>
          <div className="flex items-center gap-2">
            <select value={selected} onChange={e => setSelected(e.target.value)} className="px-2 py-1 rounded bg-slate-800 border border-slate-700">
              {queues.map(q => <option key={q.name} value={q.name}>{q.name}</option>)}
            </select>
            <select value={state} onChange={e => setState(e.target.value)} className="px-2 py-1 rounded bg-slate-800 border border-slate-700">
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => setPage(1)} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Refresh</button>
          </div>
        </div>

        {err && <div className="mb-3 text-red-400">{err}</div>}

        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => op('pause')} disabled={busy} className="px-3 py-1 rounded border border-amber-700 hover:bg-amber-900/40">Pause</button>
          <button onClick={() => op('resume')} disabled={busy} className="px-3 py-1 rounded border border-emerald-700 hover:bg-emerald-900/40">Resume</button>
          <button onClick={() => op('drain')} disabled={busy} className="px-3 py-1 rounded border border-cyan-700 hover:bg-cyan-900/40">Drain</button>
          <button onClick={() => op('clean_completed')} disabled={busy} className="px-3 py-1 rounded border border-indigo-700 hover:bg-indigo-900/40">Clean completed</button>
          <button onClick={() => op('clean_failed')} disabled={busy} className="px-3 py-1 rounded border border-pink-700 hover:bg-pink-900/40">Clean failed</button>
        </div>

        <div className="rounded border border-slate-800">
          <table className="w-full text-left">
            <thead className="bg-slate-900">
              <tr>
                <th className="p-2">Job ID</th>
                <th className="p-2">Name</th>
                <th className="p-2">Attempts</th>
                <th className="p-2">State</th>
                <th className="p-2">Error</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr><td className="p-3 text-slate-400" colSpan={6}>No jobs</td></tr>
              ) : jobs.map(j => (
                <tr key={String(j.id)} className="border-t border-slate-800">
                  <td className="p-2">{j.id}</td>
                  <td className="p-2">{j.name}</td>
                  <td className="p-2">{j.attemptsMade}</td>
                  <td className="p-2">{j.state}</td>
                  <td className="p-2 text-red-400">{j.failedReason || ''}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => op('retry', j.id)} disabled={busy || j.state !== 'failed'} className="px-2 py-1 rounded border border-amber-700 hover:bg-amber-900/40 disabled:opacity-50 disabled:cursor-not-allowed">Retry</button>
                      <button onClick={() => op('remove', j.id)} disabled={busy} className="px-2 py-1 rounded border border-red-700 hover:bg-red-900/40">Remove</button>
                      <button onClick={() => op('promote', j.id)} disabled={busy || j.state !== 'delayed'} className="px-2 py-1 rounded border border-cyan-700 hover:bg-cyan-900/40 disabled:opacity-50 disabled:cursor-not-allowed">Promote</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div />
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">Prev</button>
            <button onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Next</button>
          </div>
        </div>
      </main>
    </>
  );
}