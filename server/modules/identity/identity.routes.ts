import express, { type NextFunction, type Response, type Router } from 'express';
import { z } from 'zod';
import { requirePermission, requireWritableSubscription } from '../../lib/rbac.ts';
import type { AuthTokenVerifier } from '../../lib/supabase-admin.ts';
import { ApiError } from '../../middleware/error-handler.ts';
import {
  createRequireAuthenticatedTenantContext,
  createRequireAuthenticatedUser,
  requireVerifiedEmail,
  type TenantContextRequest,
} from '../../middleware/tenant-context.ts';
import type { IdentityRepository } from './identity.repository.ts';
import { IdentityService } from './identity.service.ts';
import {
  AcceptInvitationSchema,
  CreateBusinessSchema,
  InviteStaffSchema,
  PaginationQuerySchema,
  RegisterDeviceSchema,
  UpdateBusinessSettingsSchema,
  UpdateProfileSchema,
  UpdateStaffRoleSchema,
} from './identity.types.ts';

const UuidParamSchema = z.string().uuid();

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new ApiError(400, 'VALIDATION_ERROR', message);
  }
  return parsed.data;
}

function parseUuidParam(value: string | string[] | undefined, label: string): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !UuidParamSchema.safeParse(raw).success) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label} must be a valid UUID.`);
  }
  return raw;
}

function asyncHandler(
  fn: (req: TenantContextRequest, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: TenantContextRequest, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch(next);
  };
}

export function createIdentityRouter(
  authVerifier: AuthTokenVerifier | null,
  repo: IdentityRepository | null,
): Router {
  const router = express.Router();
  const requireUser = createRequireAuthenticatedUser(authVerifier, repo);
  const requireTenant = createRequireAuthenticatedTenantContext(authVerifier, repo);

  const getService = (): IdentityService => {
    if (!repo) {
      throw new ApiError(
        403,
        'PERMISSION_DENIED',
        'Identity repository is not configured; access denied by default.',
      );
    }
    return new IdentityService(repo, authVerifier);
  };

  // ---- User Identity & Onboarding (No X-Business-ID required) ----
  router.get(
    '/auth/me',
    requireUser,
    asyncHandler(async (req, res) => {
      const data = await getService().getMe(req.authUser!);
      res.status(200).json({ success: true, data });
    }),
  );

  router.put(
    '/auth/me',
    requireUser,
    asyncHandler(async (req, res) => {
      const input = parseBody(UpdateProfileSchema, req.body);
      const profile = await getService().updateMe(req.authUser!, input);
      res.status(200).json({ success: true, data: { profile } });
    }),
  );

  router.post(
    '/auth/logout',
    requireUser,
    asyncHandler(async (req, res) => {
      const data = await getService().logout(req.authUser!);
      res.status(200).json({ success: true, data });
    }),
  );

  router.post(
    '/businesses',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const input = parseBody(CreateBusinessSchema, req.body);
      const created = await getService().createBusiness(req.authUser!, input);
      res.status(201).json({ success: true, data: created });
    }),
  );

  router.post(
    '/staff/invitations/accept',
    requireUser,
    requireVerifiedEmail,
    asyncHandler(async (req, res) => {
      const input = parseBody(AcceptInvitationSchema, req.body);
      const membership = await getService().acceptInvitation(req.authUser!, input.token);
      res.status(200).json({ success: true, data: { membership } });
    }),
  );

  // ---- Tenant-Scoped Business, Staff, Device & Audit Routes ----
  router.get(
    '/businesses/current',
    requireTenant,
    asyncHandler(async (req, res) => {
      const data = await getService().getCurrentBusiness(req.tenantContext!);
      res.status(200).json({ success: true, data });
    }),
  );

  router.patch(
    '/businesses/current/settings',
    requireTenant,
    requirePermission('settings.manage'),
    requireWritableSubscription,
    asyncHandler(async (req, res) => {
      const input = parseBody(UpdateBusinessSettingsSchema, req.body);
      const business = await getService().updateBusinessSettings(req.tenantContext!, input);
      res.status(200).json({ success: true, data: { business } });
    }),
  );

  router.get(
    '/staff',
    requireTenant,
    requirePermission('staff.view'),
    asyncHandler(async (req, res) => {
      const data = await getService().listStaff(req.tenantContext!);
      res.status(200).json({ success: true, data });
    }),
  );

  router.post(
    '/staff/invitations',
    requireTenant,
    requirePermission('staff.manage'),
    requireWritableSubscription,
    asyncHandler(async (req, res) => {
      const input = parseBody(InviteStaffSchema, req.body);
      const result = await getService().inviteStaff(req.tenantContext!, input);
      res.status(201).json({ success: true, data: result });
    }),
  );

  router.patch(
    '/staff/:userId/role',
    requireTenant,
    requirePermission('staff.manage'),
    requireWritableSubscription,
    asyncHandler(async (req, res) => {
      const targetUserId = parseUuidParam(req.params.userId, 'userId');
      const input = parseBody(UpdateStaffRoleSchema, req.body);
      const membership = await getService().updateStaffRole(
        req.tenantContext!,
        targetUserId,
        input,
      );
      res.status(200).json({ success: true, data: { membership } });
    }),
  );

  router.post(
    '/staff/invitations/:invitationId/revoke',
    requireTenant,
    requirePermission('staff.manage'),
    requireWritableSubscription,
    asyncHandler(async (req, res) => {
      const invitationId = parseUuidParam(req.params.invitationId, 'invitationId');
      const invitation = await getService().revokeInvitation(req.tenantContext!, invitationId);
      res.status(200).json({ success: true, data: { invitation } });
    }),
  );

  router.post(
    '/staff/:userId/suspend',
    requireTenant,
    requirePermission('staff.manage'),
    requireWritableSubscription,
    asyncHandler(async (req, res) => {
      const targetUserId = parseUuidParam(req.params.userId, 'userId');
      const result = await getService().suspendStaffMember(req.tenantContext!, targetUserId);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.post(
    '/staff/:userId/reactivate',
    requireTenant,
    requirePermission('staff.manage'),
    requireWritableSubscription,
    asyncHandler(async (req, res) => {
      const targetUserId = parseUuidParam(req.params.userId, 'userId');
      const membership = await getService().reactivateStaffMember(req.tenantContext!, targetUserId);
      res.status(200).json({ success: true, data: { membership } });
    }),
  );

  router.post(
    '/staff/:userId/revoke',
    requireTenant,
    requirePermission('staff.manage'),
    requireWritableSubscription,
    asyncHandler(async (req, res) => {
      const targetUserId = parseUuidParam(req.params.userId, 'userId');
      const result = await getService().revokeStaffMember(req.tenantContext!, targetUserId);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.get(
    '/devices',
    requireTenant,
    requirePermission('devices.view'),
    asyncHandler(async (req, res) => {
      const devices = await getService().listDevices(req.tenantContext!);
      res.status(200).json({ success: true, data: { devices } });
    }),
  );

  router.post(
    '/devices/register',
    requireTenant,
    requirePermission('devices.register'),
    requireWritableSubscription,
    asyncHandler(async (req, res) => {
      const input = parseBody(RegisterDeviceSchema, req.body);
      const device = await getService().registerDevice(req.tenantContext!, input);
      res.status(201).json({ success: true, data: { device } });
    }),
  );

  router.post(
    '/devices/:deviceId/heartbeat',
    requireTenant,
    asyncHandler(async (req, res) => {
      const deviceId = parseUuidParam(req.params.deviceId, 'deviceId');
      const result = await getService().heartbeatDevice(req.tenantContext!, deviceId);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.post(
    '/devices/:deviceId/revoke',
    requireTenant,
    requirePermission('devices.revoke'),
    requireWritableSubscription,
    asyncHandler(async (req, res) => {
      const deviceId = parseUuidParam(req.params.deviceId, 'deviceId');
      const device = await getService().revokeDevice(req.tenantContext!, deviceId);
      res.status(200).json({ success: true, data: { device } });
    }),
  );

  router.get(
    '/audit-logs',
    requireTenant,
    requirePermission('audit_logs.view'),
    asyncHandler(async (req, res) => {
      const query = parseBody(PaginationQuerySchema, req.query);
      const logs = await getService().listAuditLogs(req.tenantContext!, query.limit, query.offset);
      res
        .status(200)
        .json({ success: true, data: { logs, limit: query.limit, offset: query.offset } });
    }),
  );

  return router;
}
