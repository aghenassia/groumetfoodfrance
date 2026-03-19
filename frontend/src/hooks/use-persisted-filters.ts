"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * Persists filter/sort preferences per user in localStorage.
 * Key format: `filters:{userId}:{pageKey}` — each user has their own saved filters.
 */
export function usePersistedFilters<T extends Record<string, unknown>>(
  pageKey: string,
  defaults: T,
): [T, (patch: Partial<T>) => void, () => void] {
  const { user } = useAuth();
  const storageKey = user ? `filters:${user.id}:${pageKey}` : null;
  const defaultsRef = useRef(defaults);

  const [filters, setFilters] = useState<T>(() => {
    if (typeof window === "undefined" || !storageKey) return defaults;
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return defaults;
      const parsed = JSON.parse(stored);
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  });

  // Re-hydrate when user becomes available (login)
  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setFilters(prev => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  // Persist on change
  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(filters));
  }, [filters, storageKey]);

  const updateFilters = useCallback((patch: Partial<T>) => {
    setFilters(prev => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(defaultsRef.current);
    if (storageKey) localStorage.removeItem(storageKey);
  }, [storageKey]);

  return [filters, updateFilters, resetFilters];
}
