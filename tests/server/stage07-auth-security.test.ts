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
  UserProfileRecord,
} from '../../server/modules/identity/identity.types.ts';
import type {
  PlatformAdminAuditInput,
  PlatformAdminRepository,
} from '../../server/modules/platform-admin/platform-admin.repository.ts';
import type {
  PlatformAdminAuditLogRecord,
  PlatformAdminIdentity,
  PlatformTenantSummary,
} from '../../server/modules/platform-admin/platform-admin.types.ts';
import type {
  AllowedStorageBucket,
  StorageUrlSigner,
} from '../../server/modules/storage/storage.service.ts';

class Stage07InMemoryStore implements IdentityRepository {
  public profiles = new Map<string, UserProfileRecord>();
  public businesses = new Map<string, BusinessRecord>();
  public locations = new Map<string, BusinessLocationRecord>();
  public subscriptions = new Map<string, BusinessSubscriptionRecord>();
  public memberships = new Map<string, BusinessMembershipRecord>();
  public invitations = new Map<string, StaffInvitationRecord>();
  public devices = new Map<string, RegisteredDeviceRecord>();
  public auditLogs: AuditLogRecord[] = [];
  public platformAdmins = new Map<string, PlatformAdminIdentity>();
  public platformAuditLogs: PlatformAdminAuditLogRecord[] = [];

  private memKey(businessId: string, userId: string): string {
    return `${businessId}:${userId}`;
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
      acceptedTermsAt: now,
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
    const existing = this.profiles.get(userId)!;
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
    const list: ActiveTenantMembership[] = [];
    for (const mem of this.memberships.values()) {
      if (mem.userId === userId && mem.status === 'active') {
        const active = await this.getActiveTenantMembership(userId, mem.businessId);
        if (active) {
          list.push(active);
        }
      }
    }
    return list;
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
        maxStaff: 10,
        maxProducts: 500,
        maxOfflineDevices: 5,
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
    const existing = this.businesses.get(businessId)!;
    const now = new Date().toISOString();
    const updated: BusinessRecord = {
      ...existing,
      name: patch.name ?? existing.name,
      taxEnabled: patch.taxEnabled ?? existing.taxEnabled,
      taxMode: patch.taxMode ?? existing.taxMode,
      taxRate: patch.taxRate !== undefined ? patch.taxRate.toFixed(4) : existing.taxRate,
      allowNegativeStock: patch.allowNegativeStock ?? existing.allowNegativeStock,
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

  async listStaffMembers(businessId: string) {
    return [...this.memberships.values()].filter((m) => m.businessId === businessId);
  }

  async countActiveStaff(businessId: string) {
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
    const inv: StaffInvitationRecord = {
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
    this.invitations.set(inv.id, inv);
    return inv;
  }

  async listPendingInvitations(businessId: string) {
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
    const mem: BusinessMembershipRecord = {
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
    this.memberships.set(this.memKey(input.businessId, input.userId), mem);
    return mem;
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
    mem.role = input.newRole;
    mem.updatedAt = new Date().toISOString();
    return mem;
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
    return { membership: mem, revokedDevicesCount };
  }

  async reactivateStaffMember(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    targetUserId: string;
  }) {
    const mem = this.memberships.get(this.memKey(input.businessId, input.targetUserId));
    if (!mem || mem.role === 'owner' || mem.status !== 'suspended') {
      return null;
    }
    mem.status = 'active';
    mem.updatedAt = new Date().toISOString();
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
    return { membership: mem, revokedDevicesCount };
  }

  async listRegisteredDevices(businessId: string) {
    return [...this.devices.values()].filter((d) => d.businessId === businessId);
  }

  async countActiveDevices(businessId: string) {
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
    dev.status = 'revoked';
    dev.revokedAt = new Date().toISOString();
    dev.revokedBy = input.actorUserId;
    return dev;
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

  async listAuditLogs(businessId: string, _actorUserId: string, limit: number, offset: number) {
    return this.auditLogs
      .filter((log) => log.businessId === businessId)
      .slice(offset, offset + limit);
  }

  // ---- PlatformAdminRepository ----
  async getActivePlatformAdmin(userId: string): Promise<PlatformAdminIdentity | null> {
    const admin = this.platformAdmins.get(userId);
    return admin && admin.isActive ? admin : null;
  }

  async listTenantSummaries(limit: number, offset: number): Promise<PlatformTenantSummary[]> {
    return [...this.businesses.values()].slice(offset, offset + limit).map((b) => ({
      businessId: b.id,
      name: b.name,
      slug: b.slug,
      currencyCode: b.currencyCode,
      status: b.status,
      subscriptionStatus: this.subscriptions.get(b.id)?.status ?? 'unknown',
      planCode: this.subscriptions.get(b.id)?.limits.planCode ?? 'unknown',
      activeStaffCount: [...this.memberships.values()].filter(
        (m) => m.businessId === b.id && m.status === 'active',
      ).length,
      activeDeviceCount: [...this.devices.values()].filter(
        (d) => d.businessId === b.id && d.status === 'active',
      ).length,
      createdAt: b.createdAt,
    }));
  }

  async updateTenantStatus(input: {
    businessId: string;
    newStatus: 'active' | 'suspended';
    audit: PlatformAdminAuditInput;
  }): Promise<PlatformTenantSummary | null> {
    const biz = this.businesses.get(input.businessId);
    if (!biz) {
      return null;
    }
    biz.status = input.newStatus;
    await this.recordAuditLog(input.audit);
    const summaries = await this.listTenantSummaries(100, 0);
    return summaries.find((s) => s.businessId === input.businessId) ?? null;
  }

  async recordAuditLog(input: PlatformAdminAuditInput): Promise<PlatformAdminAuditLogRecord> {
    const record: PlatformAdminAuditLogRecord = {
      id: randomUUID(),
      adminUserId: input.adminUserId,
      adminRole: input.adminRole,
      action: input.action,
      targetBusinessId: input.targetBusinessId,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      supportTicketRef: input.supportTicketRef,
      reason: input.reason,
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString(),
    };
    this.platformAuditLogs.unshift(record);
    return record;
  }

  async listAuditLogsPlatform(limit: number, offset: number) {
    return this.platformAuditLogs.slice(offset, offset + limit);
  }
}

describe('Stage 07 Two-Business Negative Security, Storage Isolation & Platform-Admin Separation Harness', () => {
  function createTestHarness(appEnv: 'test' | 'staging' = 'test') {
    const store = new Stage07InMemoryStore();
    const signedOutUsers = new Set<string>();
    const revokedTokens = new Set<string>();

    const actors: Record<string, VerifiedAuthUser> = {
      'jwt-owner-a': {
        id: '11111111-1111-4111-8111-111111111101',
        email: 'owner-a@alpha.example',
        fullName: 'Owner Alpha',
        emailConfirmedAt: '2026-11-01T00:00:00Z',
        aal: 'aal1',
      },
      'jwt-manager-a': {
        id: '11111111-1111-4111-8111-111111111102',
        email: 'manager-a@alpha.example',
        fullName: 'Manager Alpha',
        emailConfirmedAt: '2026-11-01T00:00:00Z',
        aal: 'aal1',
      },
      'jwt-cashier-a': {
        id: '11111111-1111-4111-8111-111111111103',
        email: 'cashier-a@alpha.example',
        fullName: 'Cashier Alpha',
        emailConfirmedAt: '2026-11-01T00:00:00Z',
        aal: 'aal1',
      },
      'jwt-owner-b': {
        id: '22222222-2222-4222-8222-222222222201',
        email: 'owner-b@beta.example',
        fullName: 'Owner Beta',
        emailConfirmedAt: '2026-11-01T00:00:00Z',
        aal: 'aal1',
      },
      'jwt-unverified': {
        id: '33333333-3333-4333-8333-333333333301',
        email: 'unverified@outsider.example',
        fullName: 'Unverified Signup',
        emailConfirmedAt: null,
        aal: 'aal1',
      },
      'jwt-outsider': {
        id: '33333333-3333-4333-8333-333333333302',
        email: 'outsider@none.example',
        fullName: 'Verified Outsider',
        emailConfirmedAt: '2026-11-01T00:00:00Z',
        aal: 'aal1',
      },
      'jwt-platform-super-aal2': {
        id: '99999999-9999-4999-8999-999999999901',
        email: 'super-admin@festola.example',
        fullName: 'Platform Super Admin',
        emailConfirmedAt: '2026-11-01T00:00:00Z',
        aal: 'aal2',
      },
      'jwt-platform-super-no-mfa': {
        id: '99999999-9999-4999-8999-999999999901',
        email: 'super-admin@festola.example',
        fullName: 'Platform Super Admin (No MFA)',
        emailConfirmedAt: '2026-11-01T00:00:00Z',
        aal: 'aal1',
      },
      'jwt-platform-support-aal2': {
        id: '99999999-9999-4999-8999-999999999902',
        email: 'support-ro@festola.example',
        fullName: 'Platform Support RO',
        emailConfirmedAt: '2026-11-01T00:00:00Z',
        aal: 'aal2',
      },
    };

    store.platformAdmins.set('99999999-9999-4999-8999-999999999901', {
      userId: '99999999-9999-4999-8999-999999999901',
      email: 'super-admin@festola.example',
      role: 'super_admin',
      isActive: true,
    });
    store.platformAdmins.set('99999999-9999-4999-8999-999999999902', {
      userId: '99999999-9999-4999-8999-999999999902',
      email: 'support-ro@festola.example',
      role: 'support_readonly',
      isActive: true,
    });

    const authVerifier: AuthTokenVerifier = {
      async verifyAccessToken(token: string) {
        if (revokedTokens.has(token)) {
          return null;
        }
        const actor = actors[token];
        if (!actor || signedOutUsers.has(actor.id)) {
          return null;
        }
        return actor;
      },
      async signOutUser(userId: string) {
        signedOutUsers.add(userId);
      },
    };

    const storageSigner: StorageUrlSigner = {
      async createSignedUploadUrl(bucket: AllowedStorageBucket, storagePath: string) {
        return {
          signedUrl: `https://storage.example/upload/${bucket}/${storagePath}?sig=test`,
          expiresInSeconds: 120,
        };
      },
      async createSignedDownloadUrl(
        bucket: AllowedStorageBucket,
        storagePath: string,
        expiresInSeconds: number,
      ) {
        return {
          signedUrl: `https://storage.example/download/${bucket}/${storagePath}?sig=test`,
          expiresInSeconds,
        };
      },
    };

    // Bridge platformAuditLogs list method cleanly
    const platformRepo: PlatformAdminRepository = {
      getActivePlatformAdmin: (uid) => store.getActivePlatformAdmin(uid),
      listTenantSummaries: (l, o) => store.listTenantSummaries(l, o),
      updateTenantStatus: (inp) => store.updateTenantStatus(inp),
      recordAuditLog: (inp) => store.recordAuditLog(inp),
      listAuditLogs: (l, o) => store.listAuditLogsPlatform(l, o),
    };

    const app = createApiApp(loadServerEnv({ NODE_ENV: 'test', APP_ENV: appEnv }), {
      authVerifier,
      identityRepository: store,
      platformAdminRepository: platformRepo,
      storageSigner,
    });

    return { app, store, actors, signedOutUsers, revokedTokens };
  }

  async function bootstrapTwoBusinesses(app: ReturnType<typeof createApiApp>) {
    const bizA = await request(app)
      .post('/api/v1/businesses')
      .set('Authorization', 'Bearer jwt-owner-a')
      .send({ name: 'Alpha Stores' });
    const bizAId = bizA.body.data.business.id as string;

    const bizB = await request(app)
      .post('/api/v1/businesses')
      .set('Authorization', 'Bearer jwt-owner-b')
      .send({ name: 'Beta Mart' });
    const bizBId = bizB.body.data.business.id as string;

    // Onboard Manager A & Cashier A into Business Alpha
    const invMgr = await request(app)
      .post('/api/v1/staff/invitations')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', bizAId)
      .send({ email: 'manager-a@alpha.example', role: 'manager' });
    await request(app)
      .post('/api/v1/staff/invitations/accept')
      .set('Authorization', 'Bearer jwt-manager-a')
      .send({ token: invMgr.body.data.inviteToken });

    const invCashier = await request(app)
      .post('/api/v1/staff/invitations')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', bizAId)
      .send({ email: 'cashier-a@alpha.example', role: 'cashier' });
    await request(app)
      .post('/api/v1/staff/invitations/accept')
      .set('Authorization', 'Bearer jwt-cashier-a')
      .send({ token: invCashier.body.data.inviteToken });

    return { bizAId, bizBId };
  }

  it('1. Negative Direct API Requests: blocks missing/forged JWT, unverified email onboarding, and role privilege escalations', async () => {
    const { app } = createTestHarness();
    const { bizAId } = await bootstrapTwoBusinesses(app);

    // Missing & invalid Bearer token
    expect((await request(app).get('/api/v1/businesses/current')).status).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/v1/businesses/current')
          .set('Authorization', 'Bearer forged-jwt')
          .set('X-Business-ID', bizAId)
      ).status,
    ).toBe(401);

    // Unverified email user cannot create a business
    const unverifiedBiz = await request(app)
      .post('/api/v1/businesses')
      .set('Authorization', 'Bearer jwt-unverified')
      .send({ name: 'Unverified Shop' });
    expect(unverifiedBiz.status).toBe(403);
    expect(unverifiedBiz.body.error.details.reason).toBe('EMAIL_NOT_VERIFIED');

    // Direct API role bypass attempts: Cashier & Manager attempting Owner-only endpoints
    expect(
      (
        await request(app)
          .post('/api/v1/staff/invitations')
          .set('Authorization', 'Bearer jwt-cashier-a')
          .set('X-Business-ID', bizAId)
          .send({ email: 'rogue@alpha.example', role: 'manager' })
      ).status,
    ).toBe(403);

    expect(
      (
        await request(app)
          .post('/api/v1/staff/11111111-1111-4111-8111-111111111103/suspend')
          .set('Authorization', 'Bearer jwt-manager-a')
          .set('X-Business-ID', bizAId)
      ).status,
    ).toBe(403);

    expect(
      (
        await request(app)
          .get('/api/v1/audit-logs')
          .set('Authorization', 'Bearer jwt-manager-a')
          .set('X-Business-ID', bizAId)
      ).status,
    ).toBe(403);
  });

  it('2. Negative Manipulated Business Headers & Spoofed Payloads: rejects forged X-Business-ID and injected business_id/role fields', async () => {
    const { app } = createTestHarness();
    const { bizAId, bizBId } = await bootstrapTwoBusinesses(app);

    // Non-UUID X-Business-ID header
    const badHeader = await request(app)
      .get('/api/v1/businesses/current')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', 'not-a-uuid');
    expect(badHeader.status).toBe(400);

    // Owner A spoofing X-Business-ID of Business Beta
    const crossHeader = await request(app)
      .get('/api/v1/businesses/current')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', bizBId);
    expect(crossHeader.status).toBe(403);

    // Owner A sending valid X-Business-ID (Alpha) but injecting business_id = Beta in JSON body
    const bodySpoof = await request(app)
      .patch('/api/v1/businesses/current/settings')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', bizAId)
      .send({ name: 'Hijacked Beta', business_id: bizBId });
    expect(bodySpoof.status).toBe(403);

    // Owner A injecting conflicting business_id in query string
    const querySpoof = await request(app)
      .get(`/api/v1/staff?business_id=${bizBId}`)
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', bizAId);
    expect(querySpoof.status).toBe(403);

    // Cashier A injecting untrusted privilege escalation field actorRole: 'owner'
    const roleInject = await request(app)
      .post('/api/v1/devices/register')
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', bizAId)
      .send({
        deviceName: 'Spoofed POS',
        deviceFingerprint: 'fp-cashier-spoof-1234567890',
        actorRole: 'owner',
      });
    expect(roleInject.status).toBe(403);
  });

  it('3. Negative Invalid Sessions, Logout & Revoked Offline Device Heartbeat', async () => {
    const { app, revokedTokens } = createTestHarness();
    const { bizAId } = await bootstrapTwoBusinesses(app);

    // Register Cashier A offline device
    const reg = await request(app)
      .post('/api/v1/devices/register')
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', bizAId)
      .send({
        deviceName: 'Cashier Counter Phone',
        deviceFingerprint: 'fp-cashier-counter-00001',
      });
    expect(reg.status).toBe(201);
    const deviceId = reg.body.data.device.id as string;

    // Active device heartbeat succeeds
    const hbOk = await request(app)
      .post(`/api/v1/devices/${deviceId}/heartbeat`)
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', bizAId);
    expect(hbOk.status).toBe(200);
    expect(hbOk.body.data.expiryWarning).toBe(false);

    // Owner A revokes device -> Cashier A heartbeat immediately returns 403 DEVICE_REVOKED with wipe directive
    const revDev = await request(app)
      .post(`/api/v1/devices/${deviceId}/revoke`)
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', bizAId);
    expect(revDev.status).toBe(200);

    const hbRevoked = await request(app)
      .post(`/api/v1/devices/${deviceId}/heartbeat`)
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', bizAId);
    expect(hbRevoked.status).toBe(403);
    expect(hbRevoked.body.error.details.reason).toBe('DEVICE_REVOKED');
    expect(hbRevoked.body.error.details.action).toBe('force_logout_and_wipe_local_db');

    // Global logout invalidates session immediately
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer jwt-outsider');
    expect(logoutRes.status).toBe(200);
    expect(
      (await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer jwt-outsider'))
        .status,
    ).toBe(401);

    // Explicitly revoked/expired JWT token rejected with 401
    revokedTokens.add('jwt-manager-a');
    expect(
      (
        await request(app)
          .get('/api/v1/tenant/check')
          .set('Authorization', 'Bearer jwt-manager-a')
          .set('X-Business-ID', bizAId)
      ).status,
    ).toBe(401);
  });

  it('4. Negative Suspended & Revoked Membership: instant cutoff even with unexpired JWT + invitation revocation', async () => {
    const { app, signedOutUsers } = createTestHarness();
    const { bizAId } = await bootstrapTwoBusinesses(app);

    // Pending invitation revocation blocks subsequent acceptance
    const inv = await request(app)
      .post('/api/v1/staff/invitations')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', bizAId)
      .send({ email: 'outsider@none.example', role: 'cashier' });
    const invId = inv.body.data.invitation.id as string;
    const invToken = inv.body.data.inviteToken as string;

    const revInv = await request(app)
      .post(`/api/v1/staff/invitations/${invId}/revoke`)
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', bizAId);
    expect(revInv.status).toBe(200);

    const acceptRevoked = await request(app)
      .post('/api/v1/staff/invitations/accept')
      .set('Authorization', 'Bearer jwt-outsider')
      .send({ token: invToken });
    expect(acceptRevoked.status).toBe(404);

    // Suspend Manager A -> blocks access even if JWT has not yet expired
    const suspendMgr = await request(app)
      .post('/api/v1/staff/11111111-1111-4111-8111-111111111102/suspend')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', bizAId);
    expect(suspendMgr.status).toBe(200);
    expect(suspendMgr.body.data.membership.status).toBe('suspended');

    // Simulate unexpired JWT surviving client cache (clear signedOutUsers to isolate DB membership check)
    signedOutUsers.delete('11111111-1111-4111-8111-111111111102');
    const suspendedAccess = await request(app)
      .get('/api/v1/tenant/check')
      .set('Authorization', 'Bearer jwt-manager-a')
      .set('X-Business-ID', bizAId);
    expect(suspendedAccess.status).toBe(403);

    // Owner reactivates suspended Manager A -> access restored
    const reactivateMgr = await request(app)
      .post('/api/v1/staff/11111111-1111-4111-8111-111111111102/reactivate')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', bizAId);
    expect(reactivateMgr.status).toBe(200);
    expect(
      (
        await request(app)
          .get('/api/v1/tenant/check')
          .set('Authorization', 'Bearer jwt-manager-a')
          .set('X-Business-ID', bizAId)
      ).status,
    ).toBe(200);

    // Permanent revocation cannot be reactivated without a fresh invitation
    await request(app)
      .post('/api/v1/staff/11111111-1111-4111-8111-111111111103/revoke')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', bizAId);
    signedOutUsers.delete('11111111-1111-4111-8111-111111111103');
    expect(
      (
        await request(app)
          .get('/api/v1/tenant/check')
          .set('Authorization', 'Bearer jwt-cashier-a')
          .set('X-Business-ID', bizAId)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/staff/11111111-1111-4111-8111-111111111103/reactivate')
          .set('Authorization', 'Bearer jwt-owner-a')
          .set('X-Business-ID', bizAId)
      ).status,
    ).toBe(404);
  });

  it('5. Negative Storage Access Isolation: blocks cross-tenant paths, path traversal, and Cashier scope violations', async () => {
    const { app } = createTestHarness();
    const { bizAId, bizBId } = await bootstrapTwoBusinesses(app);
    const entityId = randomUUID();

    // Owner B generates valid upload path inside Tenant B namespace
    const uploadB = await request(app)
      .post('/api/v1/storage/upload-url')
      .set('Authorization', 'Bearer jwt-owner-b')
      .set('X-Business-ID', bizBId)
      .send({
        entityType: 'expense',
        entityId,
        fileName: 'diesel-receipt.pdf',
        mimeType: 'application/pdf',
        byteSize: 4096,
      });
    expect(uploadB.status).toBe(201);
    const tenantBPath = uploadB.body.data.storagePath as string;
    expect(tenantBPath.startsWith(`${bizBId}/expense/`)).toBe(true);

    // Owner A attempting to download Tenant B's storage object MUST fail 403
    const crossDownload = await request(app)
      .post('/api/v1/storage/download-url')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', bizAId)
      .send({ bucket: 'festola-attachments', storagePath: tenantBPath });
    expect(crossDownload.status).toBe(403);

    // Path traversal attempt (`<bizAId>/../<bizBId>/...`) MUST fail 400
    const traversal = await request(app)
      .post('/api/v1/storage/download-url')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', bizAId)
      .send({
        bucket: 'festola-attachments',
        storagePath: `${bizAId}/../${bizBId}/expense/${entityId}/file.pdf`,
      });
    expect(traversal.status).toBe(400);

    // Cashier A blocked from uploading expense or business_logo, allowed receipt_pdf
    expect(
      (
        await request(app)
          .post('/api/v1/storage/upload-url')
          .set('Authorization', 'Bearer jwt-cashier-a')
          .set('X-Business-ID', bizAId)
          .send({
            entityType: 'expense',
            entityId,
            fileName: 'bill.pdf',
            mimeType: 'application/pdf',
            byteSize: 1024,
          })
      ).status,
    ).toBe(403);

    expect(
      (
        await request(app)
          .post('/api/v1/storage/upload-url')
          .set('Authorization', 'Bearer jwt-cashier-a')
          .set('X-Business-ID', bizAId)
          .send({
            entityType: 'receipt_pdf',
            entityId,
            fileName: 'REC-001.pdf',
            mimeType: 'application/pdf',
            byteSize: 2048,
          })
      ).status,
    ).toBe(201);
  });

  it('6. Negative Cross-Tenant Writes: Tenant A Owner cannot mutate Tenant B staff or devices', async () => {
    const { app } = createTestHarness();
    const { bizAId, bizBId } = await bootstrapTwoBusinesses(app);

    const devB = await request(app)
      .post('/api/v1/devices/register')
      .set('Authorization', 'Bearer jwt-owner-b')
      .set('X-Business-ID', bizBId)
      .send({
        deviceName: 'Beta POS',
        deviceFingerprint: 'fp-beta-pos-00001',
      });
    const devBId = devB.body.data.device.id as string;

    // Owner A tries to revoke Tenant B's device using Tenant A header -> 404 (invisible across tenant boundary)
    const crossRevokeDev = await request(app)
      .post(`/api/v1/devices/${devBId}/revoke`)
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', bizAId);
    expect(crossRevokeDev.status).toBe(404);

    // Owner A tries to suspend Tenant B's Owner using Tenant A header -> 404
    const crossSuspend = await request(app)
      .post('/api/v1/staff/22222222-2222-4222-8222-222222222201/suspend')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', bizAId);
    expect(crossSuspend.status).toBe(404);
  });

  it('7. Separated Privileged Platform-Admin Access, MFA Enforcement & Immutable Audit Logging', async () => {
    const { app, store } = createTestHarness('staging');
    const { bizAId } = await bootstrapTwoBusinesses(app);

    // Tenant Owner A CANNOT access /api/v1/platform-admin/*
    const tenantToAdmin = await request(app)
      .get('/api/v1/platform-admin/tenants')
      .set('Authorization', 'Bearer jwt-owner-a');
    expect(tenantToAdmin.status).toBe(403);

    // Platform Super Admin has ZERO implicit access to tenant routes
    const adminToTenant = await request(app)
      .get('/api/v1/businesses/current')
      .set('Authorization', 'Bearer jwt-platform-super-aal2')
      .set('X-Business-ID', bizAId);
    expect(adminToTenant.status).toBe(403);

    // Staging/Prod enforces MFA (aal2) for Platform Admin
    const noMfaAdmin = await request(app)
      .get('/api/v1/platform-admin/tenants')
      .set('Authorization', 'Bearer jwt-platform-super-no-mfa');
    expect(noMfaAdmin.status).toBe(403);
    expect(noMfaAdmin.body.error.details.reason).toBe('MFA_REQUIRED');

    // Support Read-Only can list metadata-only tenants (audited) but CANNOT suspend a tenant
    const supportList = await request(app)
      .get('/api/v1/platform-admin/tenants')
      .set('Authorization', 'Bearer jwt-platform-support-aal2');
    expect(supportList.status).toBe(200);
    expect(supportList.body.data.tenants.length).toBe(2);

    const supportSuspend = await request(app)
      .post(`/api/v1/platform-admin/tenants/${bizAId}/suspend`)
      .set('Authorization', 'Bearer jwt-platform-support-aal2')
      .send({ reason: 'Unauthorized suspend attempt' });
    expect(supportSuspend.status).toBe(403);

    // Super Admin suspend requires non-empty audit reason
    const missingReason = await request(app)
      .post(`/api/v1/platform-admin/tenants/${bizAId}/suspend`)
      .set('Authorization', 'Bearer jwt-platform-super-aal2')
      .send({ reason: 'no' });
    expect(missingReason.status).toBe(400);

    // Super Admin suspends Business Alpha with ticket & reason -> logged in platform_admin_audit_logs
    // and immediately cuts off Owner A's tenant access!
    const suspendRes = await request(app)
      .post(`/api/v1/platform-admin/tenants/${bizAId}/suspend`)
      .set('Authorization', 'Bearer jwt-platform-super-aal2')
      .send({ reason: 'Fraud investigation hold', supportTicketRef: 'OPS-2041' });
    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.data.tenant.status).toBe('suspended');

    const ownerAfterBizSuspend = await request(app)
      .get('/api/v1/tenant/check')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', bizAId);
    expect(ownerAfterBizSuspend.status).toBe(403);

    // Verify separated platform_admin_audit_logs recorded both the listing and suspension
    const adminAudit = await request(app)
      .get('/api/v1/platform-admin/audit-logs')
      .set('Authorization', 'Bearer jwt-platform-super-aal2');
    expect(adminAudit.status).toBe(200);
    const actions = (adminAudit.body.data.logs as PlatformAdminAuditLogRecord[]).map(
      (l) => l.action,
    );
    expect(actions).toContain('platform.tenants_listed');
    expect(actions).toContain('platform.tenant_suspended');
    expect(store.auditLogs.some((l) => l.action === 'platform.tenant_suspended')).toBe(false);
  });
});
