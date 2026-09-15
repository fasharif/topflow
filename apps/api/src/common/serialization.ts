import {
  fromFils,
  toFils,
  type Paginated,
  type PaginationQuery,
} from '@topflow/shared';

type DecimalLike = { toString(): string };

/** Decimal → canonical 2dp string ("45.50"). */
export function money(value: DecimalLike | string | number): string {
  return fromFils(toFils(value));
}

export function moneyOrNull(
  value: DecimalLike | string | number | null | undefined,
): string | null {
  return value === null || value === undefined ? null : money(value);
}

export function iso(value: Date): string {
  return value.toISOString();
}

export function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function pageArgs(query: PaginationQuery): {
  skip: number;
  take: number;
} {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function paginated<T>(
  items: T[],
  total: number,
  query: PaginationQuery,
): Paginated<T> {
  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
