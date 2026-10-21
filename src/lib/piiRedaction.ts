// Section F: PII redaction before egress, where the task allows it.
//
// Policy: tasks that reason *about* a named person as a LEADOS entity
// (e.g. synthesis referencing "the deal owner") require the raw name because
// the name IS the fact being reasoned about — redacting it would make the
// output useless and wouldn't improve privacy (the name already lives in
// the entities table and is shown in the UI to authorized users). Tasks
// that ingest arbitrary freeform text from outside LEADOS (classify.ts
// capture — notes/emails that may contain personal emails, phone numbers,
// card-like numbers pasted by mistake, etc.) DO get redacted before the
// text is sent to the model provider, because that raw text has not been
// vetted as organizational data yet.
//
// Declared per task in the prompt registry via `allowsRawData`.

const PATTERNS: { label: string; re: RegExp }[] = [
  { label: "EMAIL", re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { label: "PHONE", re: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  { label: "SSN", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { label: "CREDIT_CARD", re: /\b(?:\d[ -]*?){13,16}\b/g },
  { label: "IP_ADDRESS", re: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
];

export type RedactionResult = {
  redactedText: string;
  redactionCount: number;
  labelsFound: string[];
};

export function redactPii(text: string): RedactionResult {
  let redactedText = text;
  let redactionCount = 0;
  const labelsFound = new Set<string>();

  for (const { label, re } of PATTERNS) {
    redactedText = redactedText.replace(re, (match) => {
      redactionCount += 1;
      labelsFound.add(label);
      return `[REDACTED_${label}]`;
    });
  }

  return { redactedText, redactionCount, labelsFound: Array.from(labelsFound) };
}
