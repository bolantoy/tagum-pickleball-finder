import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { PaddleGame, PaddleGamePlayer, PaddleSession, PaddleSessionPlayer, PaddleTeamNumber } from "./types";
import {
  recommendPaddleRotation,
  type ForcedPaddleGame,
  type PaddleRandomSource,
  type PaddleRotationRecommendation,
} from "./rotationEngine";

const scrypt = promisify(scryptCallback);

export class PaddleQServiceError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = "PaddleQServiceError";
  }
}

export interface PaddleSessionRecord extends PaddleSession {
  organizerSecretHash: string;
}

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

export interface PaddlePlayerJoinResult {
  player: PaddleSessionPlayer;
  /** Returned only by the successful join operation; never stored in the player row. */
  playerCredential: string;
}

export interface PaddleSessionStatistics {
  playerCount: number;
  courtCount: number;
  completedGames: number;
  durationMinutes: number | null;
  averageGamesPerPlayer: number;
  minimumGames: number;
  maximumGames: number;
  players: Array<{
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
  }>;
  partnerships: Array<{ playerIds: [string, string]; games: number }>;
  matchups: Array<{ playerIds: [string, string]; games: number }>;
  fairness: { gameCountSpread: number; gameCounts: Array<{ playerId: string; gamesPlayed: number }> };
}

/** Persistence boundary. Transactional mutations are implemented as PostgreSQL RPCs. */
export interface PaddleQRepository {
  createSession(input: CreatePaddleSessionInput & { organizerSecretHash: string }): Promise<PaddleSession>;
  getSession(sessionId: string): Promise<PaddleSessionRecord | null>;
  updateSession(sessionId: string, expectedHash: string, patch: Partial<Pick<PaddleSession, "sessionDate" | "startTime" | "endTime" | "courtCount" | "status">>): Promise<PaddleSession>;
  replaceOrganizerHash(sessionId: string, expectedHash: string | null, nextHash: string | null): Promise<void>;
  addOrRejoinPlayer(sessionId: string, expectedHash: string, displayName: string, playerCredentialHash: string): Promise<PaddleSessionPlayer>;
  joinPlayer(sessionId: string, displayName: string, playerCredentialHash: string): Promise<PaddleSessionPlayer>;
  getPlayerCredentialHash(sessionId: string, playerId: string): Promise<string | null>;
  rejoinPlayer(sessionId: string, playerId: string, expectedCredentialHash: string): Promise<PaddleSessionPlayer>;
  setPlayerInactive(sessionId: string, expectedHash: string, playerId: string, removed: boolean): Promise<PaddleSessionPlayer>;
  movePlayer(sessionId: string, expectedHash: string, playerId: string, position: number): Promise<PaddleSessionPlayer[]>;
  skipPlayer(sessionId: string, expectedHash: string, playerId: string): Promise<PaddleSessionPlayer[]>;
  getPlayers(sessionId: string): Promise<PaddleSessionPlayer[]>;
  getGames(sessionId: string): Promise<PaddleGameWithPlayers[]>;
  startGames(sessionId: string, expectedHash: string, games: ForcedPaddleGame[]): Promise<PaddleGameWithPlayers[]>;
  completeGame(sessionId: string, expectedHash: string, gameId: string, score1: number, score2: number): Promise<PaddleGameWithPlayers>;
  cancelGame(sessionId: string, expectedHash: string, gameId: string): Promise<PaddleGameWithPlayers>;
}

function base64Url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

async function deriveSecretHash(secret: string, salt: Buffer): Promise<Buffer> {
  return (await scrypt(secret, salt, 32)) as Buffer;
}

async function createHashedCredential(): Promise<{ secret: string; hash: string }> {
  const secret = base64Url(randomBytes(32));
  const salt = randomBytes(16);
  const derived = await deriveSecretHash(secret, salt);
  return { secret, hash: `scrypt$${base64Url(salt)}$${base64Url(derived)}` };
}

async function verifyHashedCredential(secret: string, encodedHash: string): Promise<boolean> {
  const [algorithm, saltText, hashText, extra] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText || extra !== undefined) return false;
  try {
    const expected = Buffer.from(hashText, "base64url");
    if (expected.length !== 32) return false;
    const actual = await deriveSecretHash(secret, Buffer.from(saltText, "base64url"));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function createOrganizerCapability(): Promise<{ secret: string; hash: string }> {
  return createHashedCredential();
}

export async function createPlayerCredential(): Promise<{ credential: string; hash: string }> {
  const result = await createHashedCredential();
  return { credential: result.secret, hash: result.hash };
}

export async function verifyOrganizerCapability(secret: string, encodedHash: string): Promise<boolean> {
  return verifyHashedCredential(secret, encodedHash);
}

export async function verifyPlayerCredential(credential: string, encodedHash: string): Promise<boolean> {
  return verifyHashedCredential(credential, encodedHash);
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new PaddleQServiceError(`${label} is required`);
}

function assertSessionPatch(patch: CreatePaddleSessionInput): void {
  assertNonEmpty(patch.venueId, "Venue");
  const parsedDate = new Date(`${patch.sessionDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.sessionDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== patch.sessionDate) {
    throw new PaddleQServiceError("Session date must use YYYY-MM-DD");
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(patch.startTime)) {
    throw new PaddleQServiceError("Start time must use 24-hour HH:mm format");
  }
  if (patch.endTime != null && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(patch.endTime)) {
    throw new PaddleQServiceError("End time must use 24-hour HH:mm format");
  }
  if (!Number.isInteger(patch.courtCount) || patch.courtCount < 1) {
    throw new PaddleQServiceError("Court count must be a positive integer");
  }
}

function assertLifecycleTransition(current: PaddleSession["status"], next: PaddleSession["status"]): void {
  const transitions: Record<PaddleSession["status"], PaddleSession["status"][]> = {
    scheduled: ["scheduled", "active", "cancelled"],
    active: ["active", "completed", "cancelled"],
    completed: ["completed"],
    cancelled: ["cancelled"],
  };
  if (!transitions[current].includes(next)) {
    throw new PaddleQServiceError(`Cannot change a ${current} session to ${next}`);
  }
}

async function authorizedHash(repository: PaddleQRepository, sessionId: string, secret: string): Promise<string> {
  const session = await repository.getSession(sessionId);
  if (!session) throw new PaddleQServiceError("Paddle Q session not found", 404);
  if (!(await verifyOrganizerCapability(secret, session.organizerSecretHash))) {
    throw new PaddleQServiceError("Organizer capability is invalid", 401);
  }
  return session.organizerSecretHash;
}

/** Removes internal secret hashes before any session is returned to a caller. */
function publicSession(record: PaddleSessionRecord): PaddleSession {
  const { organizerSecretHash: _secretHash, ...session } = record;
  return session;
}

export class PaddleQService {
  constructor(
    private readonly repository: PaddleQRepository,
    private readonly randomSource: PaddleRandomSource = () => randomBytes(4).readUInt32BE(0) / 4294967296
  ) {}

  async createSession(input: CreatePaddleSessionInput): Promise<{ session: PaddleSession; organizerSecret: string }> {
    assertSessionPatch(input);
    const capability = await createOrganizerCapability();
    const session = await this.repository.createSession({ ...input, organizerSecretHash: capability.hash });
    return { session, organizerSecret: capability.secret };
  }

  async getSession(sessionId: string): Promise<PaddleSession> {
    const record = await this.repository.getSession(sessionId);
    if (!record) throw new PaddleQServiceError("Paddle Q session not found", 404);
    return publicSession(record);
  }

  async updateSession(
    sessionId: string,
    secret: string,
    patch: Partial<Pick<PaddleSession, "sessionDate" | "startTime" | "endTime" | "courtCount" | "status">>
  ): Promise<PaddleSession> {
    const hash = await authorizedHash(this.repository, sessionId, secret);
    const current = await this.repository.getSession(sessionId);
    if (!current) throw new PaddleQServiceError("Paddle Q session not found", 404);
    if (patch.courtCount !== undefined && (!Number.isInteger(patch.courtCount) || patch.courtCount < 1)) {
      throw new PaddleQServiceError("Court count must be a positive integer");
    }
    assertSessionPatch({
      venueId: current.venueId,
      sessionDate: patch.sessionDate ?? current.sessionDate,
      startTime: patch.startTime ?? current.startTime,
      endTime: patch.endTime === undefined ? current.endTime : patch.endTime,
      courtCount: patch.courtCount ?? current.courtCount,
    });
    if (patch.status) assertLifecycleTransition(current.status, patch.status);
    const resultingEndTime = patch.endTime === undefined ? current.endTime : patch.endTime;
    if (patch.status === "completed" && !resultingEndTime) {
      throw new PaddleQServiceError("Set the session end time when completing it");
    }
    return this.repository.updateSession(sessionId, hash, patch);
  }

  async rotateOrganizerCapability(sessionId: string, secret: string): Promise<string> {
    const hash = await authorizedHash(this.repository, sessionId, secret);
    const next = await createOrganizerCapability();
    await this.repository.replaceOrganizerHash(sessionId, hash, next.hash);
    return next.secret;
  }

  async revokeOrganizerCapability(sessionId: string, secret: string): Promise<void> {
    const hash = await authorizedHash(this.repository, sessionId, secret);
    // Replacing the hash with an unshared random secret revokes all known copies
    // while preserving the schema's invariant that every session has a hash.
    const next = await createOrganizerCapability();
    await this.repository.replaceOrganizerHash(sessionId, hash, next.hash);
  }

  async addPlayer(sessionId: string, secret: string, displayName: string): Promise<PaddlePlayerJoinResult> {
    assertNonEmpty(displayName, "Player name");
    const hash = await authorizedHash(this.repository, sessionId, secret);
    const credential = await createPlayerCredential();
    const player = await this.repository.addOrRejoinPlayer(sessionId, hash, displayName.trim(), credential.hash);
    return { player, playerCredential: credential.credential };
  }

  /** Public-safe insert-only join; existing names are never reactivated or modified here. */
  async joinPlayer(sessionId: string, displayName: string): Promise<PaddlePlayerJoinResult> {
    assertNonEmpty(displayName, "Player name");
    const credential = await createPlayerCredential();
    const player = await this.repository.joinPlayer(sessionId, displayName.trim(), credential.hash);
    return { player, playerCredential: credential.credential };
  }

  /** Rejoin only the identified inactive row after verifying its player-held credential. */
  async rejoinPlayer(sessionId: string, playerId: string, playerCredential: string): Promise<PaddleSessionPlayer> {
    assertNonEmpty(playerCredential, "Player credential");
    const storedHash = await this.repository.getPlayerCredentialHash(sessionId, playerId);
    if (!storedHash || !(await verifyPlayerCredential(playerCredential, storedHash))) {
      throw new PaddleQServiceError("Player credential is invalid", 401);
    }
    return this.repository.rejoinPlayer(sessionId, playerId, storedHash);
  }

  async deactivatePlayer(sessionId: string, secret: string, playerId: string, removed = false): Promise<PaddleSessionPlayer> {
    const hash = await authorizedHash(this.repository, sessionId, secret);
    return this.repository.setPlayerInactive(sessionId, hash, playerId, removed);
  }

  async pausePlayer(sessionId: string, secret: string, playerId: string): Promise<PaddleSessionPlayer> {
    return this.deactivatePlayer(sessionId, secret, playerId, false);
  }

  async removePlayer(sessionId: string, secret: string, playerId: string): Promise<PaddleSessionPlayer> {
    return this.deactivatePlayer(sessionId, secret, playerId, true);
  }

  async movePlayer(sessionId: string, secret: string, playerId: string, position: number): Promise<PaddleSessionPlayer[]> {
    if (!Number.isInteger(position) || position < 1) throw new PaddleQServiceError("Queue position must be a positive integer");
    const hash = await authorizedHash(this.repository, sessionId, secret);
    return this.repository.movePlayer(sessionId, hash, playerId, position);
  }

  async skipPlayer(sessionId: string, secret: string, playerId: string): Promise<PaddleSessionPlayer[]> {
    const hash = await authorizedHash(this.repository, sessionId, secret);
    return this.repository.skipPlayer(sessionId, hash, playerId);
  }

  async getQueue(sessionId: string): Promise<PaddleSessionPlayer[]> {
    await this.getSession(sessionId);
    return (await this.repository.getPlayers(sessionId))
      .filter((player) => player.state === "waiting")
      .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0));
  }

  async getCurrentGames(sessionId: string): Promise<PaddleGameWithPlayers[]> {
    await this.getSession(sessionId);
    return (await this.repository.getGames(sessionId)).filter((game) => game.status === "in_progress");
  }

  async getGameHistory(sessionId: string): Promise<PaddleGameWithPlayers[]> {
    await this.getSession(sessionId);
    return (await this.repository.getGames(sessionId)).sort((a, b) => a.gameNumber - b.gameNumber);
  }

  async recommendNextRound(
    sessionId: string,
    constraints: { requiredPlayerIds?: string[]; excludedPlayerIds?: string[]; forcedGames?: ForcedPaddleGame[] } = {},
    courtsToPlay?: number
  ): Promise<PaddleRotationRecommendation> {
    const session = await this.getSession(sessionId);
    if (session.status !== "active") throw new PaddleQServiceError("Only active sessions can start a rotation");
    const [players, games] = await Promise.all([this.repository.getPlayers(sessionId), this.repository.getGames(sessionId)]);
    const gameCounts = new Map<string, number>();
    for (const game of games) {
      if (game.status !== "completed" && game.status !== "in_progress") continue;
      for (const participant of game.participants) {
        gameCounts.set(participant.sessionPlayerId, (gameCounts.get(participant.sessionPlayerId) ?? 0) + 1);
      }
    }
    const inProgressCourts = new Set(games.filter((game) => game.status === "in_progress").map((game) => game.courtNumber));
    const availableCourtNumbers = Array.from({ length: session.courtCount }, (_, index) => index + 1)
      .filter((courtNumber) => !inProgressCourts.has(courtNumber));
    try {
      return recommendPaddleRotation({
        players: players.map((player) => ({
          id: player.id,
          displayName: player.displayName,
          state: player.state,
          queuePosition: player.queuePosition,
          joinedAt: player.joinedAt,
          gamesPlayed: gameCounts.get(player.id) ?? 0,
        })),
        completedGames: games.filter((game) => game.status === "completed").map((game) => ({
          gameNumber: game.gameNumber,
          courtNumber: game.courtNumber,
          startedAt: game.startedAt,
          finishedAt: game.finishedAt ?? game.startedAt,
          participants: game.participants.map((participant) => ({
            playerId: participant.sessionPlayerId,
            teamNumber: participant.teamNumber,
          })),
        })),
        courtCount: session.courtCount,
        availableCourtNumbers,
        courtsToPlay,
      }, this.randomSource, constraints);
    } catch (error) {
      throw new PaddleQServiceError(error instanceof Error ? error.message : "Rotation constraints are invalid", 409);
    }
  }

  async startGames(sessionId: string, secret: string, games: ForcedPaddleGame[]): Promise<PaddleGameWithPlayers[]> {
    if (!games.length) throw new PaddleQServiceError("At least one game is required");
    const hash = await authorizedHash(this.repository, sessionId, secret);
    return this.repository.startGames(sessionId, hash, games);
  }

  async startRecommendedRound(
    sessionId: string,
    secret: string,
    recommendation: PaddleRotationRecommendation
  ): Promise<PaddleGameWithPlayers[]> {
    return this.startGames(sessionId, secret, recommendation.courts.map((court) => ({
      courtNumber: court.courtNumber,
      team1PlayerIds: court.team1.map((player) => player.id) as [string, string],
      team2PlayerIds: court.team2.map((player) => player.id) as [string, string],
    })));
  }

  async completeGame(
    sessionId: string,
    secret: string,
    gameId: string,
    score1: number,
    score2: number
  ): Promise<PaddleGameWithPlayers> {
    if (!Number.isInteger(score1) || score1 < 0 || !Number.isInteger(score2) || score2 < 0) {
      throw new PaddleQServiceError("Scores must be non-negative integers");
    }
    if (score1 === score2) throw new PaddleQServiceError("A completed game must have a winner; tied scores are not allowed");
    const hash = await authorizedHash(this.repository, sessionId, secret);
    return this.repository.completeGame(sessionId, hash, gameId, score1, score2);
  }

  async cancelGame(sessionId: string, secret: string, gameId: string): Promise<PaddleGameWithPlayers> {
    const hash = await authorizedHash(this.repository, sessionId, secret);
    return this.repository.cancelGame(sessionId, hash, gameId);
  }

  async getStatistics(sessionId: string): Promise<PaddleSessionStatistics> {
    const [session, players, games] = await Promise.all([
      this.getSession(sessionId), this.repository.getPlayers(sessionId), this.repository.getGames(sessionId),
    ]);
    return calculatePaddleSessionStatistics(session, players, games);
  }
}

export function calculatePaddleSessionStatistics(
  session: PaddleSession,
  players: PaddleSessionPlayer[],
  allGames: PaddleGameWithPlayers[],
  now = new Date()
): PaddleSessionStatistics {
  const completed = allGames.filter((game) => game.status === "completed");
  const byPlayer = new Map(players.map((player) => [player.id, {
    player,
    games: 0,
    wins: 0,
    losses: 0,
    pointsScored: 0,
    pointsConceded: 0,
    partners: new Map<string, number>(),
    opponents: new Map<string, number>(),
  }]));
  const partnerships = new Map<string, { ids: [string, string]; games: number }>();
  const matchups = new Map<string, { ids: [string, string]; games: number }>();
  for (const game of completed) {
    const teamPlayers = new Map<PaddleTeamNumber, PaddleSessionPlayer[]>();
    for (const participant of game.participants) {
      const stats = byPlayer.get(participant.sessionPlayerId);
      if (!stats) continue;
      stats.games += 1;
      const team = teamPlayers.get(participant.teamNumber) ?? [];
      team.push(stats.player);
      teamPlayers.set(participant.teamNumber, team);
    }
    const team1 = teamPlayers.get(1) ?? [];
    const team2 = teamPlayers.get(2) ?? [];
    for (const player of team1) {
      const stats = byPlayer.get(player.id)!;
      stats.pointsScored += game.team1Score ?? 0;
      stats.pointsConceded += game.team2Score ?? 0;
      if (game.winnerTeam === 1) stats.wins += 1;
      else stats.losses += 1;
      for (const partner of team1) if (partner.id !== player.id) stats.partners.set(partner.id, (stats.partners.get(partner.id) ?? 0) + 1);
      for (const opponent of team2) stats.opponents.set(opponent.id, (stats.opponents.get(opponent.id) ?? 0) + 1);
    }
    for (const player of team2) {
      const stats = byPlayer.get(player.id)!;
      stats.pointsScored += game.team2Score ?? 0;
      stats.pointsConceded += game.team1Score ?? 0;
      if (game.winnerTeam === 2) stats.wins += 1;
      else stats.losses += 1;
      for (const partner of team2) if (partner.id !== player.id) stats.partners.set(partner.id, (stats.partners.get(partner.id) ?? 0) + 1);
      for (const opponent of team1) stats.opponents.set(opponent.id, (stats.opponents.get(opponent.id) ?? 0) + 1);
    }
    const addPair = (map: Map<string, { ids: [string, string]; games: number }>, a: string, b: string) => {
      const ids = [a, b].sort() as [string, string];
      const key = ids.join("\u0000");
      const item = map.get(key) ?? { ids, games: 0 };
      item.games += 1;
      map.set(key, item);
    };
    if (team1.length === 2) addPair(partnerships, team1[0].id, team1[1].id);
    if (team2.length === 2) addPair(partnerships, team2[0].id, team2[1].id);
    for (const left of team1) for (const right of team2) addPair(matchups, left.id, right.id);
  }
  const playerStats = [...byPlayer.values()].map(({ player, games, wins, losses, pointsScored, pointsConceded, partners, opponents }) => ({
    playerId: player.id,
    displayName: player.displayName,
    gamesPlayed: games,
    wins,
    losses,
    winRate: games === 0 ? 0 : wins / games,
    pointsScored,
    pointsConceded,
    partners: [...partners].map(([playerId, count]) => ({ playerId, displayName: byPlayer.get(playerId)?.player.displayName ?? "", games: count })),
    opponents: [...opponents].map(([playerId, count]) => ({ playerId, displayName: byPlayer.get(playerId)?.player.displayName ?? "", games: count })),
  }));
  const counts = playerStats.map((player) => player.gamesPlayed);
  const start = Date.parse(`${session.sessionDate}T${session.startTime}+08:00`);
  let end: number | null = null;
  if (session.endTime) {
    let endDate = session.sessionDate;
    if (session.endTime < session.startTime) {
      const followingDate = new Date(`${session.sessionDate}T00:00:00Z`);
      followingDate.setUTCDate(followingDate.getUTCDate() + 1);
      endDate = followingDate.toISOString().slice(0, 10);
    }
    end = Date.parse(`${endDate}T${session.endTime}+08:00`);
  } else if (session.status === "active") {
    const manilaParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const local = Object.fromEntries(manilaParts.map((part) => [part.type, part.value]));
    end = Date.parse(`${local.year}-${local.month}-${local.day}T${local.hour}:${local.minute}:${local.second}+08:00`);
  }
  const durationMinutes = end === null || !Number.isFinite(start) || !Number.isFinite(end)
    ? null
    : Math.max(0, Math.round((end - start) / 60000));
  const totalPlayerGames = counts.reduce((sum, count) => sum + count, 0);
  return {
    playerCount: players.length,
    courtCount: session.courtCount,
    completedGames: completed.length,
    durationMinutes,
    averageGamesPerPlayer: players.length === 0 ? 0 : totalPlayerGames / players.length,
    minimumGames: counts.length ? Math.min(...counts) : 0,
    maximumGames: counts.length ? Math.max(...counts) : 0,
    players: playerStats,
    partnerships: [...partnerships.values()].map(({ ids, games }) => ({ playerIds: ids, games })),
    matchups: [...matchups.values()].map(({ ids, games }) => ({ playerIds: ids, games })),
    fairness: {
      gameCountSpread: counts.length ? Math.max(...counts) - Math.min(...counts) : 0,
      gameCounts: playerStats.map(({ playerId, gamesPlayed }) => ({ playerId, gamesPlayed })),
    },
  };
}
