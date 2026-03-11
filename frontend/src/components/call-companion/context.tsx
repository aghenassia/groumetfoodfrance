"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { api, CallSessionResponse, ClientIntelResponse } from "@/lib/api";

interface CompanionState {
  isOpen: boolean;
  isMinimized: boolean;
  sessionId: string | null;
  clientId: string | null;
  clientName: string | null;
  phoneNumber: string | null;
  intel: ClientIntelResponse | null;
}

interface CompanionContextType extends CompanionState {
  openCompanion: (clientId: string, clientName: string, phoneNumber?: string) => Promise<void>;
  minimizeCompanion: () => void;
  expandCompanion: () => void;
  closeCompanion: () => void;
  refreshIntel: () => Promise<void>;
  setSessionId: (id: string | null) => void;
  setIntel: (intel: ClientIntelResponse | null) => void;
}

const CompanionContext = createContext<CompanionContextType | null>(null);

export function useCallCompanion() {
  const ctx = useContext(CompanionContext);
  if (!ctx) throw new Error("useCallCompanion must be used within CallCompanionProvider");
  return ctx;
}

export function CallCompanionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CompanionState>({
    isOpen: false,
    isMinimized: false,
    sessionId: null,
    clientId: null,
    clientName: null,
    phoneNumber: null,
    intel: null,
  });

  const openCompanion = useCallback(async (clientId: string, clientName: string, phoneNumber?: string) => {
    setState({
      isOpen: true,
      isMinimized: false,
      sessionId: null,
      clientId,
      clientName,
      phoneNumber: phoneNumber || null,
      intel: null,
    });

    try {
      const [session, intel] = await Promise.all([
        api.createCallSession(clientId, phoneNumber),
        api.getClientIntel(clientId),
      ]);
      setState((prev) => ({
        ...prev,
        sessionId: session.id,
        intel,
      }));
    } catch {
      // Session creation failed, widget stays open without session
    }
  }, []);

  const minimizeCompanion = useCallback(() => {
    setState((prev) => ({ ...prev, isMinimized: true }));
  }, []);

  const expandCompanion = useCallback(() => {
    setState((prev) => ({ ...prev, isMinimized: false }));
  }, []);

  const closeCompanion = useCallback(() => {
    setState({
      isOpen: false,
      isMinimized: false,
      sessionId: null,
      clientId: null,
      clientName: null,
      phoneNumber: null,
      intel: null,
    });
  }, []);

  const refreshIntel = useCallback(async () => {
    if (!state.clientId) return;
    try {
      const intel = await api.getClientIntel(state.clientId);
      setState((prev) => ({ ...prev, intel }));
    } catch {}
  }, [state.clientId]);

  const setSessionId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, sessionId: id }));
  }, []);

  const setIntel = useCallback((intel: ClientIntelResponse | null) => {
    setState((prev) => ({ ...prev, intel }));
  }, []);

  return (
    <CompanionContext.Provider
      value={{
        ...state,
        openCompanion,
        minimizeCompanion,
        expandCompanion,
        closeCompanion,
        refreshIntel,
        setSessionId,
        setIntel,
      }}
    >
      {children}
    </CompanionContext.Provider>
  );
}
