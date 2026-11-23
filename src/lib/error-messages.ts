import type { ApiErrorPayload } from './api-client';

const API_ERROR_COPY: Record<string, string> = {
  UNAUTHENTICATED: 'Your session has expired. Please sign in again.',
  EMAIL_NOT_VERIFIED:
    'Please verify your email address before accessing your workspace. Check your inbox or request a new verification email.',
  PERMISSION_DENIED:
    'You do not have permission to perform this action in the current business workspace.',
  TENANT_ACCESS_DENIED:
    'You no longer have active access to the selected business. We have refreshed your authorized workspaces.',
  BUSINESS_NOT_FOUND:
    'This business workspace could not be found or is no longer active for your account.',
  DEVICE_REVOKED:
    'This offline device has been revoked by your business administrator. Re-register a permitted device to continue.',
  SUBSCRIPTION_READ_ONLY:
    'This business is in safe read-only mode until subscription renewal. Your records are preserved and cannot be modified right now.',
  SUBSCRIPTION_LIMIT_REACHED:
    'You have reached your current plan capacity limit. Review your subscription capacity before adding more.',
  RATE_LIMITED: 'Too many requests in a short time. Please wait a moment and try again.',
  IDEMPOTENCY_CONFLICT:
    'This request conflicted with a previous submission using the same reference. Refresh and try again.',
  CONFLICT:
    'This record was updated or already exists. Refresh the page and review before trying again.',
  NOT_FOUND: 'The requested record could not be found.',
  VALIDATION_ERROR: 'Please review the highlighted fields and fix the validation errors.',
  NETWORK_ERROR: 'Unable to reach Festola servers. Check your internet connection and try again.',
  INTERNAL_SERVER_ERROR:
    'Something went wrong on our side. Your data is safe — please retry in a moment.',
};

/**
 * Translates backend ApiErrorPayload codes into plain, SME-friendly messages
 * without exposing raw SQL/stack traces or internal implementation details.
 */
export function getFriendlyApiError(
  error?: ApiErrorPayload | null,
  fallback = 'Unable to complete this request. Please try again.',
): string {
  if (!error) {
    return fallback;
  }

  const mapped = API_ERROR_COPY[error.code];
  if (mapped) {
    if (error.code === 'VALIDATION_ERROR' && error.message && error.message.length < 180) {
      return error.message;
    }
    if (
      error.code === 'SUBSCRIPTION_LIMIT_REACHED' &&
      error.message &&
      error.message.length < 180
    ) {
      return error.message;
    }
    return mapped;
  }

  if (error.message && !/stack|sql|postgres|relation|syntax error/i.test(error.message)) {
    return error.message;
  }

  return fallback;
}

/**
 * Translates Supabase Auth client error messages into friendly user-facing guidance.
 */
export function getFriendlyAuthError(rawMessage: string): string {
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return 'Incorrect email address or password. Please check your details and try again.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Please verify your email address before signing in. Check your inbox for the confirmation link.';
  }
  if (normalized.includes('user already registered')) {
    return 'An account with this email address already exists. Sign in or reset your password instead.';
  }
  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return 'Too many authentication attempts. Please wait a minute and try again.';
  }
  if (normalized.includes('password should be at least')) {
    return 'Password must be at least 8 characters long.';
  }
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'Unable to connect to the authentication service. Check your internet connection and try again.';
  }

  return rawMessage || 'Authentication failed. Please try again.';
}

/**
 * Extracts field-level validation errors from a standard Stage 08 VALIDATION_ERROR payload.
 */
export function extractFieldErrors(error?: ApiErrorPayload | null): Record<string, string> {
  if (!error || error.code !== 'VALIDATION_ERROR' || !error.details) {
    return {};
  }

  const out: Record<string, string> = {};
  const issues = error.details.issues;
  if (Array.isArray(issues)) {
    for (const issue of issues) {
      if (issue && typeof issue === 'object') {
        const record = issue as { path?: unknown; message?: unknown };
        const path = Array.isArray(record.path)
          ? record.path.map(String).join('.')
          : typeof record.path === 'string'
            ? record.path
            : '';
        if (path && typeof record.message === 'string') {
          out[path] = record.message;
        }
      }
    }
  }
  return out;
}
