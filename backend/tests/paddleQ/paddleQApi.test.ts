import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { createPaddleSessionsRouter } from "../../src/routes/paddleSessions";
import { PaddleQServiceError, type PaddleQService } from "../../src/paddleQ/paddleQService";
import { createRequestLogger } from "../../src/middleware/requestLogger";

const sessionId = "11111111-1111-4111-8111-111111111111";
const playerId = "22222222-2222-4222-8222-222222222222";
const gameId = "33333333-3333-4333-8333-333333333333";
const capability = "test-organizer-capability";

function makeService() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record = (method: string, result: unknown) => (...args: unknown[]) => {
    calls.push({ method, args });
    return Promise.resolve(result);
  };
  const service = {
    createSession: record("createSession", { session: { id: sessionId, venueId: playerId, status: "scheduled" }, organizerSecret: capability }),
    getSession: record("getSession", { id: sessionId, venueId: playerId, status: "active" }),
    updateSession: record("updateSession", { id: sessionId, status: "active" }),
    rotateOrganizerCapability: record("rotateOrganizerCapability", "rotated-capability"),
    revokeOrganizerCapability: record("revokeOrganizerCapability", undefined),
    addPlayer: async (_sessionId: string, _capability: string, displayName: string) => {
      calls.push({ method: "addPlayer", args: [_sessionId, _capability, displayName] });
      return { player: { id: playerId, displayName, state: "waiting", queuePosition: 2 } as any, playerCredential: "must-not-escape-managed-response" };
    },
    joinPlayer: record("joinPlayer", { player: { id: playerId, displayName: "Russel", state: "waiting", queuePosition: 1 }, playerCredential: "one-time-player-credential" }),
    rejoinPlayer: async (_sessionId: string, _playerId: string, credential: string) => {
      calls.push({ method: "rejoinPlayer", args: [_sessionId, _playerId, credential] });
      if (credential !== "valid-player-credential") throw new PaddleQServiceError("Player credential is invalid", 401);
      return { id: playerId, displayName: "Russel", state: "waiting", queuePosition: 4 };
    },
    pausePlayer: record("pausePlayer", { id: playerId, state: "inactive", queuePosition: null }),
    removePlayer: record("removePlayer", { id: playerId, state: "inactive", removedAt: "2026-01-01T00:00:00Z" }),
    movePlayer: record("movePlayer", [{ id: playerId, queuePosition: 2 }]),
    skipPlayer: record("skipPlayer", [{ id: playerId, queuePosition: 2 }]),
    getQueue: record("getQueue", [{ id: playerId, displayName: "Russel", queuePosition: 1 }]),
    getCurrentGames: record("getCurrentGames", []),
    getGameHistory: record("getGameHistory", []),
    recommendNextRound: record("recommendNextRound", { courts: [], sittingOut: [], metadata: { selectedPlayerIds: [] } }),
    startGames: record("startGames", [{ id: gameId, status: "in_progress" }]),
    startRecommendedRound: record("startRecommendedRound", [{ id: gameId, status: "in_progress" }]),
    completeGame: record("completeGame", { id: gameId, status: "completed", team1Score: 11, team2Score: 8 }),
    cancelGame: record("cancelGame", { id: gameId, status: "cancelled" }),
    getStatistics: record("getStatistics", { completedGames: 1, players: [{ playerId, displayName: "Russel", gamesPlayed: 1 }] }),
  };
  return { service: service as unknown as PaddleQService, calls };
}

describe("Paddle Q API", () => {
  let server: Server;
  let baseUrl: string;
  let calls: ReturnType<typeof makeService>["calls"];

  before(async () => {
    const { service, calls: serviceCalls } = makeService();
    calls = serviceCalls;
    const app = express();
    app.use(express.json());
    app.use("/api/v1/paddle-sessions", createPaddleSessionsRouter(service));
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server failed to bind");
    baseUrl = `http://127.0.0.1:${address.port}/api/v1/paddle-sessions`;
  });
  after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

  async function request(path: string, method = "GET", body?: unknown, auth = false) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(auth ? { authorization: `PaddleQ ${capability}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { response, json: await response.json() as any };
  }

  it("creates a session and returns the organizer capability only in that response", async () => {
    const { response, json } = await request("/", "POST", { venueId: playerId, sessionDate: "2026-09-27", startTime: "18:00", courtCount: 2 });
    assert.equal(response.status, 201);
    assert.equal(json.data.organizerSecret, capability);
    assert.equal("organizerSecretHash" in json.data.session, false);
    assert.equal(calls.at(-1)?.method, "createSession");
  });

  it("never returns a capability or hash in normal session responses", async () => {
    const { json } = await request(`/${sessionId}`);
    assert.equal(json.data.id, sessionId);
    assert.equal(JSON.stringify(json).includes("organizerSecret"), false);
    assert.equal(JSON.stringify(json).includes("organizerSecretHash"), false);
  });

  it("allows public join and returns a one-time credential without exposing hashes", async () => {
    const { response, json } = await request(`/${sessionId}/players`, "POST", { displayName: "Mark" });
    assert.equal(response.status, 201);
    assert.equal(json.data.playerCredential, "one-time-player-credential");
    assert.equal("playerCredentialHash" in json.data.player, false);
    assert.equal("organizerSecretHash" in json.data.player, false);
    assert.equal(calls.at(-1)?.method, "joinPlayer");
  });

  it("requires organizer capability for managed player creation and returns no player credential", async () => {
    const missing = await request(`/${sessionId}/players/manage`, "POST", { displayName: "Ana" });
    assert.equal(missing.response.status, 401);
    assert.equal(missing.json.error.code, "ORGANIZER_CAPABILITY_REQUIRED");

    const queryOnly = await request(`/${sessionId}/players/manage?organizerCapability=${capability}`, "POST", { displayName: "Ana" });
    assert.equal(queryOnly.response.status, 401);

    const invalidName = await request(`/${sessionId}/players/manage`, "POST", { displayName: "  " }, true);
    assert.equal(invalidName.response.status, 400);

    const { response, json } = await request(`/${sessionId}/players/manage`, "POST", { displayName: " Ana " }, true);
    assert.equal(response.status, 201);
    assert.equal(json.data.player.displayName, "Ana");
    assert.equal("playerCredential" in json.data, false);
    assert.equal("player_credential_hash" in json.data.player, false);
    assert.equal("playerCredentialHash" in json.data.player, false);
    assert.equal(JSON.stringify(json).includes("must-not-escape-managed-response"), false);
    assert.deepEqual(calls.at(-1), { method: "addPlayer", args: [sessionId, capability, "Ana"] });
  });

  it("requires the player credential to rejoin the identified player", async () => {
    const missing = await request(`/${sessionId}/players/${playerId}/rejoin`, "POST", {});
    assert.equal(missing.response.status, 401);
    assert.equal(missing.json.error.code, "PLAYER_CREDENTIAL_REQUIRED");
    const invalid = await fetch(`${baseUrl}/${sessionId}/players/${playerId}/rejoin`, { method: "POST", headers: { "x-paddleq-player-credential": "wrong-token" } });
    assert.equal(invalid.status, 401);
    assert.equal((await invalid.json() as any).error.code, "PLAYER_CREDENTIAL_INVALID");
    const queryOnly = await request(`/${sessionId}/players/${playerId}/rejoin?playerCredential=valid-player-credential`, "POST", {});
    assert.equal(queryOnly.response.status, 401);
    const success = await fetch(`${baseUrl}/${sessionId}/players/${playerId}/rejoin`, { method: "POST", headers: { "x-paddleq-player-credential": "valid-player-credential" } });
    assert.equal(success.status, 200);
    const result = await success.json() as any;
    assert.equal(result.data.queuePosition, 4);
    assert.equal("playerCredential" in result.data, false);
    assert.equal("playerCredentialHash" in result.data, false);
  });

  it("keeps organizer-only player and queue mutations protected", async () => {
    const unauthorized = await request(`/${sessionId}/players/${playerId}/pause`, "POST", {});
    assert.equal(unauthorized.response.status, 401);
    assert.equal(unauthorized.json.error.code, "ORGANIZER_CAPABILITY_REQUIRED");
    const queryCapability = await request(`/${sessionId}/players/${playerId}/pause?organizerCapability=${capability}`, "POST", {});
    assert.equal(queryCapability.response.status, 401);
    await request(`/${sessionId}/players/${playerId}/pause`, "POST", {}, true);
    await request(`/${sessionId}/players/${playerId}/remove`, "POST", {}, true);
    await request(`/${sessionId}/queue`);
    await request(`/${sessionId}/queue/${playerId}`, "PATCH", { position: 2 }, true);
    await request(`/${sessionId}/queue/${playerId}/skip`, "POST", {}, true);
    for (const method of ["pausePlayer", "removePlayer", "getQueue", "movePlayer", "skipPlayer"]) assert.ok(calls.some((call) => call.method === method));
  });

  it("omits sensitive query strings and credentials from request logs", async () => {
    let logOutput = "";
    const app = express();
    app.use(createRequestLogger({ write: (message: string) => { logOutput += message; } }));
    app.get("/log-check", (_req, res) => res.status(204).end());
    const local = await new Promise<Server>((resolve) => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
    try {
      const address = local.address();
      if (!address || typeof address === "string") throw new Error("Test server failed to bind");
      await fetch(`http://127.0.0.1:${address.port}/log-check?organizerCapability=org-secret&playerCredential=player-secret`, {
        headers: { authorization: "PaddleQ header-secret", "x-paddleq-player-credential": "player-header-secret" },
      });
      assert.ok(logOutput.includes("/log-check"));
      for (const secret of ["org-secret", "player-secret", "header-secret", "player-header-secret"]) assert.equal(logOutput.includes(secret), false);
      assert.equal(logOutput.includes("?"), false);
    } finally { await new Promise<void>((resolve, reject) => local.close((error) => error ? reject(error) : resolve())); }
  });

  it("provides recommendation, recommended and forced starts, completion, cancellation, and history", async () => {
    const recommendation = await request(`/${sessionId}/rotation/recommendation`, "POST", { courtsToPlay: 1 });
    assert.equal(recommendation.response.status, 200);
    await request(`/${sessionId}/games/recommended`, "POST", {}, true);
    await request(`/${sessionId}/games`, "POST", { games: [{ courtNumber: 1, team1PlayerIds: [playerId, gameId], team2PlayerIds: [sessionId, "44444444-4444-4444-8444-444444444444"] }] }, true);
    await request(`/${sessionId}/games/${gameId}/complete`, "POST", { team1Score: 11, team2Score: 8 }, true);
    await request(`/${sessionId}/games/${gameId}/cancel`, "POST", {}, true);
    await request(`/${sessionId}/games/current`);
    await request(`/${sessionId}/games`);
    for (const method of ["recommendNextRound", "startRecommendedRound", "startGames", "completeGame", "cancelGame", "getCurrentGames", "getGameHistory"]) assert.ok(calls.some((call) => call.method === method));
  });

  it("passes organizer-edited assignments to the authoritative recommendation path", async () => {
    const forcedGames = [{
      courtNumber: 1,
      team1PlayerIds: [playerId, gameId],
      team2PlayerIds: [sessionId, "44444444-4444-4444-8444-444444444444"],
    }];
    const { response } = await request(`/${sessionId}/games/recommended`, "POST", { constraints: { forcedGames } }, true);
    assert.equal(response.status, 201);
    const recommendationCall = calls.filter((call) => call.method === "recommendNextRound").at(-1);
    assert.deepEqual(recommendationCall?.args, [sessionId, { forcedGames }, undefined]);
    assert.ok(calls.some((call) => call.method === "startRecommendedRound"));
  });

  it("validates UUIDs, player names, scores, and distinct game participants at the API boundary", async () => {
    const badId = await request("/not-a-uuid");
    assert.equal(badId.response.status, 400);
    assert.equal(badId.json.error.code, "VALIDATION_ERROR");
    const badName = await request(`/${sessionId}/players`, "POST", { displayName: "  " });
    assert.equal(badName.response.status, 400);
    const tie = await request(`/${sessionId}/games/${gameId}/complete`, "POST", { team1Score: 4, team2Score: 4 }, true);
    assert.equal(tie.response.status, 400);
    const duplicate = await request(`/${sessionId}/games`, "POST", { games: [{ courtNumber: 1, team1PlayerIds: [playerId, playerId], team2PlayerIds: [gameId, sessionId] }] }, true);
    assert.equal(duplicate.response.status, 400);
  });

  it("maps service authorization, missing-resource, state, and unknown errors into stable envelopes", async () => {
    const service = {
      getSession: async () => { throw new PaddleQServiceError("missing", 404); },
      updateSession: async () => { throw new PaddleQServiceError("invalid capability", 401); },
    } as unknown as PaddleQService;
    const app = express(); app.use(express.json()); app.use("/api/v1/paddle-sessions", createPaddleSessionsRouter(service));
    const local = await new Promise<Server>((resolve) => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
    try {
      const address = local.address();
      if (!address || typeof address === "string") throw new Error("Test server failed to bind");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/paddle-sessions/${sessionId}`);
      assert.equal(response.status, 404);
      assert.deepEqual((await response.json() as any).error, { code: "NOT_FOUND", message: "Paddle Q resource was not found" });
      const unauthorized = await fetch(`http://127.0.0.1:${address.port}/api/v1/paddle-sessions/${sessionId}`, {
        method: "PATCH", headers: { "content-type": "application/json", authorization: `PaddleQ ${capability}` }, body: JSON.stringify({ status: "active" }),
      });
      assert.equal(unauthorized.status, 401);
      assert.equal((await unauthorized.json() as any).error.code, "ORGANIZER_CAPABILITY_INVALID");
    } finally { await new Promise<void>((resolve, reject) => local.close((error) => error ? reject(error) : resolve())); }
  });
});
