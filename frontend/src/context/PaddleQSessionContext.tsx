import React, { createContext, useCallback, useContext, useMemo } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

export interface RememberedPaddleSession {
  sessionId: string;
  lastOpenedAt: string;
  role: "organizer" | "player" | "both" | "viewer";
  playerId?: string;
  venueId?: string;
  displayName?: string;
  venueName?: string;
  sessionDate?: string;
  startTime?: string;
}

interface PaddleQSessionContextValue {
  saveOrganizerCapability: (sessionId: string, capability: string) => Promise<void>;
  getOrganizerCapability: (sessionId: string) => Promise<string | null>;
  removeOrganizerCapability: (sessionId: string) => Promise<void>;
  savePlayerCredential: (sessionId: string, playerId: string, credential: string) => Promise<void>;
  getPlayerCredential: (sessionId: string, playerId: string) => Promise<string | null>;
  removePlayerCredential: (sessionId: string, playerId: string) => Promise<void>;
  saveRememberedSession: (session: Omit<RememberedPaddleSession, "lastOpenedAt"> & { lastOpenedAt?: string }) => Promise<void>;
  getRememberedSessions: () => Promise<RememberedPaddleSession[]>;
}

const PaddleQSessionContext = createContext<PaddleQSessionContextValue | undefined>(undefined);
const REMEMBERED_SESSIONS_KEY = "@tagum_pb:paddle_q:sessions:v1";
const ORGANIZER_KEY_PREFIX = "paddleq_v1_organizer_";
const PLAYER_KEY_PREFIX = "paddleq_v1_player_";

function assertSecureStorageAvailable(): void {
  if (Platform.OS === "web") {
    throw new Error("Secure credential storage is unavailable on this platform");
  }
}

function organizerKey(sessionId: string): string {
  return `${ORGANIZER_KEY_PREFIX}${sessionId}`;
}

function playerKey(sessionId: string, playerId: string): string {
  return `${PLAYER_KEY_PREFIX}${sessionId}_${playerId}`;
}

function normalizeRememberedSession(value: unknown): RememberedPaddleSession | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<RememberedPaddleSession>;
  if (typeof item.sessionId !== "string"
    || typeof item.lastOpenedAt !== "string"
    || !["organizer", "player", "both", "viewer"].includes(item.role ?? "")) return null;
  return {
    sessionId: item.sessionId,
    lastOpenedAt: item.lastOpenedAt,
    role: item.role as RememberedPaddleSession["role"],
    ...(typeof item.playerId === "string" ? { playerId: item.playerId } : {}),
    ...(typeof item.venueId === "string" ? { venueId: item.venueId } : {}),
    ...(typeof item.displayName === "string" ? { displayName: item.displayName } : {}),
    ...(typeof item.venueName === "string" ? { venueName: item.venueName } : {}),
    ...(typeof item.sessionDate === "string" ? { sessionDate: item.sessionDate } : {}),
    ...(typeof item.startTime === "string" ? { startTime: item.startTime } : {}),
  };
}

export function PaddleQSessionProvider({ children }: { children: React.ReactNode }) {
  const saveOrganizerCapability = useCallback(async (sessionId: string, capability: string) => {
    assertSecureStorageAvailable();
    await SecureStore.setItemAsync(organizerKey(sessionId), capability);
  }, []);

  const getOrganizerCapability = useCallback(async (sessionId: string) => {
    assertSecureStorageAvailable();
    return SecureStore.getItemAsync(organizerKey(sessionId));
  }, []);

  const removeOrganizerCapability = useCallback(async (sessionId: string) => {
    assertSecureStorageAvailable();
    await SecureStore.deleteItemAsync(organizerKey(sessionId));
  }, []);

  const savePlayerCredential = useCallback(async (sessionId: string, playerId: string, credential: string) => {
    assertSecureStorageAvailable();
    await SecureStore.setItemAsync(playerKey(sessionId, playerId), credential);
  }, []);

  const getPlayerCredential = useCallback(async (sessionId: string, playerId: string) => {
    assertSecureStorageAvailable();
    return SecureStore.getItemAsync(playerKey(sessionId, playerId));
  }, []);

  const removePlayerCredential = useCallback(async (sessionId: string, playerId: string) => {
    assertSecureStorageAvailable();
    await SecureStore.deleteItemAsync(playerKey(sessionId, playerId));
  }, []);

  const saveRememberedSession = useCallback(async (
    session: Omit<RememberedPaddleSession, "lastOpenedAt"> & { lastOpenedAt?: string }
  ) => {
    let sessions: RememberedPaddleSession[] = [];
    try {
      const raw = await AsyncStorage.getItem(REMEMBERED_SESSIONS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        sessions = parsed.map(normalizeRememberedSession).filter((item): item is RememberedPaddleSession => item !== null);
      }
    } catch {
      sessions = [];
    }

    // Whitelist metadata so credentials cannot be persisted in this AsyncStorage record.
    const previous = sessions.find((item) => item.sessionId === session.sessionId);
    const hasOrganizer = [previous?.role, session.role].some((role) => role === "organizer" || role === "both");
    const hasPlayer = [previous?.role, session.role].some((role) => role === "player" || role === "both");
    const role: RememberedPaddleSession["role"] = hasOrganizer && hasPlayer
      ? "both"
      : hasOrganizer
        ? "organizer"
        : hasPlayer
          ? "player"
          : session.role;
    const remembered: RememberedPaddleSession = {
      ...previous,
      sessionId: session.sessionId,
      role,
      lastOpenedAt: session.lastOpenedAt ?? new Date().toISOString(),
      ...(session.playerId ?? previous?.playerId ? { playerId: session.playerId ?? previous?.playerId } : {}),
      ...(session.venueId ?? previous?.venueId ? { venueId: session.venueId ?? previous?.venueId } : {}),
      ...(session.displayName ?? previous?.displayName ? { displayName: session.displayName ?? previous?.displayName } : {}),
      ...(session.venueName ?? previous?.venueName ? { venueName: session.venueName ?? previous?.venueName } : {}),
      ...(session.sessionDate ?? previous?.sessionDate ? { sessionDate: session.sessionDate ?? previous?.sessionDate } : {}),
      ...(session.startTime ?? previous?.startTime ? { startTime: session.startTime ?? previous?.startTime } : {}),
    };
    const updated = [remembered, ...sessions.filter((item) => item.sessionId !== session.sessionId)];
    await AsyncStorage.setItem(REMEMBERED_SESSIONS_KEY, JSON.stringify(updated));
  }, []);

  const getRememberedSessions = useCallback(async (): Promise<RememberedPaddleSession[]> => {
    try {
      const raw = await AsyncStorage.getItem(REMEMBERED_SESSIONS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.map(normalizeRememberedSession)
          .filter((item): item is RememberedPaddleSession => item !== null)
          .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
        : [];
    } catch {
      return [];
    }
  }, []);

  const value = useMemo(() => ({
    saveOrganizerCapability,
    getOrganizerCapability,
    removeOrganizerCapability,
    savePlayerCredential,
    getPlayerCredential,
    removePlayerCredential,
    saveRememberedSession,
    getRememberedSessions,
  }), [
    saveOrganizerCapability,
    getOrganizerCapability,
    removeOrganizerCapability,
    savePlayerCredential,
    getPlayerCredential,
    removePlayerCredential,
    saveRememberedSession,
    getRememberedSessions,
  ]);

  return <PaddleQSessionContext.Provider value={value}>{children}</PaddleQSessionContext.Provider>;
}

export function usePaddleQSessionStorage(): PaddleQSessionContextValue {
  const context = useContext(PaddleQSessionContext);
  if (!context) throw new Error("usePaddleQSessionStorage must be used within PaddleQSessionProvider");
  return context;
}
