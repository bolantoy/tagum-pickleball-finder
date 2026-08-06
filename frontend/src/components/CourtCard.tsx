// ─── Court Card ────────────────────────────────────────────────────────────────
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useFavorites } from "../context/FavoritesContext";
import { Colors } from "../constants/colors";
import { Court } from "../../../shared/types";

interface CourtCardProps {
  court: Court;
  onPress: () => void;
  variant?: "default" | "compact";
  style?: ViewStyle;
}

export default function CourtCard({
  court,
  onPress,
  variant = "default",
  style,
}: CourtCardProps) {
  const { theme } = useTheme();
  const { isFavorite, toggleFavorite } = useFavorites();
  const fav = isFavorite(court.id);

  if (variant === "compact") {
    return (
      <TouchableOpacity
        style={[
          styles.compact,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
          style,
        ]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <View style={styles.compactLeft}>
          <View
            style={[
              styles.compactDot,
              { backgroundColor: Colors.brand.primary },
            ]}
          />
          <View style={styles.compactInfo}>
            <Text
              style={[styles.compactName, { color: theme.colors.text }]}
              numberOfLines={1}
            >
              {court.name}
            </Text>
            <Text
              style={[styles.compactAddr, { color: theme.colors.textSecondary }]}
              numberOfLines={1}
            >
              {court.address}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => toggleFavorite(court)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={fav ? "heart" : "heart-outline"}
            size={20}
            color={fav ? Colors.unavailable : theme.colors.textMuted}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Image */}
      <View style={styles.imageContainer}>
        {court.image ? (
          <Image source={{ uri: court.image }} style={styles.image} />
        ) : (
          <View
            style={[
              styles.imagePlaceholder,
              { backgroundColor: theme.colors.surfaceHigh },
            ]}
          >
            <Ionicons
              name="tennisball-outline"
              size={32}
              color={theme.colors.textMuted}
            />
          </View>
        )}
        {/* Favorite button overlay */}
        <TouchableOpacity
          style={styles.favButton}
          onPress={() => toggleFavorite(court)}
        >
          <Ionicons
            name={fav ? "heart" : "heart-outline"}
            size={22}
            color={fav ? Colors.unavailable : Colors.white}
          />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
          {court.name}
        </Text>
        <View style={styles.row}>
          <Ionicons
            name="location-outline"
            size={13}
            color={theme.colors.textMuted}
          />
          <Text
            style={[styles.address, { color: theme.colors.textSecondary }]}
            numberOfLines={1}
          >
            {court.address}
          </Text>
        </View>
        {court.phone && (
          <View style={styles.row}>
            <Ionicons
              name="call-outline"
              size={13}
              color={theme.colors.textMuted}
            />
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
              {court.phone}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginHorizontal: 4,
  },
  imageContainer: {
    height: 140,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  favButton: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 14,
    gap: 4,
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  address: {
    fontSize: 13,
    flex: 1,
  },
  meta: {
    fontSize: 12,
  },
  // Compact variant
  compact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  compactLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  compactDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  compactInfo: { flex: 1 },
  compactName: {
    fontSize: 14,
    fontWeight: "600",
  },
  compactAddr: {
    fontSize: 12,
    marginTop: 2,
  },
});
