"use client";

// Tiny external store for shell-level UI toggles (palette, shortcuts, sync drawer).
// Kept separate from entityStore so UI chrome re-renders never touch entity data.

import { useSyncExternalStore } from "react";

interface UiState {
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  syncDrawerOpen: boolean;
}

type Listener = () => void;

class UiStore {
  private state: UiState = { paletteOpen: false, shortcutsOpen: false, syncDrawerOpen: false };
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  private set(patch: Partial<UiState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  togglePalette(open?: boolean) {
    this.set({ paletteOpen: open ?? !this.state.paletteOpen, shortcutsOpen: false });
  }
  toggleShortcuts(open?: boolean) {
    this.set({ shortcutsOpen: open ?? !this.state.shortcutsOpen, paletteOpen: false });
  }
  toggleSyncDrawer(open?: boolean) {
    this.set({ syncDrawerOpen: open ?? !this.state.syncDrawerOpen });
  }
  closeAll() {
    this.set({ paletteOpen: false, shortcutsOpen: false, syncDrawerOpen: false });
  }
}

export const uiStore = new UiStore();

export function useUiStore() {
  return useSyncExternalStore(uiStore.subscribe, uiStore.getSnapshot, uiStore.getSnapshot);
}
