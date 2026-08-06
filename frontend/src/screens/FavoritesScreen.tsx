// ─── Favorites Screen ──────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  StatusBar,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useTheme } from "../context/ThemeContext";
import { useFavorites } from "../context/FavoritesContext";
import { Colors } from "../constants/colors";
import { fetchCourts } from "../services/api";
import { todayString } from "../utils/dateUtils";
import { Court } from "../../../shared/types";
import { RootStackParamList } from "../navigation/types";

import CourtCard from "../components/CourtCard";
import EmptyState from "../components/EmptyState";
import LoadingSpinner from "../components/LoadingSpinner";

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function FavoritesScreen() {
  const { theme } = useTheme();
  const { favorites, removeFavorite } = useFavorites();
  const navigation = useNavigation<NavProp>();

  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const c = theme.colors;

  const loadCourts = useCallback(async () => {
    try {
      const all = await fetchCourts();
      const favIds = new Set(favorites.map((f) => f.id));
      setCourts(all.filter((c) => favIds.has(c.id)));
    } catch {
      // If API fails, display from cached favorites
      setCourts(
        favorites.map((f) => ({
          id: f.id,
          name: f.name,
          address: f.address,
          latitude: 0,
          longitude: 0,
          website: null,
          phone: null,
          facebook: null,
          image: null,
          active: true,
          parserName: null,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [favorites]);

  useEffect(() => {
    loadCourts();
  }, [loadCourts]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar
        barStyle={theme.isDark ? "light-content" : "dark-content"}
        backgroundColor={c.background}
      />

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>Favorites</Text>
        <Text style={[styles.count, { color: c.textSecondary }]}>
          {favorites.length} court{favorites.length !== 1 ? "s" : ""}
        </Text>
      </View>

      {loading ? (
        <LoadingSpinner />
      ) : favorites.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="No favorites yet"
          subtitle="Tap the heart on any court to save it here"
        />
      ) : (
        <FlatList
          data={courts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.rowWrap}>
              <CourtCard
                court={item}
                variant="compact"
                style={{ flex: 1 }}
                onPress={() =>
                  navigation.navigate("CourtDetails", { courtId: item.id })
                }
              />
              {/* Check Availability shortcut */}
              <TouchableOpacity
                style={[styles.availBtn, { backgroundColor: `${Colors.brand.primary}15` }]}
                onPress={() =>
                  navigation.navigate("Availability", {
                    date: todayString(),
                    courtId: item.id,
                  })
                }
              >
                <Ionicons name="calendar" size={16} color={Colors.brand.primary} />
                <Text style={[styles.availBtnText, { color: Colors.brand.primary }]}>
                  Check
                </Text>
              </TouchableOpacity>
            </View>
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
    paddingBottom: 20,
  },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  count: { fontSize: 14, marginTop: 2 },
  list: { padding: 16, paddingBottom: 32, gap: 4 },
  rowWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  availBtn: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 56,
  },
  availBtnText: {
    fontSize: 10,
    fontWeight: "700",
  },
});
