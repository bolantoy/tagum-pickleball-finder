// ─── Supabase Client ──────────────────────────────────────────────────────────
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../utils/logger";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  logger.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables");
  process.exit(1);
}

/**
 * Singleton Supabase client for database operations.
 * Uses the anon key — suitable for server-side reads.
 * Use the service role key (via SUPABASE_SERVICE_ROLE_KEY) only for admin ops.
 */
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
    },
  }
);

/**
 * Returns a Supabase client authenticated with the service role key.
 * Use only for privileged operations (e.g., seeding courts).
 */
export function getServiceRoleClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
