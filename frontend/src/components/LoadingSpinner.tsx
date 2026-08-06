// ─── Loading Spinner ───────────────────────────────────────────────────────────
import React, { useEffect, useRef } from "react";
import {
  View,
  Animated,
  StyleSheet,
  Text,
  ViewStyle,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { Colors } from "../constants/colors";

interface LoadingSpinnerProps {
  message?: string;
  size?: "small" | "large";
  style?: ViewStyle;
}

export default function LoadingSpinner({
  message,
  size = "large",
  style,
}: LoadingSpinnerProps) {
  const { theme } = useTheme();
  const rotation = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      })
    );
    const pulsate = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    spin.start();
    pulsate.start();
    return () => {
      spin.stop();
      pulsate.stop();
    };
  }, [rotation, pulse]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const spinnerSize = size === "large" ? 48 : 28;
  const borderWidth = size === "large" ? 4 : 3;

  return (
    <View style={[styles.container, style]}>
      <Animated.View
        style={[
          styles.spinner,
          {
            width: spinnerSize,
            height: spinnerSize,
            borderRadius: spinnerSize / 2,
            borderWidth,
            borderColor: theme.colors.border,
            borderTopColor: Colors.brand.primary,
            transform: [{ rotate }, { scale: pulse }],
          },
        ]}
      />
      {message ? (
        <Text style={[styles.message, { color: theme.colors.textSecondary }]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 32,
  },
  spinner: {},
  message: {
    fontSize: 14,
    textAlign: "center",
    maxWidth: 240,
  },
});
