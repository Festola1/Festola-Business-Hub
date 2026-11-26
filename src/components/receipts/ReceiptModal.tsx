import { Check, Copy, Printer, Share2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DebtPaymentRecord, SaleRecord } from '../../lib/commerce-api';
import { formatDateTime, formatMoney, formatQty } from '../../lib/format';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export type ReceiptPaperFormat = '58mm' | '80mm' | 'a4';

interface SnapshotLineItem {
  name: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
}

interface SnapshotPayment {
  method: string;
  amount: string;
  referenceNote?: string | null;
}

interface ParsedSaleReceipt {
  businessName: string;
  locationName: string | null;
  locationAddress: string | null;
  locationPhone: string | null;
  currencyCode: string;
  receiptNumber: string;
  customerName: string | null;
  issuedAt: string;
  items: SnapshotLineItem[];
  subtotalAmount: string;
  discountAmount: string;
  taxEnabled: boolean;
  taxMode: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  creditAmount: string;
  creditRemaining: string;
  payments: SnapshotPayment[];
  notes: string | null;
  receiptFooter: string | null;
  fromCommittedSnapshot: boolean;
}

interface ReceiptModalProps {
  open: boolean;
  onClose: () => void;
  businessName: string;
  currencyCode?: string;
  sale?: SaleRecord | null;
  debtPayment?: DebtPaymentRecord | null;
  customerName?: string | null;
  offlineReceiptNumber?: string | null;
  receiptFooter?: string | null;
}

const PAPER_WIDTHS: Record<ReceiptPaperFormat, string> = {
  '58mm': 'max-w-[240px]',
  '80mm': 'max-w-[320px]',
  a4: 'max-w-full',
};

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function parseCommittedSaleReceipt(
  sale: SaleRecord,
  fallbackBusinessName: string,
  fallbackCurrency: string,
  fallbackCustomerName: string | null | undefined,
  fallbackFooter: string | null | undefined,
  offlineReceiptNumber: string | null | undefined,
): ParsedSaleReceipt {
  const snap = sale.receipt?.snapshotPayload;
  const hasSnapshotItems = Boolean(snap && Array.isArray(snap.items) && snap.items.length > 0);

  if (snap && hasSnapshotItems) {
    const rawItems = snap.items as Array<Record<string, unknown>>;
    const rawPayments = Array.isArray(snap.payments)
      ? (snap.payments as Array<Record<string, unknown>>)
      : [];

    const payments: SnapshotPayment[] =
      rawPayments.length > 0
        ? rawPayments.map((p, idx) => ({
            method: readString(p.method, sale.payments[idx]?.method ?? 'cash'),
            amount: readString(p.amount, sale.payments[idx]?.amount ?? '0.00'),
            referenceNote:
              readNullableString(p.referenceNote) ?? sale.payments[idx]?.referenceNote ?? null,
          }))
        : sale.payments.map((p) => ({
            method: p.method,
            amount: p.amount,
            referenceNote: p.referenceNote,
          }));

    return {
      businessName: readString(snap.businessName, fallbackBusinessName),
      locationName: readNullableString(snap.locationName),
      locationAddress: readNullableString(snap.locationAddress),
      locationPhone: readNullableString(snap.locationPhone),
      currencyCode: readString(snap.currencyCode, fallbackCurrency),
      receiptNumber:
        sale.receipt?.receiptNumber ??
        readString(snap.receiptNumber, offlineReceiptNumber ?? sale.saleNumber),
      customerName: readNullableString(snap.customerName) ?? fallbackCustomerName ?? null,
      issuedAt: readString(snap.issuedAt, sale.receipt?.issuedAt ?? sale.soldAt),
      items: rawItems.map((item) => ({
        name: readString(item.name, 'Item'),
        unit: readString(item.unit, 'pcs'),
        quantity: readString(item.quantity, '1.000'),
        unitPrice: readString(item.unitPrice, '0.00'),
        discountAmount: readString(item.discountAmount, '0.00'),
        taxAmount: readString(item.taxAmount, '0.00'),
        lineTotal: readString(item.lineTotal, '0.00'),
      })),
      subtotalAmount: readString(snap.subtotalAmount, sale.subtotalAmount),
      discountAmount: readString(snap.discountAmount, sale.discountAmount),
      taxEnabled:
        typeof snap.taxEnabled === 'boolean' ? snap.taxEnabled : Boolean(sale.taxEnabledSnapshot),
      taxMode: readString(snap.taxMode, sale.taxModeSnapshot),
      taxRate: readString(snap.taxRate, sale.taxRateSnapshot),
      taxAmount: readString(snap.taxAmount, sale.taxAmount),
      totalAmount: readString(snap.totalAmount, sale.totalAmount),
      amountPaid: readString(snap.amountPaid, sale.amountPaid),
      creditAmount: readString(snap.creditAmount, sale.creditAmount),
      creditRemaining: sale.creditRemaining,
      payments,
      notes: readNullableString(snap.notes) ?? sale.notes ?? null,
      receiptFooter: readNullableString(snap.receiptFooter) ?? fallbackFooter ?? null,
      fromCommittedSnapshot: true,
    };
  }

  return {
    businessName: fallbackBusinessName,
    locationName: null,
    locationAddress: null,
    locationPhone: null,
    currencyCode: fallbackCurrency,
    receiptNumber: sale.receipt?.receiptNumber ?? offlineReceiptNumber ?? sale.saleNumber,
    customerName: fallbackCustomerName ?? null,
    issuedAt: sale.soldAt,
    items: sale.items.map((i) => ({
      name: i.productNameSnapshot,
      unit: i.unitSnapshot,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discountAmount: i.discountAmount,
      taxAmount: i.taxAmount,
      lineTotal: i.lineTotal,
    })),
    subtotalAmount: sale.subtotalAmount,
    discountAmount: sale.discountAmount,
    taxEnabled: sale.taxEnabledSnapshot,
    taxMode: sale.taxModeSnapshot,
    taxRate: sale.taxRateSnapshot,
    taxAmount: sale.taxAmount,
    totalAmount: sale.totalAmount,
    amountPaid: sale.amountPaid,
    creditAmount: sale.creditAmount,
    creditRemaining: sale.creditRemaining,
    payments: sale.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      referenceNote: p.referenceNote,
    })),
    notes: sale.notes,
    receiptFooter: fallbackFooter ?? null,
    fromCommittedSnapshot: false,
  };
}

function formatTenderLabel(method: string): string {
  if (method === 'pos_card') return 'POS Card';
  if (method === 'transfer') return 'Bank Transfer';
  if (method === 'credit') return 'Credit';
  return 'Cash';
}

/**
 * Immutable Sales & Debt Repayment Receipt viewer/printer supporting 58mm, 80mm, and A4 formats (D-14).
 * Renders from the committed server snapshot payload when present and never exposes internal cost/WAC/profit.
 */
export function ReceiptModal({
  open,
  onClose,
  businessName,
  currencyCode = 'NGN',
  sale,
  debtPayment,
  customerName,
  offlineReceiptNumber,
  receiptFooter,
}: ReceiptModalProps) {
  const [paper, setPaper] = useState<ReceiptPaperFormat>('80mm');
  const [copied, setCopied] = useState(false);

  const parsedSale = useMemo(
    () =>
      sale
        ? parseCommittedSaleReceipt(
            sale,
            businessName,
            currencyCode,
            customerName,
            receiptFooter,
            offlineReceiptNumber,
          )
        : null,
    [sale, businessName, currencyCode, customerName, receiptFooter, offlineReceiptNumber],
  );

  const receiptNumber =
    parsedSale?.receiptNumber ??
    debtPayment?.receipt?.receiptNumber ??
    offlineReceiptNumber ??
    'PENDING';

  const effectiveCurrency = parsedSale?.currencyCode ?? currencyCode;
  const effectiveBusinessName = parsedSale?.businessName ?? businessName;

  const shareSummary = useMemo(() => {
    if (parsedSale && sale) {
      const lines = [
        effectiveBusinessName,
        parsedSale.locationAddress ?? null,
        `Receipt: ${receiptNumber}`,
        `Date: ${formatDateTime(parsedSale.issuedAt)}`,
        parsedSale.customerName ? `Customer: ${parsedSale.customerName}` : null,
        sale.status !== 'completed' ? `Status: ${sale.status.replace('_', ' ').toUpperCase()}` : null,
        '---',
        ...parsedSale.items.map(
          (i) =>
            `${formatQty(i.quantity)} ${i.unit} x ${i.name} = ${formatMoney(i.lineTotal, effectiveCurrency)}`,
        ),
        '---',
        `Subtotal: ${formatMoney(parsedSale.subtotalAmount, effectiveCurrency)}`,
        Number(parsedSale.discountAmount) > 0
          ? `Discount: -${formatMoney(parsedSale.discountAmount, effectiveCurrency)}`
          : null,
        parsedSale.taxEnabled && Number(parsedSale.taxAmount) > 0
          ? `Tax (${parsedSale.taxRate}%): ${formatMoney(parsedSale.taxAmount, effectiveCurrency)}`
          : null,
        `Total: ${formatMoney(parsedSale.totalAmount, effectiveCurrency)}`,
        `Paid: ${formatMoney(parsedSale.amountPaid, effectiveCurrency)}`,
        Number(parsedSale.creditRemaining) > 0
          ? `Credit Balance: ${formatMoney(parsedSale.creditRemaining, effectiveCurrency)}`
          : null,
      ];
      return lines.filter(Boolean).join('\n');
    }
    if (debtPayment) {
      return `${businessName}\nDebt Repayment Receipt: ${receiptNumber}\nAmount Paid: ${formatMoney(debtPayment.amount, currencyCode)}\nMethod: ${formatTenderLabel(debtPayment.method)}\nDate: ${formatDateTime(debtPayment.paidAt)}`;
    }
    return `${businessName} — Receipt ${receiptNumber}`;
  }, [parsedSale, sale, debtPayment, effectiveBusinessName, receiptNumber, effectiveCurrency, businessName, currencyCode]);

  const handlePrint = () => {
    window.print();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareSummary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${effectiveBusinessName} Receipt ${receiptNumber}`,
          text: shareSummary,
        });
        return;
      } catch {
        return;
      }
    }
    await handleCopy();
  };

  const whatsappShareHref = `https://wa.me/?text=${encodeURIComponent(shareSummary)}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={debtPayment ? 'Debt Repayment Receipt' : 'Sales Receipt'}
      description={`Receipt ${receiptNumber}`}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <div className="inline-flex gap-1.5" role="group" aria-label="Receipt paper width">
            {(['58mm', '80mm', 'a4'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setPaper(fmt)}
                className={`min-h-[36px] rounded-md border px-2.5 py-1 text-xs font-medium uppercase ${
                  paper === fmt
                    ? 'border-[#991B1B] bg-[#FEF2F2] text-[#991B1B]'
                    : 'border-[#E4E4E7] bg-white text-[#52525B]'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void handleCopy()}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-[#16A34A]" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </Button>
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
              <Button variant="secondary" size="sm" onClick={() => void handleNativeShare()}>
                <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Share</span>
              </Button>
            )}
            <a
              href={whatsappShareHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-emerald-600 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>WhatsApp</span>
            </a>
            <Button variant="primary" size="sm" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Print / Save PDF</span>
            </Button>
          </div>
        </div>

        <div
          className={`mx-auto rounded-lg border border-[#E4E4E7] bg-[#F4F5F7]/40 p-4 text-xs text-[#18181B] print:border-none print:bg-white print:p-0 ${PAPER_WIDTHS[paper]}`}
        >
          <div className="border-b border-dashed border-[#E4E4E7] pb-3 text-center">
            <p className="text-sm font-bold text-[#18181B]">{effectiveBusinessName}</p>
            {parsedSale?.locationName && (
              <p className="mt-0.5 text-[11px] font-medium text-[#52525B]">
                {parsedSale.locationName}
              </p>
            )}
            {parsedSale?.locationAddress && (
              <p className="text-[11px] text-[#52525B]">{parsedSale.locationAddress}</p>
            )}
            {parsedSale?.locationPhone && (
              <p className="font-mono-tabular text-[11px] text-[#52525B]">
                {parsedSale.locationPhone}
              </p>
            )}
            <p className="mt-1.5 font-mono-tabular text-[11px] font-semibold text-[#18181B]">
              Receipt: {receiptNumber}
            </p>
            <p className="font-mono-tabular text-[11px] text-[#52525B]">
              {formatDateTime(parsedSale?.issuedAt ?? debtPayment?.paidAt ?? new Date().toISOString())}
            </p>
            {(parsedSale?.customerName ?? customerName) && (
              <p className="mt-1 text-[11px] text-[#52525B]">
                Customer: {parsedSale?.customerName ?? customerName}
              </p>
            )}
            {offlineReceiptNumber && (
              <p className="mt-1 font-semibold text-[#D97706]">
                Queued Offline · Pending Sync Verification
              </p>
            )}
            {sale && sale.status !== 'completed' && (
              <p className="mt-1.5 rounded border border-[#DC2626]/30 bg-[#FEF2F2] px-2 py-0.5 font-mono-tabular text-[11px] font-semibold uppercase text-[#DC2626]">
                {sale.status === 'voided'
                  ? 'VOIDED — ORIGINAL RECEIPT PRESERVED'
                  : sale.status === 'returned'
                    ? 'FULLY RETURNED'
                    : 'PARTIALLY RETURNED'}
              </p>
            )}
          </div>

          {parsedSale && (
            <>
              <div className="divide-y divide-[#E4E4E7] py-2">
                {parsedSale.items.map((item, idx) => (
                  <div
                    key={`${item.name}-${idx}`}
                    className="flex items-start justify-between gap-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#18181B]">{item.name}</p>
                      <p className="font-mono-tabular text-[11px] text-[#52525B]">
                        {formatQty(item.quantity)} {item.unit} ×{' '}
                        {formatMoney(item.unitPrice, effectiveCurrency)}
                      </p>
                      {Number(item.discountAmount) > 0 && (
                        <p className="font-mono-tabular text-[10px] text-[#991B1B]">
                          Discount: -{formatMoney(item.discountAmount, effectiveCurrency)}
                        </p>
                      )}
                    </div>
                    <p className="font-mono-tabular font-medium text-[#18181B] shrink-0">
                      {formatMoney(item.lineTotal, effectiveCurrency)}
                    </p>
                  </div>
                ))}
              </div>

              <dl className="space-y-1 border-t border-dashed border-[#E4E4E7] pt-2.5">
                <div className="flex justify-between">
                  <dt className="text-[#52525B]">Subtotal</dt>
                  <dd className="font-mono-tabular">
                    {formatMoney(parsedSale.subtotalAmount, effectiveCurrency)}
                  </dd>
                </div>
                {Number(parsedSale.discountAmount) > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-[#52525B]">Discount</dt>
                    <dd className="font-mono-tabular">
                      -{formatMoney(parsedSale.discountAmount, effectiveCurrency)}
                    </dd>
                  </div>
                )}
                {parsedSale.taxEnabled && (
                  <div className="flex justify-between">
                    <dt className="text-[#52525B]">
                      Tax ({parsedSale.taxRate}% {parsedSale.taxMode})
                    </dt>
                    <dd className="font-mono-tabular">
                      {formatMoney(parsedSale.taxAmount, effectiveCurrency)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-[#E4E4E7] pt-1.5 text-sm font-bold">
                  <dt>Total</dt>
                  <dd className="font-mono-tabular">
                    {formatMoney(parsedSale.totalAmount, effectiveCurrency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#52525B]">Paid</dt>
                  <dd className="font-mono-tabular">
                    {formatMoney(parsedSale.amountPaid, effectiveCurrency)}
                  </dd>
                </div>
                {Number(parsedSale.creditAmount) > 0 && (
                  <div className="flex justify-between text-[#991B1B]">
                    <dt>Credit Balance</dt>
                    <dd className="font-mono-tabular font-semibold">
                      {formatMoney(parsedSale.creditRemaining, effectiveCurrency)}
                    </dd>
                  </div>
                )}
              </dl>

              {parsedSale.payments.length > 0 && (
                <div className="mt-2.5 border-t border-dashed border-[#E4E4E7] pt-2 text-[11px] text-[#52525B]">
                  <p className="font-medium text-[#18181B]">Tenders</p>
                  {parsedSale.payments.map((p, idx) => (
                    <div key={`${p.method}-${idx}`} className="mt-0.5">
                      <div className="flex justify-between">
                        <span>{formatTenderLabel(p.method)}</span>
                        <span className="font-mono-tabular">
                          {formatMoney(p.amount, effectiveCurrency)}
                        </span>
                      </div>
                      {p.referenceNote && (
                        <p className="font-mono-tabular text-[10px] text-[#71717A]">
                          Ref: {p.referenceNote}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {parsedSale.notes && (
                <p className="mt-2 border-t border-dashed border-[#E4E4E7] pt-2 text-[11px] text-[#52525B]">
                  Note: {parsedSale.notes}
                </p>
              )}
            </>
          )}

          {debtPayment && (
            <dl className="space-y-1.5 py-3">
              <div className="flex justify-between">
                <dt className="text-[#52525B]">Payment Method</dt>
                <dd>{formatTenderLabel(debtPayment.method)}</dd>
              </div>
              {debtPayment.referenceNote && (
                <div className="flex justify-between">
                  <dt className="text-[#52525B]">Reference</dt>
                  <dd className="font-mono-tabular">{debtPayment.referenceNote}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-[#E4E4E7] pt-2 text-sm font-bold">
                <dt>Amount Paid</dt>
                <dd className="font-mono-tabular">
                  {formatMoney(debtPayment.amount, currencyCode)}
                </dd>
              </div>
            </dl>
          )}

          {(parsedSale?.receiptFooter ?? receiptFooter) && (
            <p className="mt-3 border-t border-dashed border-[#E4E4E7] pt-2.5 text-center text-[11px] text-[#52525B]">
              {parsedSale?.receiptFooter ?? receiptFooter}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
