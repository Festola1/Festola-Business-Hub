// @vitest-environment node
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadServerEnv } from '../../server/config/env.ts';
import { createApiApp } from '../../server/index.ts';
import type { AuthTokenVerifier, VerifiedAuthUser } from '../../server/lib/supabase-admin.ts';
import { InMemoryCommerceRepository } from '../../server/modules/commerce/commerce.repository.ts';
import type { PaystackGatewayPort } from '../../server/modules/commerce/commerce.types.ts';
import type { IdentityRepository } from '../../server/modules/identity/identity.repository.ts';
import type {
  ActiveTenantMembership,
  BusinessRole,
  SubscriptionStatus,
} from '../../server/modules/identity/identity.types.ts';

const BIZ_ALPHA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const LOC_ALPHA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const BIZ_BETA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const LOC_BETA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const DEV_ALPHA_ACTIVE = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const DEV_ALPHA_REVOKED = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';

const USER_OWNER_A = '11111111-1111-4111-8111-111111111101';
const USER_MANAGER_A = '11111111-1111-4111-8111-111111111102';
const USER_CASHIER_A = '11111111-1111-4111-8111-111111111103';
const USER_OWNER_B = '22222222-2222-4222-8222-222222222201';

const WEBHOOK_SECRET = 'test_paystack_webhook_secret_only';

function createStage08Harness(options?: {
  alphaSubscriptionStatus?: SubscriptionStatus;
  rateLimitMaxOverrides?: { standardRead?: number; financialWrite?: number };
}) {
  const commerceRepo = new InMemoryCommerceRepository();

  commerceRepo.seedBusinessConfig({
    businessId: BIZ_ALPHA,
    businessName: 'Alpha Retail Hub',
    currencyCode: 'NGN',
    taxEnabled: true,
    taxMode: 'exclusive',
    taxRate: '7.5000',
    allowNegativeStock: false,
    receiptFooter: 'Thank you for shopping at Alpha!',
    defaultLocationId: LOC_ALPHA,
    locationName: 'Alpha Main Store',
    locationAddress: '12 Adeola Odeku, Lagos',
    locationPhone: '+2348000000001',
  });

  commerceRepo.seedBusinessConfig({
    businessId: BIZ_BETA,
    businessName: 'Beta Provisions Ltd',
    currencyCode: 'NGN',
    taxEnabled: false,
    taxMode: 'exclusive',
    taxRate: '0.0000',
    allowNegativeStock: false,
    receiptFooter: null,
    defaultLocationId: LOC_BETA,
    locationName: 'Beta Store',
    locationAddress: null,
    locationPhone: null,
  });

  // Synthetic test paid tier (commercial names/NGN prices remain TBD until P-07)
  commerceRepo.seedPlan({
    id: '99999999-9999-4999-8999-999999999901',
    planCode: 'test_tier_tbd_1',
    displayName: 'Test Paid Tier (TBD)',
    billingInterval: 'monthly',
    priceAmount: '15000.00',
    currencyCode: 'NGN',
    maxStaff: 10,
    maxProducts: 1000,
    maxOfflineDevices: 5,
    isActive: true,
  });

  commerceRepo.seedDevice({
    id: DEV_ALPHA_ACTIVE,
    businessId: BIZ_ALPHA,
    userId: USER_CASHIER_A,
    deviceCode: 'A1B2',
    status: 'active',
    offlineExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });
  commerceRepo.seedDevice({
    id: DEV_ALPHA_REVOKED,
    businessId: BIZ_ALPHA,
    userId: USER_CASHIER_A,
    deviceCode: 'R9V0',
    status: 'revoked',
    offlineExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });

  const notifId = randomUUID();
  commerceRepo.seedNotification({
    id: notifId,
    businessId: BIZ_ALPHA,
    recipientUserId: USER_OWNER_A,
    channel: 'in_app',
    category: 'low_stock',
    title: 'Low stock alert',
    body: 'Item stock reached reorder level.',
    metadata: {},
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
  });

  const actors: Record<string, VerifiedAuthUser> = {
    'jwt-owner-a': {
      id: USER_OWNER_A,
      email: 'owner@alpha.example',
      fullName: 'Owner Alpha',
      emailConfirmedAt: '2026-11-01T00:00:00Z',
      aal: 'aal1',
    },
    'jwt-manager-a': {
      id: USER_MANAGER_A,
      email: 'manager@alpha.example',
      fullName: 'Manager Alpha',
      emailConfirmedAt: '2026-11-01T00:00:00Z',
      aal: 'aal1',
    },
    'jwt-cashier-a': {
      id: USER_CASHIER_A,
      email: 'cashier@alpha.example',
      fullName: 'Cashier Alpha',
      emailConfirmedAt: '2026-11-01T00:00:00Z',
      aal: 'aal1',
    },
    'jwt-owner-b': {
      id: USER_OWNER_B,
      email: 'owner@beta.example',
      fullName: 'Owner Beta',
      emailConfirmedAt: '2026-11-01T00:00:00Z',
      aal: 'aal1',
    },
  };

  const alphaSubStatus: SubscriptionStatus = options?.alphaSubscriptionStatus ?? 'trialing';

  const memberships = new Map<string, ActiveTenantMembership>();
  const makeMember = (
    businessId: string,
    businessName: string,
    defaultLocationId: string,
    userId: string,
    role: BusinessRole,
    subscriptionStatus: SubscriptionStatus,
  ): ActiveTenantMembership => ({
    businessId,
    businessName,
    userId,
    role,
    membershipStatus: 'active',
    subscriptionStatus,
    defaultLocationId,
    limits: {
      planId: '00000000-0000-4000-8000-000000000001',
      planCode: 'trial_14d',
      displayName: '14-Day Free Trial',
      maxStaff: 3,
      maxProducts: 250,
      maxOfflineDevices: 2,
    },
  });

  memberships.set(
    `${BIZ_ALPHA}:${USER_OWNER_A}`,
    makeMember(BIZ_ALPHA, 'Alpha Retail Hub', LOC_ALPHA, USER_OWNER_A, 'owner', alphaSubStatus),
  );
  memberships.set(
    `${BIZ_ALPHA}:${USER_MANAGER_A}`,
    makeMember(BIZ_ALPHA, 'Alpha Retail Hub', LOC_ALPHA, USER_MANAGER_A, 'manager', alphaSubStatus),
  );
  memberships.set(
    `${BIZ_ALPHA}:${USER_CASHIER_A}`,
    makeMember(BIZ_ALPHA, 'Alpha Retail Hub', LOC_ALPHA, USER_CASHIER_A, 'cashier', alphaSubStatus),
  );
  memberships.set(
    `${BIZ_BETA}:${USER_OWNER_B}`,
    makeMember(BIZ_BETA, 'Beta Provisions Ltd', LOC_BETA, USER_OWNER_B, 'owner', 'trialing'),
  );

  const authVerifier: AuthTokenVerifier = {
    async verifyAccessToken(token) {
      return actors[token] ?? null;
    },
  };

  // Minimal IdentityRepository stub sufficient for tenant-context middleware
  const identityRepository = {
    async ensureUserProfile(input: { id: string; email: string; fullName: string }) {
      const now = new Date().toISOString();
      return {
        id: input.id,
        email: input.email,
        fullName: input.fullName,
        phone: null,
        acceptedTermsAt: now,
        createdAt: now,
        updatedAt: now,
      };
    },
    async getActiveTenantMembership(userId: string, businessId: string) {
      return memberships.get(`${businessId}:${userId}`) ?? null;
    },
  } as unknown as IdentityRepository;

  const paystackGateway: PaystackGatewayPort = {
    async initializeTransaction(input) {
      return {
        authorizationUrl: `https://checkout.paystack.example/${input.reference}`,
        accessCode: 'ACC_TEST_123',
        reference: input.reference,
      };
    },
    async verifyTransaction(reference) {
      return {
        reference,
        status: 'success',
        amountKobo: 1_500_000n, // 15,000.00 NGN
        currencyCode: 'NGN',
        paidAt: '2026-11-20T10:00:00.000Z',
      };
    },
  };

  const app = createApiApp(
    loadServerEnv({
      NODE_ENV: 'test',
      APP_ENV: 'test',
      PAYSTACK_WEBHOOK_SECRET: WEBHOOK_SECRET,
    }),
    {
      authVerifier,
      identityRepository,
      commerceRepository: commerceRepo,
      paystackGateway,
      rateLimitMaxOverrides: options?.rateLimitMaxOverrides,
    },
  );

  return { app, commerceRepo, notifId };
}

describe('Stage 08 Versioned /api/v1 Endpoints, Atomic Financials, Idempotency & Security', () => {
  it('enforces D-02 single location, catalog validation, and strict cashier cost/WAC redaction', async () => {
    const { app } = createStage08Harness();

    // GET /locations returns single active location
    const locs = await request(app)
      .get('/api/v1/locations')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA);
    expect(locs.status).toBe(200);
    expect(locs.body.data.locations).toHaveLength(1);

    // POST /locations blocked in MVP per D-02
    const addLoc = await request(app)
      .post('/api/v1/locations')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .send({ name: 'Second Branch' });
    expect(addLoc.status).toBe(403);
    expect(addLoc.body.error.code).toBe('PERMISSION_DENIED');

    // PATCH /locations/:id allowed for Owner, blocked for Manager
    const patchMgr = await request(app)
      .patch(`/api/v1/locations/${LOC_ALPHA}`)
      .set('Authorization', 'Bearer jwt-manager-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .send({ name: 'Should Fail' });
    expect(patchMgr.status).toBe(403);

    const patchOwner = await request(app)
      .patch(`/api/v1/locations/${LOC_ALPHA}`)
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .send({ name: 'Alpha Flagship Store' });
    expect(patchOwner.status).toBe(200);
    expect(patchOwner.body.data.location.name).toBe('Alpha Flagship Store');

    // Create category + product (strict schema rejects injected unknown fields)
    const badProd = await request(app)
      .post('/api/v1/products')
      .set('Authorization', 'Bearer jwt-manager-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Injected Cost Product',
        sellingPrice: '1000.00',
        weightedAvgCost: '1.00', // forbidden client-injected field
      });
    expect(badProd.status).toBe(400);
    expect(badProd.body.error.code).toBe('VALIDATION_ERROR');

    const createdProd = await request(app)
      .post('/api/v1/products')
      .set('Authorization', 'Bearer jwt-manager-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({
        sku: 'SKU-RICE-50',
        name: 'Parboiled Rice 50kg',
        unit: 'bag',
        sellingPrice: '50000.00',
        costPrice: '40000.00',
        openingStock: '10.000',
        reorderLevel: '3.000',
        isTaxExempt: false,
      });
    expect(createdProd.status).toBe(201);
    const productId = createdProd.body.data.product.id;

    // Owner/Manager see costPrice & weightedAvgCost; Cashier MUST NOT see cost fields (D-09)
    const ownerView = await request(app)
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA);
    expect(ownerView.status).toBe(200);
    expect(ownerView.body.data.product.costPrice).toBe('40000.00');
    expect(ownerView.body.data.product.weightedAvgCost).toBe('40000.00');

    const cashierView = await request(app)
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', BIZ_ALPHA);
    expect(cashierView.status).toBe(200);
    expect(cashierView.body.data.product.sellingPrice).toBe('50000.00');
    expect(cashierView.body.data.product.costPrice).toBeUndefined();
    expect(cashierView.body.data.product.weightedAvgCost).toBeUndefined();
    expect(cashierView.body.data.product.lastPositiveWac).toBeUndefined();
  });

  it('computes Moving WAC on multi-item restocks, authoritative sale totals/tax, idempotency replay/conflict, and atomic rollback on failure', async () => {
    const { app, commerceRepo } = createStage08Harness();

    // Create taxable product (10 @ cost 500, sell 1000) and tax-exempt product (5 @ cost 200, sell 400)
    const p1Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({
        sku: 'TAX-01',
        name: 'Taxable Kettle',
        sellingPrice: '1000.00',
        costPrice: '500.00',
        openingStock: '10.000',
        isTaxExempt: false,
      });
    const p1Id = p1Res.body.data.product.id;

    const p2Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({
        sku: 'EXM-01',
        name: 'Exempt Basic Food',
        sellingPrice: '400.00',
        costPrice: '200.00',
        openingStock: '5.000',
        isTaxExempt: true,
      });
    const p2Id = p2Res.body.data.product.id;

    // Restock p1: +10 @ 700.00 => 20 units @ WAC 600.00 (D-04, D-11)
    const restockRes = await request(app)
      .post('/api/v1/restocks')
      .set('Authorization', 'Bearer jwt-manager-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({
        supplierNote: 'Lagos Wholesale Market',
        items: [{ productId: p1Id, quantityReceived: '10.000', unitCost: '700.00' }],
      });
    expect(restockRes.status).toBe(201);
    expect(restockRes.body.data.restock.totalCost).toBe('7000.00');
    expect(restockRes.body.data.restock.items[0].wacAfter).toBe('600.00');

    // Sale: 2x p1 (2000 + 7.5% VAT = 2150) + 1x p2 (400 exempt) => authoritative grand total = 2550.00
    // Submitting wrong payment total (2400.00) must be rejected by server!
    const badPaymentSale = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [
          { productId: p1Id, quantity: '2.000' },
          { productId: p2Id, quantity: '1.000' },
        ],
        payments: [{ method: 'cash', amount: '2400.00' }],
      });
    expect(badPaymentSale.status).toBe(400);
    expect(badPaymentSale.body.error.details.expectedTotal).toBe('2550.00');

    // Simulate mid-transaction failure -> MUST roll back stock deduction & receipt completely!
    commerceRepo.failAfterNextSaleInsert = true;
    const failedSale = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [
          { productId: p1Id, quantity: '2.000' },
          { productId: p2Id, quantity: '1.000' },
        ],
        payments: [{ method: 'cash', amount: '2550.00' }],
      });
    expect(failedSale.status).toBe(500);

    // Verify stock was completely rolled back to 20.000 and 0 sales committed
    const p1AfterFail = await request(app)
      .get(`/api/v1/products/${p1Id}`)
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA);
    expect(p1AfterFail.body.data.product.onHand).toBe('20.000');
    expect(commerceRepo.getAllSales(BIZ_ALPHA)).toHaveLength(0);

    // Now execute valid sale with Idempotency-Key
    const saleIdemKey = randomUUID();
    const saleBody = {
      items: [
        { productId: p1Id, quantity: '2.000' },
        { productId: p2Id, quantity: '1.000' },
      ],
      payments: [
        { method: 'cash', amount: '1550.00' },
        { method: 'transfer', amount: '1000.00' },
      ],
    };

    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', saleIdemKey)
      .send(saleBody);
    expect(saleRes.status).toBe(201);
    expect(saleRes.body.data.sale.totalAmount).toBe('2550.00');
    expect(saleRes.body.data.sale.taxAmount).toBe('150.00');
    expect(saleRes.body.data.sale.receipt.receiptNumber).toMatch(/^REC-\d{8}-0001$/);
    // Cashier must NOT see totalCogs or unitCostSnapshot
    expect(saleRes.body.data.sale.totalCogs).toBeUndefined();
    expect(saleRes.body.data.sale.items[0].unitCostSnapshot).toBeUndefined();

    // Replay exact same Idempotency-Key -> cached response, Idempotency-Replayed: true, NO second stock deduction
    const replayRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', saleIdemKey)
      .send(saleBody);
    expect(replayRes.status).toBe(201);
    expect(replayRes.headers['idempotency-replayed']).toBe('true');
    expect(replayRes.body.data.sale.id).toBe(saleRes.body.data.sale.id);

    const p1AfterReplay = await request(app)
      .get(`/api/v1/products/${p1Id}`)
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA);
    expect(p1AfterReplay.body.data.product.onHand).toBe('18.000'); // deducted once (20 - 2)

    // Reusing same Idempotency-Key with modified payload -> 409 IDEMPOTENCY_CONFLICT
    const conflictRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', saleIdemKey)
      .send({ ...saleBody, notes: 'Tampered payload' });
    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

    // Owner sees authoritative COGS = (2 * 600) + (1 * 200) = 1400.00
    const ownerSaleView = await request(app)
      .get(`/api/v1/sales/${saleRes.body.data.sale.id}`)
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA);
    expect(ownerSaleView.status).toBe(200);
    expect(ownerSaleView.body.data.sale.totalCogs).toBe('1400.00');
  });

  it('enforces D-15 debt-first returns (restock vs damaged), FIFO debt collection, expenses, and safe CSV reports', async () => {
    const { app } = createStage08Harness();

    // Create product (tax-exempt for clean numbers: 1000.00 each, cost 600.00, qty 10)
    const pRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: '=HYPERLINK("evil") Sugar Bag',
        sellingPrice: '1000.00',
        costPrice: '600.00',
        openingStock: '10.000',
        isTaxExempt: true,
      });
    const prodId = pRes.body.data.product.id;

    // Create customer
    const cRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({ fullName: 'Chidi Okafor', phone: '+2348011112222', creditLimit: '5000.00' });
    const custId = cRes.body.data.customer.id;

    // Sale of 3 units = 3000.00 (1000 cash + 2000 credit)
    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId: custId,
        items: [{ productId: prodId, quantity: '3.000' }],
        payments: [
          { method: 'cash', amount: '1000.00' },
          { method: 'credit', amount: '2000.00' },
        ],
      });
    expect(saleRes.status).toBe(201);
    const saleId = saleRes.body.data.sale.id;
    const saleItemId = saleRes.body.data.sale.items[0].id;

    // Cashier blocked from returns/voids (D-15)
    const cashierReturn = await request(app)
      .post(`/api/v1/sales/${saleId}/returns`)
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Customer changed mind',
        items: [{ saleItemId, quantity: '1.000', disposition: 'restock' }],
      });
    expect(cashierReturn.status).toBe(403);

    // Manager returns 2 units (2000.00 total) as DAMAGED => debt reduces by 2000.00, refund = 0.00, stock stays 7.000!
    const dmgReturn = await request(app)
      .post(`/api/v1/sales/${saleId}/returns`)
      .set('Authorization', 'Bearer jwt-manager-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Damaged seal on delivery',
        items: [{ saleItemId, quantity: '2.000', disposition: 'damaged' }],
      });
    expect(dmgReturn.status).toBe(201);
    expect(dmgReturn.body.data.saleReturn.debtReducedAmount).toBe('2000.00');
    expect(dmgReturn.body.data.saleReturn.refundAmount).toBe('0.00');

    const prodAfterDmg = await request(app)
      .get(`/api/v1/products/${prodId}`)
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA);
    expect(prodAfterDmg.body.data.product.onHand).toBe('7.000'); // damaged did NOT restock!

    // Second credit sale (1 unit = 1000.00 credit) -> collect 600.00 debt payment + reverse it
    const creditSale2 = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId: custId,
        items: [{ productId: prodId, quantity: '1.000' }],
        payments: [{ method: 'credit', amount: '1000.00' }],
      });
    expect(creditSale2.status).toBe(201);

    const debtPayRes = await request(app)
      .post(`/api/v1/customers/${custId}/debt-payments`)
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '600.00', method: 'transfer', referenceNote: 'NIP-12345' });
    expect(debtPayRes.status).toBe(201);
    expect(debtPayRes.body.data.debtPayment.receipt.receiptNumber).toMatch(/^DBT-\d{8}-0001$/);

    const custMid = await request(app)
      .get(`/api/v1/customers/${custId}`)
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA);
    expect(custMid.body.data.customer.outstandingBalance).toBe('400.00');

    // Expense posting & non-destructive reversal
    const expCat = await request(app)
      .post('/api/v1/expense-categories')
      .set('Authorization', 'Bearer jwt-manager-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({ name: 'Generator Fuel' });
    expect(expCat.status).toBe(201);

    const expRes = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', 'Bearer jwt-manager-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({
        categoryId: expCat.body.data.category.id,
        amount: '250.00',
        paymentMethod: 'cash',
        description: 'Diesel refill',
        incurredOn: '2026-11-20',
      });
    expect(expRes.status).toBe(201);

    // Reports & formula-injection-safe CSV export
    const summaryRes = await request(app)
      .get('/api/v1/reports/summary')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.summary.operatingExpenses).toBe('250.00');
    expect(summaryRes.body.data.summary.outstandingReceivables).toBe('400.00');

    const csvRes = await request(app)
      .get('/api/v1/reports/export?type=inventory')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA);
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('"\'=HYPERLINK(""evil"") Sugar Bag"');
  });

  it('enforces D-01 read_only subscription mode (blocks operational writes, allows reports/export/renewal) and D-07 Paystack HMAC webhooks', async () => {
    const { app } = createStage08Harness({ alphaSubscriptionStatus: 'read_only' });

    // Operational write blocked with 403 SUBSCRIPTION_LIMIT_REACHED
    const blockedExpCat = await request(app)
      .post('/api/v1/expense-categories')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({ name: 'Blocked In ReadOnly' });
    expect(blockedExpCat.status).toBe(403);
    expect(blockedExpCat.body.error.code).toBe('SUBSCRIPTION_LIMIT_REACHED');

    // Reports & exports remain accessible in read_only (D-01)
    const reportRes = await request(app)
      .get('/api/v1/reports/summary')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA);
    expect(reportRes.status).toBe(200);

    // Billing renewal checkout remains accessible in read_only (D-01, D-07)
    const checkoutRes = await request(app)
      .post('/api/v1/subscriptions/checkout')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({ planCode: 'test_tier_tbd_1' });
    expect(checkoutRes.status).toBe(201);
    const ref = checkoutRes.body.data.invoice.providerReference;

    // Invalid Paystack HMAC signature rejected with 422
    const webhookPayload = {
      event: 'charge.success',
      data: {
        id: 'evt_paystack_9001',
        reference: ref,
        amount: 1_500_000,
        currency: 'NGN',
        paid_at: '2026-11-20T10:15:00.000Z',
      },
    };
    const rawStr = JSON.stringify(webhookPayload);

    const badWebhook = await request(app)
      .post('/api/v1/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', 'deadbeef')
      .send(rawStr);
    expect(badWebhook.status).toBe(422);
    expect(badWebhook.body.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');

    // Valid Paystack HMAC-SHA512 signature reconciles invoice & activates subscription; replay deduplicates
    const validSig = createHmac('sha512', WEBHOOK_SECRET).update(rawStr).digest('hex');
    const goodWebhook = await request(app)
      .post('/api/v1/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', validSig)
      .send(rawStr);
    expect(goodWebhook.status).toBe(200);
    expect(goodWebhook.body.data.duplicate).toBe(false);

    const duplicateWebhook = await request(app)
      .post('/api/v1/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', validSig)
      .send(rawStr);
    expect(duplicateWebhook.status).toBe(200);
    expect(duplicateWebhook.body.data.duplicate).toBe(true);
  });

  it('handles offline sync oversell conflicts, revoked device wipe directives, notifications, rate limits, cross-tenant isolation, and Release 2 non-exposure', async () => {
    const { app, notifId } = createStage08Harness({
      rateLimitMaxOverrides: { standardRead: 3 },
    });

    // Seed product with only 1 unit in Alpha
    const pRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Limited Item',
        sellingPrice: '500.00',
        costPrice: '300.00',
        openingStock: '1.000',
        isTaxExempt: true,
      });
    const prodId = pRes.body.data.product.id;

    // Revoked device attempting sync push gets 403 DEVICE_REVOKED with wipeLocalData: true (D-09)
    const revokedPush = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('X-Device-ID', DEV_ALPHA_REVOKED)
      .set('Idempotency-Key', randomUUID())
      .send({
        operations: [
          {
            operationType: 'offline_sale',
            clientOperationUuid: randomUUID(),
            occurredAt: '2026-11-20T09:00:00Z',
            payload: {
              offlineReceiptNumber: 'OFF-R9V0-0001',
              items: [{ productId: prodId, quantity: '1.000' }],
              payments: [{ method: 'cash', amount: '500.00' }],
            },
          },
        ],
      });
    expect(revokedPush.status).toBe(403);
    expect(revokedPush.body.error.code).toBe('DEVICE_REVOKED');
    expect(revokedPush.body.error.details.wipeLocalData).toBe(true);

    // Active device pushes oversold offline sale (qty 2 > stock 1) -> applied + conflict recorded (D-05)
    const pushRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', 'Bearer jwt-cashier-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('X-Device-ID', DEV_ALPHA_ACTIVE)
      .set('Idempotency-Key', randomUUID())
      .send({
        operations: [
          {
            operationType: 'offline_sale',
            clientOperationUuid: randomUUID(),
            occurredAt: '2026-11-20T09:05:00Z',
            payload: {
              offlineReceiptNumber: 'OFF-A1B2-0001',
              items: [{ productId: prodId, quantity: '2.000' }],
              payments: [{ method: 'cash', amount: '1000.00' }],
            },
          },
        ],
      });
    expect(pushRes.status).toBe(200);
    expect(pushRes.body.data.conflictCount).toBe(1);
    const conflictId = pushRes.body.data.results[0].conflictId;

    // Owner resolves sync conflict
    const resolveRes = await request(app)
      .post(`/api/v1/sync/conflicts/${conflictId}/resolve`)
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA)
      .set('Idempotency-Key', randomUUID())
      .send({ action: 'accept_with_adjustment', note: 'Verified physical stock recount.' });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.conflict.status).toBe('resolved');

    // Cross-tenant isolation: Business Beta cannot read Alpha's product
    const betaProbe = await request(app)
      .get(`/api/v1/products/${prodId}`)
      .set('Authorization', 'Bearer jwt-owner-b')
      .set('X-Business-ID', BIZ_BETA);
    expect(betaProbe.status).toBe(404);

    // Approved In-App Notifications + Rate Limiting (standardRead max = 3 for Owner A)
    const n1 = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA);
    expect(n1.status).toBe(200);
    expect(n1.body.data.unreadCount).toBe(1);

    const n2 = await request(app)
      .patch(`/api/v1/notifications/${notifId}/read`)
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA);
    expect(n2.status).toBe(200);
    expect(n2.body.data.notification.isRead).toBe(true);

    const n3 = await request(app)
      .post('/api/v1/notifications/mark-all-read')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA);
    expect(n3.status).toBe(200);

    // 4th standardRead within window triggers 429 RATE_LIMITED + Retry-After header
    const n4 = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', 'Bearer jwt-owner-a')
      .set('X-Business-ID', BIZ_ALPHA);
    expect(n4.status).toBe(429);
    expect(n4.body.error.code).toBe('RATE_LIMITED');
    expect(n4.headers['retry-after']).toBeDefined();

    // Release 2 endpoints remain strictly unexposed (404 NOT_FOUND)
    for (const r2Path of [
      '/api/v1/suppliers',
      '/api/v1/local-purchases',
      '/api/v1/stock-counts',
      '/api/v1/stock-transfers',
      '/api/v1/cash-register-sessions',
      '/api/v1/notifications/sms',
    ]) {
      const res = await request(app)
        .get(r2Path)
        .set('Authorization', 'Bearer jwt-owner-b')
        .set('X-Business-ID', BIZ_BETA);
      expect(res.status).toBe(404);
    }
  });
});
