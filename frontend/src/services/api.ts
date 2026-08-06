// ─── API Service ──────────────────────────────────────────────────────────────
// Wraps all backend calls. All methods throw ApiError on failure.

import axios, { AxiosInstance, AxiosError } from "axios";
import { Config } from "../constants/config";
import {
  Court,
  AvailabilityResponse,
  ApiResponse,
} from "../../../shared/types";

// ── Axios instance ─────────────────────────────────────────────────────────────
const client: AxiosInstance = axios.create({
  baseURL: Config.API_BASE_URL,
  timeout: Config.REQUEST_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ── Response interceptor — unwrap or throw ─────────────────────────────────────
client.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse<unknown>>) => {
    const message =
      error.response?.data?.error ||
      error.message ||
      "An unexpected error occurred";
    throw new Error(message);
  }
);

// ── API Methods ────────────────────────────────────────────────────────────────

/**
 * Fetches all active courts.
 */
export async function fetchCourts(): Promise<Court[]> {
  const { data } = await client.get<ApiResponse<Court[]>>("/courts");
  return data.data ?? [];
}

/**
 * Fetches a single court by ID.
 */
export async function fetchCourtById(id: string): Promise<Court> {
  const { data } = await client.get<ApiResponse<Court>>(`/court/${id}`);
  if (!data.data) throw new Error("Court not found");
  return data.data;
}

/**
 * Fetches merged availability across all courts for a given date.
 * @param date - "YYYY-MM-DD"
 */
export async function fetchAvailability(date: string): Promise<AvailabilityResponse & { grouped: any[] }> {
  const { data } = await client.get<ApiResponse<AvailabilityResponse & { grouped: any[] }>>(
    `/availability?date=${encodeURIComponent(date)}`
  );
  if (!data.data) throw new Error("No availability data returned");
  return data.data;
}

/**
 * Checks backend health.
 */
export async function checkHealth(): Promise<{ status: string }> {
  const { data } = await client.get("/health");
  return data;
}
