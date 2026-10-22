import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
  verifyOtpSchema,
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

/* -------------------------------------------------------------------------- */
/* Layout primitives                                                          */
/* -------------------------------------------------------------------------- */

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 sm:px-6 lg:px-8 py-4 sm:py-0">
      {children}
    </div>
  );
}

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
    <Card className="max-w-md w-full">
      <CardBody className="p-6 sm:p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        {children}
      </CardBody>
      {footer ? (
        <div className="border-t border-slate-200 bg-slate-50/50 px-6 py-4 text-center text-sm">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* OTP digit input                                                            */
/* -------------------------------------------------------------------------- */

function OtpDigit({ value, index, onChange, disabled }: { value: string; index: number; onChange: (index: number, value: string) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-center">
      <Input
        className="h-12 w-12 text-center text-xl font-semibold rounded-lg border-2 border-slate-200 bg-white text-slate-900 text-center focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-300"
        id={`otp-${index}`}
        maxLength={1}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const val = event.target.value;
          onChange(index, val);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Backspace' && !value && index > 0) {
            document.getElementById(`otp-${index - 1}`)?.focus();
          }
        }}
        autoComplete="one-time-code"
        inputMode="numeric"
        spellCheck={false}
      />
    </div>
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

  if (auth.isAuthenticated) {
    if (auth.hasRole('SUPER_ADMIN') || auth.hasRole('ADMIN')) return <Navigate to="/admin/dashboard" replace />;
    if (auth.isStaff) return <Navigate to="/staff" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post('/api/v1/auth/login', values);
      await auth.refresh();
      navigate('/dashboard', { replace: true });
    } catch (caught) {
      const apiError = caught as ApiError;
      if (apiError.code === 'EMAIL_NOT_VERIFIED') {
        toast.push({
          tone: 'info',
          title: 'Verify your email',
          description: 'We sent a new 6-digit code to your email address.',
        });
        navigate(`/verify-otp?email=${encodeURIComponent(values.email)}`, {
          replace: true,
          state: { password: values.password },
        });
        return;
      }
      setError(apiError.message);
    }
  });

  return (
    <AuthShell>
      <AuthCard
        title="Welcome back"
        description="Sign in to continue tracking your reports."
        footer={
          <>
            No account yet?{' '}
            <Link to="/register" className="font-semibold text-indigo-600 hover:text-indigo-700 underline">
              Create an account
            </Link>
          </>
        }
      >
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          {error ? (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          <FormField
            label="Email"
            htmlFor="email"
            required
            error={form.formState.errors.email?.message}
          >
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
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
            className="block text-center text-xs text-slate-600 hover:text-slate-900 underline"
          >
            Forgot your password?
          </Link>
        </form>
      </AuthCard>
    </AuthShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Register                                                                   */
/* -------------------------------------------------------------------------- */

export function RegisterPage() {
  const navigate = useNavigate();
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
    navigate(`/verify-otp?email=${encodeURIComponent(form.getValues('email'))}`, {
      replace: true,
    });
    return null;
  }

  return (
    <AuthShell>
      <AuthCard
        title="Create your account"
        description="Join Campus Resolve and start tracking your academic and administrative reports."
        footer={
          <>
            Already registered?{' '}
            <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700 underline">
              Sign in
            </Link>
          </>
        }
      >
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          {error ? (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
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
            label="Email"
            htmlFor="email"
            required
            error={form.formState.errors.email?.message}
            hint="Enter the email address you will use to sign in."
          >
            <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
          </FormField>
          <FormField
            label="Student ID"
            htmlFor="studentId"
            error={form.formState.errors.studentId?.message}
            hint="Optional — your student ID, if you have one."
          >
            <Input id="studentId" {...form.register('studentId')} />
          </FormField>
          <FormField
            label="Password"
            htmlFor="password"
            required
            error={form.formState.errors.password?.message}
            hint="At least 10 characters with upper case, lower case, and a number."
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
    </AuthShell>
  );
}

/* -------------------------------------------------------------------------- */
/* OTP verification                                                           */
/* -------------------------------------------------------------------------- */

export function VerifyOtpPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const email = params.get('email') ?? '';
  const loginPassword = (location.state as { password?: string } | null)?.password;
  const navigate = useNavigate();
  const toast = useToast();
  const auth = useAuth();
  const [verifying, setVerifying] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [otpValues, setOtpValues] = useState<string[]>(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const form = useForm<z.infer<typeof verifyOtpSchema>>({
    resolver: zodResolver(verifyOtpSchema),
    defaultValues: { email, otp: '' },
  });

  const onDigitChange = (index: number, value: string) => {
    const next = [...otpValues];
    next[index] = value;
    setOtpValues(next);
    setOtpError(null);

    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }

    if (next.every((v) => v.length === 1)) {
      form.setValue('otp', next.join(''), { shouldValidate: true });
    } else {
      form.setValue('otp', next.join(''), { shouldValidate: false });
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setVerifying(true);
    setOtpError(null);
    setMessage(null);
    try {
      await api.post('/api/v1/auth/verify-otp', {
        email: values.email,
        otp: values.otp,
      });

      if (loginPassword) {
        try {
          await api.post('/api/v1/auth/login', {
            email: values.email,
            password: loginPassword,
          });
          await auth.refresh();
          toast.push({
            tone: 'success',
            title: 'Email verified',
            description: 'Your account is active and you are now signed in.',
          });
          navigate('/home', { replace: true });
          return;
        } catch {
          // The account is verified even if the automatic sign-in fails.
        }
      }

      toast.push({
        tone: 'success',
        title: 'Email verified',
        description: 'You can now sign in with your password.',
      });
      navigate('/login', { replace: true });
    } catch (caught) {
      setOtpError((caught as ApiError).message);
    } finally {
      setVerifying(false);
    }
  });

  const resendOtp = async () => {
    setOtpError(null);
    setMessage(null);
    try {
      await api.post('/api/v1/auth/resend-verification', { email });
      setResendSeconds(30);
      setMessage('A new verification code has been sent to your email address.');
    } catch (caught) {
      setOtpError((caught as ApiError).message);
    }
  };

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = setTimeout(() => {
      setResendSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  const otp = otpValues.join('');
  const resendable = resendSeconds === 0;

  return (
    <AuthShell>
      <AuthCard
        title="Verify your email"
        description={
          email
            ? `Enter the 6-digit code sent to ${email}.`
            : 'Enter the 6-digit code sent to your email address.'
        }
      >
        {otpError ? (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {otpError}
          </div>
        ) : null}

        {message ? (
          <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        <form className="space-y-1" onSubmit={onSubmit} noValidate>
          <div className="space-y-1">
            <FormField
            label="Verification code"
            htmlFor="otp"
            required
            error={form.formState.errors.otp?.message}
          >
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              {otpValues.map((value, index) => (
                <OtpDigit
                  key={index}
                  index={index}
                  value={value}
                  onChange={onDigitChange}
                  disabled={verifying}
                />
              ))}
            </div>
            <p className="text-xs text-slate-500 text-center">
              Didn&apos;t receive the code?{' '}
              {resendable ? (
                <button
                  type="button"
                  onClick={resendOtp}
                  className="text-indigo-600 font-semibold hover:text-indigo-700 underline hover:decoration-indigo-600"
                >
                  Resend code
                </button>
              ) : (
                <>
                  Resend in {resendSeconds}s
                </>
              )}
            </p>
          </FormField>
          </div>

          <Button
            type="submit"
            className="w-full"
            loading={verifying}
            disabled={verifying || otp.length !== 6}
          >
            {verifying ? 'Verifying…' : loginPassword ? 'Verify & sign in' : 'Verify email'}
          </Button>
        </form>

        <div className="text-center text-sm text-slate-600">
          Already verified?{' '}
          <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700 underline">
            Sign in
          </Link>
        </div>
      </AuthCard>
    </AuthShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Verify email (token link - kept for backward compatibility)                */
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
    <AuthShell>
      <AuthCard
        title="Email verification"
        description="Confirm your email address to activate your account."
      >
        {state === 'done' ? (
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="rounded-full bg-emerald-100 p-2 text-emerald-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </span>
            </div>
            <p className="text-sm font-medium text-emerald-800">
              Your email address is verified. You can now sign in.
            </p>
            <Link to="/login">
              <Button className="w-full sm:w-auto">Go to sign in</Button>
            </Link>
          </div>
        ) : state === 'error' ? (
          <div className="space-y-4 text-center">
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {message}
            </p>
            <Link to="/login">
              <Button variant="secondary" className="w-full sm:w-auto">
                Back to sign in
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <p className="text-sm text-slate-600">
              {state === 'verifying' ? 'Verifying…' : 'Your verification link is ready.'}
            </p>
            <Button
              className="w-full sm:w-auto"
              onClick={verify}
              loading={state === 'verifying'}
            >
              Verify my email address
            </Button>
          </div>
        )}
      </AuthCard>
    </AuthShell>
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
      <AuthShell>
        <AuthCard title="Your staff account is active" description="Choose a password and you can start working on reports.">
          <div className="space-y-4 text-center">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              The invitation has been accepted.
            </p>
            <Link to="/login">
              <Button className="w-full sm:w-auto">Go to sign in</Button>
            </Link>
          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthCard title="Accept your staff invitation" description="Choose the password you will use to sign in.">
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          {error ? (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
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
    </AuthShell>
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
    <AuthShell>
      <AuthCard title="Reset your password" description="We will email you a single-use link that expires in 60 minutes.">
        {sent ? (
          <div className="space-y-4 text-center">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              If the account exists, a password reset link has been sent.
            </p>
            <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700 underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            <FormField
              label="Email"
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
    </AuthShell>
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
    <AuthShell>
      <AuthCard title="Choose a new password" description="Your existing sessions will be signed out.">
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
    </AuthShell>
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
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Your profile
        </h1>
        <p className="text-sm text-slate-500">Account details and password management.</p>
      </header>

      <Card>
        <CardBody className="space-y-3 p-5 text-sm">
          <Row label="Full name" value={auth.user?.fullName ?? '—'} />
          <Row label="Email" value={auth.user?.email ?? '—'} />
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
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
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
              <PasswordField id="newPassword" autoComplete="new-password" {...form.register('newPassword')} />
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
          navigate('/', { replace: true });
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
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
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
