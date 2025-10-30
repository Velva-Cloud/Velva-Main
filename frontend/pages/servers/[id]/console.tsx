import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import NavBar from '../../../components/NavBar';
import ServerSidebar from '../../../components/ServerSidebar';
import { useRequireAuth } from '../../../utils/guards';
import api from '../../../utils/api';
import { useToast } from '../../../components/Toast';
import { getUserRole } from '../../../utils/auth';

export default function ServerConsolePage() {
  useRequireAuth();
  const toast = useToast();
  const router = useRouter();
  const { id } = router.query;
  const sid = Array.isArray(id) ? (id[0] || '') : (id ?? '');

  const role = useMemo(() => getUserRole(), []);
  const [srvName, setSrvName] = useState<string>('');
  const [hint, setHint] = useState<string | null>(null);
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [cmd, setCmd] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [wrap, setWrap] = useState(true);

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const viewRef = useRef<HTMLPreElement | null>(null);

  const [events, setEvents] = useState<Array<{ id: number; ts: string; type: string; message?: string }>>([]);

  const fetchServer = async () => {
    if (!id) return;
    try {
      const res = await api.get(`/servers/${id}`);
      setSrvName(res.data?.name || String(id));
      setHint(res.data?.stateHint || null);
    } catch {}
  };

  const fetchEvents = async () => {
    if (!id) return;
    try {
      const res = await api.get(`/servers/${id}/events`, { params: { limit: 20 } });
      const items = Array.isArray(res.data) ? res.data : [];
      setEvents(items.map((e: any) => ({ id: e.id, ts: e.ts, type: e.type, message: e.message })));
    } catch {}
  };

  useEffect(() => { fetchServer(); fetchEvents(); }, [id]);

  const startConsole = async () => {
    if (!id) return;
    stopConsole();
    try {
      abortRef.current = new AbortController();
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      const res = await fetch(`${api.defaults.baseURL}/servers/${id}/logs`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) {
        try {
          const txt = await res.text();
          let msg = `Failed to open console stream (HTTP ${res.status})`;
          try {
            const j = JSON.parse(txt);
            if (j?.error) msg = `Failed to open console stream: ${j.error}`;
          } catch {
            if (txt) msg = `Failed to open console stream: ${txt}`;
          }
          setConsoleLines(prev => [...prev, msg]);
        } catch {
          setConsoleLines(prev => [...prev, `Failed to open console stream (HTTP ${res.status})`]);
        }
        setConnected(false);
        toast.show('Failed to open console stream', 'error');
        return;
      }
      setConnected(true);
      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';
      const pump = async (): Promise<void> => {
        const r = await reader.read();
        if (r.done) {
          setConnected(false);
          setConsoleLines(prev => prev.length ? [...prev, '[INFO] Log stream ended'] : ['[INFO] Log stream ended']);
          return;
        }
        const chunk = decoder.decode(r.value, { stream: true });
        buffer += chunk;
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const part = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const line = part.split('\n').find(l => l.startsWith('data: '));
          if (line) {
            try { setConsoleLines(prev => [...prev, JSON.parse(line.slice(6))]); }
            catch { setConsoleLines(prev => [...prev, line.slice(6)]); }
          } else {
            const ping = part.split('\n').find(l => l.startsWith(': '));
            if (ping) setConsoleLines(prev => [...prev, ping.slice(2)]);
          }
        }
        await pump();
      };
      pump();
    } catch (e: any) {
      const msg = e?.message ? `Error: ${e.message}` : 'Error opening console stream.';
      setConsoleLines(prev => [...prev, msg]);
      setConnected(false);
    }
  };

  const stopConsole = () => {
    try { abortRef.current?.abort(); } catch {}
    abortRef.current = null;
    try { readerRef.current?.cancel(); } catch {}
    readerRef.current = null;
    setConnected(false);
  };

  useEffect(() => {
    if (id) {
      setConsoleLines([]);
      startConsole();
    }
    return () => stopConsole();
  }, [id]);

  // autoscroll when new lines arrive
  useEffect(() => {
    if (!autoScroll) return;
    const el = viewRef.current;
    if (!el) return;
    try {
      el.scrollTop = el.scrollHeight;
    } catch {}
  }, [consoleLines, autoScroll]);

  const runCmd = async () => {
    if (!id || !cmd.trim()) return;
    setBusy(true);
    try {
      const res = await api.post(`/servers/${id}/exec`, { cmd: cmd.trim() });
      const out = (res.data?.output || '').toString();
      if (out) {
        setConsoleLines(prev => [...prev, `$ ${cmd.trim()}`, out]);
      }
      setCmd('');
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Command failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const downloadBuffer = () => {
    const blob = new Blob([consoleLines.join('\n') || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `console-${sid || 'server'}.log`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Head><title>Console • {srvName || id}</title></Head>
      <NavBar />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex gap-6">
          <ServerSidebar serverId={sid} current="console" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold">Console • {srvName}</h1>
              <a href={sid ? `/servers/${sid}` : '#'} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Back to overview</a>
            </div>
            <section className="card p-4 mt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${connected ? 'bg-emerald-700/20 text-emerald-300 border-emerald-700' : 'bg-red-700/20 text-red-300 border-red-700'}`}>
                    {connected ? 'Connected to socket' : 'Disconnected'}
                  </span>
                  <button onClick={() => { setConsoleLines([]); startConsole(); fetchEvents(); }} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Reconnect</button>
                  <button onClick={stopConsole} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Stop</button>
                  <button onClick={() => setConsoleLines([])} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Clear</button>
                  <button onClick={downloadBuffer} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Download</button>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />
                    Wrap
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
                    Auto-scroll
                  </label>
                  <button
                    onClick={async () => {
                      try {
                        const res = await api.get(`/servers/${id}/logs-last`, { params: { tail: 400 } });
                        const logs = (res.data?.logs || '').toString();
                        if (logs) {
                          setConsoleLines(prev => [...prev, '--- last logs ---', logs, '--- end ---']);
                        } else {
                          setConsoleLines(prev => [...prev, 'No recent logs']);
                        }
                      } catch (e: any) {
                        setConsoleLines(prev => [...prev, e?.response?.data?.error ? `Logs error: ${e.response.data.error}` : 'Logs fetch failed']);
                      }
                    }}
                    className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800"
                  >
                    Fetch last logs
                  </button>
                </div>
              </div>

              {hint === 'minecraft_eula_required' && (
                <div className="mt-3 p-3 rounded border border-amber-800 bg-amber-900/30 text-amber-200">
                  This server appears to be a Minecraft server and the process exited. Type <span className="font-semibold">true</span> below to accept the EULA and it will restart.
                </div>
              )}
              {hint === 'missing_container' && (
                <div className="mt-3 p-3 rounded border border-slate-800 bg-slate-900/40 text-slate-300">
                  The server container is missing on the node. Starting will schedule provisioning to recreate it.
                </div>
              )}

              {events.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs subtle mb-1">Recent events</div>
                  <ul className="text-xs bg-slate-800/60 rounded border border-slate-700 divide-y divide-slate-700">
                    {events.slice(0, 5).map((ev) => (
                      <li key={ev.id} className="px-3 py-2">
                        <span className="text-slate-300">{ev.type}</span>
                        {ev.message ? <span className="text-slate-500"> — {ev.message}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <pre
                ref={viewRef}
                className={`mt-3 text-xs bg-slate-900 rounded p-3 overflow-auto border border-slate-800 ${wrap ? 'whitespace-pre-wrap' : 'whitespace-pre'}`}
                style={{ minHeight: 320, maxHeight: 600 }}
              >
                {consoleLines.length ? consoleLines.join('\n') : 'Connecting…'}
              </pre>
              <div className="mt-3 flex gap-2">
                <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="Type command here…" className="input flex-1" onKeyDown={(e) => { if (e.key === 'Enter') runCmd(); }} />
                <button onClick={runCmd} disabled={busy || !cmd.trim()} className={`px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>Run</button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}