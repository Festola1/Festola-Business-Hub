import express, { type Express } from 'express';
import { loadServerEnv, type ServerEnv } from './config/env.ts';
import { createDbPool } from './lib/db.ts';
import { createFirebaseAuthVerifier } from './lib/firebase-admin.ts';
import { createSupabaseAuthVerifier, type AuthTokenVerifier } from './lib/supabase-admin.ts';
import {
  InMemoryIdempotencyRecordStore,
  PgIdempotencyRecordStore,
  type IdempotencyRecordStore,
} from './lib/tx.ts';
import { ApiError, errorHandler, notFoundHandler } from './middleware/error-handler.ts';
import {
  createRateLimitMiddleware,
  InMemorySlidingWindowRateLimiter,
  type RateLimiterStore,
} from './middleware/rate-limit.ts';
import { securityHeadersMiddleware } from './middleware/security-headers.ts';
import {
  createRequireAuthenticatedTenantContext,
  createRequireAuthenticatedUser,
  type TenantContextRequest,
} from './middleware/tenant-context.ts';
import { createBillingRouter, type RawBodyRequest } from './modules/billing/billing.routes.ts';
import { createPaystackGateway } from './modules/billing/paystack.gateway.ts';
import { createCatalogRouter } from './modules/catalog/catalog.routes.ts';
import { PgCommerceRepository } from './modules/commerce/commerce.pg-repository.ts';
import type { CommerceRepository } from './modules/commerce/commerce.repository.ts';
import { CommerceService } from './modules/commerce/commerce.service.ts';
import type { PaystackGatewayPort } from './modules/commerce/commerce.types.ts';
import type { DomainRouterDeps } from './modules/commerce/route-deps.ts';
import { createCustomersRouter } from './modules/customers/customers.routes.ts';
import { createExpensesRouter } from './modules/expenses/expenses.routes.ts';
import { createHealthRouter } from './modules/health/health.routes.ts';
import {
  PgIdentityRepository,
  type IdentityRepository,
} from './modules/identity/identity.repository.ts';
import { createIdentityRouter } from './modules/identity/identity.routes.ts';
import { createInventoryRouter } from './modules/inventory/inventory.routes.ts';
import { createLocationsRouter } from './modules/locations/locations.routes.ts';
import { createNotificationsRouter } from './modules/notifications/notifications.routes.ts';
import {
  PgPlatformAdminRepository,
  type PlatformAdminRepository,
} from './modules/platform-admin/platform-admin.repository.ts';
import { createPlatformAdminRouter } from './modules/platform-admin/platform-admin.routes.ts';
import { createReportsRouter } from './modules/reports/reports.routes.ts';
import { createSalesRouter } from './modules/sales/sales.routes.ts';
import { createStorageRouter } from './modules/storage/storage.routes.ts';
import {
  createSupabaseStorageSigner,
  type StorageUrlSigner,
} from './modules/storage/storage.service.ts';
import { createSyncRouter } from './modules/sync/sync.routes.ts';

export interface ApiAppDependencies {
  authVerifier?: AuthTokenVerifier | null;
  identityRepository?: IdentityRepository | null;
  platformAdminRepository?: PlatformAdminRepository | null;
  commerceRepository?: CommerceRepository | null;
  idempotencyStore?: IdempotencyRecordStore;
  storageSigner?: StorageUrlSigner | null;
  paystackGateway?: PaystackGatewayPort | null;
  rateLimiterStore?: RateLimiterStore;
  rateLimitMaxOverrides?: Partial<{
    standardRead: number;
    financialWrite: number;
    reports: number;
    syncPush: number;
    webhook: number;
  }>;
}

export function createApiApp(
  env: ServerEnv = loadServerEnv(),
  deps: ApiAppDependencies = {},
): Express {
  const app = express();

  const authVerifier: AuthTokenVerifier | null =
    deps.authVerifier !== undefined ? deps.authVerifier : createDefaultAuthVerifier(env);

  const storageSigner =
    deps.storageSigner !== undefined ? deps.storageSigner : createSupabaseStorageSigner(env);

  const paystackGateway =
    deps.paystackGateway !== undefined ? deps.paystackGateway : createPaystackGateway(env);

  let identityRepository: IdentityRepository | null =
    deps.identityRepository !== undefined ? deps.identityRepository : null;
  let platformAdminRepository: PlatformAdminRepository | null =
    deps.platformAdminRepository !== undefined ? deps.platformAdminRepository : null;
  let commerceRepository: CommerceRepository | null =
    deps.commerceRepository !== undefined ? deps.commerceRepository : null;
  let idempotencyStore: IdempotencyRecordStore =
    deps.idempotencyStore ?? new InMemoryIdempotencyRecordStore();

  if (
    deps.identityRepository === undefined ||
    deps.platformAdminRepository === undefined ||
    deps.commerceRepository === undefined
  ) {
    const dbPool = createDbPool(env);
    if (dbPool) {
      if (deps.identityRepository === undefined) {
        identityRepository = new PgIdentityRepository(dbPool);
      }
      if (deps.platformAdminRepository === undefined) {
        platformAdminRepository = new PgPlatformAdminRepository(dbPool);
      }
      if (deps.commerceRepository === undefined) {
        commerceRepository = new PgCommerceRepository(dbPool);
      }
      if (!deps.idempotencyStore) {
        idempotencyStore = new PgIdempotencyRecordStore(dbPool);
      }
    }
  }

  app.disable('x-powered-by');
  app.use(securityHeadersMiddleware);
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as RawBodyRequest).rawBody = buf;
      },
    }),
  );

  const v1Router = express.Router();
  v1Router.use(createHealthRouter(env));

  const requireUser = createRequireAuthenticatedUser(authVerifier, identityRepository);
  const requireTenant = createRequireAuthenticatedTenantContext(authVerifier, identityRepository);

  // Protected tenant boundary probe verifying server-side JWT + active business_memberships
  v1Router.get('/tenant/check', requireTenant, (req: TenantContextRequest, res) => {
    res.status(200).json({
      success: true,
      data: {
        businessId: req.tenantContext?.businessId,
        role: req.tenantContext?.role,
        subscriptionStatus: req.tenantContext?.subscriptionStatus,
      },
    });
  });

  const rateStore = deps.rateLimiterStore ?? new InMemorySlidingWindowRateLimiter();
  const overrides = deps.rateLimitMaxOverrides ?? {};

  const domainDeps: DomainRouterDeps = {
    requireUser,
    requireTenant,
    idempotencyStore,
    getService: () => {
      if (!commerceRepository) {
        throw new ApiError(
          503,
          'INTERNAL_SERVER_ERROR',
          'Database repository is not configured for this environment.',
        );
      }
      return new CommerceService(commerceRepository, {
        paystack: paystackGateway,
        paystackWebhookSecret: env.PAYSTACK_WEBHOOK_SECRET || env.PAYSTACK_SECRET_KEY,
      });
    },
    rateLimiters: {
      standardRead: createRateLimitMiddleware({
        bucketName: 'standard_read',
        maxRequests: overrides.standardRead ?? 300,
        windowMs: 60_000,
        store: rateStore,
      }),
      financialWrite: createRateLimitMiddleware({
        bucketName: 'financial_write',
        maxRequests: overrides.financialWrite ?? 120,
        windowMs: 60_000,
        store: rateStore,
      }),
      reports: createRateLimitMiddleware({
        bucketName: 'reports',
        maxRequests: overrides.reports ?? 30,
        windowMs: 60_000,
        store: rateStore,
      }),
      syncPush: createRateLimitMiddleware({
        bucketName: 'sync_push',
        maxRequests: overrides.syncPush ?? 30,
        windowMs: 60_000,
        store: rateStore,
      }),
      webhook: createRateLimitMiddleware({
        bucketName: 'paystack_webhook',
        maxRequests: overrides.webhook ?? 120,
        windowMs: 60_000,
        store: rateStore,
        keyGenerator: (req) => req.ip ?? 'webhook-client',
      }),
    },
  };

  // Existing Stages P-02b / 07 modules
  v1Router.use(createIdentityRouter(authVerifier, identityRepository));
  v1Router.use(createStorageRouter(authVerifier, identityRepository, storageSigner));
  v1Router.use(createPlatformAdminRouter(authVerifier, platformAdminRepository, env));

  // Stage 08 MVP Domain API modules (Release 2 tables strictly excluded)
  v1Router.use(createLocationsRouter(domainDeps));
  v1Router.use(createCatalogRouter(domainDeps));
  v1Router.use(createInventoryRouter(domainDeps));
  v1Router.use(createSalesRouter(domainDeps));
  v1Router.use(createCustomersRouter(domainDeps));
  v1Router.use(createExpensesRouter(domainDeps));
  v1Router.use(createReportsRouter(domainDeps));
  v1Router.use(createBillingRouter(domainDeps));
  v1Router.use(createSyncRouter(domainDeps));
  v1Router.use(createNotificationsRouter(domainDeps));

  v1Router.use(notFoundHandler);

  app.use('/api/v1', v1Router);
  app.use('/api', errorHandler);

  return app;
}

function createDefaultAuthVerifier(env: ServerEnv): AuthTokenVerifier | null {
  const supabaseVerifier = createSupabaseAuthVerifier(env);
  const firebaseVerifier = createFirebaseAuthVerifier();

  if (supabaseVerifier && firebaseVerifier) {
    return {
      async verifyAccessToken(accessToken: string) {
        const supabaseUser = await supabaseVerifier.verifyAccessToken(accessToken);
        if (supabaseUser) {
          return supabaseUser;
        }
        return firebaseVerifier.verifyAccessToken(accessToken);
      },
      async signOutUser(userId: string) {
        await supabaseVerifier.signOutUser?.(userId);
      },
    };
  }

  return supabaseVerifier ?? firebaseVerifier;
}
