import type { CustomerItem, ProductItem, TenderMethod } from './commerce-api';

export interface QueuedOfflineSale {
  clientOperationUuid: string;
  occurredAt: string;
  offlineReceiptNumber: string;
  deviceId: string;
  estimatedTotal: string;
  itemSummary: string;
  payload: {
    clientSaleUuid: string;
    customerId?: string | null;
    deviceId: string;
    offlineReceiptNumber: string;
    notes?: string | null;
    items: Array<{ productId: string; quantity: string; discountAmount: string }>;
    payments: Array<{ method: TenderMethod; amount: string; referenceNote?: string | null }>;
  };
}

export interface QueuedOfflineExpense {
  clientOperationUuid: string;
  occurredAt: string;
  categoryName: string;
  description: string;
  amount: string;
  paymentMethod: TenderMethod;
  incurredOn: string;
}

export interface QueuedOfflineCreditPayment {
  clientOperationUuid: string;
  occurredAt: string;
  customerId: string;
  customerName: string;
  amount: string;
  method: TenderMethod;
  referenceNote?: string;
}

export interface SupplierPaymentRecord {
  id: string;
  amount: string;
  method: TenderMethod;
  paidAt: string;
  referenceNote: string;
}

export interface SupplierRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  productsSupplied: string;
  totalPurchases: number;
  outstandingBalance: number;
  payments: SupplierPaymentRecord[];
  createdAt: string;
}

export interface OfflineBootstrapCache {
  syncCursor: string;
  products: ProductItem[];
  customers: CustomerItem[];
}

const IDB_NAME = 'festola_business_hub_offline_v1';
const IDB_STORE = 'kv_store';

function mirrorToIndexedDb(key: string, value: unknown): void {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return;
  }
  try {
    const request = window.indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => {
      try {
        const db = request.result;
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => db.close();
      } catch {
        return;
      }
    };
  } catch {
    return;
  }
}

function queueKey(businessId: string): string {
  return `festola.offline.queue.${businessId}`;
}

function expenseQueueKey(businessId: string): string {
  return `festola.offline.expenses.${businessId}`;
}

function creditQueueKey(businessId: string): string {
  return `festola.offline.credits.${businessId}`;
}

function suppliersKey(businessId: string): string {
  return `festola.suppliers.${businessId}`;
}

function cacheKey(businessId: string): string {
  return `festola.offline.cache.${businessId}`;
}

function deviceKey(businessId: string): string {
  return `festola.offline.device.${businessId}`;
}

function seqKey(businessId: string): string {
  return `festola.offline.seq.${businessId}`;
}

/**
 * Strictly tenant-partitioned local offline storage (keyed by businessId) with
 * IndexedDB mirroring so switching businesses never leaks queued operations or caches.
 */
export function getRegisteredLocalDevice(
  businessId: string,
): { deviceId: string; deviceCode: string } | null {
  try {
    const raw = window.localStorage.getItem(deviceKey(businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { deviceId?: string; deviceCode?: string };
    if (parsed.deviceId && parsed.deviceCode) {
      return { deviceId: parsed.deviceId, deviceCode: parsed.deviceCode };
    }
    return null;
  } catch {
    return null;
  }
}

export function setRegisteredLocalDevice(
  businessId: string,
  device: { deviceId: string; deviceCode: string },
): void {
  const key = deviceKey(businessId);
  try {
    window.localStorage.setItem(key, JSON.stringify(device));
    mirrorToIndexedDb(key, device);
  } catch {
    return;
  }
}

export function nextOfflineReceiptNumber(businessId: string, deviceCode: string): string {
  const prefix = deviceCode
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X');
  let nextSeq: number;
  try {
    const prev = Number(window.localStorage.getItem(seqKey(businessId)) ?? '0');
    nextSeq = Number.isFinite(prev) && prev >= 0 ? prev + 1 : 1;
    window.localStorage.setItem(seqKey(businessId), String(nextSeq));
  } catch {
    nextSeq = Math.floor(Date.now() % 10000);
  }
  return `OFF-${prefix}-${String(nextSeq).padStart(4, '0')}`;
}

export function listQueuedOfflineSales(businessId: string): QueuedOfflineSale[] {
  try {
    const raw = window.localStorage.getItem(queueKey(businessId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedOfflineSale[]) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineSale(
  businessId: string,
  sale: QueuedOfflineSale,
): QueuedOfflineSale[] {
  const key = queueKey(businessId);
  const current = listQueuedOfflineSales(businessId);
  const next = [...current, sale];
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
    mirrorToIndexedDb(key, next);
  } catch {
    return next;
  }
  return next;
}

export function removeQueuedOfflineSales(
  businessId: string,
  operationUuids: string[],
): QueuedOfflineSale[] {
  const key = queueKey(businessId);
  const removeSet = new Set(operationUuids);
  const remaining = listQueuedOfflineSales(businessId).filter(
    (op) => !removeSet.has(op.clientOperationUuid),
  );
  try {
    window.localStorage.setItem(key, JSON.stringify(remaining));
    mirrorToIndexedDb(key, remaining);
  } catch {
    return remaining;
  }
  return remaining;
}

export function listQueuedOfflineExpenses(businessId: string): QueuedOfflineExpense[] {
  try {
    const raw = window.localStorage.getItem(expenseQueueKey(businessId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedOfflineExpense[]) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineExpense(
  businessId: string,
  expense: QueuedOfflineExpense,
): QueuedOfflineExpense[] {
  const key = expenseQueueKey(businessId);
  const next = [...listQueuedOfflineExpenses(businessId), expense];
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
    mirrorToIndexedDb(key, next);
  } catch {
    return next;
  }
  return next;
}

export function listQueuedOfflineCreditPayments(businessId: string): QueuedOfflineCreditPayment[] {
  try {
    const raw = window.localStorage.getItem(creditQueueKey(businessId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedOfflineCreditPayment[]) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineCreditPayment(
  businessId: string,
  payment: QueuedOfflineCreditPayment,
): QueuedOfflineCreditPayment[] {
  const key = creditQueueKey(businessId);
  const next = [...listQueuedOfflineCreditPayments(businessId), payment];
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
    mirrorToIndexedDb(key, next);
  } catch {
    return next;
  }
  return next;
}

export function saveOfflineBootstrapCache(businessId: string, cache: OfflineBootstrapCache): void {
  const key = cacheKey(businessId);
  try {
    window.localStorage.setItem(key, JSON.stringify(cache));
    mirrorToIndexedDb(key, cache);
  } catch {
    return;
  }
}

export function loadOfflineBootstrapCache(businessId: string): OfflineBootstrapCache | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(businessId));
    if (!raw) return null;
    return JSON.parse(raw) as OfflineBootstrapCache;
  } catch {
    return null;
  }
}

export function listWorkspaceSuppliers(businessId: string): SupplierRecord[] {
  try {
    const raw = window.localStorage.getItem(suppliersKey(businessId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SupplierRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveWorkspaceSuppliers(businessId: string, suppliers: SupplierRecord[]): void {
  const key = suppliersKey(businessId);
  try {
    window.localStorage.setItem(key, JSON.stringify(suppliers));
    mirrorToIndexedDb(key, suppliers);
  } catch {
    return;
  }
}
