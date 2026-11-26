import fs from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export function isCloudSqlConfigured(
  env: {
    SQL_HOST?: string;
    SQL_USER?: string;
    SQL_PASSWORD?: string;
    SQL_DB_NAME?: string;
  } = process.env,
): boolean {
  return Boolean(env.SQL_HOST && env.SQL_USER && env.SQL_PASSWORD && env.SQL_DB_NAME);
}

function hasAvailableSqlSocket(host: string | undefined): boolean {
  if (!host) return false;
  if (!host.startsWith('/')) return true;
  try {
    return fs.existsSync(host);
  } catch {
    return false;
  }
}

export const createPool = (): Pool => {
  if (!global._postgresPool) {
    const useConnectionString =
      Boolean(process.env.DATABASE_URL) &&
      (!isCloudSqlConfigured(process.env) || !hasAvailableSqlSocket(process.env.SQL_HOST));

    global._postgresPool = useConnectionString
      ? new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 10,
          connectionTimeoutMillis: 15000,
        })
      : new Pool({
          host: process.env.SQL_HOST,
          user: process.env.SQL_USER,
          password: process.env.SQL_PASSWORD,
          database: process.env.SQL_DB_NAME,
          max: 10,
          connectionTimeoutMillis: 15000,
        });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
