import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useTheme } from "../context/ThemeContext";
import { Colors } from "../constants/colors";
import { FontWeight, Radius, Spacing, Typography } from "../constants/design";
import EmptyState from "../components/EmptyState";
import ErrorMessage from "../components/ErrorMessage";
import LoadingSpinner from "../components/LoadingSpinner";
import { PaddleQApiError, paddleQApi } from "../services/paddleQApi";
import type { PaddlePlayerStatistics, PaddleSessionStatistics } from "../types/paddleQ";
import type { PaddleSession } from "../../../shared/types";
import type { PaddleQStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<PaddleQStackParamList, "Statistics">;

function safeError(error: unknown): { title: string; message: string; notFound: boolean } {
  if (error instanceof PaddleQApiError && (error.status === 404 || error.code === "NOT_FOUND")) {
    return { title: "Session not found", message: "Statistics are not available because this session could not be found.", notFound: true };
  }
  if (error instanceof PaddleQApiError && (error.status === 0 || error.code === "NETWORK_ERROR")) {
    return { title: "Connection problem", message: "Paddle Q could not be reached. Check your connection and try again.", notFound: false };
  }
  if (error instanceof PaddleQApiError && error.status >= 500) {
    return { title: "Paddle Q is unavailable", message: "Session statistics could not be loaded right now. Try again shortly.", notFound: false };
  }
  return { title: "Could not load statistics", message: "Session statistics could not be refreshed. Try again.", notFound: false };
}

function percentage(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export default function PaddleQStatisticsScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const sessionId = route.params.sessionId;
  const [statistics, setStatistics] = useState<PaddleSessionStatistics | null>(null);
  const [sessionStatus, setSessionStatus] = useState<PaddleSession["status"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const requestLock = useRef(false);
  const mounted = useRef(true);
  const c = theme.colors;

  const refreshStatistics = useCallback(async (pull = false) => {
    if (requestLock.current) return;
    requestLock.current = true;
    if (pull) setRefreshing(true);
    try {
      const [next, session] = await Promise.all([paddleQApi.getSessionStatistics(sessionId), paddleQApi.getSession(sessionId)]);
      if (!mounted.current) return;
      setStatistics(next);
      setSessionStatus(session.status);
      setError(null);
      setNotFound(false);
    } catch (reason) {
      if (!mounted.current) return;
      const mapped = safeError(reason);
      setError({ title: mapped.title, message: mapped.message });
      if (mapped.notFound) setNotFound(true);
    } finally {
      requestLock.current = false;
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [sessionId]);

  const leaderboard = useMemo(() => (statistics?.players ?? []).filter((player) => player.gamesPlayed > 0).sort((a, b) =>
    b.wins - a.wins
    || b.winRate - a.winRate
    || b.gamesPlayed - a.gamesPlayed
    || a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" })
    || a.playerId.localeCompare(b.playerId)
  ), [statistics?.players]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    void refreshStatistics();
    return undefined;
  }, [refreshStatistics]));

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar barStyle={theme.isDark ? "light-content" : "dark-content"} backgroundColor={c.background} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.navigate("SessionLobby", { sessionId })} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Return to session lobby">
          <Ionicons name="arrow-back" size={23} color={c.text} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: c.text }]}>Statistics</Text>
        <TouchableOpacity onPress={() => void refreshStatistics(true)} style={styles.refreshButton} accessibilityRole="button" accessibilityLabel="Refresh statistics" disabled={refreshing || loading}>
          <Ionicons name="refresh" size={20} color={refreshing || loading ? c.textMuted : Colors.brand.primary} />
        </TouchableOpacity>
      </View>

      {loading ? <LoadingSpinner message="Loading session statistics" /> : notFound && !statistics ? (
        <ErrorMessage title={error?.title ?? "Session not found"} message={error?.message ?? "This session is not available."} onRetry={() => { setNotFound(false); void refreshStatistics(); }} />
      ) : !statistics ? (
        <ErrorMessage title={error?.title ?? "Could not load statistics"} message={error?.message ?? "Try refreshing session statistics."} onRetry={() => void refreshStatistics()} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshStatistics(true)} tintColor={Colors.brand.primary} colors={[Colors.brand.primary]} />}
        >
          <View style={[styles.notice, { backgroundColor: c.surfaceHigh }]}>
            <Ionicons name="information-circle-outline" size={20} color={c.textSecondary} />
            <Text style={[styles.noticeText, { color: c.textSecondary }]}>Historical results for this session only. These statistics do not affect rotation or queue order.</Text>
          </View>
          {error ? <ErrorMessage title={error.title} message={error.message} onRetry={() => void refreshStatistics()} style={styles.inlineError} /> : null}

          {sessionStatus === "completed" ? (
            <View style={styles.leaderboardSection}>
              <Text style={[styles.sectionTitle, { color: c.text }]}>Session Leaderboard</Text>
              <Text style={[styles.sectionSubtitle, { color: c.textSecondary }]}>Historical results from completed games only. Order: wins, win rate, games played, then player name. This does not affect rotation.</Text>
              {leaderboard.length === 0 ? (
                <EmptyState icon="trophy-outline" title="No completed results" subtitle="Players will appear after completed games are recorded." style={styles.empty} />
              ) : leaderboard.map((player, index) => (
                <LeaderboardRow key={player.playerId} player={player} position={index + 1} />
              ))}
            </View>
          ) : null}

          <Text style={[styles.sectionTitle, { color: c.text }]}>Session Summary</Text>
          <View style={[styles.summaryCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <SummaryMetric label="Players" value={statistics.playerCount} />
            <SummaryMetric label="Session courts" value={statistics.courtCount} />
            <SummaryMetric label="Completed games" value={statistics.completedGames} />
            <SummaryMetric label="Avg. games / player" value={statistics.averageGamesPerPlayer.toFixed(1)} />
          </View>

          <Text style={[styles.sectionTitle, styles.playersTitle, { color: c.text }]}>Player Results</Text>
          <Text style={[styles.sectionSubtitle, { color: c.textSecondary }]}>Session display names and results from completed games, in the order supplied by Paddle Q.</Text>
          {statistics.players.length === 0 ? (
            <EmptyState icon="people-outline" title="No player statistics yet" subtitle="Player results will appear after games are completed." style={styles.empty} />
          ) : (
            <View style={styles.playerList}>
              {statistics.players.map((player) => <PlayerStatsCard key={player.playerId} player={player} />)}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number | string }) {
  const { theme } = useTheme();
  return <View style={[styles.metric, { borderColor: theme.colors.border }]}><Text style={[styles.metricValue, { color: theme.colors.text }]}>{value}</Text><Text style={[styles.metricLabel, { color: theme.colors.textSecondary }]}>{label}</Text></View>;
}

function PlayerStatsCard({ player }: { player: PaddlePlayerStatistics }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={[styles.playerCard, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLabel={`${player.displayName}: ${player.gamesPlayed} games played, ${player.wins} wins, ${player.losses} losses, ${percentage(player.winRate)} win rate`}>
      <Text style={[styles.playerName, { color: c.text }]}>{player.displayName}</Text>
      <View style={styles.playerMetrics}>
        <PlayerMetric label="Games" value={player.gamesPlayed} />
        <PlayerMetric label="Wins" value={player.wins} />
        <PlayerMetric label="Losses" value={player.losses} />
        <PlayerMetric label="Win rate" value={percentage(player.winRate)} />
      </View>
    </View>
  );
}

function LeaderboardRow({ player, position }: { player: PaddlePlayerStatistics; position: number }) {
  const { theme } = useTheme();
  const highlighted = position <= 3;
  return (
    <View style={[styles.leaderboardRow, { backgroundColor: theme.colors.surface, borderColor: highlighted ? Colors.brand.primary : theme.colors.border }]} accessibilityLabel={`Number ${position}, ${player.displayName}, ${player.wins} wins, ${player.losses} losses, ${percentage(player.winRate)} win rate`}>
      <View style={[styles.rankBadge, { backgroundColor: highlighted ? "rgba(34,197,94,0.14)" : theme.colors.surfaceHigh }]}>
        <Text style={[styles.rankText, { color: highlighted ? Colors.brand.primaryDark : theme.colors.textSecondary }]}>{position <= 3 ? `#${position}` : position}</Text>
      </View>
      <View style={styles.leaderboardDetails}>
        <Text style={[styles.playerName, { color: theme.colors.text }]}>{player.displayName}</Text>
        <Text style={[styles.leaderboardStats, { color: theme.colors.textSecondary }]}>{player.gamesPlayed} games · {player.wins} wins · {player.losses} losses · {percentage(player.winRate)}</Text>
      </View>
    </View>
  );
}

function PlayerMetric({ label, value }: { label: string; value: number | string }) {
  const { theme } = useTheme();
  return <View style={styles.playerMetric}><Text style={[styles.playerMetricValue, { color: theme.colors.text }]}>{value}</Text><Text style={[styles.playerMetricLabel, { color: theme.colors.textSecondary }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { minHeight: 52, paddingHorizontal: Spacing.md, flexDirection: "row", alignItems: "center" },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topBarTitle: { flex: 1, textAlign: "center", fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  refreshButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl },
  notice: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md, marginBottom: Spacing.md },
  noticeText: { flex: 1, fontSize: Typography.bodySmall, lineHeight: 20 },
  inlineError: { marginHorizontal: 0, marginTop: 0 },
  sectionTitle: { fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  summaryCard: { marginTop: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, flexDirection: "row", flexWrap: "wrap" },
  metric: { width: "50%", minHeight: 62, alignItems: "center", justifyContent: "center", gap: Spacing.xs, borderBottomWidth: 0.5 },
  metricValue: { fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  metricLabel: { fontSize: Typography.caption, textAlign: "center" },
  playersTitle: { marginTop: Spacing.xl },
  leaderboardSection: { gap: Spacing.sm, marginBottom: Spacing.xl },
  leaderboardRow: { minHeight: 58, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, flexDirection: "row", alignItems: "center", gap: Spacing.md },
  rankBadge: { minWidth: 38, height: 38, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing.xs },
  rankText: { fontSize: Typography.bodySmall, fontWeight: FontWeight.bold },
  leaderboardDetails: { flex: 1, gap: Spacing.xs },
  leaderboardStats: { fontSize: Typography.caption },
  sectionSubtitle: { marginTop: Spacing.xs, marginBottom: Spacing.md, fontSize: Typography.caption, lineHeight: 18 },
  empty: { paddingVertical: Spacing.md },
  playerList: { gap: Spacing.sm },
  playerCard: { padding: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, gap: Spacing.md },
  playerName: { fontSize: Typography.body, fontWeight: FontWeight.bold },
  playerMetrics: { flexDirection: "row", justifyContent: "space-between", gap: Spacing.sm },
  playerMetric: { flex: 1, alignItems: "center", gap: Spacing.xs },
  playerMetricValue: { fontSize: Typography.body, fontWeight: FontWeight.bold },
  playerMetricLabel: { fontSize: Typography.caption, textAlign: "center" },
});
