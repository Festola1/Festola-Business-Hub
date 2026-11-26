import fs from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import { createPool, isCloudSqlConfigured } from '../../src/db/index.ts';
import type { ServerEnv } from '../config/env.ts';
import { ApiError } from '../middleware/error-handler.ts';

export interface DbPoolHandle {
  pool: Pool;
  withUserTransaction: <T>(userId: string, fn: (client: PoolClient) => Promise<T>) => Promise<T>;
  withTenantTransaction: <T>(
    businessId: string,
    userId: string,
    fn: (client: PoolClient) => Promise<T>,
  ) => Promise<T>;
  close: () => Promise<void>;
}

function isCloudSqlSocketAvailable(host: string | undefined): boolean {
  if (!host) return false;
  if (!host.startsWith('/')) return true;
  try {
    return fs.existsSync(host);
  } catch {
    return false;
  }
}

/**
 * Creates a PostgreSQL connection pool with transaction-scoped tenant/user context helpers.
 * Uses Object Method (`host`, `user`, `password`, `database`) for Cloud SQL PostgreSQL.
 * If an explicit `DATABASE_URL` is configured and the Cloud SQL Unix socket is absent,
 * uses `DATABASE_URL` cleanly instead of failing on a stale socket path.
 * Uses set_config(..., true) so app.current_business_id and app.current_user_id
 * are strictly local to the active transaction and can never leak across pooled clients.
 */
export function createDbPool(env: ServerEnv): DbPoolHandle | null {
  let pool: Pool;
  let sharedGlobalPool = false;

  const cloudSqlReady = isCloudSqlConfigured(env) && isCloudSqlSocketAvailable(env.SQL_HOST);

  if (cloudSqlReady) {
    const matchesProcessEnv =
      env.SQL_HOST === process.env.SQL_HOST &&
      env.SQL_USER === process.env.SQL_USER &&
      env.SQL_DB_NAME === process.env.SQL_DB_NAME;

    if (matchesProcessEnv) {
      pool = createPool();
      sharedGlobalPool = true;
    } else {
      pool = new Pool({
        host: env.SQL_HOST,
        user: env.SQL_USER,
        password: env.SQL_PASSWORD,
        database: env.SQL_DB_NAME,
        max: 10,
        connectionTimeoutMillis: 15_000,
      });
      pool.on('error', (err) => {
        console.error('Unexpected error on idle SQL pool client:', err);
      });
    }
  } else if (env.DATABASE_URL) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL pool client:', err);
    });
  } else if (isCloudSqlConfigured(env)) {
    pool = createPool();
    sharedGlobalPool = true;
  } else {
    return null;
  }

  async function withUserTransaction<T>(
    userId: string,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_business_id', '', true)`);
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function withTenantTransaction<T>(
    businessId: string,
    userId: string,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_business_id', $1, true)`, [businessId]);
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    pool,
    withUserTransaction,
    withTenantTransaction,
    close: async () => {
      if (!sharedGlobalPool) {
        await pool.end();
      }
    },
  };
}

export function requireDbPool(handle: DbPoolHandle | null): DbPoolHandle {
  if (!handle) {
    throw new ApiError(
      503 as number,
      'INTERNAL_SERVER_ERROR',
      'Database connection is not configured for this environment.',
    );
  }
  return handle;
}
