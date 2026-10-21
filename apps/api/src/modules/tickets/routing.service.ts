import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';

export interface RoutingDecision {
  departmentId: string;
  assignedToId: string | null;
  source: 'STUDENT' | 'TRIAGE';
  usedFallbackQueue: boolean;
  notes: string[];
}

/**
 * Decides where a new ticket goes.
 *
 * Rules (PRD §6.2):
 *  * A category bound to a department wins over a free-form choice, so the
 *    report reaches the correct office first time.
 *  * A student who does not know the officer routes to the department queue —
 *    they are never forced to pick a person.
 *  * A department without active officers is routed to a fallback queue; the
 *    report is never discarded.
 */
export async function resolveRouting(params: {
  categoryId: string;
  departmentId: string;
  requestedOfficerId?: string | null | undefined;
  useTriageQueue?: boolean | undefined;
  allowStudentOfficerSelection: boolean;
}): Promise<RoutingDecision> {
  const notes: string[] = [];

  const category = await prisma.category.findUnique({
    where: { id: params.categoryId },
    select: { id: true, name: true, departmentId: true, isActive: true },
  });
  if (!category || !category.isActive) {
    throw notFound('The selected issue category is not available.');
  }

  const requestedDepartment = await prisma.department.findUnique({
    where: { id: params.departmentId },
    select: { id: true, name: true, isActive: true },
  });
  if (!requestedDepartment || !requestedDepartment.isActive) {
    throw notFound('The selected department is not available.');
  }

  let departmentId = requestedDepartment.id;
  if (category.departmentId && category.departmentId !== requestedDepartment.id) {
    const categoryDepartment = await prisma.department.findUnique({
      where: { id: category.departmentId },
      select: { id: true, name: true, isActive: true },
    });
    if (categoryDepartment?.isActive) {
      departmentId = categoryDepartment.id;
      notes.push(
        `Routed to ${categoryDepartment.name} because the category "${category.name}" is handled by that department.`,
      );
    }
  }

  if (params.useTriageQueue) {
    notes.push('Sent to the department queue for triage.');
    const decision = await applyFallbackIfEmpty(departmentId, notes);
    return { ...decision, assignedToId: null, source: 'TRIAGE', notes };
  }

  let assignedToId: string | null = null;

  if (params.requestedOfficerId) {
    if (!params.allowStudentOfficerSelection) {
      notes.push('Direct officer selection is disabled; the ticket goes to the department queue.');
    } else {
      const eligible = await prisma.departmentMembership.findFirst({
        where: {
          departmentId,
          userId: params.requestedOfficerId,
          isActive: true,
          user: {
            accountStatus: 'ACTIVE',
            roles: { some: { role: { name: { in: ['OFFICER', 'DEPARTMENT_HEAD'] } } } },
          },
        },
        select: { id: true },
      });
      if (eligible) {
        assignedToId = params.requestedOfficerId;
      } else {
        notes.push(
          'The selected officer is not available for this department; the ticket goes to the department queue.',
        );
      }
    }
  }

  if (!assignedToId) {
    const hasOfficers = await prisma.departmentMembership.findFirst({
      where: {
        departmentId,
        isActive: true,
        user: {
          accountStatus: 'ACTIVE',
          roles: { some: { role: { name: { in: ['OFFICER', 'DEPARTMENT_HEAD'] } } } },
        },
      },
      select: { id: true },
    });

    if (!hasOfficers) {
      const decision = await applyFallbackIfEmpty(departmentId, notes);
      return { ...decision, assignedToId: null, source: 'TRIAGE', notes };
    }
  }

  return {
    departmentId,
    assignedToId,
    source: 'STUDENT',
    usedFallbackQueue: false,
    notes,
  };
}

/**
 * Moves a ticket to a fallback queue when the target department has no active
 * officers. If no fallback queue exists the ticket stays in its department
 * with no assignee and is flagged for administrative attention.
 */
async function applyFallbackIfEmpty(
  departmentId: string,
  notes: string[],
): Promise<{
  departmentId: string;
  usedFallbackQueue: boolean;
}> {
  const hasOfficers = await prisma.departmentMembership.findFirst({
    where: {
      departmentId,
      isActive: true,
      user: {
        accountStatus: 'ACTIVE',
        roles: { some: { role: { name: { in: ['OFFICER', 'DEPARTMENT_HEAD'] } } } },
      },
    },
    select: { id: true },
  });
  if (hasOfficers) return { departmentId, usedFallbackQueue: false };

  const fallback = await prisma.department.findFirst({
    where: { isFallbackQueue: true, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true },
  });

  if (fallback && fallback.id !== departmentId) {
    notes.push(`${fallback.name} will triage this report because no active officer was available.`);
    return { departmentId: fallback.id, usedFallbackQueue: true };
  }

  notes.push(
    'No active officer was available. The report has been flagged for administrative assignment.',
  );
  return { departmentId, usedFallbackQueue: false };
}

/** Officers a student may choose directly (restricted to the chosen department). */
export async function listSelectableOfficers(departmentId: string) {
  return prisma.departmentMembership.findMany({
    where: {
      departmentId,
      isActive: true,
      user: {
        accountStatus: 'ACTIVE',
        roles: { some: { role: { name: { in: ['OFFICER', 'DEPARTMENT_HEAD'] } } } },
      },
    },
    select: {
      id: true,
      departmentRole: true,
      user: { select: { id: true, fullName: true } },
    },
    orderBy: { user: { fullName: 'asc' } },
  });
}

export async function assertCategoryBelongsToDepartment(
  categoryId: string,
  departmentId: string,
): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { departmentId: true, name: true },
  });
  if (!category) throw notFound('The selected issue category is not available.');
  if (category.departmentId && category.departmentId !== departmentId) {
    throw badRequest(`The category "${category.name}" is handled by a different department.`);
  }
}
