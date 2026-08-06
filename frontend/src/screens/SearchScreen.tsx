// ─── Search Screen ─────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  SectionList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useTheme } from "../context/ThemeContext";
import { Colors } from "../constants/colors";
import { fetchAvailability } from "../services/api";
import { todayString, formatDateDisplay } from "../utils/dateUtils";
import { GroupedAvailability } from "../../../shared/types";
import { RootStackParamList, TabParamList } from "../navigation/types";

import DatePickerStrip from "../components/DatePickerStrip";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";
import EmptyState from "../components/EmptyState";

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<TabParamList, "Search">;

export default function SearchScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();

  const [selectedDate, setSelectedDate] = useState(
    route.params?.date || todayString()
  );
  const [grouped, setGrouped] = useState<GroupedAvailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const c = theme.colors;

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const result = await fetchAvailability(selectedDate);
      setGrouped(result.grouped || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch availability");
      setGrouped([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // Auto-search if opened with a date
  useEffect(() => {
    if (route.params?.date) {
      search();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sections for SectionList
  const sections = grouped
    .filter((g) => g.courts.some((c) => c.available))
    .map((g) => ({
      title: g.time,
      data: g.courts.filter((c) => c.available),
    }));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar
        barStyle={theme.isDark ? "light-content" : "dark-content"}
        backgroundColor={c.background}
      />

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>Find a Court</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          {formatDateDisplay(selectedDate)}
        </Text>
      </View>

      {/* Date Strip */}
      <View style={{ marginBottom: 16 }}>
        <DatePickerStrip
          selectedDate={selectedDate}
          onDateSelect={(d) => {
            setSelectedDate(d);
            setHasSearched(false);
            setGrouped([]);
          }}
        />
      </View>

      {/* Search Button */}
      <TouchableOpacity
        style={[
          styles.searchButton,
          {
            backgroundColor: loading
              ? Colors.brand.primaryDark
              : Colors.brand.primary,
          },
        ]}
        onPress={search}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <>
            <Ionicons name="reload" size={18} color="#fff" />
            <Text style={styles.searchButtonText}>Checking courts...</Text>
          </>
        ) : (
          <>
            <Ionicons name="search" size={18} color="#fff" />
            <Text style={styles.searchButtonText}>Check Availability</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Results */}
      {loading ? (
        <LoadingSpinner message="Checking all courts in Tagum..." />
      ) : error ? (
        <ErrorMessage message={error} onRetry={search} style={{ margin: 16 }} />
      ) : !hasSearched ? (
        <EmptyState
          icon="calendar-outline"
          title="Pick a date to start"
          subtitle="Select a date above then tap Check Availability"
        />
      ) : sections.length === 0 ? (
        <EmptyState
          icon="tennisball-outline"
          title="No available slots"
          subtitle={`No courts have open slots on ${formatDateDisplay(selectedDate)}`}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) => `${item.courtId}-${i}`}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View
              style={[
                styles.timeHeader,
                { backgroundColor: c.background },
              ]}
            >
              <View
                style={[
                  styles.timeBadge,
                  { backgroundColor: `${Colors.brand.primary}15` },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={Colors.brand.primary}
                />
                <Text
                  style={[
                    styles.timeLabel,
                    { color: Colors.brand.primary },
                  ]}
                >
                  {section.title}
                </Text>
              </View>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.resultRow,
                {
                  backgroundColor: c.surface,
                  borderColor: c.border,
                },
              ]}
              onPress={() =>
                navigation.navigate("CourtDetails", { courtId: item.courtId })
              }
              activeOpacity={0.8}
            >
              <View style={styles.resultLeft}>
                <View
                  style={[
                    styles.availDot,
                    {
                      backgroundColor: item.available
                        ? Colors.available
                        : Colors.unavailable,
                    },
                  ]}
                />
                <Text style={[styles.resultName, { color: c.text }]}>
                  {item.courtName}
                </Text>
              </View>
              <View style={styles.resultRight}>
                {item.price && (
                  <Text style={[styles.price, { color: Colors.brand.primary }]}>
                    {item.price}
                  </Text>
                )}
                <Ionicons name="chevron-forward" size={14} color={c.textMuted} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 2 },
  searchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 20,
    paddingVertical: 16,
    borderRadius: 16,
  },
  searchButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  timeHeader: {
    paddingVertical: 12,
    paddingTop: 16,
  },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  timeLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  resultLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  availDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  resultName: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  resultRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  price: {
    fontSize: 13,
    fontWeight: "700",
  },
});
