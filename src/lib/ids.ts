import { randomUUID } from "crypto";

/** Generates a short, prefixed, collision-resistant id for a domain object. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
