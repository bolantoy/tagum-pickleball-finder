// ─── App Navigator ─────────────────────────────────────────────────────────────
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../context/ThemeContext";
import { Colors } from "../constants/colors";
import { PaddleQStackParamList, RootStackParamList, TabParamList } from "./types";

// Screens
import SplashScreen from "../screens/SplashScreen";
import HomeScreen from "../screens/HomeScreen";
import PlannerScreen from "../screens/PlannerScreen";
import CourtDetailsScreen from "../screens/CourtDetailsScreen";
import AvailabilityScreen from "../screens/AvailabilityScreen";
import ScheduleScreen from "../screens/ScheduleScreen";
import SettingsScreen from "../screens/SettingsScreen";
import PaddleQSessionsHomeScreen from "../screens/PaddleQSessionsHomeScreen";
import PaddleQCreateSessionScreen from "../screens/PaddleQCreateSessionScreen";
import PaddleQJoinSessionScreen from "../screens/PaddleQJoinSessionScreen";
import PaddleQSessionLobbyScreen from "../screens/PaddleQSessionLobbyScreen";
import PaddleQRotationScreen from "../screens/PaddleQRotationScreen";
import PaddleQGameScreen from "../screens/PaddleQGameScreen";
import PaddleQGameHistoryScreen from "../screens/PaddleQGameHistoryScreen";
import PaddleQStatisticsScreen from "../screens/PaddleQStatisticsScreen";
import PaddleQOrganizerControlsScreen from "../screens/PaddleQOrganizerControlsScreen";
import PaddleQPlaceholderScreen from "../screens/PaddleQPlaceholderScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const PaddleQStack = createNativeStackNavigator<PaddleQStackParamList>();

function PaddleQNavigator() {
  const { theme } = useTheme();

  return (
    <PaddleQStack.Navigator
      initialRouteName="SessionsHome"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: "slide_from_right",
      }}
    >
      <PaddleQStack.Screen name="SessionsHome" component={PaddleQSessionsHomeScreen} />
      <PaddleQStack.Screen name="CreateSession" component={PaddleQCreateSessionScreen} />
      <PaddleQStack.Screen name="JoinSession" component={PaddleQJoinSessionScreen} />
      <PaddleQStack.Screen name="SessionLobby" component={PaddleQSessionLobbyScreen} />
      <PaddleQStack.Screen name="Rotation" component={PaddleQRotationScreen} />
      <PaddleQStack.Screen name="Game" component={PaddleQGameScreen} />
      <PaddleQStack.Screen name="GameHistory" component={PaddleQGameHistoryScreen} />
      <PaddleQStack.Screen name="Statistics" component={PaddleQStatisticsScreen} />
      <PaddleQStack.Screen name="OrganizerControls" component={PaddleQOrganizerControlsScreen} />
    </PaddleQStack.Navigator>
  );
}

function MainTabs() {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 70,
        },
        tabBarActiveTintColor: Colors.brand.primary,
        tabBarInactiveTintColor: c.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap: Record<
            string,
            { default: keyof typeof Ionicons.glyphMap; focused: keyof typeof Ionicons.glyphMap }
          > = {
            Home: { default: "home-outline", focused: "home" },
            Planner: { default: "calendar-outline", focused: "calendar" },
            PaddleQ: { default: "tennisball-outline", focused: "tennisball" },
            Schedule: { default: "calendar-outline", focused: "calendar" },
            Settings: { default: "settings-outline", focused: "settings" },
          };
          const icons = iconMap[route.name] ?? {
            default: "ellipse-outline",
            focused: "ellipse",
          };
          return (
            <Ionicons
              name={focused ? icons.focused : icons.default}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: "Home" }} />
      <Tab.Screen name="Planner" component={PlannerScreen} options={{ tabBarLabel: "Planner" }} />
      <Tab.Screen name="PaddleQ" component={PaddleQNavigator} options={{ tabBarLabel: "Paddle Q" }} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} options={{ tabBarLabel: "Schedule" }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: "Settings" }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { theme } = useTheme();

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen
          name="CourtDetails"
          component={CourtDetailsScreen}
          options={{ animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="Availability"
          component={AvailabilityScreen}
          options={{ animation: "slide_from_right" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
