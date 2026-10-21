"use client";

// ---------------------------------------------------------------------------
// Command pattern for every mutation: { do, undo, label }. Commands are
// stacked for a global undo/redo (Cmd+Z / Cmd+Shift+Z) capped at 50 entries.
// `undo` must be a real compensating call, not a UI-only rollback — see
// AI-SESSION-LOG.md / Phase 5 for the one command where this is a partial lie
// (approval decisions cannot be "un-decided" server-side, only reverted to
// pending, which is disclosed in the command label).
// ---------------------------------------------------------------------------

export interface Command {
  id: string;
  label: string;
  do: () => Promise<void>;
  undo: () => Promise<void>;
  /** Set to true when undo is a compensating approximation, not a true inverse. */
  undoIsApproximate?: boolean;
}

type Listener = () => void;

const MAX_STACK = 50;

function notifyFailure(message: string) {
  if (typeof window === "undefined") return;
  import("./toastStore").then(({ toastStore }) => toastStore.push(message, "error"));
}

class CommandStack {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private listeners = new Set<Listener>();
  private busy = false;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    for (const l of this.listeners) l();
  }

  getSnapshot = () => ({
    canUndo: this.undoStack.length > 0,
    canRedo: this.redoStack.length > 0,
    undoLabel: this.undoStack.at(-1)?.label,
    redoLabel: this.redoStack.at(-1)?.label,
    busy: this.busy,
    history: [...this.undoStack].reverse().map((c) => ({ id: c.id, label: c.label })),
  });

  async run(command: Command) {
    this.busy = true;
    this.emit();
    try {
      await command.do();
      this.undoStack.push(command);
      if (this.undoStack.length > MAX_STACK) this.undoStack.shift();
      this.redoStack = [];
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  async undo() {
    const command = this.undoStack.pop();
    if (!command) return;
    this.busy = true;
    this.emit();
    try {
      await command.undo();
      this.redoStack.push(command);
      if (command.undoIsApproximate) {
        notifyFailure(`Undid "${command.label}" — this is a compensating change, not a true reversal.`);
      }
    } catch (err) {
      this.undoStack.push(command);
      notifyFailure(
        navigator.onLine === false
          ? `Can't undo "${command.label}" while offline. It will stay available to undo once you're back online.`
          : `Undo failed for "${command.label}". Nothing changed.`,
      );
      throw err;
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  async redo() {
    const command = this.redoStack.pop();
    if (!command) return;
    this.busy = true;
    this.emit();
    try {
      await command.do();
      this.undoStack.push(command);
    } finally {
      this.busy = false;
      this.emit();
    }
  }
}

export const globalCommandStack = new CommandStack();
