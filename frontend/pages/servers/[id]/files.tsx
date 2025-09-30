import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import NavBar from '../../../components/NavBar';
import ServerSidebar from '../../../components/ServerSidebar';
import { useRequireAuth } from '../../../utils/guards';
import api from '../../../utils/api';
import { useToast } from '../../../components/Toast';
import { getUserRole } from '../../../utils/auth';

type FsItem = { name: string; type: 'file' | 'dir'; size?: number | null; mtime?: string | Date };

export default function ServerFilesPage() {
  useRequireAuth();
  const toast = useToast();
  const router = useRouter();
  const { id } = router.query;

  const role = useMemo(() => getUserRole(), []);
  const [srvName, setSrvName] = useState<string>('');
  const [fmPath, setFmPath] = useState('/');
  const [fmItems, setFmItems] = useState<FsItem[]>([]);
  const [uploading, setUploading] = useState(false);

  const fetchServer = async () => {
    if (!id) return;
    try {
      const res = await api.get(`/servers/${id}`);
      setSrvName(res.data?.name || String(id));
    } catch {}
  };

  useEffect(() => { fetchServer(); }, [id]);

  const loadDir = async (p: string) => {
    if (!id) return;
    try {
      const res = await api.get(`/servers/${id}/fs/list`, { params: { path: p } });
      setFmItems((res.data?.items || []) as FsItem[]);
      setFmPath(res.data?.path || p);
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Failed to list directory', 'error');
    }
  };

  useEffect(() => { if (id) loadDir('/'); }, [id]);

  const goTo = async (name: string, type: 'file' | 'dir') => {
    if (type === 'dir') {
      const next = fmPath.endsWith('/') ? `${fmPath}${name}` : `${fmPath}/${name}`;
      await loadDir(next);
    }
  };

  const upDir = async () => {
    if (fmPath === '/' || !fmPath) return;
    const parts = fmPath.split('/').filter(Boolean);
    parts.pop();
    const next = '/' + parts.join('/');
    await loadDir(next || '/');
  };

  const handleUpload = async (files: FileList | null) => {
    if (!id || !files || !files.length) return;
    setUploading(true);
    try {
      const f = files[0];
      const buf = await f.arrayBuffer();
      const base64 = typeof window !== 'undefined' ? btoa(String.fromCharCode(...new Uint8Array(buf))) : Buffer.from(buf).toString('base64');
      await api.post(`/servers/${id}/fs/upload`, { filename: f.name, contentBase64: base64 }, { params: { path: fmPath } });
      toast.show('File uploaded', 'success');
      await loadDir(fmPath);
    } catch (e: any) {
      toast.show(e?.response?.data?.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const downloadItem = async (name: string) => {
    if (!id) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      const p = fmPath.endsWith('/') ? `${fmPath}${name}` : `${fmPath}/${name}`;
      const res = await fetch(`${api.defaults.baseURL}/servers/${id}/fs/download?path=${encodeURIComponent(p)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.show(e?.message || 'Download failed', 'error');
    }
  };

  return (
    <>
      <Head><title>Files • {srvName || id}</title></Head>
      <NavBar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex gap-6">
          <ServerSidebar serverId={id || ''} current="files" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold">Files • {srvName}</h1>
              <a href={`/servers/${id}`} className="px-3 py-1 rounded border border-slate-800 hover:bg-slate-800">Back to overview</a>
            </div>
            <section className="card p-4 mt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={upDir} className="px-2 py-1 rounded border border-slate-800 hover:bg-slate-800">Up</button>
                  <span className="text-sm text-slate-400">{fmPath}</span>
                </div>
                <label className={`px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 cursor-pointer ${uploading ? 'opacity-60 cursor-not-allowed' : ''}`}>
                  <input type="file" className="hidden" onChange={(e) => handleUpload(e.target.files)} disabled={uploading} />
                  Upload
                </label>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-1">
                {fmItems.map((it) => (
                  <div key={`${fmPath}/${it.name}`} className="flex items-center justify-between px-2 py-1 rounded hover:bg-slate-800/50">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-1.5 py-0.5 rounded border border-slate-700">{it.type === 'dir' ? 'DIR' : 'FILE'}</span>
                      <button onClick={() => goTo(it.name, it.type)} className="hover:underline text-left">{it.name}</button>
                    </div>
                    <div className="flex items-center gap-2">
                      {it.type === 'file' && (
                        <button onClick={() => downloadItem(it.name)} className="text-xs px-2 py-0.5 rounded border border-slate-800 hover:bg-slate-800">Download</button>
                      )}
                    </div>
                  </div>
                ))}
                {!fmItems.length && <div className="text-sm text-slate-400">Empty directory</div>}
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}