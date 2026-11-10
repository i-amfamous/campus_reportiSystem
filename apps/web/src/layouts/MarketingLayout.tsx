import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, GraduationCap, Menu, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ThemeToggle } from '../lib/theme';

const LINKS = [
  { to: '/#product', label: 'Platform' },
  { to: '/#roles', label: 'For your role' },
  { to: '/#service', label: 'Service targets' },
  { to: '/#faq', label: 'FAQ' },
];

function getHomeTarget(auth: ReturnType<typeof useAuth>): string {
  if (!auth.isAuthenticated) return '/login';
  if (auth.hasRole('SUPER_ADMIN') || auth.hasRole('ADMIN')) return '/admin/dashboard';
  if (auth.isStaff) return '/staff';
  return '/dashboard';
}

const PILL =
  'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

export function MarketingLayout() {
  const auth = useAuth();
  const target = getHomeTarget(auth);
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;
    const element = document.getElementById(location.hash.slice(1));
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, location.pathname]);

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg dark:focus:bg-slate-900 dark:focus:text-slate-100"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-slate-900/5 bg-[#fafafa]/85 backdrop-blur-xl dark:border-white/5 dark:bg-slate-950/85">
        <div className="mx-auto flex h-16 max-w-[1140px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Campus Resolve home">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-600 text-white shadow-sm shadow-brand-600/25">
              <GraduationCap className="h-5 w-5" aria-hidden />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[15px] font-semibold tracking-[-0.01em] text-slate-950 dark:text-white">
                Campus Resolve
              </span>
              <span className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                Famous Tech
              </span>
            </span>
          </Link>

          <nav aria-label="Marketing navigation" className="hidden items-center gap-7 lg:flex">
            {LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 sm:flex">
            <ThemeToggle />
            {auth.isAuthenticated ? (
              <Link
                to={target}
                className={`${PILL} bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200`}
              >
                Open dashboard
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <>
                <NavLink
                  to="/login"
                  className="rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                >
                  Sign in
                </NavLink>
                <Link
                  to="/register"
                  className={`${PILL} bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200`}
                >
                  Get started
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10 lg:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open ? (
          <div className="border-t border-slate-900/5 bg-[#fafafa] px-5 pb-5 pt-3 dark:border-white/5 dark:bg-slate-950 lg:hidden">
            <nav aria-label="Mobile marketing navigation" className="grid gap-1">
              {LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-900/5 dark:text-slate-200 dark:hover:bg-white/5"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="mt-4 flex items-center gap-2">
              {auth.isAuthenticated ? (
                <Link
                  to={target}
                  className={`${PILL} flex-1 bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200`}
                >
                  Open dashboard
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </Link>
              ) : (
                <>
                  <NavLink
                    to="/login"
                    className={`${PILL} flex-1 ring-1 ring-inset ring-slate-900/10 hover:bg-slate-900/5 dark:ring-white/15 dark:hover:bg-white/5`}
                  >
                    Sign in
                  </NavLink>
                  <Link
                    to="/register"
                    className={`${PILL} flex-1 bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200`}
                  >
                    Get started
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

      <footer className="relative isolate overflow-hidden border-t border-slate-900/5 bg-[#fafafa] dark:border-white/5 dark:bg-slate-950">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-80 bg-[radial-gradient(50rem_22rem_at_18%_100%,rgba(64,123,217,0.16),transparent_70%),radial-gradient(40rem_18rem_at_78%_100%,rgba(255,190,140,0.18),transparent_70%),radial-gradient(34rem_16rem_at_52%_100%,rgba(45,212,191,0.14),transparent_70%)] dark:bg-[radial-gradient(45rem_20rem_at_20%_100%,rgba(64,123,217,0.18),transparent_72%)]"
        />

        <div className="mx-auto grid max-w-[1140px] gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-600 text-white">
                <GraduationCap className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-slate-950 dark:text-white">
                Campus Resolve
              </span>
            </Link>
            <p className="max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Student academic issue reporting and resolution for Famous Tech University. One
              channel, a clear owner, and a record of every action.
            </p>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <ShieldCheck className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden />
              Verified accounts. Audit-ready by design.
            </div>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { label: 'Platform', href: '/#product' },
              { label: 'How it works', href: '/#how-it-works' },
              { label: 'For your role', href: '/#roles' },
              { label: 'Service targets', href: '/#service' },
            ]}
          />
          <FooterColumn
            title="Support"
            links={[
              { label: 'Help and FAQ', href: '/help' },
              { label: 'Sign in', href: '/login' },
              { label: 'Create an account', href: '/register' },
              { label: 'Report an issue', href: '/login' },
            ]}
          />
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Contact</h2>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li>Famous Tech University</li>
              <li>Tesano, Accra</li>
              <li>
                <a
                  href="mailto:help.acad@live.famoustech.edu.gh"
                  className="transition-colors hover:text-slate-950 dark:hover:text-white"
                >
                  help.acad@live.famoustech.edu.gh
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-900/5 dark:border-white/5">
          <div className="mx-auto flex max-w-[1140px] flex-col gap-2 px-5 py-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 dark:text-slate-400">
            <p>© {new Date().getFullYear()} Campus Resolve. Built by Famous Tech.</p>
            <p>One channel. One owner. One record.</p>
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
      <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{title}</h2>
      <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              to={link.href}
              className="transition-colors hover:text-slate-950 dark:hover:text-white"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
