import type { DbPoolHandle } from '../../lib/db.ts';
import type { PlatformAdminRole } from '../../lib/rbac.ts';
import type {
  PlatformAdminAuditLogRecord,
  PlatformAdminIdentity,
  PlatformTenantSummary,
} from './platform-admin.types.ts';

export interface PlatformAdminAuditInput {
  adminUserId: string;
  adminRole: PlatformAdminRole;
  action: string;
  targetBusinessId: string | null;
  targetEntityType: string;
  targetEntityId: string | null;
  supportTicketRef: string | null;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface PlatformAdminRepository {
  getActivePlatformAdmin(userId: string): Promise<PlatformAdminIdentity | null>;

  listTenantSummaries(limit: number, offset: number): Promise<PlatformTenantSummary[]>;

  updateTenantStatus(input: {
    businessId: string;
    newStatus: 'active' | 'suspended';
    audit: PlatformAdminAuditInput;
  }): Promise<PlatformTenantSummary | null>;

  recordAuditLog(input: PlatformAdminAuditInput): Promise<PlatformAdminAuditLogRecord>;

  listAuditLogs(limit: number, offset: number): Promise<PlatformAdminAuditLogRecord[]>;
}

export class PgPlatformAdminRepository implements PlatformAdminRepository {
  private readonly db: DbPoolHandle;

  constructor(db: DbPoolHandle) {
    this.db = db;
  }

  async getActivePlatformAdmin(userId: string): Promise<PlatformAdminIdentity | null> {
    const res = await this.db.pool.query(
      `SELECT pa.user_id, up.email, pa.role, pa.is_active
       FROM public.platform_admins pa
       INNER JOIN public.user_profiles up ON up.id = pa.user_id
       WHERE pa.user_id = $1 AND pa.is_active = true
       LIMIT 1`,
      [userId],
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      userId: String(row.user_id),
      email: String(row.email),
      role: String(row.role) as PlatformAdminRole,
      isActive: Boolean(row.is_active),
    };
  }

  async listTenantSummaries(limit: number, offset: number): Promise<PlatformTenantSummary[]> {
    const res = await this.db.pool.query(
      `SELECT
         b.id AS business_id,
         b.name,
         b.slug,
         b.currency_code,
         b.status,
         bs.status AS subscription_status,
         sp.code AS plan_code,
         (SELECT count(*)::int FROM public.business_memberships bm WHERE bm.business_id = b.id AND bm.status = 'active') AS active_staff_count,
         (SELECT count(*)::int FROM public.registered_devices rd WHERE rd.business_id = b.id AND rd.status = 'active') AS active_device_count,
         b.created_at
       FROM public.businesses b
       INNER JOIN public.business_subscriptions bs ON bs.business_id = b.id
       INNER JOIN public.subscription_plans sp ON sp.id = bs.plan_id
       ORDER BY b.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    return (res.rows as Array<Record<string, unknown>>).map((row) => ({
      businessId: String(row.business_id),
      name: String(row.name),
      slug: String(row.slug),
      currencyCode: String(row.currency_code).trim(),
      status: String(row.status) as PlatformTenantSummary['status'],
      subscriptionStatus: String(row.subscription_status),
      planCode: String(row.plan_code),
      activeStaffCount: Number(row.active_staff_count),
      activeDeviceCount: Number(row.active_device_count),
      createdAt: new Date(String(row.created_at)).toISOString(),
    }));
  }

  async updateTenantStatus(input: {
    businessId: string;
    newStatus: 'active' | 'suspended';
    audit: PlatformAdminAuditInput;
  }): Promise<PlatformTenantSummary | null> {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const upd = await client.query(
        `UPDATE public.businesses
         SET status = $2
         WHERE id = $1 AND status <> 'deletion_pending'
         RETURNING id`,
        [input.businessId, input.newStatus],
      );
      if (!upd.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }

      await client.query(
        `INSERT INTO public.platform_admin_audit_logs (
          admin_user_id, admin_role, action, target_business_id,
          target_entity_type, target_entity_id, support_ticket_ref, reason, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          input.audit.adminUserId,
          input.audit.adminRole,
          input.audit.action,
          input.audit.targetBusinessId,
          input.audit.targetEntityType,
          input.audit.targetEntityId,
          input.audit.supportTicketRef,
          input.audit.reason,
          JSON.stringify(input.audit.metadata ?? {}),
        ],
      );

      await client.query('COMMIT');
      const summaries = await this.listTenantSummaries(100, 0);
      return summaries.find((s) => s.businessId === input.businessId) ?? null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordAuditLog(input: PlatformAdminAuditInput): Promise<PlatformAdminAuditLogRecord> {
    const res = await this.db.pool.query(
      `INSERT INTO public.platform_admin_audit_logs (
        admin_user_id, admin_role, action, target_business_id,
        target_entity_type, target_entity_id, support_ticket_ref, reason, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      RETURNING *`,
      [
        input.adminUserId,
        input.adminRole,
        input.action,
        input.targetBusinessId,
        input.targetEntityType,
        input.targetEntityId,
        input.supportTicketRef,
        input.reason,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const row = res.rows[0] as Record<string, unknown>;
    return {
      id: String(row.id),
      adminUserId: String(row.admin_user_id),
      adminRole: String(row.admin_role) as PlatformAdminRole,
      action: String(row.action),
      targetBusinessId: row.target_business_id ? String(row.target_business_id) : null,
      targetEntityType: String(row.target_entity_type),
      targetEntityId: row.target_entity_id ? String(row.target_entity_id) : null,
      supportTicketRef: row.support_ticket_ref ? String(row.support_ticket_ref) : null,
      reason: String(row.reason),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: new Date(String(row.created_at)).toISOString(),
    };
  }

  async listAuditLogs(limit: number, offset: number): Promise<PlatformAdminAuditLogRecord[]> {
    const res = await this.db.pool.query(
      `SELECT * FROM public.platform_admin_audit_logs
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return (res.rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      adminUserId: String(row.admin_user_id),
      adminRole: String(row.admin_role) as PlatformAdminRole,
      action: String(row.action),
      targetBusinessId: row.target_business_id ? String(row.target_business_id) : null,
      targetEntityType: String(row.target_entity_type),
      targetEntityId: row.target_entity_id ? String(row.target_entity_id) : null,
      supportTicketRef: row.support_ticket_ref ? String(row.support_ticket_ref) : null,
      reason: String(row.reason),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: new Date(String(row.created_at)).toISOString(),
    }));
  }
}
