import { Pool, type PoolClient } from 'pg';
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

/**
 * Creates a PostgreSQL connection pool with transaction-scoped RLS helpers.
 * Uses set_config(..., true) so app.current_business_id and app.current_user_id
 * are strictly local to the active transaction and can never leak across pooled clients.
 */
export function createDbPool(env: ServerEnv): DbPoolHandle | null {
  if (!env.DATABASE_URL) {
    return null;
  }

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

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
      await client.query(`SELECT set_config('app.current_user_id', $2, true)`, [userId]);
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
    close: () => pool.end(),
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
