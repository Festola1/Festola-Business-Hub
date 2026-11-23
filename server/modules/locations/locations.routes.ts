import express, { type Router } from 'express';
import { asyncHandler, parseBody, parseUuidParam } from '../../lib/http.ts';
import { requirePermission, requireWritableSubscription } from '../../lib/rbac.ts';
import { ApiError } from '../../middleware/error-handler.ts';
import { UpdateLocationSchema } from '../commerce/commerce.types.ts';
import type { DomainRouterDeps } from '../commerce/route-deps.ts';

export function createLocationsRouter(deps: DomainRouterDeps): Router {
  const router = express.Router();

  router.get(
    '/locations',
    deps.requireTenant,
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const locations = await deps.getService().listLocations(req.tenantContext!);
      res.status(200).json({ success: true, data: { locations } });
    }),
  );

  // D-02: Single active location in MVP (multi-branch creation deferred to Release 2)
  router.post(
    '/locations',
    deps.requireTenant,
    requirePermission('settings.manage'),
    (_req, _res, next) => {
      next(
        new ApiError(
          403,
          'PERMISSION_DENIED',
          'Multi-location creation is disabled in MVP (single active location policy D-02).',
        ),
      );
    },
  );

  router.patch(
    '/locations/:locationId',
    deps.requireTenant,
    requirePermission('settings.manage'),
    requireWritableSubscription,
    deps.rateLimiters.financialWrite,
    asyncHandler(async (req, res) => {
      const locationId = parseUuidParam(req.params.locationId, 'locationId');
      const input = parseBody(UpdateLocationSchema, req.body);
      const location = await deps
        .getService()
        .updateLocation(req.tenantContext!, locationId, input);
      res.status(200).json({ success: true, data: { location } });
    }),
  );

  return router;
}
