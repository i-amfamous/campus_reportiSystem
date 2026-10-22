import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  acceptInvitationSchema,
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  deleteAccountSchema,
  ACCOUNT_DELETION_CONFIRMATION,
  normalizeEmail,
} from '@campus-resolve/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  Button,
  Card,
  CardBody,
  Dialog,
  FormField,
  Input,
  PasswordField,
  useToast,
} from '../../components/ui';

function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card>
      <CardBody className="space-y-5 p-6">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h1>
          {description ? <p className="text-sm text-slate-500">{description}</p> : null}
        </div>
        {children}
      </CardBody>
      {footer ? (
        <div className="border-t border-slate-200 px-6 py-4 text-center text-sm text-slate-600">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Login                                                                      */
/* -------------------------------------------------------------------------- */

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (auth.isAuthenticated) return <Navigate to="/dashboard" replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post('/api/v1/auth/login', values);
      await auth.refresh();
      navigate('/dashboard', { replace: true });
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError.message);
      if (apiError.code === 'EMAIL_NOT_VERIFIED') {
        toast.push({
          tone: 'error',
          title: 'Verify your email first',
          description: 'Use the link we sent to your institutional inbox.',
        });
      }
    }
  });

  return (
    <AuthCard
      title="Sign in to Campus Resolve"
      description="Report academic and administrative issues and follow every update."
      footer={
        <>
          No account yet?{' '}
          <Link to="/register" className="font-semibold text-indigo-700 hover:underline">
            Register with your institutional email
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {error ? (
          <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        <FormField
          label="Institutional email"
          htmlFor="email"
          required
          error={form.formState.errors.email?.message}
        >
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="10234567@live.gctu.edu.gh"
            {...form.register('email')}
          />
        </FormField>
        <FormField
          label="Password"
          htmlFor="password"
          required
          error={form.formState.errors.password?.message}
        >
          <PasswordField
            id="password"
            autoComplete="current-password"
            {...form.register('password')}
          />
        </FormField>
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Sign in
        </Button>
        <Link
          to="/forgot-password"
          className="block text-center text-xs text-slate-600 hover:text-slate-900"
        >
          Forgot your password?
        </Link>
      </form>
    </AuthCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Register                                                                   */
/* -------------------------------------------------------------------------- */

export function RegisterPage() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      studentId: '',
      password: '',
      acceptTerms: false as never,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post('/api/v1/auth/register', {
        ...values,
        email: normalizeEmail(values.email),
        studentId: values.studentId?.trim() || undefined,
      });
      setDone(true);
      toast.push({
        tone: 'success',
        title: 'Account created',
        description: 'Check your inbox for the verification link.',
      });
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError.message);
      const fields = apiError.fieldErrors();
      for (const [field, message] of Object.entries(fields)) {
        form.setError(field as never, { message });
      }
    }
  });

  if (done) {
    return (
      <AuthCard
        title="Verify your email address"
        description={`We sent a verification link to ${form.getValues('email')}. The link expires in 24 hours.`}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Your account becomes active once you confirm control of your institutional mailbox.
            Verifying an email address confirms the mailbox — it does not by itself confirm that you
            are currently enrolled.
          </p>
          <Button variant="secondary" className="w-full" onClick={() => setDone(false)}>
            Use a different email
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your student account"
      description="Only your institutional email address is required."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-indigo-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {error ? (
          <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        <FormField
          label="Full name"
          htmlFor="fullName"
          required
          error={form.formState.errors.fullName?.message}
        >
          <Input id="fullName" autoComplete="name" {...form.register('fullName')} />
        </FormField>
        <FormField
          label="Institutional email"
          htmlFor="email"
          required
          error={form.formState.errors.email?.message}
          hint="Your student number as your email address, for example 10234567@live.gctu.edu.gh."
        >
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        </FormField>
        <FormField
          label="Student ID"
          htmlFor="studentId"
          error={form.formState.errors.studentId?.message}
          hint="Optional — we derive it from your email address when it is numeric."
        >
          <Input id="studentId" {...form.register('studentId')} />
        </FormField>
        <FormField
          label="Password"
          htmlFor="password"
          required
          error={form.formState.errors.password?.message}
        >
          <PasswordField id="password" autoComplete="new-password" {...form.register('password')} />
        </FormField>
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
            {...form.register('acceptTerms')}
          />
          <span>I accept the privacy notice and the usage terms for academic issue reporting.</span>
        </label>
        {form.formState.errors.acceptTerms?.message ? (
          <p className="text-xs font-medium text-rose-600" role="alert">
            {form.formState.errors.acceptTerms.message}
          </p>
        ) : null}
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Verify email                                                               */
/* -------------------------------------------------------------------------- */

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'idle' | 'verifying' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  const verify = async () => {
    if (!token) {
      setState('error');
      setMessage('This verification link is missing its token.');
      return;
    }
    setState('verifying');
    try {
      await api.post('/api/v1/auth/verify-email', { token });
      setState('done');
    } catch (caught) {
      setState('error');
      setMessage((caught as ApiError).message);
    }
  };

  return (
    <AuthCard
      title="Email verification"
      description="Confirm your institutional email address to activate your account."
    >
      {state === 'done' ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Your email address is verified. You can now sign in.
          </p>
          <Link to="/login">
            <Button className="w-full">Go to sign in</Button>
          </Link>
        </div>
      ) : state === 'error' ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</p>
          <Link to="/login">
            <Button variant="secondary" className="w-full">
              Back to sign in
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {state === 'verifying' ? 'Verifying…' : 'Your verification link is ready.'}
          </p>
          <Button className="w-full" onClick={verify} loading={state === 'verifying'}>
            Verify my email address
          </Button>
        </div>
      )}
    </AuthCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Staff invitation                                                           */
/* -------------------------------------------------------------------------- */

export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const form = useForm<z.infer<typeof acceptInvitationSchema>>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: { token, password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post('/api/v1/auth/accept-invitation', values);
      setDone(true);
    } catch (caught) {
      setError((caught as ApiError).message);
    }
  });

  if (done) {
    return (
      <AuthCard
        title="Your staff account is active"
        description="Choose a password and you can start working on reports."
      >
        <div className="space-y-4">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            The invitation has been accepted.
          </p>
          <Link to="/login">
            <Button className="w-full">Go to sign in</Button>
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Accept your staff invitation"
      description="Choose the password you will use to sign in. This also confirms your institutional email address."
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {error ? (
          <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        <FormField
          label="New password"
          htmlFor="password"
          required
          error={form.formState.errors.password?.message}
        >
          <PasswordField id="password" autoComplete="new-password" {...form.register('password')} />
        </FormField>
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Activate my account
        </Button>
      </form>
    </AuthCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Password reset                                                             */
/* -------------------------------------------------------------------------- */

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const form = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await api.post('/api/v1/auth/forgot-password', values);
    setSent(true);
  });

  return (
    <AuthCard
      title="Reset your password"
      description="We will email you a single-use link that expires in 60 minutes."
      footer={
        <Link to="/login" className="font-semibold text-indigo-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          If the account exists, a password reset link has been sent.
        </p>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <FormField
            label="Institutional email"
            htmlFor="email"
            required
            error={form.formState.errors.email?.message}
          >
            <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
          </FormField>
          <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const form = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await api.post('/api/v1/auth/reset-password', values);
    navigate('/login', { replace: true });
  });

  return (
    <AuthCard
      title="Choose a new password"
      description="Your existing sessions will be signed out."
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <FormField
          label="New password"
          htmlFor="password"
          required
          error={form.formState.errors.password?.message}
        >
          <PasswordField id="password" autoComplete="new-password" {...form.register('password')} />
        </FormField>
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Profile                                                                    */
/* -------------------------------------------------------------------------- */

export function ProfilePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [dangerOpen, setDangerOpen] = useState(false);
  const form = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post('/api/v1/auth/change-password', values);
      form.reset();
      toast.push({ tone: 'success', title: 'Password updated' });
    } catch (caught) {
      setError((caught as ApiError).message);
    }
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Your profile</h1>
        <p className="text-sm text-slate-500">Account details and password management.</p>
      </header>

      <Card>
        <CardBody className="space-y-3 p-5 text-sm">
          <Row label="Full name" value={auth.user?.fullName ?? '—'} />
          <Row label="Institutional email" value={auth.user?.email ?? '—'} />
          <Row label="Student ID" value={auth.user?.studentId ?? 'Not recorded'} />
          <Row label="Email verified" value={auth.user?.emailVerified ? 'Yes' : 'No'} />
          <Row label="Roles" value={auth.user?.roles.join(', ') || '—'} />
          <Row
            label="Departments"
            value={
              auth.user?.departments.length
                ? auth.user.departments
                    .map(
                      (department) => `${department.departmentName} (${department.departmentRole})`,
                    )
                    .join(', ')
                : 'None'
            }
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4 p-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Change password</h2>
            <p className="text-xs text-slate-500">
              Use at least 10 characters with upper case, lower case and a number.
            </p>
          </div>
          {error ? (
            <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit} noValidate>
            <FormField
              label="Current password"
              htmlFor="currentPassword"
              required
              error={form.formState.errors.currentPassword?.message}
            >
              <PasswordField
                id="currentPassword"
                autoComplete="current-password"
                {...form.register('currentPassword')}
              />
            </FormField>
            <FormField
              label="New password"
              htmlFor="newPassword"
              required
              error={form.formState.errors.newPassword?.message}
            >
              <PasswordField
                id="newPassword"
                autoComplete="new-password"
                {...form.register('newPassword')}
              />
            </FormField>
            <div className="sm:col-span-2">
              <Button type="submit" loading={form.formState.isSubmitting}>
                Update password
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card className="border-rose-200">
        <CardBody className="space-y-4 p-5">
          <div>
            <h2 className="text-sm font-semibold text-rose-700">Danger zone</h2>
            <p className="text-xs text-slate-500">
              Deleting your account removes your name, email address, password and every message
              the system sent you, and signs you out for good. The reports you submitted and the
              audit trail stay on record so the institution keeps its history.
            </p>
          </div>
          <Button variant="danger" onClick={() => setDangerOpen(true)}>
            Delete my account
          </Button>
        </CardBody>
      </Card>

      <DeleteAccountDialog
        open={dangerOpen}
        onClose={() => setDangerOpen(false)}
        onDeleted={async () => {
          setDangerOpen(false);
          toast.push({ tone: 'success', title: 'Your account has been deleted' });
          await auth.signOut();
          navigate('/login', { replace: true });
        }}
      />
    </div>
  );
}

/**
 * The Danger Zone confirmation. It asks for the current password and for the
 * confirmation phrase, so an account is never erased by a stray click.
 */
function DeleteAccountDialog({
  open,
  onClose,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrentPassword('');
      setConfirmation('');
      setError(null);
    }
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = deleteAccountSchema.safeParse({ currentPassword, confirmation });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the details and try again.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.delete('/api/v1/auth/account', parsed.data);
      await onDeleted();
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete your account"
      description="This cannot be undone. Your reports and the audit trail are kept."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button variant="danger" type="submit" form="delete-account-form" loading={pending}>
            Delete my account
          </Button>
        </>
      }
    >
      <form id="delete-account-form" className="space-y-4" onSubmit={submit} noValidate>
        {error ? (
          <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        <FormField label="Current password" htmlFor="delete-password" required>
          <PasswordField
            id="delete-password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </FormField>
        <FormField
          label={`Type ${ACCOUNT_DELETION_CONFIRMATION} to confirm`}
          htmlFor="delete-confirmation"
          required
        >
          <Input
            id="delete-confirmation"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </FormField>
      </form>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}
