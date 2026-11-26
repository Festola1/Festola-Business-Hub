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
  CreateCustomerSchema,
  CreateDebtPaymentSchema,
  CustomerListQuerySchema,
  DebtPaymentListQuerySchema,
  ReverseFinancialRecordSchema,
  UpdateCustomerSchema,
} from '../commerce/commerce.types.ts';
import { runIdempotentRoute, type DomainRouterDeps } from '../commerce/route-deps.ts';

export function createCustomersRouter(deps: DomainRouterDeps): Router {
  const router = express.Router();

  router.get(
    '/debt-payments',
    deps.requireTenant,
    requirePermission('debts.collect'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const query = parseQuery(DebtPaymentListQuerySchema, req.query);
      const page = await deps.getService().listBusinessDebtPayments(req.tenantContext!, {
        limit: query.limit,
        offset: query.offset,
        status: query.status,
        from: query.from,
        to: query.to,
      });
      sendPaginated(res, 'debtPayments', page.items, {
        limit: query.limit,
        offset: query.offset,
        total: page.total,
      });
    }),
  );

  router.get(
    '/customers',
    deps.requireTenant,
    requirePermission('customers.manage'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const query = parseQuery(CustomerListQuerySchema, req.query);
      const page = await deps.getService().listCustomers(req.tenantContext!, {
        limit: query.limit,
        offset: query.offset,
        search: query.search,
        hasDebtOnly: query.hasDebtOnly,
      });
      sendPaginated(res, 'customers', page.items, {
        limit: query.limit,
        offset: query.offset,
        total: page.total,
      });
    }),
  );

  router.get(
    '/customers/:customerId',
    deps.requireTenant,
    requirePermission('customers.manage'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const customerId = parseUuidParam(req.params.customerId, 'customerId');
      const data = await deps.getService().getCustomerDetail(req.tenantContext!, customerId);
      res.status(200).json({ success: true, data });
    }),
  );

  router.post(
    '/customers',
    deps.requireTenant,
    requirePermission('customers.manage'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const input = parseBody(CreateCustomerSchema, req.body);
      await runIdempotentRoute(req, res, deps, '/customers', input, 201, async () => {
        const customer = await deps.getService().createCustomer(req.tenantContext!, input);
        return { customer };
      });
    }),
  );

  router.patch(
    '/customers/:customerId',
    deps.requireTenant,
    requirePermission('customers.manage'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    asyncHandler(async (req, res) => {
      const customerId = parseUuidParam(req.params.customerId, 'customerId');
      const input = parseBody(UpdateCustomerSchema, req.body);
      const customer = await deps
        .getService()
        .updateCustomer(req.tenantContext!, customerId, input);
      res.status(200).json({ success: true, data: { customer } });
    }),
  );

  router.post(
    '/customers/:customerId/debt-payments',
    deps.requireTenant,
    requirePermission('debts.collect'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const customerId = parseUuidParam(req.params.customerId, 'customerId');
      const input = parseBody(CreateDebtPaymentSchema, req.body);
      await runIdempotentRoute(
        req,
        res,
        deps,
        `/customers/${customerId}/debt-payments`,
        input,
        201,
        async () => {
          const debtPayment = await deps
            .getService()
            .collectDebtPayment(req.tenantContext!, customerId, input);
          return { debtPayment };
        },
      );
    }),
  );

  router.post(
    '/customers/:customerId/debt-payments/:paymentId/reverse',
    deps.requireTenant,
    requirePermission('sales.void_or_return'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const customerId = parseUuidParam(req.params.customerId, 'customerId');
      const paymentId = parseUuidParam(req.params.paymentId, 'paymentId');
      const input = parseBody(ReverseFinancialRecordSchema, req.body);
      await runIdempotentRoute(
        req,
        res,
        deps,
        `/customers/${customerId}/debt-payments/${paymentId}/reverse`,
        input,
        200,
        async () => {
          const debtPayment = await deps
            .getService()
            .reverseDebtPayment(req.tenantContext!, customerId, paymentId, input);
          return { debtPayment };
        },
      );
    }),
  );

  return router;
}
