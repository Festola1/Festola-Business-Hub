import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { z } from 'zod';
import {
  computeLineTaxKobo,
  computeRestockMovingWac,
  formatKobo,
  formatMilliQty,
  formatTaxRatePercent,
  multiplyQtyByKobo,
  parseMoneyToKobo,
  parseQtyToMilli,
  parseSignedQtyToMilli,
  parseTaxRatePercent,
  resolveEffectiveWacKobo,
  sanitizeCsvCell,
} from '../../lib/money.ts';
import { hasPermission } from '../../lib/rbac.ts';
import { ApiError } from '../../middleware/error-handler.ts';
import type { ActiveTenantMembership, BusinessRole } from '../identity/identity.types.ts';
import type { CommerceRepository, CommerceTx } from './commerce.repository.ts';
import type {
  CashierProductView,
  CreateCategorySchema,
  CreateCustomerSchema,
  CreateDebtPaymentSchema,
  CreateExpenseCategorySchema,
  CreateExpenseSchema,
  CreateProductSchema,
  CreateRestockBatchSchema,
  CreateSaleSchema,
  CreateStockAdjustmentSchema,
  CustomerDebtPaymentRecord,
  CustomerRecord,
  DebtAllocationRecord,
  ExpenseRecord,
  NotificationQuerySchema,
  PaystackGatewayPort,
  ProductListQuerySchema,
  ProductRecord,
  ReceiptRecord,
  ReportDateRangeQuerySchema,
  ReportExportQuerySchema,
  ResolveSyncConflictSchema,
  RestockBatchItemRecord,
  RestockBatchRecord,
  ReturnSaleSchema,
  ReverseFinancialRecordSchema,
  SaleItemRecord,
  SaleListQuerySchema,
  SalePaymentRecord,
  SaleRecord,
  SaleRefundRecord,
  SaleReturnItemRecord,
  SaleReturnRecord,
  SalesByCategoryRow,
  StockMovementQuerySchema,
  SubscriptionCheckoutSchema,
  SubscriptionVerifySchema,
  SyncConflictRecord,
  SyncPushSchema,
  UpdateCategorySchema,
  UpdateCustomerSchema,
  UpdateLocationSchema,
  UpdateProductSchema,
  VoidSaleSchema,
} from './commerce.types.ts';

function utcDateKey(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function projectProductForRole(
  product: ProductRecord,
  role: BusinessRole,
): ProductRecord | CashierProductView {
  if (hasPermission(role, 'products.view_cost')) {
    return product;
  }
  return {
    id: product.id,
    businessId: product.businessId,
    categoryId: product.categoryId,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    unit: product.unit,
    sellingPrice: product.sellingPrice,
    onHand: product.onHand,
    reorderLevel: product.reorderLevel,
    isTaxExempt: product.isTaxExempt,
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export function projectSaleForRole(sale: SaleRecord, role: BusinessRole): Record<string, unknown> {
  if (hasPermission(role, 'products.view_cost')) {
    return sale as unknown as Record<string, unknown>;
  }
  const { totalCogs: _omittedTotalCogs, items, returns, ...rest } = sale;
  void _omittedTotalCogs;
  return {
    ...rest,
    items: items.map(({ unitCostSnapshot: _uc, lineCogs: _lc, ...itemRest }) => {
      void _uc;
      void _lc;
      return itemRest;
    }),
    returns: returns.map((ret) => ({
      ...ret,
      items: ret.items.map(({ unitCostSnapshot: _ruc, ...retItemRest }) => {
        void _ruc;
        return retItemRest;
      }),
    })),
  };
}

export class CommerceService {
  private readonly repo: CommerceRepository;
  private readonly paystack: PaystackGatewayPort | null;
  private readonly paystackWebhookSecret: string;

  constructor(
    repo: CommerceRepository,
    options: { paystack?: PaystackGatewayPort | null; paystackWebhookSecret?: string } = {},
  ) {
    this.repo = repo;
    this.paystack = options.paystack ?? null;
    this.paystackWebhookSecret = options.paystackWebhookSecret ?? '';
  }

  // ==========================================================================
  // 1. Locations (D-02 Single Active Location in MVP)
  // ==========================================================================

  async listLocations(tenant: ActiveTenantMembership) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, (tx) =>
      tx.listLocations(tenant.businessId),
    );
  }

  async updateLocation(
    tenant: ActiveTenantMembership,
    locationId: string,
    input: z.infer<typeof UpdateLocationSchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const updated = await tx.updateLocation(tenant.businessId, locationId, input);
      if (!updated) {
        throw new ApiError(404, 'NOT_FOUND', 'Location not found in your business.');
      }
      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'location.updated',
        entityType: 'business_location',
        entityId: updated.id,
        metadata: { name: updated.name },
      });
      return updated;
    });
  }

  // ==========================================================================
  // 2. Catalog (Categories & Products)
  // ==========================================================================

  async listCategories(
    tenant: ActiveTenantMembership,
    opts: { limit: number; offset: number; search?: string; isActive?: boolean },
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, (tx) =>
      tx.listCategories(tenant.businessId, opts),
    );
  }

  async createCategory(
    tenant: ActiveTenantMembership,
    input: z.infer<typeof CreateCategorySchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const existing = await tx.findCategoryByName(tenant.businessId, input.name);
      if (existing) {
        throw new ApiError(
          409,
          'DUPLICATE_TRANSACTION',
          'A product category with this name already exists.',
        );
      }
      const now = new Date().toISOString();
      const created = await tx.insertCategory({
        id: randomUUID(),
        businessId: tenant.businessId,
        name: input.name,
        description: input.description ?? null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'product_category.created',
        entityType: 'product_category',
        entityId: created.id,
        metadata: { name: created.name },
      });
      return created;
    });
  }

  async updateCategory(
    tenant: ActiveTenantMembership,
    categoryId: string,
    input: z.infer<typeof UpdateCategorySchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      if (input.name) {
        const dup = await tx.findCategoryByName(tenant.businessId, input.name);
        if (dup && dup.id !== categoryId) {
          throw new ApiError(
            409,
            'DUPLICATE_TRANSACTION',
            'A product category with this name already exists.',
          );
        }
      }
      const updated = await tx.updateCategory(tenant.businessId, categoryId, input);
      if (!updated) {
        throw new ApiError(404, 'NOT_FOUND', 'Product category not found.');
      }
      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'product_category.updated',
        entityType: 'product_category',
        entityId: updated.id,
        metadata: { isActive: updated.isActive },
      });
      return updated;
    });
  }

  async listProducts(
    tenant: ActiveTenantMembership,
    query: z.infer<typeof ProductListQuerySchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const page = await tx.listProducts(tenant.businessId, {
        limit: query.limit,
        offset: query.offset,
        search: query.search,
        categoryId: query.categoryId,
        lowStockOnly: query.lowStockOnly,
        isActive: query.isActive,
      });
      return {
        total: page.total,
        items: page.items.map((p) => projectProductForRole(p, tenant.role)),
      };
    });
  }

  async getProduct(tenant: ActiveTenantMembership, productId: string) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const product = await tx.getProductById(tenant.businessId, productId);
      if (!product) {
        throw new ApiError(404, 'NOT_FOUND', 'Product not found.');
      }
      return projectProductForRole(product, tenant.role);
    });
  }

  async createProduct(tenant: ActiveTenantMembership, input: z.infer<typeof CreateProductSchema>) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const currentCount = await tx.countActiveProducts(tenant.businessId);
      if (currentCount >= tenant.limits.maxProducts) {
        throw new ApiError(
          403,
          'SUBSCRIPTION_LIMIT_REACHED',
          `Your current plan supports up to ${tenant.limits.maxProducts} active products.`,
          { maxProducts: tenant.limits.maxProducts },
        );
      }

      if (input.categoryId) {
        const cat = await tx.getCategoryById(tenant.businessId, input.categoryId);
        if (!cat) {
          throw new ApiError(404, 'NOT_FOUND', 'Product category not found.');
        }
      }

      if (input.sku) {
        const dupSku = await tx.findProductBySku(tenant.businessId, input.sku);
        if (dupSku) {
          throw new ApiError(409, 'DUPLICATE_TRANSACTION', `SKU "${input.sku}" is already in use.`);
        }
      }

      const sellingKobo = parseMoneyToKobo(input.sellingPrice, 'sellingPrice');
      const costKobo = parseMoneyToKobo(input.costPrice, 'costPrice');
      const openingQtyMilli = parseQtyToMilli(input.openingStock, 'openingStock');
      const reorderMilli = parseQtyToMilli(input.reorderLevel, 'reorderLevel');
      const now = new Date().toISOString();

      const product = await tx.insertProduct({
        id: randomUUID(),
        businessId: tenant.businessId,
        categoryId: input.categoryId ?? null,
        sku: input.sku ?? null,
        barcode: input.barcode ?? null,
        name: input.name,
        unit: input.unit,
        sellingPrice: formatKobo(sellingKobo),
        costPrice: formatKobo(costKobo),
        weightedAvgCost: formatKobo(costKobo),
        lastPositiveWac: formatKobo(costKobo),
        onHand: formatMilliQty(openingQtyMilli),
        reorderLevel: formatMilliQty(reorderMilli),
        isTaxExempt: input.isTaxExempt,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      if (openingQtyMilli > 0n) {
        await tx.insertStockMovement({
          id: randomUUID(),
          businessId: tenant.businessId,
          locationId: tenant.defaultLocationId,
          productId: product.id,
          movementType: 'opening_stock',
          quantityDelta: formatMilliQty(openingQtyMilli),
          balanceAfter: formatMilliQty(openingQtyMilli),
          unitCostSnapshot: formatKobo(costKobo),
          referenceType: 'product',
          referenceId: product.id,
          reason: 'Opening stock balance',
          createdBy: tenant.userId,
          createdAt: now,
        });
      }

      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'product.created',
        entityType: 'product',
        entityId: product.id,
        metadata: {
          name: product.name,
          sku: product.sku,
          sellingPrice: product.sellingPrice,
          openingStock: product.onHand,
        },
      });

      return product;
    });
  }

  async updateProduct(
    tenant: ActiveTenantMembership,
    productId: string,
    input: z.infer<typeof UpdateProductSchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      if (input.sku) {
        const dup = await tx.findProductBySku(tenant.businessId, input.sku);
        if (dup && dup.id !== productId) {
          throw new ApiError(409, 'DUPLICATE_TRANSACTION', `SKU "${input.sku}" is already in use.`);
        }
      }
      if (input.categoryId) {
        const cat = await tx.getCategoryById(tenant.businessId, input.categoryId);
        if (!cat) {
          throw new ApiError(404, 'NOT_FOUND', 'Product category not found.');
        }
      }

      const patch: Partial<ProductRecord> = {};
      if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
      if (input.sku !== undefined) patch.sku = input.sku;
      if (input.barcode !== undefined) patch.barcode = input.barcode;
      if (input.name !== undefined) patch.name = input.name;
      if (input.unit !== undefined) patch.unit = input.unit;
      if (input.sellingPrice !== undefined) {
        patch.sellingPrice = formatKobo(parseMoneyToKobo(input.sellingPrice, 'sellingPrice'));
      }
      if (input.reorderLevel !== undefined) {
        patch.reorderLevel = formatMilliQty(parseQtyToMilli(input.reorderLevel, 'reorderLevel'));
      }
      if (input.isTaxExempt !== undefined) patch.isTaxExempt = input.isTaxExempt;
      if (input.isActive !== undefined) patch.isActive = input.isActive;

      const updated = await tx.updateProduct(tenant.businessId, productId, patch);
      if (!updated) {
        throw new ApiError(404, 'NOT_FOUND', 'Product not found.');
      }

      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'product.updated',
        entityType: 'product',
        entityId: updated.id,
        metadata: { sellingPrice: updated.sellingPrice, isActive: updated.isActive },
      });

      return updated;
    });
  }

  // ==========================================================================
  // 3. Inventory Balances, Adjustments & Multi-Item Restocks (D-04, D-11)
  // ==========================================================================

  async listInventoryBalances(
    tenant: ActiveTenantMembership,
    query: z.infer<typeof ProductListQuerySchema>,
  ) {
    const page = await this.listProducts(tenant, query);
    return page;
  }

  async listStockMovements(
    tenant: ActiveTenantMembership,
    query: z.infer<typeof StockMovementQuerySchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, (tx) =>
      tx.listStockMovements(tenant.businessId, {
        limit: query.limit,
        offset: query.offset,
        productId: query.productId,
        movementType: query.movementType,
        from: query.from,
        to: query.to,
      }),
    );
  }

  async createStockAdjustment(
    tenant: ActiveTenantMembership,
    input: z.infer<typeof CreateStockAdjustmentSchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const cfg = await tx.getBusinessConfig(tenant.businessId);
      if (!cfg) {
        throw new ApiError(404, 'BUSINESS_NOT_FOUND', 'Business configuration not found.');
      }

      const [product] = await tx.lockProductsByIds(tenant.businessId, [input.productId]);
      if (!product) {
        throw new ApiError(404, 'NOT_FOUND', 'Product not found.');
      }

      const qtyMilli = parseQtyToMilli(input.quantity, 'quantity');
      const currentOnHandMilli = parseSignedQtyToMilli(product.onHand, 'onHand');
      const deltaMilli = input.direction === 'in' ? qtyMilli : -qtyMilli;
      const newOnHandMilli = currentOnHandMilli + deltaMilli;

      if (input.direction === 'out' && !cfg.allowNegativeStock && newOnHandMilli < 0n) {
        throw new ApiError(
          409,
          'INSUFFICIENT_STOCK',
          `Cannot deduct ${formatMilliQty(qtyMilli)} of "${product.name}"; only ${product.onHand} available.`,
          { productId: product.id, available: product.onHand },
        );
      }

      const effectiveWacKobo = resolveEffectiveWacKobo(
        parseMoneyToKobo(product.weightedAvgCost),
        parseMoneyToKobo(product.lastPositiveWac),
      );
      const now = new Date().toISOString();

      const updatedProduct = await tx.updateProduct(tenant.businessId, product.id, {
        onHand: formatMilliQty(newOnHandMilli),
        weightedAvgCost: formatKobo(effectiveWacKobo),
        lastPositiveWac: formatKobo(
          parseMoneyToKobo(product.lastPositiveWac) > 0n
            ? parseMoneyToKobo(product.lastPositiveWac)
            : effectiveWacKobo,
        ),
      });

      const movement = await tx.insertStockMovement({
        id: randomUUID(),
        businessId: tenant.businessId,
        locationId: cfg.defaultLocationId,
        productId: product.id,
        movementType: input.direction === 'in' ? 'adjustment_in' : 'adjustment_out',
        quantityDelta: formatMilliQty(deltaMilli),
        balanceAfter: formatMilliQty(newOnHandMilli),
        unitCostSnapshot: formatKobo(effectiveWacKobo),
        referenceType: 'stock_adjustment',
        referenceId: null,
        reason: input.reason,
        createdBy: tenant.userId,
        createdAt: now,
      });

      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'inventory.adjusted',
        entityType: 'stock_movement',
        entityId: movement.id,
        metadata: {
          productId: product.id,
          direction: input.direction,
          quantityDelta: movement.quantityDelta,
          balanceAfter: movement.balanceAfter,
          reason: input.reason,
        },
      });

      return { movement, product: updatedProduct };
    });
  }

  async listRestockBatches(
    tenant: ActiveTenantMembership,
    opts: { limit: number; offset: number; from?: string; to?: string },
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, (tx) =>
      tx.listRestockBatches(tenant.businessId, opts),
    );
  }

  async getRestockBatch(tenant: ActiveTenantMembership, batchId: string) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const batch = await tx.getRestockBatchById(tenant.businessId, batchId);
      if (!batch) {
        throw new ApiError(404, 'NOT_FOUND', 'Restock batch not found.');
      }
      return batch;
    });
  }

  async createRestockBatch(
    tenant: ActiveTenantMembership,
    input: z.infer<typeof CreateRestockBatchSchema>,
  ): Promise<RestockBatchRecord> {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const cfg = await tx.getBusinessConfig(tenant.businessId);
      if (!cfg) {
        throw new ApiError(404, 'BUSINESS_NOT_FOUND', 'Business configuration not found.');
      }

      const productIds = input.items.map((item) => item.productId);
      const lockedProducts = await tx.lockProductsByIds(tenant.businessId, productIds);
      const productMap = new Map(lockedProducts.map((p) => [p.id, p]));

      const now = new Date().toISOString();
      const batchId = randomUUID();
      const batchNumber = await tx.nextReceiptNumber(tenant.businessId, 'RST', utcDateKey());
      const batchItems: RestockBatchItemRecord[] = [];
      let totalCostKobo = 0n;

      for (const line of input.items) {
        const product = productMap.get(line.productId);
        if (!product) {
          throw new ApiError(404, 'NOT_FOUND', `Product ${line.productId} not found.`);
        }

        const receivedQtyMilli = parseQtyToMilli(line.quantityReceived, 'quantityReceived');
        const unitCostKobo = parseMoneyToKobo(line.unitCost, 'unitCost');
        const currentOnHandMilli = parseSignedQtyToMilli(product.onHand, 'onHand');
        const currentWacKobo = parseMoneyToKobo(product.weightedAvgCost, 'weightedAvgCost');
        const lastPosWacKobo = parseMoneyToKobo(product.lastPositiveWac, 'lastPositiveWac');

        const wacResult = computeRestockMovingWac({
          currentOnHandMilli,
          currentWacKobo,
          lastPositiveWacKobo: lastPosWacKobo,
          receivedQtyMilli,
          unitCostKobo,
        });

        const lineTotalKobo = multiplyQtyByKobo(receivedQtyMilli, unitCostKobo);
        totalCostKobo += lineTotalKobo;

        // Keep in-tx product map updated if the same product appears twice in one batch
        const updated = await tx.updateProduct(tenant.businessId, product.id, {
          onHand: formatMilliQty(wacResult.newOnHandMilli),
          costPrice: formatKobo(unitCostKobo),
          weightedAvgCost: formatKobo(wacResult.newWacKobo),
          lastPositiveWac: formatKobo(wacResult.newLastPositiveWacKobo),
        });
        if (updated) {
          productMap.set(product.id, updated);
        }

        batchItems.push({
          id: randomUUID(),
          businessId: tenant.businessId,
          restockBatchId: batchId,
          productId: product.id,
          quantityReceived: formatMilliQty(receivedQtyMilli),
          unitCost: formatKobo(unitCostKobo),
          lineTotalCost: formatKobo(lineTotalKobo),
          wacBefore: formatKobo(currentWacKobo),
          wacAfter: formatKobo(wacResult.newWacKobo),
        });

        await tx.insertStockMovement({
          id: randomUUID(),
          businessId: tenant.businessId,
          locationId: cfg.defaultLocationId,
          productId: product.id,
          movementType: 'restock_in',
          quantityDelta: formatMilliQty(receivedQtyMilli),
          balanceAfter: formatMilliQty(wacResult.newOnHandMilli),
          unitCostSnapshot: formatKobo(unitCostKobo),
          referenceType: 'restock_batch',
          referenceId: batchId,
          reason: input.supplierNote ?? 'Stock restock',
          createdBy: tenant.userId,
          createdAt: now,
        });
      }

      const batch = await tx.insertRestockBatch({
        id: batchId,
        businessId: tenant.businessId,
        locationId: cfg.defaultLocationId,
        batchNumber,
        supplierNote: input.supplierNote ?? null,
        notes: input.notes ?? null,
        totalCost: formatKobo(totalCostKobo),
        receivedBy: tenant.userId,
        receivedAt: now,
        items: batchItems,
      });

      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'restock.posted',
        entityType: 'restock_batch',
        entityId: batch.id,
        metadata: {
          batchNumber: batch.batchNumber,
          itemCount: batch.items.length,
          totalCost: batch.totalCost,
        },
      });

      return batch;
    });
  }

  // ==========================================================================
  // 4. Sales, Receipts, Voids & Returns (D-03, D-13, D-14, D-15)
  // ==========================================================================

  private async executeSaleInTx(
    tx: CommerceTx,
    tenant: ActiveTenantMembership,
    input: z.infer<typeof CreateSaleSchema>,
    options: { allowOversellConflict?: boolean; soldAt?: string } = {},
  ): Promise<{ sale: SaleRecord; oversellDetected: boolean }> {
    const cfg = await tx.getBusinessConfig(tenant.businessId);
    if (!cfg) {
      throw new ApiError(404, 'BUSINESS_NOT_FOUND', 'Business configuration not found.');
    }

    const clientSaleUuid = input.clientSaleUuid ?? randomUUID();
    const existingByClientUuid = await tx.findSaleByClientUuid(tenant.businessId, clientSaleUuid);
    if (existingByClientUuid) {
      return { sale: existingByClientUuid, oversellDetected: false };
    }

    const lockedProducts = await tx.lockProductsByIds(
      tenant.businessId,
      input.items.map((i) => i.productId),
    );
    const productMap = new Map(lockedProducts.map((p) => [p.id, p]));

    const taxRateScaled = cfg.taxEnabled ? parseTaxRatePercent(cfg.taxRate, 'taxRate') : 0n;
    const now = options.soldAt ?? new Date().toISOString();
    const saleId = randomUUID();

    const saleItems: SaleItemRecord[] = [];
    let subtotalKobo = 0n;
    let totalDiscountKobo = 0n;
    let totalTaxKobo = 0n;
    let grandTotalKobo = 0n;
    let totalCogsKobo = 0n;
    let oversellDetected = false;

    // Track per-product deductions for multi-line carts referencing the same SKU
    const workingStock = new Map<string, bigint>();
    for (const p of lockedProducts) {
      workingStock.set(p.id, parseSignedQtyToMilli(p.onHand, 'onHand'));
    }

    for (const line of input.items) {
      const product = productMap.get(line.productId);
      if (!product || !product.isActive) {
        throw new ApiError(404, 'NOT_FOUND', `Active product ${line.productId} not found.`);
      }

      const qtyMilli = parseQtyToMilli(line.quantity, 'quantity');
      const unitPriceKobo = parseMoneyToKobo(product.sellingPrice, 'sellingPrice');
      const discountKobo = parseMoneyToKobo(line.discountAmount, 'discountAmount');
      const grossLineKobo = multiplyQtyByKobo(qtyMilli, unitPriceKobo);

      if (discountKobo > 0n && !hasPermission(tenant.role, 'sales.apply_discount')) {
        throw new ApiError(
          403,
          'PERMISSION_DENIED',
          'Applying line discounts requires Manager or Owner approval.',
        );
      }

      if (discountKobo > grossLineKobo) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          `Line discount cannot exceed line subtotal for "${product.name}".`,
        );
      }

      const netLineKobo = grossLineKobo - discountKobo;
      const effectiveTaxRate = cfg.taxEnabled && !product.isTaxExempt ? taxRateScaled : 0n;
      const taxCalc = computeLineTaxKobo(netLineKobo, effectiveTaxRate, cfg.taxMode);

      const effectiveWacKobo = resolveEffectiveWacKobo(
        parseMoneyToKobo(product.weightedAvgCost),
        parseMoneyToKobo(product.lastPositiveWac),
      );
      const lineCogsKobo = multiplyQtyByKobo(qtyMilli, effectiveWacKobo);

      const currentStockMilli = workingStock.get(product.id) ?? 0n;
      const nextStockMilli = currentStockMilli - qtyMilli;

      if (nextStockMilli < 0n) {
        if (options.allowOversellConflict) {
          oversellDetected = true;
        } else if (!cfg.allowNegativeStock) {
          throw new ApiError(
            409,
            'INSUFFICIENT_STOCK',
            `Insufficient stock for "${product.name}". Available: ${formatMilliQty(currentStockMilli)}, requested: ${formatMilliQty(qtyMilli)}.`,
            { productId: product.id, available: formatMilliQty(currentStockMilli) },
          );
        }
      }

      workingStock.set(product.id, nextStockMilli);

      subtotalKobo += taxCalc.subtotalExTaxKobo;
      totalDiscountKobo += discountKobo;
      totalTaxKobo += taxCalc.taxKobo;
      grandTotalKobo += taxCalc.totalKobo;
      totalCogsKobo += lineCogsKobo;

      saleItems.push({
        id: randomUUID(),
        businessId: tenant.businessId,
        saleId,
        productId: product.id,
        productNameSnapshot: product.name,
        unitSnapshot: product.unit,
        quantity: formatMilliQty(qtyMilli),
        quantityReturned: '0.000',
        unitPrice: formatKobo(unitPriceKobo),
        discountAmount: formatKobo(discountKobo),
        taxRateSnapshot: formatTaxRatePercent(effectiveTaxRate),
        taxAmount: formatKobo(taxCalc.taxKobo),
        lineTotal: formatKobo(taxCalc.totalKobo),
        unitCostSnapshot: formatKobo(effectiveWacKobo),
        lineCogs: formatKobo(lineCogsKobo),
        isTaxExemptSnapshot: product.isTaxExempt,
      });
    }

    // Validate tender split sums exactly to authoritative server grandTotalKobo (D-13)
    let tenderTotalKobo = 0n;
    let paidNowKobo = 0n;
    let creditKobo = 0n;
    const salePayments: SalePaymentRecord[] = [];

    for (const p of input.payments) {
      const amtKobo = parseMoneyToKobo(p.amount, 'payment.amount');
      tenderTotalKobo += amtKobo;
      if (p.method === 'credit') {
        creditKobo += amtKobo;
      } else {
        paidNowKobo += amtKobo;
      }
      salePayments.push({
        id: randomUUID(),
        businessId: tenant.businessId,
        saleId,
        method: p.method,
        amount: formatKobo(amtKobo),
        referenceNote: p.referenceNote ?? null,
        createdAt: now,
      });
    }

    if (tenderTotalKobo !== grandTotalKobo) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        `Payment tenders (${formatKobo(tenderTotalKobo)}) must equal server-calculated sale total (${formatKobo(grandTotalKobo)}).`,
        {
          expectedTotal: formatKobo(grandTotalKobo),
          submittedPaymentsTotal: formatKobo(tenderTotalKobo),
        },
      );
    }

    let customer: CustomerRecord | null = null;
    if (input.customerId) {
      customer = await tx.lockCustomerById(tenant.businessId, input.customerId);
      if (!customer || !customer.isActive) {
        throw new ApiError(404, 'NOT_FOUND', 'Customer not found.');
      }
    }

    if (creditKobo > 0n) {
      if (!customer) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'A registered customer is required for credit sales.',
        );
      }
      const nextBalanceKobo =
        parseMoneyToKobo(customer.outstandingBalance, 'outstandingBalance') + creditKobo;
      if (customer.creditLimit === null) {
        if (!hasPermission(tenant.role, 'sales.authorize_credit_override')) {
          throw new ApiError(
            403,
            'PERMISSION_DENIED',
            'Credit sales to customers without an approved credit limit require Manager or Owner authorization.',
          );
        }
      } else {
        const limitKobo = parseMoneyToKobo(customer.creditLimit, 'creditLimit');
        if (nextBalanceKobo > limitKobo) {
          throw new ApiError(
            400,
            'VALIDATION_ERROR',
            `Credit sale exceeds customer credit limit of ${customer.creditLimit}.`,
            { creditLimit: customer.creditLimit, projectedBalance: formatKobo(nextBalanceKobo) },
          );
        }
      }
      await tx.updateCustomer(tenant.businessId, customer.id, {
        outstandingBalance: formatKobo(nextBalanceKobo),
      });
    }

    const saleNumber =
      input.offlineReceiptNumber ??
      (await tx.nextReceiptNumber(tenant.businessId, 'REC', utcDateKey()));

    const paymentStatus: SaleRecord['paymentStatus'] =
      creditKobo === 0n ? 'paid' : paidNowKobo > 0n ? 'partial' : 'unpaid';

    // Persist stock deductions + movements (D-04 WAC freeze when hitting <= 0)
    for (const item of saleItems) {
      const product = productMap.get(item.productId)!;
      const qtyMilli = parseQtyToMilli(item.quantity);
      const prevOnHand = parseSignedQtyToMilli(product.onHand);
      const nextOnHand = prevOnHand - qtyMilli;
      const effectiveWacKobo = parseMoneyToKobo(item.unitCostSnapshot);
      const prevLastPositive = parseMoneyToKobo(product.lastPositiveWac);
      const preservedLastPositive = prevLastPositive > 0n ? prevLastPositive : effectiveWacKobo;

      const updatedProd = await tx.updateProduct(tenant.businessId, product.id, {
        onHand: formatMilliQty(nextOnHand),
        weightedAvgCost: formatKobo(effectiveWacKobo),
        lastPositiveWac: formatKobo(preservedLastPositive),
      });
      if (updatedProd) {
        productMap.set(product.id, updatedProd);
      }

      await tx.insertStockMovement({
        id: randomUUID(),
        businessId: tenant.businessId,
        locationId: cfg.defaultLocationId,
        productId: product.id,
        movementType: 'sale_out',
        quantityDelta: formatMilliQty(-qtyMilli),
        balanceAfter: formatMilliQty(nextOnHand),
        unitCostSnapshot: item.unitCostSnapshot,
        referenceType: 'sale',
        referenceId: saleId,
        reason: `Sale ${saleNumber}`,
        createdBy: tenant.userId,
        createdAt: now,
      });
    }

    const receipt: ReceiptRecord = {
      id: randomUUID(),
      businessId: tenant.businessId,
      receiptNumber: saleNumber,
      receiptType: 'sale',
      saleId,
      debtPaymentId: null,
      snapshotPayload: {
        businessName: cfg.businessName,
        locationName: cfg.locationName,
        locationAddress: cfg.locationAddress,
        locationPhone: cfg.locationPhone,
        currencyCode: cfg.currencyCode,
        receiptNumber: saleNumber,
        customerName: customer?.fullName ?? null,
        taxEnabled: cfg.taxEnabled,
        taxMode: cfg.taxMode,
        taxRate: formatTaxRatePercent(taxRateScaled),
        items: saleItems.map((i) => ({
          name: i.productNameSnapshot,
          unit: i.unitSnapshot,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
          taxAmount: i.taxAmount,
          lineTotal: i.lineTotal,
        })),
        subtotalAmount: formatKobo(subtotalKobo),
        discountAmount: formatKobo(totalDiscountKobo),
        taxAmount: formatKobo(totalTaxKobo),
        totalAmount: formatKobo(grandTotalKobo),
        amountPaid: formatKobo(paidNowKobo),
        creditAmount: formatKobo(creditKobo),
        creditRemaining: formatKobo(creditKobo),
        payments: salePayments.map((p) => ({
          method: p.method,
          amount: p.amount,
          referenceNote: p.referenceNote,
        })),
        notes: input.notes ?? null,
        receiptFooter: cfg.receiptFooter,
        issuedAt: now,
      },
      issuedBy: tenant.userId,
      issuedAt: now,
    };

    const saleRecord: SaleRecord = {
      id: saleId,
      businessId: tenant.businessId,
      locationId: cfg.defaultLocationId,
      customerId: customer?.id ?? null,
      deviceId: input.deviceId ?? null,
      clientSaleUuid,
      saleNumber,
      status: 'completed',
      paymentStatus,
      subtotalAmount: formatKobo(subtotalKobo),
      discountAmount: formatKobo(totalDiscountKobo),
      taxEnabledSnapshot: cfg.taxEnabled,
      taxModeSnapshot: cfg.taxMode,
      taxRateSnapshot: formatTaxRatePercent(taxRateScaled),
      taxAmount: formatKobo(totalTaxKobo),
      totalAmount: formatKobo(grandTotalKobo),
      amountPaid: formatKobo(paidNowKobo),
      creditAmount: formatKobo(creditKobo),
      creditRemaining: formatKobo(creditKobo),
      totalCogs: formatKobo(totalCogsKobo),
      notes: input.notes ?? null,
      soldBy: tenant.userId,
      soldAt: now,
      createdAt: now,
      items: saleItems,
      payments: salePayments,
      receipt,
      returns: [],
    };

    const persistedSale = await tx.insertSale(saleRecord);
    await tx.insertReceipt(receipt);

    await tx.recordAudit({
      businessId: tenant.businessId,
      actorUserId: tenant.userId,
      actorRole: tenant.role,
      action: 'sale.created',
      entityType: 'sale',
      entityId: persistedSale.id,
      metadata: {
        saleNumber: persistedSale.saleNumber,
        totalAmount: persistedSale.totalAmount,
        taxAmount: persistedSale.taxAmount,
        paymentStatus: persistedSale.paymentStatus,
        oversellDetected,
      },
    });

    return { sale: persistedSale, oversellDetected };
  }

  async createSale(tenant: ActiveTenantMembership, input: z.infer<typeof CreateSaleSchema>) {
    const result = await this.repo.runTenantTransaction(tenant.businessId, tenant.userId, (tx) =>
      this.executeSaleInTx(tx, tenant, input),
    );
    return projectSaleForRole(result.sale, tenant.role);
  }

  async listSales(tenant: ActiveTenantMembership, query: z.infer<typeof SaleListQuerySchema>) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const page = await tx.listSales(tenant.businessId, {
        limit: query.limit,
        offset: query.offset,
        status: query.status,
        paymentStatus: query.paymentStatus,
        paymentMethod: query.paymentMethod,
        customerId: query.customerId,
        cashierUserId: query.cashierUserId,
        search: query.search,
        from: query.from,
        to: query.to,
      });
      return {
        total: page.total,
        items: page.items.map((s) => projectSaleForRole(s, tenant.role)),
      };
    });
  }

  async getSale(tenant: ActiveTenantMembership, saleId: string) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const sale = await tx.getSaleById(tenant.businessId, saleId);
      if (!sale) {
        throw new ApiError(404, 'NOT_FOUND', 'Sale not found.');
      }
      return projectSaleForRole(sale, tenant.role);
    });
  }

  async getReceipt(tenant: ActiveTenantMembership, receiptId: string) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const receipt = await tx.getReceiptById(tenant.businessId, receiptId);
      if (!receipt) {
        throw new ApiError(404, 'NOT_FOUND', 'Receipt not found.');
      }
      return receipt;
    });
  }

  async voidSale(
    tenant: ActiveTenantMembership,
    saleId: string,
    input: z.infer<typeof VoidSaleSchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const sale = await tx.lockSaleById(tenant.businessId, saleId);
      if (!sale) {
        throw new ApiError(404, 'NOT_FOUND', 'Sale not found.');
      }
      if (sale.status !== 'completed') {
        throw new ApiError(
          409,
          'DUPLICATE_TRANSACTION',
          'Only completed sales with no prior voids or partial returns can be fully voided.',
        );
      }

      const items = sale.items.map((item) => ({
        saleItemId: item.id,
        quantity: item.quantity,
        disposition: input.disposition,
      }));

      return this.processSaleReversalInTx(tx, tenant, sale, {
        returnType: 'full_void',
        reason: input.reason,
        refundMethod: input.refundMethod,
        refundReferenceNote: input.refundReferenceNote ?? null,
        items,
      });
    });
  }

  async returnSale(
    tenant: ActiveTenantMembership,
    saleId: string,
    input: z.infer<typeof ReturnSaleSchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const sale = await tx.lockSaleById(tenant.businessId, saleId);
      if (!sale) {
        throw new ApiError(404, 'NOT_FOUND', 'Sale not found.');
      }
      if (sale.status === 'voided' || sale.status === 'returned') {
        throw new ApiError(
          409,
          'DUPLICATE_TRANSACTION',
          'This sale has already been completely voided or returned.',
        );
      }

      return this.processSaleReversalInTx(tx, tenant, sale, {
        returnType: 'return',
        reason: input.reason,
        refundMethod: input.refundMethod,
        refundReferenceNote: input.refundReferenceNote ?? null,
        items: input.items.map((i) => ({
          saleItemId: i.saleItemId,
          quantity: String(i.quantity),
          disposition: i.disposition,
        })),
      });
    });
  }

  private async processSaleReversalInTx(
    tx: CommerceTx,
    tenant: ActiveTenantMembership,
    sale: SaleRecord,
    params: {
      returnType: 'full_void' | 'return';
      reason: string;
      refundMethod: 'cash' | 'transfer' | 'pos_card';
      refundReferenceNote: string | null;
      items: Array<{ saleItemId: string; quantity: string; disposition: 'restock' | 'damaged' }>;
    },
  ) {
    const now = new Date().toISOString();
    const saleReturnId = randomUUID();
    const saleItemMap = new Map(sale.items.map((i) => [i.id, i]));
    const updatedReturnedTotals: Record<string, string> = {};
    for (const item of sale.items) {
      updatedReturnedTotals[item.id] = item.quantityReturned;
    }

    const productIds = new Set<string>();
    const returnItems: SaleReturnItemRecord[] = [];
    let totalReversedKobo = 0n;

    for (const reqItem of params.items) {
      const saleItem = saleItemMap.get(reqItem.saleItemId);
      if (!saleItem) {
        throw new ApiError(404, 'NOT_FOUND', `Sale line item ${reqItem.saleItemId} not found.`);
      }

      const soldMilli = parseQtyToMilli(saleItem.quantity);
      const alreadyReturnedMilli = parseQtyToMilli(updatedReturnedTotals[saleItem.id] ?? '0.000');
      const requestedMilli = parseQtyToMilli(reqItem.quantity);

      if (alreadyReturnedMilli + requestedMilli > soldMilli) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          `Return quantity exceeds remaining returnable quantity for "${saleItem.productNameSnapshot}".`,
        );
      }

      // Compute exact proportional reversal from immutable original lineTotal & taxAmount
      const origLineTotalKobo = parseMoneyToKobo(saleItem.lineTotal);
      const origLineTaxKobo = parseMoneyToKobo(saleItem.taxAmount);
      const lineReversedKobo =
        requestedMilli === soldMilli
          ? origLineTotalKobo
          : (origLineTotalKobo * requestedMilli + soldMilli / 2n) / soldMilli;
      const taxReversedKobo =
        requestedMilli === soldMilli
          ? origLineTaxKobo
          : (origLineTaxKobo * requestedMilli + soldMilli / 2n) / soldMilli;

      totalReversedKobo += lineReversedKobo;
      updatedReturnedTotals[saleItem.id] = formatMilliQty(alreadyReturnedMilli + requestedMilli);
      productIds.add(saleItem.productId);

      returnItems.push({
        id: randomUUID(),
        businessId: tenant.businessId,
        saleReturnId,
        saleItemId: saleItem.id,
        productId: saleItem.productId,
        quantityReturned: formatMilliQty(requestedMilli),
        disposition: reqItem.disposition,
        unitPriceSnapshot: saleItem.unitPrice,
        taxReversed: formatKobo(taxReversedKobo),
        lineReversedTotal: formatKobo(lineReversedKobo),
        unitCostSnapshot: saleItem.unitCostSnapshot,
      });
    }

    // D-15 Debt-first settlement: reduce unpaid credit before issuing cash/transfer/POS refund
    const creditRemainingKobo = parseMoneyToKobo(sale.creditRemaining);
    const debtReducedKobo =
      creditRemainingKobo < totalReversedKobo ? creditRemainingKobo : totalReversedKobo;
    const refundAmountKobo = totalReversedKobo - debtReducedKobo;
    const nextCreditRemainingKobo = creditRemainingKobo - debtReducedKobo;

    if (debtReducedKobo > 0n && sale.customerId) {
      const customer = await tx.lockCustomerById(tenant.businessId, sale.customerId);
      if (customer) {
        const curBal = parseMoneyToKobo(customer.outstandingBalance);
        const nextBal = curBal > debtReducedKobo ? curBal - debtReducedKobo : 0n;
        await tx.updateCustomer(tenant.businessId, customer.id, {
          outstandingBalance: formatKobo(nextBal),
        });
      }
    }

    // Restock sellable items; record damaged returns without increasing sellable stock (D-15)
    const lockedProducts = await tx.lockProductsByIds(tenant.businessId, [...productIds]);
    const productMap = new Map(lockedProducts.map((p) => [p.id, p]));

    for (const rItem of returnItems) {
      const product = productMap.get(rItem.productId);
      if (!product) continue;

      const qtyMilli = parseQtyToMilli(rItem.quantityReturned);
      const curOnHand = parseSignedQtyToMilli(product.onHand);

      if (rItem.disposition === 'restock') {
        const nextOnHand = curOnHand + qtyMilli;
        const updated = await tx.updateProduct(tenant.businessId, product.id, {
          onHand: formatMilliQty(nextOnHand),
        });
        if (updated) productMap.set(product.id, updated);

        await tx.insertStockMovement({
          id: randomUUID(),
          businessId: tenant.businessId,
          locationId: sale.locationId,
          productId: product.id,
          movementType: 'return_restock',
          quantityDelta: formatMilliQty(qtyMilli),
          balanceAfter: formatMilliQty(nextOnHand),
          unitCostSnapshot: rItem.unitCostSnapshot,
          referenceType: 'sale_return',
          referenceId: saleReturnId,
          reason: params.reason,
          createdBy: tenant.userId,
          createdAt: now,
        });
      } else {
        await tx.insertStockMovement({
          id: randomUUID(),
          businessId: tenant.businessId,
          locationId: sale.locationId,
          productId: product.id,
          movementType: 'return_damaged',
          quantityDelta: '0.000',
          balanceAfter: formatMilliQty(curOnHand),
          unitCostSnapshot: rItem.unitCostSnapshot,
          referenceType: 'sale_return',
          referenceId: saleReturnId,
          reason: `Damaged return: ${params.reason}`,
          createdBy: tenant.userId,
          createdAt: now,
        });
      }
    }

    const refund: SaleRefundRecord | null =
      refundAmountKobo > 0n
        ? {
            id: randomUUID(),
            businessId: tenant.businessId,
            saleReturnId,
            method: params.refundMethod,
            amount: formatKobo(refundAmountKobo),
            referenceNote: params.refundReferenceNote,
            processedBy: tenant.userId,
            createdAt: now,
          }
        : null;

    const saleReturn: SaleReturnRecord = {
      id: saleReturnId,
      businessId: tenant.businessId,
      saleId: sale.id,
      returnType: params.returnType,
      reason: params.reason,
      totalReversed: formatKobo(totalReversedKobo),
      debtReducedAmount: formatKobo(debtReducedKobo),
      refundAmount: formatKobo(refundAmountKobo),
      processedBy: tenant.userId,
      createdAt: now,
      items: returnItems,
      refund,
    };

    const allItemsReturned = sale.items.every(
      (i) => parseQtyToMilli(updatedReturnedTotals[i.id] ?? '0.000') >= parseQtyToMilli(i.quantity),
    );
    const nextStatus: SaleRecord['status'] =
      params.returnType === 'full_void'
        ? 'voided'
        : allItemsReturned
          ? 'returned'
          : 'partially_returned';
    const nextPaymentStatus: SaleRecord['paymentStatus'] =
      nextCreditRemainingKobo === 0n ? 'paid' : sale.paymentStatus;

    const updatedSale = await tx.updateSaleAfterReturn(tenant.businessId, sale.id, {
      status: nextStatus,
      paymentStatus: nextPaymentStatus,
      creditRemaining: formatKobo(nextCreditRemainingKobo),
      itemReturnedTotals: updatedReturnedTotals,
      saleReturn,
    });

    await tx.recordAudit({
      businessId: tenant.businessId,
      actorUserId: tenant.userId,
      actorRole: tenant.role,
      action: params.returnType === 'full_void' ? 'sale.voided' : 'sale.returned',
      entityType: 'sale_return',
      entityId: saleReturn.id,
      metadata: {
        saleId: sale.id,
        totalReversed: saleReturn.totalReversed,
        debtReducedAmount: saleReturn.debtReducedAmount,
        refundAmount: saleReturn.refundAmount,
        reason: params.reason,
      },
    });

    return { sale: updatedSale, saleReturn };
  }

  // ==========================================================================
  // 5. Customers & Debt Payments
  // ==========================================================================

  async listCustomers(
    tenant: ActiveTenantMembership,
    opts: { limit: number; offset: number; search?: string; hasDebtOnly?: boolean },
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, (tx) =>
      tx.listCustomers(tenant.businessId, opts),
    );
  }

  async listBusinessDebtPayments(
    tenant: ActiveTenantMembership,
    opts: {
      limit: number;
      offset: number;
      status?: 'posted' | 'reversed';
      from?: string;
      to?: string;
    },
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, (tx) =>
      tx.listBusinessDebtPayments(tenant.businessId, opts),
    );
  }

  async getCustomerDetail(tenant: ActiveTenantMembership, customerId: string) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const customer = await tx.getCustomerById(tenant.businessId, customerId);
      if (!customer) {
        throw new ApiError(404, 'NOT_FOUND', 'Customer not found.');
      }
      const openCreditSales = await tx.listOpenCreditSalesForCustomer(
        tenant.businessId,
        customerId,
      );
      const debtPayments = await tx.listDebtPaymentsForCustomer(tenant.businessId, customerId);
      return {
        customer,
        openCreditSales: openCreditSales.map((s) => projectSaleForRole(s, tenant.role)),
        debtPayments,
      };
    });
  }

  async createCustomer(
    tenant: ActiveTenantMembership,
    input: z.infer<typeof CreateCustomerSchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const now = new Date().toISOString();
      const customer = await tx.insertCustomer({
        id: randomUUID(),
        businessId: tenant.businessId,
        fullName: input.fullName,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        creditLimit:
          input.creditLimit !== undefined && input.creditLimit !== null
            ? formatKobo(parseMoneyToKobo(input.creditLimit, 'creditLimit'))
            : null,
        outstandingBalance: '0.00',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'customer.created',
        entityType: 'customer',
        entityId: customer.id,
        metadata: { fullName: customer.fullName },
      });

      return customer;
    });
  }

  async updateCustomer(
    tenant: ActiveTenantMembership,
    customerId: string,
    input: z.infer<typeof UpdateCustomerSchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const patch: Partial<CustomerRecord> = {};
      if (input.fullName !== undefined) patch.fullName = input.fullName;
      if (input.phone !== undefined) patch.phone = input.phone;
      if (input.email !== undefined) patch.email = input.email;
      if (input.address !== undefined) patch.address = input.address;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      if (input.creditLimit !== undefined) {
        patch.creditLimit =
          input.creditLimit === null
            ? null
            : formatKobo(parseMoneyToKobo(input.creditLimit, 'creditLimit'));
      }

      const updated = await tx.updateCustomer(tenant.businessId, customerId, patch);
      if (!updated) {
        throw new ApiError(404, 'NOT_FOUND', 'Customer not found.');
      }

      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'customer.updated',
        entityType: 'customer',
        entityId: updated.id,
        metadata: { isActive: updated.isActive },
      });

      return updated;
    });
  }

  private async collectDebtPaymentInTx(
    tx: CommerceTx,
    tenant: ActiveTenantMembership,
    customerId: string,
    input: z.infer<typeof CreateDebtPaymentSchema>,
    paidAt?: string,
  ): Promise<CustomerDebtPaymentRecord> {
    const cfg = await tx.getBusinessConfig(tenant.businessId);
    const customer = await tx.getCustomerById(tenant.businessId, customerId);
    if (!customer) {
      throw new ApiError(404, 'NOT_FOUND', 'Customer not found.');
    }

    const paymentAmountKobo = parseMoneyToKobo(input.amount, 'amount');
    const outstandingKobo = parseMoneyToKobo(customer.outstandingBalance, 'outstandingBalance');

    if (outstandingKobo <= 0n) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Customer has no outstanding debt balance.');
    }
    if (paymentAmountKobo > outstandingKobo) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        `Debt payment (${formatKobo(paymentAmountKobo)}) exceeds outstanding balance (${customer.outstandingBalance}).`,
      );
    }

    const openSales = await tx.listOpenCreditSalesForCustomer(tenant.businessId, customerId);
    const targetSales =
      input.saleIds && input.saleIds.length > 0
        ? openSales.filter((s) => input.saleIds!.includes(s.id))
        : openSales;

    const now = paidAt ?? new Date().toISOString();
    const debtPaymentId = randomUUID();
    const allocations: DebtAllocationRecord[] = [];
    let remainingToAllocate = paymentAmountKobo;

    for (const sale of targetSales) {
      if (remainingToAllocate <= 0n) break;
      const saleRem = parseMoneyToKobo(sale.creditRemaining);
      if (saleRem <= 0n) continue;

      const applied = saleRem < remainingToAllocate ? saleRem : remainingToAllocate;
      const nextSaleRem = saleRem - applied;
      const nextSalePaid = parseMoneyToKobo(sale.amountPaid) + applied;

      await tx.updateSaleCreditPayment(tenant.businessId, sale.id, {
        amountPaid: formatKobo(nextSalePaid),
        creditRemaining: formatKobo(nextSaleRem),
        paymentStatus: nextSaleRem === 0n ? 'paid' : 'partial',
      });

      allocations.push({
        id: randomUUID(),
        businessId: tenant.businessId,
        debtPaymentId,
        saleId: sale.id,
        allocatedAmount: formatKobo(applied),
        createdAt: now,
      });

      remainingToAllocate -= applied;
    }

    if (remainingToAllocate > 0n) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Specified credit sales do not cover the full payment amount.',
      );
    }

    const nextCustomerBal = outstandingKobo - paymentAmountKobo;
    await tx.updateCustomer(tenant.businessId, customer.id, {
      outstandingBalance: formatKobo(nextCustomerBal),
    });

    const receiptNumber = await tx.nextReceiptNumber(tenant.businessId, 'DBT', utcDateKey());
    const receipt: ReceiptRecord = {
      id: randomUUID(),
      businessId: tenant.businessId,
      receiptNumber,
      receiptType: 'debt_payment',
      saleId: null,
      debtPaymentId,
      snapshotPayload: {
        businessName: cfg?.businessName ?? tenant.businessName,
        currencyCode: cfg?.currencyCode ?? 'NGN',
        receiptNumber,
        customerName: customer.fullName,
        amountPaid: formatKobo(paymentAmountKobo),
        method: input.method,
        previousBalance: customer.outstandingBalance,
        newBalance: formatKobo(nextCustomerBal),
        allocations: allocations.map((a) => ({
          saleId: a.saleId,
          allocatedAmount: a.allocatedAmount,
        })),
        issuedAt: now,
      },
      issuedBy: tenant.userId,
      issuedAt: now,
    };

    const payment = await tx.insertDebtPayment({
      id: debtPaymentId,
      businessId: tenant.businessId,
      customerId: customer.id,
      amount: formatKobo(paymentAmountKobo),
      method: input.method,
      referenceNote: input.referenceNote ?? null,
      status: 'posted',
      reversalReason: null,
      reversedBy: null,
      reversedAt: null,
      collectedBy: tenant.userId,
      paidAt: now,
      allocations,
      receipt,
    });
    await tx.insertReceipt(receipt);

    await tx.recordAudit({
      businessId: tenant.businessId,
      actorUserId: tenant.userId,
      actorRole: tenant.role,
      action: 'debt_payment.recorded',
      entityType: 'customer_debt_payment',
      entityId: payment.id,
      metadata: {
        customerId: customer.id,
        amount: payment.amount,
        method: payment.method,
        newBalance: formatKobo(nextCustomerBal),
      },
    });

    return payment;
  }

  async collectDebtPayment(
    tenant: ActiveTenantMembership,
    customerId: string,
    input: z.infer<typeof CreateDebtPaymentSchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, (tx) =>
      this.collectDebtPaymentInTx(tx, tenant, customerId, input),
    );
  }

  async reverseDebtPayment(
    tenant: ActiveTenantMembership,
    customerId: string,
    paymentId: string,
    input: z.infer<typeof ReverseFinancialRecordSchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const payment = await tx.getDebtPaymentById(tenant.businessId, customerId, paymentId);
      if (!payment) {
        throw new ApiError(404, 'NOT_FOUND', 'Debt payment not found.');
      }
      if (payment.status === 'reversed') {
        throw new ApiError(409, 'DUPLICATE_TRANSACTION', 'Debt payment is already reversed.');
      }

      const customer = await tx.getCustomerById(tenant.businessId, customerId);
      if (!customer) {
        throw new ApiError(404, 'NOT_FOUND', 'Customer not found.');
      }

      // Restore allocated credit balances on each sale
      for (const alloc of payment.allocations) {
        const sale = await tx.getSaleById(tenant.businessId, alloc.saleId);
        if (!sale) continue;
        const allocKobo = parseMoneyToKobo(alloc.allocatedAmount);
        const restoredRem = parseMoneyToKobo(sale.creditRemaining) + allocKobo;
        const paidNow = parseMoneyToKobo(sale.amountPaid);
        const restoredPaid = paidNow > allocKobo ? paidNow - allocKobo : 0n;
        await tx.updateSaleCreditPayment(tenant.businessId, sale.id, {
          amountPaid: formatKobo(restoredPaid),
          creditRemaining: formatKobo(restoredRem),
          paymentStatus: restoredPaid > 0n ? 'partial' : 'unpaid',
        });
      }

      const restoredBal =
        parseMoneyToKobo(customer.outstandingBalance) + parseMoneyToKobo(payment.amount);
      await tx.updateCustomer(tenant.businessId, customer.id, {
        outstandingBalance: formatKobo(restoredBal),
      });

      const now = new Date().toISOString();
      const reversed = await tx.markDebtPaymentReversed(tenant.businessId, payment.id, {
        reversalReason: input.reason,
        reversedBy: tenant.userId,
        reversedAt: now,
      });

      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'debt_payment.reversed',
        entityType: 'customer_debt_payment',
        entityId: payment.id,
        metadata: { customerId, amount: payment.amount, reason: input.reason },
      });

      return reversed;
    });
  }

  // ==========================================================================
  // 6. Operating Expenses
  // ==========================================================================

  async listExpenseCategories(tenant: ActiveTenantMembership) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, (tx) =>
      tx.listExpenseCategories(tenant.businessId),
    );
  }

  async createExpenseCategory(
    tenant: ActiveTenantMembership,
    input: z.infer<typeof CreateExpenseCategorySchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const dup = await tx.findExpenseCategoryByName(tenant.businessId, input.name);
      if (dup) {
        throw new ApiError(409, 'DUPLICATE_TRANSACTION', 'Expense category already exists.');
      }
      const created = await tx.insertExpenseCategory({
        id: randomUUID(),
        businessId: tenant.businessId,
        name: input.name,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'expense_category.created',
        entityType: 'expense_category',
        entityId: created.id,
        metadata: { name: created.name },
      });
      return created;
    });
  }

  async listExpenses(
    tenant: ActiveTenantMembership,
    opts: {
      limit: number;
      offset: number;
      categoryId?: string;
      status?: 'posted' | 'reversed';
      paymentMethod?: 'cash' | 'transfer' | 'pos_card';
      from?: string;
      to?: string;
    },
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, (tx) =>
      tx.listExpenses(tenant.businessId, opts),
    );
  }

  async createExpense(
    tenant: ActiveTenantMembership,
    input: z.infer<typeof CreateExpenseSchema>,
  ): Promise<ExpenseRecord> {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const cat = await tx.getExpenseCategoryById(tenant.businessId, input.categoryId);
      if (!cat) {
        throw new ApiError(404, 'NOT_FOUND', 'Expense category not found.');
      }
      const amtKobo = parseMoneyToKobo(input.amount, 'amount');
      const created = await tx.insertExpense({
        id: randomUUID(),
        businessId: tenant.businessId,
        locationId: tenant.defaultLocationId,
        categoryId: cat.id,
        amount: formatKobo(amtKobo),
        paymentMethod: input.paymentMethod,
        description: input.description,
        incurredOn: input.incurredOn,
        attachmentId: input.attachmentId ?? null,
        status: 'posted',
        reversalReason: null,
        reversedBy: null,
        reversedAt: null,
        recordedBy: tenant.userId,
        createdAt: new Date().toISOString(),
      });

      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'expense.posted',
        entityType: 'expense',
        entityId: created.id,
        metadata: {
          amount: created.amount,
          categoryId: created.categoryId,
          paymentMethod: created.paymentMethod,
        },
      });
      return created;
    });
  }

  async reverseExpense(
    tenant: ActiveTenantMembership,
    expenseId: string,
    input: z.infer<typeof ReverseFinancialRecordSchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const exp = await tx.getExpenseById(tenant.businessId, expenseId);
      if (!exp) {
        throw new ApiError(404, 'NOT_FOUND', 'Expense not found.');
      }
      if (exp.status === 'reversed') {
        throw new ApiError(409, 'DUPLICATE_TRANSACTION', 'Expense has already been reversed.');
      }
      const reversed = await tx.markExpenseReversed(tenant.businessId, expenseId, {
        reversalReason: input.reason,
        reversedBy: tenant.userId,
        reversedAt: new Date().toISOString(),
      });

      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'expense.reversed',
        entityType: 'expense',
        entityId: expenseId,
        metadata: { amount: exp.amount, reason: input.reason },
      });

      return reversed;
    });
  }

  // ==========================================================================
  // 7. Basic Reports & Safe CSV Export (Readable in read_only per D-01)
  // ==========================================================================

  async getSummaryReport(
    tenant: ActiveTenantMembership,
    query: z.infer<typeof ReportDateRangeQuerySchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const salesPage = await tx.listSales(tenant.businessId, {
        limit: 10_000,
        offset: 0,
        from: query.from,
        to: query.to,
      });
      const expensesPage = await tx.listExpenses(tenant.businessId, {
        limit: 10_000,
        offset: 0,
        status: 'posted',
        from: query.from,
        to: query.to,
      });
      const customersPage = await tx.listCustomers(tenant.businessId, {
        limit: 10_000,
        offset: 0,
        hasDebtOnly: true,
      });

      let grossSalesKobo = 0n;
      let returnsTotalKobo = 0n;
      let cashSalesKobo = 0n;
      let creditSalesKobo = 0n;
      let totalTaxKobo = 0n;
      let netCogsKobo = 0n;
      let completedCount = 0;

      for (const sale of salesPage.items) {
        const saleTotal = parseMoneyToKobo(sale.totalAmount);
        grossSalesKobo += saleTotal;
        totalTaxKobo += parseMoneyToKobo(sale.taxAmount);
        cashSalesKobo += parseMoneyToKobo(sale.amountPaid);
        creditSalesKobo += parseMoneyToKobo(sale.creditAmount);

        if (sale.status !== 'voided') {
          completedCount += 1;
          netCogsKobo += parseMoneyToKobo(sale.totalCogs);
        }

        for (const ret of sale.returns) {
          returnsTotalKobo += parseMoneyToKobo(ret.totalReversed);
          if (sale.status !== 'voided') {
            for (const ri of ret.items) {
              if (ri.disposition === 'restock') {
                netCogsKobo -= multiplyQtyByKobo(
                  parseQtyToMilli(ri.quantityReturned),
                  parseMoneyToKobo(ri.unitCostSnapshot),
                );
              }
            }
          }
        }
      }

      if (netCogsKobo < 0n) netCogsKobo = 0n;
      const netSalesKobo = grossSalesKobo - returnsTotalKobo;
      const grossProfitKobo = netSalesKobo - netCogsKobo;

      let totalExpensesKobo = 0n;
      for (const exp of expensesPage.items) {
        totalExpensesKobo += parseMoneyToKobo(exp.amount);
      }

      const netOperatingProfitKobo = grossProfitKobo - totalExpensesKobo;

      let totalOutstandingReceivablesKobo = 0n;
      for (const cust of customersPage.items) {
        totalOutstandingReceivablesKobo += parseMoneyToKobo(cust.outstandingBalance);
      }

      return {
        salesCount: completedCount,
        grossSales: formatKobo(grossSalesKobo),
        returnsAndVoids: formatKobo(returnsTotalKobo),
        netSales: formatKobo(netSalesKobo),
        cashCollectedOnSales: formatKobo(cashSalesKobo),
        creditExtended: formatKobo(creditSalesKobo),
        taxCollected: formatKobo(totalTaxKobo),
        cogs: formatKobo(netCogsKobo),
        grossProfit: formatKobo(grossProfitKobo),
        operatingExpenses: formatKobo(totalExpensesKobo),
        netOperatingProfit: formatKobo(netOperatingProfitKobo),
        outstandingReceivables: formatKobo(totalOutstandingReceivablesKobo),
      };
    });
  }

  async getSalesByDayReport(
    tenant: ActiveTenantMembership,
    query: z.infer<typeof ReportDateRangeQuerySchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const salesPage = await tx.listSales(tenant.businessId, {
        limit: 10_000,
        offset: 0,
        from: query.from,
        to: query.to,
      });

      const byDay = new Map<string, { count: number; grossKobo: bigint; reversedKobo: bigint }>();
      for (const s of salesPage.items) {
        const day = s.soldAt.slice(0, 10);
        const cur = byDay.get(day) ?? { count: 0, grossKobo: 0n, reversedKobo: 0n };
        cur.count += 1;
        cur.grossKobo += parseMoneyToKobo(s.totalAmount);
        for (const r of s.returns) {
          cur.reversedKobo += parseMoneyToKobo(r.totalReversed);
        }
        byDay.set(day, cur);
      }

      return [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, stats]) => ({
          date,
          salesCount: stats.count,
          grossSales: formatKobo(stats.grossKobo),
          netSales: formatKobo(stats.grossKobo - stats.reversedKobo),
        }));
    });
  }

  async getSalesByCategoryReport(
    tenant: ActiveTenantMembership,
    query: z.infer<typeof ReportDateRangeQuerySchema>,
  ): Promise<SalesByCategoryRow[]> {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const [salesPage, productsPage, categoriesPage] = await Promise.all([
        tx.listSales(tenant.businessId, {
          limit: 10_000,
          offset: 0,
          from: query.from,
          to: query.to,
        }),
        tx.listProducts(tenant.businessId, {
          limit: 10_000,
          offset: 0,
        }),
        tx.listCategories(tenant.businessId, {
          limit: 1_000,
          offset: 0,
        }),
      ]);

      const categoryNameById = new Map<string, string>(
        categoriesPage.items.map((c) => [c.id, c.name]),
      );
      const productCategoryId = new Map<string, string | null>(
        productsPage.items.map((p) => [p.id, p.categoryId]),
      );

      const agg = new Map<
        string,
        {
          categoryId: string | null;
          categoryName: string;
          unitsMilli: bigint;
          revenueKobo: bigint;
          cogsKobo: bigint;
        }
      >();

      let grandTotalRevenueKobo = 0n;

      for (const s of salesPage.items) {
        if (s.status === 'voided') continue;

        const returnedByItemId = new Map<
          string,
          { qtyMilli: bigint; reversedKobo: bigint; restockCogsKobo: bigint }
        >();
        for (const ret of s.returns) {
          for (const ri of ret.items) {
            const cur = returnedByItemId.get(ri.saleItemId) ?? {
              qtyMilli: 0n,
              reversedKobo: 0n,
              restockCogsKobo: 0n,
            };
            const qm = parseQtyToMilli(ri.quantityReturned);
            cur.qtyMilli += qm;
            cur.reversedKobo += parseMoneyToKobo(ri.lineReversedTotal);
            if (ri.disposition === 'restock') {
              cur.restockCogsKobo += multiplyQtyByKobo(qm, parseMoneyToKobo(ri.unitCostSnapshot));
            }
            returnedByItemId.set(ri.saleItemId, cur);
          }
        }

        for (const item of s.items) {
          const catId = productCategoryId.get(item.productId) ?? null;
          const key = catId ?? '__uncategorized__';
          const catName = (catId ? categoryNameById.get(catId) : null) ?? 'Uncategorized';

          const retInfo = returnedByItemId.get(item.id);
          const itemQty = parseQtyToMilli(item.quantity);
          const netQty =
            retInfo && itemQty > retInfo.qtyMilli
              ? itemQty - retInfo.qtyMilli
              : retInfo
                ? 0n
                : itemQty;
          const itemRev = parseMoneyToKobo(item.lineTotal);
          const netRev =
            retInfo && itemRev > retInfo.reversedKobo
              ? itemRev - retInfo.reversedKobo
              : retInfo
                ? 0n
                : itemRev;
          const itemCogs = parseMoneyToKobo(item.lineCogs);
          const netCogs =
            retInfo && itemCogs > retInfo.restockCogsKobo
              ? itemCogs - retInfo.restockCogsKobo
              : retInfo
                ? 0n
                : itemCogs;

          const cur = agg.get(key) ?? {
            categoryId: catId,
            categoryName: catName,
            unitsMilli: 0n,
            revenueKobo: 0n,
            cogsKobo: 0n,
          };
          cur.unitsMilli += netQty;
          cur.revenueKobo += netRev;
          cur.cogsKobo += netCogs;
          agg.set(key, cur);
          grandTotalRevenueKobo += netRev;
        }
      }

      return [...agg.values()]
        .filter((row) => row.revenueKobo > 0n)
        .sort((a, b) =>
          b.revenueKobo > a.revenueKobo ? 1 : b.revenueKobo < a.revenueKobo ? -1 : 0,
        )
        .slice(0, query.limit)
        .map((row) => ({
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          unitsSold: formatMilliQty(row.unitsMilli),
          revenue: formatKobo(row.revenueKobo),
          cogs: formatKobo(row.cogsKobo),
          grossProfit: formatKobo(row.revenueKobo - row.cogsKobo),
          sharePercent:
            grandTotalRevenueKobo > 0n
              ? Math.round((Number(row.revenueKobo) / Number(grandTotalRevenueKobo)) * 100)
              : 0,
        }));
    });
  }

  async getTopProductsReport(
    tenant: ActiveTenantMembership,
    query: z.infer<typeof ReportDateRangeQuerySchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const salesPage = await tx.listSales(tenant.businessId, {
        limit: 10_000,
        offset: 0,
        from: query.from,
        to: query.to,
      });

      const agg = new Map<
        string,
        {
          productId: string;
          name: string;
          unitsMilli: bigint;
          revenueKobo: bigint;
          cogsKobo: bigint;
        }
      >();

      for (const s of salesPage.items) {
        if (s.status === 'voided') continue;
        for (const item of s.items) {
          const cur = agg.get(item.productId) ?? {
            productId: item.productId,
            name: item.productNameSnapshot,
            unitsMilli: 0n,
            revenueKobo: 0n,
            cogsKobo: 0n,
          };
          cur.unitsMilli += parseQtyToMilli(item.quantity);
          cur.revenueKobo += parseMoneyToKobo(item.lineTotal);
          cur.cogsKobo += parseMoneyToKobo(item.lineCogs);
          agg.set(item.productId, cur);
        }
      }

      return [...agg.values()]
        .sort((a, b) => (b.revenueKobo > a.revenueKobo ? 1 : -1))
        .slice(0, query.limit)
        .map((row) => ({
          productId: row.productId,
          productName: row.name,
          unitsSold: formatMilliQty(row.unitsMilli),
          revenue: formatKobo(row.revenueKobo),
          cogs: formatKobo(row.cogsKobo),
          grossProfit: formatKobo(row.revenueKobo - row.cogsKobo),
        }));
    });
  }

  async getInventoryValuationReport(tenant: ActiveTenantMembership) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const page = await tx.listProducts(tenant.businessId, {
        limit: 10_000,
        offset: 0,
        isActive: true,
      });

      let totalValuationKobo = 0n;
      let totalRetailValueKobo = 0n;
      const lowStockItems: Array<{
        productId: string;
        name: string;
        onHand: string;
        reorderLevel: string;
      }> = [];

      for (const p of page.items) {
        const onHandMilli = parseSignedQtyToMilli(p.onHand);
        const positiveStock = onHandMilli > 0n ? onHandMilli : 0n;
        totalValuationKobo += multiplyQtyByKobo(positiveStock, parseMoneyToKobo(p.weightedAvgCost));
        totalRetailValueKobo += multiplyQtyByKobo(positiveStock, parseMoneyToKobo(p.sellingPrice));

        if (onHandMilli <= parseQtyToMilli(p.reorderLevel)) {
          lowStockItems.push({
            productId: p.id,
            name: p.name,
            onHand: p.onHand,
            reorderLevel: p.reorderLevel,
          });
        }
      }

      return {
        activeProductCount: page.items.length,
        totalCostValuation: formatKobo(totalValuationKobo),
        totalRetailValue: formatKobo(totalRetailValueKobo),
        lowStockCount: lowStockItems.length,
        lowStockItems,
      };
    });
  }

  async getDebtorsAgingReport(tenant: ActiveTenantMembership) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const customers = await tx.listCustomers(tenant.businessId, {
        limit: 10_000,
        offset: 0,
        hasDebtOnly: true,
      });

      const nowMs = Date.now();
      const buckets = {
        days0to30: 0n,
        days31to60: 0n,
        days61to90: 0n,
        days90Plus: 0n,
      };

      const debtors = [];
      for (const c of customers.items) {
        const openSales = await tx.listOpenCreditSalesForCustomer(tenant.businessId, c.id);
        for (const s of openSales) {
          const ageDays = Math.floor((nowMs - Date.parse(s.soldAt)) / 86_400_000);
          const rem = parseMoneyToKobo(s.creditRemaining);
          if (ageDays <= 30) buckets.days0to30 += rem;
          else if (ageDays <= 60) buckets.days31to60 += rem;
          else if (ageDays <= 90) buckets.days61to90 += rem;
          else buckets.days90Plus += rem;
        }
        debtors.push({
          customerId: c.id,
          fullName: c.fullName,
          phone: c.phone,
          outstandingBalance: c.outstandingBalance,
          openInvoiceCount: openSales.length,
        });
      }

      return {
        buckets: {
          days0to30: formatKobo(buckets.days0to30),
          days31to60: formatKobo(buckets.days31to60),
          days61to90: formatKobo(buckets.days61to90),
          days90Plus: formatKobo(buckets.days90Plus),
        },
        debtors,
      };
    });
  }

  async exportCsvReport(
    tenant: ActiveTenantMembership,
    query: z.infer<typeof ReportExportQuerySchema>,
  ): Promise<{ filename: string; csv: string }> {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const lines: string[] = [];

      if (query.type === 'sales') {
        lines.push(
          ['Sale Number', 'Date', 'Status', 'Payment Status', 'Total', 'Tax', 'COGS']
            .map(sanitizeCsvCell)
            .join(','),
        );
        const page = await tx.listSales(tenant.businessId, {
          limit: 10_000,
          offset: 0,
          from: query.from,
          to: query.to,
        });
        for (const s of page.items) {
          lines.push(
            [
              s.saleNumber,
              s.soldAt,
              s.status,
              s.paymentStatus,
              s.totalAmount,
              s.taxAmount,
              s.totalCogs,
            ]
              .map(sanitizeCsvCell)
              .join(','),
          );
        }
      } else if (query.type === 'expenses') {
        lines.push(
          ['Date', 'Description', 'Method', 'Status', 'Amount'].map(sanitizeCsvCell).join(','),
        );
        const page = await tx.listExpenses(tenant.businessId, {
          limit: 10_000,
          offset: 0,
          from: query.from,
          to: query.to,
        });
        for (const e of page.items) {
          lines.push(
            [e.incurredOn, e.description, e.paymentMethod, e.status, e.amount]
              .map(sanitizeCsvCell)
              .join(','),
          );
        }
      } else if (query.type === 'inventory') {
        lines.push(
          ['SKU', 'Product Name', 'On Hand', 'Reorder Level', 'Selling Price', 'WAC']
            .map(sanitizeCsvCell)
            .join(','),
        );
        const page = await tx.listProducts(tenant.businessId, { limit: 10_000, offset: 0 });
        for (const p of page.items) {
          lines.push(
            [p.sku ?? '', p.name, p.onHand, p.reorderLevel, p.sellingPrice, p.weightedAvgCost]
              .map(sanitizeCsvCell)
              .join(','),
          );
        }
      } else {
        lines.push(
          ['Customer Name', 'Phone', 'Credit Limit', 'Outstanding Balance']
            .map(sanitizeCsvCell)
            .join(','),
        );
        const page = await tx.listCustomers(tenant.businessId, {
          limit: 10_000,
          offset: 0,
          hasDebtOnly: true,
        });
        for (const c of page.items) {
          lines.push(
            [c.fullName, c.phone ?? '', c.creditLimit ?? '', c.outstandingBalance]
              .map(sanitizeCsvCell)
              .join(','),
          );
        }
      }

      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'report.exported',
        entityType: 'report',
        entityId: null,
        metadata: { type: query.type, rowCount: Math.max(0, lines.length - 1) },
      });

      return {
        filename: `festola-${query.type}-${utcDateKey()}.csv`,
        csv: lines.join('\n'),
      };
    });
  }

  // ==========================================================================
  // 8. Plans, Subscriptions & Paystack Billing Webhooks (D-01, D-07)
  // ==========================================================================

  async listPlans() {
    return this.repo.runSystemTransaction((tx) => tx.listSubscriptionPlans());
  }

  async getCurrentSubscription(tenant: ActiveTenantMembership) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, (tx) =>
      tx.getSubscriptionUsage(tenant.businessId),
    );
  }

  async listSubscriptionInvoices(
    tenant: ActiveTenantMembership,
    opts: { limit: number; offset: number },
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, (tx) =>
      tx.listSubscriptionInvoices(tenant.businessId, opts),
    );
  }

  async initiateSubscriptionCheckout(
    tenant: ActiveTenantMembership,
    actorEmail: string,
    input: z.infer<typeof SubscriptionCheckoutSchema>,
  ) {
    if (!this.paystack) {
      throw new ApiError(
        503,
        'INTERNAL_SERVER_ERROR',
        'Payment provider is not configured for this environment.',
      );
    }

    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const plan = await tx.findPlanByCode(input.planCode);
      if (!plan) {
        throw new ApiError(404, 'NOT_FOUND', `Subscription plan "${input.planCode}" not found.`);
      }

      const amountKobo = parseMoneyToKobo(plan.priceAmount, 'plan.priceAmount');
      if (amountKobo <= 0n) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          'Paid checkout cannot be initiated for a zero-price or trial plan.',
        );
      }

      const reference = `FST-${utcDateKey()}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const initialized = await this.paystack!.initializeTransaction({
        email: actorEmail,
        amountKobo,
        currencyCode: plan.currencyCode,
        reference,
        callbackUrl: input.callbackUrl,
        metadata: {
          businessId: tenant.businessId,
          planId: plan.id,
          planCode: plan.planCode,
        },
      });

      const invoice = await tx.insertSubscriptionInvoice({
        id: randomUUID(),
        businessId: tenant.businessId,
        planId: plan.id,
        provider: 'paystack',
        providerReference: initialized.reference,
        amount: plan.priceAmount,
        currencyCode: plan.currencyCode,
        status: 'pending',
        checkoutUrl: initialized.authorizationUrl,
        paidAt: null,
        createdAt: new Date().toISOString(),
      });

      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'billing.checkout_initiated',
        entityType: 'subscription_invoice',
        entityId: invoice.id,
        metadata: {
          planCode: plan.planCode,
          amount: plan.priceAmount,
          reference: invoice.providerReference,
        },
      });

      return { invoice, authorizationUrl: initialized.authorizationUrl };
    });
  }

  async verifySubscriptionPayment(
    tenant: ActiveTenantMembership,
    input: z.infer<typeof SubscriptionVerifySchema>,
  ) {
    if (!this.paystack) {
      throw new ApiError(
        503,
        'INTERNAL_SERVER_ERROR',
        'Payment provider is not configured for this environment.',
      );
    }

    const verification = await this.paystack.verifyTransaction(input.reference);

    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const invoice = await tx.findSubscriptionInvoiceByReference(input.reference);
      if (!invoice || invoice.businessId !== tenant.businessId) {
        throw new ApiError(404, 'NOT_FOUND', 'Subscription invoice not found.');
      }

      if (invoice.status === 'paid') {
        return { invoice, alreadyVerified: true };
      }

      const expectedKobo = parseMoneyToKobo(invoice.amount);
      if (
        verification.status !== 'success' ||
        verification.amountKobo !== expectedKobo ||
        verification.currencyCode.toUpperCase() !== invoice.currencyCode.toUpperCase()
      ) {
        throw new ApiError(
          422,
          'PAYMENT_VERIFICATION_FAILED',
          'Payment verification failed: status, amount, or currency mismatch.',
        );
      }

      const paidAt = verification.paidAt ?? new Date().toISOString();
      const updated = await tx.markSubscriptionInvoicePaid(invoice.providerReference, paidAt);
      await tx.activateBusinessSubscription(tenant.businessId, invoice.planId, paidAt);

      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'billing.payment_verified',
        entityType: 'subscription_invoice',
        entityId: invoice.id,
        metadata: { reference: invoice.providerReference, amount: invoice.amount },
      });

      return { invoice: updated ?? invoice, alreadyVerified: false };
    });
  }

  async handlePaystackWebhook(params: {
    rawBody: Buffer;
    signatureHeader: string | undefined;
    parsedBody: Record<string, unknown>;
  }) {
    if (!this.paystackWebhookSecret) {
      throw new ApiError(
        503,
        'INTERNAL_SERVER_ERROR',
        'Paystack webhook secret is not configured.',
      );
    }
    if (!params.signatureHeader) {
      throw new ApiError(422, 'WEBHOOK_SIGNATURE_INVALID', 'Missing x-paystack-signature header.');
    }

    const expectedSig = createHmac('sha512', this.paystackWebhookSecret)
      .update(params.rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    const providedBuf = Buffer.from(params.signatureHeader.trim(), 'utf8');
    if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
      throw new ApiError(422, 'WEBHOOK_SIGNATURE_INVALID', 'Invalid Paystack webhook signature.');
    }

    const eventType = String(params.parsedBody.event ?? 'unknown');
    const data = (params.parsedBody.data ?? {}) as Record<string, unknown>;
    const providerEventId = String(data.id ?? data.reference ?? '');
    if (!providerEventId) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Webhook event is missing event identifier.');
    }

    return this.repo.runSystemTransaction(async (tx) => {
      const existing = await tx.findWebhookEvent('paystack', providerEventId);
      if (existing) {
        return { duplicate: true, eventId: existing.id };
      }

      const reference = typeof data.reference === 'string' ? data.reference : null;
      let businessId: string | null = null;

      if (eventType === 'charge.success' && reference) {
        const invoice = await tx.findSubscriptionInvoiceByReference(reference);
        if (invoice) {
          businessId = invoice.businessId;
          const expectedKobo = parseMoneyToKobo(invoice.amount);
          const receivedKobo = BigInt(Math.round(Number(data.amount ?? 0)));
          const receivedCurrency = String(data.currency ?? '').toUpperCase();

          if (
            receivedKobo === expectedKobo &&
            receivedCurrency === invoice.currencyCode.toUpperCase() &&
            invoice.status !== 'paid'
          ) {
            const paidAt =
              typeof data.paid_at === 'string' ? data.paid_at : new Date().toISOString();
            await tx.markSubscriptionInvoicePaid(reference, paidAt);
            await tx.activateBusinessSubscription(invoice.businessId, invoice.planId, paidAt);
            await tx.recordAudit({
              businessId: invoice.businessId,
              actorUserId: null,
              actorRole: 'system',
              action: 'billing.webhook_payment_reconciled',
              entityType: 'subscription_invoice',
              entityId: invoice.id,
              metadata: { reference, eventType, providerEventId },
            });
          }
        }
      }

      const saved = await tx.insertWebhookEvent({
        id: randomUUID(),
        provider: 'paystack',
        providerEventId,
        eventType,
        businessId,
        payload: params.parsedBody,
        processedAt: new Date().toISOString(),
      });

      return { duplicate: false, eventId: saved.id };
    });
  }

  // ==========================================================================
  // 9. Offline Sync & Conflict Resolution (D-05, D-09)
  // ==========================================================================

  private async assertActiveDevice(tenant: ActiveTenantMembership, deviceId: string) {
    const device = await this.repo.runTenantTransaction(tenant.businessId, tenant.userId, (tx) =>
      tx.getDeviceForBusiness(tenant.businessId, deviceId),
    );
    if (!device) {
      throw new ApiError(404, 'NOT_FOUND', 'Registered device not found in this business.');
    }
    if (device.status === 'revoked') {
      throw new ApiError(
        403,
        'DEVICE_REVOKED',
        'This offline device has been revoked. Clear local offline data immediately.',
        { wipeLocalData: true, deviceId: device.id },
      );
    }
    if (Date.parse(device.offlineExpiresAt) < Date.now()) {
      throw new ApiError(
        403,
        'DEVICE_REVOKED',
        'Offline authorization window has expired. Re-verify device online before syncing.',
        { wipeLocalData: false, expired: true, deviceId: device.id },
      );
    }
    return device;
  }

  async getSyncBootstrap(tenant: ActiveTenantMembership, deviceId: string) {
    await this.assertActiveDevice(tenant, deviceId);
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const config = await tx.getBusinessConfig(tenant.businessId);
      const productsPage = await tx.listProducts(tenant.businessId, {
        limit: 5000,
        offset: 0,
        isActive: true,
      });
      const customersPage = await tx.listCustomers(tenant.businessId, {
        limit: 5000,
        offset: 0,
      });

      return {
        syncCursor: new Date().toISOString(),
        business: config,
        products: productsPage.items.map((p) => projectProductForRole(p, tenant.role)),
        customers: customersPage.items,
      };
    });
  }

  async pushSyncBatch(
    tenant: ActiveTenantMembership,
    deviceId: string,
    input: z.infer<typeof SyncPushSchema>,
  ) {
    await this.assertActiveDevice(tenant, deviceId);

    const results: Array<{
      clientOperationUuid: string;
      status: 'applied' | 'conflict';
      entityId?: string;
      conflictId?: string;
      reason?: string;
    }> = [];

    for (const op of input.operations) {
      try {
        if (op.operationType === 'offline_sale') {
          const outcome = await this.repo.runTenantTransaction(
            tenant.businessId,
            tenant.userId,
            async (tx) => {
              const saleResult = await this.executeSaleInTx(
                tx,
                tenant,
                {
                  ...op.payload,
                  clientSaleUuid: op.payload.clientSaleUuid ?? op.clientOperationUuid,
                  deviceId,
                },
                { allowOversellConflict: true, soldAt: op.occurredAt },
              );

              let conflict: SyncConflictRecord | null = null;
              if (saleResult.oversellDetected) {
                conflict = await tx.insertSyncConflict({
                  id: randomUUID(),
                  businessId: tenant.businessId,
                  deviceId,
                  clientOperationUuid: op.clientOperationUuid,
                  entityType: 'sale',
                  reason: 'insufficient_stock_oversell',
                  status: 'open',
                  resolutionAction: null,
                  resolutionNote: null,
                  resolvedBy: null,
                  resolvedAt: null,
                  payload: { saleId: saleResult.sale.id, saleNumber: saleResult.sale.saleNumber },
                  createdAt: new Date().toISOString(),
                });
              }
              return { sale: saleResult.sale, conflict };
            },
          );

          results.push({
            clientOperationUuid: op.clientOperationUuid,
            status: outcome.conflict ? 'conflict' : 'applied',
            entityId: outcome.sale.id,
            conflictId: outcome.conflict?.id,
            reason: outcome.conflict?.reason,
          });
        } else if (op.operationType === 'offline_customer_create') {
          const created = await this.createCustomer(tenant, op.payload);
          results.push({
            clientOperationUuid: op.clientOperationUuid,
            status: 'applied',
            entityId: created.id,
          });
        } else {
          const debtPayment = await this.repo.runTenantTransaction(
            tenant.businessId,
            tenant.userId,
            (tx) =>
              this.collectDebtPaymentInTx(tx, tenant, op.customerId, op.payload, op.occurredAt),
          );
          results.push({
            clientOperationUuid: op.clientOperationUuid,
            status: 'applied',
            entityId: debtPayment.id,
          });
        }
      } catch (err) {
        const conflict = await this.repo.runTenantTransaction(
          tenant.businessId,
          tenant.userId,
          async (tx) =>
            tx.insertSyncConflict({
              id: randomUUID(),
              businessId: tenant.businessId,
              deviceId,
              clientOperationUuid: op.clientOperationUuid,
              entityType: op.operationType,
              reason: 'validation_error',
              status: 'open',
              resolutionAction: null,
              resolutionNote: null,
              resolvedBy: null,
              resolvedAt: null,
              payload: {
                errorMessage: err instanceof Error ? err.message : 'Offline sync error',
              },
              createdAt: new Date().toISOString(),
            }),
        );
        results.push({
          clientOperationUuid: op.clientOperationUuid,
          status: 'conflict',
          conflictId: conflict.id,
          reason: conflict.reason,
        });
      }
    }

    return {
      processedCount: results.length,
      appliedCount: results.filter((r) => r.status === 'applied').length,
      conflictCount: results.filter((r) => r.status === 'conflict').length,
      results,
    };
  }

  async listSyncConflicts(
    tenant: ActiveTenantMembership,
    opts: { limit: number; offset: number; status?: 'open' | 'resolved' },
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, (tx) =>
      tx.listSyncConflicts(tenant.businessId, opts),
    );
  }

  async resolveSyncConflict(
    tenant: ActiveTenantMembership,
    conflictId: string,
    input: z.infer<typeof ResolveSyncConflictSchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const existing = await tx.getSyncConflictById(tenant.businessId, conflictId);
      if (!existing) {
        throw new ApiError(404, 'NOT_FOUND', 'Sync conflict not found.');
      }
      if (existing.status === 'resolved') {
        throw new ApiError(409, 'DUPLICATE_TRANSACTION', 'Sync conflict is already resolved.');
      }
      const resolved = await tx.resolveSyncConflict(tenant.businessId, conflictId, {
        action: input.action,
        note: input.note,
        resolvedBy: tenant.userId,
        resolvedAt: new Date().toISOString(),
      });
      await tx.recordAudit({
        businessId: tenant.businessId,
        actorUserId: tenant.userId,
        actorRole: tenant.role,
        action: 'sync_conflict.resolved',
        entityType: 'sync_conflict',
        entityId: conflictId,
        metadata: { action: input.action, note: input.note },
      });
      return resolved;
    });
  }

  // ==========================================================================
  // 10. Approved Notifications (D-12 In-App Only via API)
  // ==========================================================================

  async listNotifications(
    tenant: ActiveTenantMembership,
    query: z.infer<typeof NotificationQuerySchema>,
  ) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, (tx) =>
      tx.listNotifications(tenant.businessId, tenant.userId, {
        limit: query.limit,
        offset: query.offset,
        unreadOnly: query.unreadOnly,
      }),
    );
  }

  async markNotificationRead(tenant: ActiveTenantMembership, notificationId: string) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const updated = await tx.markNotificationRead(
        tenant.businessId,
        tenant.userId,
        notificationId,
      );
      if (!updated) {
        throw new ApiError(404, 'NOT_FOUND', 'Notification not found.');
      }
      return updated;
    });
  }

  async markAllNotificationsRead(tenant: ActiveTenantMembership) {
    return this.repo.runTenantTransaction(tenant.businessId, tenant.userId, async (tx) => {
      const updatedCount = await tx.markAllNotificationsRead(tenant.businessId, tenant.userId);
      return { updatedCount };
    });
  }
}
