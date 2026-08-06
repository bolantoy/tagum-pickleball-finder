// ─── Favorites Context ────────────────────────────────────────────────────────
// Stores favorite courts locally using AsyncStorage.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Config } from "../constants/config";
import { FavoriteCourt } from "../types";
import { Court } from "../../../shared/types";

interface FavoritesContextValue {
  favorites: FavoriteCourt[];
  isFavorite: (courtId: string) => boolean;
  addFavorite: (court: Court) => void;
  removeFavorite: (courtId: string) => void;
  toggleFavorite: (court: Court) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | undefined>(
  undefined
);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteCourt[]>([]);

  // Load persisted favorites on mount
  useEffect(() => {
    AsyncStorage.getItem(Config.STORAGE_KEYS.FAVORITES)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as FavoriteCourt[];
          setFavorites(parsed);
        }
      })
      .catch(() => {});
  }, []);

  const persist = useCallback((updated: FavoriteCourt[]) => {
    AsyncStorage.setItem(
      Config.STORAGE_KEYS.FAVORITES,
      JSON.stringify(updated)
    ).catch(() => {});
  }, []);

  const isFavorite = useCallback(
    (courtId: string) => favorites.some((f) => f.id === courtId),
    [favorites]
  );

  const addFavorite = useCallback(
    (court: Court) => {
      if (favorites.some((f) => f.id === court.id)) return;
      const newFav: FavoriteCourt = {
        id: court.id,
        name: court.name,
        address: court.address,
        savedAt: new Date().toISOString(),
      };
      const updated = [...favorites, newFav];
      setFavorites(updated);
      persist(updated);
    },
    [favorites, persist]
  );

  const removeFavorite = useCallback(
    (courtId: string) => {
      const updated = favorites.filter((f) => f.id !== courtId);
      setFavorites(updated);
      persist(updated);
    },
    [favorites, persist]
  );

  const toggleFavorite = useCallback(
    (court: Court) => {
      if (isFavorite(court.id)) {
        removeFavorite(court.id);
      } else {
        addFavorite(court);
      }
    },
    [isFavorite, addFavorite, removeFavorite]
  );

  return (
    <FavoritesContext.Provider
      value={{ favorites, isFavorite, addFavorite, removeFavorite, toggleFavorite }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}
