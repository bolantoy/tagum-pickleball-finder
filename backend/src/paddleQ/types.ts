export type PaddleSessionStatus = "scheduled" | "active" | "completed" | "cancelled";
export type PaddlePlayerState = "waiting" | "playing" | "inactive";
export type PaddleGameStatus = "in_progress" | "completed" | "cancelled";
export type PaddleTeamNumber = 1 | 2;

export interface PaddleSession {
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
  state: PaddlePlayerState;
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
