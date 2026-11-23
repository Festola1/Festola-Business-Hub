// @vitest-environment node
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadServerEnv } from '../../server/config/env.ts';
import { createApiApp } from '../../server/index.ts';

describe('GET /api/v1/health', () => {
  it('returns 200 OK with safe operational metadata and zero leaked secrets', async () => {
    const env = loadServerEnv({
      NODE_ENV: 'test',
      APP_ENV: 'test',
      PORT: '3000',
      SUPABASE_SERVICE_ROLE_KEY: 'super-secret-service-role-key-do-not-leak',
      DATABASE_URL: 'postgresql://user:super-secret-db-pass@localhost:5432/festola',
    });

    const app = createApiApp(env);
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.app).toBe('festola-business-hub');
    expect(res.body.data.environment).toBe('test');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-request-id']).toBeTruthy();

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('super-secret-service-role-key-do-not-leak');
    expect(serialized).not.toContain('super-secret-db-pass');
  });

  it('returns standard Arch §7.4 error envelope for unknown /api/v1 routes', async () => {
    const app = createApiApp(loadServerEnv({ NODE_ENV: 'test', APP_ENV: 'test' }));
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested API resource was not found.',
        details: {},
      },
    });
  });
});
