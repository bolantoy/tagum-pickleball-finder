// ─── Courts Service ────────────────────────────────────────────────────────────
// Business logic for fetching court data from Supabase.

import { supabase } from "../database/supabase";
import { DatabaseCourt } from "../types";
import { logger } from "../utils/logger";
import { createError } from "../middleware/errorHandler";

/**
 * Fetches all active courts from Supabase.
 */
export async function getAllCourts(): Promise<DatabaseCourt[]> {
  const { data, error } = await supabase
    .from("courts")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) {
      console.error("FULL SUPABASE ERROR:");
      console.dir(error, { depth: null });

      logger.error("Supabase getAllCourts error:", error);

      throw createError(
          `Database error: ${error.message}`,
          500
      );
  }

  return data ?? [];
  }

/**
 * Fetches a single court by its UUID.
 */
export async function getCourtById(id: string): Promise<DatabaseCourt | null> {
  const { data, error } = await supabase
    .from("courts")
    .select("*")
    .eq("id", id)
    .eq("active", true)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No rows returned — court not found
      return null;
    }
    logger.error(`Supabase getCourtById error for id=${id}:`, error);
    throw createError(`Database error: ${error.message}`, 500);
  }

  return data;
}

/**
 * Fetches all courts that have a parser_name configured (i.e., can be scraped).
 */
export async function getParsableCourts(): Promise<DatabaseCourt[]> {
  const { data, error } = await supabase
    .from("courts")
    .select("*")
    .eq("active", true)
    .not("parser_name", "is", null);

  if (error) {
    logger.error("Supabase getParsableCourts error:", error);
    throw createError(`Database error: ${error.message}`, 500);
  }

  return data ?? [];
}
