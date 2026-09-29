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

  // Physical court represented by this slot.
  // Example: Court 1, Court 2, etc.
  courtId?: string;
  courtName?: string;

  // Physical court type when provided by the booking source.
  courtType?: "indoor" | "outdoor";
}

export interface CourtAvailability {
  courtId: string;
  courtName: string;
  date: string;

  // Number of physical courts checked by the parser.
  courtsChecked: number;

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

/** Paddle Q domain types. Player and game history are scoped to one session. */
export type PaddleSessionStatus = "scheduled" | "active" | "completed" | "cancelled";
export type PaddleSessionPlayerState = "waiting" | "playing" | "inactive";
export type PaddleGameStatus = "in_progress" | "completed" | "cancelled";
export type PaddleTeamNumber = 1 | 2;

export interface PaddleSession {
  // The server-only organizer_secret_hash database field is intentionally omitted.
  id: string;
  venueId: string;
  sessionDate: string;
  startTime: string;
  endTime: string | null;
  courtCount: number;
  status: PaddleSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PaddleSessionPlayer {
  id: string;
  sessionId: string;
  displayName: string;
  state: PaddleSessionPlayerState;
  queuePosition: number | null;
  joinedAt: string;
  inactiveAt: string | null;
  removedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaddleGame {
  id: string;
  sessionId: string;
  gameNumber: number;
  courtNumber: number;
  team1Score: number | null;
  team2Score: number | null;
  winnerTeam: PaddleTeamNumber | null;
  status: PaddleGameStatus;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

export interface PaddleGamePlayer {
  id: string;
  sessionId: string;
  gameId: string;
  sessionPlayerId: string;
  teamNumber: PaddleTeamNumber;
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
