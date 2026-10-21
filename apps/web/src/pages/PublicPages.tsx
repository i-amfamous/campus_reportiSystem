import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, CardBody, CardHeader, Input } from '../components/ui';

const FAQS: Array<{ question: string; answer: string }> = [
  {
    question: 'Who can file a report?',
    answer:
      'Any student with a verified institutional email address. Staff accounts use the same sign-in page; a staff role replaces the student role on your account.',
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
      'Check your spam folder and confirm you used your institutional address. A super administrator can resend the verification message from the staff administration area.',
  },
  {
    question: 'Does this system change my grades?',
    answer:
      'No. Campus Resolve records and tracks the handling of an issue. Academic outcomes remain the responsibility of authorised institutional decision-makers.',
  },
];

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
