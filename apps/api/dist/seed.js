// ../../packages/shared/src/tickets.ts
var TICKET_STATUSES = [
  "SUBMITTED",
  "AWAITING_ASSIGNMENT",
  "ASSIGNED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "AWAITING_STUDENT",
  "AWAITING_EXTERNAL",
  "ESCALATED",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "WITHDRAWN"
];
var TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

// ../../packages/shared/src/permissions.ts
var ROLES = ["STUDENT", "OFFICER", "DEPARTMENT_HEAD", "ADMIN", "SUPER_ADMIN"];
var ROLE_LABELS = {
  STUDENT: "Student",
  OFFICER: "Department Officer",
  DEPARTMENT_HEAD: "Department Head",
  ADMIN: "Administrator",
  SUPER_ADMIN: "Super Administrator"
};
var PERMISSIONS = [
  // Tickets
  "ticket:create",
  "ticket:read:own",
  "ticket:read:department",
  "ticket:read:any",
  "ticket:reply:public",
  "ticket:note:internal",
  "ticket:status:update",
  "ticket:assign",
  "ticket:reassign",
  "ticket:resolve",
  "ticket:escalate:request",
  "ticket:escalate:manage",
  "ticket:reopen:request",
  "ticket:reopen:manage",
  "ticket:withdraw",
  "ticket:feedback:create",
  "ticket:feedback:read",
  // Attachments
  "attachment:upload",
  "attachment:download",
  // Reference data
  "department:read",
  "department:manage",
  "category:read",
  "category:manage",
  // People
  "user:manage",
  "user:manage:department",
  "user:role:assign",
  // Platform
  "settings:manage",
  "settings:institution",
  "analytics:department",
  "analytics:global",
  "audit:read",
  "export:create",
  "job:manage",
  "security:read",
  "retention:manage"
];
var STUDENT_PERMISSIONS = [
  "ticket:create",
  "ticket:read:own",
  "ticket:reply:public",
  "ticket:escalate:request",
  "ticket:reopen:request",
  "ticket:withdraw",
  "ticket:feedback:create",
  "attachment:upload",
  "attachment:download",
  "department:read",
  "category:read"
];
var OFFICER_PERMISSIONS = [
  ...STUDENT_PERMISSIONS,
  "ticket:read:department",
  "ticket:note:internal",
  "ticket:status:update",
  "ticket:assign",
  "ticket:reassign",
  "ticket:resolve",
  "ticket:escalate:manage",
  "ticket:reopen:manage",
  "ticket:feedback:read"
];
var DEPARTMENT_HEAD_PERMISSIONS = [
  ...OFFICER_PERMISSIONS,
  "analytics:department",
  "user:manage:department"
];
var ADMIN_PERMISSIONS = [
  ...DEPARTMENT_HEAD_PERMISSIONS,
  "ticket:read:any",
  "user:manage",
  "user:role:assign",
  "department:manage",
  "category:manage",
  "settings:manage",
  "analytics:global",
  "audit:read",
  "export:create",
  "job:manage"
];
var SUPER_ADMIN_PERMISSIONS = [
  ...ADMIN_PERMISSIONS,
  "settings:institution",
  "security:read",
  "retention:manage"
];
var ROLE_PERMISSIONS = {
  STUDENT: STUDENT_PERMISSIONS,
  OFFICER: OFFICER_PERMISSIONS,
  DEPARTMENT_HEAD: DEPARTMENT_HEAD_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  SUPER_ADMIN: SUPER_ADMIN_PERMISSIONS
};

// ../../packages/shared/src/schemas.ts
import { z } from "zod";
var passwordSchema = z.string().min(10, "Password must be at least 10 characters").max(128, "Password must be at most 128 characters").regex(/[a-z]/, "Password must contain a lowercase letter").regex(/[A-Z]/, "Password must contain an uppercase letter").regex(/[0-9]/, "Password must contain a number");
var emailSchema = z.string().trim().min(1, "Email is required").email("Enter a valid email address").max(254, "Email is too long");
var fullNameSchema = z.string().trim().min(2, "Enter your full name").max(120, "Name is too long");
var studentIdSchema = z.string().trim().min(1, "Student ID is required").max(32, "Student ID is too long").regex(/^[A-Za-z0-9/-]+$/, "Student ID contains invalid characters");
var registerSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  studentId: studentIdSchema.optional(),
  password: passwordSchema,
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "You must accept the privacy notice and usage terms" })
  })
});
var loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(128)
});
var verifyEmailSchema = z.object({
  token: z.string().min(10, "Invalid verification token").max(512)
});
var acceptInvitationSchema = z.object({
  token: z.string().min(10, "Invalid invitation token").max(512),
  password: passwordSchema
});
var resendVerificationSchema = z.object({
  email: emailSchema
});
var forgotPasswordSchema = z.object({
  email: emailSchema
});
var resetPasswordSchema = z.object({
  token: z.string().min(10, "Invalid reset token").max(512),
  password: passwordSchema
});
var changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(128),
  newPassword: passwordSchema
});
var updateProfileSchema = z.object({
  fullName: fullNameSchema.optional(),
  studentId: studentIdSchema.optional(),
  preferredContactMethod: z.enum(["EMAIL", "PHONE", "IN_PERSON"]).optional(),
  phone: z.string().trim().max(32).optional()
});
var createTicketSchema = z.object({
  categoryId: z.string().uuid("Select a valid issue category"),
  departmentId: z.string().uuid("Select a valid department"),
  assignedToId: z.string().uuid().optional().nullable(),
  useTriageQueue: z.boolean().optional(),
  subject: z.string().trim().min(6, "Subject must be at least 6 characters").max(180, "Subject must be at most 180 characters"),
  description: z.string().trim().min(20, "Describe the issue in at least 20 characters").max(8e3, "Description must be at most 8000 characters"),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  courseCode: z.string().trim().max(32).optional(),
  courseTitle: z.string().trim().max(160).optional(),
  semester: z.string().trim().max(64).optional(),
  assessmentReference: z.string().trim().max(64).optional(),
  transactionReference: z.string().trim().max(64).optional(),
  preferredContactMethod: z.enum(["EMAIL", "PHONE", "IN_PERSON"]).optional()
});
var ticketListQuerySchema = z.object({
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
  sort: z.enum(["createdAt", "updatedAt", "referenceNumber", "priority"]).optional(),
  order: z.enum(["asc", "desc"]).optional()
});
var postMessageSchema = z.object({
  body: z.string().trim().min(1, "Write a message").max(8e3, "Message must be at most 8000 characters")
});
var postNoteSchema = z.object({
  body: z.string().trim().min(1, "Write a note").max(8e3, "Note must be at most 8000 characters")
});
var changeStatusSchema = z.object({
  status: z.enum(TICKET_STATUSES),
  note: z.string().trim().max(2e3).optional()
});
var assignTicketSchema = z.object({
  assignedToId: z.string().uuid().nullable(),
  reason: z.string().trim().max(500).optional()
});
var resolveTicketSchema = z.object({
  resolutionSummary: z.string().trim().min(10, "A resolution summary of at least 10 characters is required").max(4e3, "Resolution summary must be at most 4000 characters")
});
var escalateTicketSchema = z.object({
  reason: z.string().trim().min(5, "Explain why this ticket is being escalated").max(1e3),
  targetUserId: z.string().uuid().optional().nullable()
});
var reopenTicketSchema = z.object({
  reason: z.string().trim().min(5, "Explain why the issue is not resolved").max(1e3)
});
var withdrawTicketSchema = z.object({
  reason: z.string().trim().max(500).optional()
});
var feedbackSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(2e3).optional()
});
var departmentSchema = z.object({
  name: z.string().trim().min(2, "Enter a department name").max(120),
  description: z.string().trim().max(1e3).optional(),
  contactEmail: emailSchema.optional().or(z.literal("")),
  isActive: z.boolean().optional(),
  isFallbackQueue: z.boolean().optional(),
  sortOrder: z.number().int().optional()
});
var departmentUpdateSchema = departmentSchema.partial();
var categorySchema = z.object({
  name: z.string().trim().min(2, "Enter a category name").max(120),
  description: z.string().trim().max(1e3).optional(),
  departmentId: z.string().uuid().optional().nullable(),
  defaultPriority: z.enum(TICKET_PRIORITIES).optional(),
  isActive: z.boolean().optional(),
  isSensitive: z.boolean().optional(),
  sortOrder: z.number().int().optional()
});
var categoryUpdateSchema = categorySchema.partial();
var inviteUserSchema = z.object({
  email: emailSchema,
  fullName: fullNameSchema,
  role: z.enum(["OFFICER", "DEPARTMENT_HEAD", "ADMIN", "SUPER_ADMIN"]),
  departmentId: z.string().uuid().optional().nullable(),
  departmentRole: z.enum(["OFFICER", "HEAD"]).optional().nullable()
});
var updateUserRoleSchema = z.object({
  role: z.enum(["STUDENT", "OFFICER", "DEPARTMENT_HEAD", "ADMIN", "SUPER_ADMIN"]),
  departmentId: z.string().uuid().optional().nullable(),
  departmentRole: z.enum(["OFFICER", "HEAD"]).optional().nullable()
});
var updateUserStatusSchema = z.object({
  accountStatus: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]),
  reason: z.string().trim().max(500).optional()
});
var serviceTargetSchema = z.object({
  firstResponseMinutes: z.number().int().min(5).max(60 * 24 * 30),
  resolutionMinutes: z.number().int().min(30).max(60 * 24 * 90),
  reminderIntervalMinutes: z.number().int().min(15).max(60 * 24 * 7),
  maxReminders: z.number().int().min(0).max(50),
  escalationAfterReminders: z.number().int().min(0).max(50),
  businessHoursOnly: z.boolean().optional()
});
var settingsUpdateSchema = z.object({
  institutionName: z.string().trim().min(2).max(120).optional(),
  institutionEmailDomains: z.array(emailSchema).optional(),
  reminderIntervalMinutes: z.number().int().min(15).max(60 * 24).optional(),
  escalationAfterReminders: z.number().int().min(0).max(50).optional(),
  maxReminders: z.number().int().min(0).max(50).optional(),
  autoCloseDays: z.number().int().min(1).max(365).optional(),
  ticketRetentionMonths: z.number().int().min(1).max(120).optional(),
  attachmentRetentionMonths: z.number().int().min(1).max(120).optional(),
  allowStudentOfficerSelection: z.boolean().optional(),
  remindersPaused: z.boolean().optional(),
  supportEmail: emailSchema.optional()
}).strict();
var exportQuerySchema = z.object({
  type: z.enum(["tickets", "analytics", "notifications", "audit"]),
  format: z.enum(["csv", "json"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  departmentId: z.string().uuid().optional()
});
var uuidSchema = z.string().uuid();
var idParamSchema = z.object({ id: uuidSchema });
var attachmentIdParamSchema = z.object({
  id: uuidSchema,
  attachmentId: uuidSchema
});

// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
var prisma = new PrismaClient();
var DEPARTMENTS = [
  {
    name: "Academic Affairs",
    code: "ACAD",
    description: "Handles examination results, grade and GPA corrections, transcripts and statements of results.",
    sortOrder: 10
  },
  {
    name: "Registration Office",
    code: "REG",
    description: "Handles course registration, registration records, examination eligibility and timetables.",
    sortOrder: 20
  },
  {
    name: "Student Finance Office",
    code: "FIN",
    description: "Handles fee payments, balances, receipts, refunds and billing inquiries.",
    sortOrder: 30
  },
  {
    name: "Student Administration",
    code: "STUAD",
    description: "Handles student identity cards, personal information corrections, admission and enrolment records.",
    sortOrder: 40
  },
  {
    name: "ICT Support",
    code: "ICT",
    description: "Handles the student portal, account access, online learning platforms and other digital academic services.",
    sortOrder: 50
  },
  {
    name: "General Administration",
    code: "ADMIN",
    description: "Central triage queue for general inquiries and administrative complaints that do not fit another office.",
    sortOrder: 60,
    isFallbackQueue: true
  }
];
var CATEGORIES = [
  // Academic records → Academic Affairs
  { name: "Missing Examination Results", department: "ACAD", sortOrder: 10 },
  { name: "Incorrect Grade", department: "ACAD", sortOrder: 20 },
  { name: "GPA or CGPA Discrepancy", department: "ACAD", sortOrder: 30 },
  { name: "Transcript Request or Discrepancy", department: "ACAD", sortOrder: 40 },
  { name: "Incorrect Academic Records", department: "ACAD", sortOrder: 50 },
  // Registration and examinations → Registration Office
  { name: "Course Registration Problem", department: "REG", sortOrder: 10 },
  { name: "Missing Registered Course", department: "REG", sortOrder: 20 },
  { name: "Examination Eligibility", department: "REG", sortOrder: 30 },
  { name: "Examination Timetable Issue", department: "REG", sortOrder: 40 },
  { name: "Student Portal Registration Error", department: "REG", sortOrder: 50 },
  // Finance → Student Finance Office
  { name: "Fees Payment Not Reflected", department: "FIN", sortOrder: 10 },
  { name: "Incorrect Financial Balance", department: "FIN", sortOrder: 20 },
  { name: "Payment Receipt Issue", department: "FIN", sortOrder: 30 },
  { name: "Refund or Billing Inquiry", department: "FIN", sortOrder: 40 },
  // Student administration → Student Administration
  { name: "Student ID Card", department: "STUAD", sortOrder: 10 },
  { name: "Personal Information Correction", department: "STUAD", sortOrder: 20 },
  { name: "Admission or Enrolment Record", department: "STUAD", sortOrder: 30 },
  { name: "General Administrative Complaint", department: "STUAD", sortOrder: 40 },
  // Technology → ICT Support
  { name: "Student Portal Access", department: "ICT", sortOrder: 10 },
  { name: "Password or Account Problem", department: "ICT", sortOrder: 20 },
  { name: "Online Learning Platform", department: "ICT", sortOrder: 30 },
  { name: "Other Digital Academic Services", department: "ICT", sortOrder: 40 },
  // Other → General Administration
  { name: "General Inquiry", department: "ADMIN", sortOrder: 10 },
  { name: "Unlisted Issue", department: "ADMIN", sortOrder: 20 }
];
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password.normalize("NFKC"), salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024
  });
  return ["scrypt", 16384, 8, 1, salt.toString("hex"), derived.toString("hex")].join("$");
}
async function syncRolesAndPermissions() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role },
      create: { name: role, description: ROLE_LABELS[role], isSystem: true },
      update: { description: ROLE_LABELS[role] }
    });
  }
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission },
      create: { key: permission, description: permission },
      update: {}
    });
  }
  const permissionRecords = await prisma.permission.findMany();
  const permissionByKey = new Map(permissionRecords.map((record) => [record.key, record]));
  for (const role of ROLES) {
    const roleRecord = await prisma.role.findUniqueOrThrow({ where: { name: role } });
    const keys = [...ROLE_PERMISSIONS[role]];
    await prisma.rolePermission.deleteMany({ where: { roleId: roleRecord.id } });
    for (const key of keys) {
      const permission = permissionByKey.get(key);
      if (!permission) continue;
      await prisma.rolePermission.create({
        data: { roleId: roleRecord.id, permissionId: permission.id }
      });
    }
  }
}
async function seedDepartmentsAndCategories() {
  const byCode = /* @__PURE__ */ new Map();
  for (const department of DEPARTMENTS) {
    const record = await prisma.department.upsert({
      where: { name: department.name },
      create: {
        name: department.name,
        code: department.code,
        description: department.description,
        isFallbackQueue: department.isFallbackQueue ?? false,
        sortOrder: department.sortOrder,
        contactEmail: `help.${department.code.toLowerCase()}@live.gctu.edu.gh`
      },
      update: {
        description: department.description,
        isFallbackQueue: department.isFallbackQueue ?? false,
        sortOrder: department.sortOrder
      }
    });
    byCode.set(department.code, record.id);
    await prisma.departmentServiceTarget.upsert({
      where: { departmentId: record.id },
      create: {
        departmentId: record.id,
        firstResponseMinutes: 480,
        resolutionMinutes: 4320,
        reminderIntervalMinutes: 120,
        maxReminders: 8,
        escalationAfterReminders: 3
      },
      update: {}
    });
  }
  for (const category of CATEGORIES) {
    const departmentId = byCode.get(category.department);
    await prisma.category.upsert({
      where: { name: category.name },
      create: {
        name: category.name,
        description: `Reports about ${category.name.toLowerCase()}.`,
        departmentId: departmentId ?? null,
        defaultPriority: "NORMAL",
        sortOrder: category.sortOrder
      },
      update: { departmentId: departmentId ?? null, sortOrder: category.sortOrder }
    });
  }
}
async function seedSuperAdministrator() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "superadmin@live.gctu.edu.gh").toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "ChangeMe!2026";
  const fullName = process.env.BOOTSTRAP_ADMIN_NAME ?? "Platform Super Administrator";
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: existing.id, roleId: superAdminRole.id } },
      create: { userId: existing.id, roleId: superAdminRole.id },
      update: {}
    });
    return;
  }
  await prisma.user.create({
    data: {
      fullName,
      email,
      passwordHash: hashPassword(password),
      emailVerifiedAt: /* @__PURE__ */ new Date(),
      accountStatus: "ACTIVE",
      roles: { create: { roleId: superAdminRole.id } }
    }
  });
}
async function main() {
  await syncRolesAndPermissions();
  await seedDepartmentsAndCategories();
  await seedSuperAdministrator();
  process.stdout.write(
    "Seed complete: roles, permissions, departments, categories and the super administrator are in place.\n"
  );
}
main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}
`);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map