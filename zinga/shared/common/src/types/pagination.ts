export interface PaginationQuery {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const toPaginatedResult = <T>(
  items: T[],
  total: number,
  query: PaginationQuery,
): PaginatedResult<T> => ({
  items,
  total,
  page: query.page,
  limit: query.limit,
  totalPages: Math.max(1, Math.ceil(total / query.limit)),
});
