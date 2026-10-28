/** Automation assurance: graph evidence, not causal inference or a risk probability.
 * No new storage schema. Replays use disposable copies and the production rules.
 */
import { LINK_ENTITY_TYPES, LINK_RELATIONS, resolveLinkedEntity } from './cases.js';
import { runPostCommitRules } from './postCommit.js';

const keyOf = (type, id) => JSON.stringify([type, id]);
const allowed = (type) => LINK_ENTITY_TYPES.includes(type);

export function buildAssuranceReport(state) {
  const nodes = new Map();
  const edges = [];
  const findings = [];
  const seen = new Set();
  for (const link of state.links || []) {
    // Private records are not resolved, echoed, counted as findings or exported.
    if (!allowed(link.sourceType) || !allowed(link.targetType)) continue;
    const source = resolveLinkedEntity(state, link.sourceType, link.sourceId);
    const target = resolveLinkedEntity(state, link.targetType, link.targetId);
    if (!source || !target) {
      findings.push({ kind: 'dangling', linkId: link.id, detail: 'An allowed operational link has a missing endpoint. Review the source before repairing or removing it.' });
      continue;
    }
    if (!LINK_RELATIONS.includes(link.relation)) {
      findings.push({ kind: 'unknown-relation', linkId: link.id, detail: 'An operational link uses an unregistered relationship.' });
      continue;
    }
    const a = keyOf(source.type, source.id); const b = keyOf(target.type, target.id);
    const signature = JSON.stringify([a, b, link.relation]);
    if (seen.has(signature)) {
      findings.push({ kind: 'duplicate', linkId: link.id, detail: 'Repeated directed relationship; counts below deduplicate it.' });
      continue;
    }
    seen.add(signature);
    nodes.set(a, { key: a, type: source.type, id: source.id, title: source.title, route: source.route });
    nodes.set(b, { key: b, type: target.type, id: target.id, title: target.title, route: target.route });
    edges.push({ a, b, relation: link.relation, ruleId: link.ruleId || 'manual / unspecified', id: link.id });
  }
  const adjacency = new Map([...nodes.keys()].map((key) => [key, []]));
  const provenance = new Map();
  for (const edge of edges) {
    adjacency.get(edge.a).push({ key: edge.b, edge, reverse: false });
    adjacency.get(edge.b).push({ key: edge.a, edge, reverse: true });
    provenance.set(edge.ruleId, (provenance.get(edge.ruleId) || 0) + 1);
  }
  // Count-only operational diagnostics. Never copy arbitrary log summaries:
  // imported logs may contain confidential free text.
  const failures = (state.events || []).filter((e) => e.type === 'automation.rule_error')
    .map((e) => ({ id: e.id, ts: e.ts }));
  return { nodes, edges, adjacency, findings, failures,
    provenance: [...provenance].map(([ruleId, count]) => ({ ruleId, count })),
    modules: new Set([...nodes.values()].map((n) => n.type)).size };
}

/** BFS shortest undirected evidence trail. Reverse traversal is explicit.
 * A 'coaches' edge is not a dependency; reachability never implies failure spread.
 */
export function evidenceTrails(report, start) {
  if (!report.nodes.has(start)) return [];
  const paths = new Map([[start, []]]); const queue = [start];
  for (let i = 0; i < queue.length; i += 1) {
    for (const step of report.adjacency.get(queue[i]) || []) {
      if (paths.has(step.key)) continue;
      paths.set(step.key, [...paths.get(queue[i]), step]);
      queue.push(step.key);
    }
  }
  return [...paths].filter(([key]) => key !== start)
    .map(([key, path]) => ({ node: report.nodes.get(key), path, distance: path.length }));
}

/** Compare distinct valid operational relationships, without exporting record identities
 * or free text. A removed edge and a new edge are separate even if their types match.
 * Invalid/private endpoints remain outside the graph; diagnostics are count-only.
 */
export function compareAutomationGraphs(beforeState, afterState) {
  const before = buildAssuranceReport(beforeState);
  const after = buildAssuranceReport(afterState);
  const signature = (e) => JSON.stringify([e.a, e.b, e.relation]);
  const oldEdges = new Map(before.edges.map((e) => [signature(e), e]));
  const newEdges = new Map(after.edges.map((e) => [signature(e), e]));
  const groups = new Map();
  const add = (edge, direction, report) => {
    const sourceType = report.nodes.get(edge.a).type;
    const targetType = report.nodes.get(edge.b).type;
    const key = JSON.stringify([sourceType, edge.relation, targetType]);
    if (!groups.has(key)) groups.set(key, { sourceType, relation: edge.relation, targetType, added: 0, removed: 0 });
    groups.get(key)[direction] += 1;
  };
  for (const [key, edge] of newEdges) if (!oldEdges.has(key)) add(edge, 'added', after);
  for (const [key, edge] of oldEdges) if (!newEdges.has(key)) add(edge, 'removed', before);
  const countFindings = (report) => Object.fromEntries(['dangling', 'duplicate', 'unknown-relation']
    .map((kind) => [kind, report.findings.filter((f) => f.kind === kind).length]));
  return { relationships: [...groups.values()].sort((a, b) =>
    JSON.stringify([a.sourceType, a.relation, a.targetType]).localeCompare(JSON.stringify([b.sourceType, b.relation, b.targetType]))),
    diagnosticsBefore: countFindings(before), diagnosticsAfter: countFindings(after) };
}

export function previewCaseAutomation(state, caseId, { now = new Date(), rules } = {}) {
  const source = (state.cases || []).find((c) => c.id === caseId);
  if (!source) return { ok: false, error: 'Case not found.', changes: [], events: [], warnings: [] };
  const draft = JSON.parse(JSON.stringify(state));
  const events = []; const warnings = []; const trace = []; let sequence = 0;
  const occupied = new Set(Object.values(state).filter(Array.isArray).flatMap((rows) => rows.map((r) => r?.id)));
  const idFactory = (prefix) => {
    let id; do { id = `${prefix}-assurance-preview-${++sequence}`; } while (occupied.has(id));
    occupied.add(id); return id;
  };
  runPostCommitRules(draft, {
    event: { type: 'case.updated', entity: 'case', entityId: caseId }, now,
    idFactory, logEvent: (e) => events.push(e), warnings, trace,
    ...(rules ? { rules } : {}),
  });
  const changes = [];
  for (const [collection, after] of Object.entries(draft)) {
    if (!Array.isArray(after) || ['events', 'conflicts', 'pulses'].includes(collection)) continue;
    const before = new Map((state[collection] || []).map((r) => [r.id, r]));
    const remaining = new Set(); let created = 0; let updated = 0;
    for (const row of after) {
      remaining.add(row.id);
      if (!before.has(row.id)) created += 1;
      else if (JSON.stringify(before.get(row.id)) !== JSON.stringify(row)) updated += 1;
    }
    const removed = [...before.keys()].filter((id) => !remaining.has(id)).length;
    if (created || updated || removed) changes.push({ collection, created, updated, removed });
  }
  return { ok: true, changes, graphDelta: compareAutomationGraphs(state, draft), trace, warnings: warnings.map(() => 'A post-commit rule failed; its writes were rolled back.'), events: events.filter((e) => e.type === 'automation.rule_error' || e.type === 'automation.propagated')
    .map((e) => ({ type: e.type, entity: e.entity })) };
}

export function assuranceBrief(report) {
  return ['LeadOS — Automation assurance',
    `${report.nodes.size} linked operational records · ${report.edges.length} distinct relationships · ${report.modules} modules`,
    `${report.findings.length} link diagnostics · ${report.failures.length} retained rule-failure events (historical, not necessarily unresolved)`,
    'Scope: valid operational links only. Confidential conflicts and anonymous pulses excluded. No completeness or causal guarantee.',
    '', 'Relationship provenance:', ...report.provenance.map((r) => `${r.ruleId}: ${r.count}`),
    '', 'Diagnostics:', ...report.findings.map((f) => `${f.kind}: ${f.detail}`),
    '', 'Safety: post-commit rules publish changes and audit events only after successful completion. Existing source-action automation is outside these savepoints.',
  ].join('\n');
}
