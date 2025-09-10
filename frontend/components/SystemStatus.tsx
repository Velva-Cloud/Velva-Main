import { useEffect, useState } from 'react';
import api from '../utils/api';

type SystemStatus = {
  db: { ok: boolean };
  redis: { configured: boolean; ok: boolean; message?: string };
  queue: { ok: boolean; message?: string };
  uptimeSec: number;
  timestamp: string;
};

export default function SystemStatus() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.get('/status/system')
      .then((res) => mounted && setStatus(res.data))
      .catch(() => mounted && setStatus(null))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const Item = ({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) => (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} aria-hidden="true" />
      <span className="text-sm">{label}</span>
      {hint && <span className="text-xs text-slate-400">({hint})</span>}
    </div>
  );

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm">System status</div>
        <div className="text-xs text-slate-400">{loading ? '...' : status ? `Updated ${new Date(status.timestamp).toLocaleTimeString()}` : 'Unavailable'}</div>
      </div>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {loading ? (
          <>
            <div className="h-5 bg-slate-800 rounded animate-pulse" />
            <div className="h-5 bg-slate-800 rounded animate-pulse" />
            <div className="h-5 bg-slate-800 rounded animate-pulse" />
          </>
        ) : status ? (
          <>
            <Item label="Database" ok={status.db.ok} />
            <Item label="Redis" ok={status.redis.configured ? status.redis.ok : false} hint={status.redis.configured ? status.redis.message : 'not configured'} />
            <Item label="Queue" ok={status.queue.ok} hint={status.queue.message} />
          </>
        ) : (
          <div className="col-span-full text-sm text-slate-400">Status endpoint unavailable</div>
        )}
      </div>
    </div>
  );
}