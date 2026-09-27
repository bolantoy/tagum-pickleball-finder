import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculatePaddleSessionStatistics,
  createOrganizerCapability,
  createPlayerCredential,
  PaddleQService,
  PaddleQServiceError,
  verifyOrganizerCapability,
  verifyPlayerCredential,
  type PaddleGameWithPlayers,
  type PaddleQRepository,
  type PaddleSessionRecord,
} from "../../src/paddleQ/paddleQService";
import type { PaddleSession, PaddleSessionPlayer } from "../../src/paddleQ/types";

const blank = async (): Promise<never> => { throw new Error("Unexpected repository call"); };

function makeRepository(overrides: Partial<PaddleQRepository> = {}): PaddleQRepository {
  return {
    createSession: blank,
    getSession: blank,
    updateSession: blank,
    replaceOrganizerHash: blank,
    addOrRejoinPlayer: blank,
    joinPlayer: blank,
    getPlayerCredentialHash: blank,
    rejoinPlayer: blank,
    setPlayerInactive: blank,
    movePlayer: blank,
    skipPlayer: blank,
    getPlayers: blank,
    getGames: blank,
    startGames: blank,
    completeGame: blank,
    cancelGame: blank,
    ...overrides,
  };
}

function sessionRecord(organizerSecretHash: string): PaddleSessionRecord {
  return {
    id: "session-1", venueId: "venue-1", sessionDate: "2026-05-01", startTime: "09:00", endTime: null,
    courtCount: 2, status: "active", createdAt: "2026-05-01T01:00:00.000Z", updatedAt: "2026-05-01T01:00:00.000Z",
    organizerSecretHash,
  };
}

function player(id: string, name: string, state: PaddleSessionPlayer["state"], queuePosition: number | null): PaddleSessionPlayer {
  return {
    id, sessionId: "session-1", displayName: name, state, queuePosition, joinedAt: "2026-05-01T01:00:00.000Z",
    inactiveAt: null, removedAt: null, createdAt: "2026-05-01T01:00:00.000Z", updatedAt: "2026-05-01T01:00:00.000Z",
  };
}

describe("Paddle Q service", () => {
  it("creates a one-time capability and persists only its salted hash", async () => {
    let storedHash = "";
    const repository = makeRepository({
      createSession: async (input) => {
        storedHash = input.organizerSecretHash;
        const { organizerSecretHash: _hash, ...safeSession } = sessionRecord(storedHash);
        return safeSession;
      },
    });
    const service = new PaddleQService(repository);
    const result = await service.createSession({ venueId: "venue-1", sessionDate: "2026-05-01", startTime: "09:00", courtCount: 2 });
    assert.equal(await verifyOrganizerCapability(result.organizerSecret, storedHash), true);
    assert.notEqual(result.organizerSecret, storedHash);
    assert.equal("organizerSecretHash" in result.session, false);
  });

  it("rejects an invalid organizer capability before dispatching a mutation", async () => {
    const capability = await createOrganizerCapability();
    let mutationCalled = false;
    const repository = makeRepository({
      getSession: async () => sessionRecord(capability.hash),
      addOrRejoinPlayer: async () => { mutationCalled = true; return player("p1", "Russel", "waiting", 1); },
    });
    const service = new PaddleQService(repository);
    await assert.rejects(service.addPlayer("session-1", "wrong-secret", "Russel"), (error: Error) =>
      error instanceof PaddleQServiceError && error.statusCode === 401
    );
    assert.equal(mutationCalled, false);
  });

  it("validates capability, trims the name, and delegates join/rejoin queue placement", async () => {
    const capability = await createOrganizerCapability();
    let dispatched: { expectedHash: string; displayName: string; credentialHash: string } | undefined;
    const repository = makeRepository({
      getSession: async () => sessionRecord(capability.hash),
      addOrRejoinPlayer: async (_sessionId, expectedHash, displayName, credentialHash) => {
        dispatched = { expectedHash, displayName, credentialHash };
        return player("p7", displayName, "waiting", 7);
      },
    });
    const joined = await new PaddleQService(repository).addPlayer("session-1", capability.secret, "  G  ");
    assert.equal(dispatched?.expectedHash, capability.hash);
    assert.equal(dispatched?.displayName, "G");
    assert.equal(await verifyPlayerCredential(joined.playerCredential, dispatched!.credentialHash), true);
    assert.equal(joined.player.queuePosition, 7);
  });

  it("public join is insert-only and returns a one-time player credential hash", async () => {
    let savedHash = "";
    let insertedName = "";
    const repository = makeRepository({
      joinPlayer: async (_sessionId, name, hash) => {
        insertedName = name;
        savedHash = hash;
        return player("p8", name, "waiting", 8);
      },
    });
    const result = await new PaddleQService(repository).joinPlayer("session-1", "  New Player  ");
    assert.equal(result.player.displayName, "New Player");
    assert.equal(result.player.queuePosition, 8);
    assert.equal(insertedName, "New Player");
    assert.ok(savedHash.startsWith("scrypt$"));
    assert.notEqual(savedHash, result.playerCredential);
    assert.equal(await verifyPlayerCredential(result.playerCredential, savedHash), true);
    assert.equal("playerCredential" in result.player, false);
    // The public repository operation is insertion-only: duplicate names cannot
    // reactivate or otherwise mutate the pre-existing session player.
    const existing = player("p-existing", "New Player", "inactive", null);
    const before = { ...existing };
    let organizerRejoinCalled = false;
    const duplicateService = new PaddleQService(makeRepository({
      joinPlayer: async () => { throw new Error("duplicate display name"); },
      rejoinPlayer: async () => { organizerRejoinCalled = true; return existing; },
    }));
    await assert.rejects(duplicateService.joinPlayer("session-1", "New Player"), /duplicate display name/);
    assert.deepEqual(existing, before);
    assert.equal(organizerRejoinCalled, false);
  });

  it("requires the identified player's credential to rejoin and delegates queue-back reactivation", async () => {
    const credential = await createPlayerCredential();
    let passedHash = "";
    const service = new PaddleQService(makeRepository({
      getPlayerCredentialHash: async () => credential.hash,
      rejoinPlayer: async (_sessionId, _playerId, expectedHash) => {
        passedHash = expectedHash;
        return player("p9", "Nina", "waiting", 9);
      },
    }));
    await assert.rejects(service.rejoinPlayer("session-1", "p9", "wrong-token"), (error: Error) =>
      error instanceof PaddleQServiceError && error.statusCode === 401
    );
    assert.equal(passedHash, "");
    const rejoined = await service.rejoinPlayer("session-1", "p9", credential.credential);
    assert.equal(rejoined.queuePosition, 9);
    assert.equal(passedHash, credential.hash);
  });

  it("authorizes queue and multi-court game operations before delegating atomic work", async () => {
    const capability = await createOrganizerCapability();
    const calls: string[] = [];
    const repository = makeRepository({
      getSession: async () => sessionRecord(capability.hash),
      setPlayerInactive: async (_session, _hash, playerId, removed) => {
        calls.push(removed ? "remove" : "pause");
        return player(playerId, "A", "inactive", null);
      },
      movePlayer: async (_session, _hash, _playerId, position) => { calls.push(`move:${position}`); return []; },
      skipPlayer: async () => { calls.push("skip"); return []; },
      startGames: async (_session, _hash, games) => { calls.push(`start:${games.length}`); return []; },
      completeGame: async (_session, _hash, gameId, score1, score2) => {
        calls.push(`complete:${gameId}:${score1}-${score2}`);
        return {
          id: gameId, sessionId: "session-1", gameNumber: 1, courtNumber: 1,
          team1Score: score1, team2Score: score2, winnerTeam: 1, status: "completed",
          startedAt: "2026-05-01T01:00:00.000Z", finishedAt: "2026-05-01T01:10:00.000Z",
          createdAt: "2026-05-01T01:00:00.000Z", participants: [],
        };
      },
    });
    const service = new PaddleQService(repository);
    await service.pausePlayer("session-1", capability.secret, "p1");
    await service.removePlayer("session-1", capability.secret, "p2");
    await service.movePlayer("session-1", capability.secret, "p3", 2);
    await service.skipPlayer("session-1", capability.secret, "p4");
    await service.startGames("session-1", capability.secret, [
      { courtNumber: 1, team1PlayerIds: ["a", "b"], team2PlayerIds: ["c", "d"] },
      { courtNumber: 2, team1PlayerIds: ["e", "f"], team2PlayerIds: ["g", "h"] },
    ]);
    const completed = await service.completeGame("session-1", capability.secret, "g1", 11, 7);
    assert.equal(completed.winnerTeam, 1);
    assert.deepEqual(calls, ["pause", "remove", "move:2", "skip", "start:2", "complete:g1:11-7"]);
  });

  it("rejects invalid queue positions and game scores before persistence", async () => {
    const service = new PaddleQService(makeRepository());
    await assert.rejects(service.movePlayer("s", "secret", "p", 0), /positive integer/);
    await assert.rejects(service.completeGame("s", "secret", "g", -1, 11), /non-negative/);
    await assert.rejects(service.completeGame("s", "secret", "g", 9, 9), /tied scores/);
    await assert.rejects(service.startGames("s", "secret", []), /At least one game/);
  });

  it("derives player and session statistics from completed history only", () => {
    const session: PaddleSession = {
      id: "session-1", venueId: "venue-1", sessionDate: "2026-05-01", startTime: "09:00", endTime: "10:00",
      courtCount: 1, status: "completed", createdAt: "2026-05-01T01:00:00.000Z", updatedAt: "2026-05-01T02:00:00.000Z",
    };
    const players = [player("a", "A", "waiting", 1), player("b", "B", "waiting", 2), player("c", "C", "inactive", null), player("d", "D", "inactive", null)];
    const completed: PaddleGameWithPlayers = {
      id: "g1", sessionId: "session-1", gameNumber: 1, courtNumber: 1, team1Score: 11, team2Score: 8,
      winnerTeam: 1, status: "completed", startedAt: "2026-05-01T01:00:00.000Z", finishedAt: "2026-05-01T01:15:00.000Z", createdAt: "2026-05-01T01:00:00.000Z",
      participants: players.map((p, index) => ({
        id: `gp-${p.id}`, sessionId: "session-1", gameId: "g1", sessionPlayerId: p.id,
        teamNumber: index < 2 ? 1 : 2, player: p,
      })),
    };
    const inProgress = { ...completed, id: "g2", gameNumber: 2, status: "in_progress" as const, team1Score: null, team2Score: null, winnerTeam: null, finishedAt: null };
    const stats = calculatePaddleSessionStatistics(session, players, [completed, inProgress]);
    assert.equal(stats.completedGames, 1);
    assert.equal(stats.durationMinutes, 60);
    assert.equal(stats.averageGamesPerPlayer, 1);
    assert.equal(stats.players.find((item) => item.playerId === "a")?.wins, 1);
    assert.equal(stats.players.find((item) => item.playerId === "c")?.losses, 1);
    assert.equal(stats.players.find((item) => item.playerId === "a")?.pointsScored, 11);
    assert.equal(stats.players.find((item) => item.playerId === "a")?.pointsConceded, 8);
    assert.equal(stats.partnerships.length, 2);
    assert.equal(stats.matchups.length, 4);
  });
});
