/** Schema v74. Persist only bounded proposals, reviewed previews and adoption/compensation receipts. */
import { BUNDLE_ADAPTERS, BUNDLE_KINDS, BUNDLE_LIMITS } from './actionBundleRegistry.js';
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 200) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const iso = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const day = (v) => iso(v)?.slice(0, 10) || null;
const int = (v, max = 1e7) => Number.isInteger(v) && v >= 0 && v <= max ? v : null;
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{16}$/.test(v) ? v : '';
const STATUSES = ['draft', 'rehearsed', 'committed', 'withdrawn', 'archived'];
function cleanPreview(raw) {
  if (!object(raw) || !Array.isArray(raw.changes) || !Array.isArray(raw.relationships)) return null;
  const changes = raw.changes.slice(0, 100).flatMap((r) => object(r) && /^[a-zA-Z]+$/.test(r.collection || '') && int(r.created) !== null && int(r.updated) !== null && int(r.removed) !== null
    ? [{ collection: r.collection, created: r.created, updated: r.updated, removed: r.removed }] : []);
  const relationships = raw.relationships.slice(0, 100).flatMap((r) => object(r) && text(r.sourceType) && text(r.targetType) && text(r.relation) && int(r.added) !== null && int(r.removed) !== null
    ? [{ sourceType: text(r.sourceType, 40), targetType: text(r.targetType, 40), relation: text(r.relation, 60), added: r.added, removed: r.removed }] : []);
  return { changes, relationships, failureCount: int(raw.failureCount, 10000) ?? 0,
    ruleIds: [...new Set((Array.isArray(raw.ruleIds) ? raw.ruleIds : []).map((v) => text(v, 80)).filter(Boolean))].slice(0, 100),
    scope: 'Actual software commands and rule effects in a disposable workspace. Not a causal forecast; no message is sent.' };
}
export function normalizeActionBundles(raw, state, now, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = []; const seen = new Set();
  for (const item of raw.slice(0, BUNDLE_LIMITS.bundles * 2)) {
    if (!object(item) || !text(item.id) || seen.has(item.id) || (!(state.cases || []).some((c) => c.id === item.sourceId) && !['committed', 'withdrawn'].includes(item.status))
      || !Array.isArray(item.commands) || !item.commands.length || item.commands.length > BUNDLE_LIMITS.commands
      || item.commands.some((a) => !object(a) || !BUNDLE_KINDS.includes(a.kind) || !text(a.title) || !day(a.dueOn))
      || new Set(item.commands.map((a) => a.kind)).size !== item.commands.length || !iso(item.createdAt) || !day(item.reviewOn)) {
      warnings.push('Action bundles: dropped a malformed proposal or a proposal whose source case no longer exists.'); continue;
    }
    seen.add(item.id);
    let status = STATUSES.includes(item.status) ? item.status : 'draft';
    const preview = cleanPreview(item.preview);
    if (['rehearsed', 'committed'].includes(status) && !preview) { status = 'draft'; warnings.push('Action bundles: an unverifiable preview was returned to draft.'); }
    if (status === 'committed' && (!iso(item.committedAt) || !Array.isArray(item.outputs))) { status = 'draft'; warnings.push('Action bundles: an incomplete adoption receipt was returned to draft.'); }
    const commands = item.commands.map((a) => Object.fromEntries(Object.entries(a).filter(([k, v]) => ['kind', 'title', 'ownerId', 'sourceId', 'budgetId', 'dueOn', 'question', 'outcome', 'statement', 'prompt'].includes(k)
      ? typeof v === 'string' || (v === null && ['ownerId', 'sourceId', 'budgetId'].includes(k)) : ['amount', 'priorPct'].includes(k) && Number.isFinite(v))));
    const outputs = (Array.isArray(item.outputs) ? item.outputs : []).slice(0, BUNDLE_LIMITS.targets).flatMap((o) => object(o) && BUNDLE_KINDS.includes(o.kind) && text(o.id) && hash(o.fingerprint) && text(o.type || o.kind, 40)
      ? [{ type: text(o.type || o.kind, 40), collection: text(o.collection || BUNDLE_ADAPTERS[o.kind]?.collection || '', 40), id: text(o.id, 80), kind: o.kind, fingerprint: o.fingerprint, ...(o.prompt ? { prompt: text(o.prompt, 180) } : {}), ...(o.budgetId ? { budgetId: text(o.budgetId, 80) } : {}) }] : []);
    if (item.status === 'committed' && outputs.length !== (item.outputs || []).length) { status = 'draft'; warnings.push('Action bundles: a malformed compensation target was refused.'); }
    out.push({ id: text(item.id, 80), name: text(item.name, 180) || 'Coordinated action bundle', sourceType: 'case', sourceId: item.sourceId,
      reviewOn: day(item.reviewOn), commands, status, createdAt: iso(item.createdAt), updatedAt: iso(item.updatedAt) || iso(item.createdAt),
      committedAt: ['committed', 'withdrawn'].includes(status) ? iso(item.committedAt) : null, withdrawnAt: status === 'withdrawn' ? iso(item.withdrawnAt) : null,
      archivedAt: status === 'archived' ? iso(item.archivedAt) : null, evaluatedAt: iso(item.evaluatedAt),
      baseRevision: int(item.baseRevision) ?? 0, inputFingerprint: hash(item.inputFingerprint), sourceFingerprint: hash(item.sourceFingerprint),
      preview, actual: cleanPreview(item.actual), outputs,
      history: (Array.isArray(item.history) ? item.history : []).filter((h) => object(h) && iso(h.at) && text(h.summary)).slice(-60).map((h) => ({ at: iso(h.at), type: text(h.type, 40), summary: text(h.summary, 300) })),
    });
    if (out.length >= BUNDLE_LIMITS.bundles) break;
  }
  return out;
}