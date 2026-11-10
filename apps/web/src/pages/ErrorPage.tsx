import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  FileQuestion,
  Home,
  LifeBuoy,
  LockKeyhole,
  ServerCrash,
  ShieldAlert,
  TimerOff,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../components/ui';

type ErrorCopy = {
  title: string;
  description: string;
  icon: LucideIcon;
  actionLabel: string;
  actionHref: string;
};

const COPY: Record<number, ErrorCopy> = {
  400: {
    title: 'That request could not be read',
    description:
      'The information sent with this request was incomplete or malformed. Go back and try again.',
    icon: FileQuestion,
    actionLabel: 'Go to the start page',
    actionHref: '/',
  },
  401: {
    title: 'Please sign in to continue',
    description:
      'This page needs a verified session. Your session may have expired, or you may have signed out in another tab.',
    icon: LockKeyhole,
    actionLabel: 'Sign in',
    actionHref: '/login',
  },
  403: {
    title: 'You do not have access to this page',
    description:
      'Your account is signed in, but your role does not include this area. Ask an administrator if you need access.',
    icon: ShieldAlert,
    actionLabel: 'Go to my dashboard',
    actionHref: '/home',
  },
  404: {
    title: 'We could not find that page',
    description:
      'The link may be incomplete, or the page may have moved. Check the address and try again.',
    icon: Compass,
    actionLabel: 'Go to the start page',
    actionHref: '/',
  },
  405: {
    title: 'That action is not allowed here',
    description: 'The page exists, but it does not accept the request that was made. Go back and try again.',
    icon: FileQuestion,
    actionLabel: 'Go to the start page',
    actionHref: '/',
  },
  408: {
    title: 'The request took too long',
    description: 'The connection timed out before the page could load. Check your network and try again.',
    icon: TimerOff,
    actionLabel: 'Try again',
    actionHref: '',
  },
  409: {
    title: 'This record changed while you were working',
    description:
      'Someone else updated this item first. Reload the page to see the latest version before trying again.',
    icon: FileQuestion,
    actionLabel: 'Go to my dashboard',
    actionHref: '/home',
  },
  413: {
    title: 'That file is too large',
    description:
      'The upload was rejected because it is bigger than the limit. Reduce the file size and try again.',
    icon: FileQuestion,
    actionLabel: 'Go to my dashboard',
    actionHref: '/home',
  },
  415: {
    title: 'That file type is not supported',
    description:
      'Upload a supported document or image. The help centre lists the accepted formats.',
    icon: FileQuestion,
    actionLabel: 'Open help',
    actionHref: '/help',
  },
  422: {
    title: 'Some details need attention',
    description:
      'The form could not be processed as submitted. Go back, check the highlighted fields and try again.',
    icon: FileQuestion,
    actionLabel: 'Go back',
    actionHref: '',
  },
  423: {
    title: 'This account is locked',
    description:
      'Too many failed attempts locked the account temporarily. Wait a few minutes, or contact support if it stays locked.',
    icon: LockKeyhole,
    actionLabel: 'Open help',
    actionHref: '/help',
  },
  429: {
    title: 'Too many requests',
    description:
      'You have made several requests in a short time. Pause for a moment, then try again.',
    icon: TimerOff,
    actionLabel: 'Try again',
    actionHref: '',
  },
  500: {
    title: 'Something went wrong on our side',
    description:
      'The page could not finish loading. The incident has been logged, and nothing you submitted was lost.',
    icon: ServerCrash,
    actionLabel: 'Try again',
    actionHref: '',
  },
  502: {
    title: 'The service is briefly unavailable',
    description:
      'A dependent service did not respond. Wait a moment and retry the page.',
    icon: ServerCrash,
    actionLabel: 'Try again',
    actionHref: '',
  },
  503: {
    title: 'Campus Resolve is under maintenance',
    description:
      'The service is temporarily unavailable while maintenance is completed. Please try again shortly.',
    icon: ServerCrash,
    actionLabel: 'Try again',
    actionHref: '',
  },
  504: {
    title: 'The service took too long to respond',
    description:
      'A dependent service did not answer in time. Try again in a moment.',
    icon: TimerOff,
    actionLabel: 'Try again',
    actionHref: '',
  },
};

const FALLBACK: ErrorCopy = {
  title: 'This page could not be loaded',
  description:
    'Something interrupted the request. Go back and try again, or return to the start page.',
  icon: FileQuestion,
  actionLabel: 'Go to the start page',
  actionHref: '/',
};

export function ErrorPage({ status: forcedStatus }: { status?: number }) {
  const params = useParams();
  const navigate = useNavigate();
  const parsed = forcedStatus ?? Number(params.code ?? 404);
  const status = Number.isFinite(parsed) && parsed >= 400 && parsed <= 599 ? parsed : 500;
  const copy = COPY[status] ?? FALLBACK;
  const Icon = copy.icon;

  const primaryAction = copy.actionHref ? (
    <Link to={copy.actionHref}>
      <Button size="lg" icon={<ArrowRight className="h-4 w-4" />}>
        {copy.actionLabel}
      </Button>
    </Link>
  ) : (
    <Button size="lg" icon={<ArrowRight className="h-4 w-4" />} onClick={() => window.location.reload()}>
      {copy.actionLabel}
    </Button>
  );

  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[32rem] w-[62rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(64,123,217,0.16),transparent)] blur-2xl dark:opacity-40" />
        <div className="absolute -right-32 top-24 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl dark:bg-brand-800/20" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-white dark:to-slate-900" />
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-16rem)] max-w-3xl flex-col items-center justify-center px-5 py-20 text-center sm:px-8">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100 dark:bg-brand-950 dark:text-brand-300 dark:ring-brand-900">
          <Icon className="h-6 w-6" aria-hidden />
        </span>

        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
          Error {status}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-5xl">
          {copy.title}
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">{copy.description}</p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          {primaryAction}
          <Button
            size="lg"
            variant="secondary"
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => navigate(-1)}
          >
            Go back
          </Button>
          <Link to="/">
            <Button size="lg" variant="ghost" icon={<Home className="h-4 w-4" />}>
              Start page
            </Button>
          </Link>
        </div>

        <div className="mt-10 flex items-center gap-2 text-sm text-slate-500">
          <LifeBuoy className="h-4 w-4" aria-hidden />
          Still stuck?{' '}
          <Link to="/help" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300">
            Visit the help centre
          </Link>
        </div>
      </div>
    </section>
  );
}
