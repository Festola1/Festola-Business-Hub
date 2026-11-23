import express, { type Router } from 'express';
import { z } from 'zod';
import {
  asyncHandler,
  BasePaginationQuerySchema,
  parseBody,
  parseQuery,
  parseUuidParam,
  sendPaginated,
} from '../../lib/http.ts';
import { requirePermission, requireWritableSubscription } from '../../lib/rbac.ts';
import { requireIdempotencyKey, type IdempotencyAwareRequest } from '../../lib/tx.ts';
import { ApiError } from '../../middleware/error-handler.ts';
import { ResolveSyncConflictSchema, SyncPushSchema } from '../commerce/commerce.types.ts';
import { runIdempotentRoute, type DomainRouterDeps } from '../commerce/route-deps.ts';

const UuidSchema = z.string().uuid();
const SyncConflictListQuerySchema = BasePaginationQuerySchema.extend({
  status: z.enum(['open', 'resolved']).optional(),
});

function extractDeviceIdHeader(headerVal: string | string[] | undefined): string {
  const raw = Array.isArray(headerVal) ? headerVal[0]?.trim() : headerVal?.trim();
  if (!raw || !UuidSchema.safeParse(raw).success) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'A valid X-Device-ID UUID header is required for offline sync operations.',
    );
  }
  return raw;
}

export function createSyncRouter(deps: DomainRouterDeps): Router {
  const router = express.Router();

  router.get(
    '/sync/bootstrap',
    deps.requireTenant,
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const deviceId = extractDeviceIdHeader(req.headers['x-device-id']);
      const snapshot = await deps.getService().getSyncBootstrap(req.tenantContext!, deviceId);
      res.status(200).json({ success: true, data: snapshot });
    }),
  );

  router.post(
    '/sync/push',
    deps.requireTenant,
    requirePermission('pos.sell'),
    requireWritableSubscription,
    deps.rateLimiters.syncPush,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const deviceId = extractDeviceIdHeader(req.headers['x-device-id']);
      const input = parseBody(SyncPushSchema, req.body);
      await runIdempotentRoute(req, res, deps, '/sync/push', { deviceId, ...input }, 200, () =>
        deps.getService().pushSyncBatch(req.tenantContext!, deviceId, input),
      );
    }),
  );

  router.get(
    '/sync/conflicts',
    deps.requireTenant,
    requirePermission('sync_conflicts.resolve'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const query = parseQuery(SyncConflictListQuerySchema, req.query);
      const page = await deps.getService().listSyncConflicts(req.tenantContext!, {
        limit: query.limit,
        offset: query.offset,
        status: query.status,
      });
      sendPaginated(res, 'conflicts', page.items, {
        limit: query.limit,
        offset: query.offset,
        total: page.total,
      });
    }),
  );

  router.post(
    '/sync/conflicts/:conflictId/resolve',
    deps.requireTenant,
    requirePermission('sync_conflicts.resolve'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const conflictId = parseUuidParam(req.params.conflictId, 'conflictId');
      const input = parseBody(ResolveSyncConflictSchema, req.body);
      await runIdempotentRoute(
        req,
        res,
        deps,
        `/sync/conflicts/${conflictId}/resolve`,
        input,
        200,
        async () => {
          const conflict = await deps
            .getService()
            .resolveSyncConflict(req.tenantContext!, conflictId, input);
          return { conflict };
        },
      );
    }),
  );

  return router;
}
