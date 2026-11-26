// @vitest-environment node
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadServerEnv } from '../../server/config/env.ts';
import { createApiApp } from '../../server/index.ts';
import type { AuthTokenVerifier, VerifiedAuthUser } from '../../server/lib/supabase-admin.ts';
import { InMemoryCommerceRepository } from '../../server/modules/commerce/commerce.repository.ts';
import type { IdentityRepository } from '../../server/modules/identity/identity.repository.ts';
import type {
  ActiveTenantMembership,
  BusinessRole,
  SubscriptionStatus,
} from '../../server/modules/identity/identity.types.ts';

const BIZ_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const LOC_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const USER_OWNER = '33333333-3333-4333-8333-333333333301';
const USER_MANAGER = '33333333-3333-4333-8333-333333333302';
const USER_CASHIER = '33333333-3333-4333-8333-333333333303';

function createPosVerificationHarness(options?: {
  taxEnabled?: boolean;
  taxRate?: string;
  allowNegativeStock?: boolean;
}) {
  const commerceRepo = new InMemoryCommerceRepository();

  commerceRepo.seedBusinessConfig({
    businessId: BIZ_ID,
    businessName: 'Festola Verification Mart',
    currencyCode: 'NGN',
    taxEnabled: options?.taxEnabled ?? false,
    taxMode: 'exclusive',
    taxRate: options?.taxRate ?? '0.0000',
    allowNegativeStock: options?.allowNegativeStock ?? false,
    receiptFooter: 'Goods sold in good condition.',
    defaultLocationId: LOC_ID,
    locationName: 'Lagos Main Counter',
    locationAddress: '44 Marina Road, Lagos',
    locationPhone: '+2348099990000',
  });

  const actors: Record<string, VerifiedAuthUser> = {
    'jwt-owner': {
      id: USER_OWNER,
      email: 'owner@festola.test',
      fullName: 'Owner Test',
      emailConfirmedAt: '2026-11-01T00:00:00Z',
      aal: 'aal1',
    },
    'jwt-manager': {
      id: USER_MANAGER,
      email: 'manager@festola.test',
      fullName: 'Manager Test',
      emailConfirmedAt: '2026-11-01T00:00:00Z',
      aal: 'aal1',
    },
    'jwt-cashier': {
      id: USER_CASHIER,
      email: 'cashier@festola.test',
      fullName: 'Cashier Test',
      emailConfirmedAt: '2026-11-01T00:00:00Z',
      aal: 'aal1',
    },
  };

  const memberships = new Map<string, ActiveTenantMembership>();
  const addMember = (userId: string, role: BusinessRole) => {
    memberships.set(`${BIZ_ID}:${userId}`, {
      businessId: BIZ_ID,
      businessName: 'Festola Verification Mart',
      userId,
      role,
      membershipStatus: 'active',
      subscriptionStatus: 'active' as SubscriptionStatus,
      defaultLocationId: LOC_ID,
      limits: {
        planId: '00000000-0000-4000-8000-000000000001',
        planCode: 'trial_14d',
        displayName: '14-Day Free Trial',
        maxStaff: 10,
        maxProducts: 500,
        maxOfflineDevices: 5,
      },
    });
  };
  addMember(USER_OWNER, 'owner');
  addMember(USER_MANAGER, 'manager');
  addMember(USER_CASHIER, 'cashier');

  const authVerifier: AuthTokenVerifier = {
    async verifyAccessToken(token: string) {
      return actors[token] ?? null;
    },
  };

  const identityRepoStub = {
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

  const env = loadServerEnv({
    NODE_ENV: 'test',
    APP_ENV: 'test',
    APP_URL: 'http://localhost:3000',
  });

  const app = createApiApp(env, {
    authVerifier,
    identityRepository: identityRepoStub,
    commerceRepository: commerceRepo,
    rateLimitMaxOverrides: {
      standardRead: 500,
      financialWrite: 500,
    },
  });

  return { app, commerceRepo };
}

describe('POS & Sales Verification Gate (Reconciliation, Atomicity, Concurrency, RBAC)', () => {
  it('reconciles 50 units @ cost NGN 1,000 / sell NGN 1,500 -> sell 5 => sales 7,500, COGS 5,000, gross profit 2,500, stock 45, accurate receipt', async () => {
    const { app, commerceRepo } = createPosVerificationHarness({ taxEnabled: false });

    // 1. Seed 50 units at cost NGN 1,000 and selling price NGN 1,500
    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Premium Groundnut Oil 5L',
        sku: 'OIL-5L',
        barcode: '6150001000050',
        unit: 'bottle',
        costPrice: '1000.00',
        sellingPrice: '1500.00',
        openingStock: '50.000',
        reorderLevel: '10.000',
        isTaxExempt: true,
      });

    expect(prodRes.status).toBe(201);
    const productId = prodRes.body.data.product.id as string;
    expect(prodRes.body.data.product.onHand).toBe('50.000');
    expect(prodRes.body.data.product.weightedAvgCost).toBe('1000.00');

    // 2. Sell 5 units with no tax and no discount via Cashier
    const clientSaleUuid = randomUUID();
    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-cashier')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', clientSaleUuid)
      .send({
        clientSaleUuid,
        items: [{ productId, quantity: '5.000', discountAmount: '0.00' }],
        payments: [{ method: 'cash', amount: '7500.00' }],
      });

    expect(saleRes.status).toBe(201);
    const cashierSale = saleRes.body.data.sale;

    // Cashier DTO must NEVER leak internal cost/COGS fields
    expect(cashierSale.totalCogs).toBeUndefined();
    expect(cashierSale.items[0].unitCostSnapshot).toBeUndefined();
    expect(cashierSale.items[0].lineCogs).toBeUndefined();

    // Verify sale totals & payment allocation
    expect(cashierSale.subtotalAmount).toBe('7500.00');
    expect(cashierSale.discountAmount).toBe('0.00');
    expect(cashierSale.taxAmount).toBe('0.00');
    expect(cashierSale.totalAmount).toBe('7500.00');
    expect(cashierSale.amountPaid).toBe('7500.00');
    expect(cashierSale.paymentStatus).toBe('paid');
    expect(cashierSale.payments).toHaveLength(1);
    expect(cashierSale.payments[0].amount).toBe('7500.00');

    // Verify Owner view sees exact historical cost/COGS snapshot
    const ownerSaleRes = await request(app)
      .get(`/api/v1/sales/${cashierSale.id}`)
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID);
    expect(ownerSaleRes.status).toBe(200);
    expect(ownerSaleRes.body.data.sale.totalCogs).toBe('5000.00');
    expect(ownerSaleRes.body.data.sale.items[0].unitCostSnapshot).toBe('1000.00');
    expect(ownerSaleRes.body.data.sale.items[0].lineCogs).toBe('5000.00');

    // Verify stock balance = 45.000 and stock movement delta = -5.000
    const prodAfterRes = await request(app)
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID);
    expect(prodAfterRes.status).toBe(200);
    expect(prodAfterRes.body.data.product.onHand).toBe('45.000');

    const movements = commerceRepo.getAllMovements(BIZ_ID);
    const saleMovement = movements.find((m) => m.movementType === 'sale_out');
    expect(saleMovement).toBeDefined();
    expect(saleMovement?.quantityDelta).toBe('-5.000');
    expect(saleMovement?.balanceAfter).toBe('45.000');
    expect(saleMovement?.unitCostSnapshot).toBe('1000.00');
    expect(saleMovement?.referenceId).toBe(cashierSale.id);

    // Verify Financial Summary reconciles: Sales 7,500, COGS 5,000, Gross Profit 2,500
    const summaryRes = await request(app)
      .get('/api/v1/reports/summary')
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.summary.grossSales).toBe('7500.00');
    expect(summaryRes.body.data.summary.netSales).toBe('7500.00');
    expect(summaryRes.body.data.summary.cogs).toBe('5000.00');
    expect(summaryRes.body.data.summary.grossProfit).toBe('2500.00');

    // Verify committed receipt snapshot accuracy & zero internal cost leak
    const receiptId = cashierSale.receipt.id as string;
    const receiptRes = await request(app)
      .get(`/api/v1/receipts/${receiptId}`)
      .set('Authorization', 'Bearer jwt-cashier')
      .set('X-Business-ID', BIZ_ID);
    expect(receiptRes.status).toBe(200);
    const snap = receiptRes.body.data.receipt.snapshotPayload;
    expect(snap.receiptNumber).toBe(cashierSale.saleNumber);
    expect(snap.totalAmount).toBe('7500.00');
    expect(snap.amountPaid).toBe('7500.00');
    expect(snap.items[0].name).toBe('Premium Groundnut Oil 5L');
    expect(snap.items[0].quantity).toBe('5.000');
    expect(snap.items[0].unitPrice).toBe('1500.00');
    expect(snap.items[0].lineTotal).toBe('7500.00');
    expect(JSON.stringify(snap)).not.toContain('unitCostSnapshot');
    expect(JSON.stringify(snap)).not.toContain('lineCogs');
    expect(JSON.stringify(snap)).not.toContain('totalCogs');

    // Verify audit log recorded
    const auditLogs = commerceRepo.getAuditLogs(BIZ_ID);
    expect(auditLogs.some((a) => a.action === 'sale.created' && a.entityId === cashierSale.id)).toBe(
      true,
    );
  });

  it('prevents duplicate checkout on sequential replay, concurrent duplicate submission, clientSaleUuid retry, and mismatched idempotency payloads', async () => {
    const { app, commerceRepo } = createPosVerificationHarness();

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Rice Bag 50kg',
        costPrice: '1000.00',
        sellingPrice: '1500.00',
        openingStock: '50.000',
      });
    const productId = prodRes.body.data.product.id as string;

    const idemKey = randomUUID();
    const clientSaleUuid = randomUUID();
    const payload = {
      clientSaleUuid,
      items: [{ productId, quantity: '5.000', discountAmount: '0.00' }],
      payments: [{ method: 'cash', amount: '7500.00' }],
    };

    // Concurrent duplicate checkout with the EXACT same Idempotency-Key
    const [r1, r2] = await Promise.all([
      request(app)
        .post('/api/v1/sales')
        .set('Authorization', 'Bearer jwt-cashier')
        .set('X-Business-ID', BIZ_ID)
        .set('Idempotency-Key', idemKey)
        .send(payload),
      request(app)
        .post('/api/v1/sales')
        .set('Authorization', 'Bearer jwt-cashier')
        .set('X-Business-ID', BIZ_ID)
        .set('Idempotency-Key', idemKey)
        .send(payload),
    ]);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.data.sale.id).toBe(r2.body.data.sale.id);
    expect(
      r1.headers['idempotency-replayed'] === 'true' ||
        r2.headers['idempotency-replayed'] === 'true',
    ).toBe(true);

    // Sequential replay with a NEW Idempotency-Key but same clientSaleUuid
    const r3 = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-cashier')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send(payload);
    expect(r3.status).toBe(201);
    expect(r3.body.data.sale.id).toBe(r1.body.data.sale.id);

    // Mismatched payload reusing the same Idempotency-Key -> 409 IDEMPOTENCY_CONFLICT
    const rConflict = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-cashier')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', idemKey)
      .send({
        clientSaleUuid,
        items: [{ productId, quantity: '6.000', discountAmount: '0.00' }],
        payments: [{ method: 'cash', amount: '9000.00' }],
      });
    expect(rConflict.status).toBe(409);
    expect(rConflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

    // Strictly ONE sale, ONE receipt, and stock deducted ONCE (50 -> 45)
    expect(commerceRepo.getAllSales(BIZ_ID)).toHaveLength(1);
    expect(commerceRepo.getAllReceipts(BIZ_ID)).toHaveLength(1);
    const prodAfter = await request(app)
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID);
    expect(prodAfter.body.data.product.onHand).toBe('45.000');
  });

  it('serializes concurrent sales competing for limited stock and rejects oversell with 409 INSUFFICIENT_STOCK', async () => {
    const { app, commerceRepo } = createPosVerificationHarness({ allowNegativeStock: false });

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Limited Cooking Gas Cylinder',
        costPrice: '1000.00',
        sellingPrice: '1500.00',
        openingStock: '45.000',
      });
    const productId = prodRes.body.data.product.id as string;

    // Two distinct concurrent sales each requesting 30 units when only 45 exist
    const [saleA, saleB] = await Promise.all([
      request(app)
        .post('/api/v1/sales')
        .set('Authorization', 'Bearer jwt-cashier')
        .set('X-Business-ID', BIZ_ID)
        .set('Idempotency-Key', randomUUID())
        .send({
          items: [{ productId, quantity: '30.000', discountAmount: '0.00' }],
          payments: [{ method: 'cash', amount: '45000.00' }],
        }),
      request(app)
        .post('/api/v1/sales')
        .set('Authorization', 'Bearer jwt-owner')
        .set('X-Business-ID', BIZ_ID)
        .set('Idempotency-Key', randomUUID())
        .send({
          items: [{ productId, quantity: '30.000', discountAmount: '0.00' }],
          payments: [{ method: 'transfer', amount: '45000.00', referenceNote: 'TRF-998' }],
        }),
    ]);

    const statuses = [saleA.status, saleB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const rejected = saleA.status === 409 ? saleA : saleB;
    expect(rejected.body.error.code).toBe('INSUFFICIENT_STOCK');

    // Only 1 sale committed, stock strictly 15.000 (45 - 30), zero negative stock
    expect(commerceRepo.getAllSales(BIZ_ID)).toHaveLength(1);
    const prodAfter = await request(app)
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID);
    expect(prodAfter.body.data.product.onHand).toBe('15.000');
  });

  it('prevents partial writes on failed payment mismatch and mid-transaction write failures (full rollback)', async () => {
    const { app, commerceRepo } = createPosVerificationHarness();

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Bottled Water Case',
        costPrice: '1000.00',
        sellingPrice: '1500.00',
        openingStock: '50.000',
      });
    const productId = prodRes.body.data.product.id as string;

    // 1. Failed payment mismatch (submitted 7000 instead of authoritative 7500)
    const badPaymentRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-cashier')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ productId, quantity: '5.000', discountAmount: '0.00' }],
        payments: [{ method: 'cash', amount: '7000.00' }],
      });
    expect(badPaymentRes.status).toBe(400);
    expect(commerceRepo.getAllSales(BIZ_ID)).toHaveLength(0);
    expect(commerceRepo.getAllReceipts(BIZ_ID)).toHaveLength(0);

    // 2. Simulated failure right after insertSale
    commerceRepo.failAfterNextSaleInsert = true;
    const failSaleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-cashier')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ productId, quantity: '5.000', discountAmount: '0.00' }],
        payments: [{ method: 'cash', amount: '7500.00' }],
      });
    expect(failSaleRes.status).toBe(500);

    // 3. Simulated failure during insertReceipt (after stock deduction and sale insert)
    commerceRepo.failOnNextReceiptInsert = true;
    const failReceiptRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-cashier')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ productId, quantity: '5.000', discountAmount: '0.00' }],
        payments: [{ method: 'cash', amount: '7500.00' }],
      });
    expect(failReceiptRes.status).toBe(500);

    // Verify ZERO partial writes across sales, receipts, stock_movements, and product stock
    expect(commerceRepo.getAllSales(BIZ_ID)).toHaveLength(0);
    expect(commerceRepo.getAllReceipts(BIZ_ID)).toHaveLength(0);
    expect(
      commerceRepo.getAllMovements(BIZ_ID).filter((m) => m.movementType === 'sale_out'),
    ).toHaveLength(0);

    const prodAfter = await request(app)
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID);
    expect(prodAfter.body.data.product.onHand).toBe('50.000');
  });

  it('enforces authorization on discounts, credit limits, refunds, and voids; blocks ordinary deletion of financial records', async () => {
    const { app } = createPosVerificationHarness();

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Detergent Carton',
        costPrice: '1000.00',
        sellingPrice: '1500.00',
        openingStock: '50.000',
      });
    const productId = prodRes.body.data.product.id as string;

    // Customer with NO approved creditLimit
    const noLimitCustRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({ fullName: 'Walk-In Unapproved Credit', phone: '+2348011110001' });
    const noLimitCustId = noLimitCustRes.body.data.customer.id as string;

    // Customer WITH approved creditLimit = 3000.00
    const approvedCustRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        fullName: 'Approved Credit Buyer',
        phone: '+2348011110002',
        creditLimit: '3000.00',
      });
    const approvedCustId = approvedCustRes.body.data.customer.id as string;

    // Cashier blocked from applying unauthorized line discount
    const cashierDiscRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-cashier')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ productId, quantity: '2.000', discountAmount: '200.00' }],
        payments: [{ method: 'cash', amount: '2800.00' }],
      });
    expect(cashierDiscRes.status).toBe(403);
    expect(cashierDiscRes.body.error.code).toBe('PERMISSION_DENIED');

    // Cashier blocked from credit sale to customer with no approved credit limit
    const cashierUnapprovedCredit = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-cashier')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId: noLimitCustId,
        items: [{ productId, quantity: '2.000', discountAmount: '0.00' }],
        payments: [{ method: 'credit', amount: '3000.00' }],
      });
    expect(cashierUnapprovedCredit.status).toBe(403);

    // Cashier blocked from credit sale exceeding approved credit limit (4500 > 3000)
    const exceedLimitRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-cashier')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId: approvedCustId,
        items: [{ productId, quantity: '3.000', discountAmount: '0.00' }],
        payments: [{ method: 'credit', amount: '4500.00' }],
      });
    expect(exceedLimitRes.status).toBe(400);

    // Manager approved discount + authorized split digital + credit sale succeeds
    const approvedSaleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-manager')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId: approvedCustId,
        items: [{ productId, quantity: '4.000', discountAmount: '500.00' }],
        payments: [
          { method: 'transfer', amount: '3000.00', referenceNote: 'NIP-8821' },
          { method: 'credit', amount: '2500.00' },
        ],
      });
    expect(approvedSaleRes.status).toBe(201);
    const saleId = approvedSaleRes.body.data.sale.id as string;
    const saleItemId = approvedSaleRes.body.data.sale.items[0].id as string;
    const receiptId = approvedSaleRes.body.data.sale.receipt.id as string;

    // Cashier blocked from refund/return and void
    const unauthReturn = await request(app)
      .post(`/api/v1/sales/${saleId}/returns`)
      .set('Authorization', 'Bearer jwt-cashier')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Attempted unauthorized cashier refund',
        items: [{ saleItemId, quantity: '1.000', disposition: 'restock' }],
      });
    expect(unauthReturn.status).toBe(403);

    const unauthVoid = await request(app)
      .post(`/api/v1/sales/${saleId}/void`)
      .set('Authorization', 'Bearer jwt-cashier')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Attempted unauthorized cashier void',
        disposition: 'restock',
      });
    expect(unauthVoid.status).toBe(403);

    // Ordinary DELETE on financial records is not permitted
    const delSale = await request(app)
      .delete(`/api/v1/sales/${saleId}`)
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID);
    expect(delSale.status).toBe(404);

    const delReceipt = await request(app)
      .delete(`/api/v1/receipts/${receiptId}`)
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID);
    expect(delReceipt.status).toBe(404);

    // Filter sales by payment method
    const transferSales = await request(app)
      .get('/api/v1/sales?paymentMethod=transfer')
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID);
    expect(transferSales.status).toBe(200);
    expect(transferSales.body.data.sales).toHaveLength(1);
    expect(transferSales.body.data.sales[0].payments[0].referenceNote).toBe('NIP-8821');

    const posCardSales = await request(app)
      .get('/api/v1/sales?paymentMethod=pos_card')
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID);
    expect(posCardSales.status).toBe(200);
    expect(posCardSales.body.data.sales).toHaveLength(0);
  });

  it('reconciles multi-item returns (debt-first refund, restock vs damaged), blocks concurrent over-return, and preserves immutable receipt snapshots', async () => {
    const { app, commerceRepo } = createPosVerificationHarness();

    const prod1Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Item Alpha',
        costPrice: '1000.00',
        sellingPrice: '1500.00',
        openingStock: '50.000',
      });
    const prod1Id = prod1Res.body.data.product.id as string;

    const prod2Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Item Beta',
        costPrice: '500.00',
        sellingPrice: '1000.00',
        openingStock: '20.000',
      });
    const prod2Id = prod2Res.body.data.product.id as string;

    const custRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({ fullName: 'Amina Bello', creditLimit: '10000.00' });
    const customerId = custRes.body.data.customer.id as string;

    // Sale: 4 x Alpha (6,000) + 2 x Beta (2,000) = 8,000 total (6,000 cash + 2,000 credit)
    // Stock becomes: Alpha = 46, Beta = 18
    const saleRes = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId,
        items: [
          { productId: prod1Id, quantity: '4.000', discountAmount: '0.00' },
          { productId: prod2Id, quantity: '2.000', discountAmount: '0.00' },
        ],
        payments: [
          { method: 'cash', amount: '6000.00' },
          { method: 'credit', amount: '2000.00' },
        ],
      });
    expect(saleRes.status).toBe(201);
    const sale = saleRes.body.data.sale;
    const itemAlphaId = sale.items.find((i: { productId: string }) => i.productId === prod1Id).id;
    const itemBetaId = sale.items.find((i: { productId: string }) => i.productId === prod2Id).id;
    const receiptId = sale.receipt.id as string;

    // Mutate catalog price/name AFTER sale to verify receipt snapshot immutability
    const patchProd = await request(app)
      .patch(`/api/v1/products/${prod1Id}`)
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID)
      .send({ name: 'Item Alpha Renamed', sellingPrice: '2999.00' });
    expect(patchProd.status).toBe(200);

    const immutableReceipt = await request(app)
      .get(`/api/v1/receipts/${receiptId}`)
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID);
    expect(immutableReceipt.body.data.receipt.snapshotPayload.items[0].name).toBe('Item Alpha');
    expect(immutableReceipt.body.data.receipt.snapshotPayload.items[0].unitPrice).toBe('1500.00');

    // Authorized multi-item return: 2 x Alpha (3,000, restock) + 1 x Beta (1,000, damaged) = 4,000 reversed
    // Credit remaining is 2,000 -> debt reduced by 2,000 first, cash refund = 2,000
    const returnRes = await request(app)
      .post(`/api/v1/sales/${sale.id}/returns`)
      .set('Authorization', 'Bearer jwt-manager')
      .set('X-Business-ID', BIZ_ID)
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Customer returned 2 Alpha unopened and 1 Beta damaged',
        refundMethod: 'transfer',
        refundReferenceNote: 'REF-4401',
        items: [
          { saleItemId: itemAlphaId, quantity: '2.000', disposition: 'restock' },
          { saleItemId: itemBetaId, quantity: '1.000', disposition: 'damaged' },
        ],
      });
    expect(returnRes.status).toBe(201);
    expect(returnRes.body.data.saleReturn.totalReversed).toBe('4000.00');
    expect(returnRes.body.data.saleReturn.debtReducedAmount).toBe('2000.00');
    expect(returnRes.body.data.saleReturn.refundAmount).toBe('2000.00');
    expect(returnRes.body.data.sale.status).toBe('partially_returned');
    expect(returnRes.body.data.sale.creditRemaining).toBe('0.00');
    expect(returnRes.body.data.sale.paymentStatus).toBe('paid');

    // Stock reconciliation: Alpha restocked 46 + 2 = 48; Beta damaged stays 18
    const alphaAfter = await request(app)
      .get(`/api/v1/products/${prod1Id}`)
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID);
    expect(alphaAfter.body.data.product.onHand).toBe('48.000');

    const betaAfter = await request(app)
      .get(`/api/v1/products/${prod2Id}`)
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID);
    expect(betaAfter.body.data.product.onHand).toBe('18.000');

    // Customer outstanding balance reduced to 0.00
    const custAfter = await request(app)
      .get(`/api/v1/customers/${customerId}`)
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID);
    expect(custAfter.body.data.customer.outstandingBalance).toBe('0.00');

    // Concurrent double-return race for the remaining 2 units of Alpha: only one may succeed
    const [race1, race2] = await Promise.all([
      request(app)
        .post(`/api/v1/sales/${sale.id}/returns`)
        .set('Authorization', 'Bearer jwt-owner')
        .set('X-Business-ID', BIZ_ID)
        .set('Idempotency-Key', randomUUID())
        .send({
          reason: 'Returning remaining 2 Alpha units',
          items: [{ saleItemId: itemAlphaId, quantity: '2.000', disposition: 'restock' }],
        }),
      request(app)
        .post(`/api/v1/sales/${sale.id}/returns`)
        .set('Authorization', 'Bearer jwt-owner')
        .set('X-Business-ID', BIZ_ID)
        .set('Idempotency-Key', randomUUID())
        .send({
          reason: 'Concurrent duplicate return of remaining 2 Alpha units',
          items: [{ saleItemId: itemAlphaId, quantity: '2.000', disposition: 'restock' }],
        }),
    ]);

    const raceStatuses = [race1.status, race2.status].sort();
    expect(raceStatuses).toEqual([201, 400]);

    // Alpha stock strictly back to 50.000 (not 52.000!)
    const alphaFinal = await request(app)
      .get(`/api/v1/products/${prod1Id}`)
      .set('Authorization', 'Bearer jwt-owner')
      .set('X-Business-ID', BIZ_ID);
    expect(alphaFinal.body.data.product.onHand).toBe('50.000');

    // Audit log recorded all returns
    const returnAudits = commerceRepo
      .getAuditLogs(BIZ_ID)
      .filter((a) => a.action === 'sale.returned');
    expect(returnAudits).toHaveLength(2);
  });
});
