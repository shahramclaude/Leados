// =============================================================================
// LEADOS kernel — capability registry (default-deny)
// =============================================================================
//
// The kernel will refuse to call anything not registered here. There is no
// "escape hatch" — act() in orchestrator.ts looks capabilities up exclusively
// through getCapability()/requireCapability() below.

import type { Capability } from "./types";

const registry = new Map<string, Capability<any>>();

export function registerCapability<T>(capability: Capability<T>): void {
  if (registry.has(capability.key)) {
    throw new Error(`Capability "${capability.key}" is already registered`);
  }
  registry.set(capability.key, capability as Capability<any>);
}

export function getCapability(key: string): Capability<any> | undefined {
  return registry.get(key);
}

export class UnregisteredCapabilityError extends Error {
  constructor(key: string) {
    super(`Capability "${key}" is not registered — default-deny, refusing to run.`);
    this.name = "UnregisteredCapabilityError";
  }
}

/** Throws UnregisteredCapabilityError for anything not explicitly registered. */
export function requireCapability(key: string): Capability<any> {
  const capability = registry.get(key);
  if (!capability) throw new UnregisteredCapabilityError(key);
  return capability;
}

export function listCapabilities(): Capability<any>[] {
  return Array.from(registry.values());
}

/** Test-only: clears the registry. Never call this from production code. */
export function __resetRegistryForTests(): void {
  registry.clear();
}
