// ─── Home Screen ───────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useTheme } from "../context/ThemeContext";
import { useFavorites } from "../context/FavoritesContext";
import { Colors } from "../constants/colors";
import { Config } from "../constants/config";
import { fetchCourts } from "../services/api";
import { todayString } from "../utils/dateUtils";
import { Court } from "../../../shared/types";
import { RootStackParamList } from "../navigation/types";

import CourtCard from "../components/CourtCard";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const { theme } = useTheme();
  const { favorites } = useFavorites();
  const navigation = useNavigation<NavProp>();

  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = todayString();

  const loadCourts = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchCourts();
      setCourts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load courts");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCourts();
  }, [loadCourts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCourts();
  }, [loadCourts]);

  const c = theme.colors;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar
        barStyle={theme.isDark ? "light-content" : "dark-content"}
        backgroundColor={c.background}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
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
            style={[styles.avatar, { backgroundColor: Colors.brand.primary }]}
          >
            <Text style={styles.avatarEmoji}>🏓</Text>
          </View>
        </View>

        {/* Quick Search */}
        <TouchableOpacity
          style={[
            styles.searchBar,
            { backgroundColor: c.surface, borderColor: c.border },
          ]}
          onPress={() =>
            navigation.navigate("Main", {} as any)
          }
          activeOpacity={0.8}
        >
          <Ionicons name="search" size={18} color={c.textMuted} />
          <Text style={[styles.searchPlaceholder, { color: c.textMuted }]}>
            Search available courts...
          </Text>
        </TouchableOpacity>

        {/* Check Availability CTA */}
        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: Colors.brand.primary }]}
          onPress={() => navigation.navigate("Availability", { date: today })}
          activeOpacity={0.85}
        >
          <Ionicons name="calendar" size={20} color="#fff" />
          <Text style={styles.ctaText}>Check Today's Availability</Text>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </TouchableOpacity>

        {/* Loading */}
        {loading && <LoadingSpinner message="Loading courts..." />}

        {/* Error */}
        {error && !loading && (
          <ErrorMessage message={error} onRetry={loadCourts} />
        )}

        {/* Favorites section */}
        {!loading && !error && favorites.length > 0 && (
          <Section title="Your Favorites" icon="heart">
            {courts
              .filter((c) => favorites.some((f) => f.id === c.id))
              .map((court) => (
                <CourtCard
                  key={court.id}
                  court={court}
                  variant="compact"
                  onPress={() =>
                    navigation.navigate("CourtDetails", { courtId: court.id })
                  }
                />
              ))}
          </Section>
        )}

        {/* Featured Courts */}
        {!loading && !error && courts.length > 0 && (
          <Section title="All Courts in Tagum" icon="tennisball">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            >
              {courts.map((court) => (
                <View key={court.id} style={{ width: 220 }}>
                  <CourtCard
                    court={court}
                    onPress={() =>
                      navigation.navigate("CourtDetails", { courtId: court.id })
                    }
                  />
                </View>
              ))}
            </ScrollView>
          </Section>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
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
        <Ionicons name={icon} size={16} color={Colors.brand.primary} />
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  greeting: { fontSize: 13, fontWeight: "500" },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5, marginTop: 2 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEmoji: { fontSize: 24 },
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
  searchPlaceholder: { fontSize: 14, flex: 1 },
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
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
});
