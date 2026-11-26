import type { NextFunction, Response } from 'express';
import type { PoolClient } from 'pg';
import { ApiError } from '../middleware/error-handler.ts';
import type { TenantContextRequest } from '../middleware/tenant-context.ts';
import type { BusinessRole } from '../modules/identity/identity.types.ts';
import type { DbPoolHandle } from './db.ts';
import { buildCanonicalRequestHash } from './http.ts';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{16,128}$/;
const IDEMPOTENCY_TTL_DAYS = 30;

export interface IdempotencyAwareRequest extends TenantContextRequest {
  idempotencyKey?: string;
}

export interface StoredIdempotencyRecord {
  businessId: string;
  idempotencyKey: string;
  requestMethod: string;
  requestPath: string;
  requestHash: string;
  responseStatusCode: number;
  responseBody: unknown;
  createdAt: string;
  expiresAt: string;
}

export interface IdempotencyRecordStore {
  get(businessId: string, idempotencyKey: string): Promise<StoredIdempotencyRecord | null>;
  save(record: StoredIdempotencyRecord): Promise<void>;
}

export class InMemoryIdempotencyRecordStore implements IdempotencyRecordStore {
  private readonly records = new Map<string, StoredIdempotencyRecord>();

  private key(businessId: string, idempotencyKey: string): string {
    return `${businessId}:${idempotencyKey}`;
  }

  async get(businessId: string, idempotencyKey: string): Promise<StoredIdempotencyRecord | null> {
    const existing = this.records.get(this.key(businessId, idempotencyKey));
    if (!existing) {
      return null;
    }
    if (Date.parse(existing.expiresAt) < Date.now()) {
      this.records.delete(this.key(businessId, idempotencyKey));
      return null;
    }
    return existing;
  }

  async save(record: StoredIdempotencyRecord): Promise<void> {
    this.records.set(this.key(record.businessId, record.idempotencyKey), record);
  }
}

export class PgIdempotencyRecordStore implements IdempotencyRecordStore {
  private readonly db: DbPoolHandle;

  constructor(db: DbPoolHandle) {
    this.db = db;
  }

  async get(businessId: string, idempotencyKey: string): Promise<StoredIdempotencyRecord | null> {
    const res = await this.db.pool.query(
      `SELECT business_id, idempotency_key, request_method, request_path, request_hash,
              response_status_code, response_body, created_at, expires_at
         FROM public.idempotency_records
        WHERE business_id = $1 AND idempotency_key = $2 AND expires_at > NOW()`,
      [businessId, idempotencyKey],
    );
    const row = res.rows[0];
    if (!row) {
      return null;
    }
    return {
      businessId: String(row.business_id),
      idempotencyKey: String(row.idempotency_key),
      requestMethod: String(row.request_method),
      requestPath: String(row.request_path),
      requestHash: String(row.request_hash),
      responseStatusCode: Number(row.response_status_code),
      responseBody: row.response_body,
      createdAt: new Date(String(row.created_at)).toISOString(),
      expiresAt: new Date(String(row.expires_at)).toISOString(),
    };
  }

  async save(record: StoredIdempotencyRecord): Promise<void> {
    await this.db.pool.query(
      `INSERT INTO public.idempotency_records (
         business_id, idempotency_key, request_method, request_path, request_hash,
         response_status_code, response_body, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       ON CONFLICT (business_id, idempotency_key) DO NOTHING`,
      [
        record.businessId,
        record.idempotencyKey,
        record.requestMethod,
        record.requestPath,
        record.requestHash,
        record.responseStatusCode,
        JSON.stringify(record.responseBody),
        record.expiresAt,
      ],
    );
  }
}

/**
 * Middleware enforcing presence and valid format of `Idempotency-Key` on protected writes.
 */
export function requireIdempotencyKey(
  req: IdempotencyAwareRequest,
  _res: Response,
  next: NextFunction,
): void {
  const raw = req.headers['idempotency-key'];
  const key = Array.isArray(raw) ? raw[0]?.trim() : raw?.trim();
  if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    next(
      new ApiError(
        400,
        'VALIDATION_ERROR',
        'A valid Idempotency-Key header (16-128 alphanumeric, UUID, or dash/underscore chars) is required for this write operation.',
      ),
    );
    return;
  }
  req.idempotencyKey = key;
  next();
}

const inFlightIdempotentOps = new Map<string, Promise<unknown>>();

/**
 * Executes an idempotent write operation scoped strictly to `(businessId, idempotencyKey)`.
 * - Concurrent duplicate requests sharing the same key serialize cleanly so the operation
 *   runs at most once, and subsequent callers replay the exact committed response.
 * - Replayed key with identical payload hash returns cached response with `replayed: true`.
 * - Replayed key with a different payload hash throws `409 IDEMPOTENCY_CONFLICT`.
 */
export async function executeIdempotentOperation<T>(params: {
  store: IdempotencyRecordStore;
  businessId: string;
  idempotencyKey: string;
  method: string;
  routeKey: string;
  payload: unknown;
  successStatusCode?: number;
  execute: () => Promise<T>;
}): Promise<{ statusCode: number; body: { success: true; data: T }; replayed: boolean }> {
  const lockKey = `${params.businessId}:${params.idempotencyKey}`;
  const requestHash = buildCanonicalRequestHash(params.method, params.routeKey, params.payload);

  const runOnce = async (): Promise<{
    statusCode: number;
    body: { success: true; data: T };
    replayed: boolean;
  }> => {
    const existing = await params.store.get(params.businessId, params.idempotencyKey);

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ApiError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'This Idempotency-Key was already used with a different request payload.',
        );
      }
      return {
        statusCode: existing.responseStatusCode,
        body: existing.responseBody as { success: true; data: T },
        replayed: true,
      };
    }

    const data = await params.execute();
    const statusCode = params.successStatusCode ?? 201;
    const body = { success: true as const, data };
    const now = new Date();
    const expiresAt = new Date(now.getTime() + IDEMPOTENCY_TTL_DAYS * 86_400_000).toISOString();

    await params.store.save({
      businessId: params.businessId,
      idempotencyKey: params.idempotencyKey,
      requestMethod: params.method.toUpperCase(),
      requestPath: params.routeKey,
      requestHash,
      responseStatusCode: statusCode,
      responseBody: body,
      createdAt: now.toISOString(),
      expiresAt,
    });

    return { statusCode, body, replayed: false };
  };

  const prior = inFlightIdempotentOps.get(lockKey);
  const current = (prior ? prior.catch(() => undefined).then(runOnce) : runOnce());
  inFlightIdempotentOps.set(lockKey, current);

  try {
    return await current;
  } finally {
    if (inFlightIdempotentOps.get(lockKey) === current) {
      inFlightIdempotentOps.delete(lockKey);
    }
  }
}

/**
 * Writes an immutable tenant audit log entry using the caller's active PostgreSQL transaction client.
 */
export async function writeAuditEvent(
  client: PoolClient,
  event: {
    businessId: string;
    actorUserId: string | null;
    actorRole: BusinessRole | 'system' | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO public.audit_logs (
       business_id, actor_user_id, actor_role, action, entity_type, entity_id, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      event.businessId,
      event.actorUserId,
      event.actorRole,
      event.action,
      event.entityType,
      event.entityId ?? null,
      JSON.stringify(event.metadata ?? {}),
    ],
  );
}

/**
 * PostgreSQL-native atomic idempotent transaction wrapper: checks/inserts `idempotency_records`
 * inside the SAME tenant-scoped RLS transaction as the domain mutation and audit event.
 */
export async function withIdempotentTenantTransaction<T>(params: {
  db: DbPoolHandle;
  businessId: string;
  userId: string;
  idempotencyKey: string;
  method: string;
  routeKey: string;
  payload: unknown;
  successStatusCode?: number;
  fn: (client: PoolClient) => Promise<T>;
}): Promise<{ statusCode: number; body: { success: true; data: T }; replayed: boolean }> {
  const requestHash = buildCanonicalRequestHash(params.method, params.routeKey, params.payload);

  return params.db.withTenantTransaction(params.businessId, params.userId, async (client) => {
    const existingRes = await client.query(
      `SELECT request_hash, response_status_code, response_body
         FROM public.idempotency_records
        WHERE business_id = $1 AND idempotency_key = $2 AND expires_at > NOW()
        FOR UPDATE`,
      [params.businessId, params.idempotencyKey],
    );

    const existing = existingRes.rows[0];
    if (existing) {
      if (String(existing.request_hash) !== requestHash) {
        throw new ApiError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'This Idempotency-Key was already used with a different request payload.',
        );
      }
      return {
        statusCode: Number(existing.response_status_code),
        body: existing.response_body as { success: true; data: T },
        replayed: true,
      };
    }

    const data = await params.fn(client);
    const statusCode = params.successStatusCode ?? 201;
    const body = { success: true as const, data };
    const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_DAYS * 86_400_000).toISOString();

    await client.query(
      `INSERT INTO public.idempotency_records (
         business_id, idempotency_key, request_method, request_path, request_hash,
         response_status_code, response_body, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        params.businessId,
        params.idempotencyKey,
        params.method.toUpperCase(),
        params.routeKey,
        requestHash,
        statusCode,
        JSON.stringify(body),
        expiresAt,
      ],
    );

    return { statusCode, body, replayed: false };
  });
}

/**
 * Helper to sort UUIDs deterministically before acquiring PostgreSQL `FOR UPDATE` row locks
 * to prevent circular deadlocks across concurrent POS checkouts and restocks.
 */
export function sortIdsForLocking(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}
