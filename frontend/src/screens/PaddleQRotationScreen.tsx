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
import type { PaddleCourtRecommendation, PaddleRotationRecommendation } from "../types/paddleQ";
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
      // Intentionally send no preview assignment: the backend recomputes the round atomically.
      await paddleQApi.startRecommendedRound(sessionId, capability);
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
            <SummaryItem value={`${ctaCount}`} label={ctaCount === 1 ? "court in use" : "courts in use"} />
            <View style={[styles.summaryDivider, { backgroundColor: c.border }]} />
            <SummaryItem value={`${waitingCount}`} label={waitingCount === 1 ? "waiting player" : "waiting players"} />
          </View>

          {recommendation.courts.length === 0 ? (
            waitingCount === 0 ? (
              <EmptyState icon="people-outline" title="No players available" subtitle="Waiting players will appear in the next recommendation." style={styles.emptyState} />
            ) : (
              <EmptyState icon="people-outline" title="Not enough players for a game" subtitle={`${waitingCount} waiting ${waitingCount === 1 ? "player is" : "players are"} available. Four players are needed for each doubles game.`} style={styles.emptyState} />
            )
          ) : (
            <View style={styles.gameList}>
              {recommendation.courts.map((court) => <RecommendedCourt key={court.courtNumber} court={court} />)}
            </View>
          )}

          {recommendation.sittingOut.length > 0 ? (
            <View>
              <Text style={[styles.sectionTitle, { color: c.text }]}>Waiting This Round</Text>
              <Text style={[styles.sectionSubtitle, { color: c.textSecondary }]}>These players remain in the shared queue.</Text>
              <View style={styles.waitingList}>
                {recommendation.sittingOut.map((player) => (
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
              {starting ? <LoadingSpinner size="small" /> : <><Ionicons name="play-circle-outline" size={21} color="#FFFFFF" /><Text style={styles.startButtonText}>Start Recommended Round</Text></>}
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

function RecommendedCourt({ court }: { court: PaddleCourtRecommendation }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={[styles.courtCard, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLabel={`Proposed court ${court.courtNumber}: Team one ${court.team1.map((player) => player.displayName).join(" and ")}; Team two ${court.team2.map((player) => player.displayName).join(" and ")}`}>
      <View style={styles.courtHeading}><Ionicons name="tennisball-outline" size={18} color={Colors.brand.primary} /><Text style={[styles.courtTitle, { color: c.text }]}>Court {court.courtNumber}</Text><View style={styles.proposedTag}><Text style={styles.proposedText}>Proposed</Text></View></View>
      <Team players={court.team1.map((player) => player.displayName)} label="Team 1 · Playing" />
      <View style={[styles.divider, { borderColor: c.border }]}><Text style={[styles.vs, { color: c.textMuted }]}>VS</Text></View>
      <Team players={court.team2.map((player) => player.displayName)} label="Team 2 · Playing" />
    </View>
  );
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
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  errorCard: { marginHorizontal: 0, marginTop: 0 },
  previewBanner: { padding: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1, gap: Spacing.sm },
  previewTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  previewTitle: { fontSize: Typography.cardTitle, fontWeight: FontWeight.bold },
  previewCopy: { fontSize: Typography.bodySmall, lineHeight: 20 },
  summaryCard: { minHeight: 78, borderWidth: 1, borderRadius: Radius.md, flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginTop: Spacing.md, marginBottom: Spacing.xl },
  summaryItem: { alignItems: "center", gap: Spacing.xs },
  summaryValue: { fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  summaryLabel: { fontSize: Typography.caption },
  summaryDivider: { width: 1, height: 38 },
  gameList: { gap: Spacing.md, marginBottom: Spacing.xl },
  courtCard: { padding: Spacing.lg, borderWidth: 1, borderRadius: Radius.lg, gap: Spacing.md },
  courtHeading: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  courtTitle: { flex: 1, fontSize: Typography.body, fontWeight: FontWeight.bold },
  proposedTag: { borderRadius: Radius.pill, backgroundColor: "rgba(34,197,94,0.14)", paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  proposedText: { color: Colors.brand.primaryDark, fontSize: Typography.caption, fontWeight: FontWeight.semibold },
  team: { gap: Spacing.xs },
  teamLabel: { fontSize: Typography.caption, fontWeight: FontWeight.semibold },
  teamPlayers: { fontSize: Typography.body, fontWeight: FontWeight.semibold },
  divider: { borderTopWidth: 1, alignItems: "center" },
  vs: { fontSize: 10, fontWeight: FontWeight.bold, marginTop: -7, paddingHorizontal: Spacing.sm },
  emptyState: { paddingVertical: Spacing.xl },
  sectionTitle: { marginTop: Spacing.md, fontSize: Typography.cardTitle, fontWeight: FontWeight.bold },
  sectionSubtitle: { marginTop: Spacing.xs, marginBottom: Spacing.md, fontSize: Typography.caption },
  waitingList: { gap: Spacing.sm, marginBottom: Spacing.xl },
  waitingRow: { minHeight: 58, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, flexDirection: "row", alignItems: "center", gap: Spacing.md },
  waitingPosition: { minWidth: 32, height: 32, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing.xs },
  waitingPositionText: { fontSize: Typography.caption, fontWeight: FontWeight.bold },
  waitingName: { flex: 1, fontSize: Typography.bodySmall, fontWeight: FontWeight.semibold },
  waitingTag: { fontSize: Typography.caption },
  accessNotice: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.lg },
  accessText: { flex: 1, fontSize: Typography.bodySmall, lineHeight: 20 },
  startButton: { minHeight: 56, borderRadius: Radius.md, backgroundColor: Colors.brand.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingHorizontal: Spacing.lg, marginTop: Spacing.lg },
  startButtonText: { color: "#FFFFFF", fontSize: Typography.body, fontWeight: FontWeight.bold },
  disabled: { opacity: 0.55 },
});
