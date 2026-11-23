import { z } from 'zod';
import { BasePaginationQuerySchema } from '../../lib/http.ts';
import type {
  AuditLogRecord,
  BusinessLocationRecord,
  BusinessSubscriptionRecord,
  SubscriptionStatus,
  TaxMode,
} from '../identity/identity.types.ts';

// ============================================================================
// Domain Record Interfaces
// ============================================================================

export interface ProductCategoryRecord {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductRecord {
  id: string;
  businessId: string;
  categoryId: string | null;
  sku: string | null;
  barcode: string | null;
  name: string;
  unit: string;
  sellingPrice: string; // NUMERIC(18, 2)
  costPrice: string; // NUMERIC(18, 2) - redacted for cashier
  weightedAvgCost: string; // NUMERIC(18, 2) - redacted for cashier
  lastPositiveWac: string; // NUMERIC(18, 2) - redacted for cashier
  onHand: string; // NUMERIC(18, 3)
  reorderLevel: string; // NUMERIC(18, 3)
  isTaxExempt: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Cashier-safe product DTO omitting all cost, WAC, and margin fields (D-09). */
export interface CashierProductView {
  id: string;
  businessId: string;
  categoryId: string | null;
  sku: string | null;
  barcode: string | null;
  name: string;
  unit: string;
  sellingPrice: string;
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

export interface StockMovementRecord {
  id: string;
  businessId: string;
  locationId: string;
  productId: string;
  movementType: StockMovementType;
  quantityDelta: string; // signed NUMERIC(18, 3)
  balanceAfter: string; // NUMERIC(18, 3)
  unitCostSnapshot: string; // NUMERIC(18, 2)
  referenceType: string;
  referenceId: string | null;
  reason: string | null;
  createdBy: string;
  createdAt: string;
}

export interface RestockBatchItemRecord {
  id: string;
  businessId: string;
  restockBatchId: string;
  productId: string;
  quantityReceived: string;
  unitCost: string;
  lineTotalCost: string;
  wacBefore: string;
  wacAfter: string;
}

export interface RestockBatchRecord {
  id: string;
  businessId: string;
  locationId: string;
  batchNumber: string;
  supplierNote: string | null;
  notes: string | null;
  totalCost: string;
  receivedBy: string;
  receivedAt: string;
  items: RestockBatchItemRecord[];
}

export type TenderMethod = 'cash' | 'transfer' | 'pos_card' | 'credit';
export type SaleStatus = 'completed' | 'partially_returned' | 'returned' | 'voided';
export type SalePaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface SaleItemRecord {
  id: string;
  businessId: string;
  saleId: string;
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
  unitCostSnapshot: string; // redacted for cashier
  lineCogs: string; // redacted for cashier
  isTaxExemptSnapshot: boolean;
}

export interface SalePaymentRecord {
  id: string;
  businessId: string;
  saleId: string;
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
  businessId: string;
  saleReturnId: string;
  saleItemId: string;
  productId: string;
  quantityReturned: string;
  disposition: 'restock' | 'damaged';
  unitPriceSnapshot: string;
  taxReversed: string;
  lineReversedTotal: string;
  unitCostSnapshot: string;
}

export interface SaleRefundRecord {
  id: string;
  businessId: string;
  saleReturnId: string;
  method: 'cash' | 'transfer' | 'pos_card';
  amount: string;
  referenceNote: string | null;
  processedBy: string;
  createdAt: string;
}

export interface SaleReturnRecord {
  id: string;
  businessId: string;
  saleId: string;
  returnType: 'full_void' | 'return';
  reason: string;
  totalReversed: string;
  debtReducedAmount: string;
  refundAmount: string;
  processedBy: string;
  createdAt: string;
  items: SaleReturnItemRecord[];
  refund: SaleRefundRecord | null;
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
  taxModeSnapshot: TaxMode;
  taxRateSnapshot: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  creditAmount: string;
  creditRemaining: string;
  totalCogs: string; // redacted for cashier
  notes: string | null;
  soldBy: string;
  soldAt: string;
  createdAt: string;
  items: SaleItemRecord[];
  payments: SalePaymentRecord[];
  receipt: ReceiptRecord | null;
  returns: SaleReturnRecord[];
}

export interface CustomerRecord {
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

export interface DebtAllocationRecord {
  id: string;
  businessId: string;
  debtPaymentId: string;
  saleId: string;
  allocatedAmount: string;
  createdAt: string;
}

export interface CustomerDebtPaymentRecord {
  id: string;
  businessId: string;
  customerId: string;
  amount: string;
  method: 'cash' | 'transfer' | 'pos_card';
  referenceNote: string | null;
  status: 'posted' | 'reversed';
  reversalReason: string | null;
  reversedBy: string | null;
  reversedAt: string | null;
  collectedBy: string;
  paidAt: string;
  allocations: DebtAllocationRecord[];
  receipt: ReceiptRecord | null;
}

export interface ExpenseCategoryRecord {
  id: string;
  businessId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface ExpenseRecord {
  id: string;
  businessId: string;
  locationId: string;
  categoryId: string;
  amount: string;
  paymentMethod: 'cash' | 'transfer' | 'pos_card';
  description: string;
  incurredOn: string;
  attachmentId: string | null;
  status: 'posted' | 'reversed';
  reversalReason: string | null;
  reversedBy: string | null;
  reversedAt: string | null;
  recordedBy: string;
  createdAt: string;
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

export interface SubscriptionInvoiceRecord {
  id: string;
  businessId: string;
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

export interface PaymentWebhookEventRecord {
  id: string;
  provider: 'paystack';
  providerEventId: string;
  eventType: string;
  businessId: string | null;
  payload: Record<string, unknown>;
  processedAt: string;
}

export type SyncConflictReason =
  | 'insufficient_stock_oversell'
  | 'stale_entity_version'
  | 'revoked_device_submission'
  | 'validation_error';

export interface SyncConflictRecord {
  id: string;
  businessId: string;
  deviceId: string | null;
  clientOperationUuid: string;
  entityType: string;
  reason: SyncConflictReason;
  status: 'open' | 'resolved';
  resolutionAction: 'accept_with_adjustment' | 'reject_and_reverse' | 'acknowledge' | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  businessId: string;
  recipientUserId: string;
  channel: 'in_app';
  category: 'low_stock' | 'sync_conflict' | 'subscription' | 'staff' | 'system';
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface BusinessTaxAndStockConfig {
  businessId: string;
  businessName: string;
  currencyCode: string;
  taxEnabled: boolean;
  taxMode: TaxMode;
  taxRate: string;
  allowNegativeStock: boolean;
  receiptFooter: string | null;
  defaultLocationId: string;
  locationName: string;
  locationAddress: string | null;
  locationPhone: string | null;
}

// ============================================================================
// Strict Zod Validation Schemas (.strict() blocks injected totals/cost/tenant)
// ============================================================================

const DecimalStringOrNumber = z.union([
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/, 'Must be a non-negative decimal.'),
  z.number().finite().nonnegative(),
]);

const MoneyInput = z.union([
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid non-negative money amount.'),
  z.number().finite().nonnegative(),
]);

const PositiveMoneyInput = z
  .union([
    z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid positive money amount.'),
    z.number().finite().positive(),
  ])
  .refine((v) => Number(v) > 0, 'Amount must be greater than 0.');

const PositiveQtyInput = z
  .union([
    z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,3})?$/, 'Must be a valid positive quantity.'),
    z.number().finite().positive(),
  ])
  .refine((v) => Number(v) > 0, 'Quantity must be greater than 0.');

// Locations (D-02 single active location)
export const UpdateLocationSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    address: z.string().trim().max(300).nullable().optional(),
    phone: z.string().trim().min(6).max(32).nullable().optional(),
  })
  .strict();

// Catalog
export const CreateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(240).nullable().optional(),
  })
  .strict();

export const UpdateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(240).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const ProductListQuerySchema = BasePaginationQuerySchema.extend({
  categoryId: z.string().uuid().optional(),
  lowStockOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const CreateProductSchema = z
  .object({
    categoryId: z.string().uuid().nullable().optional(),
    sku: z.string().trim().min(1).max(64).nullable().optional(),
    barcode: z.string().trim().min(1).max(64).nullable().optional(),
    name: z.string().trim().min(2).max(140),
    unit: z.string().trim().min(1).max(24).default('pcs'),
    sellingPrice: PositiveMoneyInput,
    costPrice: MoneyInput.default('0.00'),
    openingStock: DecimalStringOrNumber.default('0.000'),
    reorderLevel: DecimalStringOrNumber.default('0.000'),
    isTaxExempt: z.boolean().default(false),
  })
  .strict();

export const UpdateProductSchema = z
  .object({
    categoryId: z.string().uuid().nullable().optional(),
    sku: z.string().trim().min(1).max(64).nullable().optional(),
    barcode: z.string().trim().min(1).max(64).nullable().optional(),
    name: z.string().trim().min(2).max(140).optional(),
    unit: z.string().trim().min(1).max(24).optional(),
    sellingPrice: PositiveMoneyInput.optional(),
    reorderLevel: DecimalStringOrNumber.optional(),
    isTaxExempt: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

// Inventory & Restocks (D-04, D-11)
export const StockMovementQuerySchema = BasePaginationQuerySchema.extend({
  productId: z.string().uuid().optional(),
  movementType: z
    .enum([
      'opening_stock',
      'restock_in',
      'sale_out',
      'return_restock',
      'return_damaged',
      'adjustment_in',
      'adjustment_out',
    ])
    .optional(),
});

export const CreateStockAdjustmentSchema = z
  .object({
    productId: z.string().uuid(),
    direction: z.enum(['in', 'out']),
    quantity: PositiveQtyInput,
    reason: z.string().trim().min(3).max(240),
  })
  .strict();

export const CreateRestockBatchSchema = z
  .object({
    supplierNote: z.string().trim().max(160).nullable().optional(),
    notes: z.string().trim().max(300).nullable().optional(),
    items: z
      .array(
        z
          .object({
            productId: z.string().uuid(),
            quantityReceived: PositiveQtyInput,
            unitCost: PositiveMoneyInput,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

// Sales, Voids & Returns (D-03, D-13, D-14, D-15)
export const SaleListQuerySchema = BasePaginationQuerySchema.extend({
  status: z.enum(['completed', 'partially_returned', 'returned', 'voided']).optional(),
  paymentStatus: z.enum(['paid', 'partial', 'unpaid']).optional(),
  customerId: z.string().uuid().optional(),
  cashierUserId: z.string().uuid().optional(),
});

export const CreateSaleSchema = z
  .object({
    clientSaleUuid: z.string().uuid().optional(),
    customerId: z.string().uuid().nullable().optional(),
    deviceId: z.string().uuid().nullable().optional(),
    offlineReceiptNumber: z
      .string()
      .trim()
      .regex(/^OFF-[A-Z0-9]{4}-\d{4,10}$/, 'Invalid offline receipt number format.')
      .optional(),
    notes: z.string().trim().max(300).nullable().optional(),
    items: z
      .array(
        z
          .object({
            productId: z.string().uuid(),
            quantity: PositiveQtyInput,
            discountAmount: MoneyInput.default('0.00'),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    payments: z
      .array(
        z
          .object({
            method: z.enum(['cash', 'transfer', 'pos_card', 'credit']),
            amount: PositiveMoneyInput,
            referenceNote: z.string().trim().max(120).nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();

export const VoidSaleSchema = z
  .object({
    reason: z.string().trim().min(5).max(300),
    disposition: z.enum(['restock', 'damaged']).default('restock'),
    refundMethod: z.enum(['cash', 'transfer', 'pos_card']).default('cash'),
    refundReferenceNote: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

export const ReturnSaleSchema = z
  .object({
    reason: z.string().trim().min(5).max(300),
    refundMethod: z.enum(['cash', 'transfer', 'pos_card']).default('cash'),
    refundReferenceNote: z.string().trim().max(120).nullable().optional(),
    items: z
      .array(
        z
          .object({
            saleItemId: z.string().uuid(),
            quantity: PositiveQtyInput,
            disposition: z.enum(['restock', 'damaged']),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

// Customers & Debt Payments
export const CustomerListQuerySchema = BasePaginationQuerySchema.extend({
  hasDebtOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const CreateCustomerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(6).max(32).nullable().optional(),
    email: z
      .string()
      .trim()
      .email()
      .transform((v) => v.toLowerCase())
      .nullable()
      .optional(),
    address: z.string().trim().max(300).nullable().optional(),
    creditLimit: MoneyInput.nullable().optional(),
  })
  .strict();

export const UpdateCustomerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().min(6).max(32).nullable().optional(),
    email: z
      .string()
      .trim()
      .email()
      .transform((v) => v.toLowerCase())
      .nullable()
      .optional(),
    address: z.string().trim().max(300).nullable().optional(),
    creditLimit: MoneyInput.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const CreateDebtPaymentSchema = z
  .object({
    amount: PositiveMoneyInput,
    method: z.enum(['cash', 'transfer', 'pos_card']),
    referenceNote: z.string().trim().max(120).nullable().optional(),
    saleIds: z.array(z.string().uuid()).max(50).optional(),
  })
  .strict();

export const ReverseFinancialRecordSchema = z
  .object({
    reason: z.string().trim().min(5).max(300),
  })
  .strict();

// Expenses
export const CreateExpenseCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(80),
  })
  .strict();

export const ExpenseListQuerySchema = BasePaginationQuerySchema.extend({
  categoryId: z.string().uuid().optional(),
  status: z.enum(['posted', 'reversed']).optional(),
  paymentMethod: z.enum(['cash', 'transfer', 'pos_card']).optional(),
});

export const CreateExpenseSchema = z
  .object({
    categoryId: z.string().uuid(),
    amount: PositiveMoneyInput,
    paymentMethod: z.enum(['cash', 'transfer', 'pos_card']),
    description: z.string().trim().min(2).max(300),
    incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'incurredOn must be YYYY-MM-DD.'),
    attachmentId: z.string().uuid().nullable().optional(),
  })
  .strict();

// Reports
export const ReportDateRangeQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ReportExportQuerySchema = z.object({
  type: z.enum(['sales', 'expenses', 'inventory', 'debtors']),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

// Billing & Subscriptions (D-01, D-07)
export const SubscriptionCheckoutSchema = z
  .object({
    planCode: z.string().trim().min(2).max(64),
    callbackUrl: z.string().url().optional(),
  })
  .strict();

export const SubscriptionVerifySchema = z
  .object({
    reference: z.string().trim().min(6).max(128),
  })
  .strict();

// Offline Sync (D-05, D-09)
export const SyncOperationSchema = z.discriminatedUnion('operationType', [
  z
    .object({
      operationType: z.literal('offline_sale'),
      clientOperationUuid: z.string().uuid(),
      occurredAt: z.string().datetime({ offset: true }),
      payload: CreateSaleSchema,
    })
    .strict(),
  z
    .object({
      operationType: z.literal('offline_customer_create'),
      clientOperationUuid: z.string().uuid(),
      occurredAt: z.string().datetime({ offset: true }),
      payload: CreateCustomerSchema,
    })
    .strict(),
  z
    .object({
      operationType: z.literal('offline_debt_payment'),
      clientOperationUuid: z.string().uuid(),
      occurredAt: z.string().datetime({ offset: true }),
      customerId: z.string().uuid(),
      payload: CreateDebtPaymentSchema,
    })
    .strict(),
]);

export const SyncPushSchema = z
  .object({
    operations: z.array(SyncOperationSchema).min(1).max(100),
  })
  .strict();

export const ResolveSyncConflictSchema = z
  .object({
    action: z.enum(['accept_with_adjustment', 'reject_and_reverse', 'acknowledge']),
    note: z.string().trim().min(5).max(300),
  })
  .strict();

// Notifications (D-12: In-App only via API; email via server port)
export const NotificationQuerySchema = BasePaginationQuerySchema.extend({
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

export interface AuditEventInput {
  businessId: string;
  actorUserId: string | null;
  actorRole: 'owner' | 'manager' | 'cashier' | 'system' | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PaystackGatewayPort {
  initializeTransaction(input: {
    email: string;
    amountKobo: bigint;
    currencyCode: string;
    reference: string;
    callbackUrl?: string;
    metadata: Record<string, unknown>;
  }): Promise<{ authorizationUrl: string; accessCode: string; reference: string }>;

  verifyTransaction(reference: string): Promise<{
    reference: string;
    status: 'success' | 'failed' | 'abandoned';
    amountKobo: bigint;
    currencyCode: string;
    paidAt: string | null;
  }>;
}

export interface ActiveDeviceLookup {
  id: string;
  businessId: string;
  userId: string;
  deviceCode: string;
  status: 'active' | 'revoked';
  offlineExpiresAt: string;
}

export interface SubscriptionUsageSummary {
  subscription: BusinessSubscriptionRecord | null;
  status: SubscriptionStatus;
  staffCount: number;
  productCount: number;
  activeDeviceCount: number;
}

export type { AuditLogRecord, BusinessLocationRecord };
