/** ADR-0192: explicit ILUO task declarations and append-only manager attestations.
 * Bad imported evidence is retained as an invalid row, NEVER dropped in a way
 * that could resurrect an older credential. Any such row refuses coverage.
 */
export const SKILL_LEVELS = Object.freeze(['I', 'L', 'U', 'O']);
export const SKILL_LIMITS = Object.freeze({ tasks: 500, acts: 10000 });
export const skillText = (v, min, max) => typeof v === 'string' && v.trim() === v && v.length >= min && v.length <= max;
export function skillDay(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const stamp = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const id = (v) => skillText(v, 1, 120);
export function skillTaskError(r) {
  if (!r || typeof r !== 'object' || r.invalid) return 'Invalid task declaration retained; repair the source register before claiming coverage.';
  if (!id(r.id) || !id(r.holderId) || !skillText(r.title, 3, 160) || !skillText(r.standard, 10, 1200)) return 'Task identity, holder, title or observable standard is invalid.';
  if (!Number.isInteger(r.floor) || r.floor < 1 || r.floor > 100) return 'Task coverage floor must be an integer from 1 to 100.';
  if (!stamp(r.declaredAt) || !(r.retiredOn === null || (skillDay(r.retiredOn) && r.retiredOn >= r.declaredAt.slice(0, 10)))) return 'Task declaration or retirement date is invalid.';
  return null;
}
export function skillActError(r, tasks) {
  if (!r || typeof r !== 'object' || r.invalid) return 'Invalid qualification retained; no older qualification may replace it silently.';
  const task = tasks.find((t) => t.id === r.taskId && !skillTaskError(t));
  if (!id(r.id) || !task || !id(r.personId) || r.byId !== task.holderId || r.personId === r.byId) return 'Attestation must name a task, a distinct person and that task’s declaring holder.';
  if (![...SKILL_LEVELS, 'revoked'].includes(r.level) || !skillText(r.evidence, 10, 1200) || !stamp(r.recordedAt)) return 'Attestation level, evidence or recording timestamp is invalid.';
  if (r.recordedAt < task.declaredAt || (task.retiredOn && r.recordedAt.slice(0, 10) > task.retiredOn)) return 'Attestation falls outside the task’s live term.';
  if (r.level === 'revoked') {
    if (r.expiresOn !== null) return 'A revocation does not carry an expiry date.';
  } else if (!skillDay(r.expiresOn) || r.expiresOn < r.recordedAt.slice(0, 10)) return 'A qualification needs an inclusive expiry on or after the recording day.';
  if (!(r.supersedesId === null || id(r.supersedesId))) return 'Attestation predecessor is invalid.';
  return null;
}
function normalizeLedger(raw, warnings, name, limit, validate) {
  if (raw === undefined) return [];
  const rows = Array.isArray(raw) ? raw : [raw];
  const seen = new Set();
  const out = rows.slice(0, limit).map((r, i) => {
    if (r?.invalid === true) {
      warnings.push(`${name}[${i}]: invalid evidence retained. Coverage withheld.`);
      return { ...r };
    }
    const error = !Array.isArray(raw) ? 'Register is not an array.' : validate(r) || (seen.has(r?.id) ? 'Duplicate ledger identity.' : null);
    seen.add(r?.id);
    if (!error) return { ...r };
    warnings.push(`${name}[${i}]: ${error} Coverage withheld; rejected evidence retained.`);
    return { ...(r && typeof r === 'object' ? r : { rejectedValue: r }), invalid: true, error };
  });
  if (rows.length > limit) {
    const tail = rows.slice(limit);
    const excessRows = tail.length === 1 && tail[0]?.overflow === true && Array.isArray(tail[0].excessRows) ? tail[0].excessRows : tail;
    warnings.push(`${name}: ${excessRows.length} rows exceed the supported bound; coverage withheld.`);
    // Keep excess evidence for recovery, without nesting another envelope on reload.
    out.push({ invalid: true, overflow: true, error: 'Ledger bound exceeded; export and repair before using coverage.', excessRows });
  }
  return out;
}
export function normalizeSkillTasks(raw, warnings = []) {
  return normalizeLedger(raw, warnings, 'skillTasks', SKILL_LIMITS.tasks, skillTaskError);
}
export function normalizeSkillActs(raw, tasks, warnings = []) {
  const last = new Map();
  return normalizeLedger(raw, warnings, 'skillActs', SKILL_LIMITS.acts, (r) => {
    const error = skillActError(r, tasks);
    if (error) return error;
    const key = JSON.stringify([r.taskId, r.personId]);
    const previous = last.get(key);
    if (r.supersedesId !== (previous?.id || null) || (previous && r.recordedAt < previous.recordedAt)) return 'Broken or reordered attestation chain; coverage refused, not rolled back.';
    last.set(key, r);
    return null;
  });
}
