import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ============================================================================
// 1. Identity, Platform Admins & Tenant Governance
// ============================================================================

export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').primaryKey(),
  firebaseUid: text('firebase_uid').unique(),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  acceptedTermsAt: timestamp('accepted_terms_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const platformAdmins = pgTable('platform_admins', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => userProfiles.id, { onDelete: 'restrict' }),
  role: text('role').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const platformAdminAuditLogs = pgTable('platform_admin_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminUserId: uuid('admin_user_id')
    .notNull()
    .references(() => userProfiles.id, { onDelete: 'restrict' }),
  adminRole: text('admin_role').notNull(),
  action: text('action').notNull(),
  targetBusinessId: uuid('target_business_id'),
  targetEntityType: text('target_entity_type').notNull(),
  targetEntityId: uuid('target_entity_id'),
  supportTicketRef: text('support_ticket_ref'),
  reason: text('reason').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionPlans = pgTable('subscription_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  planCode: text('plan_code').notNull().unique(),
  displayName: text('display_name').notNull(),
  billingInterval: text('billing_interval').notNull().default('trial'),
  priceAmount: numeric('price_amount', { precision: 18, scale: 2 }).notNull().default('0.00'),
  currencyCode: varchar('currency_code', { length: 3 }).notNull().default('NGN'),
  maxStaff: integer('max_staff').notNull(),
  maxProducts: integer('max_products').notNull(),
  maxOfflineDevices: integer('max_offline_devices').notNull(),
  isTrial: boolean('is_trial').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  currencyCode: varchar('currency_code', { length: 3 }).notNull().default('NGN'),
  timezone: text('timezone').notNull().default('Africa/Lagos'),
  phone: text('phone'),
  address: text('address'),
  logoUrl: text('logo_url'),
  taxId: text('tax_id'),
  taxEnabled: boolean('tax_enabled').notNull().default(false),
  taxMode: text('tax_mode').notNull().default('exclusive'),
  taxRate: numeric('tax_rate', { precision: 8, scale: 4 }).notNull().default('0.0000'),
  allowNegativeStock: boolean('allow_negative_stock').notNull().default(false),
  receiptFooter: text('receipt_footer'),
  status: text('status').notNull().default('active'),
  deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => userProfiles.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const businessSettings = pgTable('business_settings', {
  businessId: uuid('business_id')
    .primaryKey()
    .references(() => businesses.id, { onDelete: 'restrict' }),
  receiptPrefix: varchar('receipt_prefix', { length: 12 }).notNull().default('REC'),
  returnPrefix: varchar('return_prefix', { length: 12 }).notNull().default('RET'),
  debtPaymentPrefix: varchar('debt_payment_prefix', { length: 12 }).notNull().default('PAY'),
  expensePrefix: varchar('expense_prefix', { length: 12 }).notNull().default('EXP'),
  restockPrefix: varchar('restock_prefix', { length: 12 }).notNull().default('RST'),
  defaultLowStockThreshold: numeric('default_low_stock_threshold', {
    precision: 18,
    scale: 3,
  })
    .notNull()
    .default('5.000'),
  notifyLowStock: boolean('notify_low_stock').notNull().default(true),
  notifySyncConflicts: boolean('notify_sync_conflicts').notNull().default(true),
  notifySubscriptionEmail: boolean('notify_subscription_email').notNull().default(true),
  showTaxBreakdownOnReceipt: boolean('show_tax_breakdown_on_receipt').notNull().default(true),
  offlinePinRequired: boolean('offline_pin_required').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const businessLocations = pgTable(
  'business_locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    name: text('name').notNull().default('Main Store'),
    address: text('address'),
    phone: text('phone'),
    isDefault: boolean('is_default').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('uq_business_locations_tenant_id').on(table.businessId, table.id)],
);

export const businessSubscriptions = pgTable('business_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessId: uuid('business_id')
    .notNull()
    .unique()
    .references(() => businesses.id, { onDelete: 'restrict' }),
  planId: uuid('plan_id')
    .notNull()
    .references(() => subscriptionPlans.id, { onDelete: 'restrict' }),
  status: text('status').notNull().default('trialing'),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true })
    .notNull()
    .defaultNow(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  graceEndsAt: timestamp('grace_ends_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const businessMemberships = pgTable(
  'business_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'restrict' }),
    role: text('role').notNull(),
    status: text('status').notNull().default('active'),
    invitedBy: uuid('invited_by').references(() => userProfiles.id, { onDelete: 'restrict' }),
    revokedBy: uuid('revoked_by').references(() => userProfiles.id, { onDelete: 'restrict' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_business_memberships_tenant_user').on(table.businessId, table.userId),
    index('idx_business_memberships_user_active').on(table.userId, table.businessId),
  ],
);

export const staffInvitations = pgTable(
  'staff_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    email: text('email').notNull(),
    role: text('role').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    status: text('status').notNull().default('pending'),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'restrict' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedBy: uuid('accepted_by').references(() => userProfiles.id, { onDelete: 'restrict' }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_staff_invitations_business_status').on(table.businessId, table.status)],
);

export const registeredDevices = pgTable(
  'registered_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'restrict' }),
    deviceCode: varchar('device_code', { length: 16 }).notNull(),
    deviceFingerprintHash: text('device_fingerprint_hash').notNull(),
    deviceName: text('device_name').notNull(),
    status: text('status').notNull().default('active'),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }).notNull().defaultNow(),
    offlineExpiresAt: timestamp('offline_expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => userProfiles.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_registered_devices_tenant_code').on(table.businessId, table.deviceCode),
    index('idx_registered_devices_business_active').on(table.businessId, table.status),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    actorUserId: uuid('actor_user_id').references(() => userProfiles.id, {
      onDelete: 'restrict',
    }),
    actorRole: text('actor_role'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata').notNull().default({}),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_audit_logs_business_created').on(table.businessId, table.createdAt)],
);

// ============================================================================
// 2. Product Catalog & Inventory
// ============================================================================

export const productCategories = pgTable(
  'product_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_product_categories_business').on(table.businessId)],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id').references(() => productCategories.id, {
      onDelete: 'set null',
    }),
    sku: varchar('sku', { length: 64 }),
    barcode: varchar('barcode', { length: 128 }),
    name: text('name').notNull(),
    unit: varchar('unit', { length: 32 }).notNull().default('pcs'),
    sellingPrice: numeric('selling_price', { precision: 18, scale: 2 }).notNull(),
    costPrice: numeric('cost_price', { precision: 18, scale: 2 }).notNull().default('0.00'),
    reorderLevel: numeric('reorder_level', { precision: 18, scale: 3 }).notNull().default('0.000'),
    isTaxExempt: boolean('is_tax_exempt').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_products_business_active').on(table.businessId, table.isActive)],
);

export const stockBalances = pgTable(
  'stock_balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => businessLocations.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    onHand: numeric('on_hand', { precision: 18, scale: 3 }).notNull().default('0.000'),
    weightedAvgCost: numeric('weighted_avg_cost', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),
    lastPositiveWac: numeric('last_positive_wac', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_stock_balances_tenant_loc_prod').on(
      table.businessId,
      table.locationId,
      table.productId,
    ),
  ],
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => businessLocations.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    movementType: text('movement_type').notNull(),
    quantityDelta: numeric('quantity_delta', { precision: 18, scale: 3 }).notNull(),
    balanceAfter: numeric('balance_after', { precision: 18, scale: 3 }).notNull(),
    unitCostSnapshot: numeric('unit_cost_snapshot', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),
    referenceType: text('reference_type').notNull(),
    referenceId: uuid('reference_id'),
    reason: text('reason'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_stock_movements_product_time').on(
      table.businessId,
      table.productId,
      table.createdAt,
    ),
  ],
);

export const restockBatches = pgTable(
  'restock_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => businessLocations.id, { onDelete: 'restrict' }),
    batchNumber: varchar('batch_number', { length: 48 }).notNull(),
    supplierNote: text('supplier_note'),
    notes: text('notes'),
    totalCost: numeric('total_cost', { precision: 18, scale: 2 }).notNull().default('0.00'),
    receivedBy: uuid('received_by')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'restrict' }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_restock_batches_tenant_number').on(table.businessId, table.batchNumber),
    index('idx_restock_batches_tenant_received').on(table.businessId, table.receivedAt),
  ],
);

export const restockBatchItems = pgTable(
  'restock_batch_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    restockBatchId: uuid('restock_batch_id')
      .notNull()
      .references(() => restockBatches.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantityReceived: numeric('quantity_received', { precision: 18, scale: 3 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 18, scale: 2 }).notNull(),
    lineTotalCost: numeric('line_total_cost', { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_restock_batch_items_batch').on(table.businessId, table.restockBatchId)],
);

// ============================================================================
// 3. Customers, Sales, Receipts, Returns & Debt Ledger
// ============================================================================

export const receiptSequences = pgTable(
  'receipt_sequences',
  {
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    sequencePrefix: varchar('sequence_prefix', { length: 16 }).notNull(),
    sequenceDate: varchar('sequence_date', { length: 16 }).notNull(),
    lastValue: integer('last_value').notNull().default(0),
  },
  (table) => [
    primaryKey({
      columns: [table.businessId, table.sequencePrefix, table.sequenceDate],
    }),
  ],
);

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    fullName: text('full_name').notNull(),
    phone: varchar('phone', { length: 32 }),
    email: text('email'),
    address: text('address'),
    creditLimit: numeric('credit_limit', { precision: 18, scale: 2 }),
    outstandingBalance: numeric('outstanding_balance', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_customers_business_debt').on(table.businessId, table.outstandingBalance)],
);

export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => businessLocations.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'restrict' }),
    deviceId: uuid('device_id').references(() => registeredDevices.id, { onDelete: 'restrict' }),
    clientSaleUuid: uuid('client_sale_uuid').notNull(),
    saleNumber: varchar('sale_number', { length: 48 }).notNull(),
    status: text('status').notNull().default('completed'),
    paymentStatus: text('payment_status').notNull().default('paid'),
    subtotalAmount: numeric('subtotal_amount', { precision: 18, scale: 2 }).notNull(),
    discountAmount: numeric('discount_amount', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),
    taxEnabledSnapshot: boolean('tax_enabled_snapshot').notNull().default(false),
    taxModeSnapshot: text('tax_mode_snapshot').notNull().default('exclusive'),
    taxRateSnapshot: numeric('tax_rate_snapshot', { precision: 8, scale: 4 })
      .notNull()
      .default('0.0000'),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 2 }).notNull().default('0.00'),
    totalAmount: numeric('total_amount', { precision: 18, scale: 2 }).notNull(),
    amountPaid: numeric('amount_paid', { precision: 18, scale: 2 }).notNull().default('0.00'),
    creditAmount: numeric('credit_amount', { precision: 18, scale: 2 }).notNull().default('0.00'),
    creditRemaining: numeric('credit_remaining', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),
    totalCogs: numeric('total_cogs', { precision: 18, scale: 2 }).notNull().default('0.00'),
    notes: text('notes'),
    soldBy: uuid('sold_by')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'restrict' }),
    soldAt: timestamp('sold_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_sales_tenant_sale_number').on(table.businessId, table.saleNumber),
    unique('uq_sales_tenant_client_uuid').on(table.businessId, table.clientSaleUuid),
    index('idx_sales_tenant_sold_at').on(table.businessId, table.soldAt),
  ],
);

export const saleItems = pgTable(
  'sale_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    productNameSnapshot: text('product_name_snapshot').notNull(),
    unitSnapshot: varchar('unit_snapshot', { length: 32 }).notNull().default('pcs'),
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),
    quantityReturned: numeric('quantity_returned', { precision: 18, scale: 3 })
      .notNull()
      .default('0.000'),
    unitPrice: numeric('unit_price', { precision: 18, scale: 2 }).notNull(),
    discountAmount: numeric('discount_amount', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),
    taxRateSnapshot: numeric('tax_rate_snapshot', { precision: 8, scale: 4 })
      .notNull()
      .default('0.0000'),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 2 }).notNull().default('0.00'),
    lineTotal: numeric('line_total', { precision: 18, scale: 2 }).notNull(),
    unitCostSnapshot: numeric('unit_cost_snapshot', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),
    lineCogs: numeric('line_cogs', { precision: 18, scale: 2 }).notNull().default('0.00'),
    isTaxExemptSnapshot: boolean('is_tax_exempt_snapshot').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_sale_items_tenant_sale').on(table.businessId, table.saleId)],
);

export const salePayments = pgTable(
  'sale_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'restrict' }),
    paymentMethod: text('payment_method').notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    referenceNote: text('reference_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_sale_payments_tenant_sale').on(table.businessId, table.saleId)],
);

export const customerDebtPayments = pgTable(
  'customer_debt_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    paymentMethod: text('payment_method').notNull(),
    referenceNote: text('reference_note'),
    status: text('status').notNull().default('posted'),
    reversalReason: text('reversal_reason'),
    reversedBy: uuid('reversed_by').references(() => userProfiles.id, { onDelete: 'restrict' }),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    collectedBy: uuid('collected_by')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'restrict' }),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_debt_payments_tenant_customer').on(table.businessId, table.customerId, table.paidAt),
  ],
);

export const customerDebtAllocations = pgTable(
  'customer_debt_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    debtPaymentId: uuid('debt_payment_id')
      .notNull()
      .references(() => customerDebtPayments.id, { onDelete: 'restrict' }),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'restrict' }),
    allocatedAmount: numeric('allocated_amount', { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_debt_alloc_tenant_payment').on(table.businessId, table.debtPaymentId)],
);

export const receipts = pgTable(
  'receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    receiptNumber: varchar('receipt_number', { length: 48 }).notNull(),
    receiptType: text('receipt_type').notNull(),
    saleId: uuid('sale_id').references(() => sales.id, { onDelete: 'restrict' }),
    debtPaymentId: uuid('debt_payment_id').references(() => customerDebtPayments.id, {
      onDelete: 'restrict',
    }),
    snapshotPayload: jsonb('snapshot_payload').notNull().default({}),
    issuedBy: uuid('issued_by')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'restrict' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('uq_receipts_tenant_number').on(table.businessId, table.receiptNumber)],
);

export const saleReturns = pgTable(
  'sale_returns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'restrict' }),
    returnType: text('return_type').notNull(),
    reason: text('reason').notNull(),
    totalReversed: numeric('total_reversed', { precision: 18, scale: 2 }).notNull(),
    debtReducedAmount: numeric('debt_reduced_amount', { precision: 18, scale: 2 })
      .notNull()
      .default('0.00'),
    refundAmount: numeric('refund_amount', { precision: 18, scale: 2 }).notNull().default('0.00'),
    processedBy: uuid('processed_by')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_sale_returns_tenant_sale').on(table.businessId, table.saleId)],
);

export const saleReturnItems = pgTable(
  'sale_return_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    saleReturnId: uuid('sale_return_id')
      .notNull()
      .references(() => saleReturns.id, { onDelete: 'restrict' }),
    saleItemId: uuid('sale_item_id')
      .notNull()
      .references(() => saleItems.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantityReturned: numeric('quantity_returned', { precision: 18, scale: 3 }).notNull(),
    disposition: text('disposition').notNull(),
    unitPriceSnapshot: numeric('unit_price_snapshot', { precision: 18, scale: 2 }).notNull(),
    taxReversed: numeric('tax_reversed', { precision: 18, scale: 2 }).notNull().default('0.00'),
    lineReversedTotal: numeric('line_reversed_total', { precision: 18, scale: 2 }).notNull(),
    unitCostSnapshot: numeric('unit_cost_snapshot', { precision: 18, scale: 2 }).notNull(),
  },
  (table) => [index('idx_sale_return_items_return').on(table.businessId, table.saleReturnId)],
);

export const saleRefunds = pgTable(
  'sale_refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    saleReturnId: uuid('sale_return_id')
      .notNull()
      .references(() => saleReturns.id, { onDelete: 'restrict' }),
    paymentMethod: text('payment_method').notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    referenceNote: text('reference_note'),
    processedBy: uuid('processed_by')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_sale_refunds_return').on(table.businessId, table.saleReturnId)],
);

// ============================================================================
// 4. Operating Expenses
// ============================================================================

export const expenseCategories = pgTable(
  'expense_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_expense_categories_business').on(table.businessId)],
);

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => businessLocations.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => expenseCategories.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    paymentMethod: text('payment_method').notNull(),
    description: text('description').notNull(),
    incurredOn: text('incurred_on').notNull(),
    attachmentId: uuid('attachment_id'),
    status: text('status').notNull().default('posted'),
    reversalReason: text('reversal_reason'),
    reversedBy: uuid('reversed_by').references(() => userProfiles.id, { onDelete: 'restrict' }),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    recordedBy: uuid('recorded_by')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_expenses_business_created').on(table.businessId, table.createdAt)],
);

// ============================================================================
// 5. Billing, Sync Conflicts, Notifications & Idempotency
// ============================================================================

export const subscriptionInvoices = pgTable(
  'subscription_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull().default('paystack'),
    providerReference: text('provider_reference').notNull().unique(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currencyCode: varchar('currency_code', { length: 3 }).notNull().default('NGN'),
    status: text('status').notNull().default('pending'),
    checkoutUrl: text('checkout_url'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_subscription_invoices_business').on(table.businessId, table.createdAt)],
);

export const paymentWebhookEvents = pgTable(
  'payment_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type').notNull(),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'restrict' }),
    payload: jsonb('payload').notNull().default({}),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_payment_webhook_provider_event').on(table.provider, table.providerEventId),
  ],
);

export const syncConflicts = pgTable(
  'sync_conflicts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    deviceId: uuid('device_id').references(() => registeredDevices.id, { onDelete: 'restrict' }),
    clientOperationUuid: uuid('client_operation_uuid').notNull(),
    entityType: text('entity_type').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('open'),
    resolutionAction: text('resolution_action'),
    resolutionNote: text('resolution_note'),
    resolvedBy: uuid('resolved_by').references(() => userProfiles.id, { onDelete: 'restrict' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_sync_conflicts_business_status').on(table.businessId, table.status)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'restrict' }),
    channel: text('channel').notNull().default('in_app'),
    category: text('category').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_notifications_recipient').on(
      table.businessId,
      table.recipientUserId,
      table.createdAt,
    ),
  ],
);

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    requestMethod: text('request_method').notNull(),
    requestPath: text('request_path').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatusCode: integer('response_status_code').notNull(),
    responseBody: jsonb('response_body').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [unique('uq_idempotency_tenant_key').on(table.businessId, table.idempotencyKey)],
);

// ============================================================================
// 6. Drizzle Relations
// ============================================================================

export const userProfilesRelations = relations(userProfiles, ({ many }) => ({
  memberships: many(businessMemberships),
}));

export const businessesRelations = relations(businesses, ({ many, one }) => ({
  memberships: many(businessMemberships),
  locations: many(businessLocations),
  products: many(products),
  customers: many(customers),
  sales: many(sales),
  expenses: many(expenses),
  subscription: one(businessSubscriptions, {
    fields: [businesses.id],
    references: [businessSubscriptions.businessId],
  }),
}));

export const businessMembershipsRelations = relations(businessMemberships, ({ one }) => ({
  business: one(businesses, {
    fields: [businessMemberships.businessId],
    references: [businesses.id],
  }),
  user: one(userProfiles, {
    fields: [businessMemberships.userId],
    references: [userProfiles.id],
  }),
}));
