import { apiRequest } from './api-client';

export type NotificationCategory =
  'low_stock' | 'sync_conflict' | 'subscription' | 'staff' | 'system';

export interface NotificationItem {
  id: string;
  businessId: string;
  recipientUserId: string;
  channel: 'in_app';
  category: NotificationCategory;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListData {
  notifications: NotificationItem[];
  unreadCount: number;
}

/**
 * Approved D-12 In-App Notifications API client.
 * Strictly In-App only (zero SMS or WhatsApp endpoints/controls).
 */
export function fetchNotifications(
  accessToken: string,
  businessId: string,
  options: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
) {
  const params = new URLSearchParams();
  if (options.unreadOnly) {
    params.set('unreadOnly', 'true');
  }
  params.set('limit', String(options.limit ?? 30));
  params.set('offset', String(options.offset ?? 0));

  return apiRequest<NotificationListData>(`/notifications?${params.toString()}`, {
    accessToken,
    businessId,
  });
}

export function markNotificationRead(
  accessToken: string,
  businessId: string,
  notificationId: string,
) {
  return apiRequest<{ notification: NotificationItem }>(`/notifications/${notificationId}/read`, {
    method: 'PATCH',
    accessToken,
    businessId,
  });
}

export function markAllNotificationsRead(accessToken: string, businessId: string) {
  return apiRequest<{ updatedCount: number }>('/notifications/mark-all-read', {
    method: 'POST',
    accessToken,
    businessId,
  });
}
