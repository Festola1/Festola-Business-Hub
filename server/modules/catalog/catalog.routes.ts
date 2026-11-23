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
import {
  CreateCategorySchema,
  CreateProductSchema,
  ProductListQuerySchema,
  UpdateCategorySchema,
  UpdateProductSchema,
} from '../commerce/commerce.types.ts';
import { runIdempotentRoute, type DomainRouterDeps } from '../commerce/route-deps.ts';

const CategoryListQuerySchema = BasePaginationQuerySchema.extend({
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export function createCatalogRouter(deps: DomainRouterDeps): Router {
  const router = express.Router();

  router.get(
    '/product-categories',
    deps.requireTenant,
    requirePermission('products.view_selling'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const query = parseQuery(CategoryListQuerySchema, req.query);
      const page = await deps.getService().listCategories(req.tenantContext!, {
        limit: query.limit,
        offset: query.offset,
        search: query.search,
        isActive: query.isActive,
      });
      sendPaginated(res, 'categories', page.items, {
        limit: query.limit,
        offset: query.offset,
        total: page.total,
      });
    }),
  );

  router.post(
    '/product-categories',
    deps.requireTenant,
    requirePermission('products.manage'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const input = parseBody(CreateCategorySchema, req.body);
      await runIdempotentRoute(req, res, deps, '/product-categories', input, 201, async () => {
        const category = await deps.getService().createCategory(req.tenantContext!, input);
        return { category };
      });
    }),
  );

  router.patch(
    '/product-categories/:categoryId',
    deps.requireTenant,
    requirePermission('products.manage'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    asyncHandler(async (req, res) => {
      const categoryId = parseUuidParam(req.params.categoryId, 'categoryId');
      const input = parseBody(UpdateCategorySchema, req.body);
      const category = await deps
        .getService()
        .updateCategory(req.tenantContext!, categoryId, input);
      res.status(200).json({ success: true, data: { category } });
    }),
  );

  router.get(
    '/products',
    deps.requireTenant,
    requirePermission('products.view_selling'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const query = parseQuery(ProductListQuerySchema, req.query);
      const page = await deps.getService().listProducts(req.tenantContext!, query);
      sendPaginated(res, 'products', page.items, {
        limit: query.limit,
        offset: query.offset,
        total: page.total,
      });
    }),
  );

  router.get(
    '/products/:productId',
    deps.requireTenant,
    requirePermission('products.view_selling'),
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const productId = parseUuidParam(req.params.productId, 'productId');
      const product = await deps.getService().getProduct(req.tenantContext!, productId);
      res.status(200).json({ success: true, data: { product } });
    }),
  );

  router.post(
    '/products',
    deps.requireTenant,
    requirePermission('products.manage'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    requireIdempotencyKey,
    asyncHandler(async (req: IdempotencyAwareRequest, res) => {
      const input = parseBody(CreateProductSchema, req.body);
      await runIdempotentRoute(req, res, deps, '/products', input, 201, async () => {
        const product = await deps.getService().createProduct(req.tenantContext!, input);
        return { product };
      });
    }),
  );

  router.patch(
    '/products/:productId',
    deps.requireTenant,
    requirePermission('products.manage'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    asyncHandler(async (req, res) => {
      const productId = parseUuidParam(req.params.productId, 'productId');
      const input = parseBody(UpdateProductSchema, req.body);
      const product = await deps.getService().updateProduct(req.tenantContext!, productId, input);
      res.status(200).json({ success: true, data: { product } });
    }),
  );

  return router;
}
