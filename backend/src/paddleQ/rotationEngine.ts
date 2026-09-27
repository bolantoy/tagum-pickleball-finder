/**
 * Pure Paddle Q rotation recommendation logic.
 *
 * Fairness policy: queue order represents waiting opportunity. The engine
 * fills the next round from the waiting queue head; completed players are
 * appended by the caller when it commits a game. Raw session game totals are
 * deliberately diagnostic only, so a late arrival cannot jump the queue.
 */

export type PaddleRotationPlayerState = "waiting" | "playing" | "inactive";
export type PaddleRotationTeam = 1 | 2;

export interface PaddleRotationPlayer {
  id: string;
  displayName: string;
  state: PaddleRotationPlayerState;
  queuePosition: number | null;
  joinedAt: string;
  gamesPlayed: number;
}

export interface PaddleRotationGameHistory {
  gameNumber: number;
  courtNumber: number;
  startedAt: string;
  finishedAt: string;
  participants: Array<{
    playerId: string;
    teamNumber: PaddleRotationTeam;
  }>;
}

export interface ForcedPaddleGame {
  courtNumber: number;
  team1PlayerIds: [string, string];
  team2PlayerIds: [string, string];
}

export interface PaddleRotationConstraints {
  /** Players that must be included, with teams still recommended by the engine. */
  requiredPlayerIds?: string[];
  /** Players the organizer has skipped for this recommendation. */
  excludedPlayerIds?: string[];
  /** Exact court/team assignments selected by the organizer. */
  forcedGames?: ForcedPaddleGame[];
}

export type PaddleRandomSource = () => number;

export interface PaddleRotationSnapshot {
  players: PaddleRotationPlayer[];
  completedGames: PaddleRotationGameHistory[];
  courtCount: number;
  courtsToPlay?: number;
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
  };
}

interface Pairing {
  team1: [PaddleRotationPlayer, PaddleRotationPlayer];
  team2: [PaddleRotationPlayer, PaddleRotationPlayer];
  partnerCost: number;
  opponentCost: number;
}

interface PairingPlan {
  pairings: Pairing[];
  partnerCost: number;
  opponentCost: number;
}

const pairKey = (a: string, b: string): string => [a, b].sort().join("\u0000");

/** Creates a reproducible [0, 1) random source without global randomness. */
export function createSeededPaddleRandom(seed: number): PaddleRandomSource {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRelationshipCosts(games: PaddleRotationGameHistory[]) {
  const sortedGames = [...games].sort((a, b) =>
    a.finishedAt.localeCompare(b.finishedAt) || a.gameNumber - b.gameNumber
  );
  const partnerCost = new Map<string, number>();
  const opponentCost = new Map<string, number>();

  sortedGames.forEach((game, index) => {
    const participants = game.participants;
    for (let i = 0; i < participants.length; i += 1) {
      for (let j = i + 1; j < participants.length; j += 1) {
        const first = participants[i];
        const second = participants[j];
        const key = pairKey(first.playerId, second.playerId);
        // More recent repeats carry greater cost; a repeat is still allowed
        // when all fair alternatives repeat a relationship.
        const recencyWeight = index + 1;
        const target = first.teamNumber === second.teamNumber ? partnerCost : opponentCost;
        target.set(key, (target.get(key) ?? 0) + recencyWeight);
      }
    }
  });

  return { partnerCost, opponentCost };
}

function courtPairingOptions(players: PaddleRotationPlayer[], costs: ReturnType<typeof buildRelationshipCosts>): Pairing[] {
  if (players.length !== 4) throw new Error("Each Paddle Q game must have four players");
  const [a, b, c, d] = players;
  const pairs: Array<[[PaddleRotationPlayer, PaddleRotationPlayer], [PaddleRotationPlayer, PaddleRotationPlayer]]> = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];

  return pairs.map(([team1, team2]) => {
    const partnerRepeatCost =
      (costs.partnerCost.get(pairKey(team1[0].id, team1[1].id)) ?? 0) +
      (costs.partnerCost.get(pairKey(team2[0].id, team2[1].id)) ?? 0);
    const opponentRepeatCost = team1.reduce(
      (sum, left) => sum + team2.reduce(
        (inner, right) => inner + (costs.opponentCost.get(pairKey(left.id, right.id)) ?? 0),
        0
      ),
      0
    );
    return { team1, team2, partnerCost: partnerRepeatCost, opponentCost: opponentRepeatCost };
  });
}

function getForcedPlayers(
  forcedGames: ForcedPaddleGame[],
  waitingById: Map<string, PaddleRotationPlayer>,
  courtCount: number
): Map<number, PaddleRotationPlayer[]> {
  const byCourt = new Map<number, PaddleRotationPlayer[]>();
  const seenPlayers = new Set<string>();
  for (const forced of forcedGames) {
    if (!Number.isInteger(forced.courtNumber) || forced.courtNumber < 1 || forced.courtNumber > courtCount) {
      throw new Error(`Forced court number ${forced.courtNumber} is outside the session court count`);
    }
    if (byCourt.has(forced.courtNumber)) throw new Error(`Court ${forced.courtNumber} was forced more than once`);
    const ids = [...forced.team1PlayerIds, ...forced.team2PlayerIds];
    if (new Set(ids).size !== 4) throw new Error("A forced game must contain four distinct players");
    const players = ids.map((id) => {
      const player = waitingById.get(id);
      if (!player) throw new Error(`Forced player ${id} is not waiting`);
      if (seenPlayers.has(id)) throw new Error(`Player ${id} was assigned to multiple courts`);
      seenPlayers.add(id);
      return player;
    });
    byCourt.set(forced.courtNumber, players);
  }
  return byCourt;
}

/** Recommends one round. It never mutates the supplied snapshot or history. */
export function recommendPaddleRotation(
  snapshot: PaddleRotationSnapshot,
  random: PaddleRandomSource,
  constraints: PaddleRotationConstraints = {}
): PaddleRotationRecommendation {
  if (!Number.isInteger(snapshot.courtCount) || snapshot.courtCount < 1) {
    throw new Error("Session courtCount must be a positive integer");
  }
  const requestedCourts = snapshot.courtsToPlay ?? snapshot.courtCount;
  if (!Number.isInteger(requestedCourts) || requestedCourts < 1 || requestedCourts > snapshot.courtCount) {
    throw new Error("courtsToPlay must be between one and the session court count");
  }

  const waiting = snapshot.players.filter((player) => player.state === "waiting");
  const ids = new Set<string>();
  const queuePositions = new Set<number>();
  for (const player of snapshot.players) {
    if (ids.has(player.id)) throw new Error(`Duplicate Paddle Q player id: ${player.id}`);
    ids.add(player.id);
  }
  for (const player of waiting) {
    if (!Number.isInteger(player.queuePosition) || (player.queuePosition as number) < 1) {
      throw new Error(`Waiting player ${player.id} must have a positive queue position`);
    }
    if (queuePositions.has(player.queuePosition as number)) {
      throw new Error(`Duplicate waiting queue position: ${player.queuePosition}`);
    }
    queuePositions.add(player.queuePosition as number);
    if (!Number.isInteger(player.gamesPlayed) || player.gamesPlayed < 0) {
      throw new Error(`Player ${player.id} must have a non-negative gamesPlayed count`);
    }
  }

  const waitingById = new Map(waiting.map((player) => [player.id, player]));
  const excluded = new Set(constraints.excludedPlayerIds ?? []);
  const forcedByCourt = getForcedPlayers(constraints.forcedGames ?? [], waitingById, snapshot.courtCount);
  const forcedPlayerIds = new Set([...forcedByCourt.values()].flat().map((player) => player.id));
  for (const forcedId of forcedPlayerIds) {
    if (excluded.has(forcedId)) throw new Error(`Forced player ${forcedId} is also excluded`);
  }

  const requiredIds = new Set([...(constraints.requiredPlayerIds ?? []), ...forcedPlayerIds]);
  for (const requiredId of requiredIds) {
    if (!waitingById.has(requiredId)) throw new Error(`Required player ${requiredId} is not waiting`);
    if (excluded.has(requiredId)) throw new Error(`Required player ${requiredId} is also excluded`);
  }
  const forcedCourtCount = forcedByCourt.size;
  const availablePlayers = waiting.filter((player) => !excluded.has(player.id)).length;
  const possibleCourts = Math.min(requestedCourts, Math.floor(availablePlayers / 4));
  const courtCount = Math.max(forcedCourtCount, possibleCourts);
  const playerCapacity = courtCount * 4;
  if (forcedCourtCount > possibleCourts) throw new Error("Not enough eligible players to fill forced games");
  if (requiredIds.size > playerCapacity) throw new Error("Required players exceed the next-round capacity");

  const orderedWaiting = [...waiting].sort(
    (a, b) => (a.queuePosition as number) - (b.queuePosition as number) || a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id)
  );
  const selected = new Map<string, PaddleRotationPlayer>();
  for (const player of waiting) if (requiredIds.has(player.id)) selected.set(player.id, player);
  for (const player of orderedWaiting) {
    if (selected.size >= playerCapacity) break;
    if (!excluded.has(player.id)) selected.set(player.id, player);
  }

  const selectedPlayers = [...selected.values()].sort(
    (a, b) => (a.queuePosition as number) - (b.queuePosition as number) || a.id.localeCompare(b.id)
  );
  const actualCourtCount = Math.floor(selectedPlayers.length / 4);
  const forcedPlayerCount = forcedPlayerIds.size;
  if (forcedPlayerCount > actualCourtCount * 4) throw new Error("Forced assignments exceed available player capacity");

  const assigned = new Set<string>();
  const playerGroups: Array<{ courtNumber: number; players: PaddleRotationPlayer[]; forced?: ForcedPaddleGame }> = [];
  for (const [courtNumber, players] of forcedByCourt) {
    playerGroups.push({ courtNumber, players, forced: (constraints.forcedGames ?? []).find((game) => game.courtNumber === courtNumber) });
    for (const player of players) assigned.add(player.id);
  }
  const remainingPlayers = selectedPlayers.filter((player) => !assigned.has(player.id));
  const openCourtNumbers = Array.from({ length: snapshot.courtCount }, (_, index) => index + 1)
    .filter((number) => !forcedByCourt.has(number))
    .slice(0, actualCourtCount - forcedByCourt.size);
  for (let i = 0; i < openCourtNumbers.length; i += 1) {
    playerGroups.push({ courtNumber: openCourtNumbers[i], players: remainingPlayers.slice(i * 4, i * 4 + 4) });
  }
  playerGroups.sort((a, b) => a.courtNumber - b.courtNumber);

  const costs = buildRelationshipCosts(snapshot.completedGames);
  const options = playerGroups.map((group) => {
    if (group.forced) {
      const team1 = group.forced.team1PlayerIds.map((id) => waitingById.get(id)!) as [PaddleRotationPlayer, PaddleRotationPlayer];
      const team2 = group.forced.team2PlayerIds.map((id) => waitingById.get(id)!) as [PaddleRotationPlayer, PaddleRotationPlayer];
      // Preserve exact organizer team assignments and report their history costs.
      const partnerRepeatCost = (costs.partnerCost.get(pairKey(team1[0].id, team1[1].id)) ?? 0) +
        (costs.partnerCost.get(pairKey(team2[0].id, team2[1].id)) ?? 0);
      const opponentRepeatCost = team1.reduce((sum, left) => sum + team2.reduce(
        (inner, right) => inner + (costs.opponentCost.get(pairKey(left.id, right.id)) ?? 0), 0
      ), 0);
      return [{ team1, team2, partnerCost: partnerRepeatCost, opponentCost: opponentRepeatCost }];
    }
    return courtPairingOptions(group.players, costs);
  });

  let best: PairingPlan | null = null;
  const tiedPlans: PairingPlan[] = [];
  const buildPlans = (index: number, chosen: Pairing[]) => {
    if (index === options.length) {
      const plan: PairingPlan = {
        pairings: [...chosen],
        partnerCost: chosen.reduce((sum, pairing) => sum + pairing.partnerCost, 0),
        opponentCost: chosen.reduce((sum, pairing) => sum + pairing.opponentCost, 0),
      };
      if (!best || plan.partnerCost < best.partnerCost ||
        (plan.partnerCost === best.partnerCost && plan.opponentCost < best.opponentCost)) {
        best = plan;
        tiedPlans.length = 0;
        tiedPlans.push(plan);
      } else if (plan.partnerCost === best.partnerCost && plan.opponentCost === best.opponentCost) {
        tiedPlans.push(plan);
      }
      return;
    }
    for (const option of options[index]) buildPlans(index + 1, [...chosen, option]);
  };
  buildPlans(0, []);

  const tieBreakCandidates = tiedPlans.length;
  let selectedPlan = tiedPlans[0] ?? null;
  if (tieBreakCandidates > 1) {
    const randomValue = random();
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
      throw new Error("Random source must return a finite number in [0, 1)");
    }
    selectedPlan = tiedPlans[Math.floor(randomValue * tiedPlans.length)];
  }
  const courts: PaddleCourtRecommendation[] = selectedPlan
    ? playerGroups.map((group, index) => ({
      courtNumber: group.courtNumber,
      team1: selectedPlan.pairings[index].team1,
      team2: selectedPlan.pairings[index].team2,
      reason: group.forced
        ? "Organizer-forced teams were preserved."
        : "Players were selected by waiting-queue order; teams minimize partner repetition, then opponent repetition.",
    }))
    : [];
  const selectedIds = new Set(selectedPlayers.map((player) => player.id));
  const sittingOut = orderedWaiting.filter((player) => !selectedIds.has(player.id));

  return {
    courts,
    sittingOut,
    metadata: {
      selectionPolicy: "Waiting-queue order is the fairness order; gamesPlayed is reported but does not promote late arrivals.",
      eligiblePlayerCount: waiting.length,
      selectedPlayerIds: selectedPlayers.map((player) => player.id),
      sittingOutPlayerIds: sittingOut.map((player) => player.id),
      selectedGameCounts: selectedPlayers.map(({ id, gamesPlayed }) => ({ playerId: id, gamesPlayed })),
      partnerRepeatCost: selectedPlan?.partnerCost ?? 0,
      opponentRepeatCost: selectedPlan?.opponentCost ?? 0,
      tieBreakCandidates,
    },
  };
}
