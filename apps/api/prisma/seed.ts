/**
 * Development and staging seed.
 *
 * Creates the canonical roles and permissions, the initial departments and
 * issue categories from PRD §6.1, a triage queue and the bootstrap
 * super administrator. Safe to run repeatedly.
 */
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  ROLES,
  type PermissionKey,
} from '@campus-resolve/shared';
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

const DEPARTMENTS = [
  {
    name: 'Academic Affairs',
    code: 'ACAD',
    description:
      'Handles examination results, grade and GPA corrections, transcripts and statements of results.',
    sortOrder: 10,
  },
  {
    name: 'Registration Office',
    code: 'REG',
    description:
      'Handles course registration, registration records, examination eligibility and timetables.',
    sortOrder: 20,
  },
  {
    name: 'Student Finance Office',
    code: 'FIN',
    description: 'Handles fee payments, balances, receipts, refunds and billing inquiries.',
    sortOrder: 30,
  },
  {
    name: 'Student Administration',
    code: 'STUAD',
    description:
      'Handles student identity cards, personal information corrections, admission and enrolment records.',
    sortOrder: 40,
  },
  {
    name: 'ICT Support',
    code: 'ICT',
    description:
      'Handles the student portal, account access, online learning platforms and other digital academic services.',
    sortOrder: 50,
  },
  {
    name: 'General Administration',
    code: 'ADMIN',
    description:
      'Central triage queue for general inquiries and administrative complaints that do not fit another office.',
    sortOrder: 60,
    isFallbackQueue: true,
  },
];

const CATEGORIES = [
  // Academic records → Academic Affairs
  { name: 'Missing Examination Results', department: 'ACAD', sortOrder: 10 },
  { name: 'Incorrect Grade', department: 'ACAD', sortOrder: 20 },
  { name: 'GPA or CGPA Discrepancy', department: 'ACAD', sortOrder: 30 },
  { name: 'Transcript Request or Discrepancy', department: 'ACAD', sortOrder: 40 },
  { name: 'Incorrect Academic Records', department: 'ACAD', sortOrder: 50 },
  // Registration and examinations → Registration Office
  { name: 'Course Registration Problem', department: 'REG', sortOrder: 10 },
  { name: 'Missing Registered Course', department: 'REG', sortOrder: 20 },
  { name: 'Examination Eligibility', department: 'REG', sortOrder: 30 },
  { name: 'Examination Timetable Issue', department: 'REG', sortOrder: 40 },
  { name: 'Student Portal Registration Error', department: 'REG', sortOrder: 50 },
  // Finance → Student Finance Office
  { name: 'Fees Payment Not Reflected', department: 'FIN', sortOrder: 10 },
  { name: 'Incorrect Financial Balance', department: 'FIN', sortOrder: 20 },
  { name: 'Payment Receipt Issue', department: 'FIN', sortOrder: 30 },
  { name: 'Refund or Billing Inquiry', department: 'FIN', sortOrder: 40 },
  // Student administration → Student Administration
  { name: 'Student ID Card', department: 'STUAD', sortOrder: 10 },
  { name: 'Personal Information Correction', department: 'STUAD', sortOrder: 20 },
  { name: 'Admission or Enrolment Record', department: 'STUAD', sortOrder: 30 },
  { name: 'General Administrative Complaint', department: 'STUAD', sortOrder: 40 },
  // Technology → ICT Support
  { name: 'Student Portal Access', department: 'ICT', sortOrder: 10 },
  { name: 'Password or Account Problem', department: 'ICT', sortOrder: 20 },
  { name: 'Online Learning Platform', department: 'ICT', sortOrder: 30 },
  { name: 'Other Digital Academic Services', department: 'ICT', sortOrder: 40 },
  // Other → General Administration
  { name: 'General Inquiry', department: 'ADMIN', sortOrder: 10 },
  { name: 'Unlisted Issue', department: 'ADMIN', sortOrder: 20 },
];

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password.normalize('NFKC'), salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  });
  return ['scrypt', 16384, 8, 1, salt.toString('hex'), derived.toString('hex')].join('$');
}

async function syncRolesAndPermissions(): Promise<void> {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role },
      create: { name: role, description: ROLE_LABELS[role], isSystem: true },
      update: { description: ROLE_LABELS[role] },
    });
  }

  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission },
      create: { key: permission, description: permission },
      update: {},
    });
  }

  const permissionRecords = await prisma.permission.findMany();
  const permissionByKey = new Map(permissionRecords.map((record) => [record.key, record]));

  for (const role of ROLES) {
    const roleRecord = await prisma.role.findUniqueOrThrow({ where: { name: role } });
    const keys: PermissionKey[] = [...ROLE_PERMISSIONS[role]];
    await prisma.rolePermission.deleteMany({ where: { roleId: roleRecord.id } });
    for (const key of keys) {
      const permission = permissionByKey.get(key);
      if (!permission) continue;
      await prisma.rolePermission.create({
        data: { roleId: roleRecord.id, permissionId: permission.id },
      });
    }
  }
}

async function seedDepartmentsAndCategories(): Promise<void> {
  const byCode = new Map<string, string>();

  for (const department of DEPARTMENTS) {
    const record = await prisma.department.upsert({
      where: { name: department.name },
      create: {
        name: department.name,
        code: department.code,
        description: department.description,
        isFallbackQueue: department.isFallbackQueue ?? false,
        sortOrder: department.sortOrder,
        contactEmail: `help.${department.code.toLowerCase()}@live.gctu.edu.gh`,
      },
      update: {
        description: department.description,
        isFallbackQueue: department.isFallbackQueue ?? false,
        sortOrder: department.sortOrder,
      },
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
        escalationAfterReminders: 3,
      },
      update: {},
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
        defaultPriority: 'NORMAL',
        sortOrder: category.sortOrder,
      },
      update: { departmentId: departmentId ?? null, sortOrder: category.sortOrder },
    });
  }
}

async function seedSuperAdministrator(): Promise<void> {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'amoswnganbe@gmail.com').toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? 'ChangeMe!2026';
  const fullName = process.env.BOOTSTRAP_ADMIN_NAME ?? 'Platform Super Administrator';

  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: existing.id, roleId: superAdminRole.id } },
      create: { userId: existing.id, roleId: superAdminRole.id },
      update: {},
    });
    return;
  }

  await prisma.user.create({
    data: {
      fullName,
      email,
      passwordHash: hashPassword(password),
      emailVerifiedAt: new Date(),
      accountStatus: 'ACTIVE',
      roles: { create: { roleId: superAdminRole.id } },
    },
  });
}

async function main(): Promise<void> {
  await syncRolesAndPermissions();
  await seedDepartmentsAndCategories();
  await seedSuperAdministrator();
  process.stdout.write(
    'Seed complete: roles, permissions, departments, categories and the super administrator are in place.\n',
  );
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
