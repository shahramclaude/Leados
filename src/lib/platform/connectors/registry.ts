// src/lib/platform/connectors/registry.ts
//
// In-process connector registry (Part 16 extension seam). Future connectors
// register here; the rest of the platform (sync engine, import studio,
// quality engine) only ever talks to the `ConnectorDefinition` interface.
import type { ConnectorDefinition } from "./types";
import { csvConnector } from "./csvConnector";
import { hrisConnector } from "./hrisConnector";

const registry = new Map<string, ConnectorDefinition>();

export function registerConnector(def: ConnectorDefinition): void {
  registry.set(def.id, def);
}

export function getConnectorDefinition(id: string): ConnectorDefinition | undefined {
  return registry.get(id);
}

export function listConnectorDefinitions(): ConnectorDefinition[] {
  return Array.from(registry.values());
}

// Register the two reference connectors shipped in this part.
registerConnector(csvConnector);
registerConnector(hrisConnector);
