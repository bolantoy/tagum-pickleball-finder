import type {
  PaddleGame,
  PaddleGamePlayer,
  PaddleSession,
  PaddleSessionPlayer,
  PaddleTeamNumber,
} from "../../../shared/types";

export interface PaddleGameWithPlayers extends PaddleGame {
  participants: Array<PaddleGamePlayer & { player: PaddleSessionPlayer }>;
}

export interface CreatePaddleSessionInput {
  venueId: string;
  sessionDate: string;
  startTime: string;
  endTime?: string | null;
  courtCount: number;
}

export type UpdatePaddleSessionInput = Partial<Pick<
  PaddleSession,
  "sessionDate" | "startTime" | "endTime" | "courtCount" | "status"
>>;

export interface CreatePaddleSessionResponse {
  session: PaddleSession;
  organizerSecret: string;
}

export interface PaddlePlayerJoinResponse {
  player: PaddleSessionPlayer;
  playerCredential: string;
}

export interface PaddleForcedGame {
  courtNumber: number;
  team1PlayerIds: [string, string];
  team2PlayerIds: [string, string];
}

export interface PaddleRotationRequest {
  constraints?: {
    requiredPlayerIds?: string[];
    excludedPlayerIds?: string[];
    forcedGames?: PaddleForcedGame[];
  };
  courtsToPlay?: number;
}

export interface PaddleRotationPlayer {
  id: string;
  displayName: string;
  state: "waiting" | "playing" | "inactive";
  queuePosition: number | null;
  joinedAt: string;
  gamesPlayed: number;
}

export interface PaddleCourtRecommendation {
  courtNumber: number;
  team1: [PaddleRotationPlayer, PaddleRotationPlayer];
  team2: [PaddleRotationPlayer, PaddleRotationPlayer];
  reason: string;
}

export interface PaddleRotationRecommendation {
  courts: PaddleCourtRecommendation[];
  sittingOut: PaddleRotationPlayer[];
  metadata: {
    selectionPolicy: string;
    eligiblePlayerCount: number;
    selectedPlayerIds: string[];
    sittingOutPlayerIds: string[];
    selectedGameCounts: Array<{ playerId: string; gamesPlayed: number }>;
    partnerRepeatCost: number;
    opponentRepeatCost: number;
    tieBreakCandidates: number;
    availableCourtCount: number;
  };
}

export interface PaddlePlayerStatistics {
  playerId: string;
  displayName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  pointsScored: number;
  pointsConceded: number;
  partners: Array<{ playerId: string; displayName: string; games: number }>;
  opponents: Array<{ playerId: string; displayName: string; games: number }>;
}

export interface PaddleSessionStatistics {
  playerCount: number;
  courtCount: number;
  completedGames: number;
  durationMinutes: number | null;
  averageGamesPerPlayer: number;
  minimumGames: number;
  maximumGames: number;
  players: PaddlePlayerStatistics[];
  partnerships: Array<{ playerIds: [string, string]; games: number }>;
  matchups: Array<{ playerIds: [string, string]; games: number }>;
  fairness: {
    gameCountSpread: number;
    gameCounts: Array<{ playerId: string; gamesPlayed: number }>;
  };
}

export interface CompletePaddleGameInput {
  team1Score: number;
  team2Score: number;
}

export type { PaddleSession, PaddleSessionPlayer, PaddleGame, PaddleTeamNumber };
