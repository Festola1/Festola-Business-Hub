import type { RequestHandler, Response } from 'express';
import {
  executeIdempotentOperation,
  type IdempotencyAwareRequest,
  type IdempotencyRecordStore,
} from '../../lib/tx.ts';
import type { CommerceService } from './commerce.service.ts';

export interface DomainRouterDeps {
  requireUser: RequestHandler;
  requireTenant: RequestHandler;
  getService: () => CommerceService;
  idempotencyStore: IdempotencyRecordStore;
  rateLimiters: {
    standardRead: RequestHandler;
    financialWrite: RequestHandler;
    reports: RequestHandler;
    syncPush: RequestHandler;
    webhook: RequestHandler;
  };
}

export async function runIdempotentRoute<T>(
  req: IdempotencyAwareRequest,
  res: Response,
  deps: DomainRouterDeps,
  routeKey: string,
  payload: unknown,
  successStatusCode: number,
  execute: () => Promise<T>,
): Promise<void> {
  const outcome = await executeIdempotentOperation({
    store: deps.idempotencyStore,
    businessId: req.tenantContext!.businessId,
    idempotencyKey: req.idempotencyKey!,
    method: req.method,
    routeKey,
    payload,
    successStatusCode,
    execute,
  });

  if (outcome.replayed) {
    res.setHeader('Idempotency-Replayed', 'true');
  }
  res.status(outcome.statusCode).json(outcome.body);
}
