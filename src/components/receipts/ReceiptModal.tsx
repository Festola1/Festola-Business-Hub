import { Printer, Share2 } from 'lucide-react';
import { useState } from 'react';
import type { DebtPaymentRecord, SaleRecord } from '../../lib/commerce-api';
import { formatDateTime, formatMoney, formatQty } from '../../lib/format';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export type ReceiptPaperFormat = '58mm' | '80mm' | 'a4';

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

/**
 * Immutable Sales & Debt Repayment Receipt viewer/printer supporting 58mm, 80mm, and A4 formats (D-14).
 * Never exposes internal cost/WAC or profit figures.
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

  const receiptNumber =
    sale?.receipt?.receiptNumber ??
    debtPayment?.receipt?.receiptNumber ??
    offlineReceiptNumber ??
    sale?.saleNumber ??
    'PENDING';

  const handlePrint = () => {
    window.print();
  };

  const shareSummary = sale
    ? `${businessName}\nReceipt: ${receiptNumber}\nTotal: ${formatMoney(sale.totalAmount, currencyCode)}\nPaid: ${formatMoney(sale.amountPaid, currencyCode)}\nDate: ${formatDateTime(sale.soldAt)}`
    : debtPayment
      ? `${businessName}\nDebt Repayment Receipt: ${receiptNumber}\nAmount Paid: ${formatMoney(debtPayment.amount, currencyCode)}\nMethod: ${debtPayment.method}\nDate: ${formatDateTime(debtPayment.paidAt)}`
      : `${businessName} — Receipt ${receiptNumber}`;

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
                    ? 'border-[#D90000] bg-[#FFF1F1] text-[#D90000]'
                    : 'border-[#E4E4E7] bg-white text-[#52525B]'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={whatsappShareHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-emerald-600 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Share WhatsApp</span>
            </a>
            <Button variant="primary" size="sm" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Print / Save PDF</span>
            </Button>
          </div>
        </div>

        <div
          className={`mx-auto rounded-lg border border-[#E4E4E7] bg-[#F4F5F7]/40 p-4 text-xs text-[#18181B] ${PAPER_WIDTHS[paper]}`}
        >
          <div className="border-b border-dashed border-[#E4E4E7] pb-3 text-center">
            <p className="text-sm font-bold text-[#18181B]">{businessName}</p>
            <p className="mt-1 font-mono-tabular text-[11px] text-[#52525B]">
              Receipt: {receiptNumber}
            </p>
            <p className="font-mono-tabular text-[11px] text-[#52525B]">
              {formatDateTime(sale?.soldAt ?? debtPayment?.paidAt ?? new Date().toISOString())}
            </p>
            {customerName && (
              <p className="mt-1 text-[11px] text-[#52525B]">Customer: {customerName}</p>
            )}
            {offlineReceiptNumber && (
              <p className="mt-1 font-semibold text-[#D97706]">
                Queued Offline · Pending Sync Verification
              </p>
            )}
          </div>

          {sale && (
            <>
              <div className="divide-y divide-[#E4E4E7] py-2">
                {sale.items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-2 py-1.5">
                    <div className="min-w-0">
                      <p className="font-medium text-[#18181B]">{item.productNameSnapshot}</p>
                      <p className="font-mono-tabular text-[11px] text-[#52525B]">
                        {formatQty(item.quantity)} {item.unitSnapshot} ×{' '}
                        {formatMoney(item.unitPrice, currencyCode)}
                      </p>
                    </div>
                    <p className="font-mono-tabular font-medium text-[#18181B]">
                      {formatMoney(item.lineTotal, currencyCode)}
                    </p>
                  </div>
                ))}
              </div>

              <dl className="space-y-1 border-t border-dashed border-[#E4E4E7] pt-2.5">
                <div className="flex justify-between">
                  <dt className="text-[#52525B]">Subtotal</dt>
                  <dd className="font-mono-tabular">
                    {formatMoney(sale.subtotalAmount, currencyCode)}
                  </dd>
                </div>
                {Number(sale.discountAmount) > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-[#52525B]">Discount</dt>
                    <dd className="font-mono-tabular">
                      -{formatMoney(sale.discountAmount, currencyCode)}
                    </dd>
                  </div>
                )}
                {sale.taxEnabledSnapshot && (
                  <div className="flex justify-between">
                    <dt className="text-[#52525B]">
                      Tax ({sale.taxRateSnapshot}% {sale.taxModeSnapshot})
                    </dt>
                    <dd className="font-mono-tabular">
                      {formatMoney(sale.taxAmount, currencyCode)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-[#E4E4E7] pt-1.5 text-sm font-bold">
                  <dt>Total</dt>
                  <dd className="font-mono-tabular">
                    {formatMoney(sale.totalAmount, currencyCode)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#52525B]">Paid</dt>
                  <dd className="font-mono-tabular">
                    {formatMoney(sale.amountPaid, currencyCode)}
                  </dd>
                </div>
                {Number(sale.creditAmount) > 0 && (
                  <div className="flex justify-between text-[#991B1B]">
                    <dt>Credit Balance</dt>
                    <dd className="font-mono-tabular font-semibold">
                      {formatMoney(sale.creditRemaining, currencyCode)}
                    </dd>
                  </div>
                )}
              </dl>

              {sale.payments.length > 0 && (
                <div className="mt-2.5 border-t border-dashed border-[#E4E4E7] pt-2 text-[11px] text-[#52525B]">
                  <p className="font-medium text-[#18181B]">Tenders</p>
                  {sale.payments.map((p) => (
                    <div key={p.id} className="mt-0.5 flex justify-between">
                      <span className="capitalize">{p.method.replace('_', ' ')}</span>
                      <span className="font-mono-tabular">
                        {formatMoney(p.amount, currencyCode)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {debtPayment && (
            <dl className="space-y-1.5 py-3">
              <div className="flex justify-between">
                <dt className="text-[#52525B]">Payment Method</dt>
                <dd className="capitalize">{debtPayment.method.replace('_', ' ')}</dd>
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

          {receiptFooter && (
            <p className="mt-3 border-t border-dashed border-[#E4E4E7] pt-2.5 text-center text-[11px] text-[#52525B]">
              {receiptFooter}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
