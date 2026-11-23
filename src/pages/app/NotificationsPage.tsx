import { CheckCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
} from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import { getFriendlyApiError } from '../../lib/error-messages';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationCategory,
  type NotificationItem,
} from '../../lib/notifications-api';

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  low_stock: 'Low stock',
  sync_conflict: 'Sync conflict',
  subscription: 'Subscription',
  staff: 'Staff & access',
  system: 'System',
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Approved D-12 In-App Notifications Inbox.
 * Wired to Stage 08 GET /api/v1/notifications, PATCH /:id/read, and POST /mark-all-read.
 * Strictly In-App + Transactional Email only (zero SMS/WhatsApp controls).
 */
export default function NotificationsPage() {
  const { accessToken, activeMembership } = useAuth();
  const { pushToast } = useToast();

  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [reloadTick, setReloadTick] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !activeMembership) {
      return;
    }
    let cancelled = false;

    void fetchNotifications(accessToken, activeMembership.businessId, {
      unreadOnly: filter === 'unread',
      limit: 50,
      offset: 0,
    }).then((res) => {
      if (cancelled) {
        return;
      }
      if (!res.success || !res.data) {
        setErrorMessage(getFriendlyApiError(res.error, 'Unable to load notifications.'));
        setLoading(false);
        return;
      }

      setItems(res.data.notifications);
      setUnreadCount(res.data.unreadCount);
      setErrorMessage(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeMembership, filter, reloadTick]);

  const handleSelectFilter = (next: 'all' | 'unread') => {
    if (next === filter) {
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setFilter(next);
  };

  const handleRetry = () => {
    setLoading(true);
    setErrorMessage(null);
    setReloadTick((prev) => prev + 1);
  };

  const handleMarkRead = async (notificationId: string) => {
    if (!accessToken || !activeMembership) {
      return;
    }
    setMarkingId(notificationId);
    const res = await markNotificationRead(
      accessToken,
      activeMembership.businessId,
      notificationId,
    );
    setMarkingId(null);

    if (!res.success || !res.data) {
      pushToast(getFriendlyApiError(res.error, 'Unable to update notification.'), 'error');
      return;
    }

    const updated = res.data.notification;
    setItems((prev) =>
      filter === 'unread'
        ? prev.filter((item) => item.id !== updated.id)
        : prev.map((item) => (item.id === updated.id ? updated : item)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
    if (!accessToken || !activeMembership || unreadCount === 0) {
      return;
    }
    setMarkingAll(true);
    const res = await markAllNotificationsRead(accessToken, activeMembership.businessId);
    setMarkingAll(false);

    if (!res.success) {
      pushToast(getFriendlyApiError(res.error, 'Unable to mark notifications as read.'), 'error');
      return;
    }

    setUnreadCount(0);
    setItems((prev) =>
      filter === 'unread' ? [] : prev.map((item) => ({ ...item, isRead: true })),
    );
    pushToast('All notifications marked as read.', 'success');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={activeMembership?.businessName}
        title="Notifications"
        description="In-app alerts for low stock, offline sync conflicts, staff changes, and subscription notices."
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={unreadCount === 0 || loading}
            loading={markingAll}
            loadingLabel="Updating..."
            onClick={() => void handleMarkAllRead()}
          >
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            <span>Mark all read</span>
          </Button>
        }
      />

      {/* Filter Bar & Channel Policy Note (D-12) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Filter notifications" className="inline-flex gap-2">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            onClick={() => handleSelectFilter('all')}
            className={`min-h-[40px] rounded-lg border px-4 py-2 text-xs font-medium transition-colors ${
              filter === 'all'
                ? 'border-[#991B1B] bg-[#FEF2F2] text-[#991B1B]'
                : 'border-[#E4E4E7] bg-white text-[#52525B] hover:text-[#18181B]'
            }`}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'unread'}
            onClick={() => handleSelectFilter('unread')}
            className={`min-h-[40px] rounded-lg border px-4 py-2 text-xs font-medium transition-colors ${
              filter === 'unread'
                ? 'border-[#991B1B] bg-[#FEF2F2] text-[#991B1B]'
                : 'border-[#E4E4E7] bg-white text-[#52525B] hover:text-[#18181B]'
            }`}
          >
            Unread (<span className="font-mono-tabular">{unreadCount}</span>)
          </button>
        </div>

        <p className="text-xs text-[#52525B]">
          Delivery channels: In-app inbox · Transactional email
        </p>
      </div>

      {loading ? (
        <LoadingSkeleton rows={4} label="Loading notifications..." />
      ) : errorMessage ? (
        <ErrorState message={errorMessage} onRetry={handleRetry} />
      ) : items.length === 0 ? (
        <EmptyState
          title={filter === 'unread' ? 'No unread notifications' : 'Your inbox is clear'}
          description={
            filter === 'unread'
              ? 'You have reviewed every unread alert for this business.'
              : 'Operational alerts such as low stock, offline sync conflicts, and subscription reminders will appear here automatically.'
          }
          action={
            filter === 'unread' ? (
              <Button variant="secondary" size="sm" onClick={() => handleSelectFilter('all')}>
                View all notifications
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[#E4E4E7]">
            {items.map((item) => (
              <li
                key={item.id}
                className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5 ${
                  item.isRead ? 'bg-white' : 'bg-[#FEF2F2]/40'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[#52525B]">
                    <span className={item.isRead ? 'font-medium' : 'font-semibold text-[#991B1B]'}>
                      {item.isRead ? 'Read' : 'Unread'}
                    </span>{' '}
                    · {CATEGORY_LABELS[item.category]} ·{' '}
                    <span className="font-mono-tabular">{formatTimestamp(item.createdAt)}</span>
                  </p>
                  <h2 className="mt-1 text-sm font-semibold text-[#18181B]">{item.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-[#52525B]">{item.body}</p>
                </div>

                {!item.isRead && (
                  <div className="shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={markingId === item.id}
                      loadingLabel="Saving..."
                      onClick={() => void handleMarkRead(item.id)}
                    >
                      Mark read
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
