import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { z } from 'zod';
import type { ServerEnv } from '../../config/env.ts';
import type { PlatformAdminRole } from '../../lib/rbac.ts';
import type { AuthTokenVerifier } from '../../lib/supabase-admin.ts';
import { ApiError } from '../../middleware/error-handler.ts';
import { extractBearerToken } from '../../middleware/tenant-context.ts';
import type { PlatformAdminRepository } from './platform-admin.repository.ts';
import {
  PlatformListQuerySchema,
  PlatformTenantActionSchema,
  type PlatformAdminIdentity,
} from './platform-admin.types.ts';

const UuidSchema = z.string().uuid();

export interface PlatformAdminRequest extends Request {
  platformAdmin?: PlatformAdminIdentity;
}

function asyncHandler(
  fn: (req: PlatformAdminRequest, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: PlatformAdminRequest, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch(next);
  };
}

/**
 * Completely isolated privileged Platform-Admin authentication & RBAC guard (C-03).
 * Never shares middleware with tenant routes and NEVER grants implicit tenant access.
 */
export function createRequirePlatformAdmin(
  authVerifier: AuthTokenVerifier | null,
  repo: PlatformAdminRepository | null,
  env: ServerEnv,
  allowedRoles: readonly PlatformAdminRole[] = ['super_admin', 'support_readonly'],
) {
  const allowed = new Set<PlatformAdminRole>(allowedRoles);
  const requireMfa = env.APP_ENV === 'staging' || env.APP_ENV === 'production';

  return (req: PlatformAdminRequest, _res: Response, next: NextFunction): void => {
    const token = extractBearerToken(req);
    if (!token) {
      next(new ApiError(401, 'UNAUTHENTICATED', 'Missing or invalid Bearer authentication token.'));
      return;
    }

    if (!authVerifier || !repo) {
      next(
        new ApiError(
          403,
          'PERMISSION_DENIED',
          'Platform Admin authorization is not configured; access denied by default.',
        ),
      );
      return;
    }

    void (async () => {
      const user = await authVerifier.verifyAccessToken(token);
      if (!user) {
        next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication token is invalid or expired.'));
        return;
      }

      if (user.emailConfirmedAt === null) {
        next(
          new ApiError(403, 'PERMISSION_DENIED', 'Verified email is required for Platform Admin.'),
        );
        return;
      }

      if (requireMfa && user.aal !== 'aal2') {
        next(
          new ApiError(
            403,
            'PERMISSION_DENIED',
            'Multi-factor authentication (aal2) is required for Platform Admin access.',
            { reason: 'MFA_REQUIRED' },
          ),
        );
        return;
      }

      const admin = await repo.getActivePlatformAdmin(user.id);
      if (!admin || !admin.isActive) {
        next(
          new ApiError(
            403,
            'PERMISSION_DENIED',
            'Privileged Platform Admin authorization is required.',
          ),
        );
        return;
      }

      if (!allowed.has(admin.role)) {
        next(
          new ApiError(
            403,
            'PERMISSION_DENIED',
            `Platform Admin role "${admin.role}" is not permitted for this operation.`,
          ),
        );
        return;
      }

      req.platformAdmin = admin;
      next();
    })().catch(next);
  };
}

export function createPlatformAdminRouter(
  authVerifier: AuthTokenVerifier | null,
  repo: PlatformAdminRepository | null,
  env: ServerEnv,
): Router {
  const router = express.Router();
  const requireAnyAdmin = createRequirePlatformAdmin(authVerifier, repo, env, [
    'super_admin',
    'support_readonly',
  ]);
  const requireSuperAdmin = createRequirePlatformAdmin(authVerifier, repo, env, ['super_admin']);

  // Metadata-only tenant list (audited)
  router.get(
    '/platform-admin/tenants',
    requireAnyAdmin,
    asyncHandler(async (req, res) => {
      const parsed = PlatformListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters.');
      }

      const admin = req.platformAdmin!;
      const tenants = await repo!.listTenantSummaries(parsed.data.limit, parsed.data.offset);
      await repo!.recordAuditLog({
        adminUserId: admin.userId,
        adminRole: admin.role,
        action: 'platform.tenants_listed',
        targetBusinessId: null,
        targetEntityType: 'business',
        targetEntityId: null,
        supportTicketRef: parsed.data.supportTicketRef ?? null,
        reason: parsed.data.reason ?? 'Routine platform operations tenant directory check',
        metadata: { count: tenants.length },
      });

      res.status(200).json({ success: true, data: { tenants } });
    }),
  );

  // Suspend a tenant business (super_admin only + mandatory reason)
  router.post(
    '/platform-admin/tenants/:businessId/suspend',
    requireSuperAdmin,
    asyncHandler(async (req, res) => {
      const businessId = Array.isArray(req.params.businessId)
        ? req.params.businessId[0]
        : req.params.businessId;
      if (!businessId || !UuidSchema.safeParse(businessId).success) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'businessId must be a valid UUID.');
      }

      const parsed = PlatformTenantActionSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join('; ');
        throw new ApiError(400, 'VALIDATION_ERROR', message);
      }

      const admin = req.platformAdmin!;
      const updated = await repo!.updateTenantStatus({
        businessId,
        newStatus: 'suspended',
        audit: {
          adminUserId: admin.userId,
          adminRole: admin.role,
          action: 'platform.tenant_suspended',
          targetBusinessId: businessId,
          targetEntityType: 'business',
          targetEntityId: businessId,
          supportTicketRef: parsed.data.supportTicketRef ?? null,
          reason: parsed.data.reason,
        },
      });

      if (!updated) {
        throw new ApiError(404, 'BUSINESS_NOT_FOUND', 'Target business was not found.');
      }

      res.status(200).json({ success: true, data: { tenant: updated } });
    }),
  );

  // Unsuspend a tenant business (super_admin only + mandatory reason)
  router.post(
    '/platform-admin/tenants/:businessId/unsuspend',
    requireSuperAdmin,
    asyncHandler(async (req, res) => {
      const businessId = Array.isArray(req.params.businessId)
        ? req.params.businessId[0]
        : req.params.businessId;
      if (!businessId || !UuidSchema.safeParse(businessId).success) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'businessId must be a valid UUID.');
      }

      const parsed = PlatformTenantActionSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => i.message).join('; ');
        throw new ApiError(400, 'VALIDATION_ERROR', message);
      }

      const admin = req.platformAdmin!;
      const updated = await repo!.updateTenantStatus({
        businessId,
        newStatus: 'active',
        audit: {
          adminUserId: admin.userId,
          adminRole: admin.role,
          action: 'platform.tenant_unsuspended',
          targetBusinessId: businessId,
          targetEntityType: 'business',
          targetEntityId: businessId,
          supportTicketRef: parsed.data.supportTicketRef ?? null,
          reason: parsed.data.reason,
        },
      });

      if (!updated) {
        throw new ApiError(404, 'BUSINESS_NOT_FOUND', 'Target business was not found.');
      }

      res.status(200).json({ success: true, data: { tenant: updated } });
    }),
  );

  // Immutable Platform Admin Audit Logs
  router.get(
    '/platform-admin/audit-logs',
    requireAnyAdmin,
    asyncHandler(async (req, res) => {
      const parsed = PlatformListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid query parameters.');
      }

      const logs = await repo!.listAuditLogs(parsed.data.limit, parsed.data.offset);
      res.status(200).json({ success: true, data: { logs } });
    }),
  );

  return router;
}
