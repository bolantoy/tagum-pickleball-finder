import React, { useCallback, useRef, useState } from "react";
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useTheme } from "../context/ThemeContext";
import {
  usePaddleQSessionStorage,
  type RememberedPaddleSession,
} from "../context/PaddleQSessionContext";
import { Colors } from "../constants/colors";
import { FontWeight, Radius, Spacing, Typography } from "../constants/design";
import EmptyState from "../components/EmptyState";
import ErrorMessage from "../components/ErrorMessage";
import LoadingSpinner from "../components/LoadingSpinner";
import { PaddleQApiError, paddleQApi } from "../services/paddleQApi";
import type { PaddleQStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<PaddleQStackParamList, "SessionsHome">;

export default function PaddleQSessionsHomeScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const storage = usePaddleQSessionStorage();
  const { getRememberedSessions } = storage;
  const [sessions, setSessions] = useState<RememberedPaddleSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [rejoiningSessionId, setRejoiningSessionId] = useState<string | null>(null);
  const [rejoinError, setRejoinError] = useState<{ sessionId: string; message: string } | null>(null);
  const requestLock = useRef(false);
  const rejoinLock = useRef(false);

  const loadSessions = useCallback(async () => {
    if (requestLock.current) return;
    requestLock.current = true;
    setLoading(true);
    setLoadError(false);
    try {
      setSessions(await getRememberedSessions());
    } catch {
      setLoadError(true);
    } finally {
      requestLock.current = false;
      setLoading(false);
    }
  }, [getRememberedSessions]);

  useFocusEffect(useCallback(() => {
    void loadSessions();
    return undefined;
  }, [loadSessions]));

  const rejoinRememberedSession = async (session: RememberedPaddleSession) => {
    if (rejoinLock.current || !session.playerId) return;
    rejoinLock.current = true;
    setRejoiningSessionId(session.sessionId);
    setRejoinError(null);
    try {
      const credential = await storage.getPlayerCredential(session.sessionId, session.playerId);
      if (!credential) {
        setRejoinError({ sessionId: session.sessionId, message: "The saved player credential is unavailable on this device. No new player was created." });
        return;
      }
      await paddleQApi.rejoinPlayer(session.sessionId, session.playerId, credential);
      navigation.navigate("SessionLobby", { sessionId: session.sessionId });
    } catch (error) {
      const message = error instanceof PaddleQApiError && (error.status === 401 || error.code === "PLAYER_CREDENTIAL_INVALID" || error.code === "PLAYER_CREDENTIAL_REQUIRED")
        ? "This saved player credential is invalid or expired. No new player was created."
        : error instanceof PaddleQApiError && (error.status === 404 || error.code === "NOT_FOUND")
          ? "This session or player could not be found. No new player was created."
          : error instanceof PaddleQApiError && (error.status === 409 || error.code === "INVALID_STATE")
            ? "This player cannot rejoin in the session's current state. No new player was created."
            : "Could not rejoin this player. Check your connection and try again. No new player was created.";
      setRejoinError({ sessionId: session.sessionId, message });
    } finally {
      rejoinLock.current = false;
      setRejoiningSessionId(null);
    }
  };

  const c = theme.colors;

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar barStyle={theme.isDark ? "light-content" : "dark-content"} backgroundColor={c.background} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={[styles.titleIcon, { backgroundColor: c.surface }]}>
              <Ionicons name="tennisball-outline" size={24} color={Colors.brand.primary} />
            </View>
            <View style={styles.titleCopy}>
              <Text style={[styles.title, { color: c.text }]}>Paddle Q</Text>
              <Text style={[styles.subtitle, { color: c.textSecondary }]}>Open play sessions</Text>
            </View>
          </View>
          <Text style={[styles.description, { color: c.textSecondary }]}>
            Keep the shared queue moving and manage games across your courts.
          </Text>
        </View>

        <View style={styles.actions}>
          <PrimaryAction
            title="Create Session"
            icon="add-circle-outline"
            onPress={() => navigation.navigate("CreateSession")}
          />
          <SecondaryAction
            title="Join Session"
            icon="enter-outline"
            onPress={() => navigation.navigate("JoinSession")}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Remembered Sessions</Text>
          {sessions.length > 0 && <Text style={[styles.count, { color: c.textMuted }]}>{sessions.length}</Text>}
        </View>

        {loading ? (
          <LoadingSpinner message="Loading remembered sessions" size="small" />
        ) : loadError ? (
          <ErrorMessage
            title="Could not load sessions"
            message="Your remembered Paddle Q sessions could not be loaded."
            onRetry={() => void loadSessions()}
          />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No remembered sessions"
            subtitle="Sessions you create or join will appear here for quick access."
            style={styles.emptyState}
          />
        ) : (
          <View style={styles.sessionList}>
            {sessions.map((session) => (
              <RememberedSessionCard
                key={session.sessionId}
                session={session}
                onPress={() => navigation.navigate("SessionLobby", { sessionId: session.sessionId })}
                onRejoin={session.playerId ? () => void rejoinRememberedSession(session) : undefined}
                rejoining={rejoiningSessionId === session.sessionId}
                rejoinError={rejoinError?.sessionId === session.sessionId ? rejoinError.message : undefined}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PrimaryAction({ title, icon, onPress }: { title: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.primaryAction} onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
      <Ionicons name={icon} size={21} color="#FFFFFF" />
      <Text style={styles.primaryActionText}>{title}</Text>
      <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
    </TouchableOpacity>
  );
}

function SecondaryAction({ title, icon, onPress }: { title: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.secondaryAction, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={21} color={Colors.brand.primary} />
      <Text style={[styles.secondaryActionText, { color: theme.colors.text }]}>{title}</Text>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );
}

function RememberedSessionCard({ session, onPress, onRejoin, rejoining, rejoinError }: {
  session: RememberedPaddleSession;
  onPress: () => void;
  onRejoin?: () => void;
  rejoining: boolean;
  rejoinError?: string;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={[styles.sessionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Open session lobby">
        <View style={styles.sessionCardText}>
          <Text style={[styles.sessionName, { color: c.text }]} numberOfLines={1}>
            {session.venueName || "Paddle Q Session"}
          </Text>
          <Text style={[styles.sessionMeta, { color: c.textSecondary }]}>
            {[session.sessionDate, session.startTime].filter(Boolean).join(" · ") || session.sessionId}
          </Text>
          <Text style={[styles.sessionRole, { color: c.textMuted }]}>
            {session.role === "both" ? "Organizer and player" : session.role[0].toUpperCase() + session.role.slice(1)}
          </Text>
        </View>
      </TouchableOpacity>
      {onRejoin ? (
        <TouchableOpacity
          style={[styles.rejoinButton, { borderColor: c.border }]}
          onPress={onRejoin}
          disabled={rejoining}
          accessibilityRole="button"
          accessibilityLabel={`Rejoin session as ${session.displayName ?? "remembered player"}`}
        >
          {rejoining ? <LoadingSpinner size="small" /> : <Ionicons name="enter-outline" size={18} color={Colors.brand.primary} />}
          <Text style={[styles.rejoinButtonText, { color: c.text }]}>{rejoining ? "Rejoining…" : `Rejoin as ${session.displayName ?? "player"}`}</Text>
        </TouchableOpacity>
      ) : null}
      {rejoinError ? <Text style={[styles.rejoinError, { color: Colors.unavailable }]} accessibilityRole="alert">{rejoinError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxxl },
  header: { paddingTop: Spacing.xl, paddingBottom: Spacing.xl },
  titleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  titleIcon: { width: 48, height: 48, borderRadius: Radius.md, alignItems: "center", justifyContent: "center" },
  titleCopy: { flex: 1 },
  title: { fontSize: Typography.sectionTitle, fontWeight: FontWeight.bold },
  subtitle: { marginTop: Spacing.xs, fontSize: Typography.bodySmall },
  description: { marginTop: Spacing.lg, fontSize: Typography.body, lineHeight: 23 },
  actions: { gap: Spacing.md },
  primaryAction: {
    minHeight: 56,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  primaryActionText: { flex: 1, color: "#FFFFFF", fontSize: Typography.body, fontWeight: FontWeight.semibold },
  secondaryAction: {
    minHeight: 56,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  secondaryActionText: { flex: 1, fontSize: Typography.body, fontWeight: FontWeight.semibold },
  sectionHeader: { marginTop: Spacing.xxxl, marginBottom: Spacing.md, flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  sectionTitle: { fontSize: Typography.cardTitle, fontWeight: FontWeight.semibold },
  count: { fontSize: Typography.bodySmall },
  emptyState: { paddingHorizontal: Spacing.md },
  sessionList: { gap: Spacing.md },
  sessionCard: {
    minHeight: 84,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  sessionCardText: { flex: 1, gap: Spacing.xs },
  sessionName: { fontSize: Typography.body, fontWeight: FontWeight.semibold },
  sessionMeta: { fontSize: Typography.bodySmall },
  sessionRole: { fontSize: Typography.caption },
  rejoinButton: { minHeight: 42, marginTop: Spacing.md, paddingHorizontal: Spacing.md, borderWidth: 1, borderRadius: Radius.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm },
  rejoinButtonText: { fontSize: Typography.bodySmall, fontWeight: FontWeight.semibold },
  rejoinError: { marginTop: Spacing.sm, fontSize: Typography.caption, lineHeight: 18 },
});
