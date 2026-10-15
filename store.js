/* LeadOS pt-3 · js/store.js — the storage spine.
   Lineage 'pt', schema v3. Carried byte-verified from pt-2 (read this session):
   one key · quarantine timestamped + collision-suffixed + never overwritten ·
   try/catch-only writes · normalize repairs, never drops · parse funnel
   (corrupt/malformed/foreign/newer/migration-failed/ok) · read-only boot on newer ·
   volatile memory vault when localStorage is unusable · audit capped at 300,
   the cap leaves a row · MIGRATIONS['1>2'] carried near-verbatim (byte-read).
   NEW in pt-3: SCHEMA 3 · MIGRATIONS['2>3'] (settings.coachingReviewDefaultDays
   backfill 14, counted) · plan.* id rewiring in mergeInto (T13) · identical-import
   detection via stable stringify · test hooks under _test (used by js/health.js,
   all disposable keys prefixed leados:t and swept at render). */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.store = 'js/store.js';

LEADOS.store = (function () {
  'use strict';

  var KEY = 'leados:data';
  var SCHEMA = 3;
  var LINEAGE = 'pt';
  var AUDIT_CAP = 300;
  var ASSUMED_QUOTA_BYTES = 5 * 1024 * 1024; /* labeled assumption, printed in #/data */

  var _state = null;
  var _readOnly = false;
  var _readOnlyWhy = null;
  var _volatile = false;
  var _vault = {};          /* memory backend when localStorage is unusable */
  var _vaultKeys = [];
  var _boot = { status: 'never-booted', quarantined: null, repairs: [] };
  var api = {};

  function nowIso() { return new Date().toISOString(); }

  function freshState() {
    return {
      meta: {
        schemaVersion: SCHEMA,
        lineage: LINEAGE,
        createdAt: nowIso(),
        idSeq: 0,
        seeded: false,
        writeFailed: false,
        writeFailures: 0,
        audit: [],
        auditSeq: 0,
        settings: {
          weeklyOneOnOneCapacityMin: 240,
          oneOnOneLengthMin: 50,
          skipCadenceDefaultDays: 60,
          coachingReviewDefaultDays: 14 /* pt-3 */
        }
      },
      people: [],
      events: []
    };
  }

  /* ---------- backend: localStorage, else loud volatile vault ---------- */
  function safeLSGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function beGet(k) { return _volatile ? (_vault.hasOwnProperty(k) ? _vault[k] : null) : safeLSGet(k); }
  function beSet(k, v) {
    if (_volatile) { if (!_vault.hasOwnProperty(k)) _vaultKeys.push(k); _vault[k] = v; return true; }
    try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
  }
  function beRemove(k) {
    if (_volatile) { delete _vault[k]; var i = _vaultKeys.indexOf(k); if (i >= 0) _vaultKeys.splice(i, 1); return; }
    try { localStorage.removeItem(k); } catch (e) {}
  }
  function beKeys() {
    if (_volatile) return _vaultKeys.slice();
    var out = [];
    try { for (var i = 0; i < localStorage.length; i++) out.push(localStorage.key(i)); } catch (e) {}
    return out;
  }
  function probeStorage() {
    try { localStorage.setItem('leados:probe', '1'); localStorage.removeItem('leados:probe'); return true; }
    catch (e) { return false; }
  }

  /* ---------- stable stringify (identical-import detection) ---------- */
  function stable(o) {
    if (o === null || typeof o !== 'object') return JSON.stringify(o);
    if (Array.isArray(o)) { var a = []; for (var i = 0; i < o.length; i++) a.push(stable(o[i])); return '[' + a.join(',') + ']'; }
    var ks = Object.keys(o).sort(), p = [];
    for (var j = 0; j < ks.length; j++) if (o[ks[j]] !== undefined) p.push(JSON.stringify(ks[j]) + ':' + stable(o[ks[j]]));
    return '{' + p.join(',') + '}';
  }
  function canonical(st) { return stable({ people: st.people, events: st.events }); }

  /* ---------- migration ladder ---------- */
  function personById(st, id) { for (var i = 0; i < st.people.length; i++) if (st.people[i] && st.people[i].id === id) return st.people[i]; return null; }

  /* Break reporting cycles deterministically: while any cycle exists, null the
     reportsTo of the lexicographically smallest member id. Returns repair notes.
     Carried near-verbatim from pt-2 (byte-read this session). */
  function findCycle(st) {
    var i, seen, cur;
    for (i = 0; i < st.people.length; i++) {
      seen = {}; cur = st.people[i];
      while (cur && cur.reportsTo) {
        if (seen[cur.id]) {
          var cyc = [cur.id], n = personById(st, cur.reportsTo);
          var guard = 0;
          while (n && n.id !== cur.id && guard++ < st.people.length + 2) { cyc.push(n.id); n = personById(st, n.reportsTo); }
          return cyc;
        }
        seen[cur.id] = 1;
        cur = personById(st, cur.reportsTo);
      }
    }
    return null;
  }
  function breakCycles(st) {
    var repairs = [], guard = 0;
    while (guard++ < st.people.length + 2) {
      var cycle = findCycle(st);
      if (!cycle) break;
      var minId = cycle.slice().sort()[0];
      var p = personById(st, minId);
      if (!p) break;
      repairs.push('reporting cycle ' + cycle.join('->') + '->' + cycle[0] + ' broken at ' + minId + ' (reportsTo nulled — re-set the line on the roster)');
      p.reportsTo = null;
    }
    return repairs;
  }

  var MIGRATIONS = {
    '1>2': function (st) { /* carried from pt-2, byte-read this session */
      var repairs = [];
      var i, p;
      for (i = 0; i < st.people.length; i++) {
        p = st.people[i];
        if (!p || typeof p !== 'object') continue;
        if (p.skipCadenceDays === undefined) { p.skipCadenceDays = null; }
        if (p.reportsTo != null) {
          var t = personById(st, p.reportsTo);
          if (!t) { repairs.push('person ' + p.id + ' reportsTo dangling (' + p.reportsTo + ') → nulled'); p.reportsTo = null; }
          else if (t.archived) { repairs.push('person ' + p.id + ' reported to archived ' + t.id + ' → nulled'); p.reportsTo = null; }
          else if (t.id === p.id) { repairs.push('person ' + p.id + ' reported to itself → nulled'); p.reportsTo = null; }
        }
      }
      repairs = repairs.concat(breakCycles(st));
      if (!st.meta.settings || typeof st.meta.settings !== 'object') st.meta.settings = {};
      if (typeof st.meta.settings.skipCadenceDefaultDays !== 'number') st.meta.settings.skipCadenceDefaultDays = 60;
      st.meta.migratedFrom = 1;
      st.meta.migratedAt = nowIso();
      st.meta.migrationRepairs = repairs;
      return st;
    },
    '2>3': function (st) { /* pt-3: growth-plan follow-through needs a default review window */
      var repairs = [];
      if (!st.meta.settings || typeof st.meta.settings !== 'object') st.meta.settings = {};
      if (typeof st.meta.settings.coachingReviewDefaultDays !== 'number') {
        st.meta.settings.coachingReviewDefaultDays = 14;
        repairs.push('settings.coachingReviewDefaultDays missing → 14 (used as plan reviewBy default when no style-derived window applies)');
      }
      st.meta.migratedFrom = 2;
      st.meta.migratedAt = nowIso();
      st.meta.migrationRepairs = (st.meta.migrationRepairs || []).concat(repairs);
      return st;
    }
  };
  function migrate(st, fromV) {
    while (fromV < SCHEMA) {
      var step = MIGRATIONS[fromV + '>' + (fromV + 1)];
      if (!step) throw new Error('no migration step from v' + fromV);
      st = step(st) || st;
      fromV++;
      st.meta.schemaVersion = fromV;
    }
    return st;
  }

  /* ---------- normalize: repair in place, count, never drop ---------- */
  function normalize(st) {
    var repairs = [];
    if (!st.meta || typeof st.meta !== 'object') { st.meta = {}; repairs.push('meta missing → rebuilt'); }
    var m = st.meta, fs = freshState().meta, k;
    for (k in fs) if (m[k] === undefined) { m[k] = fs[k]; repairs.push('meta.' + k + ' defaulted'); }
    if (typeof m.schemaVersion !== 'number') { m.schemaVersion = SCHEMA; repairs.push('meta.schemaVersion repaired'); }
    if (typeof m.lineage !== 'string') { m.lineage = LINEAGE; repairs.push('meta.lineage repaired'); }
    if (!Array.isArray(m.audit)) { m.audit = []; repairs.push('meta.audit rebuilt'); }
    if (typeof m.auditSeq !== 'number') m.auditSeq = m.audit.length;
    if (!m.settings || typeof m.settings !== 'object') { m.settings = fs.settings; repairs.push('meta.settings rebuilt'); }
    ['weeklyOneOnOneCapacityMin', 'oneOnOneLengthMin', 'skipCadenceDefaultDays', 'coachingReviewDefaultDays'].forEach(function (key) {
      if (typeof m.settings[key] !== 'number') { m.settings[key] = fs.settings[key]; repairs.push('settings.' + key + ' defaulted to ' + fs.settings[key]); }
    });
    if (!Array.isArray(st.people)) { st.people = []; repairs.push('people was not an array → emptied (rows already lost upstream)'); }
    if (!Array.isArray(st.events)) { st.events = []; repairs.push('events was not an array → emptied (rows already lost upstream)'); }
    st.people.forEach(function (p, i) {
      if (!p || typeof p !== 'object') { st.people[i] = { id: 'prepaired' + i, name: '(repaired row)', reportsTo: null, archived: false }; repairs.push('person row ' + i + ' not an object → placeholder'); return; }
      if (typeof p.id !== 'string' || !p.id) { p.id = 'prepaired' + i; repairs.push('person ' + i + ' missing id → minted'); }
      if (typeof p.name !== 'string') { p.name = String(p.name == null ? '(unnamed)' : p.name); repairs.push('person ' + p.id + ' name coerced'); }
      ['cadenceDays', 'skipCadenceDays'].forEach(function (f) {
        if (p[f] != null && typeof p[f] !== 'number') { p[f] = null; repairs.push('person ' + p.id + ' ' + f + ' non-number → null'); }
      });
      if (p.skipCadenceDays === undefined) p.skipCadenceDays = null;
      if (p.reportsTo !== undefined && p.reportsTo !== null && typeof p.reportsTo !== 'string') { p.reportsTo = null; repairs.push('person ' + p.id + ' reportsTo non-string → null'); }
      if (p.reportsTo === undefined) p.reportsTo = null;
      if (typeof p.archived !== 'boolean') p.archived = !!p.archived;
    });
    st.events.forEach(function (e, i) {
      if (!e || typeof e !== 'object' || Array.isArray(e)) { st.events[i] = { id: 'erepaired' + i, ts: nowIso(), type: 'note.added', data: { note: '(repaired event row)' } }; repairs.push('event row ' + i + ' not an object → placeholder note'); return; }
      if (typeof e.id !== 'string' || !e.id) { e.id = 'erepaired' + i; repairs.push('event ' + i + ' missing id → minted'); }
      if (typeof e.type !== 'string') { e.type = 'note.added'; repairs.push('event ' + e.id + ' type non-string → note.added'); }
      if (typeof e.ts !== 'string') { e.ts = nowIso(); repairs.push('event ' + e.id + ' ts non-string → now (order preserved by array position)'); }
      if (!e.data || typeof e.data !== 'object' || Array.isArray(e.data)) { e.data = {}; repairs.push('event ' + e.id + ' data repaired to {}'); }
    });
    return repairs;
  }

  /* ---------- quarantine: timestamped, suffixed, NEVER overwritten ---------- */
  var QPREFIX = KEY + ':quarantine:';
  function quarantine(kind, reason, text, keyPrefix) {
    var base = (keyPrefix || KEY) + ':quarantine:' + kind + ':' + nowIso().replace(/[:.]/g, '-');
    var k = base, n = 1;
    while (beGet(k) !== null && n < 99) { n++; k = base + '-' + n; }
    beSet(k, JSON.stringify({ kind: kind, reason: reason, at: nowIso(), bytes: (text || '').length, payload: text }));
    return k;
  }
  function listQuarantines() {
    var ks = beKeys(), out = [];
    for (var i = 0; i < ks.length; i++) {
      if (ks[i].indexOf(QPREFIX) === 0) {
        var meta = null;
        try { meta = JSON.parse(beGet(ks[i])); } catch (e) {}
        out.push({ key: ks[i], kind: meta && meta.kind ? meta.kind : '?', reason: meta && meta.reason ? meta.reason : '(unreadable)', at: meta && meta.at ? meta.at : '?', bytes: (beGet(ks[i]) || '').length });
      }
    }
    out.sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    return out;
  }
  function readQuarantine(k) { return beGet(k); }

  /* ---------- parse funnel + load ---------- */
  function loadFromText(text, srcKey) {
    srcKey = srcKey || KEY;
    if (typeof text !== 'string' || !text.trim()) return { status: 'corrupt', reason: 'empty payload' };
    var parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { return { status: 'corrupt', reason: 'JSON parse failed: ' + (e && e.message ? e.message : e) }; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { status: 'corrupt', reason: 'top level is not an object' };
    if (!parsed.meta || typeof parsed.meta !== 'object') return { status: 'malformed', reason: 'meta missing — not a LeadOS store' };
    if (parsed.meta.lineage !== LINEAGE) return { status: 'foreign', reason: 'lineage is "' + (parsed.meta.lineage == null ? 'absent' : parsed.meta.lineage) + '", expected "' + LINEAGE + '"' };
    var v = parsed.meta.schemaVersion;
    if (typeof v !== 'number') return { status: 'malformed', reason: 'meta.schemaVersion missing or non-numeric' };
    if (v > SCHEMA) return { status: 'newer', reason: 'store is schema v' + v + '; this build understands ≤ v' + SCHEMA + '. Booting read-only rather than clobbering a newer database.', state: null, raw: parsed };
    if (v < SCHEMA) {
      quarantine('pre-migration', 'snapshot of v' + v + ' store before running the ladder to v' + SCHEMA, text, srcKey);
      try { parsed = migrate(parsed, v); }
      catch (e) {
        quarantine('migration-failed', e && e.message ? e.message : String(e), text, srcKey);
        return { status: 'migration-failed', reason: e && e.message ? e.message : String(e), raw: parsed };
      }
    }
    var repairs = normalize(parsed);
    return { status: 'ok', state: parsed, repairs: repairs, migratedFrom: v < SCHEMA ? v : null };
  }

  /* ---------- save / audit / quota ---------- */
  function auditLive(action, ref) {
    if (!_state) return;
    var m = _state.meta;
    m.auditSeq = (typeof m.auditSeq === 'number' ? m.auditSeq : m.audit.length) + 1;
    m.audit.push({ seq: m.auditSeq, ts: nowIso(), action: action, ref: ref || null });
    if (m.audit.length > AUDIT_CAP) {
      var dropped = m.audit.length - AUDIT_CAP + 1;
      m.audit.splice(0, dropped);
      m.audit.unshift({ seq: m.auditSeq + 1, ts: nowIso(), action: 'audit-capped', ref: dropped + ' oldest row(s) dropped — the cap leaves this row' });
      m.auditSeq++;
    }
  }
  function save() {
    if (!_state) return { ok: false, why: 'no state' };
    if (_readOnly) return { ok: false, why: 'read-only boot (' + _readOnlyWhy + ') — writes hard-blocked; your data is untouched' };
    var text = JSON.stringify(_state);
    if (!beSet(KEY, text)) {
      _state.meta.writeFailed = true;
      _state.meta.writeFailures = (typeof _state.meta.writeFailures === 'number' ? _state.meta.writeFailures : 0) + 1;
      try { if (!_volatile) localStorage.setItem(KEY, text); } catch (e) {} /* single retry through the raw path */
      auditLive('write-failed', 'quota or backend error — export a backup at #/data, then free space');
      return { ok: false, why: 'storage write failed (quota or blocked backend). Nothing was saved. Export a backup at #/data before changing anything else.' };
    }
    if (_state.meta.writeFailed) { _state.meta.writeFailed = false; auditLive('write-recovered', 'a previous write failure recovered on this save'); beSet(KEY, JSON.stringify(_state)); }
    return { ok: true };
  }

  /* ---------- import: pure core + live wrapper ---------- */
  function collectIds(st) {
    var ids = {}, i, e;
    for (i = 0; i < st.people.length; i++) if (st.people[i] && st.people[i].id) ids[st.people[i].id] = 1;
    for (i = 0; i < st.events.length; i++) {
      e = st.events[i];
      if (e && e.id) ids[e.id] = 1;
      if (e && e.data && typeof e.data === 'object' && typeof e.data.goalId === 'string') ids[e.data.goalId] = 1;
    }
    return ids;
  }
  /* mergeInto(base, incoming, seq): pure. Re-mints EVERY id, rewires any data
     value that matches a known incoming id (recursive walk — future event types
     with *Id/*Ids fields rewire automatically); unresolvable → null + counted. */
  function mergeInto(base, incoming, seq) {
    var report = { peopleAdded: 0, eventsAdded: 0, refsRewired: 0, refsNulled: 0, dupNames: [] };
    var idMap = {}, counter = seq || 0;
    function mint() { counter++; var nid; do { nid = 'm' + counter.toString(36) + 'x'; } while (idMap[nid]); return nid; }
    var oldIds = collectIds(incoming), i;
    Object.keys(oldIds).forEach(function (old) { idMap[old] = mint(); });
    function rewire(v, depth) {
      if (depth > 12) return v;
      if (typeof v === 'string') {
        if (idMap[v]) { report.refsRewired++; return idMap[v]; }
        return v;
      }
      if (Array.isArray(v)) { var a = []; for (var i = 0; i < v.length; i++) a.push(rewire(v[i], depth + 1)); return a; }
      if (v && typeof v === 'object') { var o = {}; for (var k in v) o[k] = rewire(v[k], depth + 1); return o; }
      return v;
    }
    var names = {};
    for (i = 0; i < base.people.length; i++) if (base.people[i]) names[String(base.people[i].name || '').toLowerCase().trim()] = base.people[i].name;
    incoming.people.forEach(function (p) {
      var np = rewire(JSON.parse(JSON.stringify(p)), 0);
      var nn = String(np.name || '').toLowerCase().trim();
      if (names[nn]) report.dupNames.push(np.name + ' (possible same-named duplicate — accepted gap, ranked; merge by hand)');
      base.people.push(np); report.peopleAdded++;
    });
    incoming.events.forEach(function (e) {
      var ne = rewire(JSON.parse(JSON.stringify(e)), 0);
      base.events.push(ne); report.eventsAdded++;
    });
    /* dangling refs created by the rewire: person references that pointed at ids
       NOT present in the incoming store were left as-is (foreign) → null + count. */
    var valid = collectIds(base);
    function cleanRefs() {
      base.people.forEach(function (p) {
        if (p && p.reportsTo != null && !valid[p.reportsTo]) { report.refsNulled++; p.reportsTo = null; }
      });
      base.events.forEach(function (e) {
        if (!e || !e.data) return;
        ['personId', 'ownerId', 'aId', 'bId'].forEach(function (f) {
          if (e.data[f] != null && !valid[e.data[f]]) { report.refsNulled++; e.data[f] = null; }
        });
        ['goalId', 'decisionId', 'delegationId', 'planId'].forEach(function (f) {
          if (e.data[f] != null && !valid[e.data[f]]) { report.refsNulled++; e.data[f] = null; }
        });
        if (Array.isArray(e.data.conflictIds)) {
          e.data.conflictIds = e.data.conflictIds.map(function (id) {
            if (valid[id]) return id;
            report.refsNulled++; return null;
          }).filter(function (id) { return id != null; });
        }
      });
    }
    cleanRefs();
    report.nextSeq = counter;
    return report;
  }
  /* importInto(base, text, srcKey): pure refusal gate + migrate + merge. */
  function importInto(base, text, srcKey) {
    var r = loadFromText(text, srcKey || KEY);
    if (r.status === 'corrupt' || r.status === 'malformed' || r.status === 'foreign' || r.status === 'migration-failed') {
      if (r.status !== 'migration-failed') quarantine(r.status, 'import refused: ' + r.reason, text, srcKey || KEY);
      return { refused: r.status, reason: r.reason };
    }
    if (r.status === 'newer') return { refused: 'newer', reason: r.reason };
    if (canonical(r.state) === canonical(base)) return { refused: 'identical', reason: 'this export is byte-for-byte what you already have — nothing to merge' };
    var incoming = r.state;
    var merged = JSON.parse(JSON.stringify(base));
    var rep = mergeInto(merged, incoming, base.meta.idSeq || 0);
    rep.migratedFrom = r.migratedFrom;
    rep.state = merged;
    return rep;
  }
  function importJson(text) {
    if (!_state) return { refused: 'no-state', reason: 'store not booted' };
    if (_readOnly) return { refused: 'read-only', reason: _readOnlyWhy };
    quarantine('pre-import', 'snapshot of live store before applying an import', JSON.stringify(_state));
    var r = importInto(_state, text, KEY);
    if (r.refused) { auditLive('import-refused:' + r.refused, r.reason); save(); return r; }
    _state = r.state;
    _state.meta.idSeq = r.nextSeq;
    auditLive('import', r.peopleAdded + ' people, ' + r.eventsAdded + ' events merged · ' + r.refsRewired + ' refs rewired · ' + r.refsNulled + ' nulled' + (r.migratedFrom != null ? ' · migrated v' + r.migratedFrom + '→v' + SCHEMA + ' first' : ''));
    var s = save();
    if (!s.ok) return { refused: 'write-failed', reason: s.why };
    delete r.state;
    return r;
  }

  /* ---------- people rows (rows, not events — pt lineage doctrine) ---------- */
  function mint(prefix) {
    _state.meta.idSeq = (typeof _state.meta.idSeq === 'number' ? _state.meta.idSeq : 0) + 1;
    return (prefix || 'x') + _state.meta.idSeq.toString(36);
  }
  function peopleAdd(data) {
    if (_readOnly) return { error: 'read-only boot — writes hard-blocked' };
    var p = {
      id: mint('p'), name: String(data.name || '(unnamed)').trim() || '(unnamed)',
      role: data.role ? String(data.role) : '', createdAt: data.createdAt || nowIso(),
      cadenceDays: typeof data.cadenceDays === 'number' ? data.cadenceDays : null,
      skipCadenceDays: typeof data.skipCadenceDays === 'number' ? data.skipCadenceDays : null,
      reportsTo: data.reportsTo || null, archived: false
    };
    _state.people.push(p);
    auditLive('person.added', p.id);
    save();
    return p;
  }
  function personUpdate(id, patch) {
    if (_readOnly) return { error: 'read-only boot — writes hard-blocked' };
    var p = personById(_state, id);
    if (!p) return { error: 'no person ' + id };
    var before = p.reportsTo;
    if (patch.hasOwnProperty('name')) p.name = String(patch.name || '(unnamed)').trim() || '(unnamed)';
    if (patch.hasOwnProperty('role')) p.role = String(patch.role || '');
    if (patch.hasOwnProperty('cadenceDays')) p.cadenceDays = (patch.cadenceDays == null || isNaN(+patch.cadenceDays)) ? null : +patch.cadenceDays;
    if (patch.hasOwnProperty('skipCadenceDays')) p.skipCadenceDays = (patch.skipCadenceDays == null || isNaN(+patch.skipCadenceDays)) ? null : +patch.skipCadenceDays;
    if (patch.hasOwnProperty('archived')) p.archived = !!patch.archived;
    if (patch.hasOwnProperty('reportsTo')) {
      p.reportsTo = patch.reportsTo || null;
      if (p.reportsTo === p.id) { p.reportsTo = before; return { error: 'refused: a person cannot report to themselves' }; }
      var cyc = findCycle(_state);
      if (cyc) { p.reportsTo = before; return { error: 'refused: that would close a reporting cycle (' + cyc.join(' → ') + ' → ' + cyc[0] + '). Set the line differently.' }; }
    }
    auditLive('person.updated', id);
    save();
    return { ok: true };
  }

  /* ---------- settings ---------- */
  function saveSettings(patch) {
    if (_readOnly) return { error: 'read-only boot — writes hard-blocked' };
    var s = _state.meta.settings, changed = [];
    ['weeklyOneOnOneCapacityMin', 'oneOnOneLengthMin', 'skipCadenceDefaultDays', 'coachingReviewDefaultDays'].forEach(function (k) {
      if (patch.hasOwnProperty(k) && !isNaN(+patch[k]) && +patch[k] > 0) { s[k] = +patch[k]; changed.push(k + '=' + s[k]); }
    });
    auditLive('settings.updated', changed.join(' · ') || '(no valid keys)');
    save();
    return { ok: true };
  }

  /* ---------- seed / purge (once-ever flag doctrine) ---------- */
  /* buildSeed(): pure builder — ids minted in an 's' namespace that live mint()
     never collides with. T12 grades THIS function via project+engine, so the
     health wall tests the same rows the user gets. */
  function buildSeed() {
    var st = freshState();
    var seq = 0, mid = function (p) { seq++; return 's' + p + seq; };
    var D = function (n) { return new Date(Date.now() - n * 864e5).toISOString(); };
    var F = function (n) { return new Date(Date.now() + n * 864e5).toISOString(); };
    function mkp(name, role, extra) {
      var p = { id: mid('sp'), name: name, role: role, createdAt: D(70), cadenceDays: null, skipCadenceDays: null, reportsTo: null, archived: false };
      if (extra) for (var k in extra) p[k] = extra[k];
      st.people.push(p); return p;
    }
    var ana = mkp('Ana Ruiz', 'Team lead — Platform', { cadenceDays: 10 });
    var bru = mkp('Bruno Serra', 'Team lead — Growth', {});
    var cara = mkp('Cara Lind', 'Team lead — Ops', {});
    var dan = mkp('Dan Ivers', 'Engineer', { reportsTo: ana.id, skipCadenceDays: 60 });
    var edda = mkp('Edda Kwan', 'Analyst', { reportsTo: bru.id });
    var finn = mkp('Finn Cole', 'Designer', { reportsTo: 'p_ghost' }); /* dangling on purpose: seeds R9 */
    void finn;
    var E = function (ts, type, data) { st.events.push({ id: mid('se'), ts: ts, type: type, data: data }); };
    E(D(24), 'oneonone.logged', { personId: ana.id, note: 'roadmap stress' });           /* R1: 14d over 10d cadence */
    E(D(3), 'oneonone.logged', { personId: cara.id, note: 'fine' });
    E(D(90), 'skiplevel.logged', { personId: dan.id, note: 'first skip' });               /* R8: 30d over 60d */
    var j; for (j = 0; j < 5; j++) E(D(50 - j * 8), 'feedback.given', { personId: ana.id, polarity: 'corrective', note: 'seed ' + j }); /* R4: 5/5, n≥5 → high */
    for (j = 0; j < 5; j++) E(D(40 - j * 3), 'delegation.assigned', { personId: bru.id, task: 'seed task ' + (j + 1), level: 2 + (j % 3), checkInDate: F(7) }); /* R5: 5 open → sev 3 */
    E(D(50), 'conflict.logged', { aId: ana.id, bId: cara.id, text: 'deployment ownership', intensity: 3 });
    E(D(20), 'conflict.logged', { aId: ana.id, bId: cara.id, text: 'deployment ownership again', intensity: 4 }); /* R6: 2 in 60d, both ids → high */
    E(D(38), 'pulse.recorded', { personId: cara.id, load: 9, mood: 6, measured: true });
    E(D(24), 'pulse.recorded', { personId: cara.id, load: 9, mood: 5, measured: true });
    E(D(10), 'pulse.recorded', { personId: cara.id, load: 8, mood: 4, measured: true });
    E(D(3), 'pulse.recorded', { personId: cara.id, load: 9, mood: 3, measured: true });
    E(D(2), 'pulse.recorded', { personId: cara.id, load: 7, mood: 7, measured: false }); /* estimated: R7 excludes + counts */
    E(D(20), 'decision.logged', { title: 'Cut scope on Q3 launch', severity: 4, reviewDate: D(5) }); /* R2: 5d late, sev 4 */
    E(D(40), 'goal.set', { goalId: mid('sg'), title: 'Reduce deploy time 50%', ownerId: null });     /* R3o + R3s */
    E(D(30), 'goal.set', { goalId: mid('sg'), title: 'Hire senior BE', ownerId: bru.id });           /* R3s */
    E(D(60), 'sl.assessed', { personId: ana.id, competence: 3, commitment: 4, d: 'D2', s: 'S2', note: 'roadmap task' });
    E(D(21), 'plan.created', { personId: ana.id, goal: 'Delegate release owners', task: 'run release retro solo', d: 'D2', s: 'S2', actions: ['shadow one retro', 'co-run next'], reviewBy: D(6) }); /* R10: 6d late, no checkin */
    return st;
  }
  function seed() {
    if (_state.meta.seeded) return { error: 'sample set already used once ever — the flag never resets (purge keeps it). This is deliberate: a twice-seeded store lies about what is real.' };
    if (_readOnly) return { error: 'read-only boot — writes hard-blocked' };
    var s = buildSeed();
    _state.people = _state.people.concat(s.people);
    _state.events = _state.events.concat(s.events);
    _state.meta.seeded = true;
    auditLive('seeded', 'sample set — engineered so R1,R2,R3,R4,R5,R6,R7,R8,R9,R10 all fire (T12 grades this)');
    save();
    return { ok: true };
  }
  function purge() {
    if (_readOnly) return { error: 'read-only boot — writes hard-blocked' };
    var seeded = _state.meta.seeded;
    _state = freshState();
    _state.meta.seeded = seeded; /* once-ever, by design */
    auditLive('purged', 'all people + events destroyed; seededOnce flag kept');
    save();
    return { ok: true };
  }

  /* ---------- boot ---------- */
  function boot() {
    _volatile = !probeStorage();
    var text = beGet(KEY);
    if (text == null) {
      _state = freshState();
      save();
      _boot = { status: 'fresh', quarantined: null, repairs: [] };
    } else {
      var r = loadFromText(text, KEY);
      if (r.status === 'ok') { _state = r.state; _boot = { status: r.migratedFrom != null ? 'migrated' : 'ok', quarantined: null, repairs: r.repairs || [] }; save(); }
      else if (r.status === 'newer') {
        _state = normalize(r.raw) && r.raw; /* in-memory normalize only — NEVER saved */
        _readOnly = true; _readOnlyWhy = r.reason;
        _boot = { status: 'newer', quarantined: null, repairs: [] };
      } else if (r.status === 'migration-failed') {
        _state = r.raw || freshState(); /* parsed but unmigrated — visible, frozen */
        _readOnly = true; _readOnlyWhy = 'migration to v' + SCHEMA + ' failed (' + r.reason + ') — original bytes are safe in quarantine';
        _boot = { status: 'migration-failed', quarantined: r.reason, repairs: [] };
      } else { /* corrupt / malformed / foreign in own key */
        var qk = quarantine(r.status, 'boot found an unreadable main store: ' + r.reason, text, KEY);
        _state = freshState();
        save();
        _boot = { status: r.status, quarantined: qk, repairs: [] };
      }
    }
    if (_volatile) auditLive('volatile-vault', 'localStorage unusable (private mode or blocked) — session memory only; quarantine copies die with this tab');
    return _boot;
  }

  /* ---------- api ---------- */
  api.KEY = KEY; api.SCHEMA = SCHEMA; api.LINEAGE = LINEAGE;
  api.ASSUMED_QUOTA_BYTES = ASSUMED_QUOTA_BYTES;
  api.boot = boot; api.bootStatus = function () { return _boot; };
  api.state = function () { return _state; };
  api.save = save; api.auditLive = auditLive;
  api.readOnly = function () { return _readOnly; };
  api.readOnlyWhy = function () { return _readOnlyWhy; };
  api.volatile = function () { return _volatile; };
  api.mint = mint;
  api.peopleAdd = peopleAdd; api.personUpdate = personUpdate;
  api.saveSettings = saveSettings;
  api.exportText = function () { return JSON.stringify(_state, null, 2); };
  api.importJson = importJson; api.importInto = importInto; api.mergeInto = mergeInto;
  api.loadFromText = loadFromText;
  api.quarantines = listQuarantines; api.readQuarantine = readQuarantine;
  api.seed = seed; api.seededOnce = function () { return _state && _state.meta.seeded === true; };
  api.purge = purge;
  api.storageBytes = function () { var t = beGet(KEY); return t ? t.length : 0; };
  api._findCycle = findCycle; /* exposed for goldens (G12) */
  api._test = { /* js/health.js hooks — disposable keys prefixed leados:t, swept at render */
    freshState: freshState, normalize: normalize, migrate: migrate, MIGRATIONS: MIGRATIONS,
    stable: stable, canonical: canonical, collectIds: collectIds, buildSeed: buildSeed,
    beGet: beGet, beSet: beSet, beRemove: beRemove, beKeys: beKeys,
    quarantine: quarantine,
    setVolatile: function (v) { _volatile = !!v; },
    sweep: function () { beKeys().forEach(function (k) { if (k.indexOf('leados:t') === 0) beRemove(k); }); }
  };
  return api;
})();
