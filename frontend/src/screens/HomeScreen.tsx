// ─── Home Screen ───────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  TextInput,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useTheme } from "../context/ThemeContext";
import { useFavorites } from "../context/FavoritesContext";
import { Colors } from "../constants/colors";
import { fetchCourts, fetchAvailability } from "../services/api";
import { todayString } from "../utils/dateUtils";
import { Court } from "../../../shared/types";
import { RootStackParamList } from "../navigation/types";

import CourtCard from "../components/CourtCard";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";

type NavProp = NativeStackNavigationProp<RootStackParamList>;

type CourtFilter = "all" | "available" | "favorites";

export default function HomeScreen() {
  const { theme } = useTheme();
  const { favorites } = useFavorites();
  const navigation = useNavigation<NavProp>();

  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<CourtFilter>("all");

  const [availabilityDate, setAvailabilityDate] = useState(todayString());
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  // Stores venue IDs that currently have at least one available slot.
  const [availableCourtIds, setAvailableCourtIds] = useState<Set<string>>(
    new Set()
  );

  const today = todayString();

  const loadCourts = useCallback(async () => {
    try {
      setError(null);

      const courtData = await fetchCourts();
      setCourts(courtData);

      const dateToCheck =
        filter === "available" ? availabilityDate : today;

      const availabilityData = await fetchAvailability(dateToCheck);

      const availableIds = new Set<string>();

      for (const result of availabilityData.results) {
        if (result.error) continue;

        const hasAvailableSlot = result.slots.some(
          (slot) => slot.available
        );

        if (hasAvailableSlot) {
          availableIds.add(result.courtId);
        }
      }

      setAvailableCourtIds(availableIds);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load court information"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
      setAvailabilityLoading(false);
    }
  }, [today, filter, availabilityDate]);

  useEffect(() => {
    loadCourts();
  }, [loadCourts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCourts();
  }, [loadCourts]);

  const c = theme.colors;

  const filteredCourts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = courts.filter((court) => {
      // Search filter
      const matchesSearch =
        query.length === 0 ||
        court.name.toLowerCase().includes(query) ||
        court.address.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      // Available filter
      if (filter === "available") {
        return availableCourtIds.has(court.id);
      }

      // Favorites filter
      if (filter === "favorites") {
        return favorites.some((favorite) => favorite.id === court.id);
      }

      return true;
    });

    // Put favorite courts first.
    const favoriteCourts = filtered.filter((court) =>
      favorites.some((favorite) => favorite.id === court.id)
    );

    const otherCourts = filtered.filter(
      (court) => !favorites.some((favorite) => favorite.id === court.id)
    );

    return [...favoriteCourts, ...otherCourts];
  }, [courts, searchQuery, filter, availableCourtIds, favorites]);

  const openBookingWebsite = useCallback(async (court: Court) => {
    if (!court.website) return;

    const url = court.website.startsWith("http")
      ? court.website
      : `https://${court.website}`;

    try {
      await Linking.openURL(url);
    } catch {
      // Ignore failed external links.
    }
  }, []);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: c.background }]}
    >
      <StatusBar
        barStyle={theme.isDark ? "light-content" : "dark-content"}
        backgroundColor={c.background}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.brand.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: c.textSecondary }]}>
              Good {getGreeting()} 👋
            </Text>

            <Text style={[styles.title, { color: c.text }]}>
              Find a court today
            </Text>
          </View>

          <View
            style={[
              styles.avatar,
              { backgroundColor: Colors.brand.primary },
            ]}
          >
            <Text style={styles.avatarEmoji}>🏓</Text>
          </View>
        </View>

        {/* Search */}
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
            },
          ]}
        >
          <Ionicons name="search" size={18} color={c.textMuted} />

          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search courts..."
            placeholderTextColor={c.textMuted}
            style={[styles.searchInput, { color: c.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />

          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              hitSlop={8}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={c.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <FilterButton
            label="All"
            icon="apps-outline"
            active={filter === "all"}
            onPress={() => setFilter("all")}
          />

          <FilterButton
            label="Available"
            icon="checkmark-circle-outline"
            active={filter === "available"}
            onPress={() => setFilter("available")}
          />

          <FilterButton
            label="Favorites"
            icon="heart-outline"
            active={filter === "favorites"}
            onPress={() => setFilter("favorites")}
          />
        </ScrollView>

        {filter === "available" && (
          <AvailabilityDatePicker
            selectedDate={availabilityDate}
            onDateSelect={setAvailabilityDate}
          />
        )}

        {/* Check Availability CTA */}
        <TouchableOpacity
          style={[
            styles.ctaButton,
            { backgroundColor: Colors.brand.primary },
          ]}
          onPress={() =>
            navigation.navigate("Availability", { date: availabilityDate })
          }
          activeOpacity={0.85}
        >
          <Ionicons name="calendar" size={20} color="#fff" />

          <Text style={styles.ctaText}>
            {availabilityDate === today
              ? "Check Today's Availability"
              : `Check ${formatShortDate(availabilityDate)} Availability`}
          </Text>

          <Ionicons
            name="chevron-forward"
            size={18}
            color="#fff"
          />
        </TouchableOpacity>

        {/* Loading */}
        {(loading || availabilityLoading) && (
          <LoadingSpinner
            message={
              availabilityLoading
                ? "Checking availability..."
                : "Loading courts..."
            }
          />
        )}

        {/* Error */}
        {error && !loading && (
          <ErrorMessage
            message={error}
            onRetry={loadCourts}
          />
        )}

        {/* Results */}
        {!loading && !error && (
          <Section
            title={
              filter === "favorites"
                ? "Favorite Courts"
                : filter === "available"
                ? "Available Courts"
                : searchQuery
                ? "Search Results"
                : "All Courts in Tagum"
            }
            icon={
              filter === "favorites"
                ? "heart"
                : filter === "available"
                ? "checkmark-circle"
                : "tennisball"
            }
          >
            {filteredCourts.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  gap: 12,
                }}
              >
                {filteredCourts.map((court) => (
                  <View
                    key={court.id}
                    style={{ width: 220 }}
                  >
                    <CourtCard
                      court={court}
                      onPress={() =>
                        navigation.navigate("CourtDetails", {
                          courtId: court.id,
                        })
                      }
                    />

                    {/* Availability indicator */}
                    <View
                      style={[
                        styles.availabilityBadge,
                        {
                          backgroundColor: availableCourtIds.has(court.id)
                            ? `${Colors.available}15`
                            : `${Colors.unavailable}10`,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.availabilityDot,
                          {
                            backgroundColor:
                              availableCourtIds.has(court.id)
                                ? Colors.available
                                : Colors.unavailable,
                          },
                        ]}
                      />

                      <Text
                        style={[
                          styles.availabilityText,
                          {
                            color: availableCourtIds.has(court.id)
                              ? Colors.available
                              : Colors.unavailable,
                          },
                        ]}
                      >
                        {availableCourtIds.has(court.id)
                          ? availabilityDate === today
                            ? "Available today"
                            : `Available ${formatShortDate(availabilityDate)}`
                          : availabilityDate === today
                          ? "No availability today"
                          : `No availability ${formatShortDate(availabilityDate)}`}
                      </Text>
                    </View>

                    {/* Book Court */}
                    {court.website && (
                      <TouchableOpacity
                        style={[
                          styles.bookButton,
                          {
                            backgroundColor: c.surface,
                            borderColor: Colors.brand.primary,
                          },
                        ]}
                        onPress={() =>
                          openBookingWebsite(court)
                        }
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name="calendar-outline"
                          size={15}
                          color={Colors.brand.primary}
                        />

                        <Text
                          style={[
                            styles.bookButtonText,
                            {
                              color: Colors.brand.primary,
                            },
                          ]}
                        >
                          Book Court
                        </Text>

                        <Ionicons
                          name="open-outline"
                          size={14}
                          color={Colors.brand.primary}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View
                style={[
                  styles.noResults,
                  { backgroundColor: c.surface },
                ]}
              >
                <Ionicons
                  name={
                    filter === "favorites"
                      ? "heart-outline"
                      : "search-outline"
                  }
                  size={32}
                  color={c.textMuted}
                />

                <Text
                  style={[
                    styles.noResultsTitle,
                    { color: c.text },
                  ]}
                >
                  {filter === "favorites"
                    ? "No favorite courts"
                    : filter === "available"
                    ? "No available courts"
                    : "No courts found"}
                </Text>

                <Text
                  style={[
                    styles.noResultsText,
                    { color: c.textMuted },
                  ]}
                >
                  {filter === "favorites"
                    ? "Tap the heart on a court to save it here."
                    : filter === "available"
                    ? "No courts currently have available slots today."
                    : "Try a different search term."}
                </Text>
              </View>
            )}
          </Section>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function FilterButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <TouchableOpacity
      style={[
        styles.filterButton,
        {
          backgroundColor: active
            ? Colors.brand.primary
            : c.surface,
          borderColor: active
            ? Colors.brand.primary
            : c.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Ionicons
        name={icon}
        size={15}
        color={active ? "#fff" : c.textSecondary}
      />

      <Text
        style={[
          styles.filterButtonText,
          {
            color: active ? "#fff" : c.textSecondary,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function AvailabilityDatePicker({
  selectedDate,
  onDateSelect,
}: {
  selectedDate: string;
  onDateSelect: (date: string) => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  const dates = getNextDates(60);

  return (
    <View style={styles.datePickerContainer}>
      <Text style={[styles.datePickerLabel, { color: c.textSecondary }]}>
        Available on
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.datePickerRow}
      >
        {dates.map((date) => {
          const selected = date === selectedDate;

          return (
            <TouchableOpacity
              key={date}
              style={[
                styles.dateButton,
                {
                  backgroundColor: selected
                    ? Colors.brand.primary
                    : c.surface,
                  borderColor: selected
                    ? Colors.brand.primary
                    : c.border,
                },
              ]}
              onPress={() => onDateSelect(date)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.dateDay,
                  {
                    color: selected ? "#fff" : c.textSecondary,
                  },
                ]}
              >
                {getDateDay(date)}
              </Text>

              <Text
                style={[
                  styles.dateNumber,
                  {
                    color: selected ? "#fff" : c.text,
                  },
                ]}
              >
                {getDateNumber(date)}
              </Text>

              <Text
                style={[
                  styles.dateMonth,
                  {
                    color: selected ? "#fff" : c.textMuted,
                  },
                ]}
              >
                {getDateMonth(date)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons
          name={icon}
          size={16}
          color={Colors.brand.primary}
        />

        <Text
          style={[
            styles.sectionTitle,
            { color: theme.colors.text },
          ]}
        >
          {title}
        </Text>
      </View>

      {children}
    </View>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();

  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";

  return "evening";
}

function getNextDates(count: number): string[] {
  const dates: string[] = [];
  const base = new Date();

  for (let i = 0; i < count; i++) {
    const date = new Date(base);
    date.setDate(base.getDate() + i);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    dates.push(`${year}-${month}-${day}`);
  }

  return dates;
}

function getDateDay(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-PH", {
    weekday: "short",
  });
}

function getDateNumber(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-PH", {
    day: "numeric",
  });
}

function getDateMonth(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-PH", {
    month: "short",
  });
}

function formatShortDate(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },

  greeting: {
    fontSize: 13,
    fontWeight: "500",
  },

  title: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 2,
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarEmoji: {
    fontSize: 24,
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },

  filterRow: {
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 14,
  },

  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },

  filterButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },

  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 24,
    paddingVertical: 16,
    borderRadius: 16,
  },

  ctaText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },

  section: {
    marginBottom: 24,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
  },

  availabilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 4,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },

  availabilityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  availabilityText: {
    fontSize: 11,
    fontWeight: "700",
  },

  bookButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 4,
    marginTop: 6,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1.5,
  },

  bookButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },

  noResults: {
    marginHorizontal: 16,
    paddingHorizontal: 20,
    paddingVertical: 30,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  noResultsTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 10,
  },

  noResultsText: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 5,
    lineHeight: 19,
  },

  datePickerContainer: {
    marginBottom: 16,
  },

  datePickerLabel: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 20,
    marginBottom: 8,
  },

  datePickerRow: {
    paddingHorizontal: 20,
    gap: 8,
  },

  dateButton: {
    width: 64,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },

  dateDay: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  dateNumber: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 1,
  },

  dateMonth: {
    fontSize: 10,
    marginTop: 1,
  },
});