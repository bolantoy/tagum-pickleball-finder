// ─── Availability Card ─────────────────────────────────────────────────────────
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { Colors } from "../constants/colors";
import { CourtAvailability, TimeSlot } from "../../../shared/types";

interface AvailabilityCardProps {
  availability: CourtAvailability;
  onCheckDetails?: () => void;
  style?: ViewStyle;
}

export default function AvailabilityCard({
  availability,
  onCheckDetails,
  style,
}: AvailabilityCardProps) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const availableSlots = availability.slots.filter((s) => s.available);
  const groupedSlots = groupSlotsByTime(availability.slots);
  const hasError = !!availability.error;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: hasError
                  ? Colors.warning
                  : availableSlots.length > 0
                  ? Colors.available
                  : Colors.unavailable,
              },
            ]}
          />
          <Text style={[styles.courtName, { color: theme.colors.text }]}>
            {availability.courtName}
          </Text>
        </View>
        {!hasError && (
          <View
            style={[
              styles.badge,
              {
                backgroundColor:
                  availableSlots.length > 0
                    ? `${Colors.available}20`
                    : `${Colors.unavailable}20`,
              },
            ]}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color:
                  availableSlots.length > 0
                    ? Colors.available
                    : Colors.unavailable,
              }}
            >
              {availableSlots.length > 0
                ? `${availableSlots.length} open`
                : "Fully booked"}
            </Text>
          </View>
        )}
      </View>

      {/* Error state */}
      {hasError ? (
        <View style={styles.errorRow}>
          <Ionicons name="warning-outline" size={14} color={Colors.warning} />
          <Text style={[styles.errorText, { color: Colors.warning }]}>
            {availability.error}
          </Text>
        </View>
      ) : (
        <>
          {/* Slots */}
          <View style={styles.slotsGrid}>
            {(expanded ? groupedSlots : groupedSlots.slice(0, 8)).map(
              (slot) => (
                <SlotChip key={slot.time} slot={slot} />
              )
            )}

            {groupedSlots.length > 8 && (
              <TouchableOpacity
                style={[
                  styles.moreChip,
                  { backgroundColor: theme.colors.surfaceHigh },
                ]}
                onPress={() => setExpanded((prev) => !prev)}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: 11,
                  }}
                >
                  {expanded
                    ? "Show less"
                    : `+${groupedSlots.length - 8} more`}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Last checked */}
          <Text style={[styles.lastChecked, { color: theme.colors.textMuted }]}>
            Updated {formatTime(availability.lastChecked)}
          </Text>
        </>
      )}

      {/* CTA */}
      {onCheckDetails && (
        <TouchableOpacity
          style={[
            styles.detailsButton,
            { borderColor: Colors.brand.primary },
          ]}
          onPress={onCheckDetails}
          activeOpacity={0.8}
        >
          <Text style={[styles.detailsButtonText, { color: Colors.brand.primary }]}>
            View Court Details
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={Colors.brand.primary}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

interface GroupedTimeSlot {
  time: string;
  available: boolean;
  availableCount: number;
  totalCount: number;
}

function groupSlotsByTime(slots: TimeSlot[]): GroupedTimeSlot[] {
  const grouped = new Map<
    string,
    {
      availableCourts: Set<string>;
      totalCourts: Set<string>;
    }
  >();

  for (const slot of slots) {
    const time = slot.label.split(" – ")[0];

    if (!grouped.has(time)) {
      grouped.set(time, {
        availableCourts: new Set<string>(),
        totalCourts: new Set<string>(),
      });
    }

    const group = grouped.get(time)!;

    // Count each physical court only once for this time.
    // Use courtId because that is the actual unique court identifier.
    const courtId = slot.courtId;

    if (!courtId) {
      continue;
    }

    group.totalCourts.add(courtId);

    if (slot.available) {
      group.availableCourts.add(courtId);
    }
  }

  return Array.from(grouped.entries()).map(([time, group]) => ({
    time,
    available: group.availableCourts.size > 0,
    availableCount: group.availableCourts.size,
    totalCount: group.totalCourts.size,
  }));
}

function SlotChip({ slot }: { slot: GroupedTimeSlot }) {
  const { theme } = useTheme();

  const bg = slot.available
    ? `${Colors.available}15`
    : `${Colors.unavailable}10`;

  const color = slot.available
    ? Colors.available
    : Colors.unavailable;

  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color }]} numberOfLines={1}>
        {slot.time} - {slot.availableCount} of {slot.totalCount} courts
      </Text>
    </View>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  courtName: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  slotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  moreChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  lastChecked: {
    fontSize: 11,
  },
  detailsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  detailsButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
