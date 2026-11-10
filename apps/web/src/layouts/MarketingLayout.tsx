import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  GraduationCap,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '../components/ui';
import { useAuth } from '../lib/auth';
import { ThemeToggle } from '../lib/theme';

const LINKS = [
  { href: '#solutions', label: 'Solutions' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#audiences', label: 'For campus' },
  { href: '#faq', label: 'FAQ' },
];

function getHomeTarget(auth: ReturnType<typeof useAuth>): string {
  if (!auth.isAuthenticated) return '/login';
  if (auth.hasRole('SUPER_ADMIN') || auth.hasRole('ADMIN')) return '/admin/dashboard';
  if (auth.isStaff) return '/staff';
  return '/dashboard';
}

export function MarketingLayout() {
  const auth = useAuth();
  const target = getHomeTarget(auth);
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Campus Resolve home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/30">
              <GraduationCap className="h-5 w-5" aria-hidden />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[15px] font-semibold tracking-tight text-slate-900">
                Campus Resolve
              </span>
              <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
                GCTU
              </span>
            </span>
          </Link>

          <nav aria-label="Marketing navigation" className="hidden items-center gap-8 lg:flex">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 sm:flex">
            <ThemeToggle />
            {auth.isAuthenticated ? (
              <Link to={target}>
                <Button size="sm" icon={<ArrowUpRight className="h-4 w-4" />}>
                  Open dashboard
                </Button>
              </Link>
            ) : (
              <>
                <NavLink
                  to="/login"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
                >
                  Sign in
                </NavLink>
                <Link to="/register">
                  <Button size="sm" icon={<ArrowRight className="h-4 w-4" />}>
                    Get started
                  </Button>
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open ? (
          <div className="border-t border-slate-200 bg-white px-5 pb-5 pt-3 lg:hidden">
            <nav aria-label="Mobile marketing navigation" className="grid gap-1">
              {LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="mt-4 flex items-center gap-2">
              {auth.isAuthenticated ? (
                <Link to={target} className="flex-1">
                  <Button className="w-full" icon={<ArrowUpRight className="h-4 w-4" />}>
                    Open dashboard
                  </Button>
                </Link>
              ) : (
                <>
                  <NavLink to="/login" className="flex-1">
                    <Button variant="secondary" className="w-full">
                      Sign in
                    </Button>
                  </NavLink>
                  <Link to="/register" className="flex-1">
                    <Button className="w-full">Get started</Button>
                  </Link>
                </>
              )}
              <ThemeToggle />
            </div>
          </div>
        ) : null}
      </header>

      <main id="main-content">
        <Outlet />
      </main>

      <footer className="border-t border-slate-800 bg-slate-950 text-slate-400">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white">
                <GraduationCap className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-white">Campus Resolve</span>
            </Link>
            <p className="max-w-sm text-sm leading-relaxed text-slate-400">
              Student academic issue reporting and resolution for Ghana Communication Technology
              University. One channel, a clear owner, and a record of every action.
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 text-brand-400" aria-hidden />
              Verified accounts · Audit-ready by design
            </div>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { label: 'Solutions', href: '#solutions' },
              { label: 'How it works', href: '#how-it-works' },
              { label: 'For your role', href: '#audiences' },
              { label: 'Operations dashboard', href: '#dashboard' },
            ]}
          />
          <FooterColumn
            title="Support"
            links={[
              { label: 'Help & FAQ', href: '/help' },
              { label: 'Sign in', href: '/login' },
              { label: 'Create an account', href: '/register' },
              { label: 'Report an issue', href: '/login' },
            ]}
          />
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
              Contact
            </h2>
            <ul className="space-y-2 text-sm">
              <li>Ghana Communication Technology University</li>
              <li>Tesano, Accra</li>
              <li>
                <a
                  href="mailto:help.acad@live.gctu.edu.gh"
                  className="transition-colors hover:text-white"
                >
                  help.acad@live.gctu.edu.gh
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800/80">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p>© {new Date().getFullYear()} Campus Resolve. Built for GCTU.</p>
            <p>
              Academic outcomes remain the responsibility of authorised institutional
              decision-makers.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">{title}</h2>
      <ul className="space-y-2 text-sm">
        {links.map((link) => (
          <li key={link.label}>
            <a href={link.href} className="transition-colors hover:text-white">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
