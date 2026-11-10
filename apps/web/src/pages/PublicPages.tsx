import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Gauge,
  GraduationCap,
  Layers3,
  LifeBuoy,
  MessagesSquare,
  Quote,
  ShieldCheck,
  Star,
  UserCog,
  Users,
  Zap,
} from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Input } from '../components/ui';
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

const TRUST_STATS = [
  { value: '8h', label: 'First-response target' },
  { value: '72h', label: 'Resolution target' },
  { value: '100%', label: 'Actions audited' },
  { value: '6', label: 'Departments connected' },
];

const SOLUTIONS = [
  {
    icon: FileText,
    index: '01',
    title: 'Report once, reach the right desk',
    description:
      'Students describe the issue once. Campus Resolve attaches the correct department, category and service target automatically, with no forwarding chains and no guessing who to email.',
    accent: 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300',
  },
  {
    icon: Gauge,
    index: '02',
    title: 'Put every case on a clock',
    description:
      'First response and resolution targets are visible from day one. Reminders, escalation and breach tracking keep a report moving even when the week gets busy.',
    accent: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  },
  {
    icon: MessagesSquare,
    index: '03',
    title: 'One shared record of the truth',
    description:
      'Public replies keep students informed. Internal notes stay with staff. Every status change, assignment and resolution is written to an audit trail that cannot be edited away.',
    accent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
];

const STEPS = [
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
      'Watch the first response and resolution targets, read every update and reply in the same thread.',
    icon: Clock3,
  },
  {
    title: 'Confirm the outcome',
    description:
      'Close the loop with feedback, or reopen the report if the problem returns. The record stays complete.',
    icon: CheckCircle2,
  },
];

const AUDIENCES = [
  {
    icon: GraduationCap,
    title: 'Students',
    description:
      'A single place to raise an academic or administrative issue and see exactly where it stands.',
    points: ['One report, one reference', 'Live status and reply thread', 'Reopen if it comes back'],
    featured: true,
  },
  {
    icon: UserCog,
    title: 'Department officers',
    description:
      'A prioritised queue with the context, service clocks and replies already in one place.',
    points: ['Clear ownership', 'Reminders before a breach', 'Internal notes stay internal'],
  },
  {
    icon: Users,
    title: 'Department heads',
    description:
      'See workload, overdue cases, escalations and satisfaction without asking for a status report.',
    points: ['Live department metrics', 'Escalation history', 'SLA performance'],
  },
  {
    icon: ShieldCheck,
    title: 'Administrators',
    description:
      'Institution-wide visibility with the controls, exports and audit trail a serious service needs.',
    points: ['Global analytics', 'Role-based access', 'Exportable audit trail'],
  },
];

const TESTIMONIALS = [
  {
    quote:
      'I stopped emailing three different offices. I filed one report, saw who owned it, and knew when to expect a reply.',
    name: 'Ama S.',
    role: 'BSc Computer Science · Level 400',
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

function getHomeTarget(auth: ReturnType<typeof useAuth>): string {
  if (!auth.isAuthenticated) return '/login';
  if (auth.hasRole('SUPER_ADMIN') || auth.hasRole('ADMIN')) return '/admin/dashboard';
  if (auth.isStaff) return '/staff';
  return '/dashboard';
}

export function HomePage() {
  const auth = useAuth();
  const target = getHomeTarget(auth);
  const primaryHref = auth.isAuthenticated ? target : '/register';
  const primaryLabel = auth.isAuthenticated ? 'Open your dashboard' : 'Get started free';

  return (
    <div className="overflow-hidden">
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative isolate">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-64 left-1/2 h-[44rem] w-[80rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(64,123,217,0.30),rgba(64,123,217,0.07),transparent)] blur-2xl dark:opacity-30" />
          <div className="absolute -right-40 top-10 h-[30rem] w-[30rem] rounded-full bg-sky-200/40 blur-3xl dark:bg-brand-800/20 dark:opacity-40" />
          <div className="absolute -left-40 bottom-0 h-[26rem] w-[26rem] rounded-full bg-amber-100/60 blur-3xl dark:opacity-10" />
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-b from-transparent to-white dark:to-slate-900" />
        </div>

        <div className="mx-auto grid max-w-7xl gap-16 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:pb-28 lg:pt-20">
          <div className="relative">
            <h1 className="text-[2.9rem] font-semibold leading-[0.98] tracking-[-0.04em] text-slate-900 sm:text-6xl lg:text-[4.4rem]">
              Report it once.
              <span className="mt-1 block text-brand-600 dark:text-brand-300">
                See it through.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Campus Resolve is the single place to raise an academic or administrative issue, and
              the clearest way to watch a department own it until it is closed. No lost emails. No
              mystery queues. Just a visible path to a resolution.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link to={primaryHref}>
                <Button size="lg" icon={<ArrowUpRight className="h-4 w-4" />}>
                  {primaryLabel}
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button size="lg" variant="secondary" icon={<ArrowRight className="h-4 w-4" />}>
                  See how it works
                </Button>
              </a>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2
                  className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
                Verified student accounts
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2
                  className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
                Free for students
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2
                  className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
                8-hour first-response target
              </span>
            </div>
          </div>

          <ReportPreview />
        </div>

        <div className="border-y border-slate-200/70 bg-white/70 backdrop-blur">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-8 px-5 py-9 sm:px-8 lg:grid-cols-4">
            {TRUST_STATS.map((stat, index) => (
              <div
                key={stat.label}
                className={
                  index === 0
                    ? ''
                    : 'border-l-2 border-brand-200 pl-4 dark:border-brand-800 lg:pl-6'
                }
              >
                <p className="text-3xl font-semibold tracking-[-0.02em] text-slate-900 sm:text-4xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Solutions                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section id="solutions" className="scroll-mt-24">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900 sm:text-5xl">
              Every issue gets an owner,
              <span className="text-brand-600 dark:text-brand-300">
                {' '}
                and a paper trail.
              </span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-slate-600">
              Most campus complaints do not fail because nobody cares. They fail because ownership,
              time and context live in different places. Campus Resolve puts all three in one
              record.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {SOLUTIONS.map((solution) => (
              <article
                key={solution.title}
                className="group relative flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lift"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl ${solution.accent}`}
                  >
                    <solution.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-2xl font-semibold text-slate-200 transition-colors group-hover:text-brand-200 dark:text-slate-700">
                    {solution.index}
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-semibold tracking-tight text-slate-900">
                  {solution.title}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600">
                  {solution.description}
                </p>
                <a
                  href="#dashboard"
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-300"
                >
                  See it in the dashboard
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Operations preview                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section
        id="dashboard"
        className="scroll-mt-24 border-y border-slate-200/70 bg-slate-50"
      >
        <div className="mx-auto grid max-w-7xl gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-28">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900 sm:text-5xl">
              See the whole campus.
              <span className="text-brand-600 dark:text-brand-300">
                {' '}
                Spot the delay before it becomes a complaint.
              </span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-slate-600">
              Administrators and department heads get the same source of truth: what is open, what
              is late, who owns it and how students feel about the outcome.
            </p>

            <ul className="mt-8 space-y-4">
              {[
                'Live volume, status mix and priority across every department.',
                'First-response and resolution breach counts, not just averages.',
                'Department workload and satisfaction in a single view.',
              ].map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
                    <Check className="h-3 w-3" aria-hidden />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <Link to={target} className="mt-8 inline-flex">
              <Button variant="secondary" icon={<ArrowRight className="h-4 w-4" />}>
                {auth.isAuthenticated ? 'Open the operations view' : 'Sign in to explore'}
              </Button>
            </Link>
          </div>

          <OperationsPreview />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* How it works                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section id="how-it-works" className="scroll-mt-24">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900 sm:text-5xl">
              From report to resolution in
              <span className="text-brand-600 dark:text-brand-300">
                {' '}
                four clear steps.
              </span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-slate-600">
              No training required. The process is the same for a missing result, a fee query or a
              portal problem.
            </p>
          </div>

          <div className="relative mt-14">
            <div
              aria-hidden
              className="absolute left-[12%] right-[12%] top-[3.25rem] hidden h-px bg-gradient-to-r from-transparent via-brand-200 to-transparent dark:via-brand-800 lg:block"
            />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <article
                  key={step.title}
                  className="relative rounded-3xl border border-slate-200 bg-white p-6 shadow-soft"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-brand-600">
                      <step.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="text-3xl font-semibold text-brand-200 dark:text-brand-800">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-base font-semibold tracking-tight text-slate-900">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Audiences                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section
        id="audiences"
        className="scroll-mt-24 border-y border-slate-200/70 bg-slate-50"
      >
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900 sm:text-5xl">
              One system,
              <span className="text-brand-600 dark:text-brand-300">
                {' '}
                four points of view.
              </span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-slate-600">
              Students need clarity. Officers need a queue. Heads need the truth. Administrators
              need control. Everyone gets the view that makes their next step obvious.
            </p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            {AUDIENCES.map((audience) => (
              <article
                key={audience.title}
                className={
                  audience.featured
                    ? 'relative overflow-hidden rounded-3xl bg-brand-600 p-8 text-white shadow-lift dark:bg-brand-700'
                    : 'relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-soft'
                }
              >
                {audience.featured ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"
                  />
                ) : null}
                <span
                  className={
                    audience.featured
                      ? 'flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white'
                      : 'flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
                  }
                >
                  <audience.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3
                  className={
                    audience.featured
                      ? 'mt-6 text-xl font-semibold tracking-tight text-white'
                      : 'mt-6 text-xl font-semibold tracking-tight text-slate-900'
                  }
                >
                  {audience.title}
                </h3>
                <p
                  className={
                    audience.featured
                      ? 'mt-3 text-sm leading-relaxed text-brand-100'
                      : 'mt-3 text-sm leading-relaxed text-slate-600'
                  }
                >
                  {audience.description}
                </p>
                <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {audience.points.map((point) => (
                    <li
                      key={point}
                      className={
                        audience.featured
                          ? 'flex items-center gap-2 text-sm text-brand-50'
                          : 'flex items-center gap-2 text-sm text-slate-700'
                      }
                    >
                      <Check
                        className={
                          audience.featured
                            ? 'h-4 w-4 shrink-0 text-white'
                            : 'h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300'
                        }
                        aria-hidden
                      />
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Testimonials                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900 sm:text-5xl">
              Trusted to protect
              <span className="text-brand-600 dark:text-brand-300">
                {' '}
                what matters.
              </span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-slate-600">
              A resolution is more than a status change. It is the moment a student stops worrying
              and a department stops chasing.
            </p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {TESTIMONIALS.map((testimonial) => (
              <figure
                key={testimonial.name}
                className="relative flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-soft"
              >
                <Quote
                  className="h-8 w-8 text-brand-100 dark:text-brand-900"
                  aria-hidden
                />
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-slate-700">
                  “{testimonial.quote}”
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
                    {testimonial.name
                      .split(' ')
                      .map((part) => part[0])
                      .join('')}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{testimonial.name}</p>
                    <p className="text-xs text-slate-500">{testimonial.role}</p>
                  </div>
                  <span className="ml-auto flex gap-0.5" aria-label="Five out of five">
                    {[0, 1, 2, 3, 4].map((star) => (
                      <Star
                        key={star}
                        className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                        aria-hidden
                      />
                    ))}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-slate-400">
            Composite feedback from pilot interviews and resolved-report surveys.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* FAQ                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section id="faq" className="scroll-mt-24 border-y border-slate-200/70 bg-slate-50">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900 sm:text-4xl">
              Before you file
              <span className="text-brand-600 dark:text-brand-300">
                {' '}
                your first report.
              </span>
            </h2>
            <p className="mt-5 text-sm leading-relaxed text-slate-600">
              Privacy, timelines and what happens after you submit. The full help centre has the
              rest.
            </p>
            <Link to="/help" className="mt-6 inline-flex">
              <Button variant="secondary" icon={<LifeBuoy className="h-4 w-4" />}>
                Visit the help centre
              </Button>
            </Link>
          </div>

          <div className="space-y-3">
            {FAQS.slice(0, 5).map((entry) => (
              <details
                key={entry.question}
                className="group rounded-2xl border border-slate-200 bg-white px-5 transition-colors open:border-brand-200"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  {entry.question}
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <p className="pb-5 text-sm leading-relaxed text-slate-600">{entry.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Final call to action                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="mx-auto max-w-7xl px-5 pb-20 pt-14 sm:px-8 sm:pb-24">
        <div className="relative isolate overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-600 via-brand-600 to-brand-800 px-6 py-14 text-center shadow-lift sm:px-14 lg:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-sky-300/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_55%)]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-3xl text-3xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
              Nothing important should get
              <span >
                {' '}
                lost in the system.
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-brand-100 sm:text-base">
              Sign in with your student email, describe the issue once, and follow every update in
              one place. Departments get the same clear record.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to={primaryHref}>
                <Button
                  size="lg"
                  className="bg-white text-brand-700 hover:bg-brand-50"
                  icon={<ArrowUpRight className="h-4 w-4" />}
                >
                  {primaryLabel}
                </Button>
              </Link>
              <a href="#solutions">
                <Button
                  size="lg"
                  variant="secondary"
                  className="border-white/30 bg-transparent text-white hover:bg-white/10"
                >
                  Explore the platform
                </Button>
              </a>
            </div>
            <p className="mt-6 text-xs text-brand-200">
              Verified accounts · Free for students · Built for GCTU
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Homepage previews                                                          */
/* -------------------------------------------------------------------------- */

function ReportPreview() {
  const steps = [
    { label: 'Submitted', time: '09:12', state: 'done' },
    { label: 'Acknowledged by Academic Affairs', time: '11:26', state: 'done' },
    { label: 'Reviewing your mark sheet', time: 'Today', state: 'active' },
    { label: 'Resolution and confirmation', time: 'Expected Thu', state: 'todo' },
  ] as const;

  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[36rem] lg:max-w-none">
      <div className="absolute -inset-5 -z-10 rounded-[3rem] bg-gradient-to-br from-brand-200/70 via-sky-100/60 to-white blur-2xl dark:from-brand-900/50 dark:via-slate-900 dark:to-slate-900" />

      <div className="relative rounded-[1.9rem] border border-slate-200/80 bg-white p-2 shadow-[0_45px_100px_-45px_rgba(33,33,43,0.45)] dark:border-slate-700">
        <div className="rounded-[1.5rem] bg-slate-50/90 p-5 dark:bg-slate-950/50">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-300" />
            <span className="h-2 w-2 rounded-full bg-amber-300" />
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
            <span className="ml-2 truncate rounded-md bg-white px-2 py-1 text-[10px] text-slate-400 ring-1 ring-slate-200">
              campusresolve.app/reports/CR-2026-001042
            </span>
          </div>

          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                CR-2026-001042
              </p>
              <h3 className="mt-1 text-sm font-semibold leading-snug text-slate-900">
                Missing CSC 305 examination result
              </h3>
            </div>
            <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900">
              In progress
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {[
              { icon: Building2, label: 'Academic Affairs' },
              { icon: Layers3, label: 'High priority' },
              { icon: Clock3, label: 'Responded in 2h 14m' },
            ].map((chip) => (
              <span
                key={chip.label}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200"
              >
                <chip.icon className="h-3 w-3 text-brand-500" />
                {chip.label}
              </span>
            ))}
          </div>

          <div className="mt-5 space-y-0 rounded-2xl border border-slate-200 bg-white p-4">
            {steps.map((step, index) => (
              <div key={step.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={
                      step.state === 'done'
                        ? 'flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white'
                        : step.state === 'active'
                          ? 'flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white ring-4 ring-brand-100 dark:ring-brand-950'
                          : 'flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-200 bg-white'
                    }
                  >
                    {step.state === 'done' ? (
                      <Check className="h-3 w-3" />
                    ) : step.state === 'active' ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    ) : null}
                  </span>
                  {index < steps.length - 1 ? (
                    <span
                      className={
                        step.state === 'done'
                          ? 'my-1 h-6 w-px bg-emerald-200'
                          : 'my-1 h-6 w-px bg-slate-200'
                      }
                    />
                  ) : null}
                </div>
                <div className="flex flex-1 items-start justify-between gap-3 pb-3">
                  <p
                    className={
                      step.state === 'todo'
                        ? 'text-xs text-slate-400'
                        : 'text-xs font-medium text-slate-700'
                    }
                  >
                    {step.label}
                  </p>
                  <p className="shrink-0 text-[10px] text-slate-400">{step.time}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-white dark:bg-brand-700">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-medium text-slate-300">Resolution target</span>
              <span className="font-semibold">21h remaining</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-brand-300 to-emerald-400" />
            </div>
            <p className="mt-2 text-[10px] text-slate-400">
              72-hour service target · You will be notified at every step
            </p>
          </div>
        </div>
      </div>

      <div className="absolute -right-3 top-24 hidden w-44 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl sm:block lg:-right-8">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-semibold text-slate-900">First response</p>
            <p className="text-[10px] text-slate-500">2h 14m · within target</p>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-6 -left-3 hidden w-52 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl sm:block lg:-left-10">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Zap className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-semibold text-slate-900">Auto-routed to Academic Affairs</p>
            <p className="text-[10px] text-slate-500">Matched by category in 0.4s</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OperationsPreview() {
  const bars = [34, 52, 41, 66, 57, 78, 63, 84, 71, 92, 76, 88, 68, 94];
  const departments = [
    { name: 'Academic Affairs', open: 12, width: '82%' },
    { name: 'ICT Support', open: 9, width: '64%' },
    { name: 'Student Finance', open: 6, width: '45%' },
    { name: 'Registration', open: 4, width: '30%' },
  ];

  return (
    <div aria-hidden="true" className="relative">
      <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-brand-100 via-white to-amber-50 blur-2xl dark:from-brand-900/40 dark:via-slate-900 dark:to-slate-900" />

      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_35px_90px_-45px_rgba(33,33,43,0.4)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Operations overview</p>
            <p className="text-[10px] text-slate-400">Institution-wide · last 14 days</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live
          </span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { label: 'Open', value: '18', tone: 'text-slate-900' },
            { label: 'Overdue', value: '5', tone: 'text-rose-600' },
            { label: 'Resolved', value: '82%', tone: 'text-emerald-600' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-3 dark:border-slate-800"
            >
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {stat.label}
              </p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${stat.tone}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-800">Report volume</p>
            <p className="text-[10px] text-slate-400">Created vs resolved</p>
          </div>
          <div className="mt-4 flex h-28 items-end gap-1.5">
            {bars.map((height, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-brand-200 to-brand-500 dark:from-brand-800 dark:to-brand-500"
                  style={{ height: `${height}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[9px] text-slate-400">
            <span>28 Oct</span>
            <span>10 Nov</span>
          </div>
        </div>

        <div className="mt-4 space-y-3 rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-800">Department workload</p>
            <p className="text-[10px] text-slate-400">Open reports</p>
          </div>
          {departments.map((department) => (
            <div key={department.name}>
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-medium text-slate-600">{department.name}</span>
                <span className="tabular-nums text-slate-400">{department.open}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                  style={{ width: department.width }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute -bottom-5 right-4 hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl sm:block">
        <p className="text-[10px] font-semibold text-slate-900">Avg. first response</p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums text-brand-600">3h 42m</p>
      </div>
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

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">404</p>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Page not found</h1>
      <p className="text-sm text-slate-500">
        The page you asked for does not exist. It may have been moved, or the link may be
        incomplete.
      </p>
      <div className="flex justify-center gap-2">
        <Link to="/">
          <Button>Go to the start page</Button>
        </Link>
        <Link to="/help">
          <Button variant="secondary">Open help</Button>
        </Link>
      </div>
    </div>
  );
}
