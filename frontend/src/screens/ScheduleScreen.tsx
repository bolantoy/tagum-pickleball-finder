// ─── Schedule Screen ──────────────────────────────────────────────────────────
// Displays the user's saved/planned court sessions.

import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../context/ThemeContext";
import { Colors } from "../constants/colors";
import { useSchedule, ScheduleItem } from "../context/ScheduleContext";
import { formatDateDisplay } from "../utils/dateUtils";

export default function ScheduleScreen() {
  const { theme } = useTheme();
  const { schedules, removeSchedule, updateScheduleStatus, } = useSchedule();
  const c = theme.colors;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = useMemo(() => {
    return schedules
      .filter((item) => {
        const date = new Date(`${item.date}T00:00:00`);
        return date >= today;
      })
      .sort(compareSchedules);
  }, [schedules]);

  const past = useMemo(() => {
    return schedules
      .filter((item) => {
        const date = new Date(`${item.date}T00:00:00`);
        return date < today;
      })
      .sort(compareSchedules)
      .reverse();
  }, [schedules]);

  const confirmDelete = (item: ScheduleItem) => {
    Alert.alert(
      "Remove from Schedule?",
      `${item.venueName}\n${item.courtName}\n${formatDateDisplay(
        item.date
      )} · ${formatTimeRange(item)}`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeSchedule(item.id),
        },
      ]
    );
  };

  const openBookingWebsite = async (item: ScheduleItem) => {
    if (!item.bookingUrl) {
      Alert.alert(
        "Booking unavailable",
        "This court does not have a booking website available."
      );
      return;
    }

    try {
      const supported = await Linking.canOpenURL(item.bookingUrl);

      if (!supported) {
        Alert.alert(
          "Unable to open booking website",
          "The booking website could not be opened."
        );
        return;
      }

      await Linking.openURL(item.bookingUrl);
    } catch (error) {
      console.warn("Could not open booking website:", error);

      Alert.alert(
        "Unable to open booking website",
        "Something went wrong while opening the booking website."
      );
    }
  };

  const markAsBooked = (item: ScheduleItem) => {
    Alert.alert(
      "Mark as Booked?",
      `${item.venueName}\n${item.courtName}\n${formatDateDisplay(
        item.date
      )} · ${formatTimeRange(item)}`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Mark as Booked",
          onPress: () => updateScheduleStatus(item.id, "booked"),
        },
      ]
    );
  };

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
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: c.text }]}>
              My Schedule
            </Text>
            <Text style={[styles.subtitle, { color: c.textSecondary }]}>
              Your upcoming court sessions
            </Text>
          </View>

          <View
            style={[
              styles.headerIcon,
              { backgroundColor: Colors.brand.primary },
            ]}
          >
            <Ionicons name="calendar" size={22} color="#fff" />
          </View>
        </View>

        {schedules.length === 0 ? (
          <EmptySchedule />
        ) : (
          <>
            {/* Upcoming */}
            {upcoming.length > 0 && (
              <SectionHeader
                title="Upcoming"
                icon="calendar-outline"
                color={c.text}
              />
            )}

            {upcoming.map((item) => (
              <ScheduleCard
                key={item.id}
                item={item}
                onDelete={() => confirmDelete(item)}
                onBookCourt={() => openBookingWebsite(item)}
                onMarkAsBooked={() => markAsBooked(item)}
              />
            ))}

            {/* Past */}
            {past.length > 0 && (
              <>
                <SectionHeader
                  title="Past"
                  icon="time-outline"
                  color={c.textSecondary}
                />

                {past.map((item) => (
                  <ScheduleCard
                    key={item.id}
                    item={item}
                    onDelete={() => confirmDelete(item)}
                    onBookCourt={() => openBookingWebsite(item)}
                    onMarkAsBooked={() => markAsBooked(item)}
                    isPast
                  />
                ))}
              </>
            )}
          </>
        )}

        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Schedule Card ────────────────────────────────────────────────────────────

function ScheduleCard({
  item,
  onDelete,
  onBookCourt,
  onMarkAsBooked,
  isPast = false,
}: {
  item: ScheduleItem;
  onDelete: () => void;
  onBookCourt: () => void;
  onMarkAsBooked: () => void;
  isPast?: boolean;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View
      style={[
        styles.card,
        isPast && styles.pastCard,
        {
          backgroundColor: c.surface,
          borderColor: c.border,
        },
      ]}
    >
      {/* Date */}
      <View style={styles.dateRow}>
        <View
          style={[
            styles.dateIcon,
            {
              backgroundColor: Colors.brand.primary,
            },
          ]}
        >
          <Ionicons
            name="calendar"
            size={18}
            color="#fff"
          />
        </View>

        <View style={styles.dateInfo}>
          <Text style={[styles.dateText, { color: c.text }]}>
            {formatDateDisplay(item.date)}
          </Text>

          <Text style={[styles.timeText, { color: c.textSecondary }]}>
            {formatTimeRange(item)}
          </Text>
        </View>

        <TouchableOpacity
          onPress={onDelete}
          hitSlop={10}
          style={styles.deleteButton}
        >
          <Ionicons
            name="trash-outline"
            size={19}
            color={c.textMuted}
          />
        </TouchableOpacity>
      </View>

      <View style={[styles.divider, { backgroundColor: c.border }]} />

      {/* Venue + Court */}
      <View style={styles.locationRow}>
        <View
          style={[
            styles.locationIcon,
            { backgroundColor: c.surfaceHigh },
          ]}
        >
          <Ionicons
            name="tennisball-outline"
            size={18}
            color={Colors.brand.primary}
          />
        </View>

        <View style={styles.locationInfo}>
          <Text
            style={[styles.venueName, { color: c.text }]}
            numberOfLines={1}
          >
            {item.venueName}
          </Text>

          <Text
            style={[styles.courtName, { color: c.textSecondary }]}
            numberOfLines={1}
          >
            {item.courtName}
          </Text>
        </View>

        {item.price && (
          <Text style={[styles.price, { color: c.text }]}>
            {item.price}
          </Text>
        )}
      </View>

      {/* Status */}
      <View style={styles.footer}>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                item.status === "booked"
                  ? "rgba(34,197,94,0.12)"
                  : "rgba(245,158,11,0.12)",
            },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  item.status === "booked"
                    ? "#22c55e"
                    : "#f59e0b",
              },
            ]}
          />

          <Text
            style={[
              styles.statusText,
              {
                color:
                  item.status === "booked"
                    ? "#16a34a"
                    : "#d97706",
              },
            ]}
          >
            {item.status === "booked" ? "Booked" : "Planned"}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {!isPast && item.bookingUrl && (
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.bookingButton,
              {
                backgroundColor: Colors.brand.primary,
              },
            ]}
            onPress={onBookCourt}
            activeOpacity={0.85}
          >
            <Ionicons
              name="open-outline"
              size={17}
              color="#fff"
            />

            <Text style={styles.bookingButtonText}>
              Book Court
            </Text>
          </TouchableOpacity>
        )}

        {!isPast && item.status === "planned" && (
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.markBookedButton,
              {
                borderColor: c.border,
                backgroundColor: c.surface,
              },
            ]}
            onPress={onMarkAsBooked}
            activeOpacity={0.8}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={17}
              color={Colors.available}
            />

            <Text
              style={[
                styles.markBookedText,
                { color: Colors.available },
              ]}
            >
              Mark as Booked
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptySchedule() {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View style={styles.emptyState}>
      <View
        style={[
          styles.emptyIcon,
          { backgroundColor: c.surfaceHigh },
        ]}
      >
        <Ionicons
          name="calendar-outline"
          size={38}
          color={Colors.brand.primary}
        />
      </View>

      <Text style={[styles.emptyTitle, { color: c.text }]}>
        No saved sessions
      </Text>

      <Text
        style={[styles.emptySubtitle, { color: c.textSecondary }]}
      >
        Plan a court session and save it here so you can easily
        find it later.
      </Text>
    </View>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  icon,
  color,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons
        name={icon}
        size={17}
        color={Colors.brand.primary}
      />

      <Text style={[styles.sectionTitle, { color }]}>
        {title}
      </Text>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compareSchedules(
  a: ScheduleItem,
  b: ScheduleItem
): number {
  const aValue = `${a.date}T${a.startTime}`;
  const bValue = `${b.date}T${b.startTime}`;

  return aValue.localeCompare(bValue);
}

function formatTimeRange(item: ScheduleItem): string {
  return `${formatTime(item.startTime)} – ${formatTime(item.endTime)}`;
}

function formatTime(value: string): string {
  const [hourString, minuteString] = value.split(":");

  const hour = Number(hourString);
  const minute = Number(minuteString);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return value;
  }

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },

  title: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },

  subtitle: {
    fontSize: 13,
    marginTop: 3,
  },

  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 12,
    marginTop: 24,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
  },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 15,
    marginBottom: 12,
  },

  dateRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  dateIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  dateInfo: {
    flex: 1,
    marginLeft: 11,
  },

  dateText: {
    fontSize: 15,
    fontWeight: "700",
  },

  timeText: {
    fontSize: 13,
    marginTop: 2,
  },

  deleteButton: {
    padding: 5,
  },

  divider: {
    height: 1,
    marginVertical: 13,
  },

  locationRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  locationIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  locationInfo: {
    flex: 1,
    marginLeft: 11,
  },

  venueName: {
    fontSize: 14,
    fontWeight: "700",
  },

  courtName: {
    fontSize: 12,
    marginTop: 2,
  },

  price: {
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 8,
  },

  footer: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-start",
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },

  emptyState: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 90,
  },

  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
  },

  emptySubtitle: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
  },

  bottomSpace: {
    height: 32,
  },

  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },

  actionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 10,
  },

  bookingButton: {
    borderWidth: 1,
  },

  bookingButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },

  markBookedButton: {
    borderWidth: 1,
  },

  markBookedText: {
    fontSize: 13,
    fontWeight: "800",
  },

  pastCard: {
    opacity: 0.72,
  },
});