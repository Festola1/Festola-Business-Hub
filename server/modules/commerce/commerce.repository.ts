import { randomUUID } from 'node:crypto';
import type {
  ActiveDeviceLookup,
  AuditEventInput,
  AuditLogRecord,
  BusinessLocationRecord,
  BusinessTaxAndStockConfig,
  CustomerDebtPaymentRecord,
  CustomerRecord,
  ExpenseCategoryRecord,
  ExpenseRecord,
  NotificationRecord,
  PaginatedResult,
  PaymentWebhookEventRecord,
  ProductCategoryRecord,
  ProductRecord,
  ReceiptRecord,
  RestockBatchRecord,
  SaleRecord,
  SaleReturnRecord,
  StockMovementRecord,
  SubscriptionInvoiceRecord,
  SubscriptionPlanCatalogItem,
  SubscriptionUsageSummary,
  SyncConflictRecord,
} from './commerce.types.ts';

/**
 * Transactional repository unit-of-work passed to domain services inside
 * `runTenantTransaction(businessId, userId, fn)` so every multi-record
 * financial write commits or rolls back atomically.
 */
export interface CommerceTx {
  getBusinessConfig(businessId: string): Promise<BusinessTaxAndStockConfig | null>;

  // Locations (D-02 single active location)
  listLocations(businessId: string): Promise<BusinessLocationRecord[]>;
  updateLocation(
    businessId: string,
    locationId: string,
    patch: { name?: string; address?: string | null; phone?: string | null },
  ): Promise<BusinessLocationRecord | null>;

  // Categories & Products
  listCategories(
    businessId: string,
    opts: { limit: number; offset: number; search?: string; isActive?: boolean },
  ): Promise<PaginatedResult<ProductCategoryRecord>>;
  findCategoryByName(businessId: string, name: string): Promise<ProductCategoryRecord | null>;
  getCategoryById(businessId: string, categoryId: string): Promise<ProductCategoryRecord | null>;
  insertCategory(record: ProductCategoryRecord): Promise<ProductCategoryRecord>;
  updateCategory(
    businessId: string,
    categoryId: string,
    patch: { name?: string; description?: string | null; isActive?: boolean },
  ): Promise<ProductCategoryRecord | null>;

  countActiveProducts(businessId: string): Promise<number>;
  listProducts(
    businessId: string,
    opts: {
      limit: number;
      offset: number;
      search?: string;
      categoryId?: string;
      lowStockOnly?: boolean;
      isActive?: boolean;
    },
  ): Promise<PaginatedResult<ProductRecord>>;
  getProductById(businessId: string, productId: string): Promise<ProductRecord | null>;
  lockProductsByIds(businessId: string, productIds: string[]): Promise<ProductRecord[]>;
  findProductBySku(businessId: string, sku: string): Promise<ProductRecord | null>;
  insertProduct(record: ProductRecord): Promise<ProductRecord>;
  updateProduct(
    businessId: string,
    productId: string,
    patch: Partial<
      Pick<
        ProductRecord,
        | 'categoryId'
        | 'sku'
        | 'barcode'
        | 'name'
        | 'unit'
        | 'sellingPrice'
        | 'costPrice'
        | 'weightedAvgCost'
        | 'lastPositiveWac'
        | 'onHand'
        | 'reorderLevel'
        | 'isTaxExempt'
        | 'isActive'
      >
    >,
  ): Promise<ProductRecord | null>;

  // Inventory Movements & Restocks
  insertStockMovement(record: StockMovementRecord): Promise<StockMovementRecord>;
  listStockMovements(
    businessId: string,
    opts: {
      limit: number;
      offset: number;
      productId?: string;
      movementType?: StockMovementRecord['movementType'];
      from?: string;
      to?: string;
    },
  ): Promise<PaginatedResult<StockMovementRecord>>;
  insertRestockBatch(record: RestockBatchRecord): Promise<RestockBatchRecord>;
  listRestockBatches(
    businessId: string,
    opts: { limit: number; offset: number; from?: string; to?: string },
  ): Promise<PaginatedResult<RestockBatchRecord>>;
  getRestockBatchById(businessId: string, batchId: string): Promise<RestockBatchRecord | null>;

  // Sales, Receipts & Returns
  nextReceiptNumber(businessId: string, prefix: string, dateKey: string): Promise<string>;
  findSaleByClientUuid(businessId: string, clientSaleUuid: string): Promise<SaleRecord | null>;
  insertSale(record: SaleRecord): Promise<SaleRecord>;
  getSaleById(businessId: string, saleId: string): Promise<SaleRecord | null>;
  listSales(
    businessId: string,
    opts: {
      limit: number;
      offset: number;
      status?: SaleRecord['status'];
      paymentStatus?: SaleRecord['paymentStatus'];
      customerId?: string;
      cashierUserId?: string;
      search?: string;
      from?: string;
      to?: string;
    },
  ): Promise<PaginatedResult<SaleRecord>>;
  updateSaleAfterReturn(
    businessId: string,
    saleId: string,
    patch: {
      status: SaleRecord['status'];
      paymentStatus: SaleRecord['paymentStatus'];
      creditRemaining: string;
      itemReturnedTotals: Record<string, string>;
      saleReturn: SaleReturnRecord;
    },
  ): Promise<SaleRecord>;
  updateSaleCreditPayment(
    businessId: string,
    saleId: string,
    patch: {
      amountPaid: string;
      creditRemaining: string;
      paymentStatus: SaleRecord['paymentStatus'];
    },
  ): Promise<void>;
  insertReceipt(record: ReceiptRecord): Promise<ReceiptRecord>;
  getReceiptById(businessId: string, receiptId: string): Promise<ReceiptRecord | null>;

  // Customers & Debt Payments
  listCustomers(
    businessId: string,
    opts: { limit: number; offset: number; search?: string; hasDebtOnly?: boolean },
  ): Promise<PaginatedResult<CustomerRecord>>;
  getCustomerById(businessId: string, customerId: string): Promise<CustomerRecord | null>;
  insertCustomer(record: CustomerRecord): Promise<CustomerRecord>;
  updateCustomer(
    businessId: string,
    customerId: string,
    patch: Partial<
      Pick<
        CustomerRecord,
        | 'fullName'
        | 'phone'
        | 'email'
        | 'address'
        | 'creditLimit'
        | 'outstandingBalance'
        | 'isActive'
      >
    >,
  ): Promise<CustomerRecord | null>;
  listOpenCreditSalesForCustomer(businessId: string, customerId: string): Promise<SaleRecord[]>;
  insertDebtPayment(record: CustomerDebtPaymentRecord): Promise<CustomerDebtPaymentRecord>;
  getDebtPaymentById(
    businessId: string,
    customerId: string,
    paymentId: string,
  ): Promise<CustomerDebtPaymentRecord | null>;
  listDebtPaymentsForCustomer(
    businessId: string,
    customerId: string,
  ): Promise<CustomerDebtPaymentRecord[]>;
  markDebtPaymentReversed(
    businessId: string,
    paymentId: string,
    patch: { reversalReason: string; reversedBy: string; reversedAt: string },
  ): Promise<CustomerDebtPaymentRecord | null>;

  // Expenses
  listExpenseCategories(businessId: string): Promise<ExpenseCategoryRecord[]>;
  findExpenseCategoryByName(
    businessId: string,
    name: string,
  ): Promise<ExpenseCategoryRecord | null>;
  getExpenseCategoryById(
    businessId: string,
    categoryId: string,
  ): Promise<ExpenseCategoryRecord | null>;
  insertExpenseCategory(record: ExpenseCategoryRecord): Promise<ExpenseCategoryRecord>;
  listExpenses(
    businessId: string,
    opts: {
      limit: number;
      offset: number;
      categoryId?: string;
      status?: 'posted' | 'reversed';
      paymentMethod?: 'cash' | 'transfer' | 'pos_card';
      from?: string;
      to?: string;
    },
  ): Promise<PaginatedResult<ExpenseRecord>>;
  getExpenseById(businessId: string, expenseId: string): Promise<ExpenseRecord | null>;
  insertExpense(record: ExpenseRecord): Promise<ExpenseRecord>;
  markExpenseReversed(
    businessId: string,
    expenseId: string,
    patch: { reversalReason: string; reversedBy: string; reversedAt: string },
  ): Promise<ExpenseRecord | null>;

  // Billing & Subscriptions (D-01, D-07)
  listSubscriptionPlans(): Promise<SubscriptionPlanCatalogItem[]>;
  findPlanByCode(planCode: string): Promise<SubscriptionPlanCatalogItem | null>;
  getSubscriptionUsage(businessId: string): Promise<SubscriptionUsageSummary>;
  listSubscriptionInvoices(
    businessId: string,
    opts: { limit: number; offset: number },
  ): Promise<PaginatedResult<SubscriptionInvoiceRecord>>;
  insertSubscriptionInvoice(record: SubscriptionInvoiceRecord): Promise<SubscriptionInvoiceRecord>;
  findSubscriptionInvoiceByReference(reference: string): Promise<SubscriptionInvoiceRecord | null>;
  markSubscriptionInvoicePaid(
    reference: string,
    paidAt: string,
  ): Promise<SubscriptionInvoiceRecord | null>;
  activateBusinessSubscription(businessId: string, planId: string, paidAt: string): Promise<void>;
  findWebhookEvent(
    provider: 'paystack',
    providerEventId: string,
  ): Promise<PaymentWebhookEventRecord | null>;
  insertWebhookEvent(record: PaymentWebhookEventRecord): Promise<PaymentWebhookEventRecord>;

  // Sync & Conflicts
  getDeviceForBusiness(businessId: string, deviceId: string): Promise<ActiveDeviceLookup | null>;
  insertSyncConflict(record: SyncConflictRecord): Promise<SyncConflictRecord>;
  listSyncConflicts(
    businessId: string,
    opts: { limit: number; offset: number; status?: 'open' | 'resolved' },
  ): Promise<PaginatedResult<SyncConflictRecord>>;
  getSyncConflictById(businessId: string, conflictId: string): Promise<SyncConflictRecord | null>;
  resolveSyncConflict(
    businessId: string,
    conflictId: string,
    patch: {
      action: 'accept_with_adjustment' | 'reject_and_reverse' | 'acknowledge';
      note: string;
      resolvedBy: string;
      resolvedAt: string;
    },
  ): Promise<SyncConflictRecord | null>;

  // Approved Notifications (D-12 In-App)
  insertNotification(record: NotificationRecord): Promise<NotificationRecord>;
  listNotifications(
    businessId: string,
    recipientUserId: string,
    opts: { limit: number; offset: number; unreadOnly?: boolean },
  ): Promise<PaginatedResult<NotificationRecord> & { unreadCount: number }>;
  markNotificationRead(
    businessId: string,
    recipientUserId: string,
    notificationId: string,
  ): Promise<NotificationRecord | null>;
  markAllNotificationsRead(businessId: string, recipientUserId: string): Promise<number>;

  // Atomic Audit Event Writer
  recordAudit(event: AuditEventInput): Promise<AuditLogRecord>;
}

export interface CommerceRepository {
  runTenantTransaction<T>(
    businessId: string,
    userId: string,
    fn: (tx: CommerceTx) => Promise<T>,
  ): Promise<T>;
  runSystemTransaction<T>(fn: (tx: CommerceTx) => Promise<T>): Promise<T>;
}

interface InMemoryStateSnapshot {
  businessConfigs: Map<string, BusinessTaxAndStockConfig>;
  locations: Map<string, BusinessLocationRecord>;
  categories: Map<string, ProductCategoryRecord>;
  products: Map<string, ProductRecord>;
  movements: StockMovementRecord[];
  restocks: Map<string, RestockBatchRecord>;
  sequences: Map<string, number>;
  sales: Map<string, SaleRecord>;
  receipts: Map<string, ReceiptRecord>;
  customers: Map<string, CustomerRecord>;
  debtPayments: Map<string, CustomerDebtPaymentRecord>;
  expenseCategories: Map<string, ExpenseCategoryRecord>;
  expenses: Map<string, ExpenseRecord>;
  plans: Map<string, SubscriptionPlanCatalogItem>;
  invoices: Map<string, SubscriptionInvoiceRecord>;
  webhookEvents: Map<string, PaymentWebhookEventRecord>;
  devices: Map<string, ActiveDeviceLookup>;
  syncConflicts: Map<string, SyncConflictRecord>;
  notifications: Map<string, NotificationRecord>;
  auditLogs: AuditLogRecord[];
  usageOverrides: Map<string, SubscriptionUsageSummary>;
}

/**
 * Atomic transactional In-Memory CommerceRepository used in automated tests.
 * Deep-clones state before each transaction and restores the exact prior snapshot
 * on any thrown error, faithfully modeling PostgreSQL ROLLBACK atomicity.
 */
export class InMemoryCommerceRepository implements CommerceRepository {
  private state: InMemoryStateSnapshot;
  public failAfterNextSaleInsert = false;

  constructor() {
    this.state = {
      businessConfigs: new Map(),
      locations: new Map(),
      categories: new Map(),
      products: new Map(),
      movements: [],
      restocks: new Map(),
      sequences: new Map(),
      sales: new Map(),
      receipts: new Map(),
      customers: new Map(),
      debtPayments: new Map(),
      expenseCategories: new Map(),
      expenses: new Map(),
      plans: new Map([
        [
          'trial_14d',
          {
            id: '00000000-0000-4000-8000-000000000001',
            planCode: 'trial_14d',
            displayName: '14-Day Free Trial',
            billingInterval: 'trial',
            priceAmount: '0.00',
            currencyCode: 'NGN',
            maxStaff: 3,
            maxProducts: 250,
            maxOfflineDevices: 2,
            isActive: true,
          },
        ],
      ]),
      invoices: new Map(),
      webhookEvents: new Map(),
      devices: new Map(),
      syncConflicts: new Map(),
      notifications: new Map(),
      auditLogs: [],
      usageOverrides: new Map(),
    };
  }

  seedBusinessConfig(config: BusinessTaxAndStockConfig): void {
    this.state.businessConfigs.set(config.businessId, structuredClone(config));
    const now = new Date().toISOString();
    this.state.locations.set(config.defaultLocationId, {
      id: config.defaultLocationId,
      businessId: config.businessId,
      name: config.locationName,
      address: config.locationAddress,
      phone: config.locationPhone,
      isDefault: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  seedPlan(plan: SubscriptionPlanCatalogItem): void {
    this.state.plans.set(plan.planCode, structuredClone(plan));
  }

  seedDevice(device: ActiveDeviceLookup): void {
    this.state.devices.set(device.id, structuredClone(device));
  }

  seedNotification(notification: NotificationRecord): void {
    this.state.notifications.set(notification.id, structuredClone(notification));
  }

  getAuditLogs(businessId: string): AuditLogRecord[] {
    return this.state.auditLogs.filter((l) => l.businessId === businessId);
  }

  getAllSales(businessId: string): SaleRecord[] {
    return [...this.state.sales.values()].filter((s) => s.businessId === businessId);
  }

  getAllMovements(businessId: string): StockMovementRecord[] {
    return this.state.movements.filter((m) => m.businessId === businessId);
  }

  private createTx(draft: InMemoryStateSnapshot): CommerceTx {
    const repo = this;
    return {
      async getBusinessConfig(businessId) {
        const cfg = draft.businessConfigs.get(businessId);
        return cfg ? structuredClone(cfg) : null;
      },

      async listLocations(businessId) {
        return [...draft.locations.values()]
          .filter((l) => l.businessId === businessId && l.isActive)
          .map((l) => structuredClone(l));
      },

      async updateLocation(businessId, locationId, patch) {
        const loc = draft.locations.get(locationId);
        if (!loc || loc.businessId !== businessId || !loc.isActive) {
          return null;
        }
        if (patch.name !== undefined) loc.name = patch.name;
        if (patch.address !== undefined) loc.address = patch.address;
        if (patch.phone !== undefined) loc.phone = patch.phone;
        loc.updatedAt = new Date().toISOString();
        const cfg = draft.businessConfigs.get(businessId);
        if (cfg && cfg.defaultLocationId === locationId) {
          cfg.locationName = loc.name;
          cfg.locationAddress = loc.address;
          cfg.locationPhone = loc.phone;
        }
        return structuredClone(loc);
      },

      async listCategories(businessId, opts) {
        let rows = [...draft.categories.values()].filter((c) => c.businessId === businessId);
        if (opts.isActive !== undefined) {
          rows = rows.filter((c) => c.isActive === opts.isActive);
        }
        if (opts.search) {
          const q = opts.search.toLowerCase();
          rows = rows.filter((c) => c.name.toLowerCase().includes(q));
        }
        rows.sort((a, b) => a.name.localeCompare(b.name));
        return {
          total: rows.length,
          items: rows.slice(opts.offset, opts.offset + opts.limit).map((r) => structuredClone(r)),
        };
      },

      async findCategoryByName(businessId, name) {
        const target = name.trim().toLowerCase();
        const found = [...draft.categories.values()].find(
          (c) => c.businessId === businessId && c.name.toLowerCase() === target,
        );
        return found ? structuredClone(found) : null;
      },

      async getCategoryById(businessId, categoryId) {
        const cat = draft.categories.get(categoryId);
        return cat && cat.businessId === businessId ? structuredClone(cat) : null;
      },

      async insertCategory(record) {
        draft.categories.set(record.id, structuredClone(record));
        return structuredClone(record);
      },

      async updateCategory(businessId, categoryId, patch) {
        const cat = draft.categories.get(categoryId);
        if (!cat || cat.businessId !== businessId) return null;
        if (patch.name !== undefined) cat.name = patch.name;
        if (patch.description !== undefined) cat.description = patch.description;
        if (patch.isActive !== undefined) cat.isActive = patch.isActive;
        cat.updatedAt = new Date().toISOString();
        return structuredClone(cat);
      },

      async countActiveProducts(businessId) {
        return [...draft.products.values()].filter((p) => p.businessId === businessId && p.isActive)
          .length;
      },

      async listProducts(businessId, opts) {
        let rows = [...draft.products.values()].filter((p) => p.businessId === businessId);
        if (opts.categoryId) rows = rows.filter((p) => p.categoryId === opts.categoryId);
        if (opts.isActive !== undefined) rows = rows.filter((p) => p.isActive === opts.isActive);
        if (opts.lowStockOnly) {
          rows = rows.filter((p) => Number(p.onHand) <= Number(p.reorderLevel));
        }
        if (opts.search) {
          const q = opts.search.toLowerCase();
          rows = rows.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              (p.sku ?? '').toLowerCase().includes(q) ||
              (p.barcode ?? '').toLowerCase().includes(q),
          );
        }
        rows.sort((a, b) => a.name.localeCompare(b.name));
        return {
          total: rows.length,
          items: rows.slice(opts.offset, opts.offset + opts.limit).map((r) => structuredClone(r)),
        };
      },

      async getProductById(businessId, productId) {
        const p = draft.products.get(productId);
        return p && p.businessId === businessId ? structuredClone(p) : null;
      },

      async lockProductsByIds(businessId, productIds) {
        const uniqueSorted = [...new Set(productIds)].sort();
        const found: ProductRecord[] = [];
        for (const id of uniqueSorted) {
          const p = draft.products.get(id);
          if (p && p.businessId === businessId) {
            found.push(structuredClone(p));
          }
        }
        return found;
      },

      async findProductBySku(businessId, sku) {
        const norm = sku.trim().toLowerCase();
        const found = [...draft.products.values()].find(
          (p) => p.businessId === businessId && p.sku?.toLowerCase() === norm,
        );
        return found ? structuredClone(found) : null;
      },

      async insertProduct(record) {
        draft.products.set(record.id, structuredClone(record));
        return structuredClone(record);
      },

      async updateProduct(businessId, productId, patch) {
        const prod = draft.products.get(productId);
        if (!prod || prod.businessId !== businessId) return null;
        Object.assign(prod, patch, { updatedAt: new Date().toISOString() });
        return structuredClone(prod);
      },

      async insertStockMovement(record) {
        draft.movements.unshift(structuredClone(record));
        return structuredClone(record);
      },

      async listStockMovements(businessId, opts) {
        let rows = draft.movements.filter((m) => m.businessId === businessId);
        if (opts.productId) rows = rows.filter((m) => m.productId === opts.productId);
        if (opts.movementType) rows = rows.filter((m) => m.movementType === opts.movementType);
        if (opts.from) rows = rows.filter((m) => m.createdAt >= opts.from!);
        if (opts.to) rows = rows.filter((m) => m.createdAt <= opts.to!);
        return {
          total: rows.length,
          items: rows.slice(opts.offset, opts.offset + opts.limit).map((r) => structuredClone(r)),
        };
      },

      async insertRestockBatch(record) {
        draft.restocks.set(record.id, structuredClone(record));
        return structuredClone(record);
      },

      async listRestockBatches(businessId, opts) {
        let rows = [...draft.restocks.values()].filter((r) => r.businessId === businessId);
        if (opts.from) rows = rows.filter((r) => r.receivedAt >= opts.from!);
        if (opts.to) rows = rows.filter((r) => r.receivedAt <= opts.to!);
        rows.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
        return {
          total: rows.length,
          items: rows.slice(opts.offset, opts.offset + opts.limit).map((r) => structuredClone(r)),
        };
      },

      async getRestockBatchById(businessId, batchId) {
        const batch = draft.restocks.get(batchId);
        return batch && batch.businessId === businessId ? structuredClone(batch) : null;
      },

      async nextReceiptNumber(businessId, prefix, dateKey) {
        const seqKey = `${businessId}:${prefix}:${dateKey}`;
        const next = (draft.sequences.get(seqKey) ?? 0) + 1;
        draft.sequences.set(seqKey, next);
        return `${prefix}-${dateKey}-${String(next).padStart(4, '0')}`;
      },

      async findSaleByClientUuid(businessId, clientSaleUuid) {
        const found = [...draft.sales.values()].find(
          (s) => s.businessId === businessId && s.clientSaleUuid === clientSaleUuid,
        );
        return found ? structuredClone(found) : null;
      },

      async insertSale(record) {
        draft.sales.set(record.id, structuredClone(record));
        if (repo.failAfterNextSaleInsert) {
          repo.failAfterNextSaleInsert = false;
          throw new Error('SIMULATED_MID_TRANSACTION_FAILURE');
        }
        return structuredClone(record);
      },

      async getSaleById(businessId, saleId) {
        const sale = draft.sales.get(saleId);
        return sale && sale.businessId === businessId ? structuredClone(sale) : null;
      },

      async listSales(businessId, opts) {
        let rows = [...draft.sales.values()].filter((s) => s.businessId === businessId);
        if (opts.status) rows = rows.filter((s) => s.status === opts.status);
        if (opts.paymentStatus) rows = rows.filter((s) => s.paymentStatus === opts.paymentStatus);
        if (opts.customerId) rows = rows.filter((s) => s.customerId === opts.customerId);
        if (opts.cashierUserId) rows = rows.filter((s) => s.soldBy === opts.cashierUserId);
        if (opts.search) {
          const q = opts.search.toLowerCase();
          rows = rows.filter((s) => s.saleNumber.toLowerCase().includes(q));
        }
        if (opts.from) rows = rows.filter((s) => s.soldAt >= opts.from!);
        if (opts.to) rows = rows.filter((s) => s.soldAt <= opts.to!);
        rows.sort((a, b) => b.soldAt.localeCompare(a.soldAt));
        return {
          total: rows.length,
          items: rows.slice(opts.offset, opts.offset + opts.limit).map((r) => structuredClone(r)),
        };
      },

      async updateSaleAfterReturn(businessId, saleId, patch) {
        const sale = draft.sales.get(saleId);
        if (!sale || sale.businessId !== businessId) {
          throw new Error('Sale not found during updateSaleAfterReturn.');
        }
        sale.status = patch.status;
        sale.paymentStatus = patch.paymentStatus;
        sale.creditRemaining = patch.creditRemaining;
        for (const item of sale.items) {
          const updatedQty = patch.itemReturnedTotals[item.id];
          if (updatedQty !== undefined) {
            item.quantityReturned = updatedQty;
          }
        }
        sale.returns.push(structuredClone(patch.saleReturn));
        return structuredClone(sale);
      },

      async updateSaleCreditPayment(businessId, saleId, patch) {
        const sale = draft.sales.get(saleId);
        if (!sale || sale.businessId !== businessId) return;
        sale.amountPaid = patch.amountPaid;
        sale.creditRemaining = patch.creditRemaining;
        sale.paymentStatus = patch.paymentStatus;
      },

      async insertReceipt(record) {
        draft.receipts.set(record.id, structuredClone(record));
        return structuredClone(record);
      },

      async getReceiptById(businessId, receiptId) {
        const rec = draft.receipts.get(receiptId);
        return rec && rec.businessId === businessId ? structuredClone(rec) : null;
      },

      async listCustomers(businessId, opts) {
        let rows = [...draft.customers.values()].filter((c) => c.businessId === businessId);
        if (opts.hasDebtOnly) rows = rows.filter((c) => Number(c.outstandingBalance) > 0);
        if (opts.search) {
          const q = opts.search.toLowerCase();
          rows = rows.filter(
            (c) =>
              c.fullName.toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q),
          );
        }
        rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
        return {
          total: rows.length,
          items: rows.slice(opts.offset, opts.offset + opts.limit).map((r) => structuredClone(r)),
        };
      },

      async getCustomerById(businessId, customerId) {
        const c = draft.customers.get(customerId);
        return c && c.businessId === businessId ? structuredClone(c) : null;
      },

      async insertCustomer(record) {
        draft.customers.set(record.id, structuredClone(record));
        return structuredClone(record);
      },

      async updateCustomer(businessId, customerId, patch) {
        const c = draft.customers.get(customerId);
        if (!c || c.businessId !== businessId) return null;
        Object.assign(c, patch, { updatedAt: new Date().toISOString() });
        return structuredClone(c);
      },

      async listOpenCreditSalesForCustomer(businessId, customerId) {
        return [...draft.sales.values()]
          .filter(
            (s) =>
              s.businessId === businessId &&
              s.customerId === customerId &&
              s.status !== 'voided' &&
              Number(s.creditRemaining) > 0,
          )
          .sort((a, b) => a.soldAt.localeCompare(b.soldAt))
          .map((s) => structuredClone(s));
      },

      async insertDebtPayment(record) {
        draft.debtPayments.set(record.id, structuredClone(record));
        return structuredClone(record);
      },

      async getDebtPaymentById(businessId, customerId, paymentId) {
        const p = draft.debtPayments.get(paymentId);
        if (!p || p.businessId !== businessId || p.customerId !== customerId) return null;
        return structuredClone(p);
      },

      async listDebtPaymentsForCustomer(businessId, customerId) {
        return [...draft.debtPayments.values()]
          .filter((p) => p.businessId === businessId && p.customerId === customerId)
          .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
          .map((p) => structuredClone(p));
      },

      async markDebtPaymentReversed(businessId, paymentId, patch) {
        const p = draft.debtPayments.get(paymentId);
        if (!p || p.businessId !== businessId) return null;
        p.status = 'reversed';
        p.reversalReason = patch.reversalReason;
        p.reversedBy = patch.reversedBy;
        p.reversedAt = patch.reversedAt;
        return structuredClone(p);
      },

      async listExpenseCategories(businessId) {
        return [...draft.expenseCategories.values()]
          .filter((c) => c.businessId === businessId)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => structuredClone(c));
      },

      async findExpenseCategoryByName(businessId, name) {
        const target = name.trim().toLowerCase();
        const found = [...draft.expenseCategories.values()].find(
          (c) => c.businessId === businessId && c.name.toLowerCase() === target,
        );
        return found ? structuredClone(found) : null;
      },

      async getExpenseCategoryById(businessId, categoryId) {
        const c = draft.expenseCategories.get(categoryId);
        return c && c.businessId === businessId ? structuredClone(c) : null;
      },

      async insertExpenseCategory(record) {
        draft.expenseCategories.set(record.id, structuredClone(record));
        return structuredClone(record);
      },

      async listExpenses(businessId, opts) {
        let rows = [...draft.expenses.values()].filter((e) => e.businessId === businessId);
        if (opts.categoryId) rows = rows.filter((e) => e.categoryId === opts.categoryId);
        if (opts.status) rows = rows.filter((e) => e.status === opts.status);
        if (opts.paymentMethod) rows = rows.filter((e) => e.paymentMethod === opts.paymentMethod);
        if (opts.from) rows = rows.filter((e) => e.createdAt >= opts.from!);
        if (opts.to) rows = rows.filter((e) => e.createdAt <= opts.to!);
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return {
          total: rows.length,
          items: rows.slice(opts.offset, opts.offset + opts.limit).map((r) => structuredClone(r)),
        };
      },

      async getExpenseById(businessId, expenseId) {
        const e = draft.expenses.get(expenseId);
        return e && e.businessId === businessId ? structuredClone(e) : null;
      },

      async insertExpense(record) {
        draft.expenses.set(record.id, structuredClone(record));
        return structuredClone(record);
      },

      async markExpenseReversed(businessId, expenseId, patch) {
        const e = draft.expenses.get(expenseId);
        if (!e || e.businessId !== businessId) return null;
        e.status = 'reversed';
        e.reversalReason = patch.reversalReason;
        e.reversedBy = patch.reversedBy;
        e.reversedAt = patch.reversedAt;
        return structuredClone(e);
      },

      async listSubscriptionPlans() {
        return [...draft.plans.values()].filter((p) => p.isActive).map((p) => structuredClone(p));
      },

      async findPlanByCode(planCode) {
        const p = draft.plans.get(planCode);
        return p && p.isActive ? structuredClone(p) : null;
      },

      async getSubscriptionUsage(businessId) {
        const override = draft.usageOverrides.get(businessId);
        const productCount = [...draft.products.values()].filter(
          (p) => p.businessId === businessId && p.isActive,
        ).length;
        const activeDeviceCount = [...draft.devices.values()].filter(
          (d) => d.businessId === businessId && d.status === 'active',
        ).length;
        if (override) {
          return { ...structuredClone(override), productCount, activeDeviceCount };
        }
        return {
          subscription: null,
          status: 'trialing',
          staffCount: 1,
          productCount,
          activeDeviceCount,
        };
      },

      async listSubscriptionInvoices(businessId, opts) {
        const rows = [...draft.invoices.values()]
          .filter((i) => i.businessId === businessId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return {
          total: rows.length,
          items: rows.slice(opts.offset, opts.offset + opts.limit).map((r) => structuredClone(r)),
        };
      },

      async insertSubscriptionInvoice(record) {
        draft.invoices.set(record.providerReference, structuredClone(record));
        return structuredClone(record);
      },

      async findSubscriptionInvoiceByReference(reference) {
        const inv = draft.invoices.get(reference);
        return inv ? structuredClone(inv) : null;
      },

      async markSubscriptionInvoicePaid(reference, paidAt) {
        const inv = draft.invoices.get(reference);
        if (!inv) return null;
        inv.status = 'paid';
        inv.paidAt = paidAt;
        return structuredClone(inv);
      },

      async activateBusinessSubscription(businessId, planId, paidAt) {
        const existing = draft.usageOverrides.get(businessId);
        const periodEnd = new Date(Date.parse(paidAt) + 30 * 86_400_000).toISOString();
        const plan = [...draft.plans.values()].find((p) => p.id === planId);
        draft.usageOverrides.set(businessId, {
          status: 'active',
          staffCount: existing?.staffCount ?? 1,
          productCount: existing?.productCount ?? 0,
          activeDeviceCount: existing?.activeDeviceCount ?? 0,
          subscription: {
            id: existing?.subscription?.id ?? randomUUID(),
            businessId,
            planId,
            status: 'active',
            trialEndsAt: null,
            currentPeriodStart: paidAt,
            currentPeriodEnd: periodEnd,
            graceEndsAt: null,
            limits: {
              planId,
              planCode: plan?.planCode ?? 'active_plan',
              displayName: plan?.displayName ?? 'Active Plan',
              maxStaff: plan?.maxStaff ?? 5,
              maxProducts: plan?.maxProducts ?? 1000,
              maxOfflineDevices: plan?.maxOfflineDevices ?? 5,
            },
          },
        });
      },

      async findWebhookEvent(provider, providerEventId) {
        const ev = draft.webhookEvents.get(`${provider}:${providerEventId}`);
        return ev ? structuredClone(ev) : null;
      },

      async insertWebhookEvent(record) {
        draft.webhookEvents.set(
          `${record.provider}:${record.providerEventId}`,
          structuredClone(record),
        );
        return structuredClone(record);
      },

      async getDeviceForBusiness(businessId, deviceId) {
        const dev = draft.devices.get(deviceId);
        if (!dev || dev.businessId !== businessId) return null;
        return structuredClone(dev);
      },

      async insertSyncConflict(record) {
        draft.syncConflicts.set(record.id, structuredClone(record));
        return structuredClone(record);
      },

      async listSyncConflicts(businessId, opts) {
        let rows = [...draft.syncConflicts.values()].filter((c) => c.businessId === businessId);
        if (opts.status) rows = rows.filter((c) => c.status === opts.status);
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return {
          total: rows.length,
          items: rows.slice(opts.offset, opts.offset + opts.limit).map((r) => structuredClone(r)),
        };
      },

      async getSyncConflictById(businessId, conflictId) {
        const c = draft.syncConflicts.get(conflictId);
        return c && c.businessId === businessId ? structuredClone(c) : null;
      },

      async resolveSyncConflict(businessId, conflictId, patch) {
        const c = draft.syncConflicts.get(conflictId);
        if (!c || c.businessId !== businessId) return null;
        c.status = 'resolved';
        c.resolutionAction = patch.action;
        c.resolutionNote = patch.note;
        c.resolvedBy = patch.resolvedBy;
        c.resolvedAt = patch.resolvedAt;
        return structuredClone(c);
      },

      async insertNotification(record) {
        draft.notifications.set(record.id, structuredClone(record));
        return structuredClone(record);
      },

      async listNotifications(businessId, recipientUserId, opts) {
        const allForUser = [...draft.notifications.values()]
          .filter((n) => n.businessId === businessId && n.recipientUserId === recipientUserId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const unreadCount = allForUser.filter((n) => !n.isRead).length;
        const filtered = opts.unreadOnly ? allForUser.filter((n) => !n.isRead) : allForUser;
        return {
          total: filtered.length,
          unreadCount,
          items: filtered
            .slice(opts.offset, opts.offset + opts.limit)
            .map((r) => structuredClone(r)),
        };
      },

      async markNotificationRead(businessId, recipientUserId, notificationId) {
        const n = draft.notifications.get(notificationId);
        if (!n || n.businessId !== businessId || n.recipientUserId !== recipientUserId) return null;
        n.isRead = true;
        n.readAt = n.readAt ?? new Date().toISOString();
        return structuredClone(n);
      },

      async markAllNotificationsRead(businessId, recipientUserId) {
        let count = 0;
        const now = new Date().toISOString();
        for (const n of draft.notifications.values()) {
          if (n.businessId === businessId && n.recipientUserId === recipientUserId && !n.isRead) {
            n.isRead = true;
            n.readAt = now;
            count += 1;
          }
        }
        return count;
      },

      async recordAudit(event) {
        const record: AuditLogRecord = {
          id: randomUUID(),
          businessId: event.businessId,
          actorUserId: event.actorUserId,
          actorRole: event.actorRole,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId ?? null,
          metadata: event.metadata ?? {},
          createdAt: new Date().toISOString(),
        };
        draft.auditLogs.unshift(record);
        return structuredClone(record);
      },
    };
  }

  async runTenantTransaction<T>(
    _businessId: string,
    _userId: string,
    fn: (tx: CommerceTx) => Promise<T>,
  ): Promise<T> {
    const draft = structuredClone(this.state);
    const result = await fn(this.createTx(draft));
    this.state = draft;
    return result;
  }

  async runSystemTransaction<T>(fn: (tx: CommerceTx) => Promise<T>): Promise<T> {
    const draft = structuredClone(this.state);
    const result = await fn(this.createTx(draft));
    this.state = draft;
    return result;
  }
}
