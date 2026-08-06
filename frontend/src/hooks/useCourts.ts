// ─── useCourts Hook ───────────────────────────────────────────────────────────
// Encapsulates court list fetching with loading and error state.

import { useCallback, useEffect, useState } from "react";
import { fetchCourts } from "../services/api";
import { Court } from "../../../shared/types";

interface UseCourtResult {
  courts: Court[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCourts(): UseCourtResult {
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCourts();
      setCourts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load courts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { courts, loading, error, refresh: load };
}
