import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type Toast = { id: number; message: string; type?: 'success' | 'error' | 'info' };
type ToastContextValue = {
  show: (message: string, type?: Toast['type']) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2 rounded shadow-md text-sm border ${
              t.type === 'success'
                ? 'bg-emerald-600/80 border-emerald-500 text-white'
                : t.type === 'error'
                ? 'bg-red-600/80 border-red-500 text-white'
                : 'bg-slate-800/80 border-slate-700 text-slate-100'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}