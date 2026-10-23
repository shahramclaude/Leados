// Red-team fix (R-003): crypto.randomUUID() is unavailable in non-secure
// contexts (plain http://) and in older browsers/webviews. Using it
// unguarded would throw and crash the Conversation module's send handler.
// This wrapper falls back to a non-cryptographic but sufficiently-unique id
// for a client-only demo (never used for security-sensitive purposes).
export function safeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through to fallback
    }
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
