// ─── Settings Screen ───────────────────────────────────────────────────────────
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Linking,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../context/ThemeContext";
import { Colors } from "../constants/colors";
import { Config } from "../constants/config";

export default function SettingsScreen() {
  const { theme, themeMode, setThemeMode, toggleTheme } = useTheme();
  const c = theme.colors;

  const isDarkEnabled = themeMode === "dark" || (themeMode === "system" && theme.isDark);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar
        barStyle={theme.isDark ? "light-content" : "dark-content"}
        backgroundColor={c.background}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.text }]}>Settings</Text>
        </View>

        {/* Appearance */}
        <SettingsSection title="APPEARANCE" theme={c}>
          <SettingsRow
            icon="moon"
            iconColor="#7C3AED"
            label="Dark Mode"
            theme={c}
            rightContent={
              <Switch
                value={isDarkEnabled}
                onValueChange={() =>
                  setThemeMode(isDarkEnabled ? "light" : "dark")
                }
                trackColor={{
                  false: c.border,
                  true: Colors.brand.primary,
                }}
                thumbColor={isDarkEnabled ? "#fff" : c.surfaceHigh}
              />
            }
          />
          <SettingsRow
            icon="phone-portrait"
            iconColor="#0EA5E9"
            label="Follow System Theme"
            theme={c}
            rightContent={
              <Switch
                value={themeMode === "system"}
                onValueChange={(v) => setThemeMode(v ? "system" : "dark")}
                trackColor={{ false: c.border, true: Colors.brand.primary }}
                thumbColor={themeMode === "system" ? "#fff" : c.surfaceHigh}
              />
            }
          />
        </SettingsSection>

        {/* About */}
        <SettingsSection title="ABOUT" theme={c}>
          <SettingsRow
            icon="tennisball"
            iconColor={Colors.brand.primary}
            label="App Version"
            theme={c}
            rightContent={
              <Text style={[styles.metaValue, { color: c.textMuted }]}>
                {Config.APP_VERSION}
              </Text>
            }
          />
          <SettingsRow
            icon="location"
            iconColor="#EF4444"
            label="Service Area"
            theme={c}
            rightContent={
              <Text style={[styles.metaValue, { color: c.textMuted }]}>
                Tagum City, PH
              </Text>
            }
          />
          <SettingsRow
            icon="information-circle"
            iconColor={Colors.brand.accent}
            label="Privacy Policy"
            theme={c}
            onPress={() =>
              Linking.openURL("https://example.com/privacy")
            }
            showChevron
          />
          <SettingsRow
            icon="document-text"
            iconColor="#F59E0B"
            label="Terms of Service"
            theme={c}
            onPress={() =>
              Linking.openURL("https://example.com/terms")
            }
            showChevron
          />
        </SettingsSection>

        {/* Developer */}
        <SettingsSection title="DEVELOPER" theme={c}>
          <SettingsRow
            icon="code-slash"
            iconColor="#8B5CF6"
            label="API Endpoint"
            theme={c}
            rightContent={
              <Text
                style={[styles.metaValue, { color: c.textMuted }]}
                numberOfLines={1}
              >
                {Config.API_BASE_URL}
              </Text>
            }
          />
        </SettingsSection>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: c.textMuted }]}>
            {Config.APP_NAME}
          </Text>
          <Text style={[styles.footerSub, { color: c.textMuted }]}>
            Built for Tagum City pickleball players 🏓
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsSection({
  title,
  children,
  theme,
}: {
  title: string;
  children: React.ReactNode;
  theme: any;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
        {title}
      </Text>
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function SettingsRow({
  icon,
  iconColor,
  label,
  theme,
  rightContent,
  onPress,
  showChevron,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  theme: any;
  rightContent?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
}) {
  const Inner = (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: `${iconColor}20` }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
      <View style={styles.rowRight}>
        {rightContent}
        {showChevron && (
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {Inner}
      </TouchableOpacity>
    );
  }
  return Inner;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  section: { marginBottom: 24, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "transparent",
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 15, fontWeight: "500", flex: 1 },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 140,
  },
  metaValue: { fontSize: 13, textAlign: "right", flexShrink: 1 },
  footer: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 4,
  },
  footerText: { fontSize: 14, fontWeight: "600" },
  footerSub: { fontSize: 12 },
});
