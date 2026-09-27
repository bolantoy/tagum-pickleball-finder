import type { Request, Response } from "express";
import { z, ZodError } from "zod";
import { PaddleQPersistenceError } from "./supabasePaddleQRepository";
import { PaddleQService, PaddleQServiceError } from "./paddleQService";

type ApiService = Pick<PaddleQService,
  | "createSession" | "getSession" | "updateSession" | "rotateOrganizerCapability" | "revokeOrganizerCapability"
  | "joinPlayer" | "rejoinPlayer" | "pausePlayer" | "removePlayer" | "movePlayer" | "skipPlayer" | "getQueue"
  | "getCurrentGames" | "getGameHistory" | "recommendNextRound" | "startGames" | "startRecommendedRound"
  | "completeGame" | "cancelGame" | "getStatistics"
>;

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Expected a real calendar date in YYYY-MM-DD format");
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const playerName = z.string().trim().min(1).max(100);
const forcedGame = z.object({
  courtNumber: z.number().int().positive(),
  team1PlayerIds: z.tuple([uuid, uuid]),
  team2PlayerIds: z.tuple([uuid, uuid]),
}).strict().superRefine((game, ctx) => {
  if (new Set([...game.team1PlayerIds, ...game.team2PlayerIds]).size !== 4) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A game must contain four distinct players" });
  }
});

const idParams = z.object({ sessionId: uuid });
const playerParams = idParams.extend({ playerId: uuid });
const gameParams = idParams.extend({ gameId: uuid });
const organizerPatch = z.object({
  sessionDate: date.optional(), startTime: time.optional(),
  endTime: time.nullable().optional(), courtCount: z.number().int().positive().optional(),
  status: z.enum(["scheduled", "active", "completed", "cancelled"]).optional(),
}).strict().refine((body) => Object.keys(body).length > 0, "At least one session field is required");

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

function capability(req: Request): string | null {
  const authorization = req.get("authorization");
  if (!authorization) return null;
  const match = /^PaddleQ ([A-Za-z0-9_-]+)$/.exec(authorization);
  return match ? match[1] : "";
}

function serviceError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof PaddleQServiceError) {
    if (error.statusCode === 401 && /player credential/i.test(error.message)) return { status: 401, code: "PLAYER_CREDENTIAL_INVALID", message: "Player credential is missing or invalid" };
    if (error.statusCode === 401) return { status: 401, code: "ORGANIZER_CAPABILITY_INVALID", message: "Organizer capability is missing or invalid" };
    if (error.statusCode === 404) return { status: 404, code: "NOT_FOUND", message: "Paddle Q resource was not found" };
    if (/cannot change|only active|already|in progress|not waiting|not playing|not active/i.test(error.message)) {
      return { status: 409, code: "INVALID_STATE", message: error.message };
    }
    return { status: 400, code: "INVALID_REQUEST", message: error.message };
  }
  if (error instanceof PaddleQPersistenceError) {
    if (error.code === "P0002") return { status: 404, code: "NOT_FOUND", message: "Paddle Q resource was not found" };
    if (error.code === "42501") return { status: 401, code: "ORGANIZER_CAPABILITY_INVALID", message: "Organizer capability is missing or invalid" };
    if (error.code === "23505") return { status: 409, code: "CONFLICT", message: "The request conflicts with existing Paddle Q data" };
    if (error.code === "22023") return { status: 409, code: "INVALID_STATE", message: "The requested Paddle Q state transition is not allowed" };
    if (error.code === "23514") return { status: 400, code: "VALIDATION_ERROR", message: "Paddle Q data failed validation" };
  }
  return { status: 500, code: "INTERNAL_ERROR", message: "Paddle Q request could not be completed" };
}

export function createPaddleQController(service: ApiService) {
  const organizer = (req: Request): string => {
    const secret = capability(req);
    if (secret === null) throw new ApiRequestError("Send the organizer capability in Authorization: PaddleQ <capability>", 401, "ORGANIZER_CAPABILITY_REQUIRED");
    if (!secret.trim()) throw new ApiRequestError("Organizer capability is malformed", 401, "ORGANIZER_CAPABILITY_INVALID");
    return secret;
  };
  const playerCredential = (req: Request): string => {
    const credential = req.get("x-paddleq-player-credential");
    if (!credential) throw new ApiRequestError("Send the player credential in X-PaddleQ-Player-Credential", 401, "PLAYER_CREDENTIAL_REQUIRED");
    return credential;
  };
  const validateIds = (req: Request) => parse(idParams, req.params);
  const handleApiError = (error: unknown) => {
    if (error instanceof ApiRequestError) return { status: error.status, code: error.code, message: error.message };
    return serviceError(error);
  };
  // Keep request-shape errors and missing capabilities on the same stable envelope.
  const withApiErrors = (operation: (req: Request) => Promise<unknown>, status = 200) =>
    async (req: Request, res: Response): Promise<void> => {
      try { res.status(status).json({ success: true, data: await operation(req) }); }
      catch (error) {
        const mapped = error instanceof ZodError
          ? { status: 400, code: "VALIDATION_ERROR", message: error.issues.map((issue) => issue.message).join("; ") }
          : handleApiError(error);
        res.status(mapped.status).json({ success: false, error: { code: mapped.code, message: mapped.message } });
      }
    };

  return {
    createSession: withApiErrors(async (req) => {
      const body = parse(z.object({ venueId: uuid, sessionDate: date, startTime: time, endTime: time.nullable().optional(), courtCount: z.number().int().positive() }).strict(), req.body);
      // This is the only response that carries organizerSecret. The service strips hashes from sessions.
      return service.createSession(body);
    }, 201),
    getSession: withApiErrors(async (req) => service.getSession(validateIds(req).sessionId)),
    updateSession: withApiErrors(async (req) => {
      const { sessionId } = validateIds(req);
      return service.updateSession(sessionId, organizer(req), parse(organizerPatch, req.body));
    }),
    rotateCapability: withApiErrors(async (req) => {
      const { sessionId } = validateIds(req);
      return { organizerSecret: await service.rotateOrganizerCapability(sessionId, organizer(req)) };
    }),
    revokeCapability: withApiErrors(async (req) => {
      const { sessionId } = validateIds(req);
      await service.revokeOrganizerCapability(sessionId, organizer(req));
      return { revoked: true };
    }),
    addPlayer: withApiErrors(async (req) => {
      const { sessionId } = validateIds(req);
      const body = parse(z.object({ displayName: playerName }).strict(), req.body);
      return service.joinPlayer(sessionId, body.displayName);
    }, 201),
    rejoinPlayer: withApiErrors(async (req) => {
      const { sessionId, playerId } = parse(playerParams, req.params);
      return service.rejoinPlayer(sessionId, playerId, playerCredential(req));
    }),
    pausePlayer: withApiErrors(async (req) => {
      const { sessionId, playerId } = parse(playerParams, req.params);
      return service.pausePlayer(sessionId, organizer(req), playerId);
    }),
    removePlayer: withApiErrors(async (req) => {
      const { sessionId, playerId } = parse(playerParams, req.params);
      return service.removePlayer(sessionId, organizer(req), playerId);
    }),
    movePlayer: withApiErrors(async (req) => {
      const { sessionId, playerId } = parse(playerParams, req.params);
      const body = parse(z.object({ position: z.number().int().positive() }).strict(), req.body);
      return service.movePlayer(sessionId, organizer(req), playerId, body.position);
    }),
    skipPlayer: withApiErrors(async (req) => {
      const { sessionId, playerId } = parse(playerParams, req.params);
      return service.skipPlayer(sessionId, organizer(req), playerId);
    }),
    getQueue: withApiErrors(async (req) => service.getQueue(validateIds(req).sessionId)),
    getCurrentGames: withApiErrors(async (req) => service.getCurrentGames(validateIds(req).sessionId)),
    getGameHistory: withApiErrors(async (req) => service.getGameHistory(validateIds(req).sessionId)),
    recommend: withApiErrors(async (req) => {
      const { sessionId } = validateIds(req);
      const body = parse(z.object({
        constraints: z.object({
          requiredPlayerIds: z.array(uuid).optional(), excludedPlayerIds: z.array(uuid).optional(),
          forcedGames: z.array(forcedGame).optional(),
        }).strict().optional(),
        courtsToPlay: z.number().int().positive().optional(),
      }).strict().optional(), req.body);
      return service.recommendNextRound(sessionId, body?.constraints, body?.courtsToPlay);
    }),
    startRecommended: withApiErrors(async (req) => {
      const { sessionId } = validateIds(req);
      const secret = organizer(req);
      const body = parse(z.object({
        constraints: z.object({ requiredPlayerIds: z.array(uuid).optional(), excludedPlayerIds: z.array(uuid).optional(), forcedGames: z.array(forcedGame).optional() }).strict().optional(),
        courtsToPlay: z.number().int().positive().optional(),
      }).strict().optional(), req.body);
      const recommendation = await service.recommendNextRound(sessionId, body?.constraints, body?.courtsToPlay);
      return service.startRecommendedRound(sessionId, secret, recommendation);
    }, 201),
    startForcedGames: withApiErrors(async (req) => {
      const { sessionId } = validateIds(req);
      const body = parse(z.object({ games: z.array(forcedGame).min(1) }).strict().superRefine((value, ctx) => {
        const courts = new Set<number>();
        const players = new Set<string>();
        value.games.forEach((game, index) => {
          if (courts.has(game.courtNumber)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["games", index, "courtNumber"], message: "Each court may be assigned only once per round" });
          courts.add(game.courtNumber);
          [...game.team1PlayerIds, ...game.team2PlayerIds].forEach((id) => {
            if (players.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["games", index], message: "A player cannot be assigned to multiple games in one round" });
            players.add(id);
          });
        });
      }), req.body);
      return service.startGames(sessionId, organizer(req), body.games);
    }, 201),
    completeGame: withApiErrors(async (req) => {
      const { sessionId, gameId } = parse(gameParams, req.params);
      const body = parse(z.object({ team1Score: z.number().int().nonnegative(), team2Score: z.number().int().nonnegative() }).strict().refine((value) => value.team1Score !== value.team2Score, "A completed game must have a winner; tied scores are not allowed"), req.body);
      return service.completeGame(sessionId, organizer(req), gameId, body.team1Score, body.team2Score);
    }),
    cancelGame: withApiErrors(async (req) => {
      const { sessionId, gameId } = parse(gameParams, req.params);
      return service.cancelGame(sessionId, organizer(req), gameId);
    }),
    getStatistics: withApiErrors(async (req) => service.getStatistics(validateIds(req).sessionId)),
    getPlayerStatistics: withApiErrors(async (req) => {
      const { sessionId, playerId } = parse(playerParams, req.params);
      const statistics = await service.getStatistics(sessionId);
      const player = statistics.players.find((item) => item.playerId === playerId);
      if (!player) throw new ApiRequestError("Paddle Q player was not found", 404, "NOT_FOUND");
      return player;
    }),
  };
}

class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}
