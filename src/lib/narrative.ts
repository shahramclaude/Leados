// Part 08 stand-in: "narrative polish" layer. Deterministic templating only —
// no model call, no randomness — because the board pack must be byte-for-byte
// reproducible for identical inputs (acceptance gate #2). This is "structured
// core + polish" in the sense that it turns structured facts into readable
// prose using fixed sentence templates, never inventing a fact that wasn't
// passed in.

export type NarrativeFact = {
  label: string;
  value: string;
  tone: "good" | "bad" | "neutral";
};

export function polishSummary(facts: NarrativeFact[]): string {
  if (facts.length === 0) return "No material facts available for this period.";
  const good = facts.filter((f) => f.tone === "good");
  const bad = facts.filter((f) => f.tone === "bad");
  const neutral = facts.filter((f) => f.tone === "neutral");

  const parts: string[] = [];
  if (good.length) {
    parts.push(`On track: ${good.map((f) => `${f.label} (${f.value})`).join("; ")}.`);
  }
  if (bad.length) {
    parts.push(`Needs attention: ${bad.map((f) => `${f.label} (${f.value})`).join("; ")}.`);
  }
  if (neutral.length) {
    parts.push(`For context: ${neutral.map((f) => `${f.label} (${f.value})`).join("; ")}.`);
  }
  return parts.join(" ");
}

export function polishList(items: string[], emptyText: string): string {
  if (items.length === 0) return emptyText;
  return items.map((i, idx) => `${idx + 1}. ${i}`).join("\n");
}
