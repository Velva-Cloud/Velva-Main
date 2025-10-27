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
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [cmd, setCmd] = useState('');
  const [busy, setBusy] = useState(false);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchServer = async () => {
    if (!id) return;
    try {
      const res = await api.get(`/servers/${id}`);
      setSrvName(res.data?.name || String(id));
    } catch {}
  };

  useEffect(() => { fetchServer(); }, [id]);

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
        toast.show('Failed to open console stream', 'error');
        return;
      }
      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';
      const pump = async (): Promise<void> => {
        const r = await reader.read();
        if (r.done) {
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
            // If server sent a comment or ping, show it subtly
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
    }
  };

  const stopConsole = () => {
    try { abortRef.current?.abort(); } catch {}
    abortRef.current = null;
    try { readerRef.current?.cancel(); } catch {}
    readerRef.current = null;
  };

  useEffect(() => {
    if (id) {
      setConsoleLines([]);
      startConsole();
    }
    return () => stopConsole();
  }, [id]);

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

  return (
    <>
      <Head><title>Console • {srvName || id}</title></Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex gap-6">
          <ServerSidebar serverId={sid} current="console" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold">Console • {srvName}</h1>
              <a href={sid ? `/servers/${sid}` : '#'} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Back to overview</a>
            </div>
            <section className="card p-4 mt-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <button onClick={() => { setConsoleLines([]); startConsole(); }} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Reconnect</button>
                  <button onClick={stopConsole} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Stop</button>
                </div>
              </div>
              <pre className="mt-3 text-xs bg-slate-800/70 rounded p-3 overflow-auto" style={{ minHeight: 240, maxHeight: 480 }}>
                {consoleLines.length ? consoleLines.join('\n') : 'Connecting…'}
              </pre>
              <div className="mt-3 flex gap-2">
                <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="Enter command" className="input flex-1" onKeyDown={(e) => { if (e.key === 'Enter') runCmd(); }} />
                <button onClick={runCmd} disabled={busy || !cmd.trim()} className={`px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 ${busy ? 'opacity-60 cursor-not-allowed' : ''}`}>Run</button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}