import { z } from 'zod';

const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_URL: z.string().url().optional().or(z.literal('')),
  SUPABASE_URL: z.string().url().optional().or(z.literal('')),
  SUPABASE_ANON_KEY: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  DATABASE_URL: z.string().optional().default(''),
  PAYSTACK_SECRET_KEY: z.string().optional().default(''),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional().default(''),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function loadServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const parsed = ServerEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid server environment configuration: ${issues}`);
  }
  return parsed.data;
}

/**
 * Returns non-sensitive operational metadata safe for diagnostics and health responses.
 * Never includes credentials, tokens, connection strings, or service-role keys.
 */
export function getSafeRuntimeSummary(env: ServerEnv) {
  return {
    app: 'festola-business-hub',
    environment: env.APP_ENV,
    supabaseConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
    databaseConfigured: Boolean(env.DATABASE_URL),
  };
}
