// @vitest-environment node
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadServerEnv } from '../../server/config/env.ts';
import { createApiApp } from '../../server/index.ts';

describe('Foundation Tenant & Authorization Security Boundary', () => {
  const app = createApiApp(loadServerEnv({ NODE_ENV: 'test', APP_ENV: 'test' }));

  it('rejects requests without Bearer token with 401 UNAUTHENTICATED', async () => {
    const res = await request(app).get('/api/v1/tenant/check');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects malformed X-Business-ID headers with 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/v1/tenant/check')
      .set('Authorization', 'Bearer dummy-token')
      .set('X-Business-ID', 'not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('fails closed (403 PERMISSION_DENIED) even when valid-format Bearer and X-Business-ID are forged', async () => {
    const res = await request(app)
      .get('/api/v1/tenant/check')
      .set('Authorization', 'Bearer forged-unverified-token')
      .set('X-Business-ID', '11111111-1111-4111-8111-111111111111');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('PERMISSION_DENIED');
  });
});
