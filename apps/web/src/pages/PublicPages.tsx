import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  GraduationCap,
  Inbox,
  Layers3,
  LayoutDashboard,
  MessagesSquare,
  ShieldCheck,
  Star,
  UserCog,
  Users,
  Zap,
} from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Input } from '../components/ui';
import { FoldedProofSection } from '../components/FoldedProof';
import { useAuth } from '../lib/auth';

const FAQS: Array<{ question: string; answer: string }> = [
  {
    question: 'Who can file a report?',
    answer:
      'Any student with a verified email address. Staff accounts use the same sign-in page; a staff role replaces the student role on your account.',
  },
  {
    question: 'What should I include in a report?',
    answer:
      'State what happened, when it happened, the course or transaction involved, and what you have already tried. Screenshots or receipts help. Never include passwords, PINs or full card details.',
  },
  {
    question: 'Who can see my report?',
    answer:
      'The staff of the department that handles your issue. Internal staff notes are never shown to students. Administrators can see reports for audit and support purposes.',
  },
  {
    question: 'How long will resolution take?',
    answer:
      'Each department publishes a service target. The default is a first response within 8 hours and resolution within 72 hours. You can see the target and the current state of your report at any time.',
  },
  {
    question: 'Can I withdraw or reopen a report?',
    answer:
      'You can withdraw a report while it is still awaiting assignment, and you can reopen a resolved report if the issue persists. Reopening resets the service target and notifies the officer.',
  },
  {
    question: 'What if I do not receive the verification email?',
    answer:
      'Check your spam folder and confirm you used the right email address. A super administrator can resend the verification message from the staff administration area.',
  },
  {
    question: 'Does this system change my grades?',
    answer:
      'No. Campus Resolve records and tracks the handling of an issue. Academic outcomes remain the responsibility of authorised institutional decision-makers.',
  },
];

const DEPARTMENTS = [
  'Academic Affairs',
  'ICT Support',
  'Student Finance',
  'Registration',
  'Examinations',
  'Estate and Facilities',
];

const ROLES = [
  {
    id: 'students',
    label: 'Students',
    icon: GraduationCap,
    title: 'A clear answer, without the queue',
    description:
      'One reference number, one live thread and one place to see who is working on the issue and what happens next.',
    points: ['Live status and next step', 'Reply in the same thread', 'Reopen if the problem returns'],
  },
  {
    id: 'officers',
    label: 'Officers',
    icon: UserCog,
    title: 'A queue that tells you what is due',
    description:
      'Cases arrive with the context, the service clock and the student history already attached, ordered by what needs attention first.',
    points: ['Clear ownership', 'Reminders before a breach', 'Internal notes stay internal'],
  },
  {
    id: 'heads',
    label: 'Department heads',
    icon: Users,
    title: 'The truth about your department',
    description:
      'Workload, overdue cases, escalations and satisfaction in one view, without waiting for a monthly summary.',
    points: ['Live department metrics', 'Escalation history', 'Service target performance'],
  },
  {
    id: 'administrators',
    label: 'Administrators',
    icon: ShieldCheck,
    title: 'Control without the spreadsheets',
    description:
      'Institution-wide visibility with the roles, exports and audit trail a serious service needs.',
    points: ['Global analytics', 'Role-based access', 'Exportable audit trail'],
  },
];

const TESTIMONIALS = [
  {
    quote:
      'I stopped emailing three different offices. I filed one report, saw who owned it, and knew when to expect a reply.',
    name: 'Ama S.',
    role: 'BSc Computer Science, Level 400',
  },
  {
    quote:
      'The queue tells me what is due, what is late and what needs a reply. That used to live in my head and a spreadsheet.',
    name: 'Kwame B.',
    role: 'Registration Officer',
  },
  {
    quote:
      'For the first time I can see a service target across every department, not just the one that sends me a monthly summary.',
    name: 'Dr. N. Yeboah',
    role: 'Head, Academic Affairs',
  },
];

const CAPABILITIES = [
  { icon: ShieldCheck, label: 'Student email verification' },
  { icon: Building2, label: 'Department routing' },
  { icon: Clock3, label: 'Service targets' },
  { icon: MessagesSquare, label: 'Public and internal replies' },
  { icon: FileText, label: 'Audit trail' },
  { icon: Layers3, label: 'CSV and PDF exports' },
];

function getHomeTarget(auth: ReturnType<typeof useAuth>): string {
  if (!auth.isAuthenticated) return '/login';
  if (auth.hasRole('SUPER_ADMIN') || auth.hasRole('ADMIN')) return '/admin/dashboard';
  if (auth.isStaff) return '/staff';
  return '/dashboard';
}

type CtaVariant = 'primary' | 'secondary' | 'invert' | 'outline' | 'dark-outline';

const CTA_VARIANTS: Record<CtaVariant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700 dark:focus-visible:outline-brand-400',
  secondary:
    'bg-white text-slate-800 ring-1 ring-inset ring-slate-900/10 hover:bg-slate-50 focus-visible:outline-slate-500 dark:bg-slate-900 dark:text-slate-100 dark:ring-white/15 dark:hover:bg-slate-800',
  invert:
    'bg-[#ffffff] text-brand-800 hover:bg-brand-50 focus-visible:outline-white',
  outline:
    'bg-slate-950/25 text-white ring-1 ring-inset ring-white/40 hover:bg-slate-950/35 focus-visible:outline-white',
  'dark-outline':
    'text-white ring-1 ring-inset ring-white/25 hover:bg-white/10 focus-visible:outline-white',
};

function CtaLink({
  to,
  href,
  variant = 'primary',
  children,
  icon,
}: {
  to?: string;
  href?: string;
  variant?: CtaVariant;
  children: ReactNode;
  icon?: ReactNode;
}) {
  const className = `inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${CTA_VARIANTS[variant]}`;
  const content = (
    <>
      {children}
      {icon}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <a href={href} className={className}>
      {content}
    </a>
  );
}

export function HomePage() {
  const auth = useAuth();
  const target = getHomeTarget(auth);
  const primaryHref = auth.isAuthenticated ? target : '/register';
  const primaryLabel = auth.isAuthenticated ? 'Open your dashboard' : 'Get started free';
  const [roleIndex, setRoleIndex] = useState(0);
  const [quoteIndex, setQuoteIndex] = useState(0);

  const role = ROLES[roleIndex]!;
  const testimonial = TESTIMONIALS[quoteIndex]!;

  const moveQuote = (direction: number) => {
    setQuoteIndex((current) => (current + direction + TESTIMONIALS.length) % TESTIMONIALS.length);
  };

  return (
    <div className="overflow-x-clip bg-[#fafafa] dark:bg-slate-950">
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative isolate overflow-hidden">
        <div
          aria-hidden
          className="hero-grid pointer-events-none absolute inset-x-0 top-0 -z-20 h-[48rem]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-20rem] -z-10 h-[44rem] w-[62rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(64,123,217,0.20),rgba(64,123,217,0.06),transparent)] blur-2xl dark:bg-[radial-gradient(closest-side,rgba(64,123,217,0.28),transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-[58%] top-[10rem] -z-10 h-[26rem] w-[30rem] rounded-full bg-[radial-gradient(closest-side,rgba(255,190,140,0.28),transparent)] blur-3xl dark:bg-[radial-gradient(closest-side,rgba(20,184,166,0.16),transparent)]"
        />

        <div className="relative mx-auto max-w-[1140px] px-5 pt-20 text-center sm:px-8 lg:pt-28">
          <h1 className="mx-auto max-w-[56rem] text-[3rem] font-semibold leading-[0.98] tracking-[-0.05em] text-slate-950 sm:text-[4.4rem] lg:text-[5.6rem] dark:text-white">
            Report it once.{' '}
            <span className="block bg-gradient-to-r from-brand-700 via-brand-500 to-teal-600 bg-clip-text text-transparent dark:from-brand-300 dark:via-brand-400 dark:to-teal-300">
              See it through.
            </span>
          </h1>

          <p className="mx-auto mt-7 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg dark:text-slate-300">
            Campus Resolve gives every academic and administrative issue a clear owner, a service
            clock, and one shared record that students and staff can both trust.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <CtaLink to={primaryHref} icon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
              {primaryLabel}
            </CtaLink>
            <CtaLink
              href="#how-it-works"
              variant="secondary"
              icon={<ArrowRight className="h-4 w-4" aria-hidden />}
            >
              See how it works
            </CtaLink>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Verified accounts
            </span>
            <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" aria-hidden />
            <span>Free for students</span>
            <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" aria-hidden />
            <span>8-hour first response</span>
          </div>
        </div>

        <div className="relative mx-auto mt-14 max-w-[1180px] px-4 sm:px-8 lg:mt-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-10 -top-8 bottom-10 -z-10 rounded-[2.5rem] bg-gradient-to-b from-brand-200/40 via-white/20 to-transparent blur-2xl dark:from-brand-900/40 dark:via-slate-950 dark:to-transparent"
          />
          <HeroWorkspace />
        </div>

        <div className="relative border-y border-slate-900/5 bg-white/70 backdrop-blur dark:border-white/5 dark:bg-slate-900/50">
          <div className="mx-auto flex max-w-[1140px] flex-col gap-4 px-5 py-7 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Used by the offices students deal with most
            </p>
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {DEPARTMENTS.map((department) => (
                <li
                  key={department}
                  className="text-sm font-semibold tracking-[-0.01em] text-slate-700 dark:text-slate-300"
                >
                  {department}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <FoldedProofSection />

      {/* ------------------------------------------------------------------ */}
      {/* Role showcase                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section
        id="roles"
        className="scroll-mt-24 border-y border-slate-900/5 bg-white dark:border-white/5 dark:bg-slate-900/40"
      >
        <div className="mx-auto max-w-[1140px] px-5 py-24 sm:px-8 lg:py-32">
          <div className="max-w-3xl">
            <h2 className="text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.04em] text-slate-950 sm:text-[3rem] dark:text-white">
              One system,
              <span className="text-slate-500 dark:text-slate-400"> four points of view.</span>
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
              Students need clarity. Officers need a queue. Heads need the truth. Administrators
              need control. Everyone gets the view that makes the next step obvious.
            </p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-[15rem_1fr]">
            <div
              role="tablist"
              aria-label="Views by role"
              aria-orientation="vertical"
              className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
            >
              {ROLES.map((entry, index) => {
                const selected = index === roleIndex;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    id={`role-tab-${entry.id}`}
                    aria-selected={selected}
                    aria-controls={`role-panel-${entry.id}`}
                    onClick={() => setRoleIndex(index)}
                    className={
                      selected
                        ? 'flex shrink-0 items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-left text-sm font-semibold text-brand-800 dark:border-brand-500/30 dark:bg-brand-950/50 dark:text-brand-200'
                        : 'flex shrink-0 items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-left text-sm font-medium text-slate-600 transition-colors hover:border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:hover:border-slate-800 dark:hover:bg-slate-900'
                    }
                  >
                    <entry.icon className="h-4 w-4 shrink-0" aria-hidden />
                    {entry.label}
                  </button>
                );
              })}
            </div>

            <div
              role="tabpanel"
              id={`role-panel-${role.id}`}
              aria-labelledby={`role-tab-${role.id}`}
              className="grid gap-8 rounded-2xl border border-slate-900/10 bg-[#fafafa] p-7 sm:p-9 lg:grid-cols-[1fr_1.05fr] lg:items-center dark:border-white/10 dark:bg-slate-950/60"
            >
              <div>
                <h3 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-3xl dark:text-white">
                  {role.title}
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-300">
                  {role.description}
                </p>
                <ul className="mt-6 space-y-3">
                  {role.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
                        <Check className="h-3 w-3" aria-hidden />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>

              <RolePreview roleId={role.id} />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Service band                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section id="service" className="scroll-mt-24 bg-[#0a1220] text-white">
        <div className="mx-auto max-w-[1140px] px-5 py-24 sm:px-8 lg:py-28">
          <div className="grid gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <h2 className="max-w-xl text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-[3rem]">
                Service you can measure,{' '}
                <span className="block text-slate-400">not guess at.</span>
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-400">
                Targets, breaches and closures are measured the same way in every department, so a
                status update is never a matter of opinion.
              </p>
              <div className="mt-9">
                <CtaLink
                  href="#how-it-works"
                  variant="dark-outline"
                  icon={<ArrowRight className="h-4 w-4" aria-hidden />}
                >
                  See the process
                </CtaLink>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 ring-1 ring-inset ring-white/10">
              {[
                { value: '8h', label: 'First response target' },
                { value: '72h', label: 'Resolution target' },
                { value: '100%', label: 'Actions audited' },
                { value: '6', label: 'Departments connected' },
              ].map((stat) => (
                <div key={stat.label} className="bg-[#0a1220] px-6 py-8 sm:px-8">
                  <dt className="text-sm text-slate-400">{stat.label}</dt>
                  <dd className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Process                                                            */}
      {/* ------------------------------------------------------------------ */}
      <section id="how-it-works" className="scroll-mt-24">
        <div className="mx-auto max-w-[1140px] px-5 py-24 sm:px-8 lg:py-32">
          <div className="max-w-3xl">
            <h2 className="text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.04em] text-slate-950 sm:text-[3rem] dark:text-white">
              From report to resolution,
              <span className="text-slate-500 dark:text-slate-400"> in four clear steps.</span>
            </h2>
          </div>

          <ol className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-slate-900/10 bg-slate-200/70 sm:grid-cols-2 lg:grid-cols-4 dark:border-white/10 dark:bg-slate-800">
            {[
              {
                title: 'Sign in with your student email',
                description:
                  'Verified accounts keep the channel trusted. No forms lost in an inbox, no anonymous reports to chase.',
                icon: GraduationCap,
              },
              {
                title: 'Describe the issue once',
                description:
                  'Pick a category, add the details that matter and attach a receipt or screenshot if you have one.',
                icon: FileText,
              },
              {
                title: 'Follow the clock',
                description:
                  'Watch the first response and resolution targets, then read every update in the same thread.',
                icon: Clock3,
              },
              {
                title: 'Confirm the outcome',
                description:
                  'Close the loop with feedback, or reopen the report if the problem returns. The record stays complete.',
                icon: CheckCircle2,
              },
            ].map((step) => (
              <li key={step.title} className="bg-white p-7 dark:bg-slate-900">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-brand-500">
                  <step.icon className="h-4 w-4" aria-hidden />
                </span>
                <h3 className="mt-6 text-base font-semibold tracking-[-0.01em] text-slate-950 dark:text-white">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Testimonial carousel                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-y border-slate-900/5 bg-white dark:border-white/5 dark:bg-slate-900/40">
        <div className="mx-auto grid max-w-[1140px] gap-10 px-5 py-24 sm:px-8 lg:grid-cols-[0.7fr_1.3fr] lg:py-28">
          <div>
            <h2 className="text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.04em] text-slate-950 sm:text-[2.6rem] dark:text-white">
              The record{' '}
              <span className="block text-slate-500 dark:text-slate-400">changes the conversation.</span>
            </h2>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              A resolution is more than a status change. It is the moment a student stops worrying
              and a department stops chasing.
            </p>
          </div>

          <div aria-live="polite">
            <figure className="rounded-2xl border border-slate-900/10 bg-[#fafafa] p-8 sm:p-10 dark:border-white/10 dark:bg-slate-950/60">
              <div className="flex gap-0.5" aria-label="Five out of five">
                {[0, 1, 2, 3, 4].map((star) => (
                  <Star
                    key={star}
                    className="h-4 w-4 fill-amber-400 text-amber-400"
                    aria-hidden
                  />
                ))}
              </div>
              <blockquote className="mt-6 text-xl leading-snug tracking-[-0.02em] text-slate-900 sm:text-2xl dark:text-slate-100">
                &ldquo;{testimonial.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-6 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800 dark:bg-brand-900/60 dark:text-brand-200">
                    {testimonial.name
                      .split(' ')
                      .map((part) => part[0])
                      .join('')}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {testimonial.name}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{testimonial.role}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => moveQuote(-1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    aria-label="Previous testimonial"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <span className="min-w-[3.5rem] text-center text-sm tabular-nums text-slate-500 dark:text-slate-400">
                    {quoteIndex + 1} / {TESTIMONIALS.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveQuote(1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    aria-label="Next testimonial"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Capabilities strip                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <div className="mx-auto max-w-[1140px] px-5 py-16 sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="max-w-md text-lg font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
              Built around the way campus work already happens.
            </h2>
            <ul className="flex flex-wrap gap-2.5">
              {CAPABILITIES.map((capability) => (
                <li
                  key={capability.label}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-white px-4 py-2 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
                >
                  <capability.icon className="h-4 w-4 text-brand-600 dark:text-brand-300" aria-hidden />
                  {capability.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* FAQ                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section
        id="faq"
        className="scroll-mt-24 border-y border-slate-900/5 bg-white dark:border-white/5 dark:bg-slate-900/40"
      >
        <div className="mx-auto grid max-w-[1140px] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-32">
          <div>
            <h2 className="text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.04em] text-slate-950 sm:text-[2.6rem] dark:text-white">
              Before you file{' '}
              <span className="block text-slate-500 dark:text-slate-400">your first report.</span>
            </h2>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Privacy, timelines and what happens after you submit. The full help centre has the
              rest.
            </p>
            <div className="mt-7">
              <CtaLink
                to="/help"
                variant="secondary"
                icon={<ArrowRight className="h-4 w-4" aria-hidden />}
              >
                Visit the help centre
              </CtaLink>
            </div>
          </div>

          <div className="space-y-3">
            {FAQS.slice(0, 5).map((entry) => (
              <details
                key={entry.question}
                className="group rounded-xl border border-slate-900/10 bg-[#fafafa] px-5 transition-colors open:border-brand-300 dark:border-white/10 dark:bg-slate-950/50 dark:open:border-brand-500/40"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-slate-950 [&::-webkit-details-marker]:hidden dark:text-white">
                  {entry.question}
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180 dark:text-slate-400"
                    aria-hidden
                  />
                </summary>
                <p className="pb-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {entry.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Final call to action                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="mx-auto max-w-[1140px] px-5 py-24 sm:px-8 lg:py-28">
        <div className="relative isolate overflow-hidden rounded-[1.75rem] bg-[linear-gradient(125deg,#1f3a6e_0%,#2a56a5_40%,#2f63c0_68%,#1f6f78_100%)] px-6 py-16 text-center shadow-lift sm:px-14 lg:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(45rem_20rem_at_50%_0%,rgba(255,255,255,0.2),transparent_70%)]"
          />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-[2rem] font-semibold leading-[1.1] tracking-[-0.04em] text-white sm:text-[2.75rem]">
              Nothing important should get lost in the system.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-brand-50 sm:text-base">
              Sign in with your student email, describe the issue once, and follow every update in
              one place. Departments get the same clear record.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <CtaLink to={primaryHref} variant="invert" icon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
                {primaryLabel}
              </CtaLink>
              <CtaLink href="#product" variant="outline">
                Explore the platform
              </CtaLink>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Homepage previews                                                          */
/* -------------------------------------------------------------------------- */

function HeroWorkspace() {
  return (
    <div aria-hidden="true" className="relative">
      <div className="absolute -left-6 top-36 z-20 hidden w-56 rounded-xl border border-slate-900/10 bg-white p-3.5 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.5)] xl:block dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold text-slate-950 dark:text-white">First response</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">2h 14m, within target</p>
          </div>
        </div>
      </div>

      <div className="absolute -right-6 bottom-28 z-20 hidden w-60 rounded-xl border border-slate-900/10 bg-white p-3.5 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.5)] xl:block dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
            <Zap className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold text-slate-950 dark:text-white">
              CR-2026-001042 resolved
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Student confirmed the outcome</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-t-2xl border border-slate-900/10 bg-white shadow-[0_50px_120px_-60px_rgba(15,23,42,0.6)] dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-300 dark:bg-rose-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300 dark:bg-amber-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 dark:bg-emerald-500/70" />
          </div>
          <div className="mx-auto flex w-full max-w-md items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <span className="truncate">app.famoustech.edu.gh/operations</span>
          </div>
          <div className="hidden w-12 sm:block" />
        </div>

        <div className="grid lg:grid-cols-[13.5rem_1fr]">
          <aside className="hidden border-r border-slate-200 bg-slate-50/60 p-4 lg:block dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex items-center gap-2 px-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
                <GraduationCap className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                Campus Resolve
              </span>
            </div>

            <nav className="mt-6 space-y-1">
              {[
                { icon: LayoutDashboard, label: 'Operations', active: true },
                { icon: Inbox, label: 'Work queue', active: false },
                { icon: Building2, label: 'Departments', active: false },
                { icon: BarChart3, label: 'Analytics', active: false },
                { icon: FileText, label: 'Audit log', active: false },
              ].map((item) => (
                <span
                  key={item.label}
                  className={
                    item.active
                      ? 'flex items-center gap-2.5 rounded-lg bg-brand-50 px-2.5 py-2 text-xs font-semibold text-brand-800 dark:bg-brand-950/60 dark:text-brand-200'
                      : 'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400'
                  }
                >
                  <item.icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </span>
              ))}
            </nav>

            <div className="mt-8 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Service health</p>
              <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                All systems normal
              </div>
            </div>
          </aside>

          <div className="p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold tracking-[-0.02em] text-slate-950 dark:text-white">
                  Operations
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Institution-wide service view
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 sm:inline-flex dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                  Last 14 days
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  <Bell className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                  AO
                </span>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
              {[
                {
                  label: 'Open reports',
                  value: '20',
                  hint: '+4 this week',
                  tone: 'text-slate-950 dark:text-white',
                },
                {
                  label: 'Overdue',
                  value: '16',
                  hint: 'Needs attention',
                  tone: 'text-rose-600 dark:text-rose-400',
                },
                {
                  label: 'Resolved',
                  value: '67%',
                  hint: '41 closed',
                  tone: 'text-emerald-600 dark:text-emerald-400',
                },
                {
                  label: 'First response',
                  value: '2h 14m',
                  hint: 'Within 8h target',
                  tone: 'text-slate-950 dark:text-white',
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/50"
                >
                  <dt className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</dt>
                  <dd
                    className={`mt-1 text-xl font-semibold tabular-nums tracking-[-0.02em] ${stat.tone}`}
                  >
                    {stat.value}
                  </dd>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{stat.hint}</p>
                </div>
              ))}
            </dl>

            <div className="mt-3 grid gap-3 xl:grid-cols-[1.65fr_1fr]">
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Report volume
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Created and resolved
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 rounded-md border border-slate-200 p-0.5 dark:border-slate-800">
                    {['24h', '7d', '14d'].map((range) => (
                      <span
                        key={range}
                        className={
                          range === '14d'
                            ? 'rounded bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white'
                            : 'px-2 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400'
                        }
                      >
                        {range}
                      </span>
                    ))}
                  </div>
                </div>

                <svg
                  viewBox="0 0 520 132"
                  preserveAspectRatio="none"
                  className="mt-4 h-32 w-full"
                >
                  <defs>
                    <linearGradient id="heroCreatedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#407bd9" stopOpacity="0.34" />
                      <stop offset="100%" stopColor="#407bd9" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[24, 62, 100].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      y1={y}
                      x2="520"
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-slate-800"
                      strokeDasharray="4 5"
                      strokeWidth="1"
                    />
                  ))}
                  <path
                    d="M0 98 C30 92 45 76 75 80 C105 84 120 60 150 64 C180 68 195 48 225 52 C255 56 270 38 300 44 C330 50 345 30 375 34 C405 38 420 22 450 27 C480 32 500 18 520 22 L520 132 L0 132 Z"
                    fill="url(#heroCreatedGradient)"
                  />
                  <path
                    d="M0 98 C30 92 45 76 75 80 C105 84 120 60 150 64 C180 68 195 48 225 52 C255 56 270 38 300 44 C330 50 345 30 375 34 C405 38 420 22 450 27 C480 32 500 18 520 22"
                    fill="none"
                    stroke="#407bd9"
                    strokeWidth="2.25"
                  />
                  <path
                    d="M0 112 C30 108 45 100 75 102 C105 104 120 88 150 91 C180 94 195 78 225 81 C255 84 270 68 300 72 C330 76 345 58 375 62 C405 66 420 48 450 52 C480 56 500 42 520 45"
                    fill="none"
                    stroke="#14b8a6"
                    strokeWidth="2"
                    strokeDasharray="5 5"
                  />
                </svg>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>28 Oct</span>
                  <span>3 Nov</span>
                  <span>10 Nov</span>
                </div>
              </div>

              <div className="hidden rounded-xl border border-slate-200 bg-white p-4 xl:block dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Needs attention
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
                    View queue
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {[
                    {
                      ref: 'CR-2026-001052',
                      subject: 'Results tab never loads',
                      department: 'ICT Support',
                      status: 'Escalated',
                      dot: 'bg-rose-500',
                    },
                    {
                      ref: 'CR-2026-001040',
                      subject: 'Missing ACC 210 result',
                      department: 'Academic Affairs',
                      status: 'Due today',
                      dot: 'bg-amber-500',
                    },
                    {
                      ref: 'CR-2026-001037',
                      subject: 'Surname on admission letter',
                      department: 'Registration',
                      status: 'New',
                      dot: 'bg-brand-500',
                    },
                  ].map((item, index) => (
                    <div
                      key={item.ref}
                      className={
                        index === 0
                          ? 'flex items-start gap-2.5'
                          : 'flex items-start gap-2.5 border-t border-slate-100 pt-3 dark:border-slate-800'
                      }
                    >
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                          {item.ref}
                        </p>
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                          {item.subject}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {item.department}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#fafafa] via-[#fafafa]/80 to-transparent dark:from-slate-950 dark:via-slate-950/80" />
    </div>
  );
}

function RolePreview({ roleId }: { roleId: string }) {
  if (roleId === 'officers') {
    return (
      <div aria-hidden="true" className="rounded-xl border border-slate-900/10 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">My queue</p>
          <span className="text-xs text-slate-500 dark:text-slate-400">8 open</span>
        </div>
        <ul className="mt-3 space-y-2">
          {[
            { ref: 'CR-2026-001052', subject: 'Results tab never loads', tone: 'Escalated' },
            { ref: 'CR-2026-001040', subject: 'Missing ACC 210 result', tone: 'Due today' },
            { ref: 'CR-2026-001037', subject: 'Surname on admission letter', tone: 'New' },
          ].map((item) => (
            <li
              key={item.ref}
              className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/50"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                  {item.ref}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                  {item.tone}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                {item.subject}
              </p>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (roleId === 'heads') {
    return (
      <div aria-hidden="true" className="rounded-xl border border-slate-900/10 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Department workload</p>
          <span className="text-xs text-slate-500 dark:text-slate-400">Open reports</span>
        </div>
        <ul className="mt-4 space-y-3.5">
          {[
            { name: 'Academic Affairs', open: 12, width: '82%' },
            { name: 'ICT Support', open: 9, width: '64%' },
            { name: 'Student Finance', open: 6, width: '45%' },
            { name: 'Registration', open: 4, width: '30%' },
          ].map((department) => (
            <li key={department.name}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">{department.name}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">
                  {department.open}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                  style={{ width: department.width }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (roleId === 'administrators') {
    return (
      <div aria-hidden="true" className="rounded-xl border border-slate-900/10 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Operations overview</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-400/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            Live
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: 'Open', value: '20' },
            { label: 'Overdue', value: '16' },
            { label: 'Resolution', value: '67%' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/50"
            >
              <dt className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-950 dark:text-white">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
        <ul className="mt-4 space-y-2">
          {['Audit trail export ready', 'Role change recorded', 'Settings updated'].map((entry) => (
            <li
              key={entry}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/50"
            >
              <span className="text-slate-700 dark:text-slate-200">{entry}</span>
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="rounded-xl border border-slate-900/10 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">My report</p>
        <span className="text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
          CR-2026-001042
        </span>
      </div>
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/50">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Missing CSC 305 result
          </p>
          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/15 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-400/20">
            In progress
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Academic Affairs, first response sent
        </p>
      </div>
      <ul className="mt-3 space-y-2">
        {['Report received', 'Owner assigned', 'Reply from Academic Affairs'].map((entry, index) => (
          <li key={entry} className="flex items-center gap-2.5 text-sm">
            <span
              className={
                index === 2
                  ? 'flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white dark:bg-brand-500'
                  : 'flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white'
              }
            >
              <Check className="h-3 w-3" aria-hidden />
            </span>
            <span className="text-slate-700 dark:text-slate-200">{entry}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HelpPage() {
  const [query, setQuery] = useState('');
  const filtered = FAQS.filter(
    (entry) =>
      query.trim() === '' ||
      entry.question.toLowerCase().includes(query.toLowerCase()) ||
      entry.answer.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Help &amp; frequently asked questions
        </h1>
        <p className="text-sm text-slate-500">
          How reporting works, who can see your report, and what to expect from the resolution
          process.
        </p>
      </header>

      <Card>
        <CardBody className="p-4">
          <label htmlFor="faq-search" className="sr-only">
            Search the help articles
          </label>
          <Input
            id="faq-search"
            placeholder="Search help articles"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </CardBody>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardBody className="p-6 text-center text-sm text-slate-600">
            No articles match “{query}”. Try a different word or contact your department directly.
          </CardBody>
        </Card>
      ) : (
        filtered.map((entry) => (
          <Card key={entry.question}>
            <CardHeader title={entry.question} />
            <CardBody>
              <p className="text-sm leading-relaxed text-slate-600">{entry.answer}</p>
            </CardBody>
          </Card>
        ))
      )}

      <Card>
        <CardHeader title="Still stuck?" />
        <CardBody className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-600">
            If your report is not moving, reply on the report itself to escalate it to a department
            head.
          </p>
          <Link to="/tickets">
            <Button variant="secondary">Go to my reports</Button>
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
