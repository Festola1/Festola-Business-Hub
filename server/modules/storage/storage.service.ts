import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ServerEnv } from '../../config/env.ts';
import { hasPermission } from '../../lib/rbac.ts';
import { ApiError } from '../../middleware/error-handler.ts';
import type { ActiveTenantMembership } from '../identity/identity.types.ts';

export const ALLOWED_STORAGE_BUCKETS = [
  'festola-attachments',
  'festola-receipts',
  'festola-logos',
] as const;

export type AllowedStorageBucket = (typeof ALLOWED_STORAGE_BUCKETS)[number];

export const ALLOWED_ENTITY_TYPES = [
  'expense',
  'product',
  'business_logo',
  'receipt_pdf',
  'restock_batch',
] as const;

export type StorageEntityType = (typeof ALLOWED_ENTITY_TYPES)[number];

const ALLOWED_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB cap (matches migration 0010 CHECK)
const SIGNED_URL_TTL_SECONDS = 120;

export const RequestUploadUrlSchema = z.object({
  entityType: z.enum(ALLOWED_ENTITY_TYPES),
  entityId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(160),
  mimeType: z.string().trim().min(3).max(128),
  byteSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export const RequestDownloadUrlSchema = z.object({
  bucket: z.enum(ALLOWED_STORAGE_BUCKETS),
  storagePath: z.string().trim().min(5).max(512),
});

export interface StorageUrlSigner {
  createSignedUploadUrl(
    bucket: AllowedStorageBucket,
    storagePath: string,
  ): Promise<{ signedUrl: string; expiresInSeconds: number }>;

  createSignedDownloadUrl(
    bucket: AllowedStorageBucket,
    storagePath: string,
    expiresInSeconds: number,
  ): Promise<{ signedUrl: string; expiresInSeconds: number }>;
}

export function createSupabaseStorageSigner(env: ServerEnv): StorageUrlSigner | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return {
    async createSignedUploadUrl(bucket, storagePath) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUploadUrl(storagePath);
      if (error || !data?.signedUrl) {
        throw new ApiError(502, 'INTERNAL_SERVER_ERROR', 'Failed to issue storage upload URL.');
      }
      return { signedUrl: data.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS };
    },

    async createSignedDownloadUrl(bucket, storagePath, expiresInSeconds) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, expiresInSeconds);
      if (error || !data?.signedUrl) {
        throw new ApiError(502, 'INTERNAL_SERVER_ERROR', 'Failed to issue storage download URL.');
      }
      return { signedUrl: data.signedUrl, expiresInSeconds };
    },
  };
}

function resolveBucketForEntity(entityType: StorageEntityType): AllowedStorageBucket {
  if (entityType === 'receipt_pdf') {
    return 'festola-receipts';
  }
  if (entityType === 'business_logo') {
    return 'festola-logos';
  }
  return 'festola-attachments';
}

function sanitizeFileName(rawName: string): string {
  if (rawName.includes('..') || rawName.includes('/') || rawName.includes('\\')) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'File name contains illegal path characters.');
  }
  const cleaned = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  if (!cleaned || cleaned.startsWith('.')) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'File name is invalid after sanitization.');
  }
  return cleaned;
}

/**
 * Validates that a requested storage object path strictly belongs to the verified
 * tenant's `<business_id>/...` namespace and contains zero traversal sequences.
 */
export function assertTenantScopedStoragePath(
  storagePath: string,
  verifiedBusinessId: string,
): { entityType: string } {
  const decoded = decodeURIComponent(storagePath);
  if (
    storagePath.startsWith('/') ||
    decoded.startsWith('/') ||
    storagePath.includes('\\') ||
    decoded.includes('\\') ||
    storagePath.includes('..') ||
    decoded.includes('..')
  ) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Storage path contains illegal traversal characters.',
    );
  }

  const segments = decoded.split('/').filter(Boolean);
  if (segments.length < 4) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Storage path format is invalid.');
  }

  const [prefixBusinessId, entityType] = segments;
  if (prefixBusinessId !== verifiedBusinessId) {
    throw new ApiError(
      403,
      'PERMISSION_DENIED',
      'Cross-tenant storage access denied: object path does not belong to your verified business.',
    );
  }

  return { entityType: entityType ?? '' };
}

export class StorageAuthorizationService {
  private readonly signer: StorageUrlSigner;

  constructor(signer: StorageUrlSigner) {
    this.signer = signer;
  }

  async authorizeUpload(
    tenant: ActiveTenantMembership,
    input: z.infer<typeof RequestUploadUrlSchema>,
  ) {
    if (!ALLOWED_MIME_TYPES.has(input.mimeType.toLowerCase())) {
      throw new ApiError(400, 'VALIDATION_ERROR', `Unsupported MIME type: ${input.mimeType}.`);
    }

    // Approved Stage 07 RBAC scoping for Storage uploads
    if (input.entityType === 'business_logo') {
      if (!hasPermission(tenant.role, 'settings.manage')) {
        throw new ApiError(
          403,
          'PERMISSION_DENIED',
          'Only the business Owner may upload or update the business logo.',
        );
      }
    } else if (input.entityType === 'receipt_pdf') {
      if (!hasPermission(tenant.role, 'receipts.view')) {
        throw new ApiError(403, 'PERMISSION_DENIED', 'Role cannot store receipt PDFs.');
      }
    } else if (!hasPermission(tenant.role, 'attachments.manage')) {
      throw new ApiError(
        403,
        'PERMISSION_DENIED',
        `Role lacks permission to upload ${input.entityType} attachments.`,
      );
    }

    const bucket = resolveBucketForEntity(input.entityType);
    const safeFileName = sanitizeFileName(input.fileName);
    const storagePath = `${tenant.businessId}/${input.entityType}/${input.entityId}/${randomUUID()}-${safeFileName}`;

    const signed = await this.signer.createSignedUploadUrl(bucket, storagePath);
    return {
      bucket,
      storagePath,
      signedUrl: signed.signedUrl,
      expiresInSeconds: signed.expiresInSeconds,
    };
  }

  async authorizeDownload(
    tenant: ActiveTenantMembership,
    input: z.infer<typeof RequestDownloadUrlSchema>,
  ) {
    const { entityType } = assertTenantScopedStoragePath(input.storagePath, tenant.businessId);

    // Cashiers may download only receipt PDFs or business logos for receipt rendering
    if (
      tenant.role === 'cashier' &&
      entityType !== 'receipt_pdf' &&
      entityType !== 'business_logo'
    ) {
      throw new ApiError(
        403,
        'PERMISSION_DENIED',
        'Cashier role may only access receipt PDFs and business logos.',
      );
    }

    const signed = await this.signer.createSignedDownloadUrl(
      input.bucket,
      input.storagePath,
      SIGNED_URL_TTL_SECONDS,
    );
    return {
      bucket: input.bucket,
      storagePath: input.storagePath,
      signedUrl: signed.signedUrl,
      expiresInSeconds: signed.expiresInSeconds,
    };
  }
}
