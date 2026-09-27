import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useTheme } from "../context/ThemeContext";
import { usePaddleQSessionStorage } from "../context/PaddleQSessionContext";
import { Colors } from "../constants/colors";
import { FontWeight, Radius, Spacing, Typography } from "../constants/design";
import EmptyState from "../components/EmptyState";
import ErrorMessage from "../components/ErrorMessage";
import LoadingSpinner from "../components/LoadingSpinner";
import { PaddleQApiError, paddleQApi } from "../services/paddleQApi";
import type { PaddleForcedGame, PaddleRotationPlayer, PaddleRotationRecommendation } from "../types/paddleQ";
import type { PaddleQStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<PaddleQStackParamList, "Rotation">;

function safeMessage(error: unknown): { title: string; message: string; missing: boolean } {
  if (error instanceof PaddleQApiError && (error.status === 404 || error.code === "NOT_FOUND")) {
    return { title: "Session not found", message: "This session is no longer available.", missing: true };
  }
  if (error instanceof PaddleQApiError && (error.status === 0 || error.code === "NETWORK_ERROR")) {
    return { title: "Connection problem", message: "Paddle Q could not be reached. Check your connection and try again.", missing: false };
  }
  if (error instanceof PaddleQApiError && (error.code === "INVALID_STATE" || error.status === 400)) {
    return { title: "Recommendation unavailable", message: "A round can only be recommended while the session is active.", missing: false };
  }
  if (error instanceof PaddleQApiError && error.status >= 500) {
    return { title: "Paddle Q is unavailable", message: "The recommendation could not be loaded. Try again shortly.", missing: false };
  }
  return { title: "Recommendation unavailable", message: "The recommended round could not be loaded. Try again.", missing: false };
}

function startErrorMessage(error: unknown): { message: string; unauthorized: boolean; stale: boolean } {
  if (error instanceof PaddleQApiError && (error.status === 401 || error.status === 403 || error.code.startsWith("ORGANIZER_CAPABILITY"))) {
    return { message: "Organizer access is no longer valid. This screen is now read-only; return to the lobby to continue.", unauthorized: true, stale: false };
  }
  if (error instanceof PaddleQApiError && (error.status === 409 || error.code === "INVALID_STATE" || error.code === "CONFLICT")) {
    return { message: "The session or queue changed before the round could start. A fresh recommendation is loading.", unauthorized: false, stale: true };
  }
  if (error instanceof PaddleQApiError && (error.status === 0 || error.code === "NETWORK_ERROR")) {
    return { message: "Paddle Q could not be reached. Check your connection and try again.", unauthorized: false, stale: false };
  }
  if (error instanceof PaddleQApiError && error.status === 404) {
    return { message: "This session is no longer available.", unauthorized: false, stale: false };
  }
  return { message: "The round could not be started. Refresh the recommendation and try again.", unauthorized: false, stale: false };
}

export default function PaddleQRotationScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const storage = usePaddleQSessionStorage();
  const sessionId = route.params.sessionId;
  const [recommendation, setRecommendation] = useState<PaddleRotationRecommendation | null>(null);
  const [capabilityAvailable, setCapabilityAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [authorizationRejected, setAuthorizationRejected] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedGames, setEditedGames] = useState<PaddleForcedGame[] | null>(null);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const startLock = useRef(false);
  const loadLock = useRef(false);
  const mounted = useRef(true);
  const c = theme.colors;

  const loadRecommendation = useCallback(async (pull = false) => {
    if (loadLock.current) return false;
    loadLock.current = true;
    if (pull) setRefreshing(true);
    try {
      const next = await paddleQApi.recommendRotation(sessionId);
      if (!mounted.current) return;
      setRecommendation(next);
      setEditedGames(null);
      setEditing(false);
      setError(null);
      return true;
    } catch (reason) {
      if (!mounted.current) return;
      const mapped = safeMessage(reason);
      setError({ title: mapped.title, message: mapped.message });
      return false;
    } finally {
      loadLock.current = false;
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => { void loadRecommendation(); }, [loadRecommendation]);

  useEffect(() => {
    let cancelled = false;
    void storage.getOrganizerCapability(sessionId).then((capability) => {
      if (!cancelled) setCapabilityAvailable(Boolean(capability));
    }).catch(() => {
      if (!cancelled) setCapabilityAvailable(false);
    });
    return () => { cancelled = true; };
  }, [sessionId, storage]);

  const startRound = async () => {
    if (startLock.current || starting || !capabilityAvailable || authorizationRejected || !recommendation?.courts.length) return;
    startLock.current = true;
    setStarting(true);
    setError(null);
    try {
      const capability = await storage.getOrganizerCapability(sessionId);
      if (!capability) {
        setCapabilityAvailable(false);
        setError({ title: "Organizer access required", message: "No organizer capability is saved on this device. The recommendation remains available in read-only mode." });
        return;
      }
      // Organizer selections are constraints; the backend recomputes and validates
      // them against its current waiting queue before atomically starting games.
      await paddleQApi.startRecommendedRound(sessionId, capability, editedGames ? { constraints: { forcedGames: editedGames } } : undefined);
      navigation.navigate("SessionLobby", { sessionId });
    } catch (reason) {
      const mapped = startErrorMessage(reason);
      if (mapped.unauthorized) {
        setAuthorizationRejected(true);
        setCapabilityAvailable(false);
      }
      setError({ title: mapped.unauthorized ? "Organizer access is no longer valid" : mapped.stale ? "Queue changed" : "Could not start round", message: mapped.message });
      if (mapped.stale) {
        const refreshed = await loadRecommendation();
        if (refreshed && mounted.current) {
          setError({ title: "Queue changed", message: "The shared queue changed. A fresh recommendation is shown below; review it before starting." });
        }
      }
    } finally {
      startLock.current = false;
      if (mounted.current) setStarting(false);
    }
  };

  const eligiblePlayers = React.useMemo(() => {
    if (!recommendation) return [] as PaddleRotationPlayer[];
    const byId = new Map<string, PaddleRotationPlayer>();
    recommendation.courts.forEach((court) => [...court.team1, ...court.team2].forEach((player) => byId.set(player.id, player)));
    recommendation.sittingOut.forEach((player) => byId.set(player.id, player));
    return [...byId.values()].sort((a, b) => (a.queuePosition ?? Number.MAX_SAFE_INTEGER) - (b.queuePosition ?? Number.MAX_SAFE_INTEGER));
  }, [recommendation]);
  const playerById = React.useMemo(() => new Map(eligiblePlayers.map((player) => [player.id, player])), [eligiblePlayers]);
  const visibleGames: PaddleForcedGame[] = editedGames ?? recommendation?.courts.map((court) => ({
    courtNumber: court.courtNumber,
    team1PlayerIds: [court.team1[0].id, court.team1[1].id],
    team2PlayerIds: [court.team2[0].id, court.team2[1].id],
  })) ?? [];
  const visibleSittingOut = React.useMemo(() => {
    const assigned = new Set(visibleGames.flatMap((game) => [...game.team1PlayerIds, ...game.team2PlayerIds]));
    return eligiblePlayers.filter((player) => !assigned.has(player.id));
  }, [eligiblePlayers, visibleGames]);

  const beginEditing = () => {
    if (!capabilityAvailable || !recommendation) return;
    setEditedGames(recommendation.courts.map((court) => ({
      courtNumber: court.courtNumber,
      team1PlayerIds: [court.team1[0].id, court.team1[1].id],
      team2PlayerIds: [court.team2[0].id, court.team2[1].id],
    })));
    setEditing(true);
  };

  const cycleAssignedPlayer = (gameIndex: number, team: 1 | 2, seat: 0 | 1, direction: -1 | 1) => {
    setEditedGames((current) => {
      if (!current || eligiblePlayers.length < 2) return current;
      const currentIds = team === 1 ? current[gameIndex].team1PlayerIds : current[gameIndex].team2PlayerIds;
      const currentId = currentIds[seat];
      const currentIndex = eligiblePlayers.findIndex((player) => player.id === currentId);
      const replacement = eligiblePlayers[(currentIndex + direction + eligiblePlayers.length) % eligiblePlayers.length];
      if (!replacement || replacement.id === currentId) return current;
      const next = current.map((game) => ({
        ...game,
        team1PlayerIds: [...game.team1PlayerIds] as [string, string],
        team2PlayerIds: [...game.team2PlayerIds] as [string, string],
      }));
      const targetIds = team === 1 ? next[gameIndex].team1PlayerIds : next[gameIndex].team2PlayerIds;
      const replacementIndex = next.findIndex((game) => [...game.team1PlayerIds, ...game.team2PlayerIds].includes(replacement.id));
      if (replacementIndex >= 0) {
        const assignedGame = next[replacementIndex];
        const replacementTeam = assignedGame.team1PlayerIds.includes(replacement.id) ? assignedGame.team1PlayerIds : assignedGame.team2PlayerIds;
        const replacementSeat = replacementTeam.indexOf(replacement.id);
        replacementTeam[replacementSeat] = currentId;
      }
      targetIds[seat] = replacement.id;
      return next;
    });
  };

  const ctaCount = recommendation?.courts.length ?? 0;
  const waitingCount = recommendation?.metadata.eligiblePlayerCount ?? 0;

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar barStyle={theme.isDark ? "light-content" : "dark-content"} backgroundColor={c.background} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.navigate("SessionLobby", { sessionId })} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Return to session lobby">
          <Ionicons name="arrow-back" size={23} color={c.text} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: c.text }]}>Rotation</Text>
        <TouchableOpacity onPress={() => void loadRecommendation(true)} style={styles.refreshButton} accessibilityRole="button" accessibilityLabel="Refresh recommendation" disabled={refreshing || loading}>
          <Ionicons name="refresh" size={20} color={refreshing || loading ? c.textMuted : Colors.brand.primary} />
        </TouchableOpacity>
      </View>

      {loading ? <LoadingSpinner message="Preparing recommended round" /> : !recommendation && error ? (
        <ErrorMessage title={error.title} message={error.message} onRetry={() => void loadRecommendation()} />
      ) : recommendation ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadRecommendation(true)} tintColor={Colors.brand.primary} colors={[Colors.brand.primary]} />}
        >
          {error ? <ErrorMessage title={error.title} message={error.message} style={styles.errorCard} /> : null}
          <View style={[styles.previewBanner, { backgroundColor: c.surface, borderColor: Colors.brand.primary }]}>
            <View style={styles.previewTitleRow}>
              <Ionicons name="git-branch-outline" size={22} color={Colors.brand.primary} />
              <Text style={[styles.previewTitle, { color: c.text }]}>Recommended Round</Text>
            </View>
            <Text style={[styles.previewCopy, { color: c.textSecondary }]}>This is a proposed round. Paddle Q uses the shared queue to keep game opportunities fair, then considers partner and opponent variety.</Text>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <SummaryItem value={`${ctaCount}`} label={ctaCount === 1 ? "court for next games" : "courts for next games"} />
            <View style={[styles.summaryDivider, { backgroundColor: c.border }]} />
            <SummaryItem value={`${waitingCount}`} label={waitingCount === 1 ? "waiting player" : "waiting players"} />
          </View>

          {recommendation.courts.length === 0 ? (
            (recommendation.metadata.availableCourtCount ?? 0) === 0 ? (
              <EmptyState icon="tennisball-outline" title="All session courts are occupied" subtitle="A new game can be recommended when a court becomes available." style={styles.emptyState} />
            ) : waitingCount === 0 ? (
              <EmptyState icon="people-outline" title="No players available" subtitle="Waiting players will appear in the next recommendation." style={styles.emptyState} />
            ) : (
              <EmptyState icon="people-outline" title="Not enough players for a game" subtitle={`${waitingCount} waiting ${waitingCount === 1 ? "player is" : "players are"} available. Four players are needed for each doubles game.`} style={styles.emptyState} />
            )
          ) : (
            <View style={styles.gameList}>
              {visibleGames.map((game, index) => (
                <RecommendedCourt
                  key={game.courtNumber}
                  game={game}
                  playerById={playerById}
                  editing={editing && !starting}
                  onCycle={(team, seat, direction) => cycleAssignedPlayer(index, team, seat, direction)}
                />
              ))}
            </View>
          )}

          {capabilityAvailable && recommendation.courts.length > 0 ? (
            <View style={styles.editActions}>
              {editing ? (
                <>
                  <TouchableOpacity style={[styles.editButton, starting && styles.disabled, { borderColor: c.border }]} onPress={() => { setEditedGames(null); setEditing(false); }} disabled={starting} accessibilityRole="button">
                    <Text style={[styles.editButtonText, { color: c.text }]}>Use Recommendation</Text>
                  </TouchableOpacity>
                  <Text style={[styles.editHint, { color: c.textSecondary }]}>Organizer edits are checked against the current waiting queue when started.</Text>
                </>
              ) : (
                <TouchableOpacity style={[styles.editButton, starting && styles.disabled, { borderColor: c.border }]} onPress={beginEditing} disabled={starting} accessibilityRole="button">
                  <Ionicons name="create-outline" size={18} color={Colors.brand.primary} />
                  <Text style={[styles.editButtonText, { color: c.text }]}>Edit Proposed Players</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {visibleSittingOut.length > 0 ? (
            <View>
              <Text style={[styles.sectionTitle, { color: c.text }]}>Waiting This Round</Text>
              <Text style={[styles.sectionSubtitle, { color: c.textSecondary }]}>These players remain in the shared queue.</Text>
              <View style={styles.waitingList}>
                {visibleSittingOut.map((player) => (
                  <View key={player.id} style={[styles.waitingRow, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLabel={`${player.displayName}, waiting this round`}>
                    <View style={[styles.waitingPosition, { backgroundColor: c.surfaceHigh }]}><Text style={[styles.waitingPositionText, { color: c.textSecondary }]}>{player.queuePosition ?? "—"}</Text></View>
                    <Text style={[styles.waitingName, { color: c.text }]}>{player.displayName}</Text>
                    <Text style={[styles.waitingTag, { color: c.textSecondary }]}>Waiting</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {authorizationRejected ? (
            <View style={[styles.accessNotice, { backgroundColor: c.surfaceHigh }]}><Ionicons name="eye-outline" size={19} color={c.textSecondary} /><Text style={[styles.accessText, { color: c.textSecondary }]}>Read-only mode. Return to the lobby to continue.</Text></View>
          ) : capabilityAvailable ? recommendation.courts.length > 0 ? (
            <TouchableOpacity style={[styles.startButton, starting && styles.disabled]} onPress={() => void startRound()} disabled={starting} accessibilityRole="button">
              {starting ? <LoadingSpinner size="small" /> : <><Ionicons name="play-circle-outline" size={21} color="#FFFFFF" /><Text style={styles.startButtonText}>{editedGames ? "Start Edited Round" : "Start Recommended Round"}</Text></>}
            </TouchableOpacity>
          ) : null : (
            <View style={[styles.accessNotice, { backgroundColor: c.surfaceHigh }]}><Ionicons name="lock-closed-outline" size={18} color={c.textSecondary} /><Text style={[styles.accessText, { color: c.textSecondary }]}>Organizer access is required to start this round. You can still review the recommendation.</Text></View>
          )}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function SummaryItem({ value, label }: { value: string; label: string }) {
  const { theme } = useTheme();
  return <View style={styles.summaryItem}><Text style={[styles.summaryValue, { color: theme.colors.text }]}>{value}</Text><Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>{label}</Text></View>;
}

function RecommendedCourt({ game, playerById, editing, onCycle }: {
  game: PaddleForcedGame;
  playerById: Map<string, PaddleRotationPlayer>;
  editing: boolean;
  onCycle: (team: 1 | 2, seat: 0 | 1, direction: -1 | 1) => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const team1 = game.team1PlayerIds.map((id) => playerById.get(id)?.displayName ?? "Player unavailable");
  const team2 = game.team2PlayerIds.map((id) => playerById.get(id)?.displayName ?? "Player unavailable");
  return (
    <View style={[styles.courtCard, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLabel={`Proposed court ${game.courtNumber}: Team one ${team1.join(" and ")}; Team two ${team2.join(" and ")}`}>
      <View style={styles.courtHeading}><Ionicons name="tennisball-outline" size={18} color={Colors.brand.primary} /><Text style={[styles.courtTitle, { color: c.text }]}>Court {game.courtNumber}</Text><View style={styles.proposedTag}><Text style={styles.proposedText}>Proposed</Text></View></View>
      <Team players={team1} label="Team 1 - Playing" />
      {editing ? <SeatEditor team={1} playerIds={game.team1PlayerIds} onCycle={onCycle} /> : null}
      <View style={[styles.divider, { borderColor: c.border }]}><Text style={[styles.vs, { color: c.textMuted }]}>VS</Text></View>
      <Team players={team2} label="Team 2 - Playing" />
      {editing ? <SeatEditor team={2} playerIds={game.team2PlayerIds} onCycle={onCycle} /> : null}
    </View>
  );
}

function SeatEditor({ team, playerIds, onCycle }: {
  team: 1 | 2;
  playerIds: [string, string];
  onCycle: (team: 1 | 2, seat: 0 | 1, direction: -1 | 1) => void;
}) {
  const { theme } = useTheme();
  return <View style={styles.seatEditor}>{playerIds.map((id, seat) => (
    <View key={`${team}-${seat}-${id}`} style={styles.seatControl}>
      <TouchableOpacity onPress={() => onCycle(team, seat as 0 | 1, -1)} style={styles.seatArrow} accessibilityRole="button" accessibilityLabel={`Change team ${team} player ${seat + 1} to previous eligible player`}>
        <Ionicons name="chevron-back" size={18} color={Colors.brand.primary} />
      </TouchableOpacity>
      <Text style={[styles.seatLabel, { color: theme.colors.textSecondary }]}>Change player {seat + 1}</Text>
      <TouchableOpacity onPress={() => onCycle(team, seat as 0 | 1, 1)} style={styles.seatArrow} accessibilityRole="button" accessibilityLabel={`Change team ${team} player ${seat + 1} to next eligible player`}>
        <Ionicons name="chevron-forward" size={18} color={Colors.brand.primary} />
      </TouchableOpacity>
    </View>
  ))}</View>;
}
function Team({ players, label }: { players: string[]; label: string }) {
  const { theme } = useTheme();
  return <View style={styles.team}><Text style={[styles.teamLabel, { color: theme.colors.textMuted }]}>{label}</Text><Text style={[styles.teamPlayers, { color: theme.colors.text }]}>{players.join(" + ")}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { minHeight: 52, paddingHorizontal: Spacing.md, flexDirection: "row", alignItems: "center" },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topBarTitle: { flex: 1, textAlign: "center", fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  refreshButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl },
  errorCard: { marginHorizontal: 0, marginTop: 0 },
  previewBanner: { padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, gap: Spacing.sm },
  previewTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  previewTitle: { fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  previewCopy: { fontSize: Typography.bodySmall, lineHeight: 20 },
  summaryCard: { minHeight: 66, borderWidth: 1, borderRadius: Radius.md, flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginTop: Spacing.sm, marginBottom: Spacing.md },
  summaryItem: { alignItems: "center", gap: Spacing.xs },
  summaryValue: { fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  summaryLabel: { fontSize: Typography.caption },
  summaryDivider: { width: 1, height: 38 },
  gameList: { gap: Spacing.sm, marginBottom: Spacing.md },
  courtCard: { padding: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, gap: Spacing.sm },
  courtHeading: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  courtTitle: { flex: 1, fontSize: Typography.body, fontWeight: FontWeight.bold },
  proposedTag: { borderRadius: Radius.pill, backgroundColor: "rgba(34,197,94,0.14)", paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  proposedText: { color: Colors.brand.primaryDark, fontSize: Typography.caption, fontWeight: FontWeight.semibold },
  team: { gap: Spacing.xs },
  teamLabel: { fontSize: Typography.caption, fontWeight: FontWeight.semibold },
  teamPlayers: { fontSize: Typography.body, fontWeight: FontWeight.semibold },
  seatEditor: { gap: Spacing.xs },
  seatControl: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: Radius.sm, backgroundColor: "rgba(34,197,94,0.08)" },
  seatArrow: { width: 44, height: 40, alignItems: "center", justifyContent: "center" },
  seatLabel: { fontSize: Typography.caption, fontWeight: FontWeight.semibold },
  editActions: { gap: Spacing.sm, marginBottom: Spacing.md },
  editButton: { minHeight: 44, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm },
  editButtonText: { fontSize: Typography.bodySmall, fontWeight: FontWeight.semibold },
  editHint: { fontSize: Typography.caption, textAlign: "center" },
  divider: { borderTopWidth: 1, alignItems: "center" },
  vs: { fontSize: 10, fontWeight: FontWeight.bold, marginTop: -7, paddingHorizontal: Spacing.sm },
  emptyState: { paddingVertical: Spacing.md },
  sectionTitle: { marginTop: Spacing.sm, fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  sectionSubtitle: { marginTop: Spacing.xs, marginBottom: Spacing.md, fontSize: Typography.caption },
  waitingList: { gap: Spacing.sm, marginBottom: Spacing.md },
  waitingRow: { minHeight: 58, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, flexDirection: "row", alignItems: "center", gap: Spacing.md },
  waitingPosition: { minWidth: 32, height: 32, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing.xs },
  waitingPositionText: { fontSize: Typography.caption, fontWeight: FontWeight.bold },
  waitingName: { flex: 1, fontSize: Typography.bodySmall, fontWeight: FontWeight.semibold },
  waitingTag: { fontSize: Typography.caption },
  accessNotice: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.lg },
  accessText: { flex: 1, fontSize: Typography.bodySmall, lineHeight: 20 },
  startButton: { minHeight: 48, borderRadius: Radius.md, backgroundColor: Colors.brand.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingHorizontal: Spacing.md, marginTop: Spacing.md },
  startButtonText: { color: "#FFFFFF", fontSize: Typography.bodySmall, fontWeight: FontWeight.bold },
  disabled: { opacity: 0.55 },
});
