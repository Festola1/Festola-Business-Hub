import { useEffect, useState } from 'react';

export type WorkspaceTopic =
  | 'sales'
  | 'inventory'
  | 'products'
  | 'customers'
  | 'debts'
  | 'expenses'
  | 'sync'
  | 'notifications'
  | 'settings'
  | 'billing'
  | 'staff'
  | 'all';

export interface WorkspaceEventDetail {
  businessId: string;
  topics: WorkspaceTopic[];
  timestamp: number;
}

type WorkspaceEventListener = (detail: WorkspaceEventDetail) => void;

const listeners = new Set<WorkspaceEventListener>();

/**
 * Broadcasts a tenant-scoped reactive change event so Dashboard KPIs, charts,
 * top-bar online/sync indicators, and notification badges refresh immediately.
 */
export function emitWorkspaceEvent(
  businessId: string,
  topics: WorkspaceTopic | WorkspaceTopic[],
): void {
  const normalized = Array.isArray(topics) ? topics : [topics];
  const detail: WorkspaceEventDetail = {
    businessId,
    topics: normalized,
    timestamp: Date.now(),
  };

  for (const listener of listeners) {
    try {
      listener(detail);
    } catch {
      // Keep event fan-out resilient if one subscriber throws
      continue;
    }
  }
}

export function subscribeWorkspaceEvents(
  businessId: string | null | undefined,
  topics: WorkspaceTopic[],
  onEvent: (detail: WorkspaceEventDetail) => void,
): () => void {
  if (!businessId) {
    return () => undefined;
  }

  const topicSet = new Set<WorkspaceTopic>(topics);
  const handler: WorkspaceEventListener = (detail) => {
    if (detail.businessId !== businessId) {
      return;
    }
    if (
      topicSet.has('all') ||
      detail.topics.includes('all') ||
      detail.topics.some((topic) => topicSet.has(topic))
    ) {
      onEvent(detail);
    }
  };

  listeners.add(handler);

  const handleStorage = (event: StorageEvent) => {
    if (!event.key || !event.key.includes(businessId)) {
      return;
    }
    if (topicSet.has('all') || topicSet.has('sync')) {
      onEvent({
        businessId,
        topics: ['sync'],
        timestamp: Date.now(),
      });
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage);
  }

  return () => {
    listeners.delete(handler);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage);
    }
  };
}

/**
 * React hook returning a monotonic tick counter that increments whenever a
 * matching reactive workspace event fires for the active business.
 */
export function useWorkspaceEventTick(
  businessId: string | null | undefined,
  topics: WorkspaceTopic[],
): number {
  const [tick, setTick] = useState(0);
  const topicKey = topics.join(',');

  useEffect(() => {
    if (!businessId) {
      return;
    }
    const parsedTopics = topicKey.split(',').filter(Boolean) as WorkspaceTopic[];
    return subscribeWorkspaceEvents(businessId, parsedTopics, () => {
      setTick((prev) => prev + 1);
    });
  }, [businessId, topicKey]);

  return tick;
}

export interface ModuleIntegrationRecord {
  id: string;
  label: string;
  route: string;
  release: 1 | 2;
  status: 'connected' | 'partial' | 'pending';
  apiBacking: string;
  notes: string;
}

/**
 * Transparent registry of backend API integrations and pending Release 2 items.
 * Used to track live vs. pending wiring without presenting fixtures as real data.
 */
export const MODULE_INTEGRATION_REGISTRY: readonly ModuleIntegrationRecord[] = [
  {
    id: 'dashboard',
    label: 'Dashboard Overview',
    route: '/app/dashboard',
    release: 1,
    status: 'connected',
    apiBacking: 'GET /api/v1/reports/*, /products, /product-categories, /sales',
    notes: 'Live KPIs, trends, category breakdown, recent sales, and low-stock alerts.',
  },
  {
    id: 'pos',
    label: 'Point of Sale (POS)',
    route: '/app/pos',
    release: 1,
    status: 'connected',
    apiBacking: 'POST /api/v1/sales + offline queue fallback',
    notes: 'Emits reactive sales, inventory, and sync events immediately on checkout.',
  },
  {
    id: 'sales',
    label: 'Sales History & Receipts',
    route: '/app/sales',
    release: 1,
    status: 'connected',
    apiBacking: 'GET /api/v1/sales, POST /void, POST /returns',
    notes: 'Server-backed ledger with immutable receipts and online-only voids/returns.',
  },
  {
    id: 'products',
    label: 'Products & Categories',
    route: '/app/products',
    release: 1,
    status: 'connected',
    apiBacking: 'GET/POST/PATCH /api/v1/products, /product-categories',
    notes: 'Backend independently redacts cost/WAC for Cashier role.',
  },
  {
    id: 'inventory',
    label: 'Inventory & Stock Movements',
    route: '/app/inventory',
    release: 1,
    status: 'connected',
    apiBacking: 'GET/POST /api/v1/inventory/*',
    notes: 'Restock batches, adjustments, and real-time low-stock visibility.',
  },
  {
    id: 'customers',
    label: 'Customers',
    route: '/app/customers',
    release: 1,
    status: 'connected',
    apiBacking: 'GET/POST/PATCH /api/v1/customers',
    notes: 'Customer directory with credit limits and running balances.',
  },
  {
    id: 'debts',
    label: 'Credit & Debt Ledger',
    route: '/app/debts',
    release: 1,
    status: 'connected',
    apiBacking: 'GET/POST /api/v1/customers/:id/debt-payments',
    notes: 'Debt settlement history with receipt generation and offline queue support.',
  },
  {
    id: 'expenses',
    label: 'Expenses',
    route: '/app/expenses',
    release: 1,
    status: 'connected',
    apiBacking: 'GET/POST/DELETE /api/v1/expenses, /expense-categories',
    notes: 'Owner and Manager operating expense tracking.',
  },
  {
    id: 'reports',
    label: 'Reports & Analytics',
    route: '/app/reports',
    release: 1,
    status: 'connected',
    apiBacking: 'GET /api/v1/reports/*',
    notes: 'Financial summary, daily sales trends, top products, and valuation.',
  },
  {
    id: 'staff',
    label: 'Staff & Permissions',
    route: '/app/staff',
    release: 1,
    status: 'connected',
    apiBacking: 'GET/POST/PATCH /api/v1/staff, /invitations',
    notes: 'Role-based invitations, member roles, and instant revocation.',
  },
  {
    id: 'subscription',
    label: 'Subscriptions & Billing',
    route: '/app/subscription',
    release: 1,
    status: 'partial',
    apiBacking: 'GET/POST /api/v1/billing/* (Paystack live keys pending production setup)',
    notes: 'Plan limits and status live; live Paystack merchant checkout pending credentials.',
  },
  {
    id: 'settings',
    label: 'Business Settings',
    route: '/app/settings',
    release: 1,
    status: 'connected',
    apiBacking: 'GET/PATCH /api/v1/business, /locations',
    notes: 'Tax, currency, receipt footer, and primary branch settings.',
  },
  {
    id: 'firebase-api-bridge',
    label: 'Firebase-to-REST Token Bridge',
    route: '/app/dashboard',
    release: 1,
    status: 'connected',
    apiBacking: 'Firebase ID Token verified server-side against PostgreSQL memberships',
    notes: 'Live Firebase and Supabase sessions query verified multi-tenant PostgreSQL data.',
  },
  {
    id: 'purchases',
    label: 'Purchases (Release 2)',
    route: '/app/purchases',
    release: 2,
    status: 'pending',
    apiBacking: 'Excluded from Release 1 navigation until Release 2 approval',
    notes: 'Preserved behind Release 2 navigation flag.',
  },
  {
    id: 'suppliers',
    label: 'Suppliers (Release 2)',
    route: '/app/suppliers',
    release: 2,
    status: 'pending',
    apiBacking: 'Firestore suppliers sync active; excluded from Release 1 navigation',
    notes: 'Preserved behind Release 2 navigation flag.',
  },
] as const;
