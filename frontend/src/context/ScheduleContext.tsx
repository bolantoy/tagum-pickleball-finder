// ─── Schedule Context ─────────────────────────────────────────────────────────
// Stores saved/planned court sessions locally using AsyncStorage.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Config } from "../constants/config";

export interface ScheduleItem {
  id: string;

  // Session details
  date: string;       // "YYYY-MM-DD"
  startTime: string;  // "18:00"
  endTime: string;    // "19:00"

  // Court details
  courtId: string;
  courtName: string;
  venueName: string;

  // Booking information
  price: string | null;
  bookingUrl: string | null;

  // Local state
  status: "planned" | "booked";
  createdAt: string;
}

interface ScheduleContextValue {
  schedules: ScheduleItem[];

  addSchedule: (
    item: Omit<ScheduleItem, "id" | "createdAt">
  ) => ScheduleItem | null;

  removeSchedule: (id: string) => void;

  updateScheduleStatus: (
    id: string,
    status: ScheduleItem["status"]
  ) => void;

  isScheduled: (
    date: string,
    startTime: string,
    endTime: string,
    courtId: string
  ) => boolean;
}

const ScheduleContext = createContext<ScheduleContextValue | undefined>(
  undefined
);

const STORAGE_KEY =
  Config.STORAGE_KEYS.SCHEDULE ?? "tagum_pickleball_schedule";

export function ScheduleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);

  // ── Load saved schedules ───────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;

        try {
          const parsed = JSON.parse(raw) as ScheduleItem[];

          if (Array.isArray(parsed)) {
            setSchedules(parsed);
          }
        } catch {
          // Ignore malformed local data.
        }
      })
      .catch(() => {});
  }, []);

  // ── Persist schedules ──────────────────────────────────────────────────────
  const persist = useCallback((updated: ScheduleItem[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  }, []);

  // ── Check for an existing session ──────────────────────────────────────────
  const isScheduled = useCallback(
    (
      date: string,
      startTime: string,
      endTime: string,
      courtId: string
    ) => {
      return schedules.some(
        (item) =>
          item.date === date &&
          item.startTime === startTime &&
          item.endTime === endTime &&
          item.courtId === courtId
      );
    },
    [schedules]
  );

  // ── Add a schedule ─────────────────────────────────────────────────────────
  const addSchedule = useCallback(
    (item: Omit<ScheduleItem, "id" | "createdAt">) => {
      const duplicate = schedules.some(
        (existing) =>
          existing.date === item.date &&
          existing.startTime === item.startTime &&
          existing.endTime === item.endTime &&
          existing.courtId === item.courtId
      );

      if (duplicate) {
        return null;
      }

      const newItem: ScheduleItem = {
        ...item,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        createdAt: new Date().toISOString(),
      };

      const updated = [...schedules, newItem];

      setSchedules(updated);
      persist(updated);

      return newItem;
    },
    [schedules, persist]
  );

  // ── Remove a schedule ──────────────────────────────────────────────────────
  const removeSchedule = useCallback(
    (id: string) => {
      const updated = schedules.filter((item) => item.id !== id);

      setSchedules(updated);
      persist(updated);
    },
    [schedules, persist]
  );

  // ── Update planned/booked status ───────────────────────────────────────────
  const updateScheduleStatus = useCallback(
    (id: string, status: ScheduleItem["status"]) => {
      const updated = schedules.map((item) =>
        item.id === id ? { ...item, status } : item
      );

      setSchedules(updated);
      persist(updated);
    },
    [schedules, persist]
  );

  return (
    <ScheduleContext.Provider
      value={{
        schedules,
        addSchedule,
        removeSchedule,
        updateScheduleStatus,
        isScheduled,
      }}
    >
      {children}
    </ScheduleContext.Provider>
  );
}

export function useSchedule(): ScheduleContextValue {
  const context = useContext(ScheduleContext);

  if (!context) {
    throw new Error("useSchedule must be used within ScheduleProvider");
  }

  return context;
}