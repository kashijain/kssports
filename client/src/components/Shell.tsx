import {
  Bell,
  Cog,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Receipt,
  Search,
  Settings,
  ShoppingBag,
  Store,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../auth';
import { api } from '../lib/api';
import { fail } from '../lib/toast';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/invoices/new', label: 'Billing / Create Invoice', icon: Plus, end: false },
  { to: '/sales', label: 'Sales', icon: ShoppingBag, end: false },
  { to: '/customers', label: 'Customers', icon: Users, end: false },
  { to: '/products', label: 'Products', icon: Package, end: true },
  { to: '/purchases', label: 'Wholesale Purchases', icon: Truck, end: false },
  { to: '/invoices', label: 'Retail Sales', icon: Store, end: true },
  { to: '/machines', label: 'Machines', icon: Cog, end: false },
  { to: '/expenses', label: 'Expenses', icon: Wallet, end: false },
  { to: '/reports', label: 'Reports', icon: Receipt, end: false },
  { to: '/documents', label: 'Documents', icon: FolderOpen, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
];

interface SearchResult {
  invoices: { id: string; number: string; customerName: string; href: string }[];
  customers: { id: string; name: string; href: string }[];
  products: { id: string; name: string; href: string }[];
}

interface Note {
  id: string;
  title: string;
  detail: string;
  href: string;
}

export function Shell() {
  const { user, business, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchResult | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
    setHits(null);
    setNotesOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    api<{ notifications: Note[] }>('/api/reports/notifications')
      .then((data) => setNotes(data.notifications))
      .catch(() => setNotes([]));
  }, [location.pathname]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setHits(null);
      return;
    }
    const handle = window.setTimeout(() => {
      api<SearchResult>(`/api/reports/search?q=${encodeURIComponent(q)}`)
        .then(setHits)
        .catch(() => setHits(null));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  async function signOut() {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      fail(error);
    }
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
              isActive ? 'bg-clay text-white' : 'text-paper/80 hover:bg-white/5 hover:text-white'
            }`
          }
        >
          <link.icon size={18} />
          {link.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden bg-sidebar text-paper md:flex md:min-h-screen md:flex-col">
        <Brand logo={business?.logoUrl} />
        {nav}
        <p className="px-6 pb-6 text-xs text-paper/50">{business?.name}</p>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" className="absolute inset-0 bg-ink/50" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-72 flex-col bg-sidebar text-paper">
            <div className="flex items-center justify-between pr-3">
              <Brand logo={business?.logoUrl} />
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-full p-2 text-paper">
                <X size={18} />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      ) : null}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-paper/95 px-3 py-3 backdrop-blur md:px-6">
          <button type="button" className="rounded-full p-2 md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search invoices, customers, products"
              className="w-full rounded-full border border-line bg-card py-2 pl-9 pr-3 text-sm outline-none ring-clay/30 focus:ring-2"
            />
            {hits ? (
              <div className="absolute left-0 right-0 top-12 z-20 max-h-80 overflow-auto rounded-2xl border border-line bg-card p-2 shadow-xl">
                <SearchGroup title="Invoices" empty="No invoices" rows={hits.invoices.map((row) => ({ href: row.href, label: row.number, detail: row.customerName }))} />
                <SearchGroup title="Customers" empty="No customers" rows={hits.customers.map((row) => ({ href: row.href, label: row.name, detail: '' }))} />
                <SearchGroup title="Products" empty="No products" rows={hits.products.map((row) => ({ href: row.href, label: row.name, detail: '' }))} />
              </div>
            ) : null}
          </div>
          <div className="relative">
            <button type="button" aria-label="Notifications" className="relative rounded-full p-2 hover:bg-ink/5" onClick={() => setNotesOpen((value) => !value)}>
              <Bell size={18} />
              {notes.length ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-clay" /> : null}
            </button>
            {notesOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-line bg-card p-2 shadow-xl">
                {notes.length === 0 ? <p className="px-2 py-3 text-sm text-muted">Nothing needs attention.</p> : null}
                {notes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className="block w-full rounded-xl px-3 py-2 text-left hover:bg-paper"
                    onClick={() => {
                      setNotesOpen(false);
                      navigate(note.href);
                    }}
                  >
                    <span className="block text-sm font-medium">{note.title}</span>
                    <span className="block text-xs text-muted">{note.detail}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="relative">
            <button type="button" className="max-w-40 truncate rounded-full px-3 py-2 text-sm font-semibold hover:bg-ink/5" onClick={() => setMenuOpen((value) => !value)}>
              {business?.name || user?.name}
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-52 rounded-2xl border border-line bg-card p-2 shadow-xl">
                <p className="px-3 py-2 text-xs text-muted">{user?.email}</p>
                <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-paper" onClick={() => navigate('/settings')}>
                  <Settings size={16} /> Settings
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-paper"
                  onClick={() => {
                    void signOut();
                    toast.dismiss();
                  }}
                >
                  <LogOut size={16} /> Log out
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <main className="px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Brand({ logo }: { logo?: string }) {
  return (
    <div className="px-5 py-5">
      <img src={logo || '/logo.png'} alt="KS Sports" className="mb-2 h-14 w-14 rounded-full object-cover" />
      <p className="font-serif text-3xl text-white">KS Sports</p>
      <p className="text-xs text-paper/60">Business & billing</p>
    </div>
  );
}

function SearchGroup({ title, rows, empty }: { title: string; rows: { href: string; label: string; detail: string }[]; empty: string }) {
  const navigate = useNavigate();
  return (
    <div className="mb-1">
      <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      {rows.length === 0 ? <p className="px-2 py-1 text-sm text-muted">{empty}</p> : null}
      {rows.map((row) => (
        <button key={row.href + row.label} type="button" className="block w-full rounded-xl px-2 py-1.5 text-left text-sm hover:bg-paper" onClick={() => navigate(row.href)}>
          <span className="font-medium">{row.label}</span>
          {row.detail ? <span className="ml-2 text-muted">{row.detail}</span> : null}
        </button>
      ))}
    </div>
  );
}
