// ─── Date Picker Strip ─────────────────────────────────────────────────────────
// Horizontal scrollable strip showing the next 14 days.

import React, { useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { Colors } from "../constants/colors";
import { getDateRange, getDateLabel } from "../utils/dateUtils";

interface DatePickerStripProps {
  selectedDate: string;
  onDateSelect: (date: string) => void;
}

export default function DatePickerStrip({
  selectedDate,
  onDateSelect,
}: DatePickerStripProps) {
  const { theme } = useTheme();
  const dates = getDateRange(14);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {dates.map((date) => {
        const { dayOfWeek, dayNumber, month } = getDateLabel(date);
        const isSelected = date === selectedDate;

        return (
          <TouchableOpacity
            key={date}
            style={[
              styles.dateItem,
              {
                backgroundColor: isSelected
                  ? Colors.brand.primary
                  : theme.colors.surface,
                borderColor: isSelected
                  ? Colors.brand.primary
                  : theme.colors.border,
              },
            ]}
            onPress={() => onDateSelect(date)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.dayOfWeek,
                {
                  color: isSelected ? "#fff" : theme.colors.textMuted,
                },
              ]}
            >
              {dayOfWeek}
            </Text>
            <Text
              style={[
                styles.dayNumber,
                {
                  color: isSelected ? "#fff" : theme.colors.text,
                },
              ]}
            >
              {dayNumber}
            </Text>
            <Text
              style={[
                styles.month,
                {
                  color: isSelected ? "rgba(255,255,255,0.75)" : theme.colors.textMuted,
                },
              ]}
            >
              {month}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    paddingVertical: 4,
  },
  dateItem: {
    width: 58,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 2,
  },
  dayOfWeek: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dayNumber: {
    fontSize: 20,
    fontWeight: "800",
  },
  month: {
    fontSize: 11,
    fontWeight: "500",
  },
});
