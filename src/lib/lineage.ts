// ---------------------------------------------------------------------------
// src/lib/lineage.ts
//
// Stand-in for Part 34's lineage system, reused here to make every number in
// a disclosure pack traceable back to the raw record(s) it came from
// ("assurance-readiness"). A manifest is a flat list of nodes with explicit
// refs, plus a content hash so a round-trip (regenerate -> same inputs ->
// same hash) can be asserted in tests.
// ---------------------------------------------------------------------------
import { createHash } from "crypto";

export type LineageNodeKind = "activity" | "factor" | "metric" | "ledger" | "decision" | "aggregate" | "target";

export interface LineageNode {
  id: string;
  kind: LineageNodeKind;
  label: string;
  /** ids of other lineage nodes or raw record ids this node derives from */
  refs: string[];
}

export interface LineageManifest {
  generatedAt: string;
  nodes: LineageNode[];
  hash: string;
}

function hashNodes(nodes: LineageNode[]): string {
  const canonical = JSON.stringify(
    [...nodes].sort((a, b) => a.id.localeCompare(b.id)).map((n) => ({ id: n.id, kind: n.kind, refs: [...n.refs].sort() })),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

export function buildLineageManifest(nodes: LineageNode[], generatedAt: string): LineageManifest {
  return { generatedAt, nodes, hash: hashNodes(nodes) };
}

export interface LineageVerificationResult {
  ok: boolean;
  missingRefs: { nodeId: string; ref: string }[];
  hashMatches: boolean;
}

/**
 * Round-trip verification: every ref in the manifest must resolve to either
 * another node in the manifest or a raw id supplied by `knownRawIds`
 * (activity/factor/people-aggregate/decision ids actually present in the
 * database), and the recomputed hash must match the stored hash.
 */
export function verifyLineageManifest(manifest: LineageManifest, knownRawIds: Set<string>): LineageVerificationResult {
  const nodeIds = new Set(manifest.nodes.map((n) => n.id));
  const missingRefs: { nodeId: string; ref: string }[] = [];
  for (const node of manifest.nodes) {
    for (const ref of node.refs) {
      if (!nodeIds.has(ref) && !knownRawIds.has(ref)) {
        missingRefs.push({ nodeId: node.id, ref });
      }
    }
  }
  const hashMatches = hashNodes(manifest.nodes) === manifest.hash;
  return { ok: missingRefs.length === 0 && hashMatches, missingRefs, hashMatches };
}
