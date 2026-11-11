import type { AcademicPeriod, Prisma, SemesterTerm } from '@prisma/client';
import {
  academicPeriodLabel,
  SEMESTER_LABELS,
  type AcademicPeriodInput,
  type AcademicPeriodUpdateInput,
} from '@campus-resolve/shared';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import type { AuthContext } from '../auth/auth.types';
import { writeAudit, type RequestMeta } from '../admin/admin.service';

type PeriodRecord = AcademicPeriod & { _count?: { tickets: number } };

function toPeriod(period: PeriodRecord) {
  return {
    id: period.id,
    academicYear: period.academicYear,
    semester: period.semester,
    semesterLabel: SEMESTER_LABELS[period.semester as SemesterTerm],
    label: academicPeriodLabel({
      academicYear: period.academicYear,
      semester: period.semester as SemesterTerm,
    }),
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    isCurrent: period.isCurrent,
    ticketCount: period._count?.tickets ?? 0,
    createdAt: period.createdAt,
    updatedAt: period.updatedAt,
  };
}

export type AcademicPeriodView = ReturnType<typeof toPeriod>;

export async function listAcademicPeriods() {
  const periods = await prisma.academicPeriod.findMany({
    orderBy: [{ isCurrent: 'desc' }, { startsAt: 'desc' }],
    include: { _count: { select: { tickets: true } } },
  });
  return periods.map(toPeriod);
}

export async function getCurrentAcademicPeriod() {
  const period = await prisma.academicPeriod.findFirst({
    where: { isCurrent: true },
    include: { _count: { select: { tickets: true } } },
  });
  return period ? toPeriod(period) : null;
}

/** Resolves the period a privileged action should write to. */
export async function resolvePeriodFilter(academicPeriodId?: string) {
  if (!academicPeriodId) return undefined;
  const period = await prisma.academicPeriod.findUnique({ where: { id: academicPeriodId } });
  if (!period) throw notFound('Academic period not found.');
  return period;
}

export async function createAcademicPeriod(
  auth: AuthContext,
  input: AcademicPeriodInput,
  meta: RequestMeta,
) {
  const duplicate = await prisma.academicPeriod.findUnique({
    where: {
      academicYear_semester: {
        academicYear: input.academicYear,
        semester: input.semester,
      },
    },
  });
  if (duplicate) throw conflict('That academic year and semester already exists.');

  const currentCount = await prisma.academicPeriod.count({ where: { isCurrent: true } });
  const makeCurrent = input.isCurrent === true || currentCount === 0;

  const period = await prisma.$transaction(async (tx) => {
    if (makeCurrent) {
      await tx.academicPeriod.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      });
    }
    return tx.academicPeriod.create({
      data: {
        academicYear: input.academicYear,
        semester: input.semester,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        isCurrent: makeCurrent,
      },
      include: { _count: { select: { tickets: true } } },
    });
  });

  await writeAudit(
    auth,
    'ACADEMIC_PERIOD_CREATED',
    'AcademicPeriod',
    period.id,
    { ...input, isCurrent: period.isCurrent } as Prisma.InputJsonValue,
    meta,
  );

  return toPeriod(period);
}

export async function updateAcademicPeriod(
  auth: AuthContext,
  id: string,
  input: AcademicPeriodUpdateInput,
  meta: RequestMeta,
) {
  const existing = await prisma.academicPeriod.findUnique({ where: { id } });
  if (!existing) throw notFound('Academic period not found.');

  const startsAt = input.startsAt ?? existing.startsAt;
  const endsAt = input.endsAt ?? existing.endsAt;
  if (startsAt >= endsAt) throw badRequest('The start date must be before the end date.');

  if (input.academicYear || input.semester) {
    const duplicate = await prisma.academicPeriod.findUnique({
      where: {
        academicYear_semester: {
          academicYear: input.academicYear ?? existing.academicYear,
          semester: input.semester ?? existing.semester,
        },
      },
    });
    if (duplicate && duplicate.id !== id) {
      throw conflict('That academic year and semester already exists.');
    }
  }

  const makeCurrent = input.isCurrent === true;

  const period = await prisma.$transaction(async (tx) => {
    if (makeCurrent) {
      await tx.academicPeriod.updateMany({
        where: { isCurrent: true, id: { not: id } },
        data: { isCurrent: false },
      });
    }
    return tx.academicPeriod.update({
      where: { id },
      data: {
        ...(input.academicYear ? { academicYear: input.academicYear } : {}),
        ...(input.semester ? { semester: input.semester } : {}),
        ...(input.startsAt ? { startsAt: input.startsAt } : {}),
        ...(input.endsAt ? { endsAt: input.endsAt } : {}),
        ...(makeCurrent ? { isCurrent: true } : {}),
      },
      include: { _count: { select: { tickets: true } } },
    });
  });

  await writeAudit(
    auth,
    'ACADEMIC_PERIOD_UPDATED',
    'AcademicPeriod',
    id,
    input as Prisma.InputJsonValue,
    meta,
  );

  return toPeriod(period);
}

export async function setCurrentAcademicPeriod(
  auth: AuthContext,
  id: string,
  meta: RequestMeta,
) {
  const existing = await prisma.academicPeriod.findUnique({ where: { id } });
  if (!existing) throw notFound('Academic period not found.');

  const period = await prisma.$transaction(async (tx) => {
    await tx.academicPeriod.updateMany({
      where: { isCurrent: true, id: { not: id } },
      data: { isCurrent: false },
    });
    return tx.academicPeriod.update({
      where: { id },
      data: { isCurrent: true },
      include: { _count: { select: { tickets: true } } },
    });
  });

  await writeAudit(auth, 'ACADEMIC_PERIOD_ACTIVATED', 'AcademicPeriod', id, undefined, meta);
  return toPeriod(period);
}

export async function deleteAcademicPeriod(auth: AuthContext, id: string, meta: RequestMeta) {
  const existing = await prisma.academicPeriod.findUnique({
    where: { id },
    include: { _count: { select: { tickets: true } } },
  });
  if (!existing) throw notFound('Academic period not found.');
  if (existing.isCurrent) {
    throw conflict('Set another period as current before deleting this one.');
  }
  if (existing._count.tickets > 0) {
    throw conflict('This period has reports attached and cannot be deleted.');
  }

  await prisma.academicPeriod.delete({ where: { id } });
  await writeAudit(auth, 'ACADEMIC_PERIOD_DELETED', 'AcademicPeriod', id, undefined, meta);
}
