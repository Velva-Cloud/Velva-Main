import { ReactNode } from 'react';

type TableProps = {
  headers: ReactNode[];
  children: ReactNode;
};

export default function Table({ headers, children }: TableProps) {
  return (
    <div className="overflow-auto rounded border border-slate-800">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-900/60">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="text-left px-3 py-2 border-b border-slate-800 text-slate-300 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">{children}</tbody>
      </table>
    </div>
  );
}