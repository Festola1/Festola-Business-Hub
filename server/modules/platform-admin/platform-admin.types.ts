import { z } from 'zod';
import type { PlatformAdminRole } from '../../lib/rbac.ts';

export interface PlatformAdminIdentity {
  userId: string;
  email: string;
  role: PlatformAdminRole;
  isActive: boolean;
}

/**
 * Strictly metadata-only tenant summary for isolated internal Platform Ops (C-03).
 * Never exposes tenant sales, POS line items, or end-customer PII.
 */
export interface PlatformTenantSummary {
  businessId: string;
  name: string;
  slug: string;
  currencyCode: string;
  status: 'active' | 'suspended' | 'deletion_pending';
  subscriptionStatus: string;
  planCode: string;
  activeStaffCount: number;
  activeDeviceCount: number;
  createdAt: string;
}

export interface PlatformAdminAuditLogRecord {
  id: string;
  adminUserId: string;
  adminRole: PlatformAdminRole;
  action: string;
  targetBusinessId: string | null;
  targetEntityType: string;
  targetEntityId: string | null;
  supportTicketRef: string | null;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const PlatformTenantActionSchema = z.object({
  reason: z.string().trim().min(5, 'Audit reason must be at least 5 characters.').max(300),
  supportTicketRef: z.string().trim().min(2).max(64).nullable().optional(),
});

export const PlatformListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  reason: z.string().trim().min(5).max(300).optional(),
  supportTicketRef: z.string().trim().min(2).max(64).optional(),
});
