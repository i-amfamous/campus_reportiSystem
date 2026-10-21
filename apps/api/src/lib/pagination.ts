import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type Paginated } from '@campus-resolve/shared';

export interface PaginationOptions {
  page?: number | undefined;
  pageSize?: number | undefined;
}

export function resolvePagination(options: PaginationOptions = {}): {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
} {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginate<T>(
  items: T[],
  total: number,
  options: PaginationOptions = {},
): Paginated<T> {
  const { page, pageSize } = resolvePagination(options);
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
