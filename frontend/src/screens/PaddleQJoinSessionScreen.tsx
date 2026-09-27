import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useTheme } from "../context/ThemeContext";
import { usePaddleQSessionStorage } from "../context/PaddleQSessionContext";
import { Colors } from "../constants/colors";
import { FontWeight, Radius, Spacing, Typography } from "../constants/design";
import ErrorMessage from "../components/ErrorMessage";
import LoadingSpinner from "../components/LoadingSpinner";
import { paddleQApi, PaddleQApiError } from "../services/paddleQApi";
import type { PaddlePlayerJoinResponse } from "../types/paddleQ";
import type { PaddleSession } from "../../../shared/types";
import type { PaddleQStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<PaddleQStackParamList, "JoinSession">;
type PendingJoin = { session: PaddleSession; player: PaddlePlayerJoinResponse["player"]; playerCredential: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function joinErrorMessage(error: unknown): string {
  if (!(error instanceof PaddleQApiError)) return "You could not join the session. Check your connection and try again.";
  if (error.status === 0 || error.code === "NETWORK_ERROR") return "Unable to reach Paddle Q. Check your connection and try again.";
  if (error.status === 404 || error.code === "NOT_FOUND") return "Session not found. Check the session ID and try again.";
  if (error.code === "CONFLICT" || error.status === 409 && /name|player/i.test(error.message)) return "A player with that name is already in this session. Choose a different display name.";
  if (error.code === "INVALID_STATE" || error.status === 409) return "This session is not accepting players right now.";
  if (error.status === 400 || error.code === "VALIDATION_ERROR") return "Check the session ID and display name, then try again.";
  if (error.status >= 500) return "Paddle Q is temporarily unavailable. Try again shortly.";
  return "You could not join the session. Check the details and try again.";
}

export default function PaddleQJoinSessionScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const storage = usePaddleQSessionStorage();
  const [sessionId, setSessionId] = useState(route.params?.sessionId ?? "");
  const [displayName, setDisplayName] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pendingRef = useRef<PendingJoin | null>(null);
  const submitLock = useRef(false);
  const c = theme.colors;

  useEffect(() => {
    if (route.params?.sessionId) setSessionId(route.params.sessionId);
  }, [route.params?.sessionId]);

  const persistAndContinue = async (pending: PendingJoin) => {
    try {
      await storage.savePlayerCredential(pending.session.id, pending.player.id, pending.playerCredential);
      await storage.saveRememberedSession({
        sessionId: pending.session.id,
        role: "player",
        playerId: pending.player.id,
        displayName: pending.player.displayName,
        venueId: pending.session.venueId,
        sessionDate: pending.session.sessionDate,
        startTime: pending.session.startTime,
      });
    } catch {
      setFormError("Your player credential could not be saved securely on this device. Your details are preserved; retry to save and continue.");
      return;
    }
    pendingRef.current = null;
    navigation.replace("SessionLobby", { sessionId: pending.session.id });
  };

  const submit = async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setFormError("");
    try {
      if (pendingRef.current) {
        await persistAndContinue(pendingRef.current);
        return;
      }
      const normalizedSessionId = sessionId.trim();
      const normalizedName = displayName.trim();
      if (!UUID_PATTERN.test(normalizedSessionId)) throw new Error("Enter a valid session ID.");
      if (!normalizedName) throw new Error("Enter your display name.");
      if (normalizedName.length > 100) throw new Error("Display name must be 100 characters or fewer.");

      // Read the public session first to validate it exists and capture non-sensitive metadata.
      const session = await paddleQApi.getSession(normalizedSessionId);
      const result = await paddleQApi.joinPlayer(normalizedSessionId, normalizedName);
      const pending: PendingJoin = { session, player: result.player, playerCredential: result.playerCredential };
      pendingRef.current = pending;
      await persistAndContinue(pending);
    } catch (error) {
      setFormError(error instanceof Error && !(error instanceof PaddleQApiError)
        ? error.message
        : joinErrorMessage(error));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar barStyle={theme.isDark ? "light-content" : "dark-content"} backgroundColor={c.background} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={22} color={c.text} />
            <Text style={[styles.backText, { color: c.text }]}>Paddle Q</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.text }]}>Join Session</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>Enter the session ID and the name organizers will see in the queue.</Text>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.text }]}>Session ID</Text>
            <TextInput
              value={sessionId}
              onChangeText={setSessionId}
              placeholder="Session UUID"
              placeholderTextColor={c.textMuted}
              editable={!submitting}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }]}
              accessibilityLabel="Session ID"
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.text }]}>Player display name</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor={c.textMuted}
              editable={!submitting}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={100}
              style={[styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }]}
              accessibilityLabel="Player display name"
            />
            <Text style={[styles.hint, { color: c.textMuted }]}>Up to 100 characters. Your name must be unique within this session.</Text>
          </View>

          {formError ? <ErrorMessage title="Unable to join session" message={formError} style={styles.formError} /> : null}
          <TouchableOpacity
            style={[styles.submit, submitting && styles.disabled]}
            onPress={() => void submit()}
            disabled={submitting}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {submitting ? <LoadingSpinner size="small" /> : <Text style={styles.submitText}>{pendingRef.current ? "Retry secure save" : "Join Session"}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  backButton: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingVertical: Spacing.sm, marginBottom: Spacing.lg },
  backText: { fontSize: Typography.body, fontWeight: FontWeight.semibold },
  title: { fontSize: Typography.sectionTitle, fontWeight: FontWeight.bold },
  subtitle: { marginTop: Spacing.xs, marginBottom: Spacing.xl, fontSize: Typography.body, lineHeight: 22 },
  field: { marginBottom: Spacing.lg },
  label: { marginBottom: Spacing.sm, fontSize: Typography.bodySmall, fontWeight: FontWeight.semibold },
  input: { minHeight: 52, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: Typography.body },
  hint: { marginTop: Spacing.xs, fontSize: Typography.caption },
  formError: { marginHorizontal: 0, marginBottom: Spacing.md },
  submit: { minHeight: 56, borderRadius: Radius.md, backgroundColor: Colors.brand.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing.lg, marginTop: Spacing.sm },
  submitText: { color: "#FFFFFF", fontSize: Typography.body, fontWeight: FontWeight.bold },
  disabled: { opacity: 0.55 },
});
