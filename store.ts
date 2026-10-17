import type { LeadosEvent } from "./types";

/**
 * LEADOS.store — append-only event log in one localStorage key.
 *
 * DISCLOSURE: the real repo's store.js (verified raw-fetch this session)
 * uses KEY='leados:data', schemaVersion 5, and a migration ladder (v1→v5).
 * This sandbox is a fresh schema (v1) with its own, deliberately distinct
 * key so it can never collide with that repo's key or with any prior
 * pt-letter demo key on the same origin. No migration ladder is
 * implemented here — disclosed scope cut, not a hidden omission.
 */

export const STORAGE_KEY = "leados-orgphysics-sandbox:data";
export const SCHEMA_VERSION = 1;

interface RawStore {
  schemaVersion: number;
  meta: { createdAt: string };
  events: LeadosEvent[];
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return "e-" + String(Date.now()).slice(-6) + "-" + String(seq).padStart(4, "0");
}

function readRaw(key: string): RawStore | null {
  const text = localStorage.getItem(key);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // The wall does not silently rewrite a corrupt store — it refuses.
    throw new Error("LEADOS: store at " + key + " is corrupt and was left untouched.");
  }
}

function writeRaw(key: string, raw: RawStore) {
  localStorage.setItem(key, JSON.stringify(raw));
}

function genesis(): RawStore {
  return { schemaVersion: SCHEMA_VERSION, meta: { createdAt: new Date().toISOString() }, events: [] };
}

export function load(key: string = STORAGE_KEY): LeadosEvent[] {
  let raw = readRaw(key);
  if (!raw) {
    raw = genesis();
    writeRaw(key, raw);
  }
  return raw.events;
}

/** The only public write path for "now" events — always stamps real time. */
export function append(type: string, data: any, meta?: Record<string, any>, key: string = STORAGE_KEY): LeadosEvent {
  const raw = readRaw(key) || genesis();
  const ev: LeadosEvent = { id: nextId(), ts: new Date().toISOString(), type, data, meta };
  raw.events.push(ev);
  writeRaw(key, raw);
  return ev;
}

/**
 * Seed-only backdating path. Every event produced here is marked
 * meta.seeded = true so the Health suite (T6) and the Data view can prove
 * no ordinary append path can silently rewrite history.
 */
export function appendAt(type: string, data: any, ts: string, key: string = STORAGE_KEY): LeadosEvent {
  const raw = readRaw(key) || genesis();
  const ev: LeadosEvent = { id: nextId(), ts, type, data, meta: { seeded: true } };
  raw.events.push(ev);
  writeRaw(key, raw);
  return ev;
}

export function reset(key: string = STORAGE_KEY) {
  localStorage.removeItem(key);
}

export function hasData(key: string = STORAGE_KEY): boolean {
  const raw = readRaw(key);
  return !!raw && raw.events.length > 0;
}

export function rawBytes(key: string = STORAGE_KEY): number {
  const t = localStorage.getItem(key);
  return t ? t.length : 0;
}
