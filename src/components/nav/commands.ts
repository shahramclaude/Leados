export type Command = {
  id: string;
  title: string;
  keywords: string[];
  href: string;
  group: "Navigate" | "Create";
};

// Single source of truth for the command palette AND the module rail —
// adding a route here is the only step required to make it searchable.
export const COMMANDS: Command[] = [
  { id: "home", title: "Today", keywords: ["home", "dashboard", "overview"], href: "/", group: "Navigate" },
  { id: "decide", title: "Decision Cockpit", keywords: ["decide", "evpi", "mcda", "decision"], href: "/decide", group: "Navigate" },
  { id: "plan", title: "Plan — OKRs & Initiatives", keywords: ["plan", "okr", "objectives", "initiatives", "portfolio"], href: "/plan", group: "Navigate" },
  { id: "approvals", title: "Approval Queue", keywords: ["approvals", "approve", "workflow", "gate"], href: "/approvals", group: "Navigate" },
  { id: "knowledge", title: "Knowledge Search", keywords: ["knowledge", "search", "citations", "documents"], href: "/knowledge", group: "Navigate" },
  { id: "audit", title: "Audit Trail", keywords: ["audit", "governance", "log", "hash chain"], href: "/audit", group: "Navigate" },
  { id: "new-decision", title: "New decision", keywords: ["create", "new", "decision"], href: "/decide?new=1", group: "Create" },
];

/** Subsequence fuzzy score: consecutive and boundary matches score higher. */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 1;
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      consecutive += 1;
      score += 1 + consecutive * 0.5;
      if (ti === 0 || t[ti - 1] === " ") score += 2;
      qi += 1;
    } else {
      consecutive = 0;
    }
  }
  return qi === q.length ? score : 0;
}
