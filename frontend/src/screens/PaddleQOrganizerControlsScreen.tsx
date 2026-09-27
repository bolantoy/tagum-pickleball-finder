import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useTheme } from "../context/ThemeContext";
import { usePaddleQSessionStorage } from "../context/PaddleQSessionContext";
import { Colors } from "../constants/colors";
import { FontWeight, Radius, Spacing, Typography } from "../constants/design";
import ErrorMessage from "../components/ErrorMessage";
import LoadingSpinner from "../components/LoadingSpinner";
import { PaddleQApiError, paddleQApi } from "../services/paddleQApi";
import type { PaddleSession } from "../../../shared/types";
import type { PaddleQStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<PaddleQStackParamList, "OrganizerControls">;
type LifecycleAction = "start" | "complete" | "cancel";

function localEndTime(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.hour}:${values.minute}`;
}

function statusLabel(status: PaddleSession["status"]): string {
  switch (status) {
    case "scheduled": return "Scheduled";
    case "active": return "Active";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
  }
}

function loadError(error: unknown): { title: string; message: string; notFound: boolean } {
  if (error instanceof PaddleQApiError && (error.status === 404 || error.code === "NOT_FOUND")) {
    return { title: "Session not found", message: "This session is no longer available.", notFound: true };
  }
  if (error instanceof PaddleQApiError && (error.status === 0 || error.code === "NETWORK_ERROR")) {
    return { title: "Connection problem", message: "Paddle Q could not be reached. Check your connection and try again.", notFound: false };
  }
  return { title: "Could not load session", message: "Session details could not be refreshed. Try again.", notFound: false };
}

function mutationError(error: unknown): { title: string; message: string; unauthorized: boolean; conflict: boolean } {
  if (error instanceof PaddleQApiError && (error.status === 401 || error.status === 403 || error.code.startsWith("ORGANIZER_CAPABILITY"))) {
    return { title: "Organizer access is no longer valid", message: "This screen is now read-only. The saved capability has not been removed.", unauthorized: true, conflict: false };
  }
  if (error instanceof PaddleQApiError && (error.status === 409 || error.code === "INVALID_STATE" || error.code === "CONFLICT")) {
    return { title: "Session state changed", message: "The session changed before the action completed. Current details are being refreshed.", unauthorized: false, conflict: true };
  }
  if (error instanceof PaddleQApiError && (error.status === 0 || error.code === "NETWORK_ERROR")) {
    return { title: "Connection problem", message: "Paddle Q could not be reached. The action was not confirmed.", unauthorized: false, conflict: false };
  }
  return { title: "Action could not be completed", message: "Paddle Q could not complete that action. Refresh session details and try again.", unauthorized: false, conflict: false };
}

export default function PaddleQOrganizerControlsScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const storage = usePaddleQSessionStorage();
  const sessionId = route.params.sessionId;
  const [session, setSession] = useState<PaddleSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [organizerAvailable, setOrganizerAvailable] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [authorizationRejected, setAuthorizationRejected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [notFound, setNotFound] = useState(false);
  const requestLock = useRef(false);
  const mutationLock = useRef(false);
  const pendingReplacement = useRef<string | null>(null);
  const mounted = useRef(true);
  const c = theme.colors;

  const refreshSession = useCallback(async () => {
    if (requestLock.current) return;
    requestLock.current = true;
    try {
      const current = await paddleQApi.getSession(sessionId);
      if (!mounted.current) return;
      setSession(current);
      setError(null);
      setNotFound(false);
    } catch (reason) {
      if (!mounted.current) return;
      const mapped = loadError(reason);
      setError({ title: mapped.title, message: mapped.message });
      if (mapped.notFound) setNotFound(true);
    } finally {
      requestLock.current = false;
      if (mounted.current) setSessionLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    void refreshSession();
    return undefined;
  }, [refreshSession]));

  useEffect(() => {
    let cancelled = false;
    void storage.getOrganizerCapability(sessionId).then((capability) => {
      if (!cancelled) {
        setOrganizerAvailable(Boolean(capability));
        setAccessChecked(true);
      }
    }).catch(() => {
      if (!cancelled) {
        setOrganizerAvailable(false);
        setAccessChecked(true);
      }
    });
    return () => { cancelled = true; };
  }, [sessionId, storage]);

  const navigateToLobby = () => navigation.navigate("SessionLobby", { sessionId });

  const authorize = async (): Promise<string | null> => {
    let capability: string | null;
    try {
      capability = await storage.getOrganizerCapability(sessionId);
    } catch {
      setOrganizerAvailable(false);
      setError({ title: "Secure storage unavailable", message: "Organizer access cannot be read securely on this device. No organizer action was sent." });
      return null;
    }
    if (!capability) {
      setOrganizerAvailable(false);
      setError({ title: "Organizer access unavailable", message: "No organizer capability is saved on this device. This screen is read-only." });
      return null;
    }
    return capability;
  };

  const runLifecycleAction = async (action: LifecycleAction) => {
    if (mutationLock.current || !organizerAvailable || authorizationRejected || !session) return;
    mutationLock.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const capability = await authorize();
      if (!capability) return;
      if (action === "start") {
        await paddleQApi.updateSession(sessionId, capability, { status: "active" });
      } else if (action === "complete") {
        await paddleQApi.updateSession(sessionId, capability, { status: "completed", endTime: localEndTime() });
      } else {
        await paddleQApi.updateSession(sessionId, capability, { status: "cancelled" });
      }
      // The lobby reads the resulting status from the server when it regains focus.
      navigateToLobby();
    } catch (reason) {
      const mapped = mutationError(reason);
      if (mapped.unauthorized) {
        setOrganizerAvailable(false);
        setAuthorizationRejected(true);
      }
      setError({ title: mapped.title, message: mapped.message });
      if (mapped.conflict) void refreshSession();
    } finally {
      mutationLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const confirmLifecycle = (action: LifecycleAction) => {
    const content = action === "start"
      ? { title: "Start this session?", message: "The session will become active and can receive rotation recommendations and games.", button: "Start Session" }
      : action === "complete"
        ? { title: "End this session?", message: "The session will be marked completed and become read-only. Its game history will remain available.", button: "End Session" }
        : { title: "Cancel this session?", message: "The session will be marked cancelled and become read-only. Existing session history will remain available.", button: "Cancel Session" };
    Alert.alert(content.title, content.message, [
      { text: "Keep Session", style: "cancel" },
      { text: content.button, style: action === "cancel" ? "destructive" : "default", onPress: () => { void runLifecycleAction(action); } },
    ]);
  };

  const retrySavingReplacement = async () => {
    const replacement = pendingReplacement.current;
    if (!replacement || busy) return;
    setBusy(true);
    try {
      await storage.saveOrganizerCapability(sessionId, replacement);
      pendingReplacement.current = null;
      setOrganizerAvailable(true);
      setAuthorizationRejected(false);
      setError(null);
      setNotice("Organizer capability rotated and saved securely on this device.");
    } catch {
      setError({ title: "Could not save organizer access", message: "The replacement capability could not be saved securely. Retry the secure save; the capability will not be shown." });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const rotateCapability = async () => {
    if (mutationLock.current || !organizerAvailable || authorizationRejected) return;
    if (pendingReplacement.current) {
      await retrySavingReplacement();
      return;
    }
    mutationLock.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const capability = await authorize();
      if (!capability) return;
      const result = await paddleQApi.rotateOrganizerCapability(sessionId, capability);
      // Hold the one-time replacement only in memory until SecureStore confirms it.
      pendingReplacement.current = result.organizerSecret;
      setOrganizerAvailable(false);
      await retrySavingReplacement();
    } catch (reason) {
      const mapped = mutationError(reason);
      if (mapped.unauthorized) {
        setOrganizerAvailable(false);
        setAuthorizationRejected(true);
      }
      setError({ title: mapped.title, message: mapped.message });
    } finally {
      mutationLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const confirmRotation = () => Alert.alert(
    "Rotate organizer capability?",
    "The current capability will stop working. A replacement will be saved securely on this device if storage succeeds.",
    [
      { text: "Keep Current", style: "cancel" },
      { text: "Rotate Capability", onPress: () => { void rotateCapability(); } },
    ]
  );

  const revokeCapability = async () => {
    if (mutationLock.current || !organizerAvailable || authorizationRejected) return;
    mutationLock.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const capability = await authorize();
      if (!capability) return;
      await paddleQApi.revokeOrganizerCapability(sessionId, capability);
      setOrganizerAvailable(false);
      setAuthorizationRejected(false);
      try {
        await storage.removeOrganizerCapability(sessionId);
        setNotice("Organizer capability revoked. This device is now read-only.");
      } catch {
        setNotice("Organizer capability was revoked. This device is now read-only; its invalid local copy could not be cleared.");
      }
    } catch (reason) {
      const mapped = mutationError(reason);
      if (mapped.unauthorized) {
        setOrganizerAvailable(false);
        setAuthorizationRejected(true);
      }
      setError({ title: mapped.title, message: mapped.message });
      if (mapped.conflict) void refreshSession();
    } finally {
      mutationLock.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const confirmRevocation = () => Alert.alert(
    "Revoke organizer capability?",
    "This replaces the current capability and invalidates every saved copy. This device will lose organizer access.",
    [
      { text: "Keep Access", style: "cancel" },
      { text: "Revoke Access", style: "destructive", onPress: () => { void revokeCapability(); } },
    ]
  );

  const readOnly = Boolean(session && (session.status === "completed" || session.status === "cancelled"));
  const canManage = Boolean(session && !readOnly && organizerAvailable && !authorizationRejected);

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar barStyle={theme.isDark ? "light-content" : "dark-content"} backgroundColor={c.background} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={navigateToLobby} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Return to session lobby">
          <Ionicons name="arrow-back" size={23} color={c.text} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: c.text }]}>Organizer Controls</Text>
        <TouchableOpacity onPress={() => void refreshSession()} style={styles.refreshButton} accessibilityRole="button" accessibilityLabel="Refresh session details" disabled={sessionLoading || busy}>
          <Ionicons name="refresh" size={20} color={sessionLoading || busy ? c.textMuted : Colors.brand.primary} />
        </TouchableOpacity>
      </View>

      {sessionLoading && !session ? <LoadingSpinner message="Loading organizer controls" /> : notFound && !session ? (
        <ErrorMessage title={error?.title ?? "Session not found"} message={error?.message ?? "This session is not available."} onRetry={() => { setNotFound(false); void refreshSession(); }} />
      ) : !session ? (
        <ErrorMessage title={error?.title ?? "Could not load session"} message={error?.message ?? "Try refreshing session details."} onRetry={() => void refreshSession()} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {error ? <ErrorMessage title={error.title} message={error.message} style={styles.inlineError} /> : null}
          <View style={[styles.sessionCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.sessionHeading}>
              <View style={styles.sessionIcon}><Ionicons name="clipboard-outline" size={22} color={Colors.brand.primary} /></View>
              <View style={styles.sessionCopy}>
                <Text style={[styles.sessionTitle, { color: c.text }]}>Session controls</Text>
                <Text style={[styles.sessionMeta, { color: c.textSecondary }]}>{session.sessionDate} · {session.startTime}</Text>
              </View>
              <SessionStatus status={session.status} />
            </View>
            <View style={[styles.detailLine, { borderTopColor: c.border }]}>
              <Ionicons name="business-outline" size={17} color={c.textSecondary} />
              <Text style={[styles.detailText, { color: c.textSecondary }]}>{session.courtCount} {session.courtCount === 1 ? "session court" : "session courts"}</Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: c.text }]}>Organizer access</Text>
          <View style={[styles.accessCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Ionicons name={organizerAvailable && !authorizationRejected ? "shield-checkmark-outline" : "eye-outline"} size={21} color={organizerAvailable && !authorizationRejected ? Colors.brand.primary : c.textMuted} />
            <View style={styles.accessCopy}>
              <Text style={[styles.accessTitle, { color: c.text }]}>{authorizationRejected ? "Read-only access" : organizerAvailable ? "Capability saved on this device" : "Organizer access unavailable"}</Text>
              <Text style={[styles.accessSubtitle, { color: c.textSecondary }]}>{authorizationRejected ? "The server rejected organizer access. The saved capability was left unchanged." : organizerAvailable ? "The capability is stored securely. Its server-side validity is checked when an action is requested." : "No organizer capability is stored here. You can still view the session lobby."}</Text>
            </View>
          </View>

          {notice ? <View style={[styles.successNotice, { backgroundColor: c.surfaceHigh }]}><Ionicons name="information-circle-outline" size={18} color={c.textSecondary} /><Text style={[styles.successText, { color: c.textSecondary }]}>{notice}</Text></View> : null}

          {pendingReplacement.current ? (
            <View style={[styles.retryPanel, { backgroundColor: c.surface, borderColor: Colors.warning }]}>
              <Text style={[styles.actionTitle, { color: c.text }]}>Save replacement organizer access</Text>
              <Text style={[styles.actionDescription, { color: c.textSecondary }]}>The server rotated the capability, but secure storage did not confirm the replacement. Retry saving it without rotating again.</Text>
              <ActionButton title={busy ? "Saving securely…" : "Retry secure save"} icon="lock-closed-outline" onPress={() => void retrySavingReplacement()} disabled={busy} />
            </View>
          ) : null}

          {readOnly ? (
            <ReadOnlyNotice message={`This session is ${session.status}. Session actions are unavailable.`} />
          ) : authorizationRejected ? (
            <ReadOnlyNotice message="Organizer access is no longer valid. Return to the lobby for read-only session information." />
          ) : !organizerAvailable ? (
            <ReadOnlyNotice message="Organizer controls are hidden because this device has no locally stored organizer capability." />
          ) : canManage ? (
            <View style={styles.actionsSection}>
              <Text style={[styles.sectionTitle, { color: c.text }]}>Session actions</Text>
              {session.status === "scheduled" ? (
                <ActionCard title="Start Session" description="Mark this open-play session active so rotation recommendations and games can begin." icon="play-circle-outline" onPress={() => confirmLifecycle("start")} disabled={busy} />
              ) : null}
              {session.status === "active" ? (
                <ActionCard title="End Session" description="Complete the session and record its end time. The session becomes read-only." icon="checkmark-circle-outline" onPress={() => confirmLifecycle("complete")} disabled={busy} />
              ) : null}
              {session.status === "scheduled" || session.status === "active" ? (
                <ActionCard title="Cancel Session" description="Cancel the session. Existing session and game history is retained." icon="close-circle-outline" destructive onPress={() => confirmLifecycle("cancel")} disabled={busy} />
              ) : null}

              <Text style={[styles.sectionTitle, styles.capabilitySectionTitle, { color: c.text }]}>Organizer capability</Text>
              <ActionCard title="Rotate Capability" description="Replace the current capability and save the replacement securely on this device." icon="sync-circle-outline" onPress={confirmRotation} disabled={busy} />
              <ActionCard title="Revoke Capability" description="Invalidate the current capability and remove its local copy from this device." icon="shield-outline" destructive onPress={confirmRevocation} disabled={busy} />
              {busy ? <LoadingSpinner size="small" message="Updating Paddle Q session" /> : null}
            </View>
          ) : null}
          {!accessChecked ? <LoadingSpinner size="small" message="Checking organizer access" /> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SessionStatus({ status }: { status: PaddleSession["status"] }) {
  const { theme } = useTheme();
  const color = status === "active" ? Colors.available : status === "cancelled" ? Colors.unavailable : status === "completed" ? theme.colors.textMuted : Colors.warning;
  const icon = status === "active" ? "radio-button-on" : status === "completed" ? "checkmark-circle-outline" : status === "cancelled" ? "close-circle-outline" : "time-outline";
  return <View style={[styles.statusBadge, { borderColor: color }]} accessibilityLabel={`Session status: ${statusLabel(status)}`}><Ionicons name={icon} size={14} color={color} /><Text style={[styles.statusText, { color: theme.colors.text }]}>{statusLabel(status)}</Text></View>;
}

function ReadOnlyNotice({ message }: { message: string }) {
  const { theme } = useTheme();
  return <View style={[styles.readOnlyNotice, { backgroundColor: theme.colors.surfaceHigh }]}><Ionicons name="eye-outline" size={19} color={theme.colors.textSecondary} /><Text style={[styles.readOnlyText, { color: theme.colors.textSecondary }]}>{message}</Text></View>;
}

function ActionCard({ title, description, icon, destructive, onPress, disabled }: {
  title: string; description: string; icon: keyof typeof Ionicons.glyphMap; destructive?: boolean; onPress: () => void; disabled: boolean;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const color = destructive ? Colors.unavailable : Colors.brand.primary;
  return (
    <TouchableOpacity style={[styles.actionCard, { backgroundColor: c.surface, borderColor: destructive ? `${Colors.unavailable}80` : c.border }, disabled && styles.disabled]} onPress={onPress} disabled={disabled} activeOpacity={0.82} accessibilityRole="button">
      <View style={[styles.actionIcon, { backgroundColor: destructive ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)" }]}><Ionicons name={icon} size={22} color={color} /></View>
      <View style={styles.actionCopy}><Text style={[styles.actionTitle, { color: c.text }]}>{title}</Text><Text style={[styles.actionDescription, { color: c.textSecondary }]}>{description}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
    </TouchableOpacity>
  );
}

function ActionButton({ title, icon, onPress, disabled }: { title: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled: boolean }) {
  return <TouchableOpacity style={[styles.retryButton, disabled && styles.disabled]} onPress={onPress} disabled={disabled} accessibilityRole="button"><Ionicons name={icon} size={18} color="#FFFFFF" /><Text style={styles.retryButtonText}>{title}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { minHeight: 52, paddingHorizontal: Spacing.md, flexDirection: "row", alignItems: "center" },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topBarTitle: { flex: 1, textAlign: "center", fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  refreshButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl },
  inlineError: { marginHorizontal: 0, marginTop: 0 },
  sessionCard: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md },
  sessionHeading: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  sessionIcon: { width: 44, height: 44, borderRadius: Radius.md, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(34,197,94,0.12)" },
  sessionCopy: { flex: 1, gap: Spacing.xs },
  sessionTitle: { fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  sessionMeta: { fontSize: Typography.caption },
  statusBadge: { minHeight: 30, borderRadius: Radius.pill, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: Spacing.xs, paddingHorizontal: Spacing.sm },
  statusText: { fontSize: Typography.caption, fontWeight: FontWeight.semibold },
  detailLine: { borderTopWidth: 1, marginTop: Spacing.md, paddingTop: Spacing.md, flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  detailText: { fontSize: Typography.bodySmall },
  sectionTitle: { marginTop: Spacing.xl, marginBottom: Spacing.sm, fontSize: Typography.bodyLarge, fontWeight: FontWeight.bold },
  accessCard: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, flexDirection: "row", alignItems: "flex-start", gap: Spacing.md },
  accessCopy: { flex: 1, gap: Spacing.xs },
  accessTitle: { fontSize: Typography.bodySmall, fontWeight: FontWeight.bold },
  accessSubtitle: { fontSize: Typography.caption, lineHeight: 18 },
  successNotice: { marginTop: Spacing.md, borderRadius: Radius.md, padding: Spacing.md, flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  successText: { flex: 1, fontSize: Typography.bodySmall, lineHeight: 19 },
  readOnlyNotice: { marginTop: Spacing.xl, padding: Spacing.md, borderRadius: Radius.md, flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  readOnlyText: { flex: 1, fontSize: Typography.bodySmall, lineHeight: 20 },
  actionsSection: { marginTop: Spacing.sm, gap: Spacing.md },
  capabilitySectionTitle: { marginTop: Spacing.xl },
  actionCard: { minHeight: 74, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.sm, flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  actionIcon: { width: 38, height: 38, borderRadius: Radius.md, alignItems: "center", justifyContent: "center" },
  actionCopy: { flex: 1, gap: Spacing.xs },
  actionTitle: { fontSize: Typography.bodySmall, fontWeight: FontWeight.bold },
  actionDescription: { fontSize: Typography.caption, lineHeight: 18 },
  retryPanel: { marginTop: Spacing.xl, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm },
  retryButton: { minHeight: 48, borderRadius: Radius.md, marginTop: Spacing.sm, backgroundColor: Colors.brand.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: Spacing.sm },
  retryButtonText: { color: "#FFFFFF", fontSize: Typography.bodySmall, fontWeight: FontWeight.bold },
  disabled: { opacity: 0.55 },
});
