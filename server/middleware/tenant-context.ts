import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import type { AuthTokenVerifier, VerifiedAuthUser } from '../lib/supabase-admin.ts';
import type { IdentityRepository } from '../modules/identity/identity.repository.ts';
import type { ActiveTenantMembership } from '../modules/identity/identity.types.ts';
import { ApiError } from './error-handler.ts';

const UuidSchema = z.string().uuid();

const FORBIDDEN_PRIVILEGE_BODY_FIELDS = [
  'actorRole',
  'actor_role',
  'membershipStatus',
  'membership_status',
  'subscriptionStatus',
  'subscription_status',
  'isPlatformAdmin',
  'is_platform_admin',
  'platformAdminRole',
  'platform_admin_role',
] as const;

export interface TenantContextRequest extends Request {
  authUser?: VerifiedAuthUser;
  tenantContext?: ActiveTenantMembership & {
    idempotencyKey: string | null;
  };
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function inspectUntrustedTenantOrPrivilegeFields(req: Request, verifiedBusinessId: string): void {
  const query = req.query as Record<string, unknown> | undefined;
  for (const key of ['businessId', 'business_id']) {
    const raw = query?.[key];
    if (typeof raw === 'string' && raw.trim().length > 0 && raw.trim() !== verifiedBusinessId) {
      throw new ApiError(
        403,
        'PERMISSION_DENIED',
        'Client-supplied business_id query parameter conflicts with verified tenant context.',
      );
    }
  }

  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    const body = req.body as Record<string, unknown>;

    for (const key of ['businessId', 'business_id']) {
      if (key in body && body[key] !== undefined) {
        if (typeof body[key] !== 'string' || body[key] !== verifiedBusinessId) {
          throw new ApiError(
            403,
            'PERMISSION_DENIED',
            'Client-supplied business_id in request body is not trusted and conflicts with verified tenant context.',
          );
        }
      }
    }

    for (const field of FORBIDDEN_PRIVILEGE_BODY_FIELDS) {
      if (field in body && body[field] !== undefined) {
        throw new ApiError(
          403,
          'PERMISSION_DENIED',
          `Untrusted privilege field "${field}" is not permitted in client payloads.`,
        );
      }
    }
  }
}

/**
 * Verifies the Bearer JWT server-side (no business context required).
 * Used for /auth/me, /auth/logout, business onboarding, and invitation acceptance.
 */
export function createRequireAuthenticatedUser(
  authVerifier: AuthTokenVerifier | null,
  repo: IdentityRepository | null,
) {
  return (req: TenantContextRequest, _res: Response, next: NextFunction): void => {
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
          'Server authentication or database membership verification is not configured; access denied by default.',
        ),
      );
      return;
    }

    void authVerifier
      .verifyAccessToken(token)
      .then((user) => {
        if (!user) {
          next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication token is invalid or expired.'));
          return;
        }
        req.authUser = user;
        next();
      })
      .catch(next);
  };
}

/**
 * Requires verified email before sensitive identity onboarding operations
 * (business creation and staff invitation acceptance).
 */
export function requireVerifiedEmail(
  req: TenantContextRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.authUser) {
    next(new ApiError(401, 'UNAUTHENTICATED', 'Authenticated user session is required.'));
    return;
  }

  if (req.authUser.emailConfirmedAt === null) {
    next(
      new ApiError(
        403,
        'PERMISSION_DENIED',
        'Please verify your email address before creating a business or accepting an invitation.',
        { reason: 'EMAIL_NOT_VERIFIED' },
      ),
    );
    return;
  }

  next();
}

/**
 * Fail-closed authentication & multi-tenant membership guard.
 *
 * CRITICAL SECURITY RULE (System Architecture §2.4 & §7.1):
 * X-Business-ID is strictly requested context and NEVER proof of permission.
 * Client-provided business_id or role fields are NEVER trusted.
 * The backend verifies the Supabase JWT and confirms an active business_memberships
 * record for (verifiedUser.id, requestedBusinessId) on every tenant request.
 */
export function createRequireAuthenticatedTenantContext(
  authVerifier: AuthTokenVerifier | null,
  repo: IdentityRepository | null,
) {
  return (req: TenantContextRequest, _res: Response, next: NextFunction): void => {
    const token = extractBearerToken(req);
    if (!token) {
      next(new ApiError(401, 'UNAUTHENTICATED', 'Missing or invalid Bearer authentication token.'));
      return;
    }

    const rawBusinessId = req.header('X-Business-ID') ?? null;
    if (rawBusinessId !== null && !UuidSchema.safeParse(rawBusinessId).success) {
      next(new ApiError(400, 'VALIDATION_ERROR', 'X-Business-ID header must be a valid UUID.'));
      return;
    }

    const rawIdempotencyKey = req.header('Idempotency-Key') ?? null;
    if (rawIdempotencyKey !== null && !UuidSchema.safeParse(rawIdempotencyKey).success) {
      next(new ApiError(400, 'VALIDATION_ERROR', 'Idempotency-Key header must be a valid UUID.'));
      return;
    }

    if (!authVerifier || !repo) {
      next(
        new ApiError(
          403,
          'PERMISSION_DENIED',
          'Tenant membership verification is not configured; access denied by default.',
        ),
      );
      return;
    }

    if (!rawBusinessId) {
      next(
        new ApiError(
          400,
          'VALIDATION_ERROR',
          'X-Business-ID header is required for tenant-scoped requests.',
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
          new ApiError(
            403,
            'PERMISSION_DENIED',
            'Email verification is required before accessing tenant resources.',
            { reason: 'EMAIL_NOT_VERIFIED' },
          ),
        );
        return;
      }

      // Reject spoofed business_id or privilege escalation fields before executing business logic
      inspectUntrustedTenantOrPrivilegeFields(req, rawBusinessId);

      const membership = await repo.getActiveTenantMembership(user.id, rawBusinessId);
      if (!membership || membership.membershipStatus !== 'active') {
        next(
          new ApiError(
            403,
            'PERMISSION_DENIED',
            'You do not have active membership access to the requested business.',
          ),
        );
        return;
      }

      req.authUser = user;
      req.tenantContext = {
        ...membership,
        idempotencyKey: rawIdempotencyKey,
      };
      next();
    })().catch(next);
  };
}

/**
 * Default unconfigured fail-closed guard preserved for standalone boundary checks.
 */
export const requireAuthenticatedTenantContext = createRequireAuthenticatedTenantContext(
  null,
  null,
);
