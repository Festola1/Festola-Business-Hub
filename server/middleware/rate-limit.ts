import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './error-handler.ts';
import type { TenantContextRequest } from './tenant-context.ts';

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiterStore {
  consume(key: string, maxRequests: number, windowMs: number): RateLimitDecision;
  reset?(): void;
}

export class InMemorySlidingWindowRateLimiter implements RateLimiterStore {
  private readonly buckets = new Map<string, number[]>();

  consume(key: string, maxRequests: number, windowMs: number): RateLimitDecision {
    const now = Date.now();
    const cutoff = now - windowMs;
    const existing = this.buckets.get(key) ?? [];
    const recent = existing.filter((ts) => ts > cutoff);

    if (recent.length >= maxRequests) {
      const oldest = recent[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      this.buckets.set(key, recent);
      return {
        allowed: false,
        limit: maxRequests,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    recent.push(now);
    this.buckets.set(key, recent);
    return {
      allowed: true,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - recent.length),
      retryAfterSeconds: 0,
    };
  }

  reset(): void {
    this.buckets.clear();
  }
}

export interface RateLimitOptions {
  bucketName: string;
  maxRequests: number;
  windowMs: number;
  store?: RateLimiterStore;
  keyGenerator?: (req: TenantContextRequest) => string;
}

function defaultKeyGenerator(bucketName: string, req: Request): string {
  const tenantReq = req as TenantContextRequest;
  const tenantId = tenantReq.tenantContext?.businessId ?? 'no-tenant';
  const actorId = tenantReq.authUser?.id ?? req.ip ?? 'anonymous';
  return `${bucketName}:${tenantId}:${actorId}`;
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  const store = options.store ?? new InMemorySlidingWindowRateLimiter();

  return (req: TenantContextRequest, res: Response, next: NextFunction): void => {
    const key = options.keyGenerator
      ? `${options.bucketName}:${options.keyGenerator(req)}`
      : defaultKeyGenerator(options.bucketName, req);

    const decision = store.consume(key, options.maxRequests, options.windowMs);
    res.setHeader('X-RateLimit-Limit', String(decision.limit));
    res.setHeader('X-RateLimit-Remaining', String(decision.remaining));

    if (!decision.allowed) {
      next(
        new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please slow down and try again.', {
          bucket: options.bucketName,
          retryAfterSeconds: decision.retryAfterSeconds,
        }),
      );
      return;
    }

    next();
  };
}
