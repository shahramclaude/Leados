"use client";

// ---------------------------------------------------------------------------
// ONE normalized client store for server entities (objectives, findings,
// approvals), each entry wrapped in AsyncState<T>. Phase 0 found the same
// objective duplicated in up to 3 places (list cache, detail cache, realtime
// buffer) which is exactly what caused optimistic/UI divergence bugs. Every
// hook below reads/writes this single map instead of local component state.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from "react";
import type { AsyncState } from "./asyncState";

export interface ObjectiveDTO {
  id: string;
  scenarioId: string;
  title: string;
  description: string;
  status: "draft" | "active" | "at_risk" | "done";
  ownerName: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FindingDTO {
  id: string;
  objectiveId: string;
  title: string;
  body: string;
  confidence: "low" | "medium" | "high";
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalDTO {
  id: string;
  objectiveId: string;
  status: "pending" | "approved" | "rejected" | "changes_requested";
  requestedByName: string;
  decidedByName: string | null;
  note: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntryDTO {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorName: string;
  summary: string;
  createdAt: string;
}

interface EntityMaps {
  objectives: Map<string, AsyncState<ObjectiveDTO>>;
  findings: Map<string, AsyncState<FindingDTO>>;
  approvals: Map<string, AsyncState<ApprovalDTO>>;
}

type EntityKind = keyof EntityMaps;
type Listener = () => void;

class EntityStore {
  private maps: EntityMaps = {
    objectives: new Map(),
    findings: new Map(),
    approvals: new Map(),
  };
  private listeners = new Set<Listener>();
  private version = 0;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = () => this.version;

  private emit() {
    this.version += 1;
    for (const l of this.listeners) l();
  }

  put<K extends EntityKind>(kind: K, id: string, state: EntityMaps[K] extends Map<string, infer V> ? V : never) {
    const map = this.maps[kind] as Map<string, unknown>;
    map.set(id, state);
    this.emit();
  }

  get<K extends EntityKind>(kind: K, id: string) {
    return this.maps[kind].get(id) as EntityMaps[K] extends Map<string, infer V> ? V | undefined : never;
  }

  all<K extends EntityKind>(kind: K) {
    return this.maps[kind] as EntityMaps[K];
  }

  remove(kind: EntityKind, id: string) {
    (this.maps[kind] as Map<string, unknown>).delete(id);
    this.emit();
  }
}

export const entityStore = new EntityStore();

/** Batches many `put` calls fired within the same animation frame into one notify. */
export function createRafBatcher(flush: () => void) {
  let scheduled = false;
  return function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      flush();
    });
  };
}

export function useEntityStoreVersion() {
  return useSyncExternalStore(entityStore.subscribe, entityStore.getVersion, () => 0);
}
