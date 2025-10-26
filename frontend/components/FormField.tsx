import { ReactNode } from 'react';

type Props = {
  label: string;
  error?: string | null;
  children: ReactNode;
  inline?: boolean;
};

export default function FormField({ label, error, children, inline }: Props) {
  return (
    <label className={`block ${inline ? '' : 'w-full'}`}>
      <div className="text-sm mb-1">{label}</div>
      {children}
      {error && <div className="mt-1 text-xs text-red-400">{error}</div>}
    </label>
  );
}