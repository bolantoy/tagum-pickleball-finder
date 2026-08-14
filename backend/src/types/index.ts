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

  // Number of physical courts checked by the parser.
  // Example:
  // AP Grounds = 2
  // Big J Apokon = 2
  // Big J Mankilam = 8 (based on the current API response)
  courtsChecked: number;

  slots: ParsedSlot[];
  sourceUrl: string | null;
  error: string | null;
}

export interface ParsedSlot {
  courtId?: string;
  courtName?: string;

  startTime: string;
  endTime: string;
  available: boolean;
  price: string | null;
}

export interface TimeSlot extends ParsedSlot {
  label: string;

  courtId?: string;
  courtName?: string;
}

export interface CourtAvailability {
  courtId: string;
  courtName: string;
  date: string;

  // Number of physical courts checked at this venue.
  courtsChecked: number;

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
