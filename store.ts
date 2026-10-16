import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuditEntry, LeadEvent, Store } from "./types";
import { freshStore, STORAGE_KEY } from "./seed";
import { runMaintenance } from "./maintenance";
import type { EventSpec } from "./templates";
import { UNDO_WINDOW_MS, type UndoableToast } from "./undo";

function load(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      if (parsed && Array.isArray(parsed.events)) return parsed;
    }
  } catch {
    /* fall through to fresh seed */
  }
  return freshStore();
}

function save(store: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable — demo continues in-memory only */
  }
}

let auditIdSeq = 0;
function nextAuditId() {
  auditIdSeq += 1;
  return "aud-" + Date.now().toString(36) + "-" + auditIdSeq;
}

export function useLeadosStore() {
  const [store, setStore] = useState<Store>(() => load());
  const [toast, setToast] = useState<UndoableToast | null>(null);
  const maintenanceRan = useRef(false);

  useEffect(() => {
    save(store);
  }, [store]);

  // Auto-maintenance: once per session, never on every render (per brief).
  useEffect(() => {
    if (maintenanceRan.current) return;
    maintenanceRan.current = true;
    runMaintenanceOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appendMany = useCallback((specs: EventSpec[], source: string): LeadEvent[] => {
    let created: LeadEvent[] = [];
    setStore((prev) => {
      let seq = prev.idSeq;
      const now = Date.now();
      const newEvents = specs.map((s, i) => {
        seq += 1;
        return { id: "e-" + String(seq).padStart(5, "0"), seq, at: now + i, type: s.type, payload: s.payload } as LeadEvent;
      });
      created = newEvents;
      const auditEntry: AuditEntry = {
        id: nextAuditId(),
        at: now,
        action: "user",
        message: `${source}: logged ${newEvents.length} event(s) — ${newEvents.map((e) => e.type).join(", ")}.`,
      };
      return { ...prev, idSeq: seq, events: [...prev.events, ...newEvents], audit: [...prev.audit, auditEntry] };
    });
    return created;
  }, []);

  const append = useCallback(
    (type: string, payload: Record<string, unknown>, source: string) => appendMany([{ type, payload }], source),
    [appendMany]
  );

  const logWithUndo = useCallback(
    (type: string, payload: Record<string, unknown>, source: string, summary: string) => {
      const created = append(type, payload, source);
      const last = created[created.length - 1];
      if (last) {
        setToast({ eventId: last.id, eventType: last.type, summary, expiresAt: Date.now() + UNDO_WINDOW_MS });
      }
      return created;
    },
    [append]
  );

  const logBundle = useCallback(
    (specs: EventSpec[], source: string, summary: string) => {
      const created = appendMany(specs, source);
      const last = created[created.length - 1];
      if (last) {
        setToast({ eventId: last.id, eventType: last.type, summary, expiresAt: Date.now() + UNDO_WINDOW_MS });
      }
      return created;
    },
    [appendMany]
  );

  const undoLast = useCallback(() => {
    setStore((prev) => {
      if (prev.events.length === 0) return prev;
      const last = prev.events[prev.events.length - 1];
      const auditEntry: AuditEntry = {
        id: nextAuditId(),
        at: Date.now(),
        action: "event.undone",
        message: `event.undone: ${last.type} ${last.id} within 60s window.`,
      };
      return { ...prev, events: prev.events.slice(0, -1), audit: [...prev.audit, auditEntry] };
    });
    setToast(null);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const recordExport = useCallback(() => {
    setStore((prev) => ({
      ...prev,
      audit: [...prev.audit, { id: nextAuditId(), at: Date.now(), action: "export", message: "Data exported to JSON (manual backup)." }],
    }));
  }, []);

  const runMaintenanceOnce = useCallback(() => {
    setStore((prev) => {
      const report = runMaintenance(prev, Date.now());
      if (report.entries.length === 0) return prev;
      return { ...prev, audit: [...prev.audit, ...report.entries], maintenanceRanAt: Date.now() };
    });
  }, []);

  const clearStaleSuppressions = useCallback(() => {
    setStore((prev) => {
      const remaining = prev.suppressed.filter((s) => s.entityAlive);
      const removed = prev.suppressed.length - remaining.length;
      if (removed === 0) return prev;
      return {
        ...prev,
        suppressed: remaining,
        audit: [
          ...prev.audit,
          { id: nextAuditId(), at: Date.now(), action: "suppression.cleared", message: `Removed ${removed} stale suppression(s) on explicit user confirmation.` },
        ],
      };
    });
  }, []);

  const resetDemo = useCallback(() => {
    const fresh = freshStore();
    setStore(fresh);
    maintenanceRan.current = false;
    setToast(null);
  }, []);

  const simulateImport = useCallback((peopleToAdd: { id: string; name: string; role: string }[], eventsToAdd: { type: string; payload: Record<string, unknown> }[]) => {
    let before: Store | null = null;
    let after: Store | null = null;
    setStore((prev) => {
      before = prev;
      let seq = prev.idSeq;
      const now = Date.now();
      const newEvents = eventsToAdd.map((s, i) => {
        seq += 1;
        return { id: "e-" + String(seq).padStart(5, "0"), seq, at: now - (eventsToAdd.length - i) * 86400000, type: s.type, payload: s.payload } as LeadEvent;
      });
      const next: Store = {
        ...prev,
        idSeq: seq,
        people: [...prev.people, ...peopleToAdd.map((p) => ({ ...p, cadenceDays: 14 }))],
        events: [...prev.events, ...newEvents],
        audit: [...prev.audit, { id: nextAuditId(), at: now, action: "import", message: `Imported ${peopleToAdd.length} people and ${newEvents.length} events (simulated).` }],
      };
      after = next;
      return next;
    });
    return { before: before as unknown as Store, after: after as unknown as Store };
  }, []);

  const api = useMemo(
    () => ({
      store,
      append,
      appendMany,
      logWithUndo,
      logBundle,
      undoLast,
      toast,
      dismissToast,
      recordExport,
      runMaintenanceOnce,
      clearStaleSuppressions,
      resetDemo,
      simulateImport,
    }),
    [store, append, appendMany, logWithUndo, logBundle, undoLast, toast, dismissToast, recordExport, runMaintenanceOnce, clearStaleSuppressions, resetDemo, simulateImport]
  );

  return api;
}
