import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.header('X-Request-ID') || crypto.randomUUID();
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
}
