/** ADR-0252. Only dated source evidence is stored. A broken row invalidates
 * its whole workpaper; keeping a usable prefix would understate exposure. */
import { LOOKBACK_LIMITS as L, readInstrumentEvidence } from './instrumentLookback.js';

const id = (v) => typeof v === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(v);
const instant = (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const sourceKey = (row) => JSON.stringify([row?.checkId, row?.instrumentRef, row?.sourceRef]);
export const LOOKBACK_WARNING = 'Instrument look-back: ';

export function readInstrumentPaper(row, parent, asOf) {
  if (!parent || parent.outcome !== 'abnormal' || row?.checkId !== parent.id || !id(row.id)
    || row.recordedById !== parent.recordedById || !instant(row.recordedAt) || row.recordedAt > asOf
    || (parent.recordedAt && row.recordedAt < parent.recordedAt)) {
    return { ok: false, field: 'checkId', error: 'The workpaper needs a unique ID, an abnormal check, its original recorder, and a capture time from that check through now.' };
  }
  const read = readInstrumentEvidence(row, { checkOn: parent.recordedOn, capturedOn: row.recordedAt.slice(0, 10) });
  if (!read.ok) return read;
  return { ok: true, paper: { id: row.id, checkId: parent.id, recordedById: parent.recordedById, recordedAt: row.recordedAt, ...read.evidence } };
}

export function normalizeInstrumentLookbacks(raw, checks, asOf, warnings = []) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    warnings.push(`${LOOKBACK_WARNING}expected a ledger of dated extracts. The unreadable collection was refused.`);
    return [];
  }
  const n = raw.reduce((sum, r) => sum + (Array.isArray(r?.uses) ? r.uses.length : 0), 0);
  if (raw.length > L.papers || n > L.workspaceRows) {
    warnings.push(`${LOOKBACK_WARNING}${raw.length} workpapers / ${n} source rows exceed the ${L.papers} / ${L.workspaceRows} limits. No partial ledger was loaded.`);
    return [];
  }
  if (!raw.length) return [];
  const parents = new Map(checks.filter((c) => c.outcome === 'abnormal').map((c) => [c.id, c]));
  const ids = new Set(), sources = new Set(), repeatedIds = new Set(), repeatedSources = new Set();
  for (const row of raw) {
    if (ids.has(row?.id)) repeatedIds.add(row?.id);
    if (sources.has(sourceKey(row))) repeatedSources.add(sourceKey(row));
    ids.add(row?.id); sources.add(sourceKey(row));
  }
  const out = [];
  for (const row of raw) {
    if (repeatedIds.has(row?.id) || repeatedSources.has(sourceKey(row))) continue;
    const read = readInstrumentPaper(row, parents.get(row?.checkId), asOf);
    if (read.ok) out.push(read.paper);
  }
  if (out.length < raw.length) warnings.push(`${LOOKBACK_WARNING}${raw.length - out.length} entire workpaper(s) refused: invalid parent, author, date, evidence or ambiguous identity. No uses were salvaged or silently counted as zero.`);
  return out;
}
