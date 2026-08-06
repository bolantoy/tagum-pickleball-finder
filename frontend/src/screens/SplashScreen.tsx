// ─── Splash Screen ─────────────────────────────────────────────────────────────
import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { Colors } from "../constants/colors";
import { Config } from "../constants/config";

type Props = NativeStackScreenProps<RootStackParamList, "Splash">;

const { width } = Dimensions.get("window");

export default function SplashScreen({ navigation }: Props) {
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate logo in
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 60,
          friction: 6,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 400,
        delay: 100,
        useNativeDriver: true,
      }),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Navigate to Main after 2.2s
    const timer = setTimeout(() => {
      navigation.replace("Main");
    }, 2200);

    return () => clearTimeout(timer);
  }, [navigation, logoScale, logoOpacity, textOpacity, taglineOpacity]);

  return (
    <View style={styles.container}>
      {/* Background gradient-like overlay */}
      <View style={styles.bgCircle} />

      {/* Logo / Icon */}
      <Animated.View
        style={[
          styles.logoWrap,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      >
        <Text style={styles.logoEmoji}>🏓</Text>
      </Animated.View>

      {/* App Name */}
      <Animated.View style={{ opacity: textOpacity, alignItems: "center" }}>
        <Text style={styles.appName}>{Config.APP_NAME}</Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.View style={{ opacity: taglineOpacity }}>
        <Text style={styles.tagline}>{Config.APP_TAGLINE}</Text>
      </Animated.View>

      {/* Bottom badge */}
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Tagum City 🇵🇭</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  bgCircle: {
    position: "absolute",
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: width * 0.6,
    backgroundColor: `${Colors.brand.primary}08`,
    top: -width * 0.3,
  },
  logoWrap: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: `${Colors.brand.primary}20`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: `${Colors.brand.primary}40`,
    marginBottom: 8,
  },
  logoEmoji: {
    fontSize: 52,
  },
  appName: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.text,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  badge: {
    position: "absolute",
    bottom: 60,
    backgroundColor: `${Colors.brand.primary}15`,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  badgeText: {
    color: Colors.brand.primaryLight,
    fontSize: 13,
    fontWeight: "600",
  },
});
