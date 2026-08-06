// ─── Shared Types ────────────────────────────────────────────────────────────
// Used by both the backend and frontend for type safety consistency.

export interface Court {
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
  parserName: string | null;
}

export interface TimeSlot {
  startTime: string; // "08:00"
  endTime: string;   // "09:00"
  label: string;     // "8:00 AM – 9:00 AM"
  available: boolean;
  price: string | null; // e.g. "₱150" or null if not provided
}

export interface CourtAvailability {
  courtId: string;
  courtName: string;
  date: string;       // "YYYY-MM-DD"
  slots: TimeSlot[];
  sourceUrl: string | null;
  lastChecked: string; // ISO timestamp
  error: string | null;
}

export interface AvailabilityResponse {
  date: string;
  results: CourtAvailability[];
  fetchedAt: string;
}

export interface GroupedAvailability {
  time: string;       // "8:00 AM"
  courts: {
    courtId: string;
    courtName: string;
    available: boolean;
    price: string | null;
  }[];
}

export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
