"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FC,
  type ReactNode,
} from "react";
import { useRealtimeIntelligence, type RealtimeState } from "@/lib/useRealtimeIntelligence";
import type { SidePanelState, SidePanelType } from "@/lib/types";

export interface AppContextValue extends RealtimeState {
  theme: "dark";
  sidePanel: SidePanelState;
  openSidePanel: (type: Exclude<SidePanelType, null>, entityId: string) => void;
  closeSidePanel: () => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  notificationDrawerOpen: boolean;
  setNotificationDrawerOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const realtime = useRealtimeIntelligence();
  const [sidePanel, setSidePanel] = useState<SidePanelState>({ type: null, entityId: null });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);

  const openSidePanel = useCallback((type: Exclude<SidePanelType, null>, entityId: string) => {
    setSidePanel({ type, entityId });
  }, []);
  const closeSidePanel = useCallback(() => setSidePanel({ type: null, entityId: null }), []);

  const value = useMemo<AppContextValue>(
    () => ({
      ...realtime,
      theme: "dark",
      sidePanel,
      openSidePanel,
      closeSidePanel,
      commandPaletteOpen,
      setCommandPaletteOpen,
      notificationDrawerOpen,
      setNotificationDrawerOpen,
    }),
    [realtime, sidePanel, openSidePanel, closeSidePanel, commandPaletteOpen, notificationDrawerOpen],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within an AppProvider");
  return ctx;
}
