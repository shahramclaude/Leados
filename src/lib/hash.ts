/** Deterministic FNV-1a string hash — used only to derive a default Monte
 * Carlo seed from an id when the caller doesn't supply one explicitly. This
 * is not a source of randomness (no entropy), just a pure deterministic
 * mapping, so it is safe to use outside the Prng abstraction.
 */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
