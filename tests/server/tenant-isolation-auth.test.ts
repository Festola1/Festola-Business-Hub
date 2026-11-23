// @vitest-environment node
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadServerEnv } from '../../server/config/env.ts';
import { createApiApp } from '../../server/index.ts';
import type { AuthTokenVerifier, VerifiedAuthUser } from '../../server/lib/supabase-admin.ts';
import type {
  CreateBusinessRepoInput,
  IdentityRepository,
  PendingInvitationLookup,
  UpdateBusinessSettingsRepoInput,
} from '../../server/modules/identity/identity.repository.ts';
import type {
  ActiveTenantMembership,
  AuditLogRecord,
  BusinessLocationRecord,
  BusinessMembershipRecord,
  BusinessRecord,
  BusinessRole,
  BusinessSubscriptionRecord,
  InvitableRole,
  RegisteredDeviceRecord,
  StaffInvitationRecord,
  SubscriptionStatus,
  UserProfileRecord,
} from '../../server/modules/identity/identity.types.ts';

class InMemoryIdentityRepository implements IdentityRepository {
  public profiles = new Map<string, UserProfileRecord>();
  public businesses = new Map<string, BusinessRecord>();
  public locations = new Map<string, BusinessLocationRecord>();
  public subscriptions = new Map<string, BusinessSubscriptionRecord>();
  public memberships = new Map<string, BusinessMembershipRecord>();
  public invitations = new Map<string, StaffInvitationRecord>();
  public devices = new Map<string, RegisteredDeviceRecord>();
  public auditLogs: AuditLogRecord[] = [];

  private memKey(businessId: string, userId: string): string {
    return `${businessId}:${userId}`;
  }

  public setSubscriptionStatus(businessId: string, status: SubscriptionStatus): void {
    const sub = this.subscriptions.get(businessId);
    if (sub) {
      sub.status = status;
    }
  }

  async ensureUserProfile(input: {
    id: string;
    email: string;
    fullName: string;
  }): Promise<UserProfileRecord> {
    const existing = this.profiles.get(input.id);
    if (existing) {
      return existing;
    }
    const now = new Date().toISOString();
    const created: UserProfileRecord = {
      id: input.id,
      email: input.email.toLowerCase(),
      fullName: input.fullName,
      phone: null,
      acceptedTermsAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.profiles.set(input.id, created);
    return created;
  }

  async updateUserProfile(
    userId: string,
    patch: { fullName?: string; phone?: string | null; acceptTerms?: boolean },
  ): Promise<UserProfileRecord> {
    const existing = this.profiles.get(userId);
    if (!existing) {
      throw new Error('User profile not found');
    }
    const now = new Date().toISOString();
    const updated: UserProfileRecord = {
      ...existing,
      fullName: patch.fullName ?? existing.fullName,
      phone: patch.phone !== undefined ? patch.phone : existing.phone,
      acceptedTermsAt:
        patch.acceptTerms && !existing.acceptedTermsAt ? now : existing.acceptedTermsAt,
      updatedAt: now,
    };
    this.profiles.set(userId, updated);
    return updated;
  }

  async listUserActiveMemberships(userId: string): Promise<ActiveTenantMembership[]> {
    const results: ActiveTenantMembership[] = [];
    for (const mem of this.memberships.values()) {
      if (mem.userId === userId && mem.status === 'active') {
        const active = await this.getActiveTenantMembership(userId, mem.businessId);
        if (active) {
          results.push(active);
        }
      }
    }
    return results;
  }

  async getActiveTenantMembership(
    userId: string,
    businessId: string,
  ): Promise<ActiveTenantMembership | null> {
    const mem = this.memberships.get(this.memKey(businessId, userId));
    const biz = this.businesses.get(businessId);
    const sub = this.subscriptions.get(businessId);
    const loc = this.locations.get(businessId);
    if (!mem || mem.status !== 'active' || !biz || biz.status !== 'active' || !sub || !loc) {
      return null;
    }
    return {
      businessId: biz.id,
      businessName: biz.name,
      userId: mem.userId,
      role: mem.role,
      membershipStatus: mem.status,
      subscriptionStatus: sub.status,
      limits: sub.limits,
      defaultLocationId: loc.id,
    };
  }

  async createBusinessWithDefaults(input: CreateBusinessRepoInput) {
    const now = new Date().toISOString();
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const businessId = randomUUID();

    const business: BusinessRecord = {
      id: businessId,
      name: input.name,
      slug: input.slug,
      currencyCode: input.currencyCode,
      timezone: input.timezone,
      phone: input.phone,
      address: input.address,
      logoUrl: null,
      taxId: null,
      taxEnabled: false,
      taxMode: 'exclusive',
      taxRate: '0.0000',
      allowNegativeStock: false,
      receiptFooter: null,
      status: 'active',
      createdBy: input.userId,
      createdAt: now,
      updatedAt: now,
    };

    const defaultLocation: BusinessLocationRecord = {
      id: randomUUID(),
      businessId,
      name: input.locationName,
      address: input.address,
      phone: input.phone,
      isDefault: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const planId = randomUUID();
    const subscription: BusinessSubscriptionRecord = {
      id: randomUUID(),
      businessId,
      planId,
      status: 'trialing',
      trialEndsAt,
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
      graceEndsAt: null,
      limits: {
        planId,
        planCode: 'free_trial_14d',
        displayName: '14-Day Free Trial',
        maxStaff: 3,
        maxProducts: 500,
        maxOfflineDevices: 2,
      },
    };

    const membership: BusinessMembershipRecord = {
      id: randomUUID(),
      businessId,
      userId: input.userId,
      role: 'owner',
      status: 'active',
      invitedBy: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.businesses.set(businessId, business);
    this.locations.set(businessId, defaultLocation);
    this.subscriptions.set(businessId, subscription);
    this.memberships.set(this.memKey(businessId, input.userId), membership);
    this.auditLogs.unshift({
      id: randomUUID(),
      businessId,
      actorUserId: input.userId,
      actorRole: 'owner',
      action: 'business.created',
      entityType: 'business',
      entityId: businessId,
      metadata: { trialPlanCode: 'free_trial_14d' },
      createdAt: now,
    });

    return { business, defaultLocation, subscription, membership };
  }

  async getBusinessWithDefaults(businessId: string) {
    const business = this.businesses.get(businessId);
    const defaultLocation = this.locations.get(businessId);
    const subscription = this.subscriptions.get(businessId);
    if (!business || !defaultLocation || !subscription) {
      return null;
    }
    return { business, defaultLocation, subscription };
  }

  async updateBusinessSettings(
    businessId: string,
    actorUserId: string,
    actorRole: BusinessRole,
    patch: UpdateBusinessSettingsRepoInput,
  ): Promise<BusinessRecord> {
    const existing = this.businesses.get(businessId);
    if (!existing) {
      throw new Error('Business not found');
    }
    const now = new Date().toISOString();
    const updated: BusinessRecord = {
      ...existing,
      name: patch.name ?? existing.name,
      phone: patch.phone !== undefined ? patch.phone : existing.phone,
      address: patch.address !== undefined ? patch.address : existing.address,
      taxId: patch.taxId !== undefined ? patch.taxId : existing.taxId,
      taxEnabled: patch.taxEnabled ?? existing.taxEnabled,
      taxMode: patch.taxMode ?? existing.taxMode,
      taxRate: patch.taxRate !== undefined ? patch.taxRate.toFixed(4) : existing.taxRate,
      allowNegativeStock: patch.allowNegativeStock ?? existing.allowNegativeStock,
      receiptFooter:
        patch.receiptFooter !== undefined ? patch.receiptFooter : existing.receiptFooter,
      updatedAt: now,
    };
    this.businesses.set(businessId, updated);
    this.auditLogs.unshift({
      id: randomUUID(),
      businessId,
      actorUserId,
      actorRole,
      action: 'business.settings_updated',
      entityType: 'business',
      entityId: businessId,
      metadata: { changedFields: Object.keys(patch) },
      createdAt: now,
    });
    return updated;
  }

  async listStaffMembers(businessId: string): Promise<BusinessMembershipRecord[]> {
    return [...this.memberships.values()].filter((m) => m.businessId === businessId);
  }

  async countActiveStaff(businessId: string): Promise<number> {
    return [...this.memberships.values()].filter(
      (m) => m.businessId === businessId && m.status === 'active',
    ).length;
  }

  async createStaffInvitation(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    email: string;
    role: InvitableRole;
    tokenHash: string;
    expiresAt: string;
  }): Promise<StaffInvitationRecord> {
    const now = new Date().toISOString();
    const invitation: StaffInvitationRecord = {
      id: randomUUID(),
      businessId: input.businessId,
      email: input.email.toLowerCase(),
      role: input.role,
      tokenHash: input.tokenHash,
      status: 'pending',
      invitedBy: input.actorUserId,
      expiresAt: input.expiresAt,
      acceptedBy: null,
      acceptedAt: null,
      createdAt: now,
    };
    this.invitations.set(invitation.id, invitation);
    this.auditLogs.unshift({
      id: randomUUID(),
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: 'staff.invited',
      entityType: 'staff_invitation',
      entityId: invitation.id,
      metadata: { role: input.role },
      createdAt: now,
    });
    return invitation;
  }

  async listPendingInvitations(businessId: string): Promise<StaffInvitationRecord[]> {
    return [...this.invitations.values()].filter(
      (i) => i.businessId === businessId && i.status === 'pending',
    );
  }

  async lookupInvitationByTokenHash(tokenHash: string): Promise<PendingInvitationLookup | null> {
    const found = [...this.invitations.values()].find((i) => i.tokenHash === tokenHash);
    if (!found) {
      return null;
    }
    return {
      id: found.id,
      businessId: found.businessId,
      email: found.email,
      role: found.role,
      status: found.status,
      expiresAt: found.expiresAt,
    };
  }

  async acceptStaffInvitation(input: {
    invitationId: string;
    businessId: string;
    userId: string;
    role: InvitableRole;
  }): Promise<BusinessMembershipRecord> {
    const now = new Date().toISOString();
    const inv = this.invitations.get(input.invitationId);
    if (inv) {
      inv.status = 'accepted';
      inv.acceptedBy = input.userId;
      inv.acceptedAt = now;
    }
    const membership: BusinessMembershipRecord = {
      id: randomUUID(),
      businessId: input.businessId,
      userId: input.userId,
      role: input.role,
      status: 'active',
      invitedBy: inv?.invitedBy ?? null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.memberships.set(this.memKey(input.businessId, input.userId), membership);
    this.auditLogs.unshift({
      id: randomUUID(),
      businessId: input.businessId,
      actorUserId: input.userId,
      actorRole: input.role,
      action: 'staff.invitation_accepted',
      entityType: 'business_membership',
      entityId: membership.id,
      metadata: { role: input.role },
      createdAt: now,
    });
    return membership;
  }

  async updateStaffRole(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    targetUserId: string;
    newRole: InvitableRole;
  }): Promise<BusinessMembershipRecord | null> {
    const mem = this.memberships.get(this.memKey(input.businessId, input.targetUserId));
    if (!mem || mem.role === 'owner' || mem.status !== 'active') {
      return null;
    }
    const now = new Date().toISOString();
    mem.role = input.newRole;
    mem.updatedAt = now;
    this.auditLogs.unshift({
      id: randomUUID(),
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: 'staff.role_updated',
      entityType: 'business_membership',
      entityId: mem.id,
      metadata: { targetUserId: input.targetUserId, newRole: input.newRole },
      createdAt: now,
    });
    return mem;
  }

  async revokeStaffMember(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    targetUserId: string;
  }) {
    const mem = this.memberships.get(this.memKey(input.businessId, input.targetUserId));
    if (!mem || mem.role === 'owner' || mem.status === 'revoked') {
      return null;
    }
    const now = new Date().toISOString();
    mem.status = 'revoked';
    mem.revokedAt = now;
    mem.updatedAt = now;

    let revokedDevicesCount = 0;
    for (const dev of this.devices.values()) {
      if (
        dev.businessId === input.businessId &&
        dev.userId === input.targetUserId &&
        dev.status === 'active'
      ) {
        dev.status = 'revoked';
        dev.revokedAt = now;
        dev.revokedBy = input.actorUserId;
        revokedDevicesCount += 1;
      }
    }

    this.auditLogs.unshift({
      id: randomUUID(),
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: 'staff.revoked',
      entityType: 'business_membership',
      entityId: mem.id,
      metadata: { targetUserId: input.targetUserId, revokedDevicesCount },
      createdAt: now,
    });

    return { membership: mem, revokedDevicesCount };
  }

  async listRegisteredDevices(businessId: string): Promise<RegisteredDeviceRecord[]> {
    return [...this.devices.values()].filter((d) => d.businessId === businessId);
  }

  async countActiveDevices(businessId: string): Promise<number> {
    return [...this.devices.values()].filter(
      (d) => d.businessId === businessId && d.status === 'active',
    ).length;
  }

  async registerDevice(input: {
    businessId: string;
    userId: string;
    actorRole: BusinessRole;
    deviceCode: string;
    deviceFingerprintHash: string;
    deviceName: string;
    offlineExpiresAt: string;
  }): Promise<RegisteredDeviceRecord> {
    const now = new Date().toISOString();
    const device: RegisteredDeviceRecord = {
      id: randomUUID(),
      businessId: input.businessId,
      userId: input.userId,
      deviceCode: input.deviceCode,
      deviceFingerprintHash: input.deviceFingerprintHash,
      deviceName: input.deviceName,
      status: 'active',
      lastVerifiedAt: now,
      offlineExpiresAt: input.offlineExpiresAt,
      revokedAt: null,
      revokedBy: null,
      createdAt: now,
    };
    this.devices.set(device.id, device);
    this.auditLogs.unshift({
      id: randomUUID(),
      businessId: input.businessId,
      actorUserId: input.userId,
      actorRole: input.actorRole,
      action: 'device.registered',
      entityType: 'registered_device',
      entityId: device.id,
      metadata: { deviceCode: device.deviceCode },
      createdAt: now,
    });
    return device;
  }

  async revokeDevice(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    deviceId: string;
  }): Promise<RegisteredDeviceRecord | null> {
    const dev = this.devices.get(input.deviceId);
    if (!dev || dev.businessId !== input.businessId || dev.status !== 'active') {
      return null;
    }
    const now = new Date().toISOString();
    dev.status = 'revoked';
    dev.revokedAt = now;
    dev.revokedBy = input.actorUserId;
    this.auditLogs.unshift({
      id: randomUUID(),
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: 'device.revoked',
      entityType: 'registered_device',
      entityId: dev.id,
      metadata: { deviceCode: dev.deviceCode },
      createdAt: now,
    });
    return dev;
  }

  async revokeInvitation(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    invitationId: string;
  }): Promise<StaffInvitationRecord | null> {
    const inv = this.invitations.get(input.invitationId);
    if (!inv || inv.businessId !== input.businessId || inv.status !== 'pending') {
      return null;
    }
    inv.status = 'revoked';
    this.auditLogs.unshift({
      id: randomUUID(),
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: 'staff.invitation_revoked',
      entityType: 'staff_invitation',
      entityId: inv.id,
      metadata: { email: inv.email },
      createdAt: new Date().toISOString(),
    });
    return inv;
  }

  async suspendStaffMember(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    targetUserId: string;
  }) {
    const mem = this.memberships.get(this.memKey(input.businessId, input.targetUserId));
    if (!mem || mem.role === 'owner' || mem.status !== 'active') {
      return null;
    }
    const now = new Date().toISOString();
    mem.status = 'suspended';
    mem.updatedAt = now;
    let revokedDevicesCount = 0;
    for (const dev of this.devices.values()) {
      if (
        dev.businessId === input.businessId &&
        dev.userId === input.targetUserId &&
        dev.status === 'active'
      ) {
        dev.status = 'revoked';
        dev.revokedAt = now;
        dev.revokedBy = input.actorUserId;
        revokedDevicesCount += 1;
      }
    }
    this.auditLogs.unshift({
      id: randomUUID(),
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: 'staff.suspended',
      entityType: 'business_membership',
      entityId: mem.id,
      metadata: { targetUserId: input.targetUserId, revokedDevicesCount },
      createdAt: now,
    });
    return { membership: mem, revokedDevicesCount };
  }

  async reactivateStaffMember(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    targetUserId: string;
  }): Promise<BusinessMembershipRecord | null> {
    const mem = this.memberships.get(this.memKey(input.businessId, input.targetUserId));
    if (!mem || mem.role === 'owner' || mem.status !== 'suspended') {
      return null;
    }
    const now = new Date().toISOString();
    mem.status = 'active';
    mem.updatedAt = now;
    this.auditLogs.unshift({
      id: randomUUID(),
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: 'staff.reactivated',
      entityType: 'business_membership',
      entityId: mem.id,
      metadata: { targetUserId: input.targetUserId },
      createdAt: now,
    });
    return mem;
  }

  async heartbeatDevice(input: {
    businessId: string;
    userId: string;
    deviceId: string;
    offlineExpiresAt: string;
  }): Promise<{ device: RegisteredDeviceRecord; status: 'active' | 'revoked' } | null> {
    const dev = this.devices.get(input.deviceId);
    if (!dev || dev.businessId !== input.businessId || dev.userId !== input.userId) {
      return null;
    }
    if (dev.status === 'revoked') {
      return { device: dev, status: 'revoked' };
    }
    dev.lastVerifiedAt = new Date().toISOString();
    dev.offlineExpiresAt = input.offlineExpiresAt;
    return { device: dev, status: 'active' };
  }

  async listAuditLogs(
    businessId: string,
    _actorUserId: string,
    limit: number,
    offset: number,
  ): Promise<AuditLogRecord[]> {
    return this.auditLogs
      .filter((log) => log.businessId === businessId)
      .slice(offset, offset + limit);
  }
}

describe('P-02b Multi-Tenant Auth, RBAC, Staff Invites, Devices & Audit API', () => {
  const tokens: Record<string, VerifiedAuthUser> = {
    'token-owner-a': {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'owner-a@festola.test',
      fullName: 'Adaeze Okafor',
    },
    'token-owner-b': {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      email: 'owner-b@festola.test',
      fullName: 'Chidi Bello',
    },
    'token-cashier-a': {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      email: 'cashier-a@festola.test',
      fullName: 'Tunde Musa',
    },
    'token-manager-a': {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      email: 'manager-a@festola.test',
      fullName: 'Ngozi Eze',
    },
  };

  const authVerifier: AuthTokenVerifier = {
    async verifyAccessToken(accessToken: string) {
      return tokens[accessToken] ?? null;
    },
  };

  function setupApp() {
    const repo = new InMemoryIdentityRepository();
    const app = createApiApp(loadServerEnv({ NODE_ENV: 'test', APP_ENV: 'test' }), {
      authVerifier,
      identityRepository: repo,
    });
    return { app, repo };
  }

  it('rejects invalid Bearer JWTs with 401 UNAUTHENTICATED', async () => {
    const { app } = setupApp();
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer bad-jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('enforces cross-tenant isolation even when X-Business-ID header is forged', async () => {
    const { app } = setupApp();

    const bizARes = await request(app)
      .post('/api/v1/businesses')
      .set('Authorization', 'Bearer token-owner-a')
      .send({ name: 'Adaeze Mart' });
    expect(bizARes.status).toBe(201);
    const bizAId = bizARes.body.data.business.id as string;
    expect(bizARes.body.data.business.currencyCode).toBe('NGN');
    expect(bizARes.body.data.business.taxEnabled).toBe(false);
    expect(bizARes.body.data.business.allowNegativeStock).toBe(false);
    expect(bizARes.body.data.defaultLocation.isDefault).toBe(true);
    expect(bizARes.body.data.subscription.status).toBe('trialing');

    const bizBRes = await request(app)
      .post('/api/v1/businesses')
      .set('Authorization', 'Bearer token-owner-b')
      .send({ name: 'Chidi Stores' });
    expect(bizBRes.status).toBe(201);
    const bizBId = bizBRes.body.data.business.id as string;

    // Owner A accessing own business succeeds
    const ownCheck = await request(app)
      .get('/api/v1/tenant/check')
      .set('Authorization', 'Bearer token-owner-a')
      .set('X-Business-ID', bizAId);
    expect(ownCheck.status).toBe(200);
    expect(ownCheck.body.data.role).toBe('owner');

    // Owner A forging X-Business-ID of Tenant B is strictly denied
    const forgedCheck = await request(app)
      .get('/api/v1/businesses/current')
      .set('Authorization', 'Bearer token-owner-a')
      .set('X-Business-ID', bizBId);
    expect(forgedCheck.status).toBe(403);
    expect(forgedCheck.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('enforces invite SHA-256 hashing, role boundaries, instant staff/device revocation, and D-01 limits', async () => {
    const { app, repo } = setupApp();

    const bizRes = await request(app)
      .post('/api/v1/businesses')
      .set('Authorization', 'Bearer token-owner-a')
      .send({ name: 'Festola Superstore' });
    const businessId = bizRes.body.data.business.id as string;

    // Invite Cashier & Manager (Owner + 2 staff = 3 maxStaff on trial)
    const inviteCashier = await request(app)
      .post('/api/v1/staff/invitations')
      .set('Authorization', 'Bearer token-owner-a')
      .set('X-Business-ID', businessId)
      .send({ email: 'cashier-a@festola.test', role: 'cashier' });
    expect(inviteCashier.status).toBe(201);
    const cashierInviteToken = inviteCashier.body.data.inviteToken as string;
    expect(inviteCashier.body.data.invitation.tokenHash).toBeUndefined();

    // Wrong email cannot accept Cashier's invitation
    const wrongAccept = await request(app)
      .post('/api/v1/staff/invitations/accept')
      .set('Authorization', 'Bearer token-owner-b')
      .send({ token: cashierInviteToken });
    expect(wrongAccept.status).toBe(403);

    // Correct email accepts Cashier invitation
    const acceptCashier = await request(app)
      .post('/api/v1/staff/invitations/accept')
      .set('Authorization', 'Bearer token-cashier-a')
      .send({ token: cashierInviteToken });
    expect(acceptCashier.status).toBe(200);
    expect(acceptCashier.body.data.membership.role).toBe('cashier');

    // Invite Manager
    const inviteManager = await request(app)
      .post('/api/v1/staff/invitations')
      .set('Authorization', 'Bearer token-owner-a')
      .set('X-Business-ID', businessId)
      .send({ email: 'manager-a@festola.test', role: 'manager' });
    expect(inviteManager.status).toBe(201);
    const managerToken = inviteManager.body.data.inviteToken as string;

    // 4th staff invite hits D-01 trial maxStaff = 3 limit
    const overStaffLimit = await request(app)
      .post('/api/v1/staff/invitations')
      .set('Authorization', 'Bearer token-owner-a')
      .set('X-Business-ID', businessId)
      .send({ email: 'extra@festola.test', role: 'cashier' });
    expect(overStaffLimit.status).toBe(403);
    expect(overStaffLimit.body.error.code).toBe('SUBSCRIPTION_LIMIT_REACHED');

    await request(app)
      .post('/api/v1/staff/invitations/accept')
      .set('Authorization', 'Bearer token-manager-a')
      .send({ token: managerToken });

    // Cashier cannot modify business settings or view audit logs (D-09)
    const cashierSettings = await request(app)
      .patch('/api/v1/businesses/current/settings')
      .set('Authorization', 'Bearer token-cashier-a')
      .set('X-Business-ID', businessId)
      .send({ taxEnabled: true, taxRate: 7.5 });
    expect(cashierSettings.status).toBe(403);

    const managerAudit = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', 'Bearer token-manager-a')
      .set('X-Business-ID', businessId);
    expect(managerAudit.status).toBe(403);

    // Owner updates D-03 tax & D-04 negative stock settings
    const ownerSettings = await request(app)
      .patch('/api/v1/businesses/current/settings')
      .set('Authorization', 'Bearer token-owner-a')
      .set('X-Business-ID', businessId)
      .send({ taxEnabled: true, taxMode: 'exclusive', taxRate: 7.5, allowNegativeStock: true });
    expect(ownerSettings.status).toBe(200);
    expect(ownerSettings.body.data.business.taxEnabled).toBe(true);
    expect(ownerSettings.body.data.business.allowNegativeStock).toBe(true);

    // Cashier registers offline device (D-09 7-day window, D-14 4-char deviceCode)
    const regDevice1 = await request(app)
      .post('/api/v1/devices/register')
      .set('Authorization', 'Bearer token-cashier-a')
      .set('X-Business-ID', businessId)
      .send({
        deviceName: 'Counter Tecno Phone',
        deviceFingerprint: 'fingerprint-device-0001-abcdef',
      });
    expect(regDevice1.status).toBe(201);
    expect(regDevice1.body.data.device.deviceCode).toHaveLength(4);
    expect(regDevice1.body.data.device.deviceFingerprintHash).toBeUndefined();

    // Register 2nd device (reaches maxOfflineDevices = 2)
    const regDevice2 = await request(app)
      .post('/api/v1/devices/register')
      .set('Authorization', 'Bearer token-manager-a')
      .set('X-Business-ID', businessId)
      .send({
        deviceName: 'Backoffice Laptop',
        deviceFingerprint: 'fingerprint-device-0002-abcdef',
      });
    expect(regDevice2.status).toBe(201);

    // 3rd device blocked by D-01 maxOfflineDevices limit
    const regDevice3 = await request(app)
      .post('/api/v1/devices/register')
      .set('Authorization', 'Bearer token-owner-a')
      .set('X-Business-ID', businessId)
      .send({
        deviceName: 'Extra Tablet',
        deviceFingerprint: 'fingerprint-device-0003-abcdef',
      });
    expect(regDevice3.status).toBe(403);
    expect(regDevice3.body.error.code).toBe('SUBSCRIPTION_LIMIT_REACHED');

    // Owner revokes Cashier -> immediately blocks Cashier API access AND revokes Cashier's device
    const revokeCashier = await request(app)
      .post(`/api/v1/staff/${tokens['token-cashier-a']!.id}/revoke`)
      .set('Authorization', 'Bearer token-owner-a')
      .set('X-Business-ID', businessId);
    expect(revokeCashier.status).toBe(200);
    expect(revokeCashier.body.data.revokedDevicesCount).toBe(1);

    const revokedCashierCheck = await request(app)
      .get('/api/v1/tenant/check')
      .set('Authorization', 'Bearer token-cashier-a')
      .set('X-Business-ID', businessId);
    expect(revokedCashierCheck.status).toBe(403);
    expect(revokedCashierCheck.body.error.code).toBe('PERMISSION_DENIED');

    // D-01 read_only mode allows reads but blocks mutations
    repo.setSubscriptionStatus(businessId, 'read_only');

    const readAllowed = await request(app)
      .get('/api/v1/businesses/current')
      .set('Authorization', 'Bearer token-owner-a')
      .set('X-Business-ID', businessId);
    expect(readAllowed.status).toBe(200);

    const writeBlocked = await request(app)
      .patch('/api/v1/businesses/current/settings')
      .set('Authorization', 'Bearer token-owner-a')
      .set('X-Business-ID', businessId)
      .send({ receiptFooter: 'Should fail in read_only' });
    expect(writeBlocked.status).toBe(403);
    expect(writeBlocked.body.error.code).toBe('SUBSCRIPTION_LIMIT_REACHED');

    // Audit logs visible to Owner and contain recorded security mutations
    const ownerAudit = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', 'Bearer token-owner-a')
      .set('X-Business-ID', businessId);
    expect(ownerAudit.status).toBe(200);
    const actions = (ownerAudit.body.data.logs as AuditLogRecord[]).map((l) => l.action);
    expect(actions).toContain('business.created');
    expect(actions).toContain('business.settings_updated');
    expect(actions).toContain('staff.invited');
    expect(actions).toContain('staff.revoked');
    expect(actions).toContain('device.registered');
  });
});
