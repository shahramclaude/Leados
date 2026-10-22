// =============================================================================
// LEADOS — Part 11: prompt-injection taint tracking
// =============================================================================
// Content that originates from imports, webhooks, notes, or any other
// user/third-party-controlled source is ALWAYS wrapped as `Tainted<T>`. The
// grounded generation pipeline enforces structured separation:
//
//   SYSTEM channel   (trusted, fixed instructions)   -> can instruct
//   GROUNDING channel (trusted, deterministic facts) -> can instruct nothing,
//                                                        but is authoritative data
//   RETRIEVED channel (untrusted, free text)          -> DATA ONLY, never
//                                                        interpreted as instructions
//
// Defense in depth:
//   1. Structural separation — untrusted text is placed in a fenced, labeled
//      block and the system prompt explicitly tells the model (when a real
//      LLM is used) to treat it as inert data.
//   2. Pattern-based pre-filter — strips/flags imperative instruction-like
//      sentences embedded in untrusted content before it ever reaches a model.
//   3. Output filter — scans generated text/tool-call requests for evidence
//      that injected instructions were followed (e.g. a tool call whose
//      parameters trace back to untrusted text, or secrets/other-tenant data
//      leaking out) and blocks the response if so.
//   4. Secret redaction — applied to everything written to logs.
// =============================================================================

export interface Tainted<T> {
  value: T;
  trust: "untrusted";
  source: "document" | "tool_result" | "user_query" | "webhook";
}

export function taint<T>(value: T, source: Tainted<T>["source"]): Tainted<T> {
  return { value, trust: "untrusted", source };
}

export interface InjectionScanResult {
  suspicious: boolean;
  patterns: string[];
  sanitizedText: string;
}

// A deliberately broad set of instruction-smuggling signatures. These are
// checked against any untrusted text BEFORE it is placed in a prompt, and
// again against the final output to catch "instruction compliance" leakage.
const INJECTION_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "role_override", re: /ignore (all|any|previous|the) (instructions|rules|prompt)/i },
  { name: "role_override_2", re: /you are now|from now on you (are|will)|act as (system|admin|root)/i },
  { name: "system_prompt_leak", re: /reveal (your|the) (system prompt|instructions|prompt)/i },
  { name: "tool_smuggle", re: /call (the )?tool|invoke (the )?function|execute\s*\(|run_tool|<tool_call>/i },
  { name: "cross_tenant", re: /other (user|customer|tenant|org|company)'s? (data|budget|secret|key)/i },
  { name: "exfiltration", re: /send (this|the data|everything) to https?:\/\//i },
  { name: "secret_request", re: /\b(api[_ -]?key|password|secret|token|credential)s?\b.{0,20}\b(is|are|:)\b/i },
  { name: "markdown_instruction", re: /^\s*(system:|assistant:|developer:)/im },
  { name: "delimiter_break", re: /```[\s\S]*?(ignore|disregard|override)[\s\S]*?```/i },
  { name: "unicode_smuggle", re: /[\u202e\u2066-\u2069]/ }, // bidi override / isolate control chars
];

export interface StripResult {
  clean: string;
  removedCount: number;
  removedPatterns: string[];
}

/**
 * Removes (rather than just flags) sentence-level spans that match an
 * injection signature, replacing each with a short neutral marker. This is
 * applied to any untrusted text BEFORE it is quoted back to an end user
 * (e.g. Ask-LEADOS "doc_quote" claims) or indexed for retrieval — so an
 * attacker's phrasing can neither (a) be lexically matched by a crafted query
 * ("retrieval echo"), nor (b) be parroted back verbatim in a citation, which
 * would look like compliance even when the pipeline never "obeyed" it.
 * Legitimate factual sentences in the same document are preserved untouched.
 */
export function stripInjectionContent(text: string): StripResult {
  const sentences = text.split(/(?<=[.!?])\s+|\n{1,}/).filter((s) => s.length > 0);
  const removedPatterns: string[] = [];
  const kept: string[] = [];
  for (const sentence of sentences) {
    const hit = INJECTION_PATTERNS.find((p) => p.re.test(sentence));
    if (hit) {
      removedPatterns.push(hit.name);
      kept.push("[instruction-like content removed for safety]");
    } else {
      kept.push(sentence);
    }
  }
  return { clean: kept.join(" ").replace(/\s+/g, " ").trim(), removedCount: removedPatterns.length, removedPatterns };
}

export function scanForInjection(text: string): InjectionScanResult {
  const patterns: string[] = [];
  for (const p of INJECTION_PATTERNS) {
    if (p.re.test(text)) patterns.push(p.name);
  }
  // Sanitization: neutralize imperative instruction sentences by wrapping them
  // so a model (if used) renders them as quoted data rather than directives.
  // We do NOT delete content (that would hide evidence from legitimate
  // retrieval, e.g. "vendor says 'ignore the contract'" might be a real,
  // citable fact) — instead we fence it unmistakably as inert data.
  const sanitizedText = text.length > 0 ? `<<<UNTRUSTED_DATA_START>>>\n${text}\n<<<UNTRUSTED_DATA_END>>>` : text;
  return { suspicious: patterns.length > 0, patterns, sanitizedText };
}

/**
 * Output-side filter: re-checks the model's final text and any proposed tool
 * calls for signs that injected instructions were obeyed. Returns a list of
 * violation reasons (empty = clean).
 */
export function scanOutputForLeakage(output: {
  text: string;
  proposedToolCalls?: Array<{ name: string; input: unknown }>;
  requestingUserId: number | null;
  requestingOrgId: number;
}): string[] {
  const reasons: string[] = [];
  for (const p of INJECTION_PATTERNS) {
    if (p.re.test(output.text)) reasons.push(`output_contains_pattern:${p.name}`);
  }
  if (output.proposedToolCalls) {
    for (const call of output.proposedToolCalls) {
      const serialized = JSON.stringify(call.input ?? {});
      if (/org_?id["':\s]*\d+/i.test(serialized)) {
        const match = serialized.match(/org_?id["':\s]*(\d+)/i);
        if (match && Number(match[1]) !== output.requestingOrgId) {
          reasons.push(`tool_call_cross_org_attempt:${call.name}`);
        }
      }
    }
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Secret redaction for logs
// ---------------------------------------------------------------------------

const SECRET_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{10,}/g, // OpenAI-style keys
  /api[_-]?key["'\s:=]+[a-zA-Z0-9_\-]{12,}/gi,
  /password["'\s:=]+\S+/gi,
  /Bearer\s+[a-zA-Z0-9._\-]{10,}/g,
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN-like
  /\b(?:\d[ -]*?){13,16}\b/g, // credit-card-like digit runs
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}

export function redactForAudit(text: string, maxLen = 400): string {
  const redacted = redactSecrets(text);
  return redacted.length > maxLen ? `${redacted.slice(0, maxLen)}…` : redacted;
}
