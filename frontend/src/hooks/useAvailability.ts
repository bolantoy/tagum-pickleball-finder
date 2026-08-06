// ─── useAvailability Hook ─────────────────────────────────────────────────────
// Encapsulates availability fetching logic for reuse across screens.

import { useCallback, useState } from "react";
import { fetchAvailability } from "../services/api";
import { AvailabilityResponse, GroupedAvailability } from "../../../shared/types";

interface UseAvailabilityResult {
  data: (AvailabilityResponse & { grouped: GroupedAvailability[] }) | null;
  loading: boolean;
  error: string | null;
  fetch: (date: string) => Promise<void>;
  reset: () => void;
}

export function useAvailability(): UseAvailabilityResult {
  const [data, setData] = useState<
    (AvailabilityResponse & { grouped: GroupedAvailability[] }) | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAvailability(date);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch availability");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, fetch, reset };
}
