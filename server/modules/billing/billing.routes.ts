import express, { type Request, type Router } from 'express';
import {
  asyncHandler,
  BasePaginationQuerySchema,
  parseBody,
  parseQuery,
  sendPaginated,
} from '../../lib/http.ts';
import { requirePermission } from '../../lib/rbac.ts';
import { requireIdempotencyKey, type IdempotencyAwareRequest } from '../../lib/tx.ts';
import {
  SubscriptionCheckoutSchema,
  SubscriptionVerifySchema,
} from '../commerce/commerce.types.ts';
import { runIdempotentRoute, type DomainRouterDeps } from '../commerce/route-deps.ts';

export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

export function createBillingRouter(deps: DomainRouterDeps): Router {
  const router = express.Router();

  router.get(
    '/plans',
    deps.requireUser,
    deps.rateLimiters.standardRead,
    asyncHandler(async (_req, res) => {
      const plans = await deps.getService().listPlans();
      res.status(200).json({ success: true, data: { plans } });
    }),
  );

  router.get(
    '/subscriptions/current',
    deps.requireTenant,
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const usage = await deps.getService().getCurrentSubscription(req.tenantContext!);
      res.status(200).json({ success: true, data: usage });
    }),
  );

  router.get(
    '/subscriptions/invoices',
    deps.requireTenant,
    requirePermission('billing.manage'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const query = parseQuery(BasePaginationQuerySchema, req.query);
      const page = await deps.getService().listSubscriptionInvoices(req.tenantContext!, {
        limit: query.limit,
        offset: query.offset,
      });
      sendPaginated(res, 'invoices', page.items, {
        limit: query.limit,
        offset: query.offset,
        total: page.total,
      });
    }),
  );

  // Explicitly allowed in `read_only` mode so expired tenants can renew (D-01, D-07)
  router.post(
    '/subscriptions/checkout',
    deps.requireTenant,
    requirePermission('billing.manage'),
    deps.rateLimiters.financialWrite,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const input = parseBody(SubscriptionCheckoutSchema, req.body);
      await runIdempotentRoute(req, res, deps, '/subscriptions/checkout', input, 201, () =>
        deps
          .getService()
          .initiateSubscriptionCheckout(req.tenantContext!, req.authUser!.email, input),
      );
    }),
  );

  router.post(
    '/subscriptions/verify',
    deps.requireTenant,
    requirePermission('billing.manage'),
    deps.rateLimiters.financialWrite,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const input = parseBody(SubscriptionVerifySchema, req.body);
      await runIdempotentRoute(req, res, deps, '/subscriptions/verify', input, 200, () =>
        deps.getService().verifySubscriptionPayment(req.tenantContext!, input),
      );
    }),
  );

  // Paystack webhook authenticated strictly via HMAC-SHA512 signature over raw request bytes
  router.post(
    '/webhooks/paystack',
    deps.rateLimiters.webhook,
    asyncHandler(async (req, res) => {
      const rawReq = req as RawBodyRequest;
      const rawBody = rawReq.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
      const sigHeader = req.headers['x-paystack-signature'];
      const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      const parsedBody =
        typeof req.body === 'object' && req.body !== null
          ? (req.body as Record<string, unknown>)
          : {};

      const result = await deps.getService().handlePaystackWebhook({
        rawBody,
        signatureHeader: signature,
        parsedBody,
      });
      res.status(200).json({ success: true, data: result });
    }),
  );

  return router;
}
