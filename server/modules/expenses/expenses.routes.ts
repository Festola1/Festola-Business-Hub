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
  CreateExpenseCategorySchema,
  CreateExpenseSchema,
  ExpenseListQuerySchema,
  ReverseFinancialRecordSchema,
} from '../commerce/commerce.types.ts';
import { runIdempotentRoute, type DomainRouterDeps } from '../commerce/route-deps.ts';

export function createExpensesRouter(deps: DomainRouterDeps): Router {
  const router = express.Router();

  router.get(
    '/expense-categories',
    deps.requireTenant,
    requirePermission('expenses.manage'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const categories = await deps.getService().listExpenseCategories(req.tenantContext!);
      res.status(200).json({ success: true, data: { categories } });
    }),
  );

  router.post(
    '/expense-categories',
    deps.requireTenant,
    requirePermission('expenses.manage'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const input = parseBody(CreateExpenseCategorySchema, req.body);
      await runIdempotentRoute(req, res, deps, '/expense-categories', input, 201, async () => {
        const category = await deps.getService().createExpenseCategory(req.tenantContext!, input);
        return { category };
      });
    }),
  );

  router.get(
    '/expenses',
    deps.requireTenant,
    requirePermission('expenses.manage'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const query = parseQuery(ExpenseListQuerySchema, req.query);
      const page = await deps.getService().listExpenses(req.tenantContext!, {
        limit: query.limit,
        offset: query.offset,
        categoryId: query.categoryId,
        status: query.status,
        paymentMethod: query.paymentMethod,
        from: query.from,
        to: query.to,
      });
      sendPaginated(res, 'expenses', page.items, {
        limit: query.limit,
        offset: query.offset,
        total: page.total,
      });
    }),
  );

  router.post(
    '/expenses',
    deps.requireTenant,
    requirePermission('expenses.manage'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const input = parseBody(CreateExpenseSchema, req.body);
      await runIdempotentRoute(req, res, deps, '/expenses', input, 201, async () => {
        const expense = await deps.getService().createExpense(req.tenantContext!, input);
        return { expense };
      });
    }),
  );

  router.post(
    '/expenses/:expenseId/reverse',
    deps.requireTenant,
    requirePermission('expenses.manage'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const expenseId = parseUuidParam(req.params.expenseId, 'expenseId');
      const input = parseBody(ReverseFinancialRecordSchema, req.body);
      await runIdempotentRoute(
        req,
        res,
        deps,
        `/expenses/${expenseId}/reverse`,
        input,
        200,
        async () => {
          const expense = await deps
            .getService()
            .reverseExpense(req.tenantContext!, expenseId, input);
          return { expense };
        },
      );
    }),
  );

  return router;
}
