// ─── Grouped Availability List ─────────────────────────────────────────────────
// Displays availability grouped by time slot (used on Search screen).

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { Colors } from "../constants/colors";
import { GroupedAvailability } from "../../../shared/types";

interface GroupedAvailabilityListProps {
  grouped: GroupedAvailability[];
  onCourtPress: (courtId: string) => void;
}

export default function GroupedAvailabilityList({
  grouped,
  onCourtPress,
}: GroupedAvailabilityListProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  // Only show time slots that have at least one available court
  const sections = grouped
    .filter((g) => g.courts.some((court) => court.available))
    .map((g) => ({
      title: g.time,
      data: g.courts,
    }));

  if (sections.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: c.textMuted }]}>
          No available slots for this date
        </Text>
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item, i) => `${item.courtId}-${i}`}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.list}
      renderSectionHeader={({ section }) => (
        <View style={[styles.timeHeader, { backgroundColor: c.background }]}>
          <View
            style={[
              styles.timeBadge,
              { backgroundColor: `${Colors.brand.primary}15` },
            ]}
          >
            <Ionicons
              name="time-outline"
              size={13}
              color={Colors.brand.primary}
            />
            <Text
              style={[styles.timeLabel, { color: Colors.brand.primary }]}
            >
              {section.title}
            </Text>
          </View>
        </View>
      )}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[
            styles.courtRow,
            {
              backgroundColor: c.surface,
              borderColor: item.available ? `${Colors.available}30` : c.border,
            },
          ]}
          onPress={() => onCourtPress(item.courtId)}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.dot,
              {
                backgroundColor: item.available
                  ? Colors.available
                  : Colors.unavailable,
              },
            ]}
          />
          <Text style={[styles.courtName, { color: c.text }]} numberOfLines={1}>
            {item.courtName}
          </Text>
          {item.price && (
            <Text style={[styles.price, { color: Colors.brand.primary }]}>
              {item.price}
            </Text>
          )}
          <Ionicons name="chevron-forward" size={14} color={c.textMuted} />
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 32 },
  timeHeader: {
    paddingVertical: 10,
    paddingTop: 16,
  },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  courtRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  courtName: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  price: {
    fontSize: 13,
    fontWeight: "700",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
  },
});
