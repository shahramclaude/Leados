/* LeadOS pt-1 · js/store.js — the storage spine.
   Fresh lineage 'pt', schema v1. NOT carried from upstream 'mf':
   upstream store.js tail was never byte-readable (stated in README audit);
   this is re-authored to the parts of the contract verified by inspection.
   Doctrine: one key · quarantine-on-any-mismatch (timestamped, collision-suffixed,
   never overwritten) · trySetItem-only write path · normalize repairs, never drops ·
   import = refuse unparseable/malformed/foreign/newer/identical, 2-pass merge that
   re-mints every id and rewires every *Id/*Ids/reportsTo reference · newer schema
   = read-only boot (an old build must never clobber a newer database) · audit log
   capped — unbounded audit growth in a one-key store is how the store dies. */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.store = 'js/store.js';

LEADOS.store = (function () {
  'use strict';

  var KEY = 'leados:data';
  var SCHEMA = 1;
  var LINEAGE = 'pt';
  var AUDIT_CAP = 300;
  var ASSUMED_QUOTA_BYTES = 5 * 1024 * 1024; /* labeled assumption, printed in #/data */

  var _state = null;
  var _readOnly = false;
  var _readOnlyWhy = null;
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
        settings: { weeklyOneOnOneCapacityMin: 240, oneOnOneLengthMin: 50 }
      },
      people: [],
      events: []
    };
  }

  /* Migration ladder. v1 is genesis — no steps yet. Steps are added here as
     '1>2': fn(state) → state. loadFromKey snapshots 'pre-migration' BEFORE the
     ladder runs; a throwing step quarantines as 'migration-failed'. Ceremony ≠
     safety: additive fields inside rows/events do NOT get a version bump; the
     normalizer preserves them by contract. */
  var MIGRATIONS = {};

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

  /* normalize: repair in place, count every repair, never drop a row. */
  function normalize(st) {
    var repairs = [];
    if (!st.meta || typeof st.meta !== 'object') { st.meta = {}; repairs.push('meta missing → rebuilt'); }
    var m = st.meta;
    if (typeof m.schemaVersion !== 'number') { m.schemaVersion = SCHEMA; repairs.push('meta.schemaVersion repaired'); }
    if (typeof m.lineage !== 'string') { m.lineage = LINEAGE; repairs.push('meta.lineage repaired'); }
    if (!Array.isArray(m.audit)) { m.audit = []; repairs.push('meta.audit rebuilt'); }
    if (typeof m.auditSeq !== 'number') { m.auditSeq = m.audit.length; }
    if (typeof m.idSeq !== 'number') { m.idSeq = 0; }
    if (typeof m.seeded !== 'boolean') { m.seeded = false; }
    if (typeof m.writeFailed !== 'boolean') { m.writeFailed = false; }
    if (typeof m.writeFailures !== 'number') { m.writeFailures = 0; }
    if (!m.settings || typeof m.settings !== 'object') { m.settings = {}; }
    if (typeof m.settings.weeklyOneOnOneCapacityMin !== 'number') m.settings.weeklyOneOnOneCapacityMin = 240;
    if (typeof m.settings.oneOnOneLengthMin !== 'number') m.settings.oneOnOneLengthMin = 50;
    if (!Array.isArray(st.people)) { st.people = []; repairs.push('people was not an array → emptied (rows were already lost upstream)'); }
    if (!Array.isArray(st.events)) { st.events = []; repairs.push('events was not an array → emptied (rows were already lost upstream)'); }
    st.people.forEach(function (p, i) {
      if (!p || typeof p !== 'object') { st.people[i] = { id: 'p' + i, name: '(repaired row)', seed: true }; repairs.push('person row ' + i + ' was not an object → placeholder'); return; }
      if (typeof p.id !== 'string' || !p.id) { p.id = 'prepaired' + i; repairs.push('person ' + i + ' missing id → minted'); }
      if (typeof p.name !== 'string') { p.name = String(p.name == null ? '(unnamed)' : p.name); repairs.push('person ' + p.id + ' name coerced'); }
      if (p.cadenceDays != null && typeof p.cadenceDays !== 'number') { p.cadenceDays = null; repairs.push('person ' + p.id + ' cadenceDays non-number → null'); }
      if (p.reportsTo != null && typeof p.reportsTo !== 'string') { p.reportsTo = null; repairs.push('person ' + p.id + ' reportsTo non-string → null'); }
      if (typeof p.archived !== 'boolean') p.archived = false;
      if (p.createdAt != null && isNaN(new Date(p.createdAt))) { p.createdAt = null; repairs.push('person ' + p.id + ' createdAt invalid → null'); }
    });
    st.events.forEach(function (e, i) {
      if (!e || typeof e !== 'object') { st.events[i] = { id: 'erepaired' + i, ts: null, type: 'note.added', data: { note: '(repaired row)' } }; repairs.push('event row ' + i + ' was not an object → placeholder'); return; }
      if (typeof e.id !== 'string' || !e.id) { e.id = 'erepaired' + i; repairs.push('event ' + i + ' missing id → minted'); }
      if (typeof e.type !== 'string' || !e.type) { e.type = 'note.added'; repairs.push('event ' + e.id + ' missing type → note.added'); }
      if (e.ts == null || isNaN(new Date(e.ts))) { if (e.ts != null) repairs.push('event ' + e.id + ' ts invalid → null (projections will skip + count it)'); e.ts = null; }
      if (!e.data || typeof e.data !== 'object' || Array.isArray(e.data)) { e.data = {}; repairs.push('event ' + e.id + ' data not an object → emptied'); }
    });
    return repairs;
  }

  function audit(st, action, detail) {
    st.meta.auditSeq = (st.meta.auditSeq || 0) + 1;
    st.meta.audit.push({ seq: st.meta.auditSeq, ts: nowIso(), action: action, detail: detail || '' });
    if (st.meta.audit.length > AUDIT_CAP) {
      var dropped = st.meta.audit.length - AUDIT_CAP + 1;
      st.meta.audit.splice(0, dropped);
      st.meta.auditSeq++;
      st.meta.audit.push({ seq: st.meta.auditSeq, ts: nowIso(), action: 'audit-cap-trimmed', detail: 'dropped ' + dropped + ' oldest row(s); cap ' + AUDIT_CAP + ' — the cap itself leaves a row' });
      while (st.meta.audit.length > AUDIT_CAP) st.meta.audit.splice(0, 1);
    }
  }

  function trySet(k, v) {
    try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
  }

  function idTaken(st, id) {
    var i;
    for (i = 0; i < st.people.length; i++) if (st.people[i].id === id) return true;
    for (i = 0; i < st.events.length; i++) if (st.events[i].id === id) return true;
    return false;
  }
  function mintWith(st, prefix) {
    var id;
    do { st.meta.idSeq = (st.meta.idSeq || 0) + 1; id = prefix + Math.random().toString(36).slice(2, 8) + st.meta.idSeq.toString(36); } while (idTaken(st, id));
    return id;
  }

  function utf8Bytes(s) { try { return unescape(encodeURIComponent(s)).length; } catch (e) { return s.length; } }

  function quarantineKeyFor(srcKey, kind) {
    var base = srcKey + ':quarantine:' + kind + ':' + nowIso().replace(/[:.]/g, '-');
    var k = base, n = 1;
    while (localStorage.getItem(k) != null) { n++; k = base + ':' + n; }
    return k;
  }
  function quarantineRaw(srcKey, kind, raw) {
    var qk = quarantineKeyFor(srcKey, kind);
    var ok = trySet(qk, raw);
    return ok ? qk : null; /* quota-full: quarantine itself can fail; we report, we never throw */
  }

  /* parseLoad: pure decision funnel. No side effects — quarantining is the caller's job. */
  function parseLoad(raw) {
    var obj;
    try { obj = JSON.parse(raw); } catch (e) { return { status: 'corrupt', note: 'JSON.parse threw: ' + e.message }; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { status: 'malformed', note: 'not a plain object' };
    if (!obj.meta || typeof obj.meta !== 'object') return { status: 'malformed', note: 'meta missing' };
    if (obj.meta.lineage !== LINEAGE) return { status: 'foreign', note: 'lineage "' + obj.meta.lineage + '" ≠ "' + LINEAGE + '"' };
    var sv = obj.meta.schemaVersion;
    if (typeof sv !== 'number') return { status: 'malformed', note: 'schemaVersion missing/non-number' };
    if (sv > SCHEMA) return { status: 'newer', note: 'v' + sv + ' > build v' + SCHEMA, fromVersion: sv };
    var migratedFrom = null;
    if (sv < SCHEMA) {
      migratedFrom = sv;
      try { obj = migrate(obj, sv); } catch (e2) { return { status: 'migration-failed', note: e2.message, fromVersion: sv }; }
    }
    var repairs = normalize(obj);
    return { status: repairs.length ? 'repaired' : (migratedFrom != null ? 'ok-migrated' : 'ok'), state: obj, repairs: repairs, fromVersion: migratedFrom };
  }

  /* loadFromKey: full path incl. quarantine side effects. Used by boot (KEY) and
     by the health wall (disposable 'leados:t*' keys). */
  function loadFromKey(key) {
    var raw;
    try { raw = localStorage.getItem(key); } catch (e) { return { status: 'storage-unreadable', state: freshState(), note: e.message }; }
    if (raw == null) return { status: 'empty', state: freshState() };
    var r = parseLoad(raw);
    if (r.status === 'newer') {
      /* Live key is left byte-identical, forever. No quarantine copy either —
         copying bits is still touching what we don't understand. */
      return { status: 'newer', readOnly: true, note: r.note, fromVersion: r.fromVersion };
    }
    if (r.state) return r;
    var qk = quarantineRaw(key, r.status, raw);
    var st = freshState();
    audit(st, 'quarantine', r.status + ' from ' + key + ' → ' + (qk || 'QUARANTINE-WRITE-FAILED') + (r.note ? ' · ' + r.note : ''));
    return { status: r.status, state: st, quarantined: true, qkey: qk, note: r.note };
  }

  function notifyPill() {
    if (typeof api.onPill === 'function') {
      api.onPill(_readOnly ? 'read-only' : (_state && _state.meta.writeFailed ? 'failed' : 'ok'));
    }
  }

  api.KEY = KEY; api.SCHEMA = SCHEMA; api.LINEAGE = LINEAGE;
  api.AUDIT_CAP = AUDIT_CAP; api.ASSUMED_QUOTA_BYTES = ASSUMED_QUOTA_BYTES;
  api.MIGRATIONS = MIGRATIONS;
  api.freshState = freshState; api.parseLoad = parseLoad; api.loadFromKey = loadFromKey;
  api.normalize = normalize; api.trySet = trySet; api.utf8Bytes = utf8Bytes;
  api.canonical = function (st) { return JSON.stringify(st); };
  api.state = function () { return _state; };
  api.isReadOnly = function () { return _readOnly; };
  api.readOnlyWhy = function () { return _readOnlyWhy; };
  api.auditLive = function (action, detail) { if (_state) audit(_state, action, detail); };
  api._auditState = audit; /* health wall harness: cap test runs against a disposable state, never the live log */

  /* bootLoad: the production boot path. Returns a summary the shell prints. */
  api.bootLoad = function () {
    var r = loadFromKey(KEY);
    if (r.status === 'newer') {
      _readOnly = true;
      _readOnlyWhy = 'storage holds schema v' + r.fromVersion + ' > this build v' + SCHEMA + ' — read-only boot; live key untouched (verified byte-identical by never writing)';
      _state = freshState(); /* in-memory scratch so the UI is explorable; save() is hard-blocked */
      notifyPill();
      return r;
    }
    _readOnly = false; _readOnlyWhy = null;
    _state = r.state;
    if (r.status === 'repaired') audit(_state, 'normalized-on-boot', (r.repairs || []).length + ' repair(s)');
    notifyPill();
    return r;
  };

  api.save = function () {
    if (_readOnly) return false; /* hard block — not even an attempt */
    if (!_state) return false;
    var ok = trySet(KEY, JSON.stringify(_state));
    if (!ok) {
      _state.meta.writeFailed = true;
      _state.meta.writeFailures++;
      audit(_state, 'write-failed', 'setItem threw or quota exceeded (~' + ASSUMED_QUOTA_BYTES + ' B assumed budget) — in-memory state intact, pill red');
      notifyPill();
      return false;
    }
    if (_state.meta.writeFailed) { _state.meta.writeFailed = false; }
    notifyPill();
    return true;
  };

  api.mint = function (prefix) { return mintWith(_state, prefix); };
  api.exportText = function () { return JSON.stringify(_state, null, 2); };
  api.footprint = function () {
    var raw = localStorage.getItem(KEY);
    return { bytes: raw == null ? 0 : utf8Bytes(raw), quota: ASSUMED_QUOTA_BYTES, readOnly: _readOnly, writeFailures: _state ? _state.meta.writeFailures : 0 };
  };

  /* Import: plan first (pure), then apply (side effects). Verdicts are ordered —
     refuse before migrate before merge. Identical = exact byte match with a live
     export; an edited export merges by 2-pass re-mint. */
  api.planImport = function (text) {
    if (typeof text !== 'string' || !text.trim()) return { verdict: 'unparseable', note: 'empty input' };
    var obj;
    try { obj = JSON.parse(text); } catch (e) { return { verdict: 'unparseable', note: e.message }; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !obj.meta || !Array.isArray(obj.people) || !Array.isArray(obj.events))
      return { verdict: 'malformed', note: 'needs {meta, people[], events[]}' };
    if (obj.meta.lineage !== LINEAGE) return { verdict: 'foreign', note: 'lineage "' + obj.meta.lineage + '" ≠ "' + LINEAGE + '" — cross-lineage import is not claimed' };
    if (typeof obj.meta.schemaVersion !== 'number') return { verdict: 'malformed', note: 'schemaVersion missing' };
    if (obj.meta.schemaVersion > SCHEMA) return { verdict: 'newer', note: 'v' + obj.meta.schemaVersion + ' > build v' + SCHEMA };
    if (text.trim() === api.exportText().trim()) return { verdict: 'identical', note: 'byte-identical to live — nothing to merge' };
    if (obj.meta.schemaVersion < SCHEMA) {
      try { obj = migrate(obj, obj.meta.schemaVersion); } catch (e2) { return { verdict: 'migration-failed', note: e2.message }; }
    }
    normalize(obj);
    return { verdict: 'mergeable', incoming: obj, note: obj.people.length + ' people, ' + obj.events.length + ' events' };
  };

  /* mergeInto(target, incoming): the pure two-pass merge (no quarantine/audit/save) —
     health T9 exercises exactly this against a disposable state. Pass 1 mints every id.
     Pass 2 rewires ONLY the imported clones: keys ending Id/Ids and reportsTo (the
     mf-4 miss upstream). Unresolvable refs are NULLED + counted — never left pointing
     at an old id, because an old id can collide with a live one and silently attach
     imported data to the wrong person. */
  api.mergeInto = function (target, incoming) {
    var idMap = {}, relinkFails = 0, peopleAdded = 0, eventsAdded = 0, i, k;
    var newPeople = [], newEvents = [];
    for (i = 0; i < incoming.people.length; i++) {
      var p = JSON.parse(JSON.stringify(incoming.people[i]));
      var np = mintWith(target, 'p'); idMap[incoming.people[i].id] = np; p.id = np;
      target.people.push(p); newPeople.push(p); peopleAdded++;
    }
    for (i = 0; i < incoming.events.length; i++) {
      var e = JSON.parse(JSON.stringify(incoming.events[i]));
      var ne = mintWith(target, 'e'); idMap[incoming.events[i].id] = ne; e.id = ne;
      target.events.push(e); newEvents.push(e); eventsAdded++;
    }
    var rewire = function (v) { if (v == null) return null; if (idMap[v]) return idMap[v]; relinkFails++; return null; };
    for (i = 0; i < newPeople.length; i++) {
      if (newPeople[i].reportsTo != null) newPeople[i].reportsTo = rewire(newPeople[i].reportsTo);
    }
    for (i = 0; i < newEvents.length; i++) {
      var d = newEvents[i].data;
      if (!d) continue;
      for (k in d) {
        if (!d.hasOwnProperty(k)) continue;
        if (/Ids$/.test(k) && Array.isArray(d[k])) {
          relinkFails += 0;
          var arr = d[k].map(function (v) { return typeof v === 'string' && v ? rewire(v) : null; }).filter(function (v) { return v != null; });
          d[k] = arr;
        } else if ((/Id$/.test(k) || k === 'reportsTo') && typeof d[k] === 'string' && d[k]) {
          d[k] = rewire(d[k]);
        }
      }
    }
    return { peopleAdded: peopleAdded, eventsAdded: eventsAdded, relinkFails: relinkFails, idsReMinted: Object.keys(idMap).length };
  };

  api.applyImport = function (incoming) {
    if (_readOnly) return { error: 'read-only boot — import blocked' };
    api.quarantineLive('pre-import');
    var stats = api.mergeInto(_state, incoming);
    audit(_state, 'import-merged', 'people +' + stats.peopleAdded + ', events +' + stats.eventsAdded + ', ids re-minted ' + stats.idsReMinted + ', unresolved refs nulled ' + stats.relinkFails + (stats.relinkFails ? ' (printed, not guessed)' : ''));
    api.save();
    stats.note = 'same-named duplicate people are possible on merge — accepted gap, ranked';
    return stats;
  };

  api.quarantineLive = function (kind) {
    var raw = localStorage.getItem(KEY);
    if (raw == null) return null;
    var qk = quarantineRaw(KEY, kind, raw);
    audit(_state, 'quarantine-snapshot', kind + ' → ' + (qk || 'WRITE-FAILED'));
    return qk;
  };

  /* Key browser: read-only enumeration. Quarantine bytes are never mutated here. */
  api.quarantineKeys = function () {
    var out = [], i, k;
    try {
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i);
        if (!k || k.indexOf('leados:') !== 0 || k === KEY) continue;
        var v = localStorage.getItem(k) || '';
        var kind = (k.split(':')[2] || '?');
        out.push({ key: k, kind: kind, bytes: utf8Bytes(v) });
      }
    } catch (e) { /* storage enumeration blocked — return what we have */ }
    out.sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    return out;
  };
  api.readKey = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  api.sweepDisposable = function () {
    var killed = 0, i, k, list = [];
    for (i = 0; i < localStorage.length; i++) { k = localStorage.key(i); if (k && k.indexOf('leados:t') === 0) list.push(k); }
    for (i = 0; i < list.length; i++) { try { localStorage.removeItem(list[i]); killed++; } catch (e) {} }
    return killed;
  };

  api.onPill = null;
  return api;
})();
