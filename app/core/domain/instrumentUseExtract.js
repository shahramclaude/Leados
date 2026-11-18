/** Flat export adapter for ADR-0252. Identifiers are single-line values. Unlike
 * the general-purpose CSV reader, reject malformed quoting and ragged rows;
 * losing one use changes the very decision list the file is meant to prove. */
import { LOOKBACK_LIMITS } from './instrumentLookback.js';

export const USE_HEADERS = Object.freeze(['use_ref', 'instrument_ref', 'used_on', 'decision_ref']);
const fail = (error) => ({ ok: false, field: 'extract', error });

function fields(line, sep) {
  const cells = [];
  let pos = 0;
  for (;;) {
    let cell = '';
    if (line[pos] === '"') {
      pos += 1;
      for (;;) {
        const end = line.indexOf('"', pos);
        if (end < 0) return null;
        cell += line.slice(pos, end);
        pos = end + 1;
        if (line[pos] !== '"') break;
        cell += '"'; pos += 1;
      }
    } else {
      const end = line.indexOf(sep, pos);
      cell = line.slice(pos, end < 0 ? line.length : end);
      if (cell.includes('"')) return null;
      pos += cell.length;
    }
    cells.push(cell);
    if (pos === line.length) return cells;
    if (line[pos] !== sep || cells.length >= USE_HEADERS.length) return null;
    pos += 1;
  }
}

export function parseInstrumentUses(text) {
  if (typeof text !== 'string' || !text || text.length > LOOKBACK_LIMITS.text || new TextEncoder().encode(text).length > LOOKBACK_LIMITS.text) return fail('Paste or open a whole use extract, no larger than 1 MiB, including its header.');
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  if (lines.length - 1 > LOOKBACK_LIMITS.rows) return fail(`The ${LOOKBACK_LIMITS.rows}-row limit was exceeded. Nothing was read as a partial total.`);
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const header = fields(lines[0], sep);
  if (header?.length !== USE_HEADERS.length || !USE_HEADERS.every((key) => header.includes(key))) {
    return fail(`Use these four headers exactly once, comma- or tab-separated: ${USE_HEADERS.join(',')}.`);
  }
  const order = USE_HEADERS.map((key) => header.indexOf(key));
  const uses = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = fields(lines[i], sep);
    if (cells?.length !== header.length) return fail(`Data row ${i} must contain four single-line cells with valid quoting. No rows were accepted.`);
    const [useRef, instrumentRef, usedOn, decisionRef] = order.map((j) => cells[j]);
    uses.push({ useRef, instrumentRef, usedOn, decisionRef });
  }
  return { ok: true, uses };
}
