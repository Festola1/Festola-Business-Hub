import express, { type Router } from 'express';
import { asyncHandler, parseQuery, parseUuidParam, sendPaginated } from '../../lib/http.ts';
import { NotificationQuerySchema } from '../commerce/commerce.types.ts';
import type { DomainRouterDeps } from '../commerce/route-deps.ts';

/**
 * Approved Notifications router (D-12: In-App only via API; zero SMS/WhatsApp endpoints).
 */
export function createNotificationsRouter(deps: DomainRouterDeps): Router {
  const router = express.Router();

  router.get(
    '/notifications',
    deps.requireTenant,
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const query = parseQuery(NotificationQuerySchema, req.query);
      const page = await deps.getService().listNotifications(req.tenantContext!, query);
      sendPaginated(
        res,
        'notifications',
        page.items,
        {
          limit: query.limit,
          offset: query.offset,
          total: page.total,
        },
        { unreadCount: page.unreadCount },
      );
    }),
  );

  router.patch(
    '/notifications/:notificationId/read',
    deps.requireTenant,
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const notificationId = parseUuidParam(req.params.notificationId, 'notificationId');
      const notification = await deps
        .getService()
        .markNotificationRead(req.tenantContext!, notificationId);
      res.status(200).json({ success: true, data: { notification } });
    }),
  );

  router.post(
    '/notifications/mark-all-read',
    deps.requireTenant,
    deps.rateLimiters.standardRead,
    asyncHandler(async (req, res) => {
      const result = await deps.getService().markAllNotificationsRead(req.tenantContext!);
      res.status(200).json({ success: true, data: result });
    }),
  );

  return router;
}
