"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";

const HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * Envoie un heartbeat au backend toutes les 60s tant que l'onglet est visible
 * et que l'utilisateur est authentifié. Aucun rendu visible.
 */
export function ActivityTracker() {
  const lastSentRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      if (cancelled) return;
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      if (!api.getToken()) return;

      const now = Date.now();
      if (now - lastSentRef.current < HEARTBEAT_INTERVAL_MS - 1000) return;
      lastSentRef.current = now;

      try {
        await api.sendHeartbeat();
      } catch {
        // Silencieux : on ne dérange jamais l'utilisateur si le tracking échoue
      }
    };

    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
