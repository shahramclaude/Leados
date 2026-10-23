// Small shared id helper so every module creates ids the same way.
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
