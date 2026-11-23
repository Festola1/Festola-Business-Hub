import express, { type Router } from 'express';
import { asyncHandler, parseQuery } from '../../lib/http.ts';
import { requirePermission } from '../../lib/rbac.ts';
import { ReportDateRangeQuerySchema, ReportExportQuerySchema } from '../commerce/commerce.types.ts';
import type { DomainRouterDeps } from '../commerce/route-deps.ts';

/**
 * Basic Reports & Safe CSV Export router.
 * Explicitly accessible even in `read_only` subscription mode (D-01: zero data hostage).
 */
export function createReportsRouter(deps: DomainRouterDeps): Router {
  const router = express.Router();

  router.get(
    '/reports/summary',
    deps.requireTenant,
    requirePermission('reports.view_basic'),
    deps.rateLimiters.reports,
    asyncHandler(async (req, res) => {
      const query = parseQuery(ReportDateRangeQuerySchema, req.query);
      const summary = await deps.getService().getSummaryReport(req.tenantContext!, query);
      res.status(200).json({ success: true, data: { summary } });
    }),
  );

  router.get(
    '/reports/sales-by-day',
    deps.requireTenant,
    requirePermission('reports.view_basic'),
    deps.rateLimiters.reports,
    asyncHandler(async (req, res) => {
      const query = parseQuery(ReportDateRangeQuerySchema, req.query);
      const series = await deps.getService().getSalesByDayReport(req.tenantContext!, query);
      res.status(200).json({ success: true, data: { series } });
    }),
  );

  router.get(
    '/reports/top-products',
    deps.requireTenant,
    requirePermission('reports.view_basic'),
    deps.rateLimiters.reports,
    asyncHandler(async (req, res) => {
      const query = parseQuery(ReportDateRangeQuerySchema, req.query);
      const products = await deps.getService().getTopProductsReport(req.tenantContext!, query);
      res.status(200).json({ success: true, data: { products } });
    }),
  );

  router.get(
    '/reports/inventory-valuation',
    deps.requireTenant,
    requirePermission('reports.view_basic'),
    requirePermission('products.view_cost'),
    deps.rateLimiters.reports,
    asyncHandler(async (req, res) => {
      const valuation = await deps.getService().getInventoryValuationReport(req.tenantContext!);
      res.status(200).json({ success: true, data: { valuation } });
    }),
  );

  router.get(
    '/reports/debtors-aging',
    deps.requireTenant,
    requirePermission('reports.view_basic'),
    deps.rateLimiters.reports,
    asyncHandler(async (req, res) => {
      const aging = await deps.getService().getDebtorsAgingReport(req.tenantContext!);
      res.status(200).json({ success: true, data: { aging } });
    }),
  );

  router.get(
    '/reports/export',
    deps.requireTenant,
    requirePermission('reports.view_basic'),
    deps.rateLimiters.reports,
    asyncHandler(async (req, res) => {
      const query = parseQuery(ReportExportQuerySchema, req.query);
      const exported = await deps.getService().exportCsvReport(req.tenantContext!, query);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      res.status(200).send(exported.csv);
    }),
  );

  return router;
}
