import express, { type NextFunction, type Response, type Router } from 'express';
import { requireWritableSubscription } from '../../lib/rbac.ts';
import type { AuthTokenVerifier } from '../../lib/supabase-admin.ts';
import { ApiError } from '../../middleware/error-handler.ts';
import {
  createRequireAuthenticatedTenantContext,
  type TenantContextRequest,
} from '../../middleware/tenant-context.ts';
import type { IdentityRepository } from '../identity/identity.repository.ts';
import {
  RequestDownloadUrlSchema,
  RequestUploadUrlSchema,
  StorageAuthorizationService,
  type StorageUrlSigner,
} from './storage.service.ts';

function asyncHandler(
  fn: (req: TenantContextRequest, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: TenantContextRequest, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch(next);
  };
}

export function createStorageRouter(
  authVerifier: AuthTokenVerifier | null,
  identityRepo: IdentityRepository | null,
  storageSigner: StorageUrlSigner | null,
): Router {
  const router = express.Router();
  const requireTenant = createRequireAuthenticatedTenantContext(authVerifier, identityRepo);

  const getService = (): StorageAuthorizationService => {
    if (!storageSigner) {
      throw new ApiError(
        403,
        'PERMISSION_DENIED',
        'Storage signing service is not configured; access denied by default.',
      );
    }
    return new StorageAuthorizationService(storageSigner);
  };

  router.post(
    '/storage/upload-url',
    requireTenant,
    requireWritableSubscription,
    asyncHandler(async (req, res) => {
      const parsed = RequestUploadUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
          .join('; ');
        throw new ApiError(400, 'VALIDATION_ERROR', message);
      }

      const data = await getService().authorizeUpload(req.tenantContext!, parsed.data);
      res.status(201).json({ success: true, data });
    }),
  );

  router.post(
    '/storage/download-url',
    requireTenant,
    asyncHandler(async (req, res) => {
      const parsed = RequestDownloadUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
          .join('; ');
        throw new ApiError(400, 'VALIDATION_ERROR', message);
      }

      const data = await getService().authorizeDownload(req.tenantContext!, parsed.data);
      res.status(200).json({ success: true, data });
    }),
  );

  return router;
}
