import React, { useCallback, useEffect, useRef, useState } from "react";
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
import EmptyState from "../components/EmptyState";
import ErrorMessage from "../components/ErrorMessage";
import LoadingSpinner from "../components/LoadingSpinner";
import { fetchCourts } from "../services/api";
import { PaddleQApiError, paddleQApi } from "../services/paddleQApi";
import type { CreatePaddleSessionResponse } from "../types/paddleQ";
import type { Court } from "../../../shared/types";
import type { PaddleQStackParamList } from "../navigation/types";
import { todayString } from "../utils/dateUtils";

type Props = NativeStackScreenProps<PaddleQStackParamList, "CreateSession">;
type PendingCreate = CreatePaddleSessionResponse;

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function createErrorMessage(error: unknown): string {
  if (!(error instanceof PaddleQApiError)) return "The session could not be created. Check your connection and try again.";
  if (error.status === 0 || error.code === "NETWORK_ERROR") return "Unable to reach Paddle Q. Check your connection and try again.";
  if (error.status === 400 || error.code === "VALIDATION_ERROR") return "Check the session details and try again.";
  if (error.status === 404 || error.code === "NOT_FOUND") return "That venue is no longer available. Refresh the venue list and try again.";
  if (error.status >= 500) return "Paddle Q is temporarily unavailable. Try again shortly.";
  return "The session could not be created. Check the details and try again.";
}

export default function PaddleQCreateSessionScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const storage = usePaddleQSessionStorage();
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [sessionDate, setSessionDate] = useState(todayString());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [courtCount, setCourtCount] = useState("1");
  const [loadingCourts, setLoadingCourts] = useState(true);
  const [courtLoadError, setCourtLoadError] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pendingRef = useRef<PendingCreate | null>(null);
  const submitLock = useRef(false);
  const c = theme.colors;

  const loadCourts = useCallback(async () => {
    setLoadingCourts(true);
    setCourtLoadError(false);
    try {
      const active = (await fetchCourts()).filter((court) => court.active);
      setCourts(active);
      setSelectedVenueId((current) => current && active.some((court) => court.id === current)
        ? current
        : active[0]?.id ?? "");
    } catch {
      setCourtLoadError(true);
    } finally {
      setLoadingCourts(false);
    }
  }, []);

  useEffect(() => { void loadCourts(); }, [loadCourts]);

  const persistAndContinue = async (result: PendingCreate) => {
    const session = result.session;
    const venue = courts.find((item) => item.id === session.venueId);
    try {
      await storage.saveOrganizerCapability(session.id, result.organizerSecret);
      await storage.saveRememberedSession({
        sessionId: session.id,
        role: "organizer",
        venueId: session.venueId,
        venueName: venue?.name,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
      });
    } catch {
      setFormError("Organizer access could not be saved securely on this device. Your form is preserved; retry to save and continue.");
      return;
    }
    pendingRef.current = null;
    navigation.replace("SessionLobby", { sessionId: session.id });
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
      const count = Number(courtCount);
      if (!selectedVenueId) throw new Error("Select a venue before continuing.");
      if (!validDate(sessionDate.trim())) throw new Error("Enter a valid session date using YYYY-MM-DD.");
      if (!validTime(startTime.trim())) throw new Error("Enter a valid start time using 24-hour HH:MM format.");
      if (endTime.trim() && !validTime(endTime.trim())) throw new Error("Enter a valid end time using 24-hour HH:MM format, or leave it blank.");
      if (!/^\d+$/.test(courtCount.trim()) || !Number.isSafeInteger(count) || count < 1) throw new Error("Court count must be a positive whole number.");

      const result = await paddleQApi.createSession({
        venueId: selectedVenueId,
        sessionDate: sessionDate.trim(),
        startTime: startTime.trim(),
        ...(endTime.trim() ? { endTime: endTime.trim() } : {}),
        courtCount: count,
      });
      // Keep the one-time secret in memory only until secure persistence succeeds.
      pendingRef.current = result;
      await persistAndContinue(result);
    } catch (error) {
      setFormError(error instanceof Error && !(error instanceof PaddleQApiError)
        ? error.message
        : createErrorMessage(error));
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
          <Text style={[styles.title, { color: c.text }]}>Create Session</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>Set up an open-play event at a venue.</Text>

          <Text style={[styles.label, { color: c.text }]}>Venue</Text>
          {loadingCourts ? <LoadingSpinner message="Loading active venues" size="small" /> : courtLoadError ? (
            <ErrorMessage title="Could not load venues" message="Check your connection and try loading the active venues again." onRetry={() => void loadCourts()} />
          ) : courts.length === 0 ? (
            <EmptyState icon="location-outline" title="No active venues available" subtitle="Try again later or contact the app administrator." style={styles.empty} />
          ) : (
            <View style={styles.venueList}>
              {courts.map((court) => {
                const selected = court.id === selectedVenueId;
                return (
                  <TouchableOpacity
                    key={court.id}
                    style={[styles.venueOption, { backgroundColor: c.surface, borderColor: selected ? Colors.brand.primary : c.border }]}
                    onPress={() => setSelectedVenueId(court.id)}
                    disabled={submitting}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <View style={styles.venueCopy}>
                      <Text style={[styles.venueName, { color: c.text }]}>{court.name}</Text>
                      {!!court.address && <Text style={[styles.venueAddress, { color: c.textSecondary }]} numberOfLines={2}>{court.address}</Text>}
                    </View>
                    <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={22} color={selected ? Colors.brand.primary : c.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <Field label="Session date" value={sessionDate} onChangeText={setSessionDate} placeholder="YYYY-MM-DD" disabled={submitting} />
          <Field label="Start time" value={startTime} onChangeText={setStartTime} placeholder="HH:MM (24-hour time)" disabled={submitting} />
          <Field label="End time (optional)" value={endTime} onChangeText={setEndTime} placeholder="HH:MM" disabled={submitting} />
          <Field label="Number of courts" value={courtCount} onChangeText={setCourtCount} placeholder="1" keyboardType="number-pad" disabled={submitting} />

          {formError ? <ErrorMessage title="Unable to continue" message={formError} style={styles.formError} /> : null}
          <TouchableOpacity
            style={[styles.submit, submitting && styles.disabled]}
            onPress={() => void submit()}
            disabled={submitting || loadingCourts || courtLoadError || courts.length === 0}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {submitting ? <LoadingSpinner size="small" /> : <Text style={styles.submitText}>{pendingRef.current ? "Retry secure save" : "Create Session"}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  function Field({ label, value, onChangeText, placeholder, keyboardType, disabled }: {
    label: string; value: string; onChangeText: (value: string) => void; placeholder: string;
    keyboardType?: "default" | "number-pad"; disabled: boolean;
  }) {
    return (
      <View style={styles.field}>
        <Text style={[styles.label, { color: c.text }]}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.textMuted}
          editable={!disabled}
          keyboardType={keyboardType ?? "default"}
          autoCapitalize="none"
          style={[styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }]}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  backButton: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingVertical: Spacing.sm, marginBottom: Spacing.lg },
  backText: { fontSize: Typography.body, fontWeight: FontWeight.semibold },
  title: { fontSize: Typography.sectionTitle, fontWeight: FontWeight.bold },
  subtitle: { marginTop: Spacing.xs, marginBottom: Spacing.xl, fontSize: Typography.body },
  label: { marginBottom: Spacing.sm, fontSize: Typography.bodySmall, fontWeight: FontWeight.semibold },
  venueList: { gap: Spacing.sm, marginBottom: Spacing.lg },
  venueOption: { minHeight: 64, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, flexDirection: "row", alignItems: "center", gap: Spacing.md },
  venueCopy: { flex: 1, gap: 2 },
  venueName: { fontSize: Typography.body, fontWeight: FontWeight.semibold },
  venueAddress: { fontSize: Typography.caption },
  field: { marginBottom: Spacing.lg },
  input: { minHeight: 52, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: Typography.body },
  empty: { paddingVertical: Spacing.xl },
  formError: { marginHorizontal: 0, marginBottom: Spacing.md },
  submit: { minHeight: 56, borderRadius: Radius.md, backgroundColor: Colors.brand.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: Spacing.lg, marginTop: Spacing.sm },
  submitText: { color: "#FFFFFF", fontSize: Typography.body, fontWeight: FontWeight.bold },
  disabled: { opacity: 0.55 },
});
