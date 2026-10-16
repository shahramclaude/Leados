// Undo System — pt-D brief §"Undo System".
// Only the last event, only within 60 seconds, implemented as a plain
// removal from the in-memory/localStorage events array. Never available for
// settings, imports, or purges (none of which this demo exposes as undoable
// call sites in the first place).

export const UNDO_WINDOW_MS = 60000;

export interface UndoableToast {
  eventId: string;
  eventType: string;
  summary: string;
  expiresAt: number;
}

export function canUndo(loggedAt: number, now: number): boolean {
  return now - loggedAt < UNDO_WINDOW_MS;
}
