// ---------------------------------------------------------------------------
// Single source of truth for every keyboard shortcut in the app. The "?"
// overlay renders this list; CommandPalette actions reference the same ids;
// nothing is bound twice in two different places.
// ---------------------------------------------------------------------------

export interface ShortcutDef {
  id: string;
  keys: string; // display string, e.g. "⌘K"
  description: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: "command-palette", keys: "⌘K / Ctrl+K", description: "Open command palette" },
  { id: "shortcuts-overlay", keys: "?", description: "Show keyboard shortcuts" },
  { id: "undo", keys: "⌘Z / Ctrl+Z", description: "Undo last action" },
  { id: "redo", keys: "⌘⇧Z / Ctrl+Shift+Z", description: "Redo last undone action" },
  { id: "new-objective", keys: "G then O", description: "Go to Objectives, then N to create one" },
  { id: "new-objective-create", keys: "N", description: "Create new objective (on Objectives page)" },
  { id: "go-dashboard", keys: "G then D", description: "Go to Dashboard" },
  { id: "go-approvals", keys: "G then A", description: "Go to Approvals" },
  { id: "close-panel", keys: "Esc", description: "Close dialog, palette, or panel" },
  { id: "sync-drawer", keys: "⌘⇧S / Ctrl+Shift+S", description: "Open sync drawer" },
];
