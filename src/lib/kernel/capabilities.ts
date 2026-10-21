// src/lib/kernel/capabilities.ts
//
// A capability is anything the kernel (automation) or a human can invoke by
// name with a JSON input, and which always produces an audited event. This
// is the seam mission §D requires: "playbooks ... invocable by humans and
// by Part 07's kernel as capabilities". The registry is intentionally tiny
// (in-memory Map) — Part 07 owns scheduling/triggering; this part only
// needs the invocation contract and the audit trail.
import { appendAuditEvent, type Actor } from "./events";

export type Capability<I = unknown, O = unknown> = {
  name: string;
  description: string;
  run: (input: I) => Promise<O>;
};

const registry = new Map<string, Capability<unknown, unknown>>();

export function registerCapability<I, O>(capability: Capability<I, O>): void {
  registry.set(capability.name, capability as Capability<unknown, unknown>);
}

export function listCapabilities(): { name: string; description: string }[] {
  return Array.from(registry.values()).map((c) => ({ name: c.name, description: c.description }));
}

export class CapabilityNotFoundError extends Error {
  constructor(name: string) {
    super(`Capability "${name}" is not registered`);
    this.name = "CapabilityNotFoundError";
  }
}

/** Invoke a registered capability. Always appends an audit event, success or failure, so nightly automation is traceable end to end. */
export async function invokeCapability<I = unknown, O = unknown>(
  name: string,
  input: I,
  actor: Actor
): Promise<O> {
  const capability = registry.get(name);
  if (!capability) throw new CapabilityNotFoundError(name);
  try {
    const output = await capability.run(input);
    await appendAuditEvent({
      type: `capability.${name}.succeeded`,
      actor,
      payload: { input: input as Record<string, unknown>, output: output as Record<string, unknown> },
    });
    return output as O;
  } catch (error) {
    await appendAuditEvent({
      type: `capability.${name}.failed`,
      actor,
      payload: { input: input as Record<string, unknown>, error: (error as Error).message },
    });
    throw error;
  }
}
