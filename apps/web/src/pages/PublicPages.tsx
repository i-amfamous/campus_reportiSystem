import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, FileText, ShieldCheck, Users } from 'lucide-react';
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

const FEATURES = [
  {
    icon: FileText,
    title: 'Track every report',
    description:
      'Submit academic or administrative issues in one place and follow their progress from submission to resolution.',
  },
  {
    icon: Users,
    title: 'Routed to the right department',
    description:
      'Reports go straight to the department responsible for the issue, with clear ownership and accountability.',
  },
  {
    icon: ShieldCheck,
    title: 'Auditable by design',
    description:
      'Every action is recorded, replies are tracked, and internal notes stay visible only to authorised staff.',
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

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="space-y-6">
          <div className="space-y-3">
            {/* <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">
              Student Academic Issue Reporting and Resolution
            </p> */}
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
              Campus Resolve keeps every issue accountable until it&apos;s resolved.
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-slate-600">
              Submit reports, track responses in real time, and hold departments to a clear service
              standard. Students stay informed, staff stay organised, and nothing falls through the
              cracks.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link to={target}>
              <Button size="lg" icon={<ArrowRight className="h-4 w-4" />}>
                {auth.isAuthenticated ? 'Go to your dashboard' : 'Sign in to get started'}
              </Button>
            </Link>
            {!auth.isAuthenticated ? (
              <Link to="/register">
                <Button size="lg" variant="secondary">
                  Create a student account
                </Button>
              </Link>
            ) : null}
            <Link to="/help">
              <Button size="lg" variant="ghost">
                Browse FAQs
              </Button>
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Tracked from submission to closure</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Clear service targets per department</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Full audit trail for every action</span>
            </div>
          </div>
        </div>
        <Card className="overflow-hidden shadow-sm">
          <CardHeader
            title="Resolve issues without the back-and-forth"
            description="One channel, defined ownership, and visible updates for every report."
          />
          <CardBody className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Report submitted</p>
                  <p className="text-xs text-slate-500">
                    Routed to the correct department automatically
                  </p>
                </div>
                <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">
                  Submitted
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Acknowledged by staff</p>
                  <p className="text-xs text-slate-500">Ownership assigned with a due action</p>
                </div>
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                  In progress
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Update posted</p>
                  <p className="text-xs text-slate-500">
                    Students get clear feedback with the next step
                  </p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  Updated
                </span>
              </div>
            </div>
          </CardBody>
        </Card>
      </section>

      <section className="space-y-6">
        <div className="max-w-3xl space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Built for accountability
          </h2>
          <p className="text-base text-slate-600">
            Every report has an owner, a timeline, and a record. That means faster follow-up and
            fewer lost issues.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="h-full">
              <CardBody className="space-y-3 p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                  <feature.icon className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-slate-900">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-600">{feature.description}</p>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Help &amp; frequently asked questions
            </h2>
            <p className="text-base text-slate-600">
              Quick answers about reporting, visibility, and what to expect.
            </p>
          </div>
          <Link to="/help">
            <Button variant="secondary" icon={<ArrowRight className="h-4 w-4" />}>
              View all FAQs
            </Button>
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {FAQS.slice(0, 4).map((entry) => (
            <Card key={entry.question} className="h-full">
              <CardHeader title={entry.question} />
              <CardBody>
                <p className="text-sm leading-relaxed text-slate-600">{entry.answer}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <Card className="bg-slate-900 text-white">
          <CardBody className="flex flex-col gap-6 p-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">Ready to track an issue?</h2>
              <p className="max-w-2xl text-sm text-slate-200">
                Sign in or register to submit a report and follow every update in one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to={target}>
                <Button
                  size="lg"
                  className="bg-white text-slate-900 hover:bg-slate-100"
                  icon={<ArrowRight className="h-4 w-4" />}
                >
                  {auth.isAuthenticated ? 'Go to dashboard' : 'Sign in'}
                </Button>
              </Link>
              {!auth.isAuthenticated ? (
                <Link to="/register">
                  <Button
                    size="lg"
                    variant="secondary"
                    className="border-white/40 bg-transparent text-white hover:bg-white/10"
                  >
                    Register
                  </Button>
                </Link>
              ) : null}
            </div>
          </CardBody>
        </Card>
      </section>
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
