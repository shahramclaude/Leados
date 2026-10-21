// Capability registry — default deny.
//
// This Map is the ONLY place a capability name resolves to executable code.
// There is no API route, no orchestrator code path, and no eval()-style
// dispatch anywhere in the kernel that can invoke a capability by name
// without going through `requireCapability`, which throws
// `UnregisteredCapabilityError` for anything not explicitly registered here.
// This is what the mission means by "unregistered capabilities are
// impossible to invoke" — it is a structural property of this module, not a
// policy document (see `src/lib/kernel/__tests__/registry.test.ts`).
import type { Capability } from "./types";
import { UnregisteredCapabilityError } from "./types";

const registry = new Map<string, Capability<any, any>>();

export function registerCapability<I, O>(capability: Capability<I, O>): void {
  if (registry.has(capability.name)) {
    // Re-registration is allowed only with an identical shape reference to
    // support hot-reload in dev; in all other cases this would silently
    // change executable behavior, which is exactly what we refuse to do.
    return;
  }
  registry.set(capability.name, capability);
}

export function getCapability(name: string): Capability<any, any> | undefined {
  return registry.get(name);
}

export function requireCapability(name: string): Capability<any, any> {
  const cap = registry.get(name);
  if (!cap) throw new UnregisteredCapabilityError(name);
  return cap;
}

export function listCapabilities(): Capability<any, any>[] {
  return Array.from(registry.values());
}

/** Test-only escape hatch: clears the registry so capability tests are isolated. */
export function __resetRegistryForTests(): void {
  registry.clear();
}

export { UnregisteredCapabilityError };
