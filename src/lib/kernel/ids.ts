// src/lib/kernel/ids.ts
//
// Minimal, dependency-free id helper for the kernel audit seam. Part 07's
// real kernel (as read from the upstream checkout, see AI-SESSION-LOG.md)
// uses a `newId(prefix)` convention for correlation ids — reproduced here
// so audit events this part writes are shaped consistently with that
// seam, without depending on files outside this part's mandate.
let counter = 0;

export function newId(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}
