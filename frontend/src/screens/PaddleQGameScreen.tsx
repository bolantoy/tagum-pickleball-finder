import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
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
import type { PaddleGameWithPlayers } from "../types/paddleQ";
import type { PaddleQStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<PaddleQStackParamList, "Game">;
const MAX_POSTGRES_INTEGER = 2_147_483_647;

function loadErrorMessage(error: unknown): { title: string; message: string; notFound: boolean } {
  if (error instanceof PaddleQApiError && (error.status === 404 || error.code === "NOT_FOUND")) {
    return { title: "Game not found", message: "This game is not available in this session.", notFound: true };
  }
  if (error instanceof PaddleQApiError && (error.status === 0 || error.code === "NETWORK_ERROR")) {
    return { title: "Connection problem", message: "Paddle Q could not be reached. Check your connection and try again.", notFound: false };
  }
  if (error instanceof PaddleQApiError && error.status >= 500) {
    return { title: "Paddle Q is unavailable", message: "Game details could not be loaded. Try again shortly.", notFound: false };
  }
  return { title: "Could not load game", message: "Game details could not be refreshed. Try again.", notFound: false };
}

function mutationErrorMessage(error: unknown, verb: "complete" | "cancel"): { title: string; message: string; unauthorized: boolean; stale: boolean } {
  if (error instanceof PaddleQApiError && (error.status === 401 || error.status === 403 || error.code.startsWith("ORGANIZER_CAPABILITY"))) {
    return { title: "Organizer access is no longer valid", message: "This screen is now read-only. Return to the lobby to continue.", unauthorized: true, stale: false };
  }
  if (error instanceof PaddleQApiError && (error.status === 409 || error.code === "INVALID_STATE" || error.code === "CONFLICT")) {
    return { title: "Game state changed", message: "This game may already have changed. Refresh the game details before continuing.", unauthorized: false, stale: true };
  }
  if (error instanceof PaddleQApiError && error.status === 400 && verb === "complete") {
    return { title: "Invalid scores", message: "Enter non-negative whole-number scores that are not tied.", unauthorized: false, stale: false };
  }
  if (error instanceof PaddleQApiError && (error.status === 0 || error.code === "NETWORK_ERROR")) {
    return { title: "Connection problem", message: `Paddle Q could not be reached. The game was not confirmed ${verb === "complete" ? "complete" : "cancelled"}.`, unauthorized: false, stale: false };
  }
  return { title: `Could not ${verb} game`, message: `The game could not be ${verb === "complete" ? "completed" : "cancelled"}. Refresh and try again.`, unauthorized: false, stale: false };
}

export default function PaddleQGameScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const storage = usePaddleQSessionStorage();
  const { sessionId, gameId } = route.params;
  const [game, setGame] = useState<PaddleGameWithPlayers | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [organizerAvailable, setOrganizerAvailable] = useState(false);
  const [authorizationRejected, setAuthorizationRejected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [team1Score, setTeam1Score] = useState("");
  const [team2Score, setTeam2Score] = useState("");
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const requestLock = useRef(false);
  const mutationLock = useRef(false);
  const mounted = useRef(true);
  const c = theme.colors;

  const loadGame = useCallback(async () => {
    if (requestLock.current) return;
    requestLock.current = true;
    try {
      const activeGames = await paddleQApi.getCurrentGames(sessionId);
      let match = activeGames.find((item) => item.id === gameId) ?? null;
      if (!match) {
        const history = await paddleQApi.getGameHistory(sessionId);
        match = history.find((item) => item.id === gameId) ?? null;
      }
      if (!mounted.current) return;
      if (!match) {
        setNotFound(true);
        setError({ title: "Game not found", message: "This game is not available in this session." });
      } else {
        setNotFound(false);
        setError(null);
        setGame(match);
      }
    } catch (reason) {
      if (!mounted.current) return;
      const mapped = loadErrorMessage(reason);
      setError({ title: mapped.title, message: mapped.message });
      if (mapped.notFound) setNotFound(true);
    } finally {
      requestLock.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [gameId, sessionId]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => { void loadGame(); }, [loadGame]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      storage.getOrganizerCapability(sessionId),
      storage.getRememberedSessions(),
    ]).then(async ([capability, remembered]) => {
      const metadata = remembered.find((item) => item.sessionId === sessionId && item.playerId);
      let storedPlayerId: string | null = null;
      if (metadata?.playerId) {
        try {
          if (await storage.getPlayerCredential(sessionId, metadata.playerId)) storedPlayerId = metadata.playerId;
        } catch {
          storedPlayerId = null;
        }
      }
      if (!cancelled) {
        setOrganizerAvailable(Boolean(capability));
        setPlayerId(storedPlayerId);
      }
    }).catch(() => {
      if (!cancelled) {
        setOrganizerAvailable(false);
        setPlayerId(null);
      }
    });
    return () => { cancelled = true; };
  }, [sessionId, storage]);

  const ownGame = useMemo(() => Boolean(playerId && game?.participants.some((participant) => participant.sessionPlayerId === playerId)), [game, playerId]);
  const team1Players = game?.participants.filter((participant) => participant.teamNumber === 1).map((participant) => participant.player.displayName) ?? [];
  const team2Players = game?.participants.filter((participant) => participant.teamNumber === 2).map((participant) => participant.player.displayName) ?? [];
  const canManage = Boolean(game?.status === "in_progress" && organizerAvailable && !authorizationRejected);

  const handleMutationFailure = (reason: unknown, verb: "complete" | "cancel") => {
    const mapped = mutationErrorMessage(reason, verb);
    if (mapped.unauthorized) {
      setAuthorizationRejected(true);
      setOrganizerAvailable(false);
    }
    setError({ title: mapped.title, message: mapped.message });
    if (mapped.stale) void loadGame();
  };

  const completeGame = async () => {
    if (mutationLock.current || !canManage) return;
    if (!/^\d+$/.test(team1Score.trim()) || !/^\d+$/.test(team2Score.trim())) {
      setError({ title: "Invalid scores", message: "Enter a non-negative whole-number score for each team." });
      return;
    }
    const score1 = Number(team1Score);
    const score2 = Number(team2Score);
    if (!Number.isSafeInteger(score1) || !Number.isSafeInteger(score2) || score1 > MAX_POSTGRES_INTEGER || score2 > MAX_POSTGRES_INTEGER) {
      setError({ title: "Invalid scores", message: "Scores must be whole numbers within the supported range." });
      return;
    }
    if (score1 === score2) {
      setError({ title: "A winner is required", message: "The final scores cannot be tied." });
      return;
    }
    mutationLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const capability = await storage.getOrganizerCapability(sessionId);
      if (!capability) {
        setOrganizerAvailable(false);
        setError({ title: "Organizer access required", message: "No organizer capability is saved on this device. This game is now read-only." });
        return;
      }
      await paddleQApi.completeGame(sessionId, gameId, capability, { team1Score: score1, team2Score: score2 });
      navigation.navigate("SessionLobby", { sessionId });
    } catch (reason) {
      handleMutationFailure(reason, "complete");
    } finally {
      mutationLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const cancelGame = async () => {
    if (mutationLock.current || !canManage) return;
    mutationLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const capability = await storage.getOrganizerCapability(sessionId);
      if (!capability) {
        setOrganizerAvailable(false);
        setError({ title: "Organizer access required", message: "No organizer capability is saved on this device. This game is now read-only." });
        return;
      }
      await paddleQApi.cancelGame(sessionId, gameId, capability);
      navigation.navigate("SessionLobby", { sessionId });
    } catch (reason) {
      handleMutationFailure(reason, "cancel");
    } finally {
      mutationLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const confirmCancel = () => Alert.alert(
    "Cancel this game?",
    "The game will no longer be active, and its history will be retained.",
    [
      { text: "Keep Game", style: "cancel" },
      { text: "Cancel Game", style: "destructive", onPress: () => { void cancelGame(); } },
    ]
  );

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar barStyle={theme.isDark ? "light-content" : "dark-content"} backgroundColor={c.background} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.navigate("SessionLobby", { sessionId })} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Return to session lobby">
          <Ionicons name="arrow-back" size={23} color={c.text} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: c.text }]}>Game</Text>
        <TouchableOpacity onPress={() => void loadGame()} style={styles.refreshButton} accessibilityRole="button" accessibilityLabel="Refresh game details" disabled={busy || loading}>
          <Ionicons name="refresh" size={20} color={busy || loading ? c.textMuted : Colors.brand.primary} />
        </TouchableOpacity>
      </View>

      {loading ? <LoadingSpinner message="Loading game" /> : notFound && !game ? (
        <ErrorMessage title={error?.title ?? "Game not found"} message={error?.message ?? "This game is not available."} onRetry={() => { setNotFound(false); void loadGame(); }} />
      ) : !game ? (
        <ErrorMessage title={error?.title ?? "Could not load game"} message={error?.message ?? "Try refreshing game details."} onRetry={() => void loadGame()} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {error ? <ErrorMessage title={error.title} message={error.message} style={styles.inlineError} /> : null}
          <View style={[styles.gameCard, { backgroundColor: c.surface, borderColor: ownGame ? Colors.brand.primary : c.border }]}>
            <View style={styles.gameHeading}>
              <View style={styles.courtTitleRow}><Ionicons name="tennisball-outline" size={20} color={Colors.brand.primary} /><Text style={[styles.courtTitle, { color: c.text }]}>Court {game.courtNumber}</Text></View>
              <GameStatus status={game.status} />
            </View>
            <GameTeam label="Team 1" names={team1Players} />
            <View style={[styles.vsLine, { borderColor: c.border }]}><Text style={[styles.vsText, { color: c.textMuted }]}>VS</Text></View>
            <GameTeam label="Team 2" names={team2Players} />
            {ownGame ? <View style={styles.yourGame}><Ionicons name="person-circle-outline" size={17} color={Colors.brand.primary} /><Text style={styles.yourGameText}>Your game</Text></View> : null}
          </View>

          {game.status === "completed" ? <StatusNotice icon="checkmark-circle-outline" text="This game is complete. Scores are recorded by the session." /> : null}
          {game.status === "cancelled" ? <StatusNotice icon="close-circle-outline" text="This game was cancelled." /> : null}
          {game.status === "in_progress" && !organizerAvailable && !authorizationRejected ? <StatusNotice icon="eye-outline" text="Read-only game view. Organizer access is required to enter scores or change game status." /> : null}
          {authorizationRejected ? <StatusNotice icon="eye-outline" text="Organizer access is no longer valid. This game is now read-only." /> : null}

          {canManage ? (
            <View style={[styles.scorePanel, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.panelTitle, { color: c.text }]}>Complete Game</Text>
              <Text style={[styles.panelSubtitle, { color: c.textSecondary }]}>Enter the final scores. Tied scores are not accepted.</Text>
              <View style={styles.scoreRow}>
                <ScoreInput label="Team 1" value={team1Score} onChangeText={setTeam1Score} disabled={busy} />
                <Text style={[styles.scoreSeparator, { color: c.textMuted }]}>–</Text>
                <ScoreInput label="Team 2" value={team2Score} onChangeText={setTeam2Score} disabled={busy} />
              </View>
              <TouchableOpacity style={[styles.completeButton, busy && styles.disabled]} onPress={() => void completeGame()} disabled={busy} accessibilityRole="button">
                {busy ? <LoadingSpinner size="small" /> : <Text style={styles.completeButtonText}>Complete Game</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelButton, busy && styles.disabled]} onPress={confirmCancel} disabled={busy} accessibilityRole="button">
                <Ionicons name="close-circle-outline" size={19} color={Colors.unavailable} /><Text style={styles.cancelButtonText}>Cancel Game</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function GameStatus({ status }: { status: PaddleGameWithPlayers["status"] }) {
  const { theme } = useTheme();
  const label = status === "in_progress" ? "In progress" : status === "completed" ? "Completed" : "Cancelled";
  const icon = status === "in_progress" ? "radio-button-on" : status === "completed" ? "checkmark-circle-outline" : "close-circle-outline";
  return <View style={[styles.gameStatus, { borderColor: theme.colors.border }]} accessibilityLabel={`Game status: ${label}`}><Ionicons name={icon} size={15} color={theme.colors.textSecondary} /><Text style={[styles.gameStatusText, { color: theme.colors.text }]}>{label}</Text></View>;
}

function GameTeam({ label, names }: { label: string; names: string[] }) {
  const { theme } = useTheme();
  return <View style={styles.teamBlock}><Text style={[styles.teamLabel, { color: theme.colors.textMuted }]}>{label}</Text><Text style={[styles.teamNames, { color: theme.colors.text }]}>{names.length ? names.join(" + ") : "Players unavailable"}</Text></View>;
}

function StatusNotice({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { theme } = useTheme();
  return <View style={[styles.notice, { backgroundColor: theme.colors.surfaceHigh }]}><Ionicons name={icon} size={19} color={theme.colors.textSecondary} /><Text style={[styles.noticeText, { color: theme.colors.textSecondary }]}>{text}</Text></View>;
}

function ScoreInput({ label, value, onChangeText, disabled }: { label: string; value: string; onChangeText: (value: string) => void; disabled: boolean }) {
  const { theme } = useTheme();
  return <View style={styles.scoreInputWrap}><Text style={[styles.scoreLabel, { color: theme.colors.textSecondary }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} editable={!disabled} keyboardType="number-pad" maxLength={10} placeholder="0" placeholderTextColor={theme.colors.textMuted} style={[styles.scoreInput, { backgroundColor: theme.colors.background, borderColor: theme.colors.border, color: theme.colors.text }]} accessibilityLabel={`${label} score`} /></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { minHeight: 52, paddingHorizontal: Spacing.md, flexDirection: "row", alignItems: "center" },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topBarTitle: { flex: 1, textAlign: "center", fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  refreshButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl },
  inlineError: { marginHorizontal: 0, marginTop: 0 },
  gameCard: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md },
  gameHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.md },
  courtTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  courtTitle: { fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  gameStatus: { minHeight: 30, borderWidth: 1, borderRadius: Radius.pill, flexDirection: "row", alignItems: "center", gap: Spacing.xs, paddingHorizontal: Spacing.sm },
  gameStatusText: { fontSize: Typography.caption, fontWeight: FontWeight.semibold },
  teamBlock: { gap: Spacing.xs },
  teamLabel: { fontSize: Typography.bodySmall, fontWeight: FontWeight.semibold },
  teamNames: { fontSize: Typography.body, fontWeight: FontWeight.bold },
  vsLine: { borderTopWidth: 1, alignItems: "center", marginVertical: Spacing.md },
  vsText: { fontSize: Typography.caption, fontWeight: FontWeight.bold, marginTop: -8, paddingHorizontal: Spacing.md },
  yourGame: { marginTop: Spacing.lg, flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  yourGameText: { color: Colors.brand.primaryDark, fontSize: Typography.bodySmall, fontWeight: FontWeight.bold },
  notice: { marginTop: Spacing.md, padding: Spacing.md, borderRadius: Radius.md, flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  noticeText: { flex: 1, fontSize: Typography.bodySmall, lineHeight: 20 },
  scorePanel: { marginTop: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md },
  panelTitle: { fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  panelSubtitle: { marginTop: Spacing.xs, fontSize: Typography.bodySmall, lineHeight: 20 },
  scoreRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: Spacing.md, marginTop: Spacing.md },
  scoreInputWrap: { flex: 1, gap: Spacing.sm },
  scoreLabel: { textAlign: "center", fontSize: Typography.caption, fontWeight: FontWeight.semibold },
  scoreInput: { minHeight: 52, borderWidth: 1, borderRadius: Radius.md, textAlign: "center", fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold, paddingHorizontal: Spacing.sm },
  scoreSeparator: { fontSize: Typography.cardTitle, paddingBottom: Spacing.md },
  completeButton: { marginTop: Spacing.md, minHeight: 48, borderRadius: Radius.md, backgroundColor: Colors.brand.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing.md },
  completeButtonText: { color: "#FFFFFF", fontSize: Typography.body, fontWeight: FontWeight.bold },
  cancelButton: { marginTop: Spacing.md, minHeight: 48, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.unavailable, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm },
  cancelButtonText: { color: Colors.unavailable, fontSize: Typography.bodySmall, fontWeight: FontWeight.semibold },
  disabled: { opacity: 0.55 },
});
