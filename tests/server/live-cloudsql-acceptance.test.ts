// @vitest-environment node
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { loadServerEnv } from '../../server/config/env.ts';
import { createApiApp } from '../../server/index.ts';
import { createDbPool } from '../../server/lib/db.ts';
import type { AuthTokenVerifier, VerifiedAuthUser } from '../../server/lib/supabase-admin.ts';
import { isCloudSqlConfigured } from '../../src/db/index.ts';

const env = loadServerEnv();
const socketReady =
  !env.SQL_HOST || !env.SQL_HOST.startsWith('/') || fs.existsSync(env.SQL_HOST);
const hasLiveCloudSql = (isCloudSqlConfigured(env) && socketReady) || Boolean(env.DATABASE_URL);

const describeLive = hasLiveCloudSql ? describe : describe.skip;

describeLive('Live Cloud SQL PostgreSQL End-to-End Acceptance Verification', () => {
  const createdBusinessIds: string[] = [];
  const createdUserIds: string[] = [];

  const userAId = randomUUID();
  const userBId = randomUUID();
  createdUserIds.push(userAId, userBId);

  const actorA: VerifiedAuthUser = {
    id: userAId,
    email: `acceptance-a-${userAId.slice(0, 8)}@festola.test`,
    fullName: 'Acceptance Owner A',
    emailConfirmedAt: new Date().toISOString(),
    aal: 'aal1',
  };

  const actorB: VerifiedAuthUser = {
    id: userBId,
    email: `acceptance-b-${userBId.slice(0, 8)}@festola.test`,
    fullName: 'Acceptance Owner B',
    emailConfirmedAt: new Date().toISOString(),
    aal: 'aal1',
  };

  const tokenMap = new Map<string, VerifiedAuthUser>([
    ['live-token-a-1', actorA],
    ['live-token-a-2', actorA],
    ['live-token-b-1', actorB],
  ]);

  const authVerifier: AuthTokenVerifier = {
    async verifyAccessToken(token: string) {
      return tokenMap.get(token) ?? null;
    },
  };

  afterAll(async () => {
    const db = createDbPool(env);
    if (!db) return;
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      if (createdBusinessIds.length > 0) {
        // Delete child rows in FK-safe order across all tables for our acceptance test businesses
        const businessScopedTables = [
          'audit_logs',
          'notifications',
          'sync_conflicts',
          'idempotency_records',
          'receipts',
          'receipt_sequences',
          'customer_debt_allocations',
          'customer_debt_payments',
          'sale_refunds',
          'sale_return_items',
          'sale_returns',
          'sale_payments',
          'sale_items',
          'sales',
          'restock_batch_items',
          'restock_batches',
          'stock_movements',
          'stock_balances',
          'expenses',
          'expense_categories',
          'customers',
          'products',
          'product_categories',
          'subscription_invoices',
          'business_subscriptions',
          'registered_devices',
          'staff_invitations',
          'business_memberships',
          'business_locations',
          'business_settings',
        ];

        for (const table of businessScopedTables) {
          await client.query(`DELETE FROM public.${table} WHERE business_id = ANY($1::uuid[])`, [
            createdBusinessIds,
          ]);
        }
        await client.query(`DELETE FROM public.businesses WHERE id = ANY($1::uuid[])`, [
          createdBusinessIds,
        ]);
      }

      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM public.user_profiles WHERE id = ANY($1::uuid[])`, [
          createdUserIds,
        ]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  it('passes acceptance tests 1 through 9 against real Cloud SQL PostgreSQL with strict tenant isolation', async () => {
    const app = createApiApp(env, { authVerifier });

    // ---- Acceptance Test 1: Register Business A & verify empty state across all 12 dashboard data points ----
    const bizARes = await request(app)
      .post('/api/v1/businesses')
      .set('Authorization', 'Bearer live-token-a-1')
      .send({
        name: 'Acceptance Mart Alpha',
        currencyCode: 'NGN',
        timezone: 'Africa/Lagos',
        locationName: 'Victoria Island Main',
      });

    expect(bizARes.status).toBe(201);
    expect(bizARes.body.success).toBe(true);
    const bizAId: string = bizARes.body.data.business.id;
    createdBusinessIds.push(bizAId);

    const headersA = {
      Authorization: 'Bearer live-token-a-1',
      'X-Business-ID': bizAId,
    };

    const [
      emptySummary,
      emptyByDay,
      emptyByCat,
      emptyValuation,
      emptyProducts,
      emptyLowStock,
      emptySales,
      emptyCustomers,
      emptyDebtPayments,
      emptySub,
    ] = await Promise.all([
      request(app).get('/api/v1/reports/summary').set(headersA),
      request(app).get('/api/v1/reports/sales-by-day').set(headersA),
      request(app).get('/api/v1/reports/sales-by-category').set(headersA),
      request(app).get('/api/v1/reports/inventory-valuation').set(headersA),
      request(app).get('/api/v1/products').set(headersA),
      request(app).get('/api/v1/products?lowStockOnly=true').set(headersA),
      request(app).get('/api/v1/sales').set(headersA),
      request(app).get('/api/v1/customers').set(headersA),
      request(app).get('/api/v1/debt-payments').set(headersA),
      request(app).get('/api/v1/subscriptions/current').set(headersA),
    ]);

    expect(emptySummary.status).toBe(200);
    expect(emptySummary.body.data.summary).toMatchObject({
      salesCount: 0,
      grossSales: '0.00',
      netSales: '0.00',
      cogs: '0.00',
      grossProfit: '0.00',
      operatingExpenses: '0.00',
      netOperatingProfit: '0.00',
      outstandingReceivables: '0.00',
    });
    expect(emptyByDay.status).toBe(200);
    expect(emptyByDay.body.data.series).toEqual([]);
    expect(emptyByCat.status).toBe(200);
    expect(emptyByCat.body.data.categories).toEqual([]);
    expect(emptyValuation.status).toBe(200);
    expect(emptyValuation.body.data.valuation).toMatchObject({
      activeProductCount: 0,
      lowStockCount: 0,
      totalCostValuation: '0.00',
      totalRetailValue: '0.00',
    });
    expect(emptyProducts.body.data.products).toEqual([]);
    expect(emptyLowStock.body.data.products).toEqual([]);
    expect(emptySales.body.data.sales).toEqual([]);
    expect(emptyCustomers.body.data.customers).toEqual([]);
    expect(emptyDebtPayments.status).toBe(200);
    expect(emptyDebtPayments.body.data.debtPayments).toEqual([]);
    expect(emptySub.status).toBe(200);
    expect(emptySub.body.data.status).toBe('trialing');

    // ---- Acceptance Test 2: Create product category & product with opening stock ----
    const catRes = await request(app)
      .post('/api/v1/product-categories')
      .set({ ...headersA, 'Idempotency-Key': randomUUID() })
      .send({ name: 'Beverages' });
    expect(catRes.status).toBe(201);
    const categoryId: string = catRes.body.data.category.id;

    const prodRes = await request(app)
      .post('/api/v1/products')
      .set({ ...headersA, 'Idempotency-Key': randomUUID() })
      .send({
        categoryId,
        sku: 'BEV-MILO-500',
        name: 'Milo Tin 500g',
        unit: 'tin',
        sellingPrice: '5000.00',
        costPrice: '3000.00',
        openingStock: '10.000',
        reorderLevel: '4.000',
        isTaxExempt: true,
      });
    expect(prodRes.status).toBe(201);
    const productId: string = prodRes.body.data.product.id;

    const valAfterStock = await request(app)
      .get('/api/v1/reports/inventory-valuation')
      .set(headersA);
    expect(valAfterStock.status).toBe(200);
    expect(valAfterStock.body.data.valuation).toMatchObject({
      activeProductCount: 1,
      lowStockCount: 0,
      totalCostValuation: '30000.00',
      totalRetailValue: '50000.00',
    });

    // ---- Acceptance Test 3: Complete a cash sale & verify dashboard KPIs, trends, category, and stock ----
    const cashSaleRes = await request(app)
      .post('/api/v1/sales')
      .set({ ...headersA, 'Idempotency-Key': randomUUID() })
      .send({
        items: [{ productId, quantity: '3', discountAmount: '0.00' }],
        payments: [{ method: 'cash', amount: '15000.00' }],
      });
    expect(cashSaleRes.status).toBe(201);

    const [sumAfterCash, byDayAfterCash, byCatAfterCash, prodAfterCash] = await Promise.all([
      request(app).get('/api/v1/reports/summary').set(headersA),
      request(app).get('/api/v1/reports/sales-by-day').set(headersA),
      request(app).get('/api/v1/reports/sales-by-category').set(headersA),
      request(app).get('/api/v1/products').set(headersA),
    ]);

    expect(sumAfterCash.body.data.summary).toMatchObject({
      salesCount: 1,
      grossSales: '15000.00',
      netSales: '15000.00',
      cogs: '9000.00',
      grossProfit: '6000.00',
      operatingExpenses: '0.00',
      netOperatingProfit: '6000.00',
      outstandingReceivables: '0.00',
    });
    expect(byDayAfterCash.body.data.series).toHaveLength(1);
    expect(byDayAfterCash.body.data.series[0].netSales).toBe('15000.00');
    expect(byCatAfterCash.body.data.categories).toEqual([
      expect.objectContaining({
        categoryId,
        categoryName: 'Beverages',
        revenue: '15000.00',
        sharePercent: 100,
      }),
    ]);
    expect(prodAfterCash.body.data.products[0].onHand).toBe('7.000');

    // ---- Acceptance Test 4: Record an expense & verify profit calculations ----
    const expCatRes = await request(app)
      .post('/api/v1/expense-categories')
      .set({ ...headersA, 'Idempotency-Key': randomUUID() })
      .send({ name: 'Utilities' });
    expect(expCatRes.status).toBe(201);
    const expCatId: string = expCatRes.body.data.category.id;

    const todayDate = new Date().toISOString().slice(0, 10);
    const expRes = await request(app)
      .post('/api/v1/expenses')
      .set({ ...headersA, 'Idempotency-Key': randomUUID() })
      .send({
        categoryId: expCatId,
        amount: '2500.00',
        paymentMethod: 'cash',
        description: 'Generator fuel purchase',
        incurredOn: todayDate,
      });
    expect(expRes.status).toBe(201);

    const sumAfterExp = await request(app).get('/api/v1/reports/summary').set(headersA);
    expect(sumAfterExp.body.data.summary).toMatchObject({
      netSales: '15000.00',
      grossProfit: '6000.00',
      operatingExpenses: '2500.00',
      netOperatingProfit: '3500.00',
    });

    // ---- Acceptance Test 5: Record credit sale, verify low stock & customer debt, then collect partial debt payment ----
    const custRes = await request(app)
      .post('/api/v1/customers')
      .set({ ...headersA, 'Idempotency-Key': randomUUID() })
      .send({ fullName: 'Chidi Stores', phone: '+2348031112222' });
    expect(custRes.status).toBe(201);
    const customerId: string = custRes.body.data.customer.id;

    // 4 tins x 5000 = 20,000 (5,000 cash + 15,000 credit); remaining stock = 7 - 4 = 3 <= reorderLevel 4
    const creditSaleRes = await request(app)
      .post('/api/v1/sales')
      .set({ ...headersA, 'Idempotency-Key': randomUUID() })
      .send({
        customerId,
        items: [{ productId, quantity: '4', discountAmount: '0.00' }],
        payments: [
          { method: 'cash', amount: '5000.00' },
          { method: 'credit', amount: '15000.00' },
        ],
      });
    expect(creditSaleRes.status).toBe(201);

    const [sumAfterCredit, lowStockAfterCredit, customersAfterCredit] = await Promise.all([
      request(app).get('/api/v1/reports/summary').set(headersA),
      request(app).get('/api/v1/products?lowStockOnly=true').set(headersA),
      request(app).get('/api/v1/customers').set(headersA),
    ]);

    // Total netSales = 15,000 + 20,000 = 35,000; COGS = 7 * 3,000 = 21,000; grossProfit = 14,000; netProfit = 11,500
    expect(sumAfterCredit.body.data.summary).toMatchObject({
      salesCount: 2,
      netSales: '35000.00',
      cogs: '21000.00',
      grossProfit: '14000.00',
      operatingExpenses: '2500.00',
      netOperatingProfit: '11500.00',
      outstandingReceivables: '15000.00',
    });
    expect(lowStockAfterCredit.body.data.products).toHaveLength(1);
    expect(lowStockAfterCredit.body.data.products[0].onHand).toBe('3.000');
    expect(customersAfterCredit.body.data.customers[0].outstandingBalance).toBe('15000.00');

    // Record partial customer debt payment of 6,000.00 -> outstanding becomes 9,000.00
    const debtPayRes = await request(app)
      .post(`/api/v1/customers/${customerId}/debt-payments`)
      .set({ ...headersA, 'Idempotency-Key': randomUUID() })
      .send({
        amount: '6000.00',
        method: 'transfer',
        referenceNote: 'NIP-ACCEPTANCE-01',
      });
    expect(debtPayRes.status).toBe(201);

    const [sumAfterDebtPay, debtPaymentsList] = await Promise.all([
      request(app).get('/api/v1/reports/summary').set(headersA),
      request(app).get('/api/v1/debt-payments').set(headersA),
    ]);
    expect(sumAfterDebtPay.body.data.summary.outstandingReceivables).toBe('9000.00');
    expect(debtPaymentsList.status).toBe(200);
    expect(debtPaymentsList.body.data.debtPayments).toHaveLength(1);
    expect(debtPaymentsList.body.data.debtPayments[0]).toMatchObject({
      customerId,
      customerName: 'Chidi Stores',
      amount: '6000.00',
      method: 'transfer',
      status: 'posted',
    });

    // ---- Acceptance Test 6: Refresh application (brand-new Express app & repos against Cloud SQL) ----
    const freshApp = createApiApp(env, { authVerifier });
    const refreshedSummary = await request(freshApp).get('/api/v1/reports/summary').set(headersA);
    expect(refreshedSummary.status).toBe(200);
    expect(refreshedSummary.body.data.summary).toMatchObject({
      salesCount: 2,
      netSales: '35000.00',
      grossProfit: '14000.00',
      operatingExpenses: '2500.00',
      netOperatingProfit: '11500.00',
      outstandingReceivables: '9000.00',
    });

    // ---- Acceptance Test 7: Log out and log in again with a fresh session token ----
    const logoutRes = await request(freshApp)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer live-token-a-1');
    expect(logoutRes.status).toBe(200);

    const meAfterRelogin = await request(freshApp)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer live-token-a-2');
    expect(meAfterRelogin.status).toBe(200);
    expect(meAfterRelogin.body.data.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          businessId: bizAId,
          businessName: 'Acceptance Mart Alpha',
          role: 'owner',
        }),
      ]),
    );

    const summaryAfterRelogin = await request(freshApp).get('/api/v1/reports/summary').set({
      Authorization: 'Bearer live-token-a-2',
      'X-Business-ID': bizAId,
    });
    expect(summaryAfterRelogin.status).toBe(200);
    expect(summaryAfterRelogin.body.data.summary.netSales).toBe('35000.00');

    // ---- Acceptance Test 8: Independent Business B — strict multi-tenant data isolation ----
    const bizBRes = await request(freshApp)
      .post('/api/v1/businesses')
      .set('Authorization', 'Bearer live-token-b-1')
      .send({
        name: 'Acceptance Pharmacy Beta',
        currencyCode: 'NGN',
        timezone: 'Africa/Lagos',
        locationName: 'Ikeja Branch',
      });
    expect(bizBRes.status).toBe(201);
    const bizBId: string = bizBRes.body.data.business.id;
    createdBusinessIds.push(bizBId);

    const headersB = {
      Authorization: 'Bearer live-token-b-1',
      'X-Business-ID': bizBId,
    };

    const [bizBSummary, bizBProducts, bizBSales, bizBDebtPayments] = await Promise.all([
      request(freshApp).get('/api/v1/reports/summary').set(headersB),
      request(freshApp).get('/api/v1/products').set(headersB),
      request(freshApp).get('/api/v1/sales').set(headersB),
      request(freshApp).get('/api/v1/debt-payments').set(headersB),
    ]);

    expect(bizBSummary.status).toBe(200);
    expect(bizBSummary.body.data.summary).toMatchObject({
      salesCount: 0,
      netSales: '0.00',
      grossProfit: '0.00',
      operatingExpenses: '0.00',
      netOperatingProfit: '0.00',
      outstandingReceivables: '0.00',
    });
    expect(bizBProducts.body.data.products).toEqual([]);
    expect(bizBSales.body.data.sales).toEqual([]);
    expect(bizBDebtPayments.body.data.debtPayments).toEqual([]);

    // Cross-tenant probes MUST be rejected with 403 PERMISSION_DENIED
    const crossProbeBtoA = await request(freshApp).get('/api/v1/reports/summary').set({
      Authorization: 'Bearer live-token-b-1',
      'X-Business-ID': bizAId,
    });
    expect(crossProbeBtoA.status).toBe(403);
    expect(crossProbeBtoA.body.error.code).toBe('PERMISSION_DENIED');

    const crossProbeDebtPayments = await request(freshApp).get('/api/v1/debt-payments').set({
      Authorization: 'Bearer live-token-b-1',
      'X-Business-ID': bizAId,
    });
    expect(crossProbeDebtPayments.status).toBe(403);
    expect(crossProbeDebtPayments.body.error.code).toBe('PERMISSION_DENIED');

    const crossProbeAtoB = await request(freshApp).get('/api/v1/reports/sales-by-category').set({
      Authorization: 'Bearer live-token-a-2',
      'X-Business-ID': bizBId,
    });
    expect(crossProbeAtoB.status).toBe(403);
    expect(crossProbeAtoB.body.error.code).toBe('PERMISSION_DENIED');

    // Unauthenticated request MUST return 401 UNAUTHENTICATED (never 200 with zeros)
    const unauthRes = await request(freshApp)
      .get('/api/v1/reports/summary')
      .set('X-Business-ID', bizAId);
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.body.error.code).toBe('UNAUTHENTICATED');
  }, 30_000);
});
