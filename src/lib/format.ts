const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦',
  GHS: '₵',
  KES: 'KSh ',
  USD: '$',
};

export function formatMoney(
  amount: string | number | null | undefined,
  currencyCode = 'NGN',
): string {
  const num = Number(amount ?? 0);
  const safe = Number.isFinite(num) ? num : 0;
  const symbol = CURRENCY_SYMBOLS[currencyCode] ?? `${currencyCode} `;
  const negative = safe < 0;
  const formatted = Math.abs(safe).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${negative ? '-' : ''}${symbol}${formatted}`;
}

export function formatQty(qty: string | number | null | undefined): string {
  const num = Number(qty ?? 0);
  if (!Number.isFinite(num)) {
    return '0';
  }
  return Number.isInteger(num)
    ? num.toLocaleString('en-NG')
    : num.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString('en-NG', { dateStyle: 'medium' });
}

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback RFC4122 v4 UUID for older WebViews
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoIsoDate(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}
