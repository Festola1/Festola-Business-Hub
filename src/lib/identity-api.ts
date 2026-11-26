import { apiRequest } from './api-client';
import type { ClientBusinessRole } from './permissions';

export type SubscriptionStatus = 'trialing' | 'active' | 'grace_period' | 'read_only' | 'cancelled';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  acceptedTermsAt: string | null;
}

export interface SubscriptionPlanLimits {
  planId: string;
  planCode: string;
  displayName: string;
  maxStaff: number;
  maxProducts: number;
  maxOfflineDevices: number;
}

export interface TenantMembershipSummary {
  businessId: string;
  businessName: string;
  userId: string;
  role: ClientBusinessRole;
  membershipStatus: 'active' | 'suspended' | 'revoked';
  subscriptionStatus: SubscriptionStatus;
  limits: SubscriptionPlanLimits;
  defaultLocationId: string;
}

export interface BusinessDetails {
  id: string;
  name: string;
  slug: string;
  currencyCode: string;
  timezone: string;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  taxEnabled: boolean;
  taxMode: 'exclusive' | 'inclusive';
  taxRate: string;
  allowNegativeStock: boolean;
  receiptFooter: string | null;
  status: string;
}

export interface BusinessLocation {
  id: string;
  businessId: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface BusinessSubscription {
  id: string;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string;
  graceEndsAt: string | null;
  limits: SubscriptionPlanLimits;
}

export interface SubscriptionUsageSummary {
  subscription: BusinessSubscription | null;
  status: SubscriptionStatus;
  staffCount: number;
  productCount: number;
  activeDeviceCount: number;
}

export interface StaffMember {
  id: string;
  businessId: string;
  userId: string;
  role: ClientBusinessRole;
  status: 'active' | 'suspended' | 'revoked';
  email?: string;
  fullName?: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface StaffInvitation {
  id: string;
  businessId: string;
  email: string;
  role: 'manager' | 'cashier';
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
  createdAt: string;
}

export interface RegisteredDevice {
  id: string;
  businessId: string;
  userId: string;
  deviceCode: string;
  deviceName: string;
  status: 'active' | 'revoked';
  lastVerifiedAt: string;
  offlineExpiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  actorUserId: string | null;
  actorRole: ClientBusinessRole | 'system' | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export function fetchMe(accessToken: string) {
  return apiRequest<{ profile: UserProfile; memberships: TenantMembershipSummary[] }>('/auth/me', {
    accessToken,
  });
}

export function updateProfile(
  accessToken: string,
  body: { fullName?: string; phone?: string | null; acceptTerms?: boolean },
) {
  return apiRequest<{ profile: UserProfile }>('/auth/me', {
    method: 'PUT',
    accessToken,
    body,
  });
}

export function createBusiness(
  accessToken: string,
  body: {
    name: string;
    currencyCode: string;
    timezone: string;
    phone?: string | null;
    address?: string | null;
    locationName: string;
  },
) {
  return apiRequest<{
    business: BusinessDetails;
    defaultLocation: BusinessLocation;
    subscription: BusinessSubscription;
  }>('/businesses', {
    method: 'POST',
    accessToken,
    body,
  });
}

export function acceptStaffInvitation(accessToken: string, token: string) {
  return apiRequest<{ membership: StaffMember }>('/staff/invitations/accept', {
    method: 'POST',
    accessToken,
    body: { token },
  });
}

export function fetchCurrentBusiness(accessToken: string, businessId: string) {
  return apiRequest<{
    business: BusinessDetails;
    defaultLocation: BusinessLocation;
    subscription: BusinessSubscription;
  }>('/businesses/current', {
    accessToken,
    businessId,
  });
}

export function updateBusinessSettings(
  accessToken: string,
  businessId: string,
  body: {
    name?: string;
    phone?: string | null;
    address?: string | null;
    taxId?: string | null;
    taxEnabled?: boolean;
    taxMode?: 'exclusive' | 'inclusive';
    taxRate?: number;
    allowNegativeStock?: boolean;
    receiptFooter?: string | null;
  },
) {
  return apiRequest<{ business: BusinessDetails }>('/businesses/current/settings', {
    method: 'PATCH',
    accessToken,
    businessId,
    body,
  });
}

export function fetchStaff(accessToken: string, businessId: string) {
  return apiRequest<{ members: StaffMember[]; pendingInvitations: StaffInvitation[] }>('/staff', {
    accessToken,
    businessId,
  });
}

export function inviteStaffMember(
  accessToken: string,
  businessId: string,
  body: { email: string; role: 'manager' | 'cashier' },
) {
  return apiRequest<{ invitation: StaffInvitation; inviteToken: string }>('/staff/invitations', {
    method: 'POST',
    accessToken,
    businessId,
    body,
  });
}

export function revokeStaffInvitation(
  accessToken: string,
  businessId: string,
  invitationId: string,
) {
  return apiRequest<{ invitation: StaffInvitation }>(`/staff/invitations/${invitationId}/revoke`, {
    method: 'POST',
    accessToken,
    businessId,
  });
}

export function updateStaffMemberRole(
  accessToken: string,
  businessId: string,
  userId: string,
  role: 'manager' | 'cashier',
) {
  return apiRequest<{ membership: StaffMember }>(`/staff/${userId}/role`, {
    method: 'PATCH',
    accessToken,
    businessId,
    body: { role },
  });
}

export function revokeStaffMember(accessToken: string, businessId: string, userId: string) {
  return apiRequest<{ membership: StaffMember; revokedDevicesCount: number }>(
    `/staff/${userId}/revoke`,
    {
      method: 'POST',
      accessToken,
      businessId,
    },
  );
}

export function fetchDevices(accessToken: string, businessId: string) {
  return apiRequest<{ devices: RegisteredDevice[] }>('/devices', {
    accessToken,
    businessId,
  });
}

export function registerCurrentDevice(
  accessToken: string,
  businessId: string,
  body: { deviceName: string; deviceFingerprint: string },
) {
  return apiRequest<{ device: RegisteredDevice }>('/devices/register', {
    method: 'POST',
    accessToken,
    businessId,
    body,
  });
}

export function revokeRegisteredDevice(accessToken: string, businessId: string, deviceId: string) {
  return apiRequest<{ device: RegisteredDevice }>(`/devices/${deviceId}/revoke`, {
    method: 'POST',
    accessToken,
    businessId,
  });
}

export function fetchAuditLogs(accessToken: string, businessId: string, limit = 50, offset = 0) {
  return apiRequest<{ logs: AuditLogItem[]; limit: number; offset: number }>(
    `/audit-logs?limit=${limit}&offset=${offset}`,
    {
      accessToken,
      businessId,
    },
  );
}

export function logoutSession(accessToken: string) {
  return apiRequest<{ signedOut: boolean }>('/auth/logout', {
    method: 'POST',
    accessToken,
  });
}

export function fetchLocations(accessToken: string, businessId: string) {
  return apiRequest<{ locations: BusinessLocation[] }>('/locations', {
    accessToken,
    businessId,
  });
}

export function updateLocation(
  accessToken: string,
  businessId: string,
  locationId: string,
  body: { name?: string; address?: string | null; phone?: string | null },
) {
  return apiRequest<{ location: BusinessLocation }>(`/locations/${locationId}`, {
    method: 'PATCH',
    accessToken,
    businessId,
    body,
  });
}

export function fetchCurrentSubscription(accessToken: string, businessId: string) {
  return apiRequest<SubscriptionUsageSummary>('/subscriptions/current', {
    accessToken,
    businessId,
  });
}
