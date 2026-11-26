import type { PoolClient } from 'pg';
import type { DbPoolHandle } from '../../lib/db.ts';
import { sortIdsForLocking, writeAuditEvent } from '../../lib/tx.ts';
import type { CommerceRepository, CommerceTx } from './commerce.repository.ts';
import type {
  ActiveDeviceLookup,
  AuditLogRecord,
  BusinessDebtPaymentListItem,
  BusinessLocationRecord,
  BusinessTaxAndStockConfig,
  CustomerDebtPaymentRecord,
  CustomerRecord,
  ExpenseCategoryRecord,
  ExpenseRecord,
  NotificationRecord,
  PaymentWebhookEventRecord,
  ProductCategoryRecord,
  ProductRecord,
  ReceiptRecord,
  RestockBatchRecord,
  SaleItemRecord,
  SalePaymentRecord,
  SaleRecord,
  SaleRefundRecord,
  SaleReturnItemRecord,
  SaleReturnRecord,
  StockMovementRecord,
  SubscriptionInvoiceRecord,
  SubscriptionPlanCatalogItem,
  SyncConflictRecord,
} from './commerce.types.ts';

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function toIsoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : toIso(value);
}

function mapProductRow(row: Record<string, unknown>): ProductRecord {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    categoryId: row.category_id ? String(row.category_id) : null,
    sku: row.sku ? String(row.sku) : null,
    barcode: row.barcode ? String(row.barcode) : null,
    name: String(row.name),
    unit: String(row.unit),
    sellingPrice: String(row.selling_price),
    costPrice: String(row.cost_price),
    weightedAvgCost: String(row.weighted_avg_cost ?? row.cost_price ?? '0.00'),
    lastPositiveWac: String(row.last_positive_wac ?? row.weighted_avg_cost ?? '0.00'),
    onHand: String(row.on_hand ?? '0.000'),
    reorderLevel: String(row.reorder_level ?? '0.000'),
    isTaxExempt: Boolean(row.is_tax_exempt),
    isActive: Boolean(row.is_active),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapCustomerRow(row: Record<string, unknown>): CustomerRecord {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    fullName: String(row.full_name),
    phone: row.phone ? String(row.phone) : null,
    email: row.email ? String(row.email) : null,
    address: row.address ? String(row.address) : null,
    creditLimit:
      row.credit_limit !== null && row.credit_limit !== undefined ? String(row.credit_limit) : null,
    outstandingBalance: String(row.outstanding_balance ?? '0.00'),
    isActive: Boolean(row.is_active),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/**
 * PostgreSQL CommerceRepository executing all tenant operations inside `withTenantTransaction`
 * so PostgreSQL RLS (`has_active_tenant_access(business_id)`) and `FOR UPDATE` row locks
 * guard every financial mutation and audit log atomically.
 */
export class PgCommerceRepository implements CommerceRepository {
  private readonly db: DbPoolHandle;

  constructor(db: DbPoolHandle) {
    this.db = db;
  }

  private createTx(client: PoolClient): CommerceTx {
    const hydrateSale = async (
      businessId: string,
      saleRow: Record<string, unknown>,
    ): Promise<SaleRecord> => {
      const saleId = String(saleRow.id);
      const itemsRes = await client.query(
        `SELECT * FROM public.sale_items WHERE business_id = $1 AND sale_id = $2 ORDER BY id ASC`,
        [businessId, saleId],
      );
      const paymentsRes = await client.query(
        `SELECT * FROM public.sale_payments WHERE business_id = $1 AND sale_id = $2 ORDER BY created_at ASC`,
        [businessId, saleId],
      );
      const receiptRes = await client.query(
        `SELECT * FROM public.receipts WHERE business_id = $1 AND sale_id = $2 LIMIT 1`,
        [businessId, saleId],
      );
      const returnsRes = await client.query(
        `SELECT * FROM public.sale_returns WHERE business_id = $1 AND sale_id = $2 ORDER BY created_at ASC`,
        [businessId, saleId],
      );

      const items: SaleItemRecord[] = itemsRes.rows.map((r) => ({
        id: String(r.id),
        businessId: String(r.business_id),
        saleId: String(r.sale_id),
        productId: String(r.product_id),
        productNameSnapshot: String(r.product_name_snapshot),
        unitSnapshot: String(r.unit_snapshot ?? 'pcs'),
        quantity: String(r.quantity),
        quantityReturned: String(r.quantity_returned ?? '0.000'),
        unitPrice: String(r.unit_price),
        discountAmount: String(r.discount_amount ?? '0.00'),
        taxRateSnapshot: String(r.tax_rate_snapshot ?? '0.0000'),
        taxAmount: String(r.tax_amount ?? '0.00'),
        lineTotal: String(r.line_total),
        unitCostSnapshot: String(r.unit_cost_snapshot ?? '0.00'),
        lineCogs: String(r.line_cogs ?? '0.00'),
        isTaxExemptSnapshot: Boolean(r.is_tax_exempt_snapshot),
      }));

      const payments: SalePaymentRecord[] = paymentsRes.rows.map((r) => ({
        id: String(r.id),
        businessId: String(r.business_id),
        saleId: String(r.sale_id),
        method: String(r.payment_method) as SalePaymentRecord['method'],
        amount: String(r.amount),
        referenceNote: r.reference_note ? String(r.reference_note) : null,
        createdAt: toIso(r.created_at),
      }));

      const recRow = receiptRes.rows[0];
      const receipt: ReceiptRecord | null = recRow
        ? {
            id: String(recRow.id),
            businessId: String(recRow.business_id),
            receiptNumber: String(recRow.receipt_number),
            receiptType: String(recRow.receipt_type) as ReceiptRecord['receiptType'],
            saleId: recRow.sale_id ? String(recRow.sale_id) : null,
            debtPaymentId: recRow.debt_payment_id ? String(recRow.debt_payment_id) : null,
            snapshotPayload: (recRow.snapshot_payload ?? {}) as Record<string, unknown>,
            issuedBy: String(recRow.issued_by),
            issuedAt: toIso(recRow.issued_at),
          }
        : null;

      let returns: SaleReturnRecord[] = [];
      if (returnsRes.rows.length > 0) {
        const returnIds = returnsRes.rows.map((r) => String(r.id));
        const retItemsRes = await client.query(
          `SELECT * FROM public.sale_return_items WHERE business_id = $1 AND sale_return_id = ANY($2::uuid[])`,
          [businessId, returnIds],
        );
        const refundsRes = await client.query(
          `SELECT * FROM public.sale_refunds WHERE business_id = $1 AND sale_return_id = ANY($2::uuid[])`,
          [businessId, returnIds],
        );

        const itemsByReturn = new Map<string, SaleReturnItemRecord[]>();
        for (const ri of retItemsRes.rows) {
          const rid = String(ri.sale_return_id);
          const list = itemsByReturn.get(rid) ?? [];
          list.push({
            id: String(ri.id),
            businessId: String(ri.business_id),
            saleReturnId: rid,
            saleItemId: String(ri.sale_item_id),
            productId: String(ri.product_id),
            quantityReturned: String(ri.quantity_returned),
            disposition: String(ri.disposition) as SaleReturnItemRecord['disposition'],
            unitPriceSnapshot: String(ri.unit_price_snapshot),
            taxReversed: String(ri.tax_reversed ?? '0.00'),
            lineReversedTotal: String(ri.line_reversed_total),
            unitCostSnapshot: String(ri.unit_cost_snapshot),
          });
          itemsByReturn.set(rid, list);
        }

        const refundByReturn = new Map<string, SaleRefundRecord>();
        for (const rf of refundsRes.rows) {
          const rid = String(rf.sale_return_id);
          refundByReturn.set(rid, {
            id: String(rf.id),
            businessId: String(rf.business_id),
            saleReturnId: rid,
            method: String(rf.payment_method) as SaleRefundRecord['method'],
            amount: String(rf.amount),
            referenceNote: rf.reference_note ? String(rf.reference_note) : null,
            processedBy: String(rf.processed_by),
            createdAt: toIso(rf.created_at),
          });
        }

        returns = returnsRes.rows.map((r) => {
          const rid = String(r.id);
          return {
            id: rid,
            businessId: String(r.business_id),
            saleId: String(r.sale_id),
            returnType: String(r.return_type) as SaleReturnRecord['returnType'],
            reason: String(r.reason),
            totalReversed: String(r.total_reversed),
            debtReducedAmount: String(r.debt_reduced_amount ?? '0.00'),
            refundAmount: String(r.refund_amount ?? '0.00'),
            processedBy: String(r.processed_by),
            createdAt: toIso(r.created_at),
            items: itemsByReturn.get(rid) ?? [],
            refund: refundByReturn.get(rid) ?? null,
          };
        });
      }

      return {
        id: saleId,
        businessId,
        locationId: String(saleRow.location_id),
        customerId: saleRow.customer_id ? String(saleRow.customer_id) : null,
        deviceId: saleRow.device_id ? String(saleRow.device_id) : null,
        clientSaleUuid: String(saleRow.client_sale_uuid),
        saleNumber: String(saleRow.sale_number),
        status: String(saleRow.status) as SaleRecord['status'],
        paymentStatus: String(saleRow.payment_status) as SaleRecord['paymentStatus'],
        subtotalAmount: String(saleRow.subtotal_amount),
        discountAmount: String(saleRow.discount_amount ?? '0.00'),
        taxEnabledSnapshot: Boolean(saleRow.tax_enabled_snapshot),
        taxModeSnapshot: String(
          saleRow.tax_mode_snapshot ?? 'exclusive',
        ) as SaleRecord['taxModeSnapshot'],
        taxRateSnapshot: String(saleRow.tax_rate_snapshot ?? '0.0000'),
        taxAmount: String(saleRow.tax_amount ?? '0.00'),
        totalAmount: String(saleRow.total_amount),
        amountPaid: String(saleRow.amount_paid ?? '0.00'),
        creditAmount: String(saleRow.credit_amount ?? '0.00'),
        creditRemaining: String(saleRow.credit_remaining ?? '0.00'),
        totalCogs: String(saleRow.total_cogs ?? '0.00'),
        notes: saleRow.notes ? String(saleRow.notes) : null,
        soldBy: String(saleRow.sold_by),
        soldAt: toIso(saleRow.sold_at),
        createdAt: toIso(saleRow.created_at),
        items,
        payments,
        receipt,
        returns,
      };
    };

    return {
      async getBusinessConfig(businessId): Promise<BusinessTaxAndStockConfig | null> {
        const res = await client.query(
          `SELECT b.id, b.name, b.currency_code, b.tax_enabled, b.tax_mode, b.tax_rate,
                  b.allow_negative_stock, b.receipt_footer,
                  l.id AS location_id, l.name AS location_name, l.address AS location_address, l.phone AS location_phone
             FROM public.businesses b
             JOIN public.business_locations l
               ON l.business_id = b.id AND l.is_active = TRUE
            WHERE b.id = $1
            ORDER BY l.is_default DESC, l.created_at ASC
            LIMIT 1`,
          [businessId],
        );
        const row = res.rows[0];
        if (!row) return null;
        return {
          businessId: String(row.id),
          businessName: String(row.name),
          currencyCode: String(row.currency_code),
          taxEnabled: Boolean(row.tax_enabled),
          taxMode: String(row.tax_mode) as BusinessTaxAndStockConfig['taxMode'],
          taxRate: String(row.tax_rate),
          allowNegativeStock: Boolean(row.allow_negative_stock),
          receiptFooter: row.receipt_footer ? String(row.receipt_footer) : null,
          defaultLocationId: String(row.location_id),
          locationName: String(row.location_name),
          locationAddress: row.location_address ? String(row.location_address) : null,
          locationPhone: row.location_phone ? String(row.location_phone) : null,
        };
      },

      async listLocations(businessId): Promise<BusinessLocationRecord[]> {
        const res = await client.query(
          `SELECT * FROM public.business_locations WHERE business_id = $1 AND is_active = TRUE ORDER BY is_default DESC`,
          [businessId],
        );
        return res.rows.map((r) => ({
          id: String(r.id),
          businessId: String(r.business_id),
          name: String(r.name),
          address: r.address ? String(r.address) : null,
          phone: r.phone ? String(r.phone) : null,
          isDefault: Boolean(r.is_default),
          isActive: Boolean(r.is_active),
          createdAt: toIso(r.created_at),
          updatedAt: toIso(r.updated_at),
        }));
      },

      async updateLocation(businessId, locationId, patch) {
        const res = await client.query(
          `UPDATE public.business_locations
              SET name = COALESCE($3, name),
                  address = CASE WHEN $4::boolean THEN $5 ELSE address END,
                  phone = CASE WHEN $6::boolean THEN $7 ELSE phone END,
                  updated_at = NOW()
            WHERE business_id = $1 AND id = $2 AND is_active = TRUE
            RETURNING *`,
          [
            businessId,
            locationId,
            patch.name ?? null,
            patch.address !== undefined,
            patch.address ?? null,
            patch.phone !== undefined,
            patch.phone ?? null,
          ],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          name: String(r.name),
          address: r.address ? String(r.address) : null,
          phone: r.phone ? String(r.phone) : null,
          isDefault: Boolean(r.is_default),
          isActive: Boolean(r.is_active),
          createdAt: toIso(r.created_at),
          updatedAt: toIso(r.updated_at),
        };
      },

      async listCategories(businessId, opts) {
        const res = await client.query(
          `SELECT *, COUNT(*) OVER() AS total_count
             FROM public.product_categories
            WHERE business_id = $1
              AND ($2::boolean IS NULL OR is_active = $2)
              AND ($3::text IS NULL OR name ILIKE '%' || $3 || '%')
            ORDER BY name ASC
            LIMIT $4 OFFSET $5`,
          [businessId, opts.isActive ?? null, opts.search ?? null, opts.limit, opts.offset],
        );
        return {
          total: res.rows[0] ? Number(res.rows[0].total_count) : 0,
          items: res.rows.map((r) => ({
            id: String(r.id),
            businessId: String(r.business_id),
            name: String(r.name),
            description: r.description ? String(r.description) : null,
            isActive: Boolean(r.is_active),
            createdAt: toIso(r.created_at),
            updatedAt: toIso(r.updated_at),
          })),
        };
      },

      async findCategoryByName(businessId, name) {
        const res = await client.query(
          `SELECT * FROM public.product_categories WHERE business_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
          [businessId, name],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          name: String(r.name),
          description: r.description ? String(r.description) : null,
          isActive: Boolean(r.is_active),
          createdAt: toIso(r.created_at),
          updatedAt: toIso(r.updated_at),
        };
      },

      async getCategoryById(businessId, categoryId) {
        const res = await client.query(
          `SELECT * FROM public.product_categories WHERE business_id = $1 AND id = $2 LIMIT 1`,
          [businessId, categoryId],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          name: String(r.name),
          description: r.description ? String(r.description) : null,
          isActive: Boolean(r.is_active),
          createdAt: toIso(r.created_at),
          updatedAt: toIso(r.updated_at),
        };
      },

      async insertCategory(record): Promise<ProductCategoryRecord> {
        await client.query(
          `INSERT INTO public.product_categories (id, business_id, name, description, is_active)
           VALUES ($1, $2, $3, $4, $5)`,
          [record.id, record.businessId, record.name, record.description, record.isActive],
        );
        return record;
      },

      async updateCategory(businessId, categoryId, patch) {
        const res = await client.query(
          `UPDATE public.product_categories
              SET name = COALESCE($3, name),
                  description = CASE WHEN $4::boolean THEN $5 ELSE description END,
                  is_active = COALESCE($6, is_active),
                  updated_at = NOW()
            WHERE business_id = $1 AND id = $2
            RETURNING *`,
          [
            businessId,
            categoryId,
            patch.name ?? null,
            patch.description !== undefined,
            patch.description ?? null,
            patch.isActive ?? null,
          ],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          name: String(r.name),
          description: r.description ? String(r.description) : null,
          isActive: Boolean(r.is_active),
          createdAt: toIso(r.created_at),
          updatedAt: toIso(r.updated_at),
        };
      },

      async countActiveProducts(businessId) {
        const res = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM public.products WHERE business_id = $1 AND is_active = TRUE`,
          [businessId],
        );
        return Number(res.rows[0]?.cnt ?? 0);
      },

      async listProducts(businessId, opts) {
        const res = await client.query(
          `SELECT p.*, sb.on_hand, sb.weighted_avg_cost, sb.last_positive_wac,
                  COUNT(*) OVER() AS total_count
             FROM public.products p
             LEFT JOIN public.stock_balances sb
               ON sb.business_id = p.business_id AND sb.product_id = p.id
            WHERE p.business_id = $1
              AND ($2::uuid IS NULL OR p.category_id = $2)
              AND ($3::boolean IS NULL OR p.is_active = $3)
              AND ($4::boolean IS NULL OR $4 = FALSE OR COALESCE(sb.on_hand, 0) <= p.reorder_level)
              AND ($5::text IS NULL OR p.name ILIKE '%' || $5 || '%' OR p.sku ILIKE '%' || $5 || '%' OR p.barcode ILIKE '%' || $5 || '%')
            ORDER BY p.name ASC
            LIMIT $6 OFFSET $7`,
          [
            businessId,
            opts.categoryId ?? null,
            opts.isActive ?? null,
            opts.lowStockOnly ?? null,
            opts.search ?? null,
            opts.limit,
            opts.offset,
          ],
        );
        return {
          total: res.rows[0] ? Number(res.rows[0].total_count) : 0,
          items: res.rows.map((r) => mapProductRow(r)),
        };
      },

      async getProductById(businessId, productId) {
        const res = await client.query(
          `SELECT p.*, sb.on_hand, sb.weighted_avg_cost, sb.last_positive_wac
             FROM public.products p
             LEFT JOIN public.stock_balances sb
               ON sb.business_id = p.business_id AND sb.product_id = p.id
            WHERE p.business_id = $1 AND p.id = $2
            LIMIT 1`,
          [businessId, productId],
        );
        return res.rows[0] ? mapProductRow(res.rows[0]) : null;
      },

      async lockProductsByIds(businessId, productIds) {
        const ordered = sortIdsForLocking(productIds);
        if (ordered.length === 0) return [];
        const res = await client.query(
          `SELECT p.*, sb.on_hand, sb.weighted_avg_cost, sb.last_positive_wac
             FROM public.products p
             LEFT JOIN public.stock_balances sb
               ON sb.business_id = p.business_id AND sb.product_id = p.id
            WHERE p.business_id = $1 AND p.id = ANY($2::uuid[])
            ORDER BY p.id ASC
            FOR UPDATE OF p`,
          [businessId, ordered],
        );
        return res.rows.map((r) => mapProductRow(r));
      },

      async findProductBySku(businessId, sku) {
        const res = await client.query(
          `SELECT p.*, sb.on_hand, sb.weighted_avg_cost, sb.last_positive_wac
             FROM public.products p
             LEFT JOIN public.stock_balances sb
               ON sb.business_id = p.business_id AND sb.product_id = p.id
            WHERE p.business_id = $1 AND LOWER(p.sku) = LOWER($2)
            LIMIT 1`,
          [businessId, sku],
        );
        return res.rows[0] ? mapProductRow(res.rows[0]) : null;
      },

      async insertProduct(record) {
        await client.query(
          `INSERT INTO public.products (
             id, business_id, category_id, sku, barcode, name, unit,
             selling_price, cost_price, reorder_level, is_tax_exempt, is_active
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            record.id,
            record.businessId,
            record.categoryId,
            record.sku,
            record.barcode,
            record.name,
            record.unit,
            record.sellingPrice,
            record.costPrice,
            record.reorderLevel,
            record.isTaxExempt,
            record.isActive,
          ],
        );
        const locRes = await client.query(
          `SELECT id FROM public.business_locations WHERE business_id = $1 AND is_active = TRUE LIMIT 1`,
          [record.businessId],
        );
        const locationId = locRes.rows[0]?.id;
        if (locationId) {
          await client.query(
            `INSERT INTO public.stock_balances (
               business_id, location_id, product_id, on_hand, weighted_avg_cost, last_positive_wac
             )
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              record.businessId,
              locationId,
              record.id,
              record.onHand,
              record.weightedAvgCost,
              record.lastPositiveWac,
            ],
          );
        }
        return record;
      },

      async updateProduct(businessId, productId, patch) {
        const prodRes = await client.query(
          `UPDATE public.products
              SET category_id = CASE WHEN $3::boolean THEN $4 ELSE category_id END,
                  sku = CASE WHEN $5::boolean THEN $6 ELSE sku END,
                  barcode = CASE WHEN $7::boolean THEN $8 ELSE barcode END,
                  name = COALESCE($9, name),
                  unit = COALESCE($10, unit),
                  selling_price = COALESCE($11, selling_price),
                  cost_price = COALESCE($12, cost_price),
                  reorder_level = COALESCE($13, reorder_level),
                  is_tax_exempt = COALESCE($14, is_tax_exempt),
                  is_active = COALESCE($15, is_active),
                  updated_at = NOW()
            WHERE business_id = $1 AND id = $2
            RETURNING id`,
          [
            businessId,
            productId,
            patch.categoryId !== undefined,
            patch.categoryId ?? null,
            patch.sku !== undefined,
            patch.sku ?? null,
            patch.barcode !== undefined,
            patch.barcode ?? null,
            patch.name ?? null,
            patch.unit ?? null,
            patch.sellingPrice ?? null,
            patch.costPrice ?? null,
            patch.reorderLevel ?? null,
            patch.isTaxExempt ?? null,
            patch.isActive ?? null,
          ],
        );
        if (!prodRes.rows[0]) return null;

        if (
          patch.onHand !== undefined ||
          patch.weightedAvgCost !== undefined ||
          patch.lastPositiveWac !== undefined
        ) {
          await client.query(
            `UPDATE public.stock_balances
                SET on_hand = COALESCE($3, on_hand),
                    weighted_avg_cost = COALESCE($4, weighted_avg_cost),
                    last_positive_wac = COALESCE($5, last_positive_wac),
                    updated_at = NOW()
              WHERE business_id = $1 AND product_id = $2`,
            [
              businessId,
              productId,
              patch.onHand ?? null,
              patch.weightedAvgCost ?? null,
              patch.lastPositiveWac ?? null,
            ],
          );
        }

        const refreshed = await client.query(
          `SELECT p.*, sb.on_hand, sb.weighted_avg_cost, sb.last_positive_wac
             FROM public.products p
             LEFT JOIN public.stock_balances sb
               ON sb.business_id = p.business_id AND sb.product_id = p.id
            WHERE p.business_id = $1 AND p.id = $2
            LIMIT 1`,
          [businessId, productId],
        );
        return refreshed.rows[0] ? mapProductRow(refreshed.rows[0]) : null;
      },

      async insertStockMovement(record) {
        await client.query(
          `INSERT INTO public.stock_movements (
             id, business_id, location_id, product_id, movement_type, quantity_delta,
             balance_after, unit_cost_snapshot, reference_type, reference_id, reason, created_by
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            record.id,
            record.businessId,
            record.locationId,
            record.productId,
            record.movementType,
            record.quantityDelta,
            record.balanceAfter,
            record.unitCostSnapshot,
            record.referenceType,
            record.referenceId,
            record.reason,
            record.createdBy,
          ],
        );
        return record;
      },

      async listStockMovements(businessId, opts) {
        const res = await client.query(
          `SELECT *, COUNT(*) OVER() AS total_count
             FROM public.stock_movements
            WHERE business_id = $1
              AND ($2::uuid IS NULL OR product_id = $2)
              AND ($3::text IS NULL OR movement_type = $3)
              AND ($4::timestamptz IS NULL OR created_at >= $4)
              AND ($5::timestamptz IS NULL OR created_at <= $5)
            ORDER BY created_at DESC
            LIMIT $6 OFFSET $7`,
          [
            businessId,
            opts.productId ?? null,
            opts.movementType ?? null,
            opts.from ?? null,
            opts.to ?? null,
            opts.limit,
            opts.offset,
          ],
        );
        return {
          total: res.rows[0] ? Number(res.rows[0].total_count) : 0,
          items: res.rows.map((r) => ({
            id: String(r.id),
            businessId: String(r.business_id),
            locationId: String(r.location_id),
            productId: String(r.product_id),
            movementType: String(r.movement_type) as StockMovementRecord['movementType'],
            quantityDelta: String(r.quantity_delta),
            balanceAfter: String(r.balance_after),
            unitCostSnapshot: String(r.unit_cost_snapshot),
            referenceType: String(r.reference_type),
            referenceId: r.reference_id ? String(r.reference_id) : null,
            reason: r.reason ? String(r.reason) : null,
            createdBy: String(r.created_by),
            createdAt: toIso(r.created_at),
          })),
        };
      },

      async insertRestockBatch(record): Promise<RestockBatchRecord> {
        await client.query(
          `INSERT INTO public.restock_batches (
             id, business_id, location_id, batch_number, supplier_note, notes, total_cost, received_by, received_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            record.id,
            record.businessId,
            record.locationId,
            record.batchNumber,
            record.supplierNote,
            record.notes,
            record.totalCost,
            record.receivedBy,
            record.receivedAt,
          ],
        );
        for (const item of record.items) {
          await client.query(
            `INSERT INTO public.restock_batch_items (
               id, business_id, restock_batch_id, product_id, quantity_received, unit_cost, line_total_cost
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              item.id,
              item.businessId,
              item.restockBatchId,
              item.productId,
              item.quantityReceived,
              item.unitCost,
              item.lineTotalCost,
            ],
          );
        }
        return record;
      },

      async listRestockBatches(businessId, opts) {
        const res = await client.query(
          `SELECT *, COUNT(*) OVER() AS total_count
             FROM public.restock_batches
            WHERE business_id = $1
              AND ($2::timestamptz IS NULL OR received_at >= $2)
              AND ($3::timestamptz IS NULL OR received_at <= $3)
            ORDER BY received_at DESC
            LIMIT $4 OFFSET $5`,
          [businessId, opts.from ?? null, opts.to ?? null, opts.limit, opts.offset],
        );
        return {
          total: res.rows[0] ? Number(res.rows[0].total_count) : 0,
          items: res.rows.map((r) => ({
            id: String(r.id),
            businessId: String(r.business_id),
            locationId: String(r.location_id),
            batchNumber: String(r.batch_number),
            supplierNote: r.supplier_note ? String(r.supplier_note) : null,
            notes: r.notes ? String(r.notes) : null,
            totalCost: String(r.total_cost),
            receivedBy: String(r.received_by),
            receivedAt: toIso(r.received_at),
            items: [],
          })),
        };
      },

      async getRestockBatchById(businessId, batchId) {
        const batchRes = await client.query(
          `SELECT * FROM public.restock_batches WHERE business_id = $1 AND id = $2 LIMIT 1`,
          [businessId, batchId],
        );
        const r = batchRes.rows[0];
        if (!r) return null;
        const itemsRes = await client.query(
          `SELECT * FROM public.restock_batch_items WHERE business_id = $1 AND restock_batch_id = $2`,
          [businessId, batchId],
        );
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          locationId: String(r.location_id),
          batchNumber: String(r.batch_number),
          supplierNote: r.supplier_note ? String(r.supplier_note) : null,
          notes: r.notes ? String(r.notes) : null,
          totalCost: String(r.total_cost),
          receivedBy: String(r.received_by),
          receivedAt: toIso(r.received_at),
          items: itemsRes.rows.map((i) => ({
            id: String(i.id),
            businessId: String(i.business_id),
            restockBatchId: String(i.restock_batch_id),
            productId: String(i.product_id),
            quantityReceived: String(i.quantity_received),
            unitCost: String(i.unit_cost),
            lineTotalCost: String(i.line_total_cost),
            wacBefore: '0.00',
            wacAfter: '0.00',
          })),
        };
      },

      async nextReceiptNumber(businessId, prefix, dateKey) {
        const res = await client.query(
          `INSERT INTO public.receipt_sequences (business_id, sequence_prefix, sequence_date, last_value)
           VALUES ($1, $2, $3, 1)
           ON CONFLICT (business_id, sequence_prefix, sequence_date)
           DO UPDATE SET last_value = public.receipt_sequences.last_value + 1
           RETURNING last_value`,
          [businessId, prefix, dateKey],
        );
        const seq = Number(res.rows[0]?.last_value ?? 1);
        return `${prefix}-${dateKey}-${String(seq).padStart(4, '0')}`;
      },

      async findSaleByClientUuid(businessId, clientSaleUuid) {
        const res = await client.query(
          `SELECT * FROM public.sales WHERE business_id = $1 AND client_sale_uuid = $2 LIMIT 1`,
          [businessId, clientSaleUuid],
        );
        return res.rows[0] ? hydrateSale(businessId, res.rows[0]) : null;
      },

      async insertSale(record) {
        await client.query(
          `INSERT INTO public.sales (
             id, business_id, location_id, customer_id, device_id, client_sale_uuid, sale_number,
             status, payment_status, subtotal_amount, discount_amount, tax_enabled_snapshot,
             tax_mode_snapshot, tax_rate_snapshot, tax_amount, total_amount, amount_paid,
             credit_amount, credit_remaining, total_cogs, notes, sold_by, sold_at
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
          [
            record.id,
            record.businessId,
            record.locationId,
            record.customerId,
            record.deviceId,
            record.clientSaleUuid,
            record.saleNumber,
            record.status,
            record.paymentStatus,
            record.subtotalAmount,
            record.discountAmount,
            record.taxEnabledSnapshot,
            record.taxModeSnapshot,
            record.taxRateSnapshot,
            record.taxAmount,
            record.totalAmount,
            record.amountPaid,
            record.creditAmount,
            record.creditRemaining,
            record.totalCogs,
            record.notes,
            record.soldBy,
            record.soldAt,
          ],
        );
        for (const item of record.items) {
          await client.query(
            `INSERT INTO public.sale_items (
               id, business_id, sale_id, product_id, product_name_snapshot, unit_snapshot,
               quantity, unit_price, discount_amount, tax_rate_snapshot, tax_amount,
               line_total, unit_cost_snapshot, line_cogs, is_tax_exempt_snapshot
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [
              item.id,
              item.businessId,
              item.saleId,
              item.productId,
              item.productNameSnapshot,
              item.unitSnapshot,
              item.quantity,
              item.unitPrice,
              item.discountAmount,
              item.taxRateSnapshot,
              item.taxAmount,
              item.lineTotal,
              item.unitCostSnapshot,
              item.lineCogs,
              item.isTaxExemptSnapshot,
            ],
          );
        }
        for (const p of record.payments) {
          await client.query(
            `INSERT INTO public.sale_payments (id, business_id, sale_id, payment_method, amount, reference_note)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [p.id, p.businessId, p.saleId, p.method, p.amount, p.referenceNote],
          );
        }
        return record;
      },

      async getSaleById(businessId, saleId) {
        const res = await client.query(
          `SELECT * FROM public.sales WHERE business_id = $1 AND id = $2 LIMIT 1`,
          [businessId, saleId],
        );
        return res.rows[0] ? hydrateSale(businessId, res.rows[0]) : null;
      },

      async lockSaleById(businessId, saleId) {
        const res = await client.query(
          `SELECT * FROM public.sales WHERE business_id = $1 AND id = $2 FOR UPDATE`,
          [businessId, saleId],
        );
        return res.rows[0] ? hydrateSale(businessId, res.rows[0]) : null;
      },

      async listSales(businessId, opts) {
        const res = await client.query(
          `SELECT s.*, COUNT(*) OVER() AS total_count
             FROM public.sales s
            WHERE s.business_id = $1
              AND ($2::text IS NULL OR s.status = $2)
              AND ($3::text IS NULL OR s.payment_status = $3)
              AND ($4::uuid IS NULL OR s.customer_id = $4)
              AND ($5::uuid IS NULL OR s.sold_by = $5)
              AND (
                $6::text IS NULL
                OR s.sale_number ILIKE '%' || $6 || '%'
                OR COALESCE(s.notes, '') ILIKE '%' || $6 || '%'
              )
              AND ($7::timestamptz IS NULL OR s.sold_at >= $7)
              AND ($8::timestamptz IS NULL OR s.sold_at <= $8)
              AND (
                $9::text IS NULL
                OR EXISTS (
                  SELECT 1
                    FROM public.sale_payments sp
                   WHERE sp.business_id = s.business_id
                     AND sp.sale_id = s.id
                     AND sp.payment_method = $9
                )
              )
            ORDER BY s.sold_at DESC
            LIMIT $10 OFFSET $11`,
          [
            businessId,
            opts.status ?? null,
            opts.paymentStatus ?? null,
            opts.customerId ?? null,
            opts.cashierUserId ?? null,
            opts.search ?? null,
            opts.from ?? null,
            opts.to ?? null,
            opts.paymentMethod ?? null,
            opts.limit,
            opts.offset,
          ],
        );
        const items: SaleRecord[] = [];
        for (const row of res.rows) {
          items.push(await hydrateSale(businessId, row));
        }
        return {
          total: res.rows[0] ? Number(res.rows[0].total_count) : 0,
          items,
        };
      },

      async updateSaleAfterReturn(businessId, saleId, patch) {
        await client.query(
          `UPDATE public.sales
              SET status = $3, payment_status = $4, credit_remaining = $5, updated_at = NOW()
            WHERE business_id = $1 AND id = $2`,
          [businessId, saleId, patch.status, patch.paymentStatus, patch.creditRemaining],
        );
        const ret: SaleReturnRecord = patch.saleReturn;
        await client.query(
          `INSERT INTO public.sale_returns (
             id, business_id, sale_id, return_type, reason, total_reversed,
             debt_reduced_amount, refund_amount, processed_by
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            ret.id,
            ret.businessId,
            ret.saleId,
            ret.returnType,
            ret.reason,
            ret.totalReversed,
            ret.debtReducedAmount,
            ret.refundAmount,
            ret.processedBy,
          ],
        );
        for (const item of ret.items) {
          await client.query(
            `INSERT INTO public.sale_return_items (
               id, business_id, sale_return_id, sale_item_id, product_id,
               quantity_returned, disposition, unit_price_snapshot, tax_reversed,
               line_reversed_total, unit_cost_snapshot
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              item.id,
              item.businessId,
              item.saleReturnId,
              item.saleItemId,
              item.productId,
              item.quantityReturned,
              item.disposition,
              item.unitPriceSnapshot,
              item.taxReversed,
              item.lineReversedTotal,
              item.unitCostSnapshot,
            ],
          );
        }
        if (ret.refund) {
          await client.query(
            `INSERT INTO public.sale_refunds (
               id, business_id, sale_return_id, payment_method, amount, reference_note, processed_by
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              ret.refund.id,
              ret.refund.businessId,
              ret.refund.saleReturnId,
              ret.refund.method,
              ret.refund.amount,
              ret.refund.referenceNote,
              ret.refund.processedBy,
            ],
          );
        }
        for (const [saleItemId, returnedQty] of Object.entries(patch.itemReturnedTotals)) {
          await client.query(
            `UPDATE public.sale_items
                SET quantity_returned = $3
              WHERE business_id = $1 AND id = $2`,
            [businessId, saleItemId, returnedQty],
          );
        }
        const refreshed = await client.query(
          `SELECT * FROM public.sales WHERE business_id = $1 AND id = $2 LIMIT 1`,
          [businessId, saleId],
        );
        return hydrateSale(businessId, refreshed.rows[0]);
      },

      async updateSaleCreditPayment(businessId, saleId, patch) {
        await client.query(
          `UPDATE public.sales
              SET amount_paid = $3, credit_remaining = $4, payment_status = $5, updated_at = NOW()
            WHERE business_id = $1 AND id = $2`,
          [businessId, saleId, patch.amountPaid, patch.creditRemaining, patch.paymentStatus],
        );
      },

      async insertReceipt(record) {
        await client.query(
          `INSERT INTO public.receipts (
             id, business_id, receipt_number, receipt_type, sale_id, debt_payment_id, snapshot_payload, issued_by
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
          [
            record.id,
            record.businessId,
            record.receiptNumber,
            record.receiptType,
            record.saleId,
            record.debtPaymentId,
            JSON.stringify(record.snapshotPayload),
            record.issuedBy,
          ],
        );
        return record;
      },

      async getReceiptById(businessId, receiptId) {
        const res = await client.query(
          `SELECT * FROM public.receipts WHERE business_id = $1 AND id = $2 LIMIT 1`,
          [businessId, receiptId],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          receiptNumber: String(r.receipt_number),
          receiptType: String(r.receipt_type) as ReceiptRecord['receiptType'],
          saleId: r.sale_id ? String(r.sale_id) : null,
          debtPaymentId: r.debt_payment_id ? String(r.debt_payment_id) : null,
          snapshotPayload: (r.snapshot_payload ?? {}) as Record<string, unknown>,
          issuedBy: String(r.issued_by),
          issuedAt: toIso(r.issued_at),
        };
      },

      async listCustomers(businessId, opts) {
        const res = await client.query(
          `SELECT *, COUNT(*) OVER() AS total_count
             FROM public.customers
            WHERE business_id = $1
              AND ($2::boolean IS NULL OR $2 = FALSE OR outstanding_balance > 0)
              AND ($3::text IS NULL OR full_name ILIKE '%' || $3 || '%' OR phone ILIKE '%' || $3 || '%')
            ORDER BY full_name ASC
            LIMIT $4 OFFSET $5`,
          [businessId, opts.hasDebtOnly ?? null, opts.search ?? null, opts.limit, opts.offset],
        );
        return {
          total: res.rows[0] ? Number(res.rows[0].total_count) : 0,
          items: res.rows.map((r) => mapCustomerRow(r)),
        };
      },

      async getCustomerById(businessId, customerId) {
        const res = await client.query(
          `SELECT * FROM public.customers WHERE business_id = $1 AND id = $2 LIMIT 1`,
          [businessId, customerId],
        );
        return res.rows[0] ? mapCustomerRow(res.rows[0]) : null;
      },

      async lockCustomerById(businessId, customerId) {
        const res = await client.query(
          `SELECT * FROM public.customers WHERE business_id = $1 AND id = $2 FOR UPDATE`,
          [businessId, customerId],
        );
        return res.rows[0] ? mapCustomerRow(res.rows[0]) : null;
      },

      async insertCustomer(record) {
        await client.query(
          `INSERT INTO public.customers (
             id, business_id, full_name, phone, email, address, credit_limit, outstanding_balance, is_active
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            record.id,
            record.businessId,
            record.fullName,
            record.phone,
            record.email,
            record.address,
            record.creditLimit,
            record.outstandingBalance,
            record.isActive,
          ],
        );
        return record;
      },

      async updateCustomer(businessId, customerId, patch) {
        const res = await client.query(
          `UPDATE public.customers
              SET full_name = COALESCE($3, full_name),
                  phone = CASE WHEN $4::boolean THEN $5 ELSE phone END,
                  email = CASE WHEN $6::boolean THEN $7 ELSE email END,
                  address = CASE WHEN $8::boolean THEN $9 ELSE address END,
                  credit_limit = CASE WHEN $10::boolean THEN $11 ELSE credit_limit END,
                  outstanding_balance = COALESCE($12, outstanding_balance),
                  is_active = COALESCE($13, is_active),
                  updated_at = NOW()
            WHERE business_id = $1 AND id = $2
            RETURNING *`,
          [
            businessId,
            customerId,
            patch.fullName ?? null,
            patch.phone !== undefined,
            patch.phone ?? null,
            patch.email !== undefined,
            patch.email ?? null,
            patch.address !== undefined,
            patch.address ?? null,
            patch.creditLimit !== undefined,
            patch.creditLimit ?? null,
            patch.outstandingBalance ?? null,
            patch.isActive ?? null,
          ],
        );
        return res.rows[0] ? mapCustomerRow(res.rows[0]) : null;
      },

      async listOpenCreditSalesForCustomer(businessId, customerId) {
        const res = await client.query(
          `SELECT * FROM public.sales
            WHERE business_id = $1 AND customer_id = $2 AND status <> 'voided' AND credit_remaining > 0
            ORDER BY sold_at ASC
            FOR UPDATE`,
          [businessId, customerId],
        );
        const sales: SaleRecord[] = [];
        for (const r of res.rows) {
          sales.push(await hydrateSale(businessId, r));
        }
        return sales;
      },

      async insertDebtPayment(record) {
        await client.query(
          `INSERT INTO public.customer_debt_payments (
             id, business_id, customer_id, amount, payment_method, reference_note, status, collected_by, paid_at
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            record.id,
            record.businessId,
            record.customerId,
            record.amount,
            record.method,
            record.referenceNote,
            record.status,
            record.collectedBy,
            record.paidAt,
          ],
        );
        for (const alloc of record.allocations) {
          await client.query(
            `INSERT INTO public.customer_debt_allocations (
               id, business_id, debt_payment_id, sale_id, allocated_amount
             )
             VALUES ($1,$2,$3,$4,$5)`,
            [alloc.id, alloc.businessId, alloc.debtPaymentId, alloc.saleId, alloc.allocatedAmount],
          );
        }
        return record;
      },

      async getDebtPaymentById(businessId, customerId, paymentId) {
        const res = await client.query(
          `SELECT * FROM public.customer_debt_payments WHERE business_id = $1 AND customer_id = $2 AND id = $3 LIMIT 1`,
          [businessId, customerId, paymentId],
        );
        const r = res.rows[0];
        if (!r) return null;
        const allocs = await client.query(
          `SELECT * FROM public.customer_debt_allocations WHERE business_id = $1 AND debt_payment_id = $2`,
          [businessId, paymentId],
        );
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          customerId: String(r.customer_id),
          amount: String(r.amount),
          method: String(r.payment_method) as CustomerDebtPaymentRecord['method'],
          referenceNote: r.reference_note ? String(r.reference_note) : null,
          status: String(r.status) as CustomerDebtPaymentRecord['status'],
          reversalReason: r.reversal_reason ? String(r.reversal_reason) : null,
          reversedBy: r.reversed_by ? String(r.reversed_by) : null,
          reversedAt: toIsoOrNull(r.reversed_at),
          collectedBy: String(r.collected_by),
          paidAt: toIso(r.paid_at),
          allocations: allocs.rows.map((a) => ({
            id: String(a.id),
            businessId: String(a.business_id),
            debtPaymentId: String(a.debt_payment_id),
            saleId: String(a.sale_id),
            allocatedAmount: String(a.allocated_amount),
            createdAt: toIso(a.created_at),
          })),
          receipt: null,
        };
      },

      async listDebtPaymentsForCustomer(businessId, customerId) {
        const res = await client.query(
          `SELECT * FROM public.customer_debt_payments WHERE business_id = $1 AND customer_id = $2 ORDER BY paid_at DESC`,
          [businessId, customerId],
        );
        return res.rows.map((r) => ({
          id: String(r.id),
          businessId: String(r.business_id),
          customerId: String(r.customer_id),
          amount: String(r.amount),
          method: String(r.payment_method) as CustomerDebtPaymentRecord['method'],
          referenceNote: r.reference_note ? String(r.reference_note) : null,
          status: String(r.status) as CustomerDebtPaymentRecord['status'],
          reversalReason: r.reversal_reason ? String(r.reversal_reason) : null,
          reversedBy: r.reversed_by ? String(r.reversed_by) : null,
          reversedAt: toIsoOrNull(r.reversed_at),
          collectedBy: String(r.collected_by),
          paidAt: toIso(r.paid_at),
          allocations: [],
          receipt: null,
        }));
      },

      async listBusinessDebtPayments(businessId, opts) {
        const res = await client.query(
          `SELECT dp.*, c.full_name AS customer_name, COUNT(*) OVER() AS total_count
             FROM public.customer_debt_payments dp
             JOIN public.customers c
               ON c.business_id = dp.business_id AND c.id = dp.customer_id
            WHERE dp.business_id = $1
              AND ($2::text IS NULL OR dp.status = $2)
              AND ($3::timestamptz IS NULL OR dp.paid_at >= $3)
              AND ($4::timestamptz IS NULL OR dp.paid_at <= $4)
            ORDER BY dp.paid_at DESC
            LIMIT $5 OFFSET $6`,
          [
            businessId,
            opts.status ?? null,
            opts.from ?? null,
            opts.to ?? null,
            opts.limit,
            opts.offset,
          ],
        );
        return {
          total: res.rows[0] ? Number(res.rows[0].total_count) : 0,
          items: res.rows.map((r): BusinessDebtPaymentListItem => ({
            id: String(r.id),
            businessId: String(r.business_id),
            customerId: String(r.customer_id),
            customerName: String(r.customer_name),
            amount: String(r.amount),
            method: String(r.payment_method) as CustomerDebtPaymentRecord['method'],
            referenceNote: r.reference_note ? String(r.reference_note) : null,
            status: String(r.status) as CustomerDebtPaymentRecord['status'],
            reversalReason: r.reversal_reason ? String(r.reversal_reason) : null,
            reversedBy: r.reversed_by ? String(r.reversed_by) : null,
            reversedAt: toIsoOrNull(r.reversed_at),
            collectedBy: String(r.collected_by),
            paidAt: toIso(r.paid_at),
            allocations: [],
            receipt: null,
          })),
        };
      },

      async markDebtPaymentReversed(businessId, paymentId, patch) {
        const res = await client.query(
          `UPDATE public.customer_debt_payments
              SET status = 'reversed', reversal_reason = $3, reversed_by = $4, reversed_at = $5
            WHERE business_id = $1 AND id = $2
            RETURNING *`,
          [businessId, paymentId, patch.reversalReason, patch.reversedBy, patch.reversedAt],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          customerId: String(r.customer_id),
          amount: String(r.amount),
          method: String(r.payment_method) as CustomerDebtPaymentRecord['method'],
          referenceNote: r.reference_note ? String(r.reference_note) : null,
          status: 'reversed',
          reversalReason: patch.reversalReason,
          reversedBy: patch.reversedBy,
          reversedAt: patch.reversedAt,
          collectedBy: String(r.collected_by),
          paidAt: toIso(r.paid_at),
          allocations: [],
          receipt: null,
        };
      },

      async listExpenseCategories(businessId): Promise<ExpenseCategoryRecord[]> {
        const res = await client.query(
          `SELECT * FROM public.expense_categories WHERE business_id = $1 ORDER BY name ASC`,
          [businessId],
        );
        return res.rows.map((r) => ({
          id: String(r.id),
          businessId: String(r.business_id),
          name: String(r.name),
          isActive: Boolean(r.is_active),
          createdAt: toIso(r.created_at),
        }));
      },

      async findExpenseCategoryByName(businessId, name) {
        const res = await client.query(
          `SELECT * FROM public.expense_categories WHERE business_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
          [businessId, name],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          name: String(r.name),
          isActive: Boolean(r.is_active),
          createdAt: toIso(r.created_at),
        };
      },

      async getExpenseCategoryById(businessId, categoryId) {
        const res = await client.query(
          `SELECT * FROM public.expense_categories WHERE business_id = $1 AND id = $2 LIMIT 1`,
          [businessId, categoryId],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          name: String(r.name),
          isActive: Boolean(r.is_active),
          createdAt: toIso(r.created_at),
        };
      },

      async insertExpenseCategory(record) {
        await client.query(
          `INSERT INTO public.expense_categories (id, business_id, name, is_active) VALUES ($1,$2,$3,$4)`,
          [record.id, record.businessId, record.name, record.isActive],
        );
        return record;
      },

      async listExpenses(businessId, opts) {
        const res = await client.query(
          `SELECT *, COUNT(*) OVER() AS total_count
             FROM public.expenses
            WHERE business_id = $1
              AND ($2::uuid IS NULL OR category_id = $2)
              AND ($3::text IS NULL OR status = $3)
              AND ($4::text IS NULL OR payment_method = $4)
              AND ($5::timestamptz IS NULL OR created_at >= $5)
              AND ($6::timestamptz IS NULL OR created_at <= $6)
            ORDER BY created_at DESC
            LIMIT $7 OFFSET $8`,
          [
            businessId,
            opts.categoryId ?? null,
            opts.status ?? null,
            opts.paymentMethod ?? null,
            opts.from ?? null,
            opts.to ?? null,
            opts.limit,
            opts.offset,
          ],
        );
        return {
          total: res.rows[0] ? Number(res.rows[0].total_count) : 0,
          items: res.rows.map((r) => ({
            id: String(r.id),
            businessId: String(r.business_id),
            locationId: String(r.location_id),
            categoryId: String(r.category_id),
            amount: String(r.amount),
            paymentMethod: String(r.payment_method) as ExpenseRecord['paymentMethod'],
            description: String(r.description),
            incurredOn: String(r.incurred_on),
            attachmentId: r.attachment_id ? String(r.attachment_id) : null,
            status: String(r.status) as ExpenseRecord['status'],
            reversalReason: r.reversal_reason ? String(r.reversal_reason) : null,
            reversedBy: r.reversed_by ? String(r.reversed_by) : null,
            reversedAt: toIsoOrNull(r.reversed_at),
            recordedBy: String(r.recorded_by),
            createdAt: toIso(r.created_at),
          })),
        };
      },

      async getExpenseById(businessId, expenseId) {
        const res = await client.query(
          `SELECT * FROM public.expenses WHERE business_id = $1 AND id = $2 LIMIT 1`,
          [businessId, expenseId],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          locationId: String(r.location_id),
          categoryId: String(r.category_id),
          amount: String(r.amount),
          paymentMethod: String(r.payment_method) as ExpenseRecord['paymentMethod'],
          description: String(r.description),
          incurredOn: String(r.incurred_on),
          attachmentId: r.attachment_id ? String(r.attachment_id) : null,
          status: String(r.status) as ExpenseRecord['status'],
          reversalReason: r.reversal_reason ? String(r.reversal_reason) : null,
          reversedBy: r.reversed_by ? String(r.reversed_by) : null,
          reversedAt: toIsoOrNull(r.reversed_at),
          recordedBy: String(r.recorded_by),
          createdAt: toIso(r.created_at),
        };
      },

      async insertExpense(record) {
        await client.query(
          `INSERT INTO public.expenses (
             id, business_id, location_id, category_id, amount, payment_method,
             description, incurred_on, attachment_id, status, recorded_by
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            record.id,
            record.businessId,
            record.locationId,
            record.categoryId,
            record.amount,
            record.paymentMethod,
            record.description,
            record.incurredOn,
            record.attachmentId,
            record.status,
            record.recordedBy,
          ],
        );
        return record;
      },

      async markExpenseReversed(businessId, expenseId, patch) {
        const res = await client.query(
          `UPDATE public.expenses
              SET status = 'reversed', reversal_reason = $3, reversed_by = $4, reversed_at = $5
            WHERE business_id = $1 AND id = $2
            RETURNING *`,
          [businessId, expenseId, patch.reversalReason, patch.reversedBy, patch.reversedAt],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          locationId: String(r.location_id),
          categoryId: String(r.category_id),
          amount: String(r.amount),
          paymentMethod: String(r.payment_method) as ExpenseRecord['paymentMethod'],
          description: String(r.description),
          incurredOn: String(r.incurred_on),
          attachmentId: r.attachment_id ? String(r.attachment_id) : null,
          status: 'reversed',
          reversalReason: patch.reversalReason,
          reversedBy: patch.reversedBy,
          reversedAt: patch.reversedAt,
          recordedBy: String(r.recorded_by),
          createdAt: toIso(r.created_at),
        };
      },

      async listSubscriptionPlans(): Promise<SubscriptionPlanCatalogItem[]> {
        const res = await client.query(
          `SELECT * FROM public.subscription_plans WHERE is_active = TRUE ORDER BY price_amount ASC`,
        );
        return res.rows.map((r) => ({
          id: String(r.id),
          planCode: String(r.plan_code),
          displayName: String(r.display_name),
          billingInterval: String(
            r.billing_interval,
          ) as SubscriptionPlanCatalogItem['billingInterval'],
          priceAmount: String(r.price_amount),
          currencyCode: String(r.currency_code),
          maxStaff: Number(r.max_staff),
          maxProducts: Number(r.max_products),
          maxOfflineDevices: Number(r.max_offline_devices),
          isActive: Boolean(r.is_active),
        }));
      },

      async findPlanByCode(planCode) {
        const res = await client.query(
          `SELECT * FROM public.subscription_plans WHERE plan_code = $1 AND is_active = TRUE LIMIT 1`,
          [planCode],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          planCode: String(r.plan_code),
          displayName: String(r.display_name),
          billingInterval: String(
            r.billing_interval,
          ) as SubscriptionPlanCatalogItem['billingInterval'],
          priceAmount: String(r.price_amount),
          currencyCode: String(r.currency_code),
          maxStaff: Number(r.max_staff),
          maxProducts: Number(r.max_products),
          maxOfflineDevices: Number(r.max_offline_devices),
          isActive: Boolean(r.is_active),
        };
      },

      async getSubscriptionUsage(businessId) {
        const [subRes, countsRes] = await Promise.all([
          client.query(
            `SELECT bs.*, sp.plan_code, sp.display_name, sp.max_staff, sp.max_products, sp.max_offline_devices
               FROM public.business_subscriptions bs
               JOIN public.subscription_plans sp ON sp.id = bs.plan_id
              WHERE bs.business_id = $1
              ORDER BY bs.created_at DESC
              LIMIT 1`,
            [businessId],
          ),
          client.query(
            `SELECT
               (SELECT COUNT(*)::int FROM public.business_memberships WHERE business_id = $1 AND status = 'active') AS staff_count,
               (SELECT COUNT(*)::int FROM public.products WHERE business_id = $1 AND is_active = TRUE) AS product_count,
               (SELECT COUNT(*)::int FROM public.registered_devices WHERE business_id = $1 AND status = 'active') AS device_count`,
            [businessId],
          ),
        ]);
        const s = subRes.rows[0];
        const c = countsRes.rows[0];
        return {
          status: (s ? String(s.status) : 'read_only') as
            'trialing' | 'active' | 'grace_period' | 'read_only' | 'cancelled',
          staffCount: Number(c?.staff_count ?? 0),
          productCount: Number(c?.product_count ?? 0),
          activeDeviceCount: Number(c?.device_count ?? 0),
          subscription: s
            ? {
                id: String(s.id),
                businessId: String(s.business_id),
                planId: String(s.plan_id),
                status: String(s.status) as
                  'trialing' | 'active' | 'grace_period' | 'read_only' | 'cancelled',
                trialEndsAt: toIsoOrNull(s.trial_ends_at),
                currentPeriodStart: toIso(s.current_period_start),
                currentPeriodEnd: toIso(s.current_period_end),
                graceEndsAt: toIsoOrNull(s.grace_ends_at),
                limits: {
                  planId: String(s.plan_id),
                  planCode: String(s.plan_code),
                  displayName: String(s.display_name),
                  maxStaff: Number(s.max_staff),
                  maxProducts: Number(s.max_products),
                  maxOfflineDevices: Number(s.max_offline_devices),
                },
              }
            : null,
        };
      },

      async listSubscriptionInvoices(businessId, opts) {
        const res = await client.query(
          `SELECT *, COUNT(*) OVER() AS total_count
             FROM public.subscription_invoices
            WHERE business_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3`,
          [businessId, opts.limit, opts.offset],
        );
        return {
          total: res.rows[0] ? Number(res.rows[0].total_count) : 0,
          items: res.rows.map((r) => ({
            id: String(r.id),
            businessId: String(r.business_id),
            planId: String(r.plan_id),
            provider: 'paystack' as const,
            providerReference: String(r.provider_reference),
            amount: String(r.amount),
            currencyCode: String(r.currency_code),
            status: String(r.status) as SubscriptionInvoiceRecord['status'],
            checkoutUrl: r.checkout_url ? String(r.checkout_url) : null,
            paidAt: toIsoOrNull(r.paid_at),
            createdAt: toIso(r.created_at),
          })),
        };
      },

      async insertSubscriptionInvoice(record) {
        await client.query(
          `INSERT INTO public.subscription_invoices (
             id, business_id, plan_id, provider, provider_reference, amount, currency_code, status, checkout_url
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            record.id,
            record.businessId,
            record.planId,
            record.provider,
            record.providerReference,
            record.amount,
            record.currencyCode,
            record.status,
            record.checkoutUrl,
          ],
        );
        return record;
      },

      async findSubscriptionInvoiceByReference(reference) {
        const res = await client.query(
          `SELECT * FROM public.subscription_invoices WHERE provider_reference = $1 LIMIT 1`,
          [reference],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          planId: String(r.plan_id),
          provider: 'paystack',
          providerReference: String(r.provider_reference),
          amount: String(r.amount),
          currencyCode: String(r.currency_code),
          status: String(r.status) as SubscriptionInvoiceRecord['status'],
          checkoutUrl: r.checkout_url ? String(r.checkout_url) : null,
          paidAt: toIsoOrNull(r.paid_at),
          createdAt: toIso(r.created_at),
        };
      },

      async markSubscriptionInvoicePaid(reference, paidAt) {
        const res = await client.query(
          `UPDATE public.subscription_invoices SET status = 'paid', paid_at = $2 WHERE provider_reference = $1 RETURNING *`,
          [reference, paidAt],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          planId: String(r.plan_id),
          provider: 'paystack',
          providerReference: String(r.provider_reference),
          amount: String(r.amount),
          currencyCode: String(r.currency_code),
          status: 'paid',
          checkoutUrl: r.checkout_url ? String(r.checkout_url) : null,
          paidAt,
          createdAt: toIso(r.created_at),
        };
      },

      async activateBusinessSubscription(businessId, planId, paidAt) {
        await client.query(
          `UPDATE public.business_subscriptions
              SET plan_id = $2,
                  status = 'active',
                  current_period_start = $3::timestamptz,
                  current_period_end = ($3::timestamptz + INTERVAL '30 days'),
                  grace_ends_at = NULL,
                  updated_at = NOW()
            WHERE business_id = $1`,
          [businessId, planId, paidAt],
        );
      },

      async findWebhookEvent(provider, providerEventId) {
        const res = await client.query(
          `SELECT * FROM public.payment_webhook_events WHERE provider = $1 AND provider_event_id = $2 LIMIT 1`,
          [provider, providerEventId],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          provider: 'paystack',
          providerEventId: String(r.provider_event_id),
          eventType: String(r.event_type),
          businessId: r.business_id ? String(r.business_id) : null,
          payload: (r.payload ?? {}) as Record<string, unknown>,
          processedAt: toIso(r.processed_at),
        };
      },

      async insertWebhookEvent(record): Promise<PaymentWebhookEventRecord> {
        await client.query(
          `INSERT INTO public.payment_webhook_events (
             id, provider, provider_event_id, event_type, business_id, payload
           )
           VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
          [
            record.id,
            record.provider,
            record.providerEventId,
            record.eventType,
            record.businessId,
            JSON.stringify(record.payload),
          ],
        );
        return record;
      },

      async getDeviceForBusiness(businessId, deviceId): Promise<ActiveDeviceLookup | null> {
        const res = await client.query(
          `SELECT id, business_id, user_id, device_code, status, offline_expires_at
             FROM public.registered_devices
            WHERE business_id = $1 AND id = $2
            LIMIT 1`,
          [businessId, deviceId],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          userId: String(r.user_id),
          deviceCode: String(r.device_code),
          status: String(r.status) as 'active' | 'revoked',
          offlineExpiresAt: toIso(r.offline_expires_at),
        };
      },

      async insertSyncConflict(record): Promise<SyncConflictRecord> {
        await client.query(
          `INSERT INTO public.sync_conflicts (
             id, business_id, device_id, client_operation_uuid, entity_type, reason, status, payload
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
          [
            record.id,
            record.businessId,
            record.deviceId,
            record.clientOperationUuid,
            record.entityType,
            record.reason,
            record.status,
            JSON.stringify(record.payload),
          ],
        );
        return record;
      },

      async listSyncConflicts(businessId, opts) {
        const res = await client.query(
          `SELECT *, COUNT(*) OVER() AS total_count
             FROM public.sync_conflicts
            WHERE business_id = $1
              AND ($2::text IS NULL OR status = $2)
            ORDER BY created_at DESC
            LIMIT $3 OFFSET $4`,
          [businessId, opts.status ?? null, opts.limit, opts.offset],
        );
        return {
          total: res.rows[0] ? Number(res.rows[0].total_count) : 0,
          items: res.rows.map((r) => ({
            id: String(r.id),
            businessId: String(r.business_id),
            deviceId: r.device_id ? String(r.device_id) : null,
            clientOperationUuid: String(r.client_operation_uuid),
            entityType: String(r.entity_type),
            reason: String(r.reason) as SyncConflictRecord['reason'],
            status: String(r.status) as 'open' | 'resolved',
            resolutionAction: r.resolution_action
              ? (String(r.resolution_action) as SyncConflictRecord['resolutionAction'])
              : null,
            resolutionNote: r.resolution_note ? String(r.resolution_note) : null,
            resolvedBy: r.resolved_by ? String(r.resolved_by) : null,
            resolvedAt: toIsoOrNull(r.resolved_at),
            payload: (r.payload ?? {}) as Record<string, unknown>,
            createdAt: toIso(r.created_at),
          })),
        };
      },

      async getSyncConflictById(businessId, conflictId) {
        const res = await client.query(
          `SELECT * FROM public.sync_conflicts WHERE business_id = $1 AND id = $2 LIMIT 1`,
          [businessId, conflictId],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          deviceId: r.device_id ? String(r.device_id) : null,
          clientOperationUuid: String(r.client_operation_uuid),
          entityType: String(r.entity_type),
          reason: String(r.reason) as SyncConflictRecord['reason'],
          status: String(r.status) as 'open' | 'resolved',
          resolutionAction: r.resolution_action
            ? (String(r.resolution_action) as SyncConflictRecord['resolutionAction'])
            : null,
          resolutionNote: r.resolution_note ? String(r.resolution_note) : null,
          resolvedBy: r.resolved_by ? String(r.resolved_by) : null,
          resolvedAt: toIsoOrNull(r.resolved_at),
          payload: (r.payload ?? {}) as Record<string, unknown>,
          createdAt: toIso(r.created_at),
        };
      },

      async resolveSyncConflict(businessId, conflictId, patch) {
        const res = await client.query(
          `UPDATE public.sync_conflicts
              SET status = 'resolved', resolution_action = $3, resolution_note = $4,
                  resolved_by = $5, resolved_at = $6
            WHERE business_id = $1 AND id = $2
            RETURNING *`,
          [businessId, conflictId, patch.action, patch.note, patch.resolvedBy, patch.resolvedAt],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          deviceId: r.device_id ? String(r.device_id) : null,
          clientOperationUuid: String(r.client_operation_uuid),
          entityType: String(r.entity_type),
          reason: String(r.reason) as SyncConflictRecord['reason'],
          status: 'resolved',
          resolutionAction: patch.action,
          resolutionNote: patch.note,
          resolvedBy: patch.resolvedBy,
          resolvedAt: patch.resolvedAt,
          payload: (r.payload ?? {}) as Record<string, unknown>,
          createdAt: toIso(r.created_at),
        };
      },

      async insertNotification(record): Promise<NotificationRecord> {
        await client.query(
          `INSERT INTO public.notifications (
             id, business_id, recipient_user_id, channel, category, title, body, metadata, is_read
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
          [
            record.id,
            record.businessId,
            record.recipientUserId,
            record.channel,
            record.category,
            record.title,
            record.body,
            JSON.stringify(record.metadata),
            record.isRead,
          ],
        );
        return record;
      },

      async listNotifications(businessId, recipientUserId, opts) {
        const [rowsRes, unreadRes] = await Promise.all([
          client.query(
            `SELECT *, COUNT(*) OVER() AS total_count
               FROM public.notifications
              WHERE business_id = $1 AND recipient_user_id = $2
                AND ($3::boolean IS NULL OR $3 = FALSE OR is_read = FALSE)
              ORDER BY created_at DESC
              LIMIT $4 OFFSET $5`,
            [businessId, recipientUserId, opts.unreadOnly ?? null, opts.limit, opts.offset],
          ),
          client.query(
            `SELECT COUNT(*)::int AS unread FROM public.notifications
              WHERE business_id = $1 AND recipient_user_id = $2 AND is_read = FALSE`,
            [businessId, recipientUserId],
          ),
        ]);
        return {
          total: rowsRes.rows[0] ? Number(rowsRes.rows[0].total_count) : 0,
          unreadCount: Number(unreadRes.rows[0]?.unread ?? 0),
          items: rowsRes.rows.map((r) => ({
            id: String(r.id),
            businessId: String(r.business_id),
            recipientUserId: String(r.recipient_user_id),
            channel: 'in_app',
            category: String(r.category) as NotificationRecord['category'],
            title: String(r.title),
            body: String(r.body),
            metadata: (r.metadata ?? {}) as Record<string, unknown>,
            isRead: Boolean(r.is_read),
            readAt: toIsoOrNull(r.read_at),
            createdAt: toIso(r.created_at),
          })),
        };
      },

      async markNotificationRead(businessId, recipientUserId, notificationId) {
        const res = await client.query(
          `UPDATE public.notifications
              SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
            WHERE business_id = $1 AND recipient_user_id = $2 AND id = $3
            RETURNING *`,
          [businessId, recipientUserId, notificationId],
        );
        const r = res.rows[0];
        if (!r) return null;
        return {
          id: String(r.id),
          businessId: String(r.business_id),
          recipientUserId: String(r.recipient_user_id),
          channel: 'in_app',
          category: String(r.category) as NotificationRecord['category'],
          title: String(r.title),
          body: String(r.body),
          metadata: (r.metadata ?? {}) as Record<string, unknown>,
          isRead: true,
          readAt: toIsoOrNull(r.read_at),
          createdAt: toIso(r.created_at),
        };
      },

      async markAllNotificationsRead(businessId, recipientUserId) {
        const res = await client.query(
          `UPDATE public.notifications
              SET is_read = TRUE, read_at = NOW()
            WHERE business_id = $1 AND recipient_user_id = $2 AND is_read = FALSE`,
          [businessId, recipientUserId],
        );
        return res.rowCount ?? 0;
      },

      async recordAudit(event): Promise<AuditLogRecord> {
        await writeAuditEvent(client, event);
        return {
          id: 'persisted',
          businessId: event.businessId,
          actorUserId: event.actorUserId,
          actorRole: event.actorRole,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId ?? null,
          metadata: event.metadata ?? {},
          createdAt: new Date().toISOString(),
        };
      },
    };
  }

  async runTenantTransaction<T>(
    businessId: string,
    userId: string,
    fn: (tx: CommerceTx) => Promise<T>,
  ): Promise<T> {
    return this.db.withTenantTransaction(businessId, userId, (client) => fn(this.createTx(client)));
  }

  async runSystemTransaction<T>(fn: (tx: CommerceTx) => Promise<T>): Promise<T> {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(this.createTx(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
