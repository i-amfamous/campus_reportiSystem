import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type {
  AdminUser,
  AuditEntry,
  Category,
  Department,
  DepartmentMetrics,
  Paginated,
  SystemDashboard,
  TicketDetail,
  TicketSummary,
} from '../../types';

export interface TicketFilters {
  page?: number;
  pageSize?: number;
  status?: string;
  categoryId?: string;
  departmentId?: string;
  assignedToId?: string;
  priority?: string;
  search?: string;
  overdue?: boolean;
  unassigned?: boolean;
  awaitingStudent?: boolean;
  from?: string;
  to?: string;
  sort?: string;
  order?: string;
}

export function ticketQueryString(filters: TicketFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === '' || value === null) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** The student's own reports. */
export function useMyTickets(filters: TicketFilters) {
  return useQuery({
    queryKey: ['tickets', 'mine', filters],
    queryFn: () =>
      api.get<Paginated<TicketSummary>>(`/api/v1/tickets${ticketQueryString(filters)}`),
  });
}

/** The staff work queue, scoped server-side to the caller's departments. */
export function useStaffTickets(filters: TicketFilters) {
  return useQuery({
    queryKey: ['tickets', 'staff', filters],
    queryFn: () =>
      api.get<Paginated<TicketSummary>>(`/api/v1/staff/tickets${ticketQueryString(filters)}`),
  });
}

export function useTicket(ticketId: string | undefined) {
  return useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: () => api.get<{ ticket: TicketDetail }>(`/api/v1/tickets/${ticketId}`),
    enabled: Boolean(ticketId),
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<{ items: Department[] }>('/api/v1/departments'),
    staleTime: 5 * 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ items: Category[] }>('/api/v1/departments/categories'),
    staleTime: 5 * 60_000,
  });
}

export interface OfficerOption {
  id: string;
  fullName: string;
  departmentRole: string;
}

export function useDepartmentOfficers(departmentId: string | undefined) {
  return useQuery({
    queryKey: ['department-officers', departmentId],
    queryFn: () =>
      api.get<{ items: OfficerOption[] }>(`/api/v1/departments/${departmentId}/officers`),
    enabled: Boolean(departmentId),
  });
}

export interface NotificationRecord {
  id: string;
  type: string;
  status: string;
  ticketId: string | null;
  createdAt: string;
  sentAt: string | null;
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ items: NotificationRecord[] }>('/api/v1/notifications'),
    refetchInterval: 60_000,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) =>
      api.post<{ id: string; referenceNumber: string; status: string }>('/api/v1/tickets', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useTicketMutations(ticketId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
    void queryClient.invalidateQueries({ queryKey: ['tickets'] });
  };

  const postMessage = useMutation({
    mutationFn: (body: string) => api.post(`/api/v1/tickets/${ticketId}/messages`, { body }),
    onSuccess: invalidate,
  });

  const postNote = useMutation({
    mutationFn: (body: string) => api.post(`/api/v1/staff/tickets/${ticketId}/notes`, { body }),
    onSuccess: invalidate,
  });

  const acknowledge = useMutation({
    mutationFn: () => api.post(`/api/v1/staff/tickets/${ticketId}/acknowledge`),
    onSuccess: invalidate,
  });

  const changeStatus = useMutation({
    mutationFn: (input: { status: string; note?: string }) =>
      api.patch(`/api/v1/staff/tickets/${ticketId}/status`, input),
    onSuccess: invalidate,
  });

  const assign = useMutation({
    mutationFn: (input: { assignedToId: string | null; reason?: string }) =>
      api.patch(`/api/v1/staff/tickets/${ticketId}/assign`, input),
    onSuccess: invalidate,
  });

  const resolve = useMutation({
    mutationFn: (resolutionSummary: string) =>
      api.post(`/api/v1/staff/tickets/${ticketId}/resolve`, { resolutionSummary }),
    onSuccess: invalidate,
  });

  const reopen = useMutation({
    mutationFn: (reason: string) => api.post(`/api/v1/tickets/${ticketId}/reopen`, { reason }),
    onSuccess: invalidate,
  });

  const escalate = useMutation({
    mutationFn: (reason: string) => api.post(`/api/v1/tickets/${ticketId}/escalate`, { reason }),
    onSuccess: invalidate,
  });

  const withdraw = useMutation({
    mutationFn: (reason: string) => api.post(`/api/v1/tickets/${ticketId}/withdraw`, { reason }),
    onSuccess: invalidate,
  });

  const feedback = useMutation({
    mutationFn: (input: { rating: number; comment?: string }) =>
      api.post(`/api/v1/tickets/${ticketId}/feedback`, input),
    onSuccess: invalidate,
  });

  const uploadAttachment = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post(`/api/v1/tickets/${ticketId}/attachments`, form);
    },
    onSuccess: invalidate,
  });

  return {
    postMessage,
    postNote,
    acknowledge,
    changeStatus,
    assign,
    resolve,
    reopen,
    escalate,
    withdraw,
    feedback,
    uploadAttachment,
  };
}

/* -------------------------------------------------------------------------- */
/* Administration                                                             */
/* -------------------------------------------------------------------------- */

export function useSystemDashboard() {
  return useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api.get<{ dashboard: SystemDashboard }>('/api/v1/admin/dashboard'),
  });
}

export interface UserFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
  accountStatus?: string;
  departmentId?: string;
  deleted?: boolean;
}

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value === undefined || value === '' || value === null) continue;
        params.set(key, String(value));
      }
      const query = params.toString();
      return api.get<Paginated<AdminUser>>(`/api/v1/admin/users${query ? `?${query}` : ''}`);
    },
  });
}

export function useAuditLogs(filters: {
  page?: number;
  pageSize?: number;
  action?: string;
  entityType?: string;
}) {
  return useQuery({
    queryKey: ['admin', 'audit', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value === undefined || value === '' || value === null) continue;
        params.set(key, String(value));
      }
      const query = params.toString();
      return api.get<Paginated<AuditEntry>>(`/api/v1/admin/audit-logs${query ? `?${query}` : ''}`);
    },
  });
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ['admin', 'health'],
    queryFn: () =>
      api.get<{
        jobs: { pending: number; failed: number; running: number };
        notifications: { failed: number; sent: number };
        emailProvider: string;
      }>('/api/v1/admin/system/health'),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () =>
      api.get<{
        settings: Record<string, unknown> & {
          institutionName?: string;
          supportEmail?: string;
          remindersPaused?: boolean;
          allowStudentOfficerSelection?: boolean;
        };
      }>('/api/v1/admin/settings'),
  });
}

export function useDepartmentAnalytics(departmentId: string | undefined) {
  return useQuery({
    queryKey: ['department-analytics', departmentId],
    queryFn: () =>
      api.get<{ metrics: DepartmentMetrics }>(`/api/v1/departments/${departmentId}/analytics`),
    enabled: Boolean(departmentId),
  });
}

export function useDepartmentWorkload(departmentId: string | undefined) {
  return useQuery({
    queryKey: ['department-workload', departmentId],
    queryFn: () =>
      api.get<{
        items: Array<{
          userId: string;
          fullName: string;
          open: number;
          assigned: number;
          overdue: number;
          resolved: number;
        }>;
      }>(`/api/v1/departments/${departmentId}/workload`),
    enabled: Boolean(departmentId),
  });
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}
