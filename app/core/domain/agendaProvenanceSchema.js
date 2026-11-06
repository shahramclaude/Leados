/**
 * app/core/domain/agendaProvenanceSchema.js — fail-closed storage for the 1:1
 * agenda provenance ledger (ADR-0113, Schema v112).
 *
 * The ONLY stored rows are the lines a human filed: "I will raise THIS exact
 * prompt with THIS person." Everything else — which prompts exist, who owes
 * them, whether a filed line was actually raised, the span's queue pressure and
 * receipt rate — is re-derived on read from the person record and the 1:1
 * record the human already logged. A stored status that could drift away from
 * the conversation it claims to describe would be worse than no ledger at all.
 *
 * A malformed row is DROPPED with a warning, never repaired into a promise a
 * leader might believe they made.
 */
import { AGENDA_ENGINE_VERSION, AGENDA_LIMITS, classifyTopic } from './agendaProvenanceRegistry.js';

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 200) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const iso = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && iso(v)?.slice(0, 10) === v ? v : null);

/**
 * One filed line. `prompt` is copied verbatim so the ledger survives the waiting
 * list being cleared — the whole point is to know what the lead committed to
 * raise even after the engine has truncated the source string away.
 */
export function normalizeAgendaEntries(rows, warnings = []) {
  if (!Array.isArray(rows)) {
    warnings.push('Agenda ledger: repaired a non-array declaration to an empty list.');
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const raw of rows.slice(0, AGENDA_LIMITS.scanCap)) {
    if (!isObject(raw)) { warnings.push('Agenda ledger: dropped a malformed filed line.'); continue; }
    const prompt = text(raw.prompt, AGENDA_LIMITS.topicChars);
    const personId = text(raw.personId, 80);
    const filedOn = day(raw.filedOn);
    if (!prompt || !personId || !filedOn) {
      warnings.push('Agenda ledger: dropped a filed line without a prompt, a person or a valid filing date.');
      continue;
    }
    const key = `${personId}|${prompt.toLowerCase()}|${filedOn}`;
    if (seen.has(key)) { warnings.push('Agenda ledger: dropped a duplicate filed line (same person, prompt and day).'); continue; }
    seen.add(key);
    const classification = classifyTopic(prompt);
    const status = raw.status === 'withdrawn' ? 'withdrawn' : 'filed';
    out.push({
      id: text(raw.id, 80) || `agd-${out.length + 1}`,
      personId,
      prompt,
      family: classification.family,
      owedTo: classification.owedTo,
      filedOn,
      filedAt: iso(raw.filedAt) || `${filedOn}T00:00:00.000Z`,
      filedBySeatId: text(raw.filedBySeatId, 80) || null,
      sourceKind: ['their-topic', 'engine-prompt', 'manual'].includes(raw.sourceKind) ? raw.sourceKind : 'manual',
      sourceId: text(raw.sourceId, 120) || null,
      note: text(raw.note, 400),
      status,
      withdrawnOn: status === 'withdrawn' ? day(raw.withdrawnOn) : null,
      withdrawnInMeetingId: status === 'withdrawn' ? (text(raw.withdrawnInMeetingId, 80) || null) : null,
      version: AGENDA_ENGINE_VERSION,
    });
  }
  return out;
}

export function normalizeAgendaMarkers(rows, warnings = []) {
  if (!Array.isArray(rows)) {
    warnings.push('Agenda ledger: repaired a non-array marker list to an empty list.');
    return [];
  }
  return rows
    .filter((row) => typeof row === 'string' && row.trim())
    .map((row) => row.trim().slice(0, 200))
    .slice(-AGENDA_LIMITS.scanCap);
}

/**
 * Settings are declared conventions with printed defaults, never fitted from
 * the record. `agendaReceiptFloor` is the n below which no receipt rate prints.
 */
export const AGENDA_SETTINGS_DEFAULTS = Object.freeze({
  agendaReceiptFloor: AGENDA_LIMITS.receiptFloor,
  agendaStaleAfterDays: AGENDA_LIMITS.staleAfterDays,
  agendaAutoPropagate: true,
});

export function normalizeAgendaSettings(settings = {}) {
  const s = isObject(settings) ? settings : {};
  const int = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    agendaReceiptFloor: int(s.agendaReceiptFloor, 3, 40, AGENDA_SETTINGS_DEFAULTS.agendaReceiptFloor),
    agendaStaleAfterDays: int(s.agendaStaleAfterDays, 3, 120, AGENDA_SETTINGS_DEFAULTS.agendaStaleAfterDays),
    agendaAutoPropagate: s.agendaAutoPropagate !== false,
  };
}
