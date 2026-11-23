import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { clientEnv } from '../config/env';

let browserClient: SupabaseClient | null = null;

/**
 * Returns a browser-scoped Supabase client using the public ANON key ONLY.
 * Returns null until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured.
 * Privileged service-role keys are strictly forbidden in browser code.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!clientEnv.VITE_SUPABASE_URL || !clientEnv.VITE_SUPABASE_ANON_KEY) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(clientEnv.VITE_SUPABASE_URL, clientEnv.VITE_SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
}
