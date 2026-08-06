// ─── Court Details Screen ──────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Image,
  StatusBar,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker } from "react-native-maps";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";

import { useTheme } from "../context/ThemeContext";
import { useFavorites } from "../context/FavoritesContext";
import { Colors } from "../constants/colors";
import { Config } from "../constants/config";
import { fetchCourtById } from "../services/api";
import { todayString } from "../utils/dateUtils";
import { Court } from "../../../shared/types";
import { RootStackParamList } from "../navigation/types";

import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";

type Props = NativeStackScreenProps<RootStackParamList, "CourtDetails">;
type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function CourtDetailsScreen({ route }: Props) {
  const { courtId } = route.params;
  const { theme } = useTheme();
  const { isFavorite, toggleFavorite } = useFavorites();
  const navigation = useNavigation<NavProp>();

  const [court, setCourt] = useState<Court | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const c = theme.colors;

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchCourtById(courtId);
      setCourt(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load court");
    } finally {
      setLoading(false);
    }
  }, [courtId]);

  useEffect(() => {
    load();
  }, [load]);

  const openMaps = () => {
    if (!court) return;
    const url = Platform.select({
      ios: `maps:0,0?q=${court.name}@${court.latitude},${court.longitude}`,
      android: `geo:0,0?q=${court.latitude},${court.longitude}(${court.name})`,
    });
    if (url) Linking.openURL(url);
  };

  const openDirections = () => {
    if (!court) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${court.latitude},${court.longitude}&travelmode=driving`;
    Linking.openURL(url);
  };

  const openLink = (url: string | null) => {
    if (!url) return;
    Linking.openURL(url.startsWith("http") ? url : `https://${url}`);
  };

  const openPhone = (phone: string | null) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
        <LoadingSpinner message="Loading court details..." />
      </SafeAreaView>
    );
  }

  if (error || !court) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
        <ErrorMessage message={error || "Court not found"} onRetry={load} />
      </SafeAreaView>
    );
  }

  const fav = isFavorite(court.id);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero Image */}
        <View style={styles.heroContainer}>
          {court.image ? (
            <Image source={{ uri: court.image }} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroPlaceholder, { backgroundColor: Colors.dark.surfaceHigh }]}>
              <Text style={{ fontSize: 64 }}>🏓</Text>
            </View>
          )}
          {/* Overlay buttons */}
          <SafeAreaView style={styles.heroOverlay}>
            <TouchableOpacity
              style={styles.heroBtn}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.heroBtn}
              onPress={() => toggleFavorite(court)}
            >
              <Ionicons
                name={fav ? "heart" : "heart-outline"}
                size={22}
                color={fav ? Colors.unavailable : "#fff"}
              />
            </TouchableOpacity>
          </SafeAreaView>
        </View>

        {/* Court Info */}
        <View style={[styles.infoCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.courtName, { color: c.text }]}>{court.name}</Text>

          <InfoRow icon="location" value={court.address} theme={c} />
          {court.phone && (
            <InfoRow
              icon="call"
              value={court.phone}
              theme={c}
              onPress={() => openPhone(court.phone)}
              actionColor={Colors.brand.accent}
            />
          )}
          {court.website && (
            <InfoRow
              icon="globe"
              value={court.website}
              theme={c}
              onPress={() => openLink(court.website)}
              actionColor={Colors.brand.accent}
            />
          )}
          {court.facebook && (
            <InfoRow
              icon="logo-facebook"
              value={court.facebook}
              theme={c}
              onPress={() => openLink(court.facebook)}
              actionColor="#1877F2"
            />
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <ActionButton
            icon="navigate"
            label="Directions"
            color={Colors.brand.accent}
            onPress={openDirections}
            theme={c}
          />
          {court.website && (
            <ActionButton
              icon="globe"
              label="Website"
              color={Colors.brand.primary}
              onPress={() => openLink(court.website)}
              theme={c}
            />
          )}
          <ActionButton
            icon="calendar"
            label="Availability"
            color={Colors.brand.primaryDark}
            onPress={() =>
              navigation.navigate("Availability", {
                date: todayString(),
                courtId: court.id,
              })
            }
            theme={c}
          />
        </View>

        {/* Map */}
        <View style={styles.mapSection}>
          <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>
            LOCATION
          </Text>
          <TouchableOpacity onPress={openMaps} activeOpacity={0.9}>
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: court.latitude,
                longitude: court.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              <Marker
                coordinate={{
                  latitude: court.latitude,
                  longitude: court.longitude,
                }}
                title={court.name}
                description={court.address}
                pinColor={Colors.brand.primary}
              />
            </MapView>
            <View style={[styles.mapOverlay, { backgroundColor: `${c.surface}99` }]}>
              <Ionicons name="open-outline" size={14} color={c.textSecondary} />
              <Text style={[styles.mapOverlayText, { color: c.textSecondary }]}>
                Tap to open in Maps
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function InfoRow({
  icon,
  value,
  theme,
  onPress,
  actionColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  theme: any;
  onPress?: () => void;
  actionColor?: string;
}) {
  const content = (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={theme.textMuted} />
      <Text
        style={[
          styles.infoValue,
          { color: onPress ? actionColor || theme.text : theme.textSecondary },
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
      {onPress && (
        <Ionicons name="open-outline" size={14} color={actionColor || theme.textMuted} />
      )}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

function ActionButton({
  icon,
  label,
  color,
  onPress,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  theme: any;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        { backgroundColor: `${color}15`, borderColor: `${color}30` },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.actionBtnLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroContainer: { height: 260, position: "relative" },
  heroImage: { width: "100%", height: "100%", resizeMode: "cover" },
  heroPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  heroOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  heroBtn: {
    backgroundColor: "rgba(0,0,0,0.4)",
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCard: {
    margin: 16,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
  },
  courtName: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoValue: { fontSize: 14, flex: 1, lineHeight: 20 },
  actionsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  actionBtnLabel: { fontSize: 12, fontWeight: "700" },
  mapSection: { paddingHorizontal: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 8,
  },
  map: { height: 180, borderRadius: 16, overflow: "hidden" },
  mapOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  mapOverlayText: { fontSize: 12 },
});
