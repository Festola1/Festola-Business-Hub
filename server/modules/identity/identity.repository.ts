import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { DbPoolHandle } from '../../lib/db.ts';
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
  SubscriptionPlanLimits,
  SubscriptionStatus,
  TaxMode,
  UserProfileRecord,
} from './identity.types.ts';

export interface CreateBusinessRepoInput {
  userId: string;
  name: string;
  slug: string;
  currencyCode: string;
  timezone: string;
  phone: string | null;
  address: string | null;
  locationName: string;
}

export interface UpdateBusinessSettingsRepoInput {
  name?: string;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  taxEnabled?: boolean;
  taxMode?: TaxMode;
  taxRate?: number;
  allowNegativeStock?: boolean;
  receiptFooter?: string | null;
}

export interface CreateAuditLogInput {
  businessId: string;
  actorUserId: string | null;
  actorRole: BusinessRole | 'system' | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata?: Record<string, unknown>;
}

export interface PendingInvitationLookup {
  id: string;
  businessId: string;
  email: string;
  role: InvitableRole;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
}

export interface IdentityRepository {
  ensureUserProfile(input: {
    id: string;
    email: string;
    fullName: string;
  }): Promise<UserProfileRecord>;

  updateUserProfile(
    userId: string,
    patch: { fullName?: string; phone?: string | null; acceptTerms?: boolean },
  ): Promise<UserProfileRecord>;

  listUserActiveMemberships(userId: string): Promise<ActiveTenantMembership[]>;

  getActiveTenantMembership(
    userId: string,
    businessId: string,
  ): Promise<ActiveTenantMembership | null>;

  createBusinessWithDefaults(input: CreateBusinessRepoInput): Promise<{
    business: BusinessRecord;
    defaultLocation: BusinessLocationRecord;
    subscription: BusinessSubscriptionRecord;
    membership: BusinessMembershipRecord;
  }>;

  getBusinessWithDefaults(
    businessId: string,
    actorUserId: string,
  ): Promise<{
    business: BusinessRecord;
    defaultLocation: BusinessLocationRecord;
    subscription: BusinessSubscriptionRecord;
  } | null>;

  updateBusinessSettings(
    businessId: string,
    actorUserId: string,
    actorRole: BusinessRole,
    patch: UpdateBusinessSettingsRepoInput,
  ): Promise<BusinessRecord>;

  listStaffMembers(businessId: string, actorUserId: string): Promise<BusinessMembershipRecord[]>;

  countActiveStaff(businessId: string, actorUserId: string): Promise<number>;

  createStaffInvitation(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    email: string;
    role: InvitableRole;
    tokenHash: string;
    expiresAt: string;
  }): Promise<StaffInvitationRecord>;

  listPendingInvitations(businessId: string, actorUserId: string): Promise<StaffInvitationRecord[]>;

  lookupInvitationByTokenHash(tokenHash: string): Promise<PendingInvitationLookup | null>;

  acceptStaffInvitation(input: {
    invitationId: string;
    businessId: string;
    userId: string;
    role: InvitableRole;
  }): Promise<BusinessMembershipRecord>;

  updateStaffRole(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    targetUserId: string;
    newRole: InvitableRole;
  }): Promise<BusinessMembershipRecord | null>;

  revokeStaffMember(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    targetUserId: string;
  }): Promise<{ membership: BusinessMembershipRecord; revokedDevicesCount: number } | null>;

  listRegisteredDevices(businessId: string, actorUserId: string): Promise<RegisteredDeviceRecord[]>;

  countActiveDevices(businessId: string, actorUserId: string): Promise<number>;

  registerDevice(input: {
    businessId: string;
    userId: string;
    actorRole: BusinessRole;
    deviceCode: string;
    deviceFingerprintHash: string;
    deviceName: string;
    offlineExpiresAt: string;
  }): Promise<RegisteredDeviceRecord>;

  revokeDevice(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    deviceId: string;
  }): Promise<RegisteredDeviceRecord | null>;

  revokeInvitation(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    invitationId: string;
  }): Promise<StaffInvitationRecord | null>;

  suspendStaffMember(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    targetUserId: string;
  }): Promise<{ membership: BusinessMembershipRecord; revokedDevicesCount: number } | null>;

  reactivateStaffMember(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    targetUserId: string;
  }): Promise<BusinessMembershipRecord | null>;

  heartbeatDevice(input: {
    businessId: string;
    userId: string;
    deviceId: string;
    offlineExpiresAt: string;
  }): Promise<{ device: RegisteredDeviceRecord; status: 'active' | 'revoked' } | null>;

  listAuditLogs(
    businessId: string,
    actorUserId: string,
    limit: number,
    offset: number,
  ): Promise<AuditLogRecord[]>;
}

async function insertAuditLogTx(client: PoolClient, input: CreateAuditLogInput): Promise<void> {
  await client.query(
    `INSERT INTO public.audit_logs (
      business_id, actor_user_id, actor_role, action, entity_type, entity_id, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      input.businessId,
      input.actorUserId,
      input.actorRole,
      input.action,
      input.entityType,
      input.entityId,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

function mapBusinessRow(row: Record<string, unknown>): BusinessRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    currencyCode: String(row.currency_code).trim(),
    timezone: String(row.timezone),
    phone: row.phone ? String(row.phone) : null,
    address: row.address ? String(row.address) : null,
    logoUrl: row.logo_url ? String(row.logo_url) : null,
    taxId: row.tax_id ? String(row.tax_id) : null,
    taxEnabled: Boolean(row.tax_enabled),
    taxMode: String(row.tax_mode) as TaxMode,
    taxRate: String(row.tax_rate),
    allowNegativeStock: Boolean(row.allow_negative_stock),
    receiptFooter: row.receipt_footer ? String(row.receipt_footer) : null,
    status: String(row.status) as BusinessRecord['status'],
    createdBy: String(row.created_by),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapLocationRow(row: Record<string, unknown>): BusinessLocationRecord {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    name: String(row.name),
    address: row.address ? String(row.address) : null,
    phone: row.phone ? String(row.phone) : null,
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapMembershipRow(row: Record<string, unknown>): BusinessMembershipRecord {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    userId: String(row.user_id),
    role: String(row.role) as BusinessRole,
    status: String(row.status) as BusinessMembershipRecord['status'],
    email: row.email ? String(row.email) : undefined,
    fullName: row.full_name ? String(row.full_name) : undefined,
    invitedBy: row.invited_by ? String(row.invited_by) : null,
    revokedAt: row.revoked_at ? new Date(String(row.revoked_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapDeviceRow(row: Record<string, unknown>): RegisteredDeviceRecord {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    userId: String(row.user_id),
    deviceCode: String(row.device_code),
    deviceFingerprintHash: String(row.device_fingerprint_hash),
    deviceName: String(row.device_name),
    status: String(row.status) as RegisteredDeviceRecord['status'],
    lastVerifiedAt: new Date(String(row.last_verified_at)).toISOString(),
    offlineExpiresAt: new Date(String(row.offline_expires_at)).toISOString(),
    revokedAt: row.revoked_at ? new Date(String(row.revoked_at)).toISOString() : null,
    revokedBy: row.revoked_by ? String(row.revoked_by) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapInvitationRow(row: Record<string, unknown>): StaffInvitationRecord {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    email: String(row.email),
    role: String(row.role) as InvitableRole,
    tokenHash: String(row.token_hash),
    status: String(row.status) as StaffInvitationRecord['status'],
    invitedBy: String(row.invited_by),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    acceptedBy: row.accepted_by ? String(row.accepted_by) : null,
    acceptedAt: row.accepted_at ? new Date(String(row.accepted_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapProfileRow(row: Record<string, unknown>): UserProfileRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    fullName: String(row.full_name),
    phone: row.phone ? String(row.phone) : null,
    acceptedTermsAt: row.accepted_terms_at
      ? new Date(String(row.accepted_terms_at)).toISOString()
      : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapSubscriptionRow(row: Record<string, unknown>): BusinessSubscriptionRecord {
  const limits: SubscriptionPlanLimits = {
    planId: String(row.plan_id),
    planCode: String(row.plan_code),
    displayName: String(row.plan_display_name),
    maxStaff: Number(row.max_staff),
    maxProducts: Number(row.max_products),
    maxOfflineDevices: Number(row.max_offline_devices),
  };

  return {
    id: String(row.id),
    businessId: String(row.business_id),
    planId: String(row.plan_id),
    status: String(row.status) as SubscriptionStatus,
    trialEndsAt: row.trial_ends_at ? new Date(String(row.trial_ends_at)).toISOString() : null,
    currentPeriodStart: new Date(String(row.current_period_start)).toISOString(),
    currentPeriodEnd: new Date(String(row.current_period_end)).toISOString(),
    graceEndsAt: row.grace_ends_at ? new Date(String(row.grace_ends_at)).toISOString() : null,
    limits,
  };
}

export class PgIdentityRepository implements IdentityRepository {
  private readonly db: DbPoolHandle;

  constructor(db: DbPoolHandle) {
    this.db = db;
  }

  async ensureUserProfile(input: {
    id: string;
    email: string;
    fullName: string;
  }): Promise<UserProfileRecord> {
    return this.db.withUserTransaction(input.id, async (client) => {
      const result = await client.query(
        `INSERT INTO public.user_profiles (id, email, full_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
         RETURNING *`,
        [input.id, input.email.toLowerCase(), input.fullName],
      );
      return mapProfileRow(result.rows[0] as Record<string, unknown>);
    });
  }

  async updateUserProfile(
    userId: string,
    patch: { fullName?: string; phone?: string | null; acceptTerms?: boolean },
  ): Promise<UserProfileRecord> {
    return this.db.withUserTransaction(userId, async (client) => {
      const result = await client.query(
        `UPDATE public.user_profiles
         SET full_name = COALESCE($2, full_name),
             phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
             accepted_terms_at = CASE
               WHEN $5::boolean AND accepted_terms_at IS NULL THEN now()
               ELSE accepted_terms_at
             END
         WHERE id = $1
         RETURNING *`,
        [
          userId,
          patch.fullName ?? null,
          patch.phone !== undefined,
          patch.phone ?? null,
          patch.acceptTerms === true,
        ],
      );
      return mapProfileRow(result.rows[0] as Record<string, unknown>);
    });
  }

  async listUserActiveMemberships(userId: string): Promise<ActiveTenantMembership[]> {
    return this.db.withUserTransaction(userId, async (client) => {
      const membershipsRes = await client.query(
        `SELECT business_id, role, status
         FROM public.business_memberships
         WHERE user_id = $1 AND status = 'active'
         ORDER BY created_at ASC`,
        [userId],
      );

      const memberships: ActiveTenantMembership[] = [];
      for (const row of membershipsRes.rows as Array<Record<string, unknown>>) {
        const businessId = String(row.business_id);
        const active = await this.getActiveTenantMembership(userId, businessId);
        if (active) {
          memberships.push(active);
        }
      }
      return memberships;
    });
  }

  async getActiveTenantMembership(
    userId: string,
    businessId: string,
  ): Promise<ActiveTenantMembership | null> {
    return this.db.withTenantTransaction(businessId, userId, async (client) => {
      const result = await client.query(
        `SELECT
           bm.business_id,
           b.name AS business_name,
           bm.user_id,
           bm.role,
           bm.status AS membership_status,
           bs.status AS subscription_status,
           sp.id AS plan_id,
           sp.code AS plan_code,
           sp.display_name AS plan_display_name,
           sp.max_staff,
           sp.max_products,
           sp.max_offline_devices,
           bl.id AS default_location_id
         FROM public.business_memberships bm
         INNER JOIN public.businesses b ON b.id = bm.business_id
         INNER JOIN public.business_subscriptions bs ON bs.business_id = bm.business_id
         INNER JOIN public.subscription_plans sp ON sp.id = bs.plan_id
         INNER JOIN public.business_locations bl
           ON bl.business_id = bm.business_id AND bl.is_active = true
         WHERE bm.business_id = $1
           AND bm.user_id = $2
           AND bm.status = 'active'
           AND b.status = 'active'
         LIMIT 1`,
        [businessId, userId],
      );

      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row) {
        return null;
      }

      return {
        businessId: String(row.business_id),
        businessName: String(row.business_name),
        userId: String(row.user_id),
        role: String(row.role) as BusinessRole,
        membershipStatus: String(
          row.membership_status,
        ) as ActiveTenantMembership['membershipStatus'],
        subscriptionStatus: String(row.subscription_status) as SubscriptionStatus,
        limits: {
          planId: String(row.plan_id),
          planCode: String(row.plan_code),
          displayName: String(row.plan_display_name),
          maxStaff: Number(row.max_staff),
          maxProducts: Number(row.max_products),
          maxOfflineDevices: Number(row.max_offline_devices),
        },
        defaultLocationId: String(row.default_location_id),
      };
    });
  }

  async createBusinessWithDefaults(input: CreateBusinessRepoInput) {
    const businessId = randomUUID();
    return this.db.withTenantTransaction(businessId, input.userId, async (client) => {
      const planRes = await client.query(
        `SELECT id, code, display_name, max_staff, max_products, max_offline_devices
         FROM public.subscription_plans
         WHERE code = 'free_trial_14d' AND is_active = true
         LIMIT 1`,
      );
      const planRow = planRes.rows[0] as Record<string, unknown> | undefined;
      if (!planRow) {
        throw new Error('Default free_trial_14d plan is missing from subscription_plans.');
      }

      const businessRes = await client.query(
        `INSERT INTO public.businesses (
          id, name, slug, currency_code, timezone, phone, address, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          businessId,
          input.name,
          input.slug,
          input.currencyCode,
          input.timezone,
          input.phone,
          input.address,
          input.userId,
        ],
      );

      const membershipRes = await client.query(
        `INSERT INTO public.business_memberships (
          business_id, user_id, role, status
        ) VALUES ($1, $2, 'owner', 'active')
        RETURNING *`,
        [businessId, input.userId],
      );

      await client.query(
        `INSERT INTO public.business_settings (business_id)
         VALUES ($1)
         ON CONFLICT (business_id) DO NOTHING`,
        [businessId],
      );

      const locationRes = await client.query(
        `INSERT INTO public.business_locations (
          business_id, name, address, phone, is_default, is_active
        ) VALUES ($1, $2, $3, $4, true, true)
        RETURNING *`,
        [businessId, input.locationName, input.address, input.phone],
      );

      const subRes = await client.query(
        `INSERT INTO public.business_subscriptions (
          business_id, plan_id, status, trial_ends_at, current_period_start, current_period_end
        ) VALUES ($1, $2, 'trialing', now() + interval '14 days', now(), now() + interval '14 days')
        RETURNING *`,
        [businessId, String(planRow.id)],
      );

      await insertAuditLogTx(client, {
        businessId,
        actorUserId: input.userId,
        actorRole: 'owner',
        action: 'business.created',
        entityType: 'business',
        entityId: businessId,
        metadata: {
          currencyCode: input.currencyCode,
          timezone: input.timezone,
          trialPlanCode: 'free_trial_14d',
        },
      });

      const subRow = subRes.rows[0] as Record<string, unknown>;
      return {
        business: mapBusinessRow(businessRes.rows[0] as Record<string, unknown>),
        defaultLocation: mapLocationRow(locationRes.rows[0] as Record<string, unknown>),
        subscription: mapSubscriptionRow({
          ...subRow,
          plan_code: planRow.code,
          plan_display_name: planRow.display_name,
          max_staff: planRow.max_staff,
          max_products: planRow.max_products,
          max_offline_devices: planRow.max_offline_devices,
        }),
        membership: mapMembershipRow(membershipRes.rows[0] as Record<string, unknown>),
      };
    });
  }

  async getBusinessWithDefaults(businessId: string, actorUserId: string) {
    return this.db.withTenantTransaction(businessId, actorUserId, async (client) => {
      const bizRes = await client.query(`SELECT * FROM public.businesses WHERE id = $1 LIMIT 1`, [
        businessId,
      ]);
      const locRes = await client.query(
        `SELECT * FROM public.business_locations WHERE business_id = $1 AND is_active = true LIMIT 1`,
        [businessId],
      );
      const subRes = await client.query(
        `SELECT bs.*, sp.code AS plan_code, sp.display_name AS plan_display_name,
                sp.max_staff, sp.max_products, sp.max_offline_devices
         FROM public.business_subscriptions bs
         INNER JOIN public.subscription_plans sp ON sp.id = bs.plan_id
         WHERE bs.business_id = $1
         LIMIT 1`,
        [businessId],
      );

      if (!bizRes.rows[0] || !locRes.rows[0] || !subRes.rows[0]) {
        return null;
      }

      return {
        business: mapBusinessRow(bizRes.rows[0] as Record<string, unknown>),
        defaultLocation: mapLocationRow(locRes.rows[0] as Record<string, unknown>),
        subscription: mapSubscriptionRow(subRes.rows[0] as Record<string, unknown>),
      };
    });
  }

  async updateBusinessSettings(
    businessId: string,
    actorUserId: string,
    actorRole: BusinessRole,
    patch: UpdateBusinessSettingsRepoInput,
  ): Promise<BusinessRecord> {
    return this.db.withTenantTransaction(businessId, actorUserId, async (client) => {
      const result = await client.query(
        `UPDATE public.businesses
         SET name = COALESCE($2, name),
             phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
             address = CASE WHEN $5::boolean THEN $6 ELSE address END,
             tax_id = CASE WHEN $7::boolean THEN $8 ELSE tax_id END,
             tax_enabled = COALESCE($9, tax_enabled),
             tax_mode = COALESCE($10, tax_mode),
             tax_rate = COALESCE($11, tax_rate),
             allow_negative_stock = COALESCE($12, allow_negative_stock),
             receipt_footer = CASE WHEN $13::boolean THEN $14 ELSE receipt_footer END
         WHERE id = $1
         RETURNING *`,
        [
          businessId,
          patch.name ?? null,
          patch.phone !== undefined,
          patch.phone ?? null,
          patch.address !== undefined,
          patch.address ?? null,
          patch.taxId !== undefined,
          patch.taxId ?? null,
          patch.taxEnabled ?? null,
          patch.taxMode ?? null,
          patch.taxRate ?? null,
          patch.allowNegativeStock ?? null,
          patch.receiptFooter !== undefined,
          patch.receiptFooter ?? null,
        ],
      );

      await insertAuditLogTx(client, {
        businessId,
        actorUserId,
        actorRole,
        action: 'business.settings_updated',
        entityType: 'business',
        entityId: businessId,
        metadata: { changedFields: Object.keys(patch) },
      });

      return mapBusinessRow(result.rows[0] as Record<string, unknown>);
    });
  }

  async listStaffMembers(
    businessId: string,
    actorUserId: string,
  ): Promise<BusinessMembershipRecord[]> {
    return this.db.withTenantTransaction(businessId, actorUserId, async (client) => {
      const res = await client.query(
        `SELECT bm.*, up.email, up.full_name
         FROM public.business_memberships bm
         LEFT JOIN public.user_profiles up ON up.id = bm.user_id
         WHERE bm.business_id = $1
         ORDER BY bm.created_at ASC`,
        [businessId],
      );
      return (res.rows as Array<Record<string, unknown>>).map(mapMembershipRow);
    });
  }

  async countActiveStaff(businessId: string, actorUserId: string): Promise<number> {
    return this.db.withTenantTransaction(businessId, actorUserId, async (client) => {
      const res = await client.query(
        `SELECT count(*)::int AS total
         FROM public.business_memberships
         WHERE business_id = $1 AND status = 'active'`,
        [businessId],
      );
      return Number((res.rows[0] as Record<string, unknown>).total);
    });
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
    return this.db.withTenantTransaction(input.businessId, input.actorUserId, async (client) => {
      const res = await client.query(
        `INSERT INTO public.staff_invitations (
          business_id, email, role, token_hash, status, invited_by, expires_at
        ) VALUES ($1, $2, $3, $4, 'pending', $5, $6)
        RETURNING *`,
        [
          input.businessId,
          input.email.toLowerCase(),
          input.role,
          input.tokenHash,
          input.actorUserId,
          input.expiresAt,
        ],
      );

      const invitation = mapInvitationRow(res.rows[0] as Record<string, unknown>);
      await insertAuditLogTx(client, {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        action: 'staff.invited',
        entityType: 'staff_invitation',
        entityId: invitation.id,
        metadata: { role: input.role },
      });

      return invitation;
    });
  }

  async listPendingInvitations(
    businessId: string,
    actorUserId: string,
  ): Promise<StaffInvitationRecord[]> {
    return this.db.withTenantTransaction(businessId, actorUserId, async (client) => {
      const res = await client.query(
        `SELECT * FROM public.staff_invitations
         WHERE business_id = $1 AND status = 'pending'
         ORDER BY created_at DESC`,
        [businessId],
      );
      return (res.rows as Array<Record<string, unknown>>).map(mapInvitationRow);
    });
  }

  async lookupInvitationByTokenHash(tokenHash: string): Promise<PendingInvitationLookup | null> {
    const res = await this.db.pool.query(
      `SELECT id, business_id, email, role, status, expires_at
       FROM public.staff_invitations
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash],
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      id: String(row.id),
      businessId: String(row.business_id),
      email: String(row.email),
      role: String(row.role) as InvitableRole,
      status: String(row.status) as PendingInvitationLookup['status'],
      expiresAt: new Date(String(row.expires_at)).toISOString(),
    };
  }

  async acceptStaffInvitation(input: {
    invitationId: string;
    businessId: string;
    userId: string;
    role: InvitableRole;
  }): Promise<BusinessMembershipRecord> {
    return this.db.withTenantTransaction(input.businessId, input.userId, async (client) => {
      await client.query(
        `UPDATE public.staff_invitations
         SET status = 'accepted', accepted_by = $2, accepted_at = now()
         WHERE id = $1 AND business_id = $3`,
        [input.invitationId, input.userId, input.businessId],
      );

      const memRes = await client.query(
        `INSERT INTO public.business_memberships (
          business_id, user_id, role, status
        ) VALUES ($1, $2, $3, 'active')
        ON CONFLICT (business_id, user_id)
        DO UPDATE SET role = EXCLUDED.role, status = 'active', revoked_at = NULL, revoked_by = NULL
        RETURNING *`,
        [input.businessId, input.userId, input.role],
      );

      const membership = mapMembershipRow(memRes.rows[0] as Record<string, unknown>);
      await insertAuditLogTx(client, {
        businessId: input.businessId,
        actorUserId: input.userId,
        actorRole: input.role,
        action: 'staff.invitation_accepted',
        entityType: 'business_membership',
        entityId: membership.id,
        metadata: { role: input.role },
      });

      return membership;
    });
  }

  async updateStaffRole(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    targetUserId: string;
    newRole: InvitableRole;
  }): Promise<BusinessMembershipRecord | null> {
    return this.db.withTenantTransaction(input.businessId, input.actorUserId, async (client) => {
      const res = await client.query(
        `UPDATE public.business_memberships
         SET role = $3
         WHERE business_id = $1 AND user_id = $2 AND role <> 'owner' AND status = 'active'
         RETURNING *`,
        [input.businessId, input.targetUserId, input.newRole],
      );
      if (!res.rows[0]) {
        return null;
      }

      const membership = mapMembershipRow(res.rows[0] as Record<string, unknown>);
      await insertAuditLogTx(client, {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        action: 'staff.role_updated',
        entityType: 'business_membership',
        entityId: membership.id,
        metadata: { targetUserId: input.targetUserId, newRole: input.newRole },
      });

      return membership;
    });
  }

  async revokeStaffMember(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    targetUserId: string;
  }): Promise<{ membership: BusinessMembershipRecord; revokedDevicesCount: number } | null> {
    return this.db.withTenantTransaction(input.businessId, input.actorUserId, async (client) => {
      const memRes = await client.query(
        `UPDATE public.business_memberships
         SET status = 'revoked', revoked_at = now(), revoked_by = $3
         WHERE business_id = $1 AND user_id = $2 AND role <> 'owner' AND status <> 'revoked'
         RETURNING *`,
        [input.businessId, input.targetUserId, input.actorUserId],
      );
      if (!memRes.rows[0]) {
        return null;
      }

      const devRes = await client.query(
        `UPDATE public.registered_devices
         SET status = 'revoked', revoked_at = now(), revoked_by = $3
         WHERE business_id = $1 AND user_id = $2 AND status = 'active'`,
        [input.businessId, input.targetUserId, input.actorUserId],
      );

      const membership = mapMembershipRow(memRes.rows[0] as Record<string, unknown>);
      const revokedDevicesCount = devRes.rowCount ?? 0;

      await insertAuditLogTx(client, {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        action: 'staff.revoked',
        entityType: 'business_membership',
        entityId: membership.id,
        metadata: { targetUserId: input.targetUserId, revokedDevicesCount },
      });

      return { membership, revokedDevicesCount };
    });
  }

  async listRegisteredDevices(
    businessId: string,
    actorUserId: string,
  ): Promise<RegisteredDeviceRecord[]> {
    return this.db.withTenantTransaction(businessId, actorUserId, async (client) => {
      const res = await client.query(
        `SELECT * FROM public.registered_devices
         WHERE business_id = $1
         ORDER BY created_at DESC`,
        [businessId],
      );
      return (res.rows as Array<Record<string, unknown>>).map(mapDeviceRow);
    });
  }

  async countActiveDevices(businessId: string, actorUserId: string): Promise<number> {
    return this.db.withTenantTransaction(businessId, actorUserId, async (client) => {
      const res = await client.query(
        `SELECT count(*)::int AS total
         FROM public.registered_devices
         WHERE business_id = $1 AND status = 'active'`,
        [businessId],
      );
      return Number((res.rows[0] as Record<string, unknown>).total);
    });
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
    return this.db.withTenantTransaction(input.businessId, input.userId, async (client) => {
      const res = await client.query(
        `INSERT INTO public.registered_devices (
          business_id, user_id, device_code, device_fingerprint_hash,
          device_name, status, last_verified_at, offline_expires_at
        ) VALUES ($1, $2, $3, $4, $5, 'active', now(), $6)
        RETURNING *`,
        [
          input.businessId,
          input.userId,
          input.deviceCode,
          input.deviceFingerprintHash,
          input.deviceName,
          input.offlineExpiresAt,
        ],
      );

      const device = mapDeviceRow(res.rows[0] as Record<string, unknown>);
      await insertAuditLogTx(client, {
        businessId: input.businessId,
        actorUserId: input.userId,
        actorRole: input.actorRole,
        action: 'device.registered',
        entityType: 'registered_device',
        entityId: device.id,
        metadata: { deviceCode: device.deviceCode, deviceName: device.deviceName },
      });

      return device;
    });
  }

  async revokeDevice(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    deviceId: string;
  }): Promise<RegisteredDeviceRecord | null> {
    return this.db.withTenantTransaction(input.businessId, input.actorUserId, async (client) => {
      const res = await client.query(
        `UPDATE public.registered_devices
         SET status = 'revoked', revoked_at = now(), revoked_by = $3
         WHERE business_id = $1 AND id = $2 AND status = 'active'
         RETURNING *`,
        [input.businessId, input.deviceId, input.actorUserId],
      );
      if (!res.rows[0]) {
        return null;
      }

      const device = mapDeviceRow(res.rows[0] as Record<string, unknown>);
      await insertAuditLogTx(client, {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        action: 'device.revoked',
        entityType: 'registered_device',
        entityId: device.id,
        metadata: { deviceCode: device.deviceCode },
      });

      return device;
    });
  }

  async revokeInvitation(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    invitationId: string;
  }): Promise<StaffInvitationRecord | null> {
    return this.db.withTenantTransaction(input.businessId, input.actorUserId, async (client) => {
      const res = await client.query(
        `UPDATE public.staff_invitations
         SET status = 'revoked', revoked_at = now()
         WHERE business_id = $1 AND id = $2 AND status = 'pending'
         RETURNING *`,
        [input.businessId, input.invitationId],
      );
      if (!res.rows[0]) {
        return null;
      }
      const invitation = mapInvitationRow(res.rows[0] as Record<string, unknown>);
      await insertAuditLogTx(client, {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        action: 'staff.invitation_revoked',
        entityType: 'staff_invitation',
        entityId: invitation.id,
        metadata: { email: invitation.email },
      });
      return invitation;
    });
  }

  async suspendStaffMember(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    targetUserId: string;
  }): Promise<{ membership: BusinessMembershipRecord; revokedDevicesCount: number } | null> {
    return this.db.withTenantTransaction(input.businessId, input.actorUserId, async (client) => {
      const memRes = await client.query(
        `UPDATE public.business_memberships
         SET status = 'suspended'
         WHERE business_id = $1 AND user_id = $2 AND role <> 'owner' AND status = 'active'
         RETURNING *`,
        [input.businessId, input.targetUserId],
      );
      if (!memRes.rows[0]) {
        return null;
      }

      const devRes = await client.query(
        `UPDATE public.registered_devices
         SET status = 'revoked', revoked_at = now(), revoked_by = $3
         WHERE business_id = $1 AND user_id = $2 AND status = 'active'`,
        [input.businessId, input.targetUserId, input.actorUserId],
      );

      const membership = mapMembershipRow(memRes.rows[0] as Record<string, unknown>);
      const revokedDevicesCount = devRes.rowCount ?? 0;

      await insertAuditLogTx(client, {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        action: 'staff.suspended',
        entityType: 'business_membership',
        entityId: membership.id,
        metadata: { targetUserId: input.targetUserId, revokedDevicesCount },
      });

      return { membership, revokedDevicesCount };
    });
  }

  async reactivateStaffMember(input: {
    businessId: string;
    actorUserId: string;
    actorRole: BusinessRole;
    targetUserId: string;
  }): Promise<BusinessMembershipRecord | null> {
    return this.db.withTenantTransaction(input.businessId, input.actorUserId, async (client) => {
      const memRes = await client.query(
        `UPDATE public.business_memberships
         SET status = 'active'
         WHERE business_id = $1 AND user_id = $2 AND role <> 'owner' AND status = 'suspended'
         RETURNING *`,
        [input.businessId, input.targetUserId],
      );
      if (!memRes.rows[0]) {
        return null;
      }

      const membership = mapMembershipRow(memRes.rows[0] as Record<string, unknown>);
      await insertAuditLogTx(client, {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        action: 'staff.reactivated',
        entityType: 'business_membership',
        entityId: membership.id,
        metadata: { targetUserId: input.targetUserId },
      });

      return membership;
    });
  }

  async heartbeatDevice(input: {
    businessId: string;
    userId: string;
    deviceId: string;
    offlineExpiresAt: string;
  }): Promise<{ device: RegisteredDeviceRecord; status: 'active' | 'revoked' } | null> {
    return this.db.withTenantTransaction(input.businessId, input.userId, async (client) => {
      const existingRes = await client.query(
        `SELECT * FROM public.registered_devices
         WHERE business_id = $1 AND id = $2 AND user_id = $3
         LIMIT 1`,
        [input.businessId, input.deviceId, input.userId],
      );
      if (!existingRes.rows[0]) {
        return null;
      }

      const existing = mapDeviceRow(existingRes.rows[0] as Record<string, unknown>);
      if (existing.status === 'revoked') {
        return { device: existing, status: 'revoked' };
      }

      const updatedRes = await client.query(
        `UPDATE public.registered_devices
         SET last_verified_at = now(), offline_expires_at = $4
         WHERE business_id = $1 AND id = $2 AND user_id = $3 AND status = 'active'
         RETURNING *`,
        [input.businessId, input.deviceId, input.userId, input.offlineExpiresAt],
      );
      const updated = mapDeviceRow(updatedRes.rows[0] as Record<string, unknown>);
      return { device: updated, status: 'active' };
    });
  }

  async listAuditLogs(
    businessId: string,
    actorUserId: string,
    limit: number,
    offset: number,
  ): Promise<AuditLogRecord[]> {
    return this.db.withTenantTransaction(businessId, actorUserId, async (client) => {
      const res = await client.query(
        `SELECT * FROM public.audit_logs
         WHERE business_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [businessId, limit, offset],
      );
      return (res.rows as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        businessId: String(row.business_id),
        actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
        actorRole: row.actor_role ? (String(row.actor_role) as AuditLogRecord['actorRole']) : null,
        action: String(row.action),
        entityType: String(row.entity_type),
        entityId: row.entity_id ? String(row.entity_id) : null,
        metadata: (row.metadata as Record<string, unknown>) ?? {},
        createdAt: new Date(String(row.created_at)).toISOString(),
      }));
    });
  }
}
