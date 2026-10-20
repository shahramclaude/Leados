/**
 * eventLog.ts — in-memory stand-in for the real LEADOS `event_log` table
 * (`src/db/schema.ts` + `eventRepository.ts` in the Next.js/Postgres
 * repository at https://github.com/shahramclaude/Leados). This sandbox has
 * no reachable Postgres instance, so this module provides the identical
 * `EventEnvelope` append-only semantics in memory + `localStorage`
 * persistence for the browser session. Every module in this program that
 * needs to "record an audit event" (rule-weight changes, calibration runs,
 * drift alarms) appends here; swapping this for `eventRepository.append()`
 * in the real repository is a one-file change because domain code never
 * imports this module directly — only platform/app-layer code does.
 */

import type { EventEnvelope } from "../../domain/intelligence/types";

const STORAGE_KEY = "leados.intelligence.eventLog.v1";

type Listener = (event: EventEnvelope) => void;

class InMemoryEventLog {
  private events: EventEnvelope[] = [];
  private listeners: Set<Listener> = new Set();

  constructor() {
    this.hydrate();
  }

  private hydrate() {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.events = JSON.parse(raw) as EventEnvelope[];
    } catch {
      this.events = [];
    }
  }

  private persist() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.events.slice(-500)));
    } catch {
      // storage quota or privacy mode — in-memory history still works this session
    }
  }

  append<TPayload extends Record<string, unknown>>(
    eventType: string,
    payload: TPayload,
    actor = "system",
    eventVersion = "1",
  ): EventEnvelope<TPayload> {
    const event: EventEnvelope<TPayload> = {
      id: `evt_${this.events.length + 1}_${Math.random().toString(36).slice(2, 9)}`,
      eventType,
      eventVersion,
      payload,
      actor,
      createdAt: new Date().toISOString(),
    };
    this.events.push(event as EventEnvelope);
    this.persist();
    this.listeners.forEach((l) => l(event as EventEnvelope));
    return event;
  }

  list(eventType?: string): EventEnvelope[] {
    return eventType ? this.events.filter((e) => e.eventType === eventType) : [...this.events];
  }

  /** Subscribe to new events — used by `forecastCache.ts` to invalidate
   * caches on new evidence rather than on a timer (standing order F). */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clearForTests() {
    this.events = [];
  }
}

export const eventLog = new InMemoryEventLog();
export type { EventEnvelope };
