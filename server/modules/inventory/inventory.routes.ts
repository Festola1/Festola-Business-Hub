import express, { type Router } from 'express';
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
import {
  CreateRestockBatchSchema,
  CreateStockAdjustmentSchema,
  ProductListQuerySchema,
  StockMovementQuerySchema,
} from '../commerce/commerce.types.ts';
import { runIdempotentRoute, type DomainRouterDeps } from '../commerce/route-deps.ts';

export function createInventoryRouter(deps: DomainRouterDeps): Router {
  const router = express.Router();

  router.get(
    '/inventory/balances',
    deps.requireTenant,
    requirePermission('products.view_selling'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const query = parseQuery(ProductListQuerySchema, req.query);
      const page = await deps.getService().listInventoryBalances(req.tenantContext!, query);
      sendPaginated(res, 'balances', page.items, {
        limit: query.limit,
        offset: query.offset,
        total: page.total,
      });
    }),
  );

  router.get(
    '/inventory/movements',
    deps.requireTenant,
    requirePermission('inventory.receive_and_adjust'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const query = parseQuery(StockMovementQuerySchema, req.query);
      const page = await deps.getService().listStockMovements(req.tenantContext!, query);
      sendPaginated(res, 'movements', page.items, {
        limit: query.limit,
        offset: query.offset,
        total: page.total,
      });
    }),
  );

  router.post(
    '/inventory/adjustments',
    deps.requireTenant,
    requirePermission('inventory.receive_and_adjust'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const input = parseBody(CreateStockAdjustmentSchema, req.body);
      await runIdempotentRoute(req, res, deps, '/inventory/adjustments', input, 201, () =>
        deps.getService().createStockAdjustment(req.tenantContext!, input),
      );
    }),
  );

  router.get(
    '/restocks',
    deps.requireTenant,
    requirePermission('inventory.receive_and_adjust'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const query = parseQuery(BasePaginationQuerySchema, req.query);
      const page = await deps.getService().listRestockBatches(req.tenantContext!, {
        limit: query.limit,
        offset: query.offset,
        from: query.from,
        to: query.to,
      });
      sendPaginated(res, 'restocks', page.items, {
        limit: query.limit,
        offset: query.offset,
        total: page.total,
      });
    }),
  );

  router.get(
    '/restocks/:batchId',
    deps.requireTenant,
    requirePermission('inventory.receive_and_adjust'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const batchId = parseUuidParam(req.params.batchId, 'batchId');
      const restock = await deps.getService().getRestockBatch(req.tenantContext!, batchId);
      res.status(200).json({ success: true, data: { restock } });
    }),
  );

  router.post(
    '/restocks',
    deps.requireTenant,
    requirePermission('inventory.receive_and_adjust'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const input = parseBody(CreateRestockBatchSchema, req.body);
      await runIdempotentRoute(req, res, deps, '/restocks', input, 201, async () => {
        const restock = await deps.getService().createRestockBatch(req.tenantContext!, input);
        return { restock };
      });
    }),
  );

  return router;
}
