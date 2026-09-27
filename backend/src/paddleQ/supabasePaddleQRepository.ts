import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaddleGame, PaddleSession, PaddleSessionPlayer } from "./types";
import type {
  CreatePaddleSessionInput,
  PaddleGameWithPlayers,
  PaddleQRepository,
  PaddleSessionRecord,
} from "./paddleQService";
import type { ForcedPaddleGame } from "./rotationEngine";

export class PaddleQPersistenceError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "PaddleQPersistenceError";
  }
}

type DbRow = Record<string, any>;

function mapSession(row: DbRow): PaddleSession {
  return {
    id: row.id,
    venueId: row.venue_id,
    sessionDate: row.session_date,
    startTime: row.start_time,
    endTime: row.end_time,
    courtCount: row.court_count,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSessionRecord(row: DbRow): PaddleSessionRecord {
  return { ...mapSession(row), organizerSecretHash: row.organizer_secret_hash };
}

function mapPlayer(row: DbRow): PaddleSessionPlayer {
  return {
    id: row.id,
    sessionId: row.session_id,
    displayName: row.display_name,
    state: row.state,
    queuePosition: row.queue_position,
    joinedAt: row.joined_at,
    inactiveAt: row.inactive_at,
    removedAt: row.removed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGame(row: DbRow): PaddleGameWithPlayers {
  return {
    id: row.id,
    sessionId: row.session_id,
    gameNumber: row.game_number,
    courtNumber: row.court_number,
    team1Score: row.team_1_score,
    team2Score: row.team_2_score,
    winnerTeam: row.winner_team,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    participants: (row.participants ?? []).map((participant: DbRow) => ({
      id: participant.id,
      sessionId: participant.session_id,
      gameId: participant.game_id,
      sessionPlayerId: participant.session_player_id,
      teamNumber: participant.team_number,
      player: mapPlayer(participant.player),
    })),
  };
}

function sanitizeDatabaseError(error: { code?: string; message?: string }): PaddleQPersistenceError {
  const code = error.code;
  if (code === "P0002") return new PaddleQPersistenceError("Paddle Q record not found", code);
  if (code === "42501") return new PaddleQPersistenceError("Organizer capability is invalid", code);
  if (code === "23505") return new PaddleQPersistenceError("A conflicting Paddle Q record already exists", code);
  if (code === "23514" || code === "22023") return new PaddleQPersistenceError("Paddle Q data failed validation", code);
  // Do not surface SQL text/details or database messages to service callers.
  return new PaddleQPersistenceError("Paddle Q database operation failed", code);
}

export class SupabasePaddleQRepository implements PaddleQRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw sanitizeDatabaseError(error);
    return data as T;
  }

  async createSession(input: CreatePaddleSessionInput & { organizerSecretHash: string }): Promise<PaddleSession> {
    const row = await this.rpc<DbRow>("paddleq_create_session", {
      p_venue_id: input.venueId,
      p_session_date: input.sessionDate,
      p_start_time: input.startTime,
      p_end_time: input.endTime ?? null,
      p_court_count: input.courtCount,
      p_organizer_secret_hash: input.organizerSecretHash,
    });
    return mapSession(row);
  }

  async getSession(sessionId: string): Promise<PaddleSessionRecord | null> {
    const { data, error } = await this.client.from("paddle_sessions").select("*").eq("id", sessionId).maybeSingle();
    if (error) throw sanitizeDatabaseError(error);
    return data ? mapSessionRecord(data as DbRow) : null;
  }

  async updateSession(
    sessionId: string,
    expectedHash: string,
    patch: Partial<Pick<PaddleSession, "sessionDate" | "startTime" | "endTime" | "courtCount" | "status">>
  ): Promise<PaddleSession> {
    const row = await this.rpc<DbRow>("paddleq_update_session", {
      p_session_id: sessionId,
      p_expected_hash: expectedHash,
      p_patch: {
        ...(patch.sessionDate !== undefined ? { session_date: patch.sessionDate } : {}),
        ...(patch.startTime !== undefined ? { start_time: patch.startTime } : {}),
        ...(patch.endTime !== undefined ? { end_time: patch.endTime } : {}),
        ...(patch.courtCount !== undefined ? { court_count: patch.courtCount } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      },
    });
    return mapSession(row);
  }

  async replaceOrganizerHash(sessionId: string, expectedHash: string | null, nextHash: string | null): Promise<void> {
    await this.rpc("paddleq_replace_organizer_hash", {
      p_session_id: sessionId,
      p_expected_hash: expectedHash,
      p_next_hash: nextHash,
    });
  }

  async addOrRejoinPlayer(sessionId: string, expectedHash: string, displayName: string, playerCredentialHash: string): Promise<PaddleSessionPlayer> {
    return mapPlayer(await this.rpc<DbRow>("paddleq_add_or_rejoin_player", {
      p_session_id: sessionId, p_expected_hash: expectedHash, p_display_name: displayName,
      p_player_credential_hash: playerCredentialHash,
    }));
  }

  async joinPlayer(sessionId: string, displayName: string, playerCredentialHash: string): Promise<PaddleSessionPlayer> {
    return mapPlayer(await this.rpc<DbRow>("paddleq_join_player", {
      p_session_id: sessionId,
      p_display_name: displayName,
      p_player_credential_hash: playerCredentialHash,
    }));
  }

  async getPlayerCredentialHash(sessionId: string, playerId: string): Promise<string | null> {
    const { data, error } = await this.client.from("paddle_session_players")
      .select("player_credential_hash").eq("session_id", sessionId).eq("id", playerId).maybeSingle();
    if (error) throw sanitizeDatabaseError(error);
    return data?.player_credential_hash ?? null;
  }

  async rejoinPlayer(sessionId: string, playerId: string, expectedCredentialHash: string): Promise<PaddleSessionPlayer> {
    return mapPlayer(await this.rpc<DbRow>("paddleq_rejoin_player", {
      p_session_id: sessionId,
      p_player_id: playerId,
      p_expected_player_credential_hash: expectedCredentialHash,
    }));
  }

  async setPlayerInactive(sessionId: string, expectedHash: string, playerId: string, removed: boolean): Promise<PaddleSessionPlayer> {
    return mapPlayer(await this.rpc<DbRow>("paddleq_set_player_inactive", {
      p_session_id: sessionId, p_expected_hash: expectedHash, p_player_id: playerId, p_removed: removed,
    }));
  }

  async movePlayer(sessionId: string, expectedHash: string, playerId: string, position: number): Promise<PaddleSessionPlayer[]> {
    const rows = await this.rpc<DbRow[]>("paddleq_move_player", {
      p_session_id: sessionId, p_expected_hash: expectedHash, p_player_id: playerId, p_position: position,
    });
    return rows.map(mapPlayer);
  }

  async skipPlayer(sessionId: string, expectedHash: string, playerId: string): Promise<PaddleSessionPlayer[]> {
    const rows = await this.rpc<DbRow[]>("paddleq_skip_player", {
      p_session_id: sessionId, p_expected_hash: expectedHash, p_player_id: playerId,
    });
    return rows.map(mapPlayer);
  }

  async getPlayers(sessionId: string): Promise<PaddleSessionPlayer[]> {
    const { data, error } = await this.client.from("paddle_session_players").select("*")
      .eq("session_id", sessionId).order("queue_position", { ascending: true, nullsFirst: false })
      .order("joined_at", { ascending: true });
    if (error) throw sanitizeDatabaseError(error);
    return (data ?? []).map((row) => mapPlayer(row as DbRow));
  }

  async getGames(sessionId: string): Promise<PaddleGameWithPlayers[]> {
    const { data, error } = await this.client.from("paddle_games")
      .select("*, participants:paddle_game_players(*, player:paddle_session_players(*))")
      .eq("session_id", sessionId).order("game_number", { ascending: true });
    if (error) throw sanitizeDatabaseError(error);
    return (data ?? []).map((row) => mapGame(row as DbRow));
  }

  async startGames(sessionId: string, expectedHash: string, games: ForcedPaddleGame[]): Promise<PaddleGameWithPlayers[]> {
    const ids = await this.rpc<string[]>("paddleq_start_games", {
      p_session_id: sessionId,
      p_expected_hash: expectedHash,
      p_games: games.map((game) => ({
        court_number: game.courtNumber,
        team1_player_ids: game.team1PlayerIds,
        team2_player_ids: game.team2PlayerIds,
      })),
    });
    const created = new Set(ids);
    return (await this.getGames(sessionId)).filter((game) => created.has(game.id));
  }

  async completeGame(sessionId: string, expectedHash: string, gameId: string, score1: number, score2: number): Promise<PaddleGameWithPlayers> {
    const completedId = await this.rpc<string>("paddleq_complete_game", {
      p_session_id: sessionId,
      p_expected_hash: expectedHash,
      p_game_id: gameId,
      p_team_1_score: score1,
      p_team_2_score: score2,
    });
    const game = (await this.getGames(sessionId)).find((item) => item.id === completedId);
    if (!game) throw new PaddleQPersistenceError("Paddle Q game was not found after completion");
    return game;
  }

  async cancelGame(sessionId: string, expectedHash: string, gameId: string): Promise<PaddleGameWithPlayers> {
    const cancelledId = await this.rpc<string>("paddleq_cancel_game", {
      p_session_id: sessionId, p_expected_hash: expectedHash, p_game_id: gameId,
    });
    const game = (await this.getGames(sessionId)).find((item) => item.id === cancelledId);
    if (!game) throw new PaddleQPersistenceError("Paddle Q game was not found after cancellation");
    return game;
  }
}

/** Use this factory only from backend Paddle Q composition; never from the mobile app. */
export function createSupabasePaddleQRepository(): SupabasePaddleQRepository {
  // Lazy import avoids initializing a second client until Paddle Q persistence is used.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getServiceRoleClient } = require("../database/supabase") as typeof import("../database/supabase");
  return new SupabasePaddleQRepository(getServiceRoleClient());
}
