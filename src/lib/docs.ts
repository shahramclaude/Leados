// js/docs.js (requested module) -> src/lib/docs.ts.
// Generates a Markdown export of the current session (findings, protocols,
// incidents) so a user can paste it into real documentation. Pure string
// building — no network calls, no external doc service.

import type { AppState, Finding } from "./types";
import { getProtocol } from "./protocol";
import { RULES } from "./rules";

export function exportMarkdown(state: AppState, findings: Finding[]): string {
  const lines: string[] = [];
  lines.push(`# Leados session export`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Runway: ${state.runwayMonths} months`);
  lines.push("");
  lines.push(`## Active findings (${findings.length})`);
  if (findings.length === 0) lines.push("- None.");
  for (const f of findings) {
    lines.push(`### ${f.title} [${f.severity.toUpperCase()}]`);
    lines.push(f.narrative);
    if (f.ruleIds.length > 0) lines.push(`Rules: ${f.ruleIds.join(", ")}`);
    const protocol = getProtocol(f.category, f.severity);
    if (protocol.length > 0) {
      lines.push("Protocol:");
      for (const step of protocol) lines.push(`${step.order}. (${step.owner}) ${step.action}`);
    }
    lines.push("");
  }
  lines.push(`## Incident log (${state.incidents.length})`);
  for (const inc of state.incidents) {
    lines.push(`- ${new Date(inc.at).toISOString()} — ${inc.category} [${inc.severity}] — ${inc.note}`);
  }
  lines.push("");
  lines.push(`## Catalog size`);
  lines.push(`${RULES.length} rules across ${new Set(RULES.map((r) => r.category)).size} categories.`);
  return lines.join("\n");
}

export function exportJSON(state: AppState, findings: Finding[]): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), state, findings }, null, 2);
}

export function downloadTextFile(filename: string, content: string, mime = "text/markdown") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
