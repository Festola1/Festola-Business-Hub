import { apiRequest } from './api-client';
import { generateUuid } from './format';

// ============================================================================
// Domain DTOs mirroring Stage 08 /api/v1/* contracts
// ============================================================================

export interface ProductCategory {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductItem {
  id: string;
  businessId: string;
  categoryId: string | null;
  sku: string | null;
  barcode: string | null;
  name: string;
  unit: string;
  sellingPrice: string;
  costPrice?: string; // omitted for cashiers by server (D-09)
  weightedAvgCost?: string; // omitted for cashiers by server (D-09)
  lastPositiveWac?: string; // omitted for cashiers by server (D-09)
  onHand: string;
  reorderLevel: string;
  isTaxExempt: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type StockMovementType =
  | 'opening_stock'
  | 'restock_in'
  | 'sale_out'
  | 'return_restock'
  | 'return_damaged'
  | 'adjustment_in'
  | 'adjustment_out';

export interface StockMovementItem {
  id: string;
  businessId: string;
  locationId: string;
  productId: string;
  movementType: StockMovementType;
  quantityDelta: string;
  balanceAfter: string;
  unitCostSnapshot: string;
  referenceType: string;
  referenceId: string | null;
  reason: string | null;
  createdBy: string;
  createdAt: string;
}

export interface RestockBatchItem {
  id: string;
  productId: string;
  quantityReceived: string;
  unitCost: string;
  lineTotalCost: string;
  wacBefore: string;
  wacAfter: string;
}

export interface RestockBatch {
  id: string;
  batchNumber: string;
  supplierNote: string | null;
  notes: string | null;
  totalCost: string;
  receivedBy: string;
  receivedAt: string;
  items: RestockBatchItem[];
}

export type TenderMethod = 'cash' | 'transfer' | 'pos_card' | 'credit';
export type SaleStatus = 'completed' | 'partially_returned' | 'returned' | 'voided';
export type SalePaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface SaleItem {
  id: string;
  productId: string;
  productNameSnapshot: string;
  unitSnapshot: string;
  quantity: string;
  quantityReturned: string;
  unitPrice: string;
  discountAmount: string;
  taxRateSnapshot: string;
  taxAmount: string;
  lineTotal: string;
  unitCostSnapshot?: string;
  lineCogs?: string;
  isTaxExemptSnapshot: boolean;
}

export interface SalePayment {
  id: string;
  method: TenderMethod;
  amount: string;
  referenceNote: string | null;
  createdAt: string;
}

export interface ReceiptRecord {
  id: string;
  businessId: string;
  receiptNumber: string;
  receiptType: 'sale' | 'debt_payment';
  saleId: string | null;
  debtPaymentId: string | null;
  snapshotPayload: Record<string, unknown>;
  issuedBy: string;
  issuedAt: string;
}

export interface SaleReturnItemRecord {
  id: string;
  saleItemId: string;
  productId: string;
  quantityReturned: string;
  disposition: 'restock' | 'damaged';
  unitPriceSnapshot: string;
  taxReversed: string;
  lineReversedTotal: string;
}

export interface SaleRefundRecord {
  id: string;
  method: 'cash' | 'transfer' | 'pos_card';
  amount: string;
  referenceNote: string | null;
  processedBy: string;
  createdAt: string;
}

export interface SaleReturnRecord {
  id: string;
  returnType: 'full_void' | 'return';
  reason: string;
  totalReversed: string;
  debtReducedAmount: string;
  refundAmount: string;
  processedBy: string;
  createdAt: string;
  items?: SaleReturnItemRecord[];
  refund?: SaleRefundRecord | null;
}

export interface SaleRecord {
  id: string;
  businessId: string;
  locationId: string;
  customerId: string | null;
  deviceId: string | null;
  clientSaleUuid: string;
  saleNumber: string;
  status: SaleStatus;
  paymentStatus: SalePaymentStatus;
  subtotalAmount: string;
  discountAmount: string;
  taxEnabledSnapshot: boolean;
  taxModeSnapshot: 'exclusive' | 'inclusive';
  taxRateSnapshot: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  creditAmount: string;
  creditRemaining: string;
  totalCogs?: string;
  notes: string | null;
  soldBy: string;
  soldAt: string;
  createdAt: string;
  items: SaleItem[];
  payments: SalePayment[];
  receipt: ReceiptRecord | null;
  returns: SaleReturnRecord[];
}

export interface CustomerItem {
  id: string;
  businessId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  creditLimit: string | null;
  outstandingBalance: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DebtPaymentRecord {
  id: string;
  customerId: string;
  amount: string;
  method: 'cash' | 'transfer' | 'pos_card';
  referenceNote: string | null;
  status: 'posted' | 'reversed';
  reversalReason: string | null;
  paidAt: string;
  receipt: ReceiptRecord | null;
}

export interface BusinessDebtPaymentItem extends DebtPaymentRecord {
  customerName: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface ExpenseItem {
  id: string;
  categoryId: string;
  amount: string;
  paymentMethod: 'cash' | 'transfer' | 'pos_card';
  description: string;
  incurredOn: string;
  status: 'posted' | 'reversed';
  reversalReason: string | null;
  createdAt: string;
}

export interface FinancialSummaryReport {
  salesCount: number;
  grossSales: string;
  returnsAndVoids: string;
  netSales: string;
  cashCollectedOnSales: string;
  creditExtended: string;
  taxCollected: string;
  cogs: string;
  grossProfit: string;
  operatingExpenses: string;
  netOperatingProfit: string;
  outstandingReceivables: string;
}

export interface SalesByDayPoint {
  date: string;
  salesCount: number;
  grossSales: string;
  netSales: string;
}

export interface TopProductRow {
  productId: string;
  productName: string;
  unitsSold: string;
  revenue: string;
  cogs?: string;
}

export interface SalesByCategoryRow {
  categoryId: string | null;
  categoryName: string;
  unitsSold: string;
  revenue: string;
  cogs: string;
  grossProfit: string;
  sharePercent: number;
}

export interface InventoryValuationReport {
  activeProductCount: number;
  totalCostValuation: string;
  totalRetailValue: string;
  lowStockCount: number;
  lowStockItems: Array<{
    productId: string;
    name: string;
    onHand: string;
    reorderLevel: string;
  }>;
}

export interface DebtorsAgingReport {
  buckets: {
    days0to30: string;
    days31to60: string;
    days61to90: string;
    days90Plus: string;
  };
  debtors: Array<{
    customerId: string;
    fullName: string;
    phone: string | null;
    outstandingBalance: string;
    openInvoiceCount: number;
  }>;
}

export interface SyncConflictItem {
  id: string;
  deviceId: string | null;
  clientOperationUuid: string;
  entityType: string;
  reason: string;
  status: 'open' | 'resolved';
  resolutionAction: 'accept_with_adjustment' | 'reject_and_reverse' | 'acknowledge' | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SyncBootstrapPayload {
  syncCursor: string;
  business: Record<string, unknown> | null;
  products: ProductItem[];
  customers: CustomerItem[];
}

export interface SubscriptionPlanCatalogItem {
  id: string;
  planCode: string;
  displayName: string;
  billingInterval: 'trial' | 'monthly' | 'annual';
  priceAmount: string;
  currencyCode: string;
  maxStaff: number;
  maxProducts: number;
  maxOfflineDevices: number;
  isActive: boolean;
}

export interface SubscriptionInvoiceItem {
  id: string;
  planId: string;
  provider: 'paystack';
  providerReference: string;
  amount: string;
  currencyCode: string;
  status: 'pending' | 'paid' | 'failed';
  checkoutUrl: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface CurrentSubscriptionSummary {
  subscription: {
    id: string;
    businessId: string;
    planId: string;
    planCode: string;
    displayName: string;
    status: 'trialing' | 'active' | 'grace_period' | 'read_only' | 'suspended';
    trialEndsAt: string | null;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    graceEndsAt: string | null;
    maxStaff: number;
    maxProducts: number;
    maxOfflineDevices: number;
  } | null;
  status: 'trialing' | 'active' | 'grace_period' | 'read_only' | 'suspended';
  staffCount: number;
  productCount: number;
  activeDeviceCount: number;
}

// ============================================================================
// Catalog & Inventory API
// ============================================================================

export function fetchProductCategories(accessToken: string, businessId: string) {
  return apiRequest<{ categories: ProductCategory[] }>('/product-categories?limit=100&offset=0', {
    accessToken,
    businessId,
  });
}

export function createProductCategory(
  accessToken: string,
  businessId: string,
  body: { name: string; description?: string | null },
) {
  return apiRequest<{ category: ProductCategory }>('/product-categories', {
    method: 'POST',
    accessToken,
    businessId,
    idempotencyKey: generateUuid(),
    body,
  });
}

export function fetchProducts(
  accessToken: string,
  businessId: string,
  opts: {
    search?: string;
    categoryId?: string;
    lowStockOnly?: boolean;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  } = {},
) {
  const q = new URLSearchParams();
  q.set('limit', String(opts.limit ?? 50));
  q.set('offset', String(opts.offset ?? 0));
  if (opts.search?.trim()) q.set('search', opts.search.trim());
  if (opts.categoryId) q.set('categoryId', opts.categoryId);
  if (opts.lowStockOnly) q.set('lowStockOnly', 'true');
  if (opts.isActive !== undefined) q.set('isActive', String(opts.isActive));

  return apiRequest<{ products: ProductItem[] }>(`/products?${q.toString()}`, {
    accessToken,
    businessId,
  });
}

export function createProduct(
  accessToken: string,
  businessId: string,
  body: {
    categoryId?: string | null;
    sku?: string | null;
    barcode?: string | null;
    name: string;
    unit: string;
    sellingPrice: string;
    costPrice?: string;
    openingStock?: string;
    reorderLevel?: string;
    isTaxExempt?: boolean;
  },
) {
  return apiRequest<{ product: ProductItem }>('/products', {
    method: 'POST',
    accessToken,
    businessId,
    idempotencyKey: generateUuid(),
    body,
  });
}

export function updateProduct(
  accessToken: string,
  businessId: string,
  productId: string,
  body: {
    categoryId?: string | null;
    sku?: string | null;
    barcode?: string | null;
    name?: string;
    unit?: string;
    sellingPrice?: string;
    reorderLevel?: string;
    isTaxExempt?: boolean;
    isActive?: boolean;
  },
) {
  return apiRequest<{ product: ProductItem }>(`/products/${productId}`, {
    method: 'PATCH',
    accessToken,
    businessId,
    body,
  });
}

export function fetchStockMovements(
  accessToken: string,
  businessId: string,
  opts: {
    movementType?: StockMovementType;
    productId?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const q = new URLSearchParams();
  q.set('limit', String(opts.limit ?? 50));
  q.set('offset', String(opts.offset ?? 0));
  if (opts.movementType) q.set('movementType', opts.movementType);
  if (opts.productId) q.set('productId', opts.productId);

  return apiRequest<{ movements: StockMovementItem[] }>(`/inventory/movements?${q.toString()}`, {
    accessToken,
    businessId,
  });
}

export function createStockAdjustment(
  accessToken: string,
  businessId: string,
  body: { productId: string; direction: 'in' | 'out'; quantity: string; reason: string },
) {
  return apiRequest<{ movement: StockMovementItem; product: ProductItem }>(
    '/inventory/adjustments',
    {
      method: 'POST',
      accessToken,
      businessId,
      idempotencyKey: generateUuid(),
      body,
    },
  );
}

export function fetchRestocks(accessToken: string, businessId: string, limit = 30) {
  return apiRequest<{ restocks: RestockBatch[] }>(`/restocks?limit=${limit}&offset=0`, {
    accessToken,
    businessId,
  });
}

export function createRestockBatch(
  accessToken: string,
  businessId: string,
  body: {
    supplierNote?: string | null;
    notes?: string | null;
    items: Array<{ productId: string; quantityReceived: string; unitCost: string }>;
  },
) {
  return apiRequest<{ restock: RestockBatch }>('/restocks', {
    method: 'POST',
    accessToken,
    businessId,
    idempotencyKey: generateUuid(),
    body,
  });
}

// ============================================================================
// Sales, POS & Receipts API
// ============================================================================

export function fetchSales(
  accessToken: string,
  businessId: string,
  opts: {
    status?: SaleStatus;
    paymentStatus?: SalePaymentStatus;
    paymentMethod?: TenderMethod;
    customerId?: string;
    from?: string;
    to?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const q = new URLSearchParams();
  q.set('limit', String(opts.limit ?? 30));
  q.set('offset', String(opts.offset ?? 0));
  if (opts.status) q.set('status', opts.status);
  if (opts.paymentStatus) q.set('paymentStatus', opts.paymentStatus);
  if (opts.paymentMethod) q.set('paymentMethod', opts.paymentMethod);
  if (opts.customerId) q.set('customerId', opts.customerId);
  if (opts.from) q.set('from', opts.from);
  if (opts.to) q.set('to', opts.to);
  if (opts.search?.trim()) q.set('search', opts.search.trim());

  return apiRequest<{ sales: SaleRecord[] }>(`/sales?${q.toString()}`, {
    accessToken,
    businessId,
  });
}

export function fetchSaleDetail(accessToken: string, businessId: string, saleId: string) {
  return apiRequest<{ sale: SaleRecord }>(`/sales/${saleId}`, {
    accessToken,
    businessId,
  });
}

export function createSale(
  accessToken: string,
  businessId: string,
  body: {
    clientSaleUuid: string;
    customerId?: string | null;
    deviceId?: string | null;
    offlineReceiptNumber?: string;
    notes?: string | null;
    items: Array<{ productId: string; quantity: string; discountAmount: string }>;
    payments: Array<{ method: TenderMethod; amount: string; referenceNote?: string | null }>;
  },
  idempotencyKey?: string,
) {
  return apiRequest<{ sale: SaleRecord }>('/sales', {
    method: 'POST',
    accessToken,
    businessId,
    idempotencyKey: idempotencyKey ?? body.clientSaleUuid,
    body,
  });
}

export function voidSale(
  accessToken: string,
  businessId: string,
  saleId: string,
  body: {
    reason: string;
    disposition: 'restock' | 'damaged';
    refundMethod: 'cash' | 'transfer' | 'pos_card';
    refundReferenceNote?: string | null;
  },
  idempotencyKey?: string,
) {
  return apiRequest<{ sale: SaleRecord; saleReturn: SaleReturnRecord }>(`/sales/${saleId}/void`, {
    method: 'POST',
    accessToken,
    businessId,
    idempotencyKey: idempotencyKey ?? generateUuid(),
    body,
  });
}

export function returnSaleItems(
  accessToken: string,
  businessId: string,
  saleId: string,
  body: {
    reason: string;
    refundMethod: 'cash' | 'transfer' | 'pos_card';
    refundReferenceNote?: string | null;
    items: Array<{ saleItemId: string; quantity: string; disposition: 'restock' | 'damaged' }>;
  },
  idempotencyKey?: string,
) {
  return apiRequest<{ sale: SaleRecord; saleReturn: SaleReturnRecord }>(
    `/sales/${saleId}/returns`,
    {
      method: 'POST',
      accessToken,
      businessId,
      idempotencyKey: idempotencyKey ?? generateUuid(),
      body,
    },
  );
}

// ============================================================================
// Customers & Debt API
// ============================================================================

export function fetchCustomers(
  accessToken: string,
  businessId: string,
  opts: { search?: string; hasDebtOnly?: boolean; limit?: number; offset?: number } = {},
) {
  const q = new URLSearchParams();
  q.set('limit', String(opts.limit ?? 50));
  q.set('offset', String(opts.offset ?? 0));
  if (opts.search?.trim()) q.set('search', opts.search.trim());
  if (opts.hasDebtOnly) q.set('hasDebtOnly', 'true');

  return apiRequest<{ customers: CustomerItem[] }>(`/customers?${q.toString()}`, {
    accessToken,
    businessId,
  });
}

export function fetchBusinessDebtPayments(
  accessToken: string,
  businessId: string,
  opts: {
    status?: 'posted' | 'reversed';
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const q = new URLSearchParams();
  q.set('limit', String(opts.limit ?? 10));
  q.set('offset', String(opts.offset ?? 0));
  if (opts.status) q.set('status', opts.status);
  if (opts.from) q.set('from', opts.from);
  if (opts.to) q.set('to', opts.to);

  return apiRequest<{ debtPayments: BusinessDebtPaymentItem[] }>(`/debt-payments?${q.toString()}`, {
    accessToken,
    businessId,
  });
}

export function fetchCustomerDetail(accessToken: string, businessId: string, customerId: string) {
  return apiRequest<{
    customer: CustomerItem;
    openCreditSales: SaleRecord[];
    debtPayments: DebtPaymentRecord[];
  }>(`/customers/${customerId}`, {
    accessToken,
    businessId,
  });
}

export function createCustomer(
  accessToken: string,
  businessId: string,
  body: {
    fullName: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    creditLimit?: string | null;
  },
) {
  return apiRequest<{ customer: CustomerItem }>('/customers', {
    method: 'POST',
    accessToken,
    businessId,
    idempotencyKey: generateUuid(),
    body,
  });
}

export function collectCustomerDebtPayment(
  accessToken: string,
  businessId: string,
  customerId: string,
  body: { amount: string; method: 'cash' | 'transfer' | 'pos_card'; referenceNote?: string | null },
) {
  return apiRequest<{ debtPayment: DebtPaymentRecord }>(`/customers/${customerId}/debt-payments`, {
    method: 'POST',
    accessToken,
    businessId,
    idempotencyKey: generateUuid(),
    body,
  });
}

export function reverseCustomerDebtPayment(
  accessToken: string,
  businessId: string,
  customerId: string,
  paymentId: string,
  reason: string,
) {
  return apiRequest<{ debtPayment: DebtPaymentRecord }>(
    `/customers/${customerId}/debt-payments/${paymentId}/reverse`,
    {
      method: 'POST',
      accessToken,
      businessId,
      idempotencyKey: generateUuid(),
      body: { reason },
    },
  );
}

// ============================================================================
// Expenses API
// ============================================================================

export function fetchExpenseCategories(accessToken: string, businessId: string) {
  return apiRequest<{ categories: ExpenseCategory[] }>('/expense-categories', {
    accessToken,
    businessId,
  });
}

export function createExpenseCategory(accessToken: string, businessId: string, name: string) {
  return apiRequest<{ category: ExpenseCategory }>('/expense-categories', {
    method: 'POST',
    accessToken,
    businessId,
    idempotencyKey: generateUuid(),
    body: { name },
  });
}

export function fetchExpenses(
  accessToken: string,
  businessId: string,
  opts: {
    categoryId?: string;
    status?: 'posted' | 'reversed';
    limit?: number;
    offset?: number;
  } = {},
) {
  const q = new URLSearchParams();
  q.set('limit', String(opts.limit ?? 50));
  q.set('offset', String(opts.offset ?? 0));
  if (opts.categoryId) q.set('categoryId', opts.categoryId);
  if (opts.status) q.set('status', opts.status);

  return apiRequest<{ expenses: ExpenseItem[] }>(`/expenses?${q.toString()}`, {
    accessToken,
    businessId,
  });
}

export function createExpense(
  accessToken: string,
  businessId: string,
  body: {
    categoryId: string;
    amount: string;
    paymentMethod: 'cash' | 'transfer' | 'pos_card';
    description: string;
    incurredOn: string;
  },
) {
  return apiRequest<{ expense: ExpenseItem }>('/expenses', {
    method: 'POST',
    accessToken,
    businessId,
    idempotencyKey: generateUuid(),
    body,
  });
}

export function reverseExpense(
  accessToken: string,
  businessId: string,
  expenseId: string,
  reason: string,
) {
  return apiRequest<{ expense: ExpenseItem }>(`/expenses/${expenseId}/reverse`, {
    method: 'POST',
    accessToken,
    businessId,
    idempotencyKey: generateUuid(),
    body: { reason },
  });
}

// ============================================================================
// Reports API (accessible even in read_only subscription mode D-01)
// ============================================================================

export function fetchFinancialSummary(
  accessToken: string,
  businessId: string,
  range?: { from?: string; to?: string },
) {
  const q = new URLSearchParams();
  if (range?.from) q.set('from', range.from);
  if (range?.to) q.set('to', range.to);
  const qs = q.toString() ? `?${q.toString()}` : '';
  return apiRequest<{ summary: FinancialSummaryReport }>(`/reports/summary${qs}`, {
    accessToken,
    businessId,
  });
}

export function fetchSalesByDay(
  accessToken: string,
  businessId: string,
  range?: { from?: string; to?: string },
) {
  const q = new URLSearchParams();
  if (range?.from) q.set('from', range.from);
  if (range?.to) q.set('to', range.to);
  const qs = q.toString() ? `?${q.toString()}` : '';
  return apiRequest<{ series: SalesByDayPoint[] }>(`/reports/sales-by-day${qs}`, {
    accessToken,
    businessId,
  });
}

export function fetchSalesByCategory(
  accessToken: string,
  businessId: string,
  range?: { from?: string; to?: string; limit?: number },
) {
  const q = new URLSearchParams();
  if (range?.from) q.set('from', range.from);
  if (range?.to) q.set('to', range.to);
  if (range?.limit) q.set('limit', String(range.limit));
  const qs = q.toString() ? `?${q.toString()}` : '';
  return apiRequest<{ categories: SalesByCategoryRow[] }>(`/reports/sales-by-category${qs}`, {
    accessToken,
    businessId,
  });
}

export function fetchTopProducts(
  accessToken: string,
  businessId: string,
  range?: { from?: string; to?: string; limit?: number },
) {
  const q = new URLSearchParams();
  if (range?.from) q.set('from', range.from);
  if (range?.to) q.set('to', range.to);
  if (range?.limit) q.set('limit', String(range.limit));
  const qs = q.toString() ? `?${q.toString()}` : '';
  return apiRequest<{ products: TopProductRow[] }>(`/reports/top-products${qs}`, {
    accessToken,
    businessId,
  });
}

export function fetchInventoryValuation(accessToken: string, businessId: string) {
  return apiRequest<{ valuation: InventoryValuationReport }>('/reports/inventory-valuation', {
    accessToken,
    businessId,
  });
}

export function fetchDebtorsAging(accessToken: string, businessId: string) {
  return apiRequest<{ aging: DebtorsAgingReport }>('/reports/debtors-aging', {
    accessToken,
    businessId,
  });
}

export async function downloadCsvReport(
  accessToken: string,
  businessId: string,
  type: 'sales' | 'expenses' | 'inventory' | 'debtors',
  range?: { from?: string; to?: string },
): Promise<{ ok: boolean; errorMessage?: string }> {
  const q = new URLSearchParams({ type });
  if (range?.from) q.set('from', range.from);
  if (range?.to) q.set('to', range.to);

  try {
    const res = await fetch(`/api/v1/reports/export?${q.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Business-ID': businessId,
      },
    });
    if (!res.ok) {
      return { ok: false, errorMessage: `Unable to export ${type} report (${res.status}).` };
    }
    const csv = await res.text();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `festola-${type}-report.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch {
    return { ok: false, errorMessage: 'Network error while exporting CSV report.' };
  }
}

// ============================================================================
// Sync & Billing API
// ============================================================================

export function fetchSyncBootstrap(accessToken: string, businessId: string, deviceId: string) {
  return apiRequest<SyncBootstrapPayload>('/sync/bootstrap', {
    accessToken,
    businessId,
    deviceId,
  });
}

export function pushSyncOperations(
  accessToken: string,
  businessId: string,
  deviceId: string,
  operations: Array<{
    operationType: 'offline_sale';
    clientOperationUuid: string;
    occurredAt: string;
    payload: {
      clientSaleUuid: string;
      customerId?: string | null;
      deviceId: string;
      offlineReceiptNumber: string;
      notes?: string | null;
      items: Array<{ productId: string; quantity: string; discountAmount: string }>;
      payments: Array<{ method: TenderMethod; amount: string; referenceNote?: string | null }>;
    };
  }>,
) {
  return apiRequest<{
    results: Array<{
      clientOperationUuid: string;
      status: 'applied' | 'conflict';
      entityId?: string;
      conflictId?: string;
      reason?: string;
    }>;
  }>('/sync/push', {
    method: 'POST',
    accessToken,
    businessId,
    deviceId,
    idempotencyKey: generateUuid(),
    body: { operations },
  });
}

export function fetchSyncConflicts(
  accessToken: string,
  businessId: string,
  status?: 'open' | 'resolved',
) {
  const qs = status ? `?status=${status}&limit=50&offset=0` : '?limit=50&offset=0';
  return apiRequest<{ conflicts: SyncConflictItem[] }>(`/sync/conflicts${qs}`, {
    accessToken,
    businessId,
  });
}

export function resolveSyncConflict(
  accessToken: string,
  businessId: string,
  conflictId: string,
  body: { action: 'accept_with_adjustment' | 'reject_and_reverse' | 'acknowledge'; note: string },
) {
  return apiRequest<{ conflict: SyncConflictItem }>(`/sync/conflicts/${conflictId}/resolve`, {
    method: 'POST',
    accessToken,
    businessId,
    idempotencyKey: generateUuid(),
    body,
  });
}

export function fetchSubscriptionPlans(accessToken: string) {
  return apiRequest<{ plans: SubscriptionPlanCatalogItem[] }>('/plans', {
    accessToken,
  });
}

export function fetchCurrentSubscription(accessToken: string, businessId: string) {
  return apiRequest<CurrentSubscriptionSummary>('/subscriptions/current', {
    accessToken,
    businessId,
  });
}

export function fetchSubscriptionInvoices(accessToken: string, businessId: string) {
  return apiRequest<{ invoices: SubscriptionInvoiceItem[] }>(
    '/subscriptions/invoices?limit=30&offset=0',
    {
      accessToken,
      businessId,
    },
  );
}

export function initiateSubscriptionCheckout(
  accessToken: string,
  businessId: string,
  planCode: string,
) {
  return apiRequest<{
    invoice: SubscriptionInvoiceItem;
    checkoutUrl: string;
    reference: string;
  }>('/subscriptions/checkout', {
    method: 'POST',
    accessToken,
    businessId,
    idempotencyKey: generateUuid(),
    body: {
      planCode,
      callbackUrl: `${window.location.origin}/app/subscription`,
    },
  });
}

export function verifySubscriptionPayment(
  accessToken: string,
  businessId: string,
  reference: string,
) {
  return apiRequest<{ invoice: SubscriptionInvoiceItem; alreadyVerified?: boolean }>(
    '/subscriptions/verify',
    {
      method: 'POST',
      accessToken,
      businessId,
      idempotencyKey: generateUuid(),
      body: { reference },
    },
  );
}
