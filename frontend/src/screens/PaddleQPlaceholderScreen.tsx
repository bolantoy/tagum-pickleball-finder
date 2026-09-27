import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../context/ThemeContext";
import { Spacing, Typography, FontWeight } from "../constants/design";

export default function PaddleQPlaceholderScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const sessionId = (route.params as { sessionId?: string } | undefined)?.sessionId;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
      </TouchableOpacity>
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{route.name}</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>This Paddle Q screen will be added in a later phase.</Text>
        {sessionId ? <Text style={[styles.sessionId, { color: theme.colors.textMuted }]}>{sessionId}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  back: { padding: Spacing.lg, alignSelf: "flex-start" },
  content: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl, gap: Spacing.md },
  title: { fontSize: Typography.sectionTitle, fontWeight: FontWeight.bold, textAlign: "center" },
  subtitle: { fontSize: Typography.body, textAlign: "center" },
  sessionId: { fontSize: Typography.caption },
});
