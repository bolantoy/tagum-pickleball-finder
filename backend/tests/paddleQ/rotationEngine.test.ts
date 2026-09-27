import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSeededPaddleRandom,
  recommendPaddleRotation,
  type PaddleRotationGameHistory,
  type PaddleRotationPlayer,
  type PaddleRotationSnapshot,
} from "../../src/paddleQ/rotationEngine";

function makePlayers(count: number): PaddleRotationPlayer[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String.fromCharCode(65 + index),
    displayName: `Player ${String.fromCharCode(65 + index)}`,
    state: "waiting",
    queuePosition: index + 1,
    joinedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    gamesPlayed: 0,
  }));
}

function makeSnapshot(playerCount: number, courtCount = 1): PaddleRotationSnapshot {
  return { players: makePlayers(playerCount), completedGames: [], courtCount };
}

function fixedRandom(value = 0): () => number {
  return () => value;
}

function selectedIds(result: ReturnType<typeof recommendPaddleRotation>): string[] {
  return result.courts.flatMap((court) => [
    ...court.team1.map((player) => player.id),
    ...court.team2.map((player) => player.id),
  ]);
}

function recordAndRotate(
  snapshot: PaddleRotationSnapshot,
  result: ReturnType<typeof recommendPaddleRotation>,
  gameNumber: number
): PaddleRotationSnapshot {
  const selected = new Set(selectedIds(result));
  const selectedPlayers = snapshot.players.filter((player) => selected.has(player.id));
  const waitingPlayers = snapshot.players
    .filter((player) => player.state === "waiting" && !selected.has(player.id))
    .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0));
  const nextQueue = [...waitingPlayers, ...selectedPlayers].map((player, index) => ({
    ...player,
    state: "waiting" as const,
    queuePosition: index + 1,
    gamesPlayed: player.gamesPlayed + (selected.has(player.id) ? 1 : 0),
  }));
  const addedGames: PaddleRotationGameHistory[] = result.courts.map((court) => ({
    gameNumber,
    courtNumber: court.courtNumber,
    startedAt: new Date(Date.UTC(2026, 0, 2, 0, gameNumber)).toISOString(),
    finishedAt: new Date(Date.UTC(2026, 0, 2, 0, gameNumber, 1)).toISOString(),
    participants: [
      ...court.team1.map((player) => ({ playerId: player.id, teamNumber: 1 as const })),
      ...court.team2.map((player) => ({ playerId: player.id, teamNumber: 2 as const })),
    ],
  }));
  return {
    ...snapshot,
    players: nextQueue,
    completedGames: [...snapshot.completedGames, ...addedGames],
  };
}

describe("Paddle Q rotation engine", () => {
  it("builds a doubles game for four players", () => {
    const result = recommendPaddleRotation(makeSnapshot(4), fixedRandom());
    assert.equal(result.courts.length, 1);
    assert.equal(selectedIds(result).length, 4);
    assert.equal(result.sittingOut.length, 0);
  });

  for (const count of [5, 6, 7, 8]) {
    it(`handles ${count} players without a player-count-specific branch`, () => {
      const result = recommendPaddleRotation(makeSnapshot(count, 2), fixedRandom());
      assert.equal(result.courts.length, Math.floor(count / 4));
      assert.equal(selectedIds(result).length, Math.floor(count / 4) * 4);
      assert.equal(result.sittingOut.length, count % 4);
    });
  }

  it("uses one shared pool for multiple courts and never duplicates a player", () => {
    const result = recommendPaddleRotation(makeSnapshot(8, 2), fixedRandom());
    assert.equal(result.courts.length, 2);
    assert.equal(new Set(selectedIds(result)).size, 8);
  });

  it("starts a game on a free court while another session court is occupied", () => {
    const result = recommendPaddleRotation({ ...makeSnapshot(8, 2), availableCourtNumbers: [2] }, fixedRandom());
    assert.deepEqual(result.courts.map((court) => court.courtNumber), [2]);
    assert.equal(result.courts.length, 1);
    assert.equal(result.sittingOut.length, 4);
    assert.equal(result.metadata.availableCourtCount, 1);
  });

  it("uses both available courts when eight players are waiting", () => {
    const result = recommendPaddleRotation({ ...makeSnapshot(8, 2), availableCourtNumbers: [1, 2] }, fixedRandom());
    assert.deepEqual(result.courts.map((court) => court.courtNumber), [1, 2]);
    assert.equal(new Set(selectedIds(result)).size, 8);
  });

  it("starts only one game when two courts are free but only four players wait", () => {
    const result = recommendPaddleRotation({ ...makeSnapshot(4, 2), availableCourtNumbers: [1, 2] }, fixedRandom());
    assert.equal(result.courts.length, 1);
    assert.deepEqual(result.sittingOut, []);
  });

  it("does not recommend a game when every session court is occupied", () => {
    const result = recommendPaddleRotation({ ...makeSnapshot(4, 2), availableCourtNumbers: [] }, fixedRandom());
    assert.equal(result.courts.length, 0);
    assert.equal(result.sittingOut.length, 4);
    assert.equal(result.metadata.availableCourtCount, 0);
  });

  it("rejects organizer assignments to an occupied court", () => {
    assert.throws(() => recommendPaddleRotation({ ...makeSnapshot(4, 2), availableCourtNumbers: [2] }, fixedRandom(), {
      forcedGames: [{ courtNumber: 1, team1PlayerIds: ["A", "B"], team2PlayerIds: ["C", "D"] }],
    }), /not available/);
  });

  it("keeps game distribution balanced over simulated games for 5, 6, 7, and 8 players", () => {
    for (const playerCount of [5, 6, 7, 8]) {
      let snapshot = makeSnapshot(playerCount, 2);
      for (let game = 1; game <= 40; game += 1) {
        const result = recommendPaddleRotation(snapshot, createSeededPaddleRandom(game));
        snapshot = recordAndRotate(snapshot, result, game);
      }
      const counts = snapshot.players.map((player) => player.gamesPlayed);
      const spread = Math.max(...counts) - Math.min(...counts);
      const slots = snapshot.completedGames.length * 4;
      const theoreticalMinimumSpread = slots % playerCount === 0 ? 0 : 1;
      assert.ok(
        spread <= theoreticalMinimumSpread,
        `${playerCount} players: distribution spread ${spread}; expected at most ${theoreticalMinimumSpread}`
      );
    }
  });

  it("selects equal-count players by queue order", () => {
    const snapshot = makeSnapshot(5);
    const result = recommendPaddleRotation(snapshot, fixedRandom());
    assert.deepEqual(selectedIds(result).sort(), ["A", "B", "C", "D"]);
  });

  it("does not let a late player jump the queue because of fewer games", () => {
    const snapshot = makeSnapshot(7);
    snapshot.players.forEach((player, index) => {
      player.gamesPlayed = index < 3 ? 5 : index < 6 ? 4 : 0;
    });
    const result = recommendPaddleRotation(snapshot, fixedRandom());
    assert.deepEqual(result.metadata.selectedPlayerIds, ["A", "B", "C", "D"]);
    assert.equal(result.sittingOut.find((player) => player.id === "G")?.gamesPlayed, 0);
  });

  it("keeps a newly joined player at the back of the queue", () => {
    const snapshot = makeSnapshot(5);
    snapshot.players[4].gamesPlayed = 0;
    snapshot.players[4].joinedAt = "2026-02-01T00:00:00.000Z";
    const result = recommendPaddleRotation(snapshot, fixedRandom());
    assert.deepEqual(result.metadata.selectedPlayerIds, ["A", "B", "C", "D"]);
    assert.deepEqual(result.sittingOut.map((player) => player.id), ["E"]);
  });

  it("excludes inactive and playing players", () => {
    const snapshot = makeSnapshot(6);
    snapshot.players[0].state = "inactive";
    snapshot.players[0].queuePosition = null;
    snapshot.players[1].state = "playing";
    snapshot.players[1].queuePosition = null;
    const result = recommendPaddleRotation(snapshot, fixedRandom());
    assert.equal(result.courts.length, 1);
    assert.equal(selectedIds(result).includes("A"), false);
    assert.equal(selectedIds(result).includes("B"), false);
    assert.deepEqual(result.sittingOut, []);
  });

  it("avoids repeating a previous partnership when an alternative exists", () => {
    const snapshot = makeSnapshot(4);
    snapshot.completedGames = [{
      gameNumber: 1,
      courtNumber: 1,
      startedAt: "2026-01-01T01:00:00.000Z",
      finishedAt: "2026-01-01T01:10:00.000Z",
      participants: [
        { playerId: "A", teamNumber: 1 }, { playerId: "B", teamNumber: 1 },
        { playerId: "C", teamNumber: 2 }, { playerId: "D", teamNumber: 2 },
      ],
    }];
    const result = recommendPaddleRotation(snapshot, fixedRandom());
    const partnerships = [result.courts[0].team1, result.courts[0].team2].map((team) => team.map((p) => p.id).sort().join("+"));
    assert.equal(partnerships.includes("A+B"), false);
    assert.equal(partnerships.includes("C+D"), false);
  });

  it("avoids repeating opponents when partner costs are equivalent", () => {
    const snapshot = makeSnapshot(6);
    const games: PaddleRotationGameHistory[] = [];
    const partitions: Array<[string, string, string, string]> = [
      ["A", "B", "C", "D"], ["A", "C", "B", "D"], ["A", "D", "B", "C"],
    ];
    // Equalize teammate exposure for every possible pair among A-D.
    const order = [0, 1, 2, 2, 0, 1, 1, 2, 0];
    order.forEach((partitionIndex, index) => {
      const [a, b, c, d] = partitions[partitionIndex];
      games.push({
        gameNumber: index + 1,
        courtNumber: 1,
        startedAt: `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`,
        finishedAt: `2026-01-01T00:${String(index).padStart(2, "0")}:30.000Z`,
        participants: [
          { playerId: a, teamNumber: 1 }, { playerId: b, teamNumber: 1 },
          { playerId: c, teamNumber: 2 }, { playerId: d, teamNumber: 2 },
        ],
      });
    });
    // A and B have faced each other once more, with no added A-B partnership.
    games.push({
      gameNumber: 10,
      courtNumber: 1,
      startedAt: "2026-01-01T00:10:00.000Z",
      finishedAt: "2026-01-01T00:10:30.000Z",
      participants: [
        { playerId: "A", teamNumber: 1 }, { playerId: "E", teamNumber: 1 },
        { playerId: "B", teamNumber: 2 }, { playerId: "F", teamNumber: 2 },
      ],
    });
    snapshot.completedGames = games;
    const result = recommendPaddleRotation(snapshot, fixedRandom());
    const teammates = [result.courts[0].team1, result.courts[0].team2].some((team) =>
      team.some((player) => player.id === "A") && team.some((player) => player.id === "B")
    );
    assert.equal(teammates, true);
  });

  it("allows repetition when all partnership histories are equivalent", () => {
    const snapshot = makeSnapshot(4);
    const partitions: Array<[string, string, string, string]> = [
      ["A", "B", "C", "D"], ["A", "C", "B", "D"], ["A", "D", "B", "C"],
    ];
    const balancedPartitionOrder = [0, 1, 2, 2, 0, 1, 1, 2, 0];
    snapshot.completedGames = balancedPartitionOrder.map((partitionIndex, index) => {
      const [a, b, c, d] = partitions[partitionIndex];
      return {
        gameNumber: index + 1,
        courtNumber: 1,
        startedAt: `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`,
        finishedAt: `2026-01-01T00:${String(index).padStart(2, "0")}:30.000Z`,
        participants: [
          { playerId: a, teamNumber: 1 as const }, { playerId: b, teamNumber: 1 as const },
          { playerId: c, teamNumber: 2 as const }, { playerId: d, teamNumber: 2 as const },
        ],
      };
    });
    const result = recommendPaddleRotation(snapshot, fixedRandom());
    assert.equal(result.metadata.tieBreakCandidates, 3);
    assert.ok(result.metadata.partnerRepeatCost > 0);
  });

  it("does not use scores in rotation", () => {
    const base = makeSnapshot(4);
    const withIrrelevantResults = {
      ...base,
      completedGames: [{
        gameNumber: 1,
        courtNumber: 1,
        startedAt: "2026-01-01T01:00:00.000Z",
        finishedAt: "2026-01-01T01:10:00.000Z",
        participants: [
          { playerId: "A", teamNumber: 1 as const }, { playerId: "B", teamNumber: 1 as const },
          { playerId: "C", teamNumber: 2 as const }, { playerId: "D", teamNumber: 2 as const },
        ],
        team1Score: 11,
        team2Score: 0,
        winnerTeam: 1,
      } as PaddleRotationGameHistory],
    };
    const baseline = recommendPaddleRotation(base, createSeededPaddleRandom(77));
    const actual = recommendPaddleRotation(withIrrelevantResults, createSeededPaddleRandom(77));
    assert.deepEqual(selectedIds(actual), selectedIds(baseline));
    assert.deepEqual(actual.courts.map((court) => court.team1.map((p) => p.id)), baseline.courts.map((court) => court.team1.map((p) => p.id)));
  });

  it("does not use wins in rotation", () => {
    const base = makeSnapshot(4);
    const withIrrelevantWins = {
      ...base,
      completedGames: [{
        gameNumber: 1,
        courtNumber: 1,
        startedAt: "2026-01-01T01:00:00.000Z",
        finishedAt: "2026-01-01T01:10:00.000Z",
        participants: [
          { playerId: "A", teamNumber: 1 as const }, { playerId: "B", teamNumber: 1 as const },
          { playerId: "C", teamNumber: 2 as const }, { playerId: "D", teamNumber: 2 as const },
        ],
        winnerTeam: 2,
      } as PaddleRotationGameHistory],
    };
    const baseline = recommendPaddleRotation(base, createSeededPaddleRandom(81));
    const actual = recommendPaddleRotation(withIrrelevantWins, createSeededPaddleRandom(81));
    assert.deepEqual(selectedIds(actual), selectedIds(baseline));
    assert.deepEqual(actual.courts.map((court) => court.team1.map((p) => p.id)), baseline.courts.map((court) => court.team1.map((p) => p.id)));
  });

  it("uses a seeded random source deterministically for equivalent choices", () => {
    const snapshot = makeSnapshot(4);
    const first = recommendPaddleRotation(snapshot, createSeededPaddleRandom(123));
    const second = recommendPaddleRotation(snapshot, createSeededPaddleRandom(123));
    assert.deepEqual(first.courts.map((court) => [court.team1.map((p) => p.id), court.team2.map((p) => p.id)]),
      second.courts.map((court) => [court.team1.map((p) => p.id), court.team2.map((p) => p.id)]));
  });

  it("respects organizer-forced player and team selections", () => {
    const snapshot = makeSnapshot(5);
    const result = recommendPaddleRotation(snapshot, fixedRandom(), {
      forcedGames: [{ courtNumber: 1, team1PlayerIds: ["A", "E"], team2PlayerIds: ["B", "C"] }],
    });
    assert.deepEqual(result.courts[0].team1.map((player) => player.id), ["A", "E"]);
    assert.deepEqual(result.courts[0].team2.map((player) => player.id), ["B", "C"]);
    assert.deepEqual(result.sittingOut.map((player) => player.id), ["D"]);
  });

  it("derives partner and opponent history from completed games", () => {
    const snapshot = makeSnapshot(4);
    snapshot.completedGames = [{
      gameNumber: 1,
      courtNumber: 1,
      startedAt: "2026-01-01T01:00:00.000Z",
      finishedAt: "2026-01-01T01:10:00.000Z",
      participants: [
        { playerId: "A", teamNumber: 1 }, { playerId: "B", teamNumber: 1 },
        { playerId: "C", teamNumber: 2 }, { playerId: "D", teamNumber: 2 },
      ],
    }];
    const result = recommendPaddleRotation(snapshot, fixedRandom());
    assert.equal(result.metadata.partnerRepeatCost, 0);
    assert.ok(result.metadata.opponentRepeatCost > 0);
  });

  it("does not mutate the snapshot", () => {
    const snapshot = makeSnapshot(5);
    const before = structuredClone(snapshot);
    recommendPaddleRotation(snapshot, fixedRandom());
    assert.deepEqual(snapshot, before);
  });
});
