// ─── Availability Screen ───────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps, NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useTheme } from "../context/ThemeContext";
import { Colors } from "../constants/colors";
import { fetchAvailability } from "../services/api";
import { formatDateDisplay } from "../utils/dateUtils";
import { CourtAvailability } from "../../../shared/types";
import { RootStackParamList } from "../navigation/types";

import AvailabilityCard from "../components/AvailabilityCard";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";
import EmptyState from "../components/EmptyState";
import DatePickerStrip from "../components/DatePickerStrip";

type Props = NativeStackScreenProps<RootStackParamList, "Availability">;
type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function AvailabilityScreen({ route }: Props) {
  const { date: initialDate, courtId } = route.params;
  const { theme } = useTheme();
  const navigation = useNavigation<NavProp>();

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [results, setResults] = useState<CourtAvailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const c = theme.colors;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchAvailability(selectedDate);
      let filtered = data.results;

      // If opened from a specific court, show only that court
      if (courtId) {
        filtered = data.results.filter((r) => r.courtId === courtId);
      }

      setResults(filtered);
      setFetchedAt(data.fetchedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch availability");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, courtId]);

  useEffect(() => {
    load();
  }, [load]);

  const courtsChecked = results.reduce(
    (total, result) => total + result.courtsChecked,
    0
  );

  const availableCourtIds = new Set<string>();

  for (const result of results) {
    if (result.error) continue;

    for (const slot of result.slots) {
      if (!slot.available) continue;

      // Prefer the physical court ID supplied by the parser.
      // Fall back to the venue ID for older parsers.
      const physicalCourtId = slot.courtId ?? result.courtId;

      availableCourtIds.add(physicalCourtId);
    }
  }

  const availableCount = availableCourtIds.size;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar
        barStyle={theme.isDark ? "light-content" : "dark-content"}
        backgroundColor={c.background}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={c.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: c.text }]}>Availability</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            {formatDateDisplay(selectedDate)}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshBtn, { backgroundColor: c.surface }]}
          onPress={load}
          disabled={loading}
        >
          <Ionicons
            name="refresh"
            size={18}
            color={loading ? c.textMuted : Colors.brand.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Date Picker */}
      <View style={{ marginBottom: 12 }}>
        <DatePickerStrip
          selectedDate={selectedDate}
          onDateSelect={(d) => setSelectedDate(d)}
        />
      </View>

      {/* Summary */}
      {!loading && !error && results.length > 0 && (
        <View
          style={[
            styles.summary,
            { backgroundColor: c.surface, borderColor: c.border },
          ]}
        >
          <SummaryStat
            label="Courts checked"
            value={String(courtsChecked)}
            color={c.text}
          />
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <SummaryStat
            label="Courts available"
            value={String(availableCount)}
            color={Colors.available}
          />
          {fetchedAt && (
            <>
              <View style={[styles.divider, { backgroundColor: c.border }]} />
              <SummaryStat
                label="Last checked"
                value={new Date(fetchedAt).toLocaleTimeString("en-PH", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
                color={c.textSecondary}
              />
            </>
          )}
        </View>
      )}

      {/* Content */}
      {loading ? (
        <LoadingSpinner
          message="Checking all booking websites. This may take a moment..."
          style={{ flex: 1 }}
        />
      ) : error ? (
        <ErrorMessage message={error} onRetry={load} />
      ) : results.length === 0 ? (
        <EmptyState
          icon="tennisball-outline"
          title="No court data found"
          subtitle="Make sure courts are set up in the database"
        />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.courtId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <AvailabilityCard
              availability={item}
              onCheckDetails={() =>
                navigation.navigate("CourtDetails", { courtId: item.courtId })
              }
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function SummaryStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1 },
  title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 1 },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  summary: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 11, marginTop: 2, textAlign: "center" },
  divider: { width: 1, height: 32, marginHorizontal: 4 },
  list: { padding: 16, paddingBottom: 32 },
});
