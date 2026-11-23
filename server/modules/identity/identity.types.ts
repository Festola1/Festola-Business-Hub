import { z } from 'zod';

export type BusinessRole = 'owner' | 'manager' | 'cashier';
export type InvitableRole = 'manager' | 'cashier';
export type MembershipStatus = 'active' | 'suspended' | 'revoked';
export type SubscriptionStatus = 'trialing' | 'active' | 'grace_period' | 'read_only' | 'cancelled';
export type TaxMode = 'exclusive' | 'inclusive';
export type DeviceStatus = 'active' | 'revoked';

export interface UserProfileRecord {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  acceptedTermsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessRecord {
  id: string;
  name: string;
  slug: string;
  currencyCode: string;
  timezone: string;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
  taxId: string | null;
  taxEnabled: boolean;
  taxMode: TaxMode;
  taxRate: string;
  allowNegativeStock: boolean;
  receiptFooter: string | null;
  status: 'active' | 'suspended' | 'deletion_pending';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessLocationRecord {
  id: string;
  businessId: string;
  name: string;
  address: string | null;
  phone: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPlanLimits {
  planId: string;
  planCode: string;
  displayName: string;
  maxStaff: number;
  maxProducts: number;
  maxOfflineDevices: number;
}

export interface BusinessSubscriptionRecord {
  id: string;
  businessId: string;
  planId: string;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  graceEndsAt: string | null;
  limits: SubscriptionPlanLimits;
}

export interface BusinessMembershipRecord {
  id: string;
  businessId: string;
  userId: string;
  role: BusinessRole;
  status: MembershipStatus;
  email?: string;
  fullName?: string;
  invitedBy: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffInvitationRecord {
  id: string;
  businessId: string;
  email: string;
  role: InvitableRole;
  tokenHash: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  invitedBy: string;
  expiresAt: string;
  acceptedBy: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

export interface RegisteredDeviceRecord {
  id: string;
  businessId: string;
  userId: string;
  deviceCode: string;
  deviceFingerprintHash: string;
  deviceName: string;
  status: DeviceStatus;
  lastVerifiedAt: string;
  offlineExpiresAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  businessId: string;
  actorUserId: string | null;
  actorRole: BusinessRole | 'system' | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ActiveTenantMembership {
  businessId: string;
  businessName: string;
  userId: string;
  role: BusinessRole;
  membershipStatus: MembershipStatus;
  subscriptionStatus: SubscriptionStatus;
  limits: SubscriptionPlanLimits;
  defaultLocationId: string;
}

// ============================================================================
// Zod Request Validation Schemas
// ============================================================================

export const UpdateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(6).max(32).nullable().optional(),
  acceptTerms: z.boolean().optional(),
});

export const CreateBusinessSchema = z.object({
  name: z.string().trim().min(2).max(120),
  currencyCode: z
    .string()
    .trim()
    .length(3)
    .transform((v) => v.toUpperCase())
    .default('NGN'),
  timezone: z.string().trim().min(3).max(64).default('Africa/Lagos'),
  phone: z.string().trim().min(6).max(32).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  locationName: z.string().trim().min(2).max(100).default('Main Store'),
});

export const UpdateBusinessSettingsSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().min(6).max(32).nullable().optional(),
    address: z.string().trim().max(300).nullable().optional(),
    taxId: z.string().trim().max(64).nullable().optional(),
    taxEnabled: z.boolean().optional(),
    taxMode: z.enum(['exclusive', 'inclusive']).optional(),
    taxRate: z.number().min(0).max(100).optional(),
    allowNegativeStock: z.boolean().optional(),
    receiptFooter: z.string().trim().max(300).nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.taxEnabled === true && data.taxRate !== undefined && data.taxRate <= 0) {
        return false;
      }
      return true;
    },
    { message: 'taxRate must be greater than 0 when taxEnabled is true.', path: ['taxRate'] },
  );

export const InviteStaffSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((v) => v.toLowerCase()),
  role: z.enum(['manager', 'cashier']),
});

export const AcceptInvitationSchema = z.object({
  token: z.string().trim().min(20).max(256),
});

export const UpdateStaffRoleSchema = z.object({
  role: z.enum(['manager', 'cashier']),
});

export const RegisterDeviceSchema = z.object({
  deviceName: z.string().trim().min(2).max(100),
  deviceFingerprint: z.string().trim().min(16).max(256),
});

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
