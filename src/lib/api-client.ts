import { emitWorkspaceEvent, type WorkspaceTopic } from './workspace-events';

function inferTopicsFromPath(normalizedPath: string): WorkspaceTopic[] {
  const lower = normalizedPath.toLowerCase();
  if (lower.includes('/sales')) {
    return ['sales', 'inventory', 'customers', 'debts', 'notifications'];
  }
  if (lower.includes('/inventory')) {
    return ['inventory', 'products', 'notifications'];
  }
  if (lower.includes('/product')) {
    return ['products', 'inventory'];
  }
  if (lower.includes('/debt')) {
    return ['debts', 'customers'];
  }
  if (lower.includes('/customer')) {
    return ['customers', 'debts'];
  }
  if (lower.includes('/expense')) {
    return ['expenses'];
  }
  if (lower.includes('/sync')) {
    return ['sync', 'sales', 'inventory', 'customers', 'debts', 'notifications'];
  }
  if (lower.includes('/notification')) {
    return ['notifications'];
  }
  if (lower.includes('/staff') || lower.includes('/invitation')) {
    return ['staff'];
  }
  if (lower.includes('/billing') || lower.includes('/subscription')) {
    return ['billing'];
  }
  if (lower.includes('/business') || lower.includes('/location')) {
    return ['settings'];
  }
  return ['all'];
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  accessToken?: string | null;
  businessId?: string | null;
  deviceId?: string | null;
  idempotencyKey?: string;
  body?: unknown;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export interface ApiPaginationMeta {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  meta?: ApiPaginationMeta;
  error?: ApiErrorPayload;
}

/**
 * Typed /api/v1 client enforcing standard System Architecture §7.1 headers:
 * - Authorization: Bearer <token> (user JWT from Supabase Auth; zero privileged keys in browser)
 * - X-Business-ID: <uuid> (context only; server validates authorization)
 * - X-Device-ID: <uuid> (for registered offline device sync)
 * - Idempotency-Key: <uuid> (for protected write operations)
 */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.accessToken) {
    headers['Authorization'] = `Bearer ${options.accessToken}`;
  }
  if (options.businessId) {
    headers['X-Business-ID'] = options.businessId;
  }
  if (options.deviceId) {
    headers['X-Device-ID'] = options.deviceId;
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  try {
    const response = await fetch(`/api/v1${normalizedPath}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: `Unexpected server response (${response.status}).`,
          details: {},
        },
      };
    }

    const payload = (await response.json()) as ApiResponse<T>;
    if (payload.success && method !== 'GET' && options.businessId) {
      emitWorkspaceEvent(options.businessId, inferTopicsFromPath(normalizedPath));
    }
    return payload;
  } catch {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Unable to reach Festola servers. Check your internet connection and try again.',
        details: {},
      },
    };
  }
}
