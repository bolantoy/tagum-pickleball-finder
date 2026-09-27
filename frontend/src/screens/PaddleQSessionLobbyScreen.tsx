import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  type AppStateStatus,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useTheme } from "../context/ThemeContext";
import { usePaddleQSessionStorage } from "../context/PaddleQSessionContext";
import { Colors } from "../constants/colors";
import { FontWeight, Radius, Spacing, Typography } from "../constants/design";
import EmptyState from "../components/EmptyState";
import ErrorMessage from "../components/ErrorMessage";
import LoadingSpinner from "../components/LoadingSpinner";
import { fetchCourtById } from "../services/api";
import { PaddleQApiError, paddleQApi } from "../services/paddleQApi";
import type { PaddleGameWithPlayers } from "../types/paddleQ";
import type { PaddleSession, PaddleSessionPlayer } from "../../../shared/types";
import type { PaddleQStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<PaddleQStackParamList, "SessionLobby">;
interface LobbySnapshot {
  session: PaddleSession;
  queue: PaddleSessionPlayer[];
  games: PaddleGameWithPlayers[];
}

function isTerminal(status: PaddleSession["status"]): boolean {
  return status === "completed" || status === "cancelled";
}

function statusLabel(status: PaddleSession["status"]): string {
  switch (status) {
    case "scheduled": return "Scheduled";
    case "active": return "Live session";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
  }
}

function errorMessage(error: unknown): { title: string; message: string; notFound: boolean } {
  if (error instanceof PaddleQApiError && (error.status === 404 || error.code === "NOT_FOUND")) {
    return { title: "Session not found", message: "This Paddle Q session may have been removed or the link may be incorrect.", notFound: true };
  }
  if (error instanceof PaddleQApiError && (error.status === 0 || error.code === "NETWORK_ERROR")) {
    return { title: "Connection problem", message: "The lobby could not reach Paddle Q. Check your connection and try again.", notFound: false };
  }
  if (error instanceof PaddleQApiError && error.status >= 500) {
    return { title: "Paddle Q is unavailable", message: "The lobby could not be refreshed right now. Try again shortly.", notFound: false };
  }
  return { title: "Could not load the lobby", message: "The session information could not be refreshed. Try again.", notFound: false };
}

export default function PaddleQSessionLobbyScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const storage = usePaddleQSessionStorage();
  const sessionId = route.params.sessionId;
  const focused = useIsFocused();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<{ title: string; message: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [organizerAccess, setOrganizerAccess] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [venueName, setVenueName] = useState("");
  const requestInFlight = useRef(false);
  const mounted = useRef(true);
  const venueNameCache = useRef(new Map<string, string>());
  const c = theme.colors;

  const refreshLobby = useCallback(async (pull = false) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    if (pull) setRefreshing(true);
    try {
      const [session, queue, games] = await Promise.all([
        paddleQApi.getSession(sessionId),
        paddleQApi.getQueue(sessionId),
        paddleQApi.getCurrentGames(sessionId),
      ]);
      if (!mounted.current) return;
      setSnapshot({ session, queue, games });
      setLoadError(null);
      setNotFound(false);
    } catch (error) {
      if (!mounted.current) return;
      const normalized = errorMessage(error);
      setLoadError({ title: normalized.title, message: normalized.message });
      if (normalized.notFound) setNotFound(true);
    } finally {
      requestInFlight.current = false;
      if (mounted.current) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    void refreshLobby();
    return undefined;
  }, [refreshLobby]));

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!focused || appState !== "active" || notFound || snapshot && isTerminal(snapshot.session.status)) return undefined;
    const interval = setInterval(() => { void refreshLobby(); }, 15_000);
    return () => clearInterval(interval);
  }, [appState, focused, notFound, refreshLobby, snapshot?.session.status]);

  useEffect(() => {
    let cancelled = false;
    const loadLocalAccess = async () => {
      try {
        const [capability, remembered] = await Promise.all([
          storage.getOrganizerCapability(sessionId),
          storage.getRememberedSessions(),
        ]);
        const playerMeta = remembered.find((item) => item.sessionId === sessionId && item.playerId);
        let hasPlayerCredential = false;
        if (playerMeta?.playerId) {
          try {
            hasPlayerCredential = Boolean(await storage.getPlayerCredential(sessionId, playerMeta.playerId));
          } catch {
            hasPlayerCredential = false;
          }
        }
        if (!cancelled) {
          setOrganizerAccess(Boolean(capability));
          setPlayerId(hasPlayerCredential ? playerMeta?.playerId ?? null : null);
        }
      } catch {
        if (!cancelled) {
          setOrganizerAccess(false);
          setPlayerId(null);
        }
      }
    };
    void loadLocalAccess();
    return () => { cancelled = true; };
  }, [sessionId, storage]);

  useEffect(() => {
    const venueId = snapshot?.session.venueId;
    if (!venueId) return;
    const cachedName = venueNameCache.current.get(venueId);
    if (cachedName) {
      setVenueName(cachedName);
      return;
    }
    let cancelled = false;
    void fetchCourtById(venueId).then((venue) => {
      const name = venue.name?.trim() || "Venue";
      venueNameCache.current.set(venueId, name);
      if (!cancelled) setVenueName(name);
    }).catch(() => {
      const fallback = "Venue name unavailable";
      venueNameCache.current.set(venueId, fallback);
      if (!cancelled) setVenueName(fallback);
    });
    return () => { cancelled = true; };
  }, [snapshot?.session.venueId]);

  const occupiedCourts = useMemo(() => new Set(snapshot?.games.map((game) => game.courtNumber) ?? []), [snapshot?.games]);
  const ownWaitingPlayer = snapshot?.queue.find((player) => player.id === playerId);
  const ownGameIds = useMemo(() => new Set(
    snapshot?.games.filter((game) => game.participants.some((participant) => participant.sessionPlayerId === playerId)).map((game) => game.id) ?? []
  ), [playerId, snapshot?.games]);
  const cta = snapshot?.session.status;

  const pullRefresh = useCallback(() => { void refreshLobby(true); }, [refreshLobby]);

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar barStyle={theme.isDark ? "light-content" : "dark-content"} backgroundColor={c.background} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to Paddle Q sessions">
          <Ionicons name="arrow-back" size={23} color={c.text} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: c.text }]}>Paddle Q</Text>
        <View style={styles.topBarSpacer} />
      </View>

      {initialLoading ? (
        <LoadingSpinner message="Loading session lobby" />
      ) : notFound ? (
        <ErrorMessage title={loadError?.title ?? "Session not found"} message={loadError?.message ?? "This session is not available."} onRetry={() => { setNotFound(false); void refreshLobby(); }} />
      ) : !snapshot ? (
        <ErrorMessage title={loadError?.title ?? "Could not load the lobby"} message={loadError?.message ?? "Try refreshing the session."} onRetry={() => void refreshLobby()} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullRefresh} tintColor={Colors.brand.primary} colors={[Colors.brand.primary]} />}
          showsVerticalScrollIndicator={false}
        >
          {loadError ? <ErrorMessage title={loadError.title} message={loadError.message} onRetry={() => void refreshLobby()} style={styles.refreshError} /> : null}
          <View style={[styles.sessionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.sessionHeading}>
              <View style={styles.venueIcon}><Ionicons name="location-outline" size={21} color={Colors.brand.primary} /></View>
              <View style={styles.sessionHeadingCopy}>
                <Text style={[styles.venueTitle, { color: c.text }]} numberOfLines={2}>{venueName || "Loading venue…"}</Text>
                <Text style={[styles.dateTime, { color: c.textSecondary }]}>{snapshot.session.sessionDate} · {snapshot.session.startTime}</Text>
              </View>
              <SessionStatus status={snapshot.session.status} />
            </View>
            <View style={[styles.sessionDetails, { borderTopColor: c.border }]}>
              <InfoPill icon="business-outline" label={`${snapshot.session.courtCount} ${snapshot.session.courtCount === 1 ? "session court" : "session courts"}`} />
              {organizerAccess ? <InfoPill icon="shield-checkmark-outline" label="Organizer capability saved on this device" /> : null}
              {ownWaitingPlayer ? <InfoPill icon="person-circle-outline" label={`You are ${ownWaitingPlayer.displayName}`} /> : playerId && ownGameIds.size > 0 ? <InfoPill icon="person-circle-outline" label="Your game is in progress" /> : null}
            </View>
            {snapshot.session.status === "completed" ? <SessionNotice text="This session has ended. The lobby is read-only." icon="checkmark-circle-outline" /> : null}
            {snapshot.session.status === "cancelled" ? <SessionNotice text="This session was cancelled. The lobby is read-only." icon="close-circle-outline" /> : null}
            {snapshot.session.status === "scheduled" ? <SessionNotice text="This session is scheduled. Current games will appear here when play begins." icon="time-outline" /> : null}
            {snapshot.session.status === "active" ? (
              <TouchableOpacity
                style={styles.rotationButton}
                onPress={() => navigation.navigate("Rotation", { sessionId })}
                accessibilityRole="button"
              >
                <Ionicons name="git-branch-outline" size={19} color="#FFFFFF" />
                <Text style={styles.rotationButtonText}>View Recommended Round</Text>
                <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
            {organizerAccess && (snapshot.session.status === "scheduled" || snapshot.session.status === "active") ? (
              <TouchableOpacity
                style={[styles.organizerButton, { borderColor: c.border }]}
                onPress={() => navigation.navigate("OrganizerControls", { sessionId })}
                accessibilityRole="button"
              >
                <Ionicons name="settings-outline" size={17} color={Colors.brand.primary} />
                <Text style={[styles.secondaryNavText, { color: c.text }]}>Organizer Controls</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.secondaryNavigation}>
              <TouchableOpacity style={[styles.secondaryNavButton, { borderColor: c.border }]} onPress={() => navigation.navigate("GameHistory", { sessionId })} accessibilityRole="button">
                <Ionicons name="time-outline" size={17} color={Colors.brand.primary} />
                <Text style={[styles.secondaryNavText, { color: c.text }]}>Game History</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryNavButton, { borderColor: c.border }]} onPress={() => navigation.navigate("Statistics", { sessionId })} accessibilityRole="button">
                <Ionicons name="stats-chart-outline" size={17} color={Colors.brand.primary} />
                <Text style={[styles.secondaryNavText, { color: c.text }]}>Statistics</Text>
              </TouchableOpacity>
            </View>
          </View>

          <SectionTitle title="Shared Queue" subtitle={isTerminal(snapshot.session.status) ? "Final waiting order from this session." : "One waiting line is shared across all session courts."} />
          {snapshot.queue.length === 0 ? (
            <EmptyState icon="people-outline" title="Nobody is waiting" subtitle="Players who join will appear here in queue order." style={styles.emptyState} />
          ) : (
            <View style={styles.list}>
              {snapshot.queue.map((player, index) => {
                const isYou = player.id === playerId;
                return <QueueRow key={player.id} player={player} fallbackPosition={index + 1} isYou={isYou} ended={isTerminal(snapshot.session.status)} />;
              })}
            </View>
          )}

          <SectionTitle title="Court Status" subtitle="Occupancy is based on this session’s courts and games in progress." />
          <View style={styles.courtGrid}>
            {Array.from({ length: snapshot.session.courtCount }, (_, index) => {
              const courtNumber = index + 1;
              const occupied = occupiedCourts.has(courtNumber);
              const ended = isTerminal(snapshot.session.status);
              const label = ended ? (snapshot.session.status === "cancelled" ? "Session cancelled" : "Session ended") : occupied ? "Occupied · game in progress" : "Available";
              return <CourtStatusCard key={courtNumber} courtNumber={courtNumber} occupied={occupied && !ended} label={label} />;
            })}
          </View>

          <SectionTitle title="Games in Progress" subtitle="Current games across the shared session courts." />
          {snapshot.games.length === 0 ? (
            <EmptyState icon="tennisball-outline" title="No games in progress" subtitle="Active court games will appear here." style={styles.emptyState} />
          ) : (
            <View style={styles.list}>
              {snapshot.games.map((game) => <GameCard key={game.id} game={game} isYourGame={ownGameIds.has(game.id)} ended={isTerminal(snapshot.session.status)} onPress={() => navigation.navigate("Game", { sessionId, gameId: game.id })} />)}
            </View>
          )}
          {cta === "active" ? <Text style={[styles.liveHint, { color: c.textMuted }]}>Lobby refreshes while this screen is open.</Text> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SessionStatus({ status }: { status: PaddleSession["status"] }) {
  const { theme } = useTheme();
  const statusColor = status === "active" ? Colors.available : status === "cancelled" ? Colors.unavailable : status === "completed" ? theme.colors.textMuted : Colors.warning;
  const icon = status === "active" ? "radio-button-on" : status === "completed" ? "checkmark-circle-outline" : status === "cancelled" ? "close-circle-outline" : "time-outline";
  return (
    <View style={[styles.statusBadge, { borderColor: statusColor }]} accessibilityLabel={`Session status: ${statusLabel(status)}`}>
      <Ionicons name={icon} size={14} color={statusColor} />
      <Text style={[styles.statusText, { color: theme.colors.text }]}>{statusLabel(status)}</Text>
    </View>
  );
}

function InfoPill({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const { theme } = useTheme();
  return <View style={styles.infoPill}><Ionicons name={icon} size={16} color={Colors.brand.primary} /><Text style={[styles.infoPillText, { color: theme.colors.textSecondary }]}>{label}</Text></View>;
}

function SessionNotice({ text, icon }: { text: string; icon: keyof typeof Ionicons.glyphMap }) {
  const { theme } = useTheme();
  return <View style={[styles.notice, { backgroundColor: theme.colors.surfaceHigh }]}><Ionicons name={icon} size={18} color={theme.colors.textSecondary} /><Text style={[styles.noticeText, { color: theme.colors.textSecondary }]}>{text}</Text></View>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  const { theme } = useTheme();
  return <View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text><Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>{subtitle}</Text></View>;
}

function QueueRow({ player, fallbackPosition, isYou, ended }: { player: PaddleSessionPlayer; fallbackPosition: number; isYou: boolean; ended: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const position = player.queuePosition ?? fallbackPosition;
  return (
    <View style={[styles.queueRow, { backgroundColor: c.surface, borderColor: isYou ? Colors.brand.primary : c.border }]} accessibilityLabel={`Queue position ${position}, ${player.displayName}, ${ended ? "was waiting when the session ended" : "waiting"}${isYou ? ", you" : ""}`}>
      <View style={[styles.positionBadge, { backgroundColor: c.surfaceHigh }]}><Text style={[styles.positionText, { color: c.textSecondary }]}>{position}</Text></View>
      <View style={styles.rowCopy}>
        <Text style={[styles.playerName, { color: c.text }]}>{player.displayName}</Text>
        <Text style={[styles.rowMeta, { color: c.textSecondary }]}>{ended ? "Waiting when session ended" : "Waiting"}</Text>
      </View>
      {isYou ? <View style={styles.youBadge}><Text style={styles.youBadgeText}>You</Text></View> : null}
    </View>
  );
}

function CourtStatusCard({ courtNumber, occupied, label }: { courtNumber: number; occupied: boolean; label: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const iconColor = occupied ? Colors.brand.primary : c.textMuted;
  return (
    <View style={[styles.courtCard, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLabel={`Court ${courtNumber}: ${label}`}>
      <View style={styles.courtHeading}><Ionicons name="tennisball-outline" size={18} color={iconColor} /><Text style={[styles.courtTitle, { color: c.text }]}>Court {courtNumber}</Text></View>
      <Text style={[styles.courtState, { color: c.textSecondary }]}>{label}</Text>
    </View>
  );
}

function GameCard({ game, isYourGame, ended, onPress }: { game: PaddleGameWithPlayers; isYourGame: boolean; ended: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const team1 = game.participants.filter((participant) => participant.teamNumber === 1).map((participant) => participant.player.displayName);
  const team2 = game.participants.filter((participant) => participant.teamNumber === 2).map((participant) => participant.player.displayName);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.gameCard, { backgroundColor: c.surface, borderColor: isYourGame ? Colors.brand.primary : c.border }]} accessibilityRole="button" accessibilityLabel={`Open Court ${game.courtNumber} game. Team one: ${team1.join(" and ") || "players not available"}. Team two: ${team2.join(" and ") || "players not available"}${isYourGame ? ". Your game" : ""}`}>
      <View style={styles.gameHeading}>
        <View style={styles.gameCourt}><Ionicons name="tennisball-outline" size={17} color={Colors.brand.primary} /><Text style={[styles.gameCourtText, { color: c.text }]}>Court {game.courtNumber}</Text></View>
        <View style={styles.inProgressBadge}><Text style={styles.inProgressText}>{ended ? "Session ended" : "In progress"}</Text></View>
      </View>
      <TeamLine names={team1} team="Team 1" />
      <View style={[styles.vsDivider, { borderTopColor: c.border }]}><Text style={[styles.vsText, { color: c.textMuted }]}>VS</Text></View>
      <TeamLine names={team2} team="Team 2" />
      {isYourGame ? <View style={styles.yourGameLabel}><Ionicons name="person-circle-outline" size={16} color={Colors.brand.primary} /><Text style={styles.yourGameText}>Your game</Text></View> : null}
    </TouchableOpacity>
  );
}

function TeamLine({ names, team }: { names: string[]; team: string }) {
  const { theme } = useTheme();
  return <View style={styles.teamLine}><Text style={[styles.teamLabel, { color: theme.colors.textMuted }]}>{team}</Text><Text style={[styles.teamNames, { color: theme.colors.text }]}>{names.length ? names.join(" + ") : "Players unavailable"}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { minHeight: 52, paddingHorizontal: Spacing.md, flexDirection: "row", alignItems: "center" },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topBarTitle: { flex: 1, textAlign: "center", fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  topBarSpacer: { width: 44 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  refreshError: { marginHorizontal: 0, marginTop: 0 },
  sessionCard: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg },
  sessionHeading: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  venueIcon: { width: 42, height: 42, borderRadius: Radius.md, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(34,197,94,0.12)" },
  sessionHeadingCopy: { flex: 1, gap: Spacing.xs },
  venueTitle: { fontSize: Typography.cardTitle, fontWeight: FontWeight.bold },
  dateTime: { fontSize: Typography.bodySmall },
  statusBadge: { minHeight: 30, borderRadius: Radius.pill, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: Spacing.xs, paddingHorizontal: Spacing.sm },
  statusText: { fontSize: Typography.caption, fontWeight: FontWeight.semibold },
  sessionDetails: { borderTopWidth: 1, marginTop: Spacing.md, paddingTop: Spacing.md, flexDirection: "row", flexWrap: "wrap", gap: Spacing.md },
  rotationButton: { minHeight: 48, borderRadius: Radius.md, backgroundColor: Colors.brand.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingHorizontal: Spacing.md, marginTop: Spacing.md },
  rotationButtonText: { flex: 1, color: "#FFFFFF", fontSize: Typography.bodySmall, fontWeight: FontWeight.bold },
  organizerButton: { minHeight: 44, borderWidth: 1, borderRadius: Radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.xs, paddingHorizontal: Spacing.sm, marginTop: Spacing.sm },
  secondaryNavigation: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm },
  secondaryNavButton: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: Radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.xs, paddingHorizontal: Spacing.sm },
  secondaryNavText: { fontSize: Typography.caption, fontWeight: FontWeight.semibold },
  infoPill: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  infoPillText: { fontSize: Typography.caption },
  notice: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, borderRadius: Radius.sm, padding: Spacing.md, marginTop: Spacing.md },
  noticeText: { flex: 1, fontSize: Typography.caption, lineHeight: 18 },
  sectionHeading: { marginTop: Spacing.xxl, marginBottom: Spacing.md, gap: Spacing.xs },
  sectionTitle: { fontSize: Typography.cardTitle, fontWeight: FontWeight.bold },
  sectionSubtitle: { fontSize: Typography.caption, lineHeight: 18 },
  emptyState: { paddingVertical: Spacing.xl, paddingHorizontal: Spacing.lg },
  list: { gap: Spacing.sm },
  queueRow: { minHeight: 70, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, flexDirection: "row", alignItems: "center", gap: Spacing.md },
  positionBadge: { width: 36, height: 36, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center" },
  positionText: { fontSize: Typography.bodySmall, fontWeight: FontWeight.bold },
  rowCopy: { flex: 1, gap: 3 },
  playerName: { fontSize: Typography.body, fontWeight: FontWeight.semibold },
  rowMeta: { fontSize: Typography.caption },
  youBadge: { backgroundColor: "rgba(34,197,94,0.16)", borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  youBadgeText: { color: Colors.brand.primaryDark, fontSize: Typography.caption, fontWeight: FontWeight.bold },
  courtGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  courtCard: { width: "48%", minHeight: 82, flexGrow: 1, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, justifyContent: "center", gap: Spacing.xs },
  courtHeading: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  courtTitle: { fontSize: Typography.bodySmall, fontWeight: FontWeight.semibold },
  courtState: { fontSize: Typography.caption },
  gameCard: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.lg },
  gameHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.md },
  gameCourt: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  gameCourtText: { fontSize: Typography.body, fontWeight: FontWeight.bold },
  inProgressBadge: { backgroundColor: "rgba(34,197,94,0.14)", borderRadius: Radius.pill, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  inProgressText: { color: Colors.brand.primaryDark, fontSize: Typography.caption, fontWeight: FontWeight.semibold },
  teamLine: { gap: Spacing.xs },
  teamLabel: { fontSize: Typography.caption, fontWeight: FontWeight.semibold },
  teamNames: { fontSize: Typography.body, fontWeight: FontWeight.semibold },
  vsDivider: { borderTopWidth: 1, marginVertical: Spacing.md, alignItems: "center" },
  vsText: { fontSize: 10, fontWeight: FontWeight.bold, backgroundColor: "transparent", marginTop: -7, paddingHorizontal: Spacing.sm },
  yourGameLabel: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, marginTop: Spacing.md },
  yourGameText: { color: Colors.brand.primaryDark, fontSize: Typography.caption, fontWeight: FontWeight.bold },
  liveHint: { marginTop: Spacing.xl, textAlign: "center", fontSize: Typography.caption },
});
