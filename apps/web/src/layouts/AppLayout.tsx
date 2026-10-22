import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  LifeBuoy,
  ShieldCheck,
  Building2,
  Tags,
  Users,
  ScrollText,
  FileDown,
  Settings,
  Menu,
  X,
  LogOut,
  UserRound,
  ClipboardList,
  DatabaseBackup,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Button, cn } from '../components/ui';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  visible: (auth: ReturnType<typeof useAuth>) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/dashboard',
    label: 'My dashboard',
    icon: LayoutDashboard,
    visible: (auth) => !auth.isStaff,
  },
  {
    to: '/tickets',
    label: 'My reports',
    icon: FileText,
    visible: (auth) => !auth.isStaff,
  },
  {
    to: '/staff',
    label: 'Staff overview',
    icon: LayoutDashboard,
    visible: (auth) => auth.isStaff,
  },
  {
    to: '/staff/queue',
    label: 'Work queue',
    icon: ClipboardList,
    visible: (auth) => auth.isStaff,
  },
  {
    to: '/admin/dashboard',
    label: 'Operations',
    icon: ShieldCheck,
    visible: (auth) => auth.isAdmin,
  },
  {
    to: '/admin/departments',
    label: 'Departments',
    icon: Building2,
    visible: (auth) => auth.hasPermission('department:manage'),
  },
  {
    to: '/admin/categories',
    label: 'Categories',
    icon: Tags,
    visible: (auth) => auth.hasPermission('category:manage'),
  },
  {
    to: '/admin/users',
    label: 'Staff & users',
    icon: Users,
    visible: (auth) => auth.hasPermission('user:manage'),
  },
  {
    to: '/admin/audit',
    label: 'Audit trail',
    icon: ScrollText,
    visible: (auth) => auth.hasPermission('audit:read'),
  },
  {
    to: '/admin/reports',
    label: 'Reports & exports',
    icon: FileDown,
    visible: (auth) => auth.hasPermission('export:create'),
  },
  {
    to: '/admin/settings',
    label: 'System settings',
    icon: Settings,
    visible: (auth) => auth.hasPermission('settings:manage'),
  },
  {
    to: '/admin/backups',
    label: 'Backup & restore',
    icon: DatabaseBackup,
    visible: (auth) => auth.hasPermission('system:backup'),
  },
];

export function AppLayout() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = NAV_ITEMS.filter((item) => item.visible(auth));

  const handleSignOut = async () => {
    await auth.signOut();
    navigate('/', { replace: true });
  };

  const nav = (
    <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 p-3">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/staff' || item.to === '/dashboard'}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )
          }
        >
          <item.icon className="h-4 w-4 shrink-0" aria-hidden />
          {item.label}
        </NavLink>
      ))}{' '}
      <NavLink
        to="/help"
        onClick={() => setMobileOpen(false)}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            isActive
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
          )
        }
      >
        <LifeBuoy className="h-4 w-4 shrink-0" aria-hidden />
        Help &amp; FAQ
      </NavLink>
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="flex h-14 items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="flex items-baseline gap-2">
              <NavLink to="/" className="text-sm font-semibold tracking-tight text-slate-900">
                Campus Resolve
              </NavLink>
              <span className="hidden text-xs text-slate-500 sm:inline">
                Student Academic Issue Reporting
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NavLink
              to="/profile"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              <UserRound className="h-4 w-4 text-slate-500" aria-hidden />
              <span className="hidden max-w-[14rem] truncate sm:inline">
                {auth.user?.fullName ?? 'Account'}
              </span>
            </NavLink>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              icon={<LogOut className="h-4 w-4" />}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
          <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col">{nav}</div>
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-slate-900/40"
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl">
              <div className="sticky top-0 flex h-14 items-center justify-between border-b border-slate-200 px-4">
                <NavLink to="/" onClick={() => setMobileOpen(false)} className="text-sm font-semibold text-slate-900">
                  Campus Resolve
                </NavLink>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close navigation"
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {nav}
            </div>
          </div>
        ) : null}

        <main id="main-content" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <NavLink to="/" className="text-sm font-semibold tracking-tight text-slate-900">
            Campus Resolve
          </NavLink>
          <div className="flex items-center gap-4">
            <NavLink to="/help" className="text-xs text-slate-600 hover:text-slate-900">
              Help
            </NavLink>
            <NavLink to="/login" className="text-xs text-slate-600 hover:text-slate-900">
              Sign in
            </NavLink>
          </div>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-10">
        <div className="w-full max-w-6xl">
          <Outlet />
        </div>
      </main>
      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500">
        Academic outcomes remain the responsibility of authorised institutional decision-makers.
      </footer>
    </div>
  );
}
