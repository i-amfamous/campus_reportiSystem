import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  Building2,
  Check,
  Clock3,
  Copy,
  KeyRound,
  Mail,
  Palette,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import {
  acceptInvitationSchema,
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  deleteAccountSchema,
  updateProfileSchema,
  ACCOUNT_DELETION_CONFIRMATION,
  ROLE_LABELS,
  normalizeEmail,
  verifyOtpSchema,
} from '@campus-resolve/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  FormField,
  Input,
  PasswordField,
  Select,
  cn,
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
      // Role-aware landing: HomeRedirect sends students, staff, and admins to
      // the dashboard that matches their permissions.
      navigate('/home', { replace: true });
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
  const [shakeKey, setShakeKey] = useState(0);

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

      if (caught instanceof ApiError && caught.status === 400) {
        setOtpValues(['', '', '', '', '', '']);
        form.setValue('otp', '', { shouldValidate: false });
        form.clearErrors('otp');
        setShakeKey((current) => current + 1);
      }
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

  useEffect(() => {
    if (shakeKey > 0) document.getElementById('otp-0')?.focus();
  }, [shakeKey]);

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
            <div
              key={shakeKey}
              data-testid="otp-group"
              className={`flex flex-wrap justify-center gap-2 sm:justify-start${shakeKey > 0 ? ' animate-otp-shake' : ''}`}
            >
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

const CONTACT_OPTIONS = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'PHONE', label: 'Phone call' },
  { value: 'IN_PERSON', label: 'In person' },
] as const;

type ProfileFormValues = z.infer<typeof updateProfileSchema>;

const PROFILE_SECTIONS = [
  { id: 'identity', label: 'Profile', icon: UserRound },
  { id: 'security', label: 'Password and security', icon: ShieldCheck },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'privacy', label: 'Data and privacy', icon: AlertTriangle },
] as const;

function initialsOf(name: string | undefined): string {
  if (!name) return 'CR';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function readableDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function readableDateTime(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AccountFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-4 sm:px-6">
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
        {value}
      </dd>
    </div>
  );
}

function SecurityFact({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          tone === 'success'
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
            : tone === 'warning'
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
              : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { theme, setTheme } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [dangerOpen, setDangerOpen] = useState(false);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      fullName: auth.user?.fullName ?? '',
      phone: auth.user?.phone ?? '',
      preferredContactMethod:
        (auth.user?.preferredContactMethod as ProfileFormValues['preferredContactMethod']) ??
        'EMAIL',
    },
  });
  const { reset: resetProfileForm } = profileForm;

  const passwordForm = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  useEffect(() => {
    resetProfileForm({
      fullName: auth.user?.fullName ?? '',
      phone: auth.user?.phone ?? '',
      preferredContactMethod:
        (auth.user?.preferredContactMethod as ProfileFormValues['preferredContactMethod']) ??
        'EMAIL',
    });
  }, [auth.user?.fullName, auth.user?.phone, auth.user?.preferredContactMethod, resetProfileForm]);

  const onSaveProfile = profileForm.handleSubmit(async (values) => {
    setProfileError(null);
    try {
      await api.patch('/api/v1/auth/me', values);
      await auth.refresh();
      toast.push({
        tone: 'success',
        title: 'Profile updated',
        description: 'Your account details are now up to date.',
      });
    } catch (caught) {
      setProfileError((caught as ApiError).message);
    }
  });

  const onPasswordSubmit = passwordForm.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post('/api/v1/auth/change-password', values);
      passwordForm.reset();
      toast.push({ tone: 'success', title: 'Password updated' });
    } catch (caught) {
      setError((caught as ApiError).message);
    }
  });

  const copyEmail = async () => {
    if (!auth.user?.email) return;
    try {
      await navigator.clipboard.writeText(auth.user.email);
      toast.push({ tone: 'success', title: 'Email copied' });
    } catch {
      toast.push({ tone: 'error', title: 'Could not copy the email address' });
    }
  };

  const departmentNames = (auth.user?.departments ?? []).map((item) => item.departmentName);
  const roles = auth.user?.roles ?? [];
  const completionChecks = [
    Boolean(auth.user?.fullName),
    Boolean(auth.user?.emailVerified),
    Boolean(auth.user?.phone),
    Boolean(auth.user?.preferredContactMethod),
  ];
  const completion = Math.round(
    (completionChecks.filter(Boolean).length / completionChecks.length) * 100,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">
            Account settings
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage how you appear, how you sign in and how Campus Resolve works for you.
          </p>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Changes save to your account, not just this browser.
        </p>
      </header>

      <Card className="overflow-hidden">
        <div className="relative border-b border-slate-200/80 bg-gradient-to-br from-brand-50 via-white to-teal-50 p-6 sm:p-8 dark:border-slate-800 dark:from-brand-950/40 dark:via-slate-900 dark:to-teal-950/30">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(64,123,217,0.18) 1px, transparent 0)',
              backgroundSize: '22px 22px',
            }}
            aria-hidden
          />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-teal-500 text-2xl font-semibold text-white shadow-lg shadow-brand-900/20"
                aria-hidden
              >
                {initialsOf(auth.user?.fullName)}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-semibold tracking-[-0.02em] text-slate-950 dark:text-white">
                    {auth.user?.fullName ?? 'Your account'}
                  </h2>
                  {auth.user?.emailVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-400/20">
                      <Check className="h-3 w-3" aria-hidden />
                      Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/15 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-400/20">
                      Email not verified
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">
                  {auth.user?.email}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {roles.map((role) => (
                    <span
                      key={role}
                      className="inline-flex items-center rounded-md bg-white/80 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-900/10 dark:bg-slate-900/70 dark:text-slate-300 dark:ring-white/10"
                    >
                      {ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
                    </span>
                  ))}
                  {departmentNames.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-brand-600/15 dark:bg-brand-950/50 dark:text-brand-300 dark:ring-brand-400/20"
                    >
                      <Building2 className="h-3 w-3" aria-hidden />
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="w-full max-w-xs rounded-xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/70">
              <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
                <span>Profile completeness</span>
                <span className="tabular-nums">{completion}%</span>
              </div>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                role="img"
                aria-label={`Profile completeness ${completion} percent`}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-teal-400"
                  style={{ width: `${completion}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {completion === 100
                  ? 'Everything we need is on file.'
                  : 'Add a phone number and contact preference to finish.'}
              </p>
            </div>
          </div>
        </div>
        <dl className="grid divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-slate-800">
          <AccountFact label="Member since" value={readableDate(auth.user?.createdAt)} />
          <AccountFact label="Last sign in" value={readableDateTime(auth.user?.lastLoginAt)} />
          <AccountFact label="Account status" value={auth.user?.accountStatus ?? 'Unknown'} />
        </dl>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <nav
            aria-label="Account settings sections"
            className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
          >
            {PROFILE_SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
              >
                <section.icon className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden />
                {section.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 hidden rounded-xl border border-slate-200 bg-white p-4 lg:block dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Signed in as
              <span className="mt-1 block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                {auth.user?.email}
              </span>
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              onClick={async () => {
                await auth.signOut();
                navigate('/', { replace: true });
              }}
            >
              Sign out
            </Button>
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <Card id="identity" className="scroll-mt-24">
            <CardHeader
              title="Profile"
              description="Your name and contact details travel with every report you submit."
              action={
                <Button variant="secondary" size="sm" onClick={() => void copyEmail()}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Copy email
                </Button>
              }
            />
            <CardBody>
              {profileError ? (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                >
                  {profileError}
                </div>
              ) : null}
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSaveProfile} noValidate>
                <FormField
                  label="Full name"
                  htmlFor="profile-fullName"
                  required
                  error={profileForm.formState.errors.fullName?.message}
                >
                  <Input
                    id="profile-fullName"
                    autoComplete="name"
                    {...profileForm.register('fullName')}
                  />
                </FormField>
                <FormField label="Email address" htmlFor="profile-email">
                  <Input
                    id="profile-email"
                    value={auth.user?.email ?? ''}
                    readOnly
                    className="bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400"
                  />
                </FormField>
                <FormField label="Student ID" htmlFor="profile-studentId">
                  <Input
                    id="profile-studentId"
                    value={auth.user?.studentId ?? 'Not recorded'}
                    readOnly
                    className="bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400"
                  />
                </FormField>
                <FormField
                  label="Phone number"
                  htmlFor="profile-phone"
                  hint="Used only when your preferred contact method is a phone call."
                >
                  <Input
                    id="profile-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+233 20 000 0000"
                    {...profileForm.register('phone')}
                  />
                </FormField>
                <FormField
                  label="Preferred contact method"
                  htmlFor="profile-contact"
                  hint="Officers use this when they need more information from you."
                >
                  <Select id="profile-contact" {...profileForm.register('preferredContactMethod')}>
                    {CONTACT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Email address and student ID are managed by the institution.
                  </p>
                  <Button
                    type="submit"
                    loading={profileForm.formState.isSubmitting}
                    disabled={!profileForm.formState.isDirty}
                  >
                    Save changes
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <Card id="security" className="scroll-mt-24">
            <CardHeader
              title="Password and security"
              description="Your sign-in details and the devices that can reach this account."
            />
            <CardBody className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <SecurityFact
                  icon={Mail}
                  label="Email status"
                  value={auth.user?.emailVerified ? 'Verified' : 'Not verified'}
                  tone={auth.user?.emailVerified ? 'success' : 'warning'}
                />
                <SecurityFact
                  icon={Clock3}
                  label="Last sign in"
                  value={readableDateTime(auth.user?.lastLoginAt)}
                />
                <SecurityFact icon={KeyRound} label="Password" value="Set and private" />
                <SecurityFact
                  icon={ShieldCheck}
                  label="Account status"
                  value={auth.user?.accountStatus ?? 'Unknown'}
                  tone={auth.user?.accountStatus === 'ACTIVE' ? 'success' : 'warning'}
                />
              </div>

              <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Change your password
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Use at least 10 characters with upper case, lower case and a number.
                </p>
                {error ? (
                  <div
                    role="alert"
                    className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                  >
                    {error}
                  </div>
                ) : null}
                <form
                  className="mt-4 grid gap-4 sm:grid-cols-2"
                  onSubmit={onPasswordSubmit}
                  noValidate
                >
                  <FormField
                    label="Current password"
                    htmlFor="currentPassword"
                    required
                    error={passwordForm.formState.errors.currentPassword?.message}
                  >
                    <PasswordField
                      id="currentPassword"
                      autoComplete="current-password"
                      {...passwordForm.register('currentPassword')}
                    />
                  </FormField>
                  <FormField
                    label="New password"
                    htmlFor="newPassword"
                    required
                    error={passwordForm.formState.errors.newPassword?.message}
                  >
                    <PasswordField
                      id="newPassword"
                      autoComplete="new-password"
                      {...passwordForm.register('newPassword')}
                    />
                  </FormField>
                  <div className="sm:col-span-2">
                    <Button type="submit" loading={passwordForm.formState.isSubmitting}>
                      Update password
                    </Button>
                  </div>
                </form>
              </div>
            </CardBody>
          </Card>

          <Card id="appearance" className="scroll-mt-24">
            <CardHeader
              title="Appearance"
              description="Choose how Campus Resolve looks on this device. The choice is remembered here."
            />
            <CardBody>
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    {
                      value: 'light',
                      label: 'Light',
                      description: 'Crisp paper tones for daytime work.',
                    },
                    {
                      value: 'dark',
                      label: 'Dark',
                      description: 'Lower glare for long sessions.',
                    },
                  ] as const
                ).map((option) => {
                  const selected = theme === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTheme(option.value)}
                      aria-pressed={selected}
                      className={cn(
                        'relative overflow-hidden rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                        selected
                          ? 'border-brand-500 ring-1 ring-brand-500 dark:border-brand-400 dark:ring-brand-400'
                          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700',
                      )}
                    >
                      <div
                        className={cn(
                          'rounded-lg border p-3',
                          option.value === 'light'
                            ? 'border-slate-200 bg-slate-50'
                            : 'border-slate-700 bg-slate-950',
                        )}
                      >
                        <div
                          className={cn(
                            'h-2.5 w-20 rounded-full',
                            option.value === 'light' ? 'bg-slate-300' : 'bg-slate-700',
                          )}
                        />
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {[0, 1, 2].map((index) => (
                            <div
                              key={index}
                              className={cn(
                                'h-10 rounded-md',
                                option.value === 'light'
                                  ? index === 0
                                    ? 'bg-brand-200'
                                    : 'bg-white ring-1 ring-slate-200'
                                  : index === 0
                                    ? 'bg-brand-900'
                                    : 'bg-slate-900 ring-1 ring-slate-800',
                              )}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {option.label}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {option.description}
                          </p>
                        </div>
                        {selected ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
                            <Check className="h-3 w-3" aria-hidden />
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <Card id="privacy" className="scroll-mt-24 border-rose-200 dark:border-rose-900/60">
            <CardHeader
              title="Data and privacy"
              description="These actions affect your account permanently."
            />
            <CardBody>
              <div className="flex flex-col gap-4 rounded-xl border border-rose-200 bg-rose-50/60 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-rose-900/60 dark:bg-rose-950/30">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                      Delete my account
                    </p>
                    <p className="mt-0.5 max-w-xl text-xs text-rose-800/80 dark:text-rose-300/80">
                      This removes your name, email address, password and notifications. Your
                      submitted reports and the audit trail stay on record for the institution.
                    </p>
                  </div>
                </div>
                <Button variant="danger" onClick={() => setDangerOpen(true)}>
                  Delete my account
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

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
