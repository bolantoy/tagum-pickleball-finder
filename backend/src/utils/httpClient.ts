// ─── HTTP Client ──────────────────────────────────────────────────────────────
// Wraps Axios with default config and retry logic for scraping requests.

import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { logger } from "./logger";

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Creates an Axios instance configured for web scraping.
 * Includes a realistic User-Agent to avoid bot-detection blocks.
 */
export function createHttpClient(baseURL?: string): AxiosInstance {
  return axios.create({
    baseURL,
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    },
  });
}

/**
 * Fetches a URL with simple retry logic.
 * @param url - Full URL to fetch
 * @param options - Optional Axios config
 * @param retries - Number of retry attempts (default: 2)
 */
export async function fetchWithRetry(
  url: string,
  options: AxiosRequestConfig = {},
  retries = 2
): Promise<string> {
  const client = createHttpClient();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.get<string>(url, {
        ...options,
        responseType: "text",
      });
      return response.data;
    } catch (err) {
      lastError = err as Error;
      if (attempt < retries) {
        const delay = 1000 * (attempt + 1);
        logger.warn(
          `Fetch attempt ${attempt + 1} failed for ${url}. Retrying in ${delay}ms...`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url}`);
}
