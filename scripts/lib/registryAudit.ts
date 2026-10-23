// LEADOS — Part 56: registry completeness audit core logic.
// Shared by scripts/check-registry-completeness.ts (CI gate) and
// scripts/test-registry-completeness.ts (tests the audit itself against a
// seeded unregistered-module fixture — Phase 4 gate 1).
import fs from "node:fs";
import path from "node:path";
import type { AlgoSystemDefinition } from "../../src/lib/accountability/types";

// Naming convention: a file under an intelligence directory whose name ends
// in one of these suffixes is presumed to be an algorithmic system.
const NAME_PATTERN = /(Scoring|Recommender|Predictor|Flagger|Scorer)\.ts$/;

// Import-pattern convention: an exported function using one of these verbs
// is presumed to produce a score/prediction/recommendation/automated flag,
// even if the filename doesn't match the naming convention above.
const VERB_PATTERN = /export\s+function\s+(score|predict|recommend|flag|rank|prioritize)[A-Z]\w*/;

const SYSTEM_ID_PATTERN = /export\s+const\s+SYSTEM_ID\s*=\s*"([^"]+)"/;

export interface DiscoveredModule {
  filePath: string;
  systemId: string | null;
  matchedBy: string[];
}

export interface AuditIssue {
  code:
    | "missing-system-id"
    | "unregistered-module"
    | "stale-registry-entry"
    | "registry-id-mismatch";
  message: string;
}

export interface AuditReport {
  discovered: DiscoveredModule[];
  issues: AuditIssue[];
  ok: boolean;
  coveragePct: number;
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__fixtures__") continue; // fixtures are included explicitly by the test, not by default scans
      out.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

export function discoverIntelligenceModules(dirs: string[]): DiscoveredModule[] {
  const files = dirs.flatMap((d) => walk(d));
  const discovered: DiscoveredModule[] = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const matchedBy: string[] = [];
    if (NAME_PATTERN.test(path.basename(filePath))) matchedBy.push("naming-convention");
    if (VERB_PATTERN.test(content)) matchedBy.push("import-pattern(verb)");
    if (matchedBy.length === 0) continue;

    const idMatch = content.match(SYSTEM_ID_PATTERN);
    discovered.push({ filePath, systemId: idMatch ? idMatch[1] : null, matchedBy });
  }

  return discovered;
}

export interface AuditOptions {
  /** Directories to scan for intelligence modules (naming/import-pattern lint). */
  dirs: string[];
  /** Canonical registry to check against. */
  registry: AlgoSystemDefinition[];
  /** Project root used to resolve each registry entry's declared sourceModule. */
  projectRoot: string;
  /** Skip the "stale registry entry" direction (used by fixture-only tests
   * that intentionally don't want to re-validate the real registry). */
  skipStaleCheck?: boolean;
}

export function auditRegistry(opts: AuditOptions): AuditReport {
  const discovered = discoverIntelligenceModules(opts.dirs);
  const issues: AuditIssue[] = [];
  const registryIds = new Set(opts.registry.map((r) => r.id));

  for (const mod of discovered) {
    if (!mod.systemId) {
      issues.push({
        code: "missing-system-id",
        message: `${mod.filePath} looks like an algorithmic module (matched: ${mod.matchedBy.join(", ")}) but does not export SYSTEM_ID.`,
      });
      continue;
    }
    if (!registryIds.has(mod.systemId)) {
      issues.push({
        code: "unregistered-module",
        message: `${mod.filePath} exports SYSTEM_ID "${mod.systemId}" which has no corresponding registry entry in src/lib/accountability/registry.ts.`,
      });
    }
  }

  if (!opts.skipStaleCheck) {
    for (const def of opts.registry) {
      const fullPath = path.join(opts.projectRoot, def.sourceModule);
      if (!fs.existsSync(fullPath)) {
        issues.push({
          code: "stale-registry-entry",
          message: `Registry entry "${def.id}" declares sourceModule "${def.sourceModule}" which does not exist.`,
        });
        continue;
      }
      const content = fs.readFileSync(fullPath, "utf8");
      const idMatch = content.match(SYSTEM_ID_PATTERN);
      if (!idMatch || idMatch[1] !== def.id) {
        issues.push({
          code: "registry-id-mismatch",
          message: `Registry entry "${def.id}" sourceModule "${def.sourceModule}" exports SYSTEM_ID "${
            idMatch ? idMatch[1] : "(none)"
          }", which does not match.`,
        });
      }
    }
  }

  const unregisteredOrMissing = issues.filter(
    (i) => i.code === "unregistered-module" || i.code === "missing-system-id",
  ).length;
  const coveragePct =
    discovered.length === 0 ? 100 : Math.round(((discovered.length - unregisteredOrMissing) / discovered.length) * 1000) / 10;

  return { discovered, issues, ok: issues.length === 0, coveragePct };
}
