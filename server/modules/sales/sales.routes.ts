import express, { type Router } from 'express';
import {
  asyncHandler,
  parseBody,
  parseQuery,
  parseUuidParam,
  sendPaginated,
} from '../../lib/http.ts';
import { requirePermission, requireWritableSubscription } from '../../lib/rbac.ts';
import { requireIdempotencyKey, type IdempotencyAwareRequest } from '../../lib/tx.ts';
import {
  CreateSaleSchema,
  ReturnSaleSchema,
  SaleListQuerySchema,
  VoidSaleSchema,
} from '../commerce/commerce.types.ts';
import { runIdempotentRoute, type DomainRouterDeps } from '../commerce/route-deps.ts';

export function createSalesRouter(deps: DomainRouterDeps): Router {
  const router = express.Router();

  router.get(
    '/sales',
    deps.requireTenant,
    requirePermission('receipts.view'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const query = parseQuery(SaleListQuerySchema, req.query);
      const page = await deps.getService().listSales(req.tenantContext!, query);
      sendPaginated(res, 'sales', page.items, {
        limit: query.limit,
        offset: query.offset,
        total: page.total,
      });
    }),
  );

  router.get(
    '/sales/:saleId',
    deps.requireTenant,
    requirePermission('receipts.view'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const saleId = parseUuidParam(req.params.saleId, 'saleId');
      const sale = await deps.getService().getSale(req.tenantContext!, saleId);
      res.status(200).json({ success: true, data: { sale } });
    }),
  );

  router.post(
    '/sales',
    deps.requireTenant,
    requirePermission('pos.sell'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const input = parseBody(CreateSaleSchema, req.body);
      await runIdempotentRoute(req, res, deps, '/sales', input, 201, async () => {
        const sale = await deps.getService().createSale(req.tenantContext!, input);
        return { sale };
      });
    }),
  );

  router.post(
    '/sales/:saleId/void',
    deps.requireTenant,
    requirePermission('sales.void_or_return'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const saleId = parseUuidParam(req.params.saleId, 'saleId');
      const input = parseBody(VoidSaleSchema, req.body);
      await runIdempotentRoute(req, res, deps, `/sales/${saleId}/void`, input, 200, () =>
        deps.getService().voidSale(req.tenantContext!, saleId, input),
      );
    }),
  );

  router.post(
    '/sales/:saleId/returns',
    deps.requireTenant,
    requirePermission('sales.void_or_return'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const saleId = parseUuidParam(req.params.saleId, 'saleId');
      const input = parseBody(ReturnSaleSchema, req.body);
      await runIdempotentRoute(req, res, deps, `/sales/${saleId}/returns`, input, 201, () =>
        deps.getService().returnSale(req.tenantContext!, saleId, input),
      );
    }),
  );

  router.get(
    '/receipts/:receiptId',
    deps.requireTenant,
    requirePermission('receipts.view'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const receiptId = parseUuidParam(req.params.receiptId, 'receiptId');
      const receipt = await deps.getService().getReceipt(req.tenantContext!, receiptId);
      res.status(200).json({ success: true, data: { receipt } });
    }),
  );

  return router;
}
