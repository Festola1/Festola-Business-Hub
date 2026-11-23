import { createHash } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../middleware/error-handler.ts';
import type { TenantContextRequest } from '../middleware/tenant-context.ts';

const UuidSchema = z.string().uuid();

export const BasePaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(50_000).default(0),
  search: z.string().trim().max(100).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type BasePaginationQuery = z.infer<typeof BasePaginationQuerySchema>;

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new ApiError(400, 'VALIDATION_ERROR', message);
  }
  return parsed.data;
}

export function parseQuery<T>(schema: z.ZodType<T>, query: unknown): T {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'query'}: ${issue.message}`)
      .join('; ');
    throw new ApiError(400, 'VALIDATION_ERROR', message);
  }
  return parsed.data;
}

export function parseUuidParam(value: string | string[] | undefined, label: string): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !UuidSchema.safeParse(raw).success) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} must be a valid UUID.`);
  }
  return raw;
}

export function asyncHandler(
  fn: (req: TenantContextRequest, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: TenantContextRequest, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch(next);
  };
}

export function sendPaginated<T>(
  res: Response,
  itemsKey: string,
  items: T[],
  pagination: { limit: number; offset: number; total: number },
  extraData: Record<string, unknown> = {},
): void {
  res.status(200).json({
    success: true,
    data: {
      [itemsKey]: items,
      ...extraData,
    },
    meta: {
      limit: pagination.limit,
      offset: pagination.offset,
      total: pagination.total,
      hasMore: pagination.offset + items.length < pagination.total,
    },
  });
}

function canonicalizeValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const sorted: Record<string, unknown> = {};
  for (const [key, val] of entries) {
    if (val !== undefined) {
      sorted[key] = canonicalizeValue(val);
    }
  }
  return sorted;
}

export function buildCanonicalRequestHash(
  method: string,
  routeKey: string,
  payload: unknown,
): string {
  const serialized = JSON.stringify({
    method: method.toUpperCase(),
    routeKey,
    payload: canonicalizeValue(payload),
  });
  return createHash('sha256').update(serialized).digest('hex');
}
