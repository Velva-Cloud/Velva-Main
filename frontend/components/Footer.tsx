export default function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-800">
      <div className="container px-6 py-8 text-sm text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <img src="https://velvacloud.com/logo.png" alt="VelvaCloud" className="h-5 w-auto" />
          <span>© {new Date().getFullYear()} VelvaCloud</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/support/users" className="hover:text-sky-300">Support</a>
          <a href="/admin" className="hover:text-sky-300">Admin</a>
          <a href="mailto:support@velvacloud.com" className="hover:text-sky-300">Contact</a>
        </div>
      </div>
    </footer>
  );
}