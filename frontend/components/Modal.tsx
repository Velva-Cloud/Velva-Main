import { useEffect } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClass?: string; // e.g. max-w-lg
};

export default function Modal({ open, onClose, title, children, footer, maxWidthClass = 'max-w-lg' }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      aria-modal="true"
      role="dialog"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative z-10 w-full ${maxWidthClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="font-semibold">{title}</div>
            <button
              onClick={onClose}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="px-4 py-4">{children}</div>
          {footer && <div className="px-4 py-3 border-t border-slate-800">{footer}</div>}
        </div>
      </div>
    </div>
  );
}