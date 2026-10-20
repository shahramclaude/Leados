// src/lib/narrativeIntel.ts
//
// Shared narrative-composition utilities: citation formatting, a stable
// line-diff (so synthesis reports and living-doc versions are diffable week
// over week / version over version), and the fixed section template that
// keeps the weekly synthesis structurally identical across weeks.
export interface Citation {
  marker: string; // e.g. "[R12]"
  sourceType: "retrospective" | "hypothesis" | "playbook_run" | "metric" | "entity";
  sourceId: number | string;
  label: string;
}

const MARKER_PREFIX: Record<Citation["sourceType"], string> = {
  retrospective: "R",
  hypothesis: "H",
  playbook_run: "P",
  metric: "M",
  entity: "E",
};

export function makeCitation(sourceType: Citation["sourceType"], sourceId: number | string, label: string): Citation {
  return { marker: `[${MARKER_PREFIX[sourceType]}${sourceId}]`, sourceType, sourceId, label };
}

export function renderCitationList(citations: Citation[]): string {
  if (citations.length === 0) return "";
  return ["", "---", "**Sources**", ...citations.map((c) => `${c.marker} ${c.label}`)].join("\n");
}

// Fixed section order so two consecutive weekly reports diff cleanly.
export const WEEKLY_SYNTHESIS_TEMPLATE = [
  "Highlights",
  "Decisions & Outcomes",
  "Hypotheses Resolved",
  "Playbooks Invoked",
  "Risks & Watch Items",
  "Metrics Snapshot",
] as const;
export type WeeklySynthesisSection = (typeof WEEKLY_SYNTHESIS_TEMPLATE)[number];

export interface NarrativeSection {
  heading: WeeklySynthesisSection;
  body: string;
}

/** Render sections in the fixed template order into one Markdown document, consistent tone (plain, declarative, past tense). */
export function renderNarrative(title: string, sections: NarrativeSection[], citations: Citation[]): string {
  const byHeading = new Map(sections.map((s) => [s.heading, s.body]));
  const body = WEEKLY_SYNTHESIS_TEMPLATE.map((heading) => {
    const content = byHeading.get(heading) ?? "_Nothing to report this period._";
    return `## ${heading}\n\n${content}`;
  }).join("\n\n");
  return `# ${title}\n\n${body}${renderCitationList(citations)}`;
}

export interface DiffLine {
  type: "same" | "added" | "removed";
  text: string;
}

/**
 * Line-based diff via longest-common-subsequence, sufficient for diffable
 * narrative/doc text (no external diff dependency required).
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ type: "removed", text: a[i] });
      i++;
    } else {
      result.push({ type: "added", text: b[j] });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: "removed", text: a[i] });
    i++;
  }
  while (j < m) {
    result.push({ type: "added", text: b[j] });
    j++;
  }
  return result;
}
