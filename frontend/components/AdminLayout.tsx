import { ReactNode } from 'react';
import NavBar from './NavBar';
import SystemStatus from './SystemStatus';
import AdminSidebar from './AdminSidebar';

type Props = {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
};

export default function AdminLayout({ title, children, actions }: Props) {
  return (
    <>
      <NavBar />
      <main className="container px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <div className="w-full max-w-sm ml-4">
            <SystemStatus />
          </div>
        </div>
        <div className="flex gap-6">
          <AdminSidebar />
          <div className="flex-1 min-w-0">
            {actions && <div className="mb-4">{actions}</div>}
            {children}
          </div>
        </div>
      </main>
    </>
  );
}