// Small, dependency-free id helper shared by the whole kernel.
// Uses crypto.randomUUID (Node >=16.7 / edge runtime both support it) so we
// avoid adding a ulid dependency for a 21-part program that already has a
// tight dependency budget.
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function todayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}
