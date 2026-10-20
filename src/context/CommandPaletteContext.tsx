"use client";

// Cross-cutting context #3: command-palette open/close + a flat command
// registry. Panels register commands (e.g. "Create finding") without the
// palette itself knowing anything about findings/notifications/etc.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  commands: PaletteCommand[];
  register: (command: PaletteCommand) => () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [commands, setCommands] = useState<PaletteCommand[]>([]);

  const register = useCallback((command: PaletteCommand) => {
    setCommands((prev) => [...prev.filter((c) => c.id !== command.id), command]);
    return () => setCommands((prev) => prev.filter((c) => c.id !== command.id));
  }, []);

  const value = useMemo(() => ({ open, setOpen, commands, register }), [open, commands, register]);
  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>;
}

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used within a CommandPaletteProvider");
  return ctx;
}
