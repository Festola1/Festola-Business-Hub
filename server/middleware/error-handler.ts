import type { NextFunction, Request, Response } from 'express';

/**
 * Standard API error codes defined in System Architecture §7.4.
 */
export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'EMAIL_NOT_VERIFIED'
  | 'PERMISSION_DENIED'
  | 'DEVICE_REVOKED'
  | 'BUSINESS_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INSUFFICIENT_STOCK'
  | 'DUPLICATE_TRANSACTION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'CONFLICT'
  | 'CONCURRENT_MODIFICATION'
  | 'PAYMENT_VERIFICATION_FAILED'
  | 'WEBHOOK_SIGNATURE_INVALID'
  | 'SYNC_CONFLICT'
  | 'SUBSCRIPTION_LIMIT_REACHED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'INTERNAL_SERVER_ERROR';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ApiErrorCode;
  public readonly details: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, 'NOT_FOUND', 'The requested API resource was not found.'));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    if (err.statusCode === 429 && typeof err.details.retryAfterSeconds === 'number') {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(err.details.retryAfterSeconds))));
    }
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // Never leak raw stack traces, SQL errors, or credentials to clients.
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected server error occurred.',
      details: {},
    },
  });
}
