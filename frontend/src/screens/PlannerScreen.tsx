// ─── Booking Planner Screen ───────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { useTheme } from "../context/ThemeContext";
import { useSchedule } from "../context/ScheduleContext";
import { Colors } from "../constants/colors";
import { fetchAvailability, fetchCourts } from "../services/api";
import { formatDateDisplay, todayString } from "../utils/dateUtils";
import { CourtAvailability, TimeSlot, Court } from "../../../shared/types";

import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";
import EmptyState from "../components/EmptyState";
import DatePickerStrip from "../components/DatePickerStrip";

interface PlannerTime {
  startTime: string;
  endTime: string;
  label: string;
  availableCount: number;
  totalCount: number;
  slots: TimeSlot[];
}

function getLocalDateString(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function filterExpiredSlots(
  results: CourtAvailability[],
  selectedDate: string
): CourtAvailability[] {
  const today = getLocalDateString();

  // Future dates: keep everything.
  if (selectedDate !== today) {
    return results;
  }

  const now = new Date();
  const currentMinutes =
    now.getHours() * 60 + now.getMinutes();

  return results.map((result) => ({
    ...result,
    slots: result.slots.filter((slot) => {
      const [hourString, minuteString] = slot.startTime.split(":");

      const hour = Number(hourString);
      const minute = Number(minuteString);

      if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
        return true;
      }

      const slotMinutes = hour * 60 + minute;

      return slotMinutes > currentMinutes;
    }),
  }));
}

function formatTimeLabel(startTime: string, endTime: string): string {
  const formatTime = (value: string) => {
    const [hourString, minuteString] = value.split(":");

    const hour = Number(hourString);
    const minute = Number(minuteString);

    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return value;
    }

    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;

    return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
  };

  return `${formatTime(startTime)} – ${formatTime(endTime)}`;
}

function SelectedTimeCourts({
  time,
  results,
  courts,
  selectedCourtId,
  onCourtSelect,
  bookingUrl,
  isScheduled,
  onSaveSchedule,
  }: {
    time: PlannerTime;
    results: CourtAvailability[];
    courts: Court[];
    selectedCourtId: string | null;
    onCourtSelect: (courtId: string | null) => void;
    bookingUrl: string | null;
    isScheduled: boolean;
    onSaveSchedule: () => void;
  }) {
  const { theme } = useTheme();
  const c = theme.colors;

  const availableCourts = time.slots.filter((slot) => slot.available);

  return (
    <View style={styles.selectedSection}>
      <Text style={[styles.courtSectionTitle, { color: c.text }]}>
        Choose a court
      </Text>

      <Text style={[styles.courtSectionHint, { color: c.textMuted }]}>
        {availableCourts.length}{" "}
        {availableCourts.length === 1 ? "court" : "courts"} available
      </Text>

      <View style={styles.courtList}>
        {availableCourts.map((slot, index) => {
            const courtKey = `${time.startTime}-${time.endTime}-${index}`;
            const selected = courtKey === selectedCourtId;

            const parentResult = results.find((result) =>
                result.slots.includes(slot)
            );

            const venueName = parentResult?.courtName ?? "Unknown venue";

            return (
                <View key={courtKey}>
                <TouchableOpacity
                    style={[
                    styles.courtCard,
                    {
                        backgroundColor: selected
                        ? Colors.brand.primary
                        : c.surface,
                        borderColor: selected
                        ? Colors.brand.primary
                        : c.border,
                    },
                    ]}
                    onPress={() => {
                    if (selected) {
                        // Pressing the selected court again collapses it.
                        onCourtSelect(null);
                        return;
                    }

                    // Select a new court.
                    onCourtSelect(courtKey);
                    }}
                    activeOpacity={0.8}
                >
                    <View style={styles.courtCardLeft}>
                    <View
                        style={[
                        styles.courtDot,
                        {
                            backgroundColor: selected
                            ? "#fff"
                            : Colors.available,
                        },
                        ]}
                    />

                    <View style={styles.courtInfo}>
                        <Text
                            style={[
                            styles.courtVenue,
                            {
                                color: selected ? "#fff" : c.text,
                            },
                            ]}
                            numberOfLines={1}
                        >
                            {venueName}
                        </Text>

                        <Text
                            style={[
                            styles.courtNumber,
                            {
                                color: selected
                                ? "rgba(255,255,255,0.75)"
                                : c.textSecondary,
                            },
                            ]}
                            numberOfLines={1}
                        >
                            {slot.courtName ?? "Available court"}
                        </Text>
                    </View>
                    </View>

                    <View style={styles.courtCardRight}>
                    {slot.price && (
                        <Text
                        style={[
                            styles.courtPrice,
                            {
                            color: selected
                                ? "#fff"
                                : Colors.available,
                            },
                        ]}
                        >
                        {slot.price}
                        </Text>
                    )}

                    <Ionicons
                        name={
                        selected
                            ? "checkmark-circle"
                            : "chevron-forward"
                        }
                        size={22}
                        color={selected ? "#fff" : c.textMuted}
                    />
                    </View>
                </TouchableOpacity>

                {/* Book Court for the selected court */}
                {selected && (
                  <View style={styles.selectedCourtActions}>
                    <TouchableOpacity
                      style={[
                        styles.saveScheduleButton,
                        {
                          backgroundColor: isScheduled
                            ? c.surfaceHigh
                            : c.surface,
                          borderColor: isScheduled
                            ? Colors.available
                            : c.border,
                        },
                      ]}
                      onPress={onSaveSchedule}
                      disabled={isScheduled}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={isScheduled ? "checkmark-circle" : "calendar-outline"}
                        size={20}
                        color={
                          isScheduled
                            ? Colors.available
                            : Colors.brand.primary
                        }
                      />

                      <Text
                        style={[
                          styles.saveScheduleText,
                          {
                            color: isScheduled
                              ? Colors.available
                              : Colors.brand.primary,
                          },
                        ]}
                      >
                        {isScheduled ? "Saved to Schedule" : "Save to Schedule"}
                      </Text>
                    </TouchableOpacity>

                    {bookingUrl && (
                      <TouchableOpacity
                        style={[
                          styles.bookButton,
                          { backgroundColor: Colors.brand.primary },
                        ]}
                        onPress={async () => {
                          try {
                            const supported = await Linking.canOpenURL(bookingUrl);

                            if (supported) {
                              await Linking.openURL(bookingUrl);
                            }
                          } catch (err) {
                            console.warn(
                              "Could not open booking website:",
                              err
                            );
                          }
                        }}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name="calendar-outline"
                          size={20}
                          color="#fff"
                        />

                        <Text style={styles.bookButtonText}>
                          Book Court
                        </Text>

                        <Ionicons
                          name="open-outline"
                          size={19}
                          color="#fff"
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
        })}
      </View>
    </View>
  );
}

export default function PlannerScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { addSchedule, isScheduled } = useSchedule();
  const c = theme.colors;

  const [selectedDate, setSelectedDate] = useState(todayString());
  const [results, setResults] = useState<CourtAvailability[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const viewportHeight = useRef(0);
  const timeCardLayouts = useRef<
    Record<string, { y: number; height: number }>
  >({});

  const ensureTimeVisible = useCallback((key: string) => {
    requestAnimationFrame(() => {
        const layout = timeCardLayouts.current[key];

        if (!layout || viewportHeight.current <= 0) {
        return;
        }

        const currentScrollY = scrollY.current;
        const viewportBottom = currentScrollY + viewportHeight.current;

        const topPadding = 16;
        const bottomPadding = 16;

        const itemTop = layout.y;
        const itemBottom = layout.y + layout.height;

        // Time is already comfortably visible.
        if (
        itemTop >= currentScrollY + topPadding &&
        itemBottom <= viewportBottom - bottomPadding
        ) {
        return;
        }

        let targetY = currentScrollY;

        // Selected time is above the visible area.
        if (itemTop < currentScrollY + topPadding) {
        targetY = Math.max(0, itemTop - topPadding);
        }
        // Selected time is below the visible area.
        else if (itemBottom > viewportBottom - bottomPadding) {
        targetY = Math.max(
            0,
            itemBottom - viewportHeight.current + bottomPadding
        );
        }

        if (targetY !== currentScrollY) {
        scrollViewRef.current?.scrollTo({
            y: targetY,
            animated: true,
        });
        }
    });
  }, []);

  const loadAvailability = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedTime(null);
    setSelectedCourtId(null);

    try {
      const [data, courtData] = await Promise.all([
        fetchAvailability(selectedDate),
        fetchCourts(),
      ]);

      const filtered = filterExpiredSlots(
        data.results,
        selectedDate
      );

      setResults(filtered);
      setCourts(courtData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not fetch availability"
      );
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const plannerTimes = useMemo<PlannerTime[]>(() => {
    const timeMap = new Map<
      string,
      {
        startTime: string;
        endTime: string;
        slots: TimeSlot[];
      }
    >();

    for (const result of results) {
      if (result.error) continue;

      for (const slot of result.slots) {
        const key = `${slot.startTime}-${slot.endTime}`;

        if (!timeMap.has(key)) {
          timeMap.set(key, {
            startTime: slot.startTime,
            endTime: slot.endTime,
            slots: [],
          });
        }

        timeMap.get(key)!.slots.push(slot);
      }
    }

    return Array.from(timeMap.values())
      .map((time) => ({
        startTime: time.startTime,
        endTime: time.endTime,
        label: formatTimeLabel(
          time.startTime,
          time.endTime
        ),
        availableCount: time.slots.filter(
          (slot) => slot.available
        ).length,
        totalCount: time.slots.length,
        slots: time.slots,
      }))
      .filter((time) => time.availableCount > 0)
      .sort((a, b) =>
        a.startTime.localeCompare(b.startTime)
      );
  }, [results]);

  const selectedTimeData = plannerTimes.find(
    (time) =>
      `${time.startTime}-${time.endTime}` === selectedTime
  );

  const selectedCourtBookingUrl = useMemo(() => {
    if (!selectedTimeData || !selectedCourtId) {
      return null;
    }

    const availableSlots = selectedTimeData.slots.filter(
      (slot) => slot.available
    );

    const selectedSlotIndex = availableSlots.findIndex(
      (_slot, index) => {
        const courtKey =
          `${selectedTimeData.startTime}-${selectedTimeData.endTime}-${index}`;

        return courtKey === selectedCourtId;
      }
    );

    if (selectedSlotIndex === -1) {
      return null;
    }

    const selectedSlot = availableSlots[selectedSlotIndex];

    const parentResult = results.find((result) =>
      result.slots.includes(selectedSlot)
    );

    if (!parentResult) {
      return null;
    }

    const venue = courts.find(
      (court) => court.id === parentResult.courtId
    );

    return venue?.website ?? null;
  }, [
    selectedTimeData,
    selectedCourtId,
    results,
    courts,
  ]);

  const selectedScheduleInfo = useMemo(() => {
    if (!selectedTimeData || !selectedCourtId) {
      return null;
    }

    const availableSlots = selectedTimeData.slots.filter(
      (slot) => slot.available
    );

    const selectedSlotIndex = availableSlots.findIndex(
      (_slot, index) => {
        const courtKey =
          `${selectedTimeData.startTime}-${selectedTimeData.endTime}-${index}`;

        return courtKey === selectedCourtId;
      }
    );

    if (selectedSlotIndex === -1) {
      return null;
    }

    const selectedSlot = availableSlots[selectedSlotIndex];

    const parentResult = results.find((result) =>
      result.slots.includes(selectedSlot)
    );

    if (!parentResult) {
      return null;
    }

    const venue = courts.find(
      (court) => court.id === parentResult.courtId
    );

    return {
      slot: selectedSlot,
      venueName: parentResult.courtName,
      courtId: selectedSlot.courtId ?? parentResult.courtId,
      courtName:
        selectedSlot.courtName ??
        parentResult.courtName,
      bookingUrl: venue?.website ?? null,
    };
  }, [
    selectedTimeData,
    selectedCourtId,
    results,
    courts,
  ]);

  const selectedCourtIsScheduled = useMemo(() => {
    if (!selectedScheduleInfo || !selectedTimeData) {
      return false;
    }

    return isScheduled(
      selectedDate,
      selectedTimeData.startTime,
      selectedTimeData.endTime,
      selectedScheduleInfo.courtId
    );
  }, [
    selectedDate,
    selectedTimeData,
    selectedScheduleInfo,
    isScheduled,
  ]);

  const handleSaveSchedule = useCallback(() => {
    if (!selectedScheduleInfo || !selectedTimeData) {
      return;
    }

    addSchedule({
      date: selectedDate,
      startTime: selectedTimeData.startTime,
      endTime: selectedTimeData.endTime,
      courtId: selectedScheduleInfo.courtId,
      courtName: selectedScheduleInfo.courtName,
      venueName: selectedScheduleInfo.venueName,
      price: selectedScheduleInfo.slot.price,
      bookingUrl: selectedScheduleInfo.bookingUrl,
      status: "planned",
    });
  }, [
    selectedDate,
    selectedTimeData,
    selectedScheduleInfo,
    addSchedule,
  ]);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.container, { backgroundColor: c.background }]}
    >
      <StatusBar
        barStyle={
          theme.isDark
            ? "light-content"
            : "dark-content"
        }
        backgroundColor={c.background}
      />

      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarHeight + 24 },
        ]}
        onScroll={(event) => {
            scrollY.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        onLayout={(event) => {
            viewportHeight.current = event.nativeEvent.layout.height;
        }}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text
              style={[
                styles.title,
                { color: c.text },
              ]}
            >
              Booking Planner
            </Text>

            <Text
              style={[
                styles.subtitle,
                { color: c.textSecondary },
              ]}
            >
              Plan your next pickleball session
            </Text>
          </View>

          <View
            style={[
              styles.headerIcon,
              {
                backgroundColor:
                  Colors.brand.primary,
              },
            ]}
          >
            <Ionicons
              name="calendar"
              size={24}
              color="#fff"
            />
          </View>
        </View>

        {/* Date */}
        <View style={styles.section}>
          <Text
            style={[
                styles.sectionTitle,
                styles.sectionHorizontalPadding,
                { color: c.text },
            ]}
          >
            Choose a date
          </Text>

          <Text
            style={[
              styles.selectedDate,
              { color: c.textSecondary },
            ]}
          >
            {formatDateDisplay(selectedDate)}
          </Text>

          <View style={styles.datePicker}>
            <DatePickerStrip
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
            />
          </View>
        </View>

        {/* Availability */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: c.text },
                ]}
              >
                Choose a time
              </Text>

              <Text
                style={[
                  styles.sectionHint,
                  { color: c.textMuted },
                ]}
              >
                Select a time with an available court
              </Text>
            </View>

            {!loading && (
              <TouchableOpacity
                style={[
                  styles.refreshButton,
                  {
                    backgroundColor: c.surfaceHigh,
                    borderColor: c.border,
                  },
                ]}
                onPress={loadAvailability}
                disabled={loading}
                activeOpacity={0.75}
                hitSlop={6}
              >
                <Ionicons
                  name="refresh"
                  size={20}
                  color={Colors.brand.primary}
                />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <LoadingSpinner
              message="Checking availability..."
            />
          ) : error ? (
            <ErrorMessage
              message={error}
              onRetry={loadAvailability}
            />
          ) : plannerTimes.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="No available times"
              subtitle={`No courts are currently available on ${formatDateDisplay(
                selectedDate
              )}. Try another date.`}
            />
          ) : (
            <View style={styles.timeList}>
                {plannerTimes.map((time) => {
                    const key = `${time.startTime}-${time.endTime}`;
                    const selected = key === selectedTime;

                    return (
                    <View
                        key={key}
                        onLayout={(event) => {
                            const { y, height } = event.nativeEvent.layout;

                            timeCardLayouts.current[key] = {
                            y,
                            height,
                            };
                        }}
                    >
                        {/* Time card */}
                        <TouchableOpacity
                        style={[
                            styles.timeCard,
                            {
                            backgroundColor: selected
                                ? Colors.brand.primary
                                : c.surface,
                            borderColor: selected
                                ? Colors.brand.primary
                                : c.border,
                            },
                        ]}
                        onPress={() => {
                            if (selected) {
                                // Pressing the selected time again collapses it.
                                setSelectedTime(null);
                                setSelectedCourtId(null);
                                return;
                            }

                            // Select a new time.
                            setSelectedTime(key);
                            setSelectedCourtId(null);

                            // Only move the screen if the selected time is outside
                            // the currently visible area.
                            ensureTimeVisible(key);
                        }}
                        activeOpacity={0.8}
                        >
                        <View style={styles.timeLeft}>
                            <View
                            style={[
                                styles.timeIcon,
                                {
                                backgroundColor: selected
                                    ? "rgba(255,255,255,0.20)"
                                    : c.surfaceHigh,
                                },
                            ]}
                            >
                            <Ionicons
                                name="time-outline"
                                size={20}
                                color={
                                selected
                                    ? "#fff"
                                    : Colors.brand.primary
                                }
                            />
                            </View>

                            <View>
                            <Text
                                style={[
                                styles.timeLabel,
                                {
                                    color: selected
                                    ? "#fff"
                                    : c.text,
                                },
                                ]}
                            >
                                {time.label}
                            </Text>

                            <Text
                                style={[
                                styles.timeAvailability,
                                {
                                    color: selected
                                    ? "rgba(255,255,255,0.8)"
                                    : Colors.available,
                                },
                                ]}
                            >
                                {time.availableCount} of{" "}
                                {time.totalCount} courts available
                            </Text>
                            </View>
                        </View>

                        <Ionicons
                            name={
                            selected
                                ? "checkmark-circle"
                                : "chevron-forward"
                            }
                            size={22}
                            color={
                            selected
                                ? "#fff"
                                : c.textMuted
                            }
                        />
                        </TouchableOpacity>

                        {/* Courts for the selected time */}
                        {selected && (
                        <SelectedTimeCourts
                          time={time}
                          results={results}
                          courts={courts}
                          selectedCourtId={selectedCourtId}
                          onCourtSelect={setSelectedCourtId}
                          bookingUrl={selectedCourtBookingUrl}
                          isScheduled={selectedCourtIsScheduled}
                          onSaveSchedule={handleSaveSchedule}
                        />
                        )}
                    </View>
                    );
                })}
                </View>
            )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  content: {
    paddingBottom: 120,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
  },

  headerText: {
    flex: 1,
  },

  title: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
  },

  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: 5,
  },

  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 16,
  },

  section: {
    marginBottom: 30,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 14,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },

  sectionHint: {
    fontSize: 13,
    marginTop: 3,
  },

  selectedDate: {
    fontSize: 15,
    paddingHorizontal: 20,
    marginTop: -6,
    marginBottom: 14,
  },

  datePicker: {
    width: "100%",
  },

  timeList: {
    paddingHorizontal: 20,
    gap: 10,
  },

  timeCard: {
    minHeight: 60,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  timeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flex: 1,
  },

  timeIcon: {
    width: 33,
    height: 33,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  timeLabel: {
    fontSize: 16,
    fontWeight: "700",
  },

  timeAvailability: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },

  selectionCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  selectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.brand.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  selectionInfo: {
    flex: 1,
  },

selectedSection: {
  marginHorizontal: 20,
  marginTop: 4,
},

selectedTimeHeader: {
  backgroundColor: "transparent",
  flexDirection: "row",
  alignItems: "center",
  gap: 13,
  marginBottom: 22,
},

courtSectionTitle: {
  fontSize: 20,
  fontWeight: "800",
  letterSpacing: -0.3,
},

courtSectionHint: {
  fontSize: 14,
  marginTop: 4,
  marginBottom: 14,
},

courtList: {
  gap: 10,
},

courtCard: {
  minHeight: 58,
  borderRadius: 12,
  borderWidth: 1,
  paddingHorizontal: 10,
  paddingVertical: 8,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
},

courtCardLeft: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  flex: 1,
},

courtDot: {
  width: 10,
  height: 10,
  borderRadius: 5,
},

courtInfo: {
  flex: 1,
  minWidth: 0,
},

courtVenue: {
  fontSize: 13,
  fontWeight: "700",
},

courtNumber: {
  fontSize: 10,
  marginTop: 1,
},

courtCardRight: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 10,
  marginLeft: 10,
  minWidth: 92,
},

courtPrice: {
  fontSize: 13,
  fontWeight: "800",
},

selectedCourtActions: {
  marginTop: 10,
  gap: 8,
  alignItems: "flex-end",
},

saveScheduleButton: {
  width: "72%",
  minHeight: 40,
  borderRadius: 12,
  borderWidth: 1,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
},

saveScheduleText: {
  fontSize: 12,
  fontWeight: "800",
},

bookButton: {
  width: "72%",
  minHeight: 44,
  borderRadius: 12,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
},

bookButtonText: {
  color: "#fff",
  fontSize: 15,
  fontWeight: "800",
},

  selectionTitle: {
    fontSize: 13,
    fontWeight: "700",
  },

  selectionTime: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 3,
    letterSpacing: -0.2,
  },

  sectionHorizontalPadding: {
    paddingHorizontal: 20,
  },

  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 0,
  },
});