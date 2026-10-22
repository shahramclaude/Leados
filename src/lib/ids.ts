// Minimal, dependency-free id helper. Same convention observed upstream in
// `src/lib/kernel/ids.ts` (Part 07) — reproduced here so ids minted by the
// cadence engine are shaped consistently with that seam, without pulling in
// the (currently non-buildable, see schema.ts header note) kernel module.
let counter = 0;

export function newId(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}
