/**
 * Shared validation schemas. The same schemas run on the client (form
 * validation) and on the server (request validation), so a request that the UI
 * accepts is always accepted by the API, and vice versa (PRD §8, §18, §19).
 */
import { z } from 'zod';
import { TICKET_PRIORITIES, TICKET_STATUSES } from './tickets';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const STUDENT_EMAIL_LOCAL_PART = /^[0-9]{4,20}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Institutional domain check. The domain list is configuration, never hardcoded
 * here — the caller supplies the permitted domains (PRD §5.1, §6.1).
 */
export function isInstitutionalEmail(email: string, domains: readonly string[]): boolean {
  const normalized = normalizeEmail(email);
  const domain = normalized.split('@')[1];
  if (!domain) return false;
  return domains.some((allowed) => domain === allowed.toLowerCase());
}

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Enter a valid email address')
  .max(254, 'Email is too long');

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Enter your full name')
  .max(120, 'Name is too long');

export const studentIdSchema = z
  .string()
  .trim()
  .min(1, 'Student ID is required')
  .max(32, 'Student ID is too long')
  .regex(/^[A-Za-z0-9/-]+$/, 'Student ID contains invalid characters');

export const registerSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  studentId: studentIdSchema.optional(),
  password: passwordSchema,
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the privacy notice and usage terms' }),
  }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyOtpSchema = z.object({
  email: emailSchema,
  otp: z
    .string()
    .trim()
    .min(6, 'Verification code must be 6 digits')
    .max(6, 'Verification code must be 6 digits')
    .regex(/^[0-9]{6}$/, 'Verification code must be 6 digits'),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

/**
 * A staff member accepts an administrator's invitation and chooses their own
 * password. The invitation token is the same single-use token that was
 * emailed, so accepting it also verifies the institutional mailbox.
 */
export const acceptInvitationSchema = z.object({
  token: z.string().min(10, 'Invalid invitation token').max(512),
  password: passwordSchema,
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const resendVerificationSchema = z.object({
  email: emailSchema,
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(10, 'Invalid reset token').max(512),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const adminResetPasswordSchema = z.object({
  password: passwordSchema,
});
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;

export const updateProfileSchema = z.object({
  fullName: fullNameSchema.optional(),
  studentId: studentIdSchema.optional(),
  preferredContactMethod: z.enum(['EMAIL', 'PHONE', 'IN_PERSON']).optional(),
  phone: z.string().trim().max(32).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * The phrase a person has to type before an account can be erased. The client
 * shows it and the server enforces it, so a destructive action is never a
 * single stray click.
 */
export const ACCOUNT_DELETION_CONFIRMATION = 'DELETE MY ACCOUNT';

/**
 * Self-service account erasure. The current password proves ownership of the
 * session; the confirmation phrase proves intent.
 */
export const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(128),
  confirmation: z.literal(ACCOUNT_DELETION_CONFIRMATION, {
    errorMap: () => ({
      message: `Type "${ACCOUNT_DELETION_CONFIRMATION}" exactly to confirm`,
    }),
  }),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

/** An administrator erasing somebody else's account. */
export const deleteUserSchema = z.object({
  reason: z.string().trim().min(5, 'Record why the account is being deleted').max(500),
  confirmation: z.literal(ACCOUNT_DELETION_CONFIRMATION, {
    errorMap: () => ({
      message: `Type "${ACCOUNT_DELETION_CONFIRMATION}" exactly to confirm`,
    }),
  }),
});
export type DeleteUserInput = z.infer<typeof deleteUserSchema>;

export const createTicketSchema = z.object({
  categoryId: z.string().uuid('Select a valid issue category'),
  departmentId: z.string().uuid('Select a valid department'),
  assignedToId: z.string().uuid().optional().nullable(),
  useTriageQueue: z.boolean().optional(),
  subject: z
    .string()
    .trim()
    .min(6, 'Subject must be at least 6 characters')
    .max(180, 'Subject must be at most 180 characters'),
  description: z
    .string()
    .trim()
    .min(20, 'Describe the issue in at least 20 characters')
    .max(8000, 'Description must be at most 8000 characters'),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  courseCode: z.string().trim().max(32).optional(),
  courseTitle: z.string().trim().max(160).optional(),
  semester: z.string().trim().max(64).optional(),
  assessmentReference: z.string().trim().max(64).optional(),
  transactionReference: z.string().trim().max(64).optional(),
  studentEmail: emailSchema,
  preferredContactMethod: z.enum(['EMAIL', 'PHONE', 'IN_PERSON']).optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const ticketListQuerySchema = z.object({
  status: z.union([z.enum(TICKET_STATUSES), z.array(z.enum(TICKET_STATUSES))]).optional(),
  categoryId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  priority: z.union([z.enum(TICKET_PRIORITIES), z.array(z.enum(TICKET_PRIORITIES))]).optional(),
  search: z.string().trim().max(200).optional(),
  overdue: z.boolean().optional(),
  unassigned: z.boolean().optional(),
  awaitingStudent: z.boolean().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'referenceNumber', 'priority']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});
export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;

export const postMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write a message')
    .max(8000, 'Message must be at most 8000 characters'),
});
export type PostMessageInput = z.infer<typeof postMessageSchema>;

export const postNoteSchema = z.object({
  body: z.string().trim().min(1, 'Write a note').max(8000, 'Note must be at most 8000 characters'),
});
export type PostNoteInput = z.infer<typeof postNoteSchema>;

export const changeStatusSchema = z.object({
  status: z.enum(TICKET_STATUSES),
  note: z.string().trim().max(2000).optional(),
});
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

export const assignTicketSchema = z.object({
  assignedToId: z.string().uuid().nullable(),
  reason: z.string().trim().max(500).optional(),
});
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;

export const resolveTicketSchema = z.object({
  resolutionSummary: z
    .string()
    .trim()
    .min(10, 'A resolution summary of at least 10 characters is required')
    .max(4000, 'Resolution summary must be at most 4000 characters'),
});
export type ResolveTicketInput = z.infer<typeof resolveTicketSchema>;

export const escalateTicketSchema = z.object({
  reason: z.string().trim().min(5, 'Explain why this ticket is being escalated').max(1000),
  targetUserId: z.string().uuid().optional().nullable(),
});
export type EscalateTicketInput = z.infer<typeof escalateTicketSchema>;

export const reopenTicketSchema = z.object({
  reason: z.string().trim().min(5, 'Explain why the issue is not resolved').max(1000),
});
export type ReopenTicketInput = z.infer<typeof reopenTicketSchema>;

export const withdrawTicketSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type WithdrawTicketInput = z.infer<typeof withdrawTicketSchema>;

export const feedbackSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const departmentSchema = z.object({
  name: z.string().trim().min(2, 'Enter a department name').max(120),
  description: z.string().trim().max(1000).optional(),
  contactEmail: emailSchema.optional().or(z.literal('')),
  isActive: z.boolean().optional(),
  isFallbackQueue: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type DepartmentInput = z.infer<typeof departmentSchema>;

export const departmentUpdateSchema = departmentSchema.partial();
export type DepartmentUpdateInput = z.infer<typeof departmentUpdateSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(2, 'Enter a category name').max(120),
  description: z.string().trim().max(1000).optional(),
  departmentId: z.string().uuid().optional().nullable(),
  defaultPriority: z.enum(TICKET_PRIORITIES).optional(),
  isActive: z.boolean().optional(),
  isSensitive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const categoryUpdateSchema = categorySchema.partial();
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

export const inviteUserSchema = z.object({
  email: emailSchema,
  fullName: fullNameSchema,
  role: z.enum(['OFFICER', 'DEPARTMENT_HEAD', 'ADMIN', 'SUPER_ADMIN']),
  departmentId: z.string().uuid().optional().nullable(),
  departmentRole: z.enum(['OFFICER', 'HEAD']).optional().nullable(),
  /**
   * Optional. When an administrator sets a password, the account is created
   * active and the sign-in details are emailed to the new user. Without it the
   * account is created pending and the user chooses their own password from
   * the invitation link.
   */
  password: passwordSchema.optional(),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserRoleSchema = z.object({
  role: z.enum(['STUDENT', 'OFFICER', 'DEPARTMENT_HEAD', 'ADMIN', 'SUPER_ADMIN']),
  departmentId: z.string().uuid().optional().nullable(),
  departmentRole: z.enum(['OFFICER', 'HEAD']).optional().nullable(),
});
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;

export const updateUserStatusSchema = z.object({
  accountStatus: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
  reason: z.string().trim().max(500).optional(),
});
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

export const serviceTargetSchema = z.object({
  firstResponseMinutes: z
    .number()
    .int()
    .min(5)
    .max(60 * 24 * 30),
  resolutionMinutes: z
    .number()
    .int()
    .min(30)
    .max(60 * 24 * 90),
  reminderIntervalMinutes: z
    .number()
    .int()
    .min(15)
    .max(60 * 24 * 7),
  maxReminders: z.number().int().min(0).max(50),
  escalationAfterReminders: z.number().int().min(0).max(50),
  businessHoursOnly: z.boolean().optional(),
});
export type ServiceTargetInput = z.infer<typeof serviceTargetSchema>;

export const settingsUpdateSchema = z
  .object({
    institutionName: z.string().trim().min(2).max(120).optional(),
    institutionEmailDomains: z.array(emailSchema).optional(),
    reminderIntervalMinutes: z
      .number()
      .int()
      .min(15)
      .max(60 * 24)
      .optional(),
    escalationAfterReminders: z.number().int().min(0).max(50).optional(),
    maxReminders: z.number().int().min(0).max(50).optional(),
    autoCloseDays: z.number().int().min(1).max(365).optional(),
    ticketRetentionMonths: z.number().int().min(1).max(120).optional(),
    attachmentRetentionMonths: z.number().int().min(1).max(120).optional(),
    allowStudentOfficerSelection: z.boolean().optional(),
    remindersPaused: z.boolean().optional(),
    supportEmail: emailSchema.optional(),
  })
  .strict();
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

export const exportQuerySchema = z.object({
  type: z.enum(['tickets', 'analytics', 'notifications', 'audit']),
  format: z.enum(['csv', 'json']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  departmentId: z.string().uuid().optional(),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;

export const uuidSchema = z.string().uuid();

/** Route parameter guards: a non-UUID id is a client error, never a 500. */
export const idParamSchema = z.object({ id: uuidSchema });
export const attachmentIdParamSchema = z.object({
  id: uuidSchema,
  attachmentId: uuidSchema,
});
export type IdParamInput = z.infer<typeof idParamSchema>;
