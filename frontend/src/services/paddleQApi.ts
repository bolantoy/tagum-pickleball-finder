import axios, { type AxiosError, type AxiosRequestConfig } from "axios";
import { createConfiguredApiClient } from "./api";
import type {
  CompletePaddleGameInput,
  CreatePaddleSessionInput,
  CreatePaddleSessionResponse,
  PaddleForcedGame,
  PaddleGameWithPlayers,
  PaddlePlayerJoinResponse,
  PaddleRotationRecommendation,
  PaddleRotationRequest,
  PaddleSession,
  PaddleSessionPlayer,
  PaddleSessionStatistics,
  PaddlePlayerStatistics,
  UpdatePaddleSessionInput,
} from "../types/paddleQ";

interface PaddleQApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string } | string;
}

/** Safe, structured Paddle Q error. It never stores request config or headers. */
export class PaddleQApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = "PaddleQApiError";
  }
}

// A dedicated instance uses the existing app API configuration while keeping
// the availability client's error behavior unchanged.
const paddleQClient = createConfiguredApiClient();

const basePath = "/paddle-sessions";

function normalizeError(error: unknown): PaddleQApiError {
  if (axios.isAxiosError(error)) {
    const response = error as AxiosError<PaddleQApiEnvelope<unknown>>;
    const apiError = response.response?.data?.error;
    if (apiError && typeof apiError === "object") {
      return new PaddleQApiError(
        apiError.message || "Paddle Q request failed",
        apiError.code || "PADDLE_Q_ERROR",
        response.response?.status ?? 0
      );
    }
    if (typeof apiError === "string") {
      return new PaddleQApiError(apiError, "PADDLE_Q_ERROR", response.response?.status ?? 0);
    }
    return new PaddleQApiError(
      response.response ? "Paddle Q request failed" : "Unable to reach Paddle Q service",
      response.response ? "PADDLE_Q_ERROR" : "NETWORK_ERROR",
      response.response?.status ?? 0
    );
  }
  return new PaddleQApiError("Paddle Q request failed", "PADDLE_Q_ERROR", 0);
}

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await paddleQClient.request<PaddleQApiEnvelope<T>>(config);
    if (!response.data?.success || response.data.data === undefined) {
      throw new PaddleQApiError("Paddle Q returned an invalid response", "INVALID_RESPONSE", response.status);
    }
    return response.data.data;
  } catch (error) {
    if (error instanceof PaddleQApiError) throw error;
    throw normalizeError(error);
  }
}

function organizerHeaders(capability: string) {
  return { Authorization: `PaddleQ ${capability}` };
}

function playerHeaders(credential: string) {
  return { "X-PaddleQ-Player-Credential": credential };
}

export const paddleQApi = {
  createSession(input: CreatePaddleSessionInput): Promise<CreatePaddleSessionResponse> {
    return request({ method: "POST", url: basePath, data: input });
  },

  getSession(sessionId: string): Promise<PaddleSession> {
    return request({ method: "GET", url: `${basePath}/${encodeURIComponent(sessionId)}` });
  },

  updateSession(sessionId: string, capability: string, patch: UpdatePaddleSessionInput): Promise<PaddleSession> {
    return request({ method: "PATCH", url: `${basePath}/${encodeURIComponent(sessionId)}`, headers: organizerHeaders(capability), data: patch });
  },

  rotateOrganizerCapability(sessionId: string, capability: string): Promise<{ organizerSecret: string }> {
    return request({
      method: "POST",
      url: `${basePath}/${encodeURIComponent(sessionId)}/organizer-capability/rotate`,
      headers: organizerHeaders(capability),
    });
  },

  revokeOrganizerCapability(sessionId: string, capability: string): Promise<{ revoked: boolean }> {
    return request({
      method: "POST",
      url: `${basePath}/${encodeURIComponent(sessionId)}/organizer-capability/revoke`,
      headers: organizerHeaders(capability),
    });
  },

  joinPlayer(sessionId: string, displayName: string): Promise<PaddlePlayerJoinResponse> {
    return request({ method: "POST", url: `${basePath}/${encodeURIComponent(sessionId)}/players`, data: { displayName } });
  },

  addManagedPlayer(sessionId: string, capability: string, displayName: string): Promise<{ player: PaddleSessionPlayer }> {
    return request({
      method: "POST",
      url: `${basePath}/${encodeURIComponent(sessionId)}/players/manage`,
      headers: organizerHeaders(capability),
      data: { displayName },
    });
  },

  rejoinPlayer(sessionId: string, playerId: string, credential: string): Promise<PaddleSessionPlayer> {
    return request({
      method: "POST",
      url: `${basePath}/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(playerId)}/rejoin`,
      headers: playerHeaders(credential),
    });
  },

  pausePlayer(sessionId: string, playerId: string, capability: string): Promise<PaddleSessionPlayer> {
    return request({
      method: "POST",
      url: `${basePath}/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(playerId)}/pause`,
      headers: organizerHeaders(capability),
    });
  },

  removePlayer(sessionId: string, playerId: string, capability: string): Promise<PaddleSessionPlayer> {
    return request({
      method: "POST",
      url: `${basePath}/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(playerId)}/remove`,
      headers: organizerHeaders(capability),
    });
  },

  getQueue(sessionId: string): Promise<PaddleSessionPlayer[]> {
    return request({ method: "GET", url: `${basePath}/${encodeURIComponent(sessionId)}/queue` });
  },

  movePlayer(sessionId: string, playerId: string, position: number, capability: string): Promise<PaddleSessionPlayer[]> {
    return request({
      method: "PATCH",
      url: `${basePath}/${encodeURIComponent(sessionId)}/queue/${encodeURIComponent(playerId)}`,
      headers: organizerHeaders(capability),
      data: { position },
    });
  },

  skipPlayer(sessionId: string, playerId: string, capability: string): Promise<PaddleSessionPlayer[]> {
    return request({
      method: "POST",
      url: `${basePath}/${encodeURIComponent(sessionId)}/queue/${encodeURIComponent(playerId)}/skip`,
      headers: organizerHeaders(capability),
    });
  },

  recommendRotation(sessionId: string, input: PaddleRotationRequest = {}): Promise<PaddleRotationRecommendation> {
    return request({ method: "POST", url: `${basePath}/${encodeURIComponent(sessionId)}/rotation/recommendation`, data: input });
  },

  getCurrentGames(sessionId: string): Promise<PaddleGameWithPlayers[]> {
    return request({ method: "GET", url: `${basePath}/${encodeURIComponent(sessionId)}/games/current` });
  },

  getGameHistory(sessionId: string): Promise<PaddleGameWithPlayers[]> {
    return request({ method: "GET", url: `${basePath}/${encodeURIComponent(sessionId)}/games` });
  },

  startRecommendedRound(sessionId: string, capability: string, input: PaddleRotationRequest = {}): Promise<PaddleGameWithPlayers[]> {
    return request({
      method: "POST",
      url: `${basePath}/${encodeURIComponent(sessionId)}/games/recommended`,
      headers: organizerHeaders(capability),
      data: input,
    });
  },

  startForcedGames(sessionId: string, capability: string, games: PaddleForcedGame[]): Promise<PaddleGameWithPlayers[]> {
    return request({
      method: "POST",
      url: `${basePath}/${encodeURIComponent(sessionId)}/games`,
      headers: organizerHeaders(capability),
      data: { games },
    });
  },

  completeGame(sessionId: string, gameId: string, capability: string, scores: CompletePaddleGameInput): Promise<PaddleGameWithPlayers> {
    return request({
      method: "POST",
      url: `${basePath}/${encodeURIComponent(sessionId)}/games/${encodeURIComponent(gameId)}/complete`,
      headers: organizerHeaders(capability),
      data: scores,
    });
  },

  cancelGame(sessionId: string, gameId: string, capability: string): Promise<PaddleGameWithPlayers> {
    return request({
      method: "POST",
      url: `${basePath}/${encodeURIComponent(sessionId)}/games/${encodeURIComponent(gameId)}/cancel`,
      headers: organizerHeaders(capability),
    });
  },

  getSessionStatistics(sessionId: string): Promise<PaddleSessionStatistics> {
    return request({ method: "GET", url: `${basePath}/${encodeURIComponent(sessionId)}/statistics` });
  },

  getPlayerStatistics(sessionId: string, playerId: string): Promise<PaddlePlayerStatistics> {
    return request({
      method: "GET",
      url: `${basePath}/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(playerId)}/statistics`,
    });
  },
};
