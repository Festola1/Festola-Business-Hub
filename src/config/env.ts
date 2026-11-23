import { z } from 'zod';

/**
 * Strictly browser-safe environment variables (VITE_* prefix ONLY).
 * Never add service-role keys, database URLs, or payment secrets here.
 */
const ClientEnvSchema = z.object({
  VITE_APP_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  VITE_APP_URL: z.string().url().optional().or(z.literal('')),
  VITE_SUPABASE_URL: z.string().url().optional().or(z.literal('')),
  VITE_SUPABASE_ANON_KEY: z.string().optional().default(''),
});

export type ClientEnv = z.infer<typeof ClientEnvSchema>;

export function loadClientEnv(
  source: Record<string, unknown> = import.meta.env as Record<string, unknown>,
): ClientEnv {
  const parsed = ClientEnvSchema.safeParse(source);
  if (!parsed.success) {
    return {
      VITE_APP_ENV: 'development',
      VITE_APP_URL: '',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    };
  }
  return parsed.data;
}

export const clientEnv = loadClientEnv();
