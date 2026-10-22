export interface PageParams {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Parses `page` (1-indexed) and `pageSize` query params with safe bounds. */
export function parsePageParams(url: URL): PageParams {
  const pageRaw = url.searchParams.get("page") ?? "1";
  const pageSizeRaw = url.searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE);

  const page = Number(pageRaw);
  const pageSize = Number(pageSizeRaw);

  if (!Number.isInteger(page) || page < 1) {
    throw new ValidationError("page must be a positive integer");
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new ValidationError(`pageSize must be between 1 and ${MAX_PAGE_SIZE}`);
  }

  return { page, pageSize, offset: (page - 1) * pageSize };
}

export interface PagedResult<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

export function toPagedResult<T>(
  items: readonly T[],
  total: number,
  params: PageParams,
): PagedResult<T> {
  return {
    items,
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}
