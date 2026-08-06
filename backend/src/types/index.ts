// ─── Backend-specific Types ───────────────────────────────────────────────────
// These extend/complement the shared types for backend use.

export interface DatabaseCourt {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  website: string | null;
  phone: string | null;
  facebook: string | null;
  image: string | null;
  active: boolean;
  parser_name: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ParserConfig {
  courtId: string;
  courtName: string;
  baseUrl: string;
  parserName: string;
}

export interface ParseResult {
  courtId: string;
  courtName: string;
  date: string;
  slots: ParsedSlot[];
  sourceUrl: string | null;
  error: string | null;
}

export interface ParsedSlot {
  startTime: string;  // "08:00" 24h format
  endTime: string;    // "09:00" 24h format
  available: boolean;
  price: string | null;
}

export interface TimeSlot extends ParsedSlot {
  label: string;
}

export interface CourtAvailability {
  courtId: string;
  courtName: string;
  date: string;
  slots: TimeSlot[];
  sourceUrl: string | null;
  lastChecked: string;
  error: string | null;
}

export interface AvailabilityResponse {
  date: string;
  results: CourtAvailability[];
  fetchedAt: string;
}

export interface GroupedAvailability {
  time: string;
  courts: {
    courtId: string;
    courtName: string;
    available: boolean;
    price: string | null;
  }[];
}

export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  uptime: number;
  environment: string;
}
