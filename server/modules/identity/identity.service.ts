import { createHash, randomBytes } from 'node:crypto';
import type { AuthTokenVerifier, VerifiedAuthUser } from '../../lib/supabase-admin.ts';
import { ApiError } from '../../middleware/error-handler.ts';
import type { IdentityRepository } from './identity.repository.ts';
import type {
  ActiveTenantMembership,
  CreateBusinessSchema,
  InviteStaffSchema,
  RegisterDeviceSchema,
  UpdateBusinessSettingsSchema,
  UpdateProfileSchema,
  UpdateStaffRoleSchema,
} from './identity.types.ts';
import type { z } from 'zod';

const INVITATION_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours
const OFFLINE_DEVICE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // D-09: 7-day offline window
const OFFLINE_WARNING_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // Day 5+ warning (<= 2 days left)

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildBusinessSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = randomBytes(3).toString('hex');
  return `${base || 'business'}-${suffix}`;
}

function generateDeviceCode(): string {
  return randomBytes(2).toString('hex').toUpperCase();
}

export class IdentityService {
  private readonly repo: IdentityRepository;
  private readonly authVerifier: AuthTokenVerifier | null;

  constructor(repo: IdentityRepository, authVerifier: AuthTokenVerifier | null = null) {
    this.repo = repo;
    this.authVerifier = authVerifier;
  }

  async getMe(user: VerifiedAuthUser) {
    const profile = await this.repo.ensureUserProfile({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    });
    const memberships = await this.repo.listUserActiveMemberships(user.id);
    return { profile, memberships };
  }

  async updateMe(user: VerifiedAuthUser, input: z.infer<typeof UpdateProfileSchema>) {
    await this.repo.ensureUserProfile({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    });
    return this.repo.updateUserProfile(user.id, input);
  }

  async createBusiness(user: VerifiedAuthUser, input: z.infer<typeof CreateBusinessSchema>) {
    await this.repo.ensureUserProfile({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    });

    return this.repo.createBusinessWithDefaults({
      userId: user.id,
      name: input.name,
      slug: buildBusinessSlug(input.name),
      currencyCode: input.currencyCode,
      timezone: input.timezone,
      phone: input.phone ?? null,
      address: input.address ?? null,
      locationName: input.locationName,
    });
  }

  async getCurrentBusiness(tenant: ActiveTenantMembership) {
    const data = await this.repo.getBusinessWithDefaults(tenant.businessId, tenant.userId);
    if (!data) {
      throw new ApiError(404, 'BUSINESS_NOT_FOUND', 'Requested business was not found.');
    }
    return data;
  }

  async updateBusinessSettings(
    tenant: ActiveTenantMembership,
    input: z.infer<typeof UpdateBusinessSettingsSchema>,
  ) {
    return this.repo.updateBusinessSettings(tenant.businessId, tenant.userId, tenant.role, input);
  }

  async listStaff(tenant: ActiveTenantMembership) {
    const [members, pendingInvitations] = await Promise.all([
      this.repo.listStaffMembers(tenant.businessId, tenant.userId),
      this.repo.listPendingInvitations(tenant.businessId, tenant.userId),
    ]);
    return {
      members,
      pendingInvitations: pendingInvitations.map(({ tokenHash: _hidden, ...safe }) => safe),
    };
  }

  async inviteStaff(tenant: ActiveTenantMembership, input: z.infer<typeof InviteStaffSchema>) {
    const activeStaffCount = await this.repo.countActiveStaff(tenant.businessId, tenant.userId);
    const pendingInvitations = await this.repo.listPendingInvitations(
      tenant.businessId,
      tenant.userId,
    );

    // D-01: enforce backend staff capacity limit (active staff + pending invites)
    if (activeStaffCount + pendingInvitations.length >= tenant.limits.maxStaff) {
      throw new ApiError(
        403,
        'SUBSCRIPTION_LIMIT_REACHED',
        `Staff limit (${tenant.limits.maxStaff}) reached for your current plan.`,
        { maxStaff: tenant.limits.maxStaff },
      );
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();

    const invitation = await this.repo.createStaffInvitation({
      businessId: tenant.businessId,
      actorUserId: tenant.userId,
      actorRole: tenant.role,
      email: input.email,
      role: input.role,
      tokenHash,
      expiresAt,
    });

    const { tokenHash: _hidden, ...safeInvitation } = invitation;
    return {
      invitation: safeInvitation,
      // Returned once to caller/email dispatcher; only SHA-256 hash is persisted.
      inviteToken: rawToken,
    };
  }

  async acceptInvitation(user: VerifiedAuthUser, rawToken: string) {
    const tokenHash = sha256Hex(rawToken);
    const lookup = await this.repo.lookupInvitationByTokenHash(tokenHash);

    if (!lookup || lookup.status !== 'pending') {
      throw new ApiError(404, 'NOT_FOUND', 'Invitation is invalid or has already been used.');
    }

    if (new Date(lookup.expiresAt).getTime() <= Date.now()) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invitation has expired.');
    }

    if (lookup.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ApiError(
        403,
        'PERMISSION_DENIED',
        'This invitation was issued to a different email address.',
      );
    }

    await this.repo.ensureUserProfile({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    });

    return this.repo.acceptStaffInvitation({
      invitationId: lookup.id,
      businessId: lookup.businessId,
      userId: user.id,
      role: lookup.role,
    });
  }

  async updateStaffRole(
    tenant: ActiveTenantMembership,
    targetUserId: string,
    input: z.infer<typeof UpdateStaffRoleSchema>,
  ) {
    if (targetUserId === tenant.userId) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Owner cannot modify their own role.');
    }

    const updated = await this.repo.updateStaffRole({
      businessId: tenant.businessId,
      actorUserId: tenant.userId,
      actorRole: tenant.role,
      targetUserId,
      newRole: input.role,
    });

    if (!updated) {
      throw new ApiError(404, 'NOT_FOUND', 'Active non-owner staff member was not found.');
    }
    return updated;
  }

  async logout(user: VerifiedAuthUser) {
    if (this.authVerifier?.signOutUser) {
      await this.authVerifier.signOutUser(user.id);
    }
    return { signedOut: true };
  }

  async revokeInvitation(tenant: ActiveTenantMembership, invitationId: string) {
    const revoked = await this.repo.revokeInvitation({
      businessId: tenant.businessId,
      actorUserId: tenant.userId,
      actorRole: tenant.role,
      invitationId,
    });
    if (!revoked) {
      throw new ApiError(404, 'NOT_FOUND', 'Pending staff invitation was not found.');
    }
    const { tokenHash: _hidden, ...safe } = revoked;
    return safe;
  }

  async suspendStaffMember(tenant: ActiveTenantMembership, targetUserId: string) {
    if (targetUserId === tenant.userId) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Owner cannot suspend their own access.');
    }

    const suspended = await this.repo.suspendStaffMember({
      businessId: tenant.businessId,
      actorUserId: tenant.userId,
      actorRole: tenant.role,
      targetUserId,
    });

    if (!suspended) {
      throw new ApiError(404, 'NOT_FOUND', 'Active non-owner staff member was not found.');
    }

    if (this.authVerifier?.signOutUser) {
      await this.authVerifier.signOutUser(targetUserId);
    }

    return suspended;
  }

  async reactivateStaffMember(tenant: ActiveTenantMembership, targetUserId: string) {
    const reactivated = await this.repo.reactivateStaffMember({
      businessId: tenant.businessId,
      actorUserId: tenant.userId,
      actorRole: tenant.role,
      targetUserId,
    });

    if (!reactivated) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'Suspended non-owner staff member was not found (revoked staff must be re-invited).',
      );
    }

    return reactivated;
  }

  async revokeStaffMember(tenant: ActiveTenantMembership, targetUserId: string) {
    if (targetUserId === tenant.userId) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Owner cannot revoke their own access.');
    }

    const revoked = await this.repo.revokeStaffMember({
      businessId: tenant.businessId,
      actorUserId: tenant.userId,
      actorRole: tenant.role,
      targetUserId,
    });

    if (!revoked) {
      throw new ApiError(404, 'NOT_FOUND', 'Active non-owner staff member was not found.');
    }

    if (this.authVerifier?.signOutUser) {
      await this.authVerifier.signOutUser(targetUserId);
    }

    return revoked;
  }

  async listDevices(tenant: ActiveTenantMembership) {
    const devices = await this.repo.listRegisteredDevices(tenant.businessId, tenant.userId);
    return devices.map(({ deviceFingerprintHash: _hidden, ...safe }) => safe);
  }

  async registerDevice(
    tenant: ActiveTenantMembership,
    input: z.infer<typeof RegisterDeviceSchema>,
  ) {
    const activeDevicesCount = await this.repo.countActiveDevices(tenant.businessId, tenant.userId);
    // D-01: enforce backend registered offline device capacity limit
    if (activeDevicesCount >= tenant.limits.maxOfflineDevices) {
      throw new ApiError(
        403,
        'SUBSCRIPTION_LIMIT_REACHED',
        `Registered offline device limit (${tenant.limits.maxOfflineDevices}) reached for your current plan.`,
        { maxOfflineDevices: tenant.limits.maxOfflineDevices },
      );
    }

    const device = await this.repo.registerDevice({
      businessId: tenant.businessId,
      userId: tenant.userId,
      actorRole: tenant.role,
      deviceCode: generateDeviceCode(),
      deviceFingerprintHash: sha256Hex(input.deviceFingerprint),
      deviceName: input.deviceName,
      offlineExpiresAt: new Date(Date.now() + OFFLINE_DEVICE_WINDOW_MS).toISOString(),
    });

    const { deviceFingerprintHash: _hidden, ...safeDevice } = device;
    return safeDevice;
  }

  async revokeDevice(tenant: ActiveTenantMembership, deviceId: string) {
    const revoked = await this.repo.revokeDevice({
      businessId: tenant.businessId,
      actorUserId: tenant.userId,
      actorRole: tenant.role,
      deviceId,
    });
    if (!revoked) {
      throw new ApiError(404, 'NOT_FOUND', 'Active registered device was not found.');
    }
    const { deviceFingerprintHash: _hidden, ...safeDevice } = revoked;
    return safeDevice;
  }

  async heartbeatDevice(tenant: ActiveTenantMembership, deviceId: string) {
    const offlineExpiresAt = new Date(Date.now() + OFFLINE_DEVICE_WINDOW_MS).toISOString();
    const result = await this.repo.heartbeatDevice({
      businessId: tenant.businessId,
      userId: tenant.userId,
      deviceId,
      offlineExpiresAt,
    });

    if (!result) {
      throw new ApiError(404, 'NOT_FOUND', 'Registered device was not found for this user.');
    }

    if (result.status === 'revoked') {
      throw new ApiError(
        403,
        'PERMISSION_DENIED',
        'This registered offline device has been revoked. Sign out and wipe local offline storage.',
        {
          reason: 'DEVICE_REVOKED',
          action: 'force_logout_and_wipe_local_db',
          deviceId: result.device.id,
        },
      );
    }

    const msRemaining = new Date(result.device.offlineExpiresAt).getTime() - Date.now();
    const { deviceFingerprintHash: _hidden, ...safeDevice } = result.device;
    return {
      device: safeDevice,
      expiryWarning: msRemaining <= OFFLINE_WARNING_THRESHOLD_MS,
    };
  }

  async listAuditLogs(tenant: ActiveTenantMembership, limit: number, offset: number) {
    return this.repo.listAuditLogs(tenant.businessId, tenant.userId, limit, offset);
  }
}
