import React, { useCallback, useEffect, useRef, useState } from "react";
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
import type { PaddleGameWithPlayers } from "../types/paddleQ";
import type { PaddleQStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<PaddleQStackParamList, "GameHistory">;

function safeError(error: unknown): { title: string; message: string; notFound: boolean } {
  if (error instanceof PaddleQApiError && (error.status === 404 || error.code === "NOT_FOUND")) {
    return { title: "Session not found", message: "Game history is not available because this session could not be found.", notFound: true };
  }
  if (error instanceof PaddleQApiError && (error.status === 0 || error.code === "NETWORK_ERROR")) {
    return { title: "Connection problem", message: "Paddle Q could not be reached. Check your connection and try again.", notFound: false };
  }
  if (error instanceof PaddleQApiError && error.status >= 500) {
    return { title: "Paddle Q is unavailable", message: "Game history could not be loaded right now. Try again shortly.", notFound: false };
  }
  return { title: "Could not load game history", message: "Game history could not be refreshed. Try again.", notFound: false };
}

export default function PaddleQGameHistoryScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const sessionId = route.params.sessionId;
  const [games, setGames] = useState<PaddleGameWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const requestLock = useRef(false);
  const mounted = useRef(true);
  const c = theme.colors;

  const refreshHistory = useCallback(async (pull = false) => {
    if (requestLock.current) return;
    requestLock.current = true;
    if (pull) setRefreshing(true);
    try {
      const history = await paddleQApi.getGameHistory(sessionId);
      if (!mounted.current) return;
      // Filtering retains the order returned by the backend. Active games are shown in the lobby.
      setGames(history.filter((game) => game.status === "completed" || game.status === "cancelled"));
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

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    void refreshHistory();
    return undefined;
  }, [refreshHistory]));

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar barStyle={theme.isDark ? "light-content" : "dark-content"} backgroundColor={c.background} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.navigate("SessionLobby", { sessionId })} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Return to session lobby">
          <Ionicons name="arrow-back" size={23} color={c.text} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: c.text }]}>Game History</Text>
        <TouchableOpacity onPress={() => void refreshHistory(true)} style={styles.refreshButton} accessibilityRole="button" accessibilityLabel="Refresh game history" disabled={refreshing || loading}>
          <Ionicons name="refresh" size={20} color={refreshing || loading ? c.textMuted : Colors.brand.primary} />
        </TouchableOpacity>
      </View>

      {loading ? <LoadingSpinner message="Loading game history" /> : notFound && games.length === 0 ? (
        <ErrorMessage title={error?.title ?? "Session not found"} message={error?.message ?? "This session is not available."} onRetry={() => { setNotFound(false); void refreshHistory(); }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshHistory(true)} tintColor={Colors.brand.primary} colors={[Colors.brand.primary]} />}
        >
          <Text style={[styles.intro, { color: c.textSecondary }]}>Completed results from this session. Cancelled games are shown separately and are not counted as wins or losses.</Text>
          {error ? <ErrorMessage title={error.title} message={error.message} onRetry={() => void refreshHistory()} style={styles.inlineError} /> : null}
          {games.length === 0 ? (
            <EmptyState icon="time-outline" title="No game history yet" subtitle="Completed or cancelled games will appear here." style={styles.empty} />
          ) : (
            <View style={styles.list}>
              {games.map((game) => <HistoryGameCard key={game.id} game={game} />)}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function HistoryGameCard({ game }: { game: PaddleGameWithPlayers }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const team1 = game.participants.filter((participant) => participant.teamNumber === 1).map((participant) => participant.player.displayName);
  const team2 = game.participants.filter((participant) => participant.teamNumber === 2).map((participant) => participant.player.displayName);
  const cancelled = game.status === "cancelled";
  const winningPlayers = game.winnerTeam === 1 ? team1 : game.winnerTeam === 2 ? team2 : [];
  const score = !cancelled && game.team1Score !== null && game.team2Score !== null
    ? `${game.team1Score} – ${game.team2Score}`
    : null;
  return (
    <View style={[styles.gameCard, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLabel={`Game ${game.gameNumber}, Court ${game.courtNumber}, ${cancelled ? "cancelled" : `completed, ${score ?? "score unavailable"}`}`}>
      <View style={styles.cardHeading}>
        <View style={styles.gameTitleGroup}>
          <Text style={[styles.gameNumber, { color: c.text }]}>Game #{game.gameNumber}</Text>
          <Text style={[styles.courtNumber, { color: c.textSecondary }]}>Court {game.courtNumber}</Text>
        </View>
        <View style={[styles.statusBadge, { borderColor: cancelled ? Colors.unavailable : Colors.available }]}>
          <Ionicons name={cancelled ? "close-circle-outline" : "checkmark-circle-outline"} size={15} color={cancelled ? Colors.unavailable : Colors.available} />
          <Text style={[styles.statusText, { color: c.text }]}>{cancelled ? "Cancelled" : "Completed"}</Text>
        </View>
      </View>
      <TeamLine label="Team 1" names={team1} />
      <View style={[styles.scoreDivider, { borderColor: c.border }]}>
        {cancelled ? <Text style={[styles.cancelledLabel, { color: c.textSecondary }]}>Game cancelled</Text> : <Text style={[styles.score, { color: c.text }]}>{score ?? "Score unavailable"}</Text>}
      </View>
      <TeamLine label="Team 2" names={team2} />
      {!cancelled && winningPlayers.length > 0 ? <Text style={styles.winner}>{winningPlayers.join(" + ")} won</Text> : null}
    </View>
  );
}

function TeamLine({ label, names }: { label: string; names: string[] }) {
  const { theme } = useTheme();
  return <View style={styles.team}><Text style={[styles.teamLabel, { color: theme.colors.textMuted }]}>{label}</Text><Text style={[styles.teamPlayers, { color: theme.colors.text }]}>{names.length ? names.join(" + ") : "Players unavailable"}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { minHeight: 52, paddingHorizontal: Spacing.md, flexDirection: "row", alignItems: "center" },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topBarTitle: { flex: 1, textAlign: "center", fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  refreshButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl },
  intro: { marginBottom: Spacing.md, fontSize: Typography.bodySmall, lineHeight: 20 },
  inlineError: { marginHorizontal: 0, marginTop: 0 },
  empty: { paddingVertical: Spacing.md },
  list: { gap: Spacing.sm },
  gameCard: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm },
  cardHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Spacing.sm, marginBottom: Spacing.xs },
  gameTitleGroup: { gap: Spacing.xs },
  gameNumber: { fontSize: Typography.body, fontWeight: FontWeight.bold },
  courtNumber: { fontSize: Typography.caption },
  statusBadge: { minHeight: 30, borderRadius: Radius.pill, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: Spacing.xs, paddingHorizontal: Spacing.sm },
  statusText: { fontSize: Typography.caption, fontWeight: FontWeight.semibold },
  team: { gap: Spacing.xs },
  teamLabel: { fontSize: Typography.caption, fontWeight: FontWeight.semibold },
  teamPlayers: { fontSize: Typography.body, fontWeight: FontWeight.semibold },
  scoreDivider: { borderTopWidth: 1, alignItems: "center", paddingTop: Spacing.sm },
  score: { fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  cancelledLabel: { fontSize: Typography.bodySmall, fontWeight: FontWeight.semibold },
  winner: { color: Colors.brand.primaryDark, fontSize: Typography.bodySmall, fontWeight: FontWeight.bold },
});
