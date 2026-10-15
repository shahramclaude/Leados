/* LeadOS pt-2 · js/store.js — the storage spine.
   Lineage 'pt', schema v2. Carried byte-verified from pt-1: one key · quarantine
   timestamped + collision-suffixed + never overwritten · trySetItem-only writes ·
   normalize repairs, never drops · parse funnel (corrupt/malformed/foreign/newer/ok)
   · read-only boot on newer schema · audit capped at 300, the cap leaves a row.
   NEW in pt-2: the ladder's first real step MIGRATIONS['1>2'] (reportsTo hygiene:
   dangling → nulled+counted, cycles broken deterministically+counted, skipCadenceDays
   backfilled) · localStorage-unavailable memory vault with loud volatile banner ·
   import gate migrating older-lineage-same-schema payloads before merge. */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.store = 'js/store.js';

LEADOS.store = (function () {
  'use strict';

  var KEY = 'leados:data';
  var SCHEMA = 2;
  var LINEAGE = 'pt';
  var AUDIT_CAP = 300;
  var ASSUMED_QUOTA_BYTES = 5 * 1024 * 1024; /* labeled assumption, printed in #/data */

  var _state = null;
  var _readOnly = false;
  var _readOnlyWhy = null;
  var _volatile = false;
  var _vault = {};          /* memory backend when localStorage is unusable */
  var _vaultKeys = [];
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
        settings: { weeklyOneOnOneCapacityMin: 240, oneOnOneLengthMin: 50, skipCadenceDefaultDays: 60 }
      },
      people: [],
      events: []
    };
  }

  /* ---------- backend: localStorage, else loud volatile vault ---------- */
  function beGet(k) { return _volatile ? (_vault.hasOwnProperty(k) ? _vault[k] : null) : safeLSGet(k); }
  function safeLSGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
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

  /* ---------- migration ladder ---------- */
  function personById(st, id) { for (var i = 0; i < st.people.length; i++) if (st.people[i] && st.people[i].id === id) return st.people[i]; return null; }

  /* Break reporting cycles deterministically: while any cycle exists, null the
     reportsTo of the lexicographically smallest member id. Returns repair notes. */
  function breakCycles(st) {
    var repairs = [], guard = 0;
    while (guard++ < st.people.length + 2) {
      var cycle = findCycle(st);
      if (!cycle) break;
      var minId = cycle.slice().sort()[0];
      var p = personById(st, minId);
      if (!p) break;
      repairs.push('reporting cycle ' + cycle.join('→') + '→' + cycle[0] + ' broken at ' + minId + ' (reportsTo nulled — re-set the line on the roster)');
      p.reportsTo = null;
    }
    return repairs;
  }
  function findCycle(st) {
    var i, seen, cur, p;
    for (i = 0; i < st.people.length; i++) {
      seen = {}; cur = st.people[i];
      while (cur && cur.reportsTo) {
        if (seen[cur.id]) {
          /* cur is re-visited: collect the cycle members */
          var cyc = [cur.id], n = personById(st, cur.reportsTo);
          while (n && n.id !== cur.id) { cyc.push(n.id); n = personById(st, n.reportsTo); }
          return cyc;
        }
        seen[cur.id] = 1;
        cur = personById(st, cur.reportsTo);
      }
      if (cur && seen[cur.id]) continue;
    }
    return null;
  }
  api._findCycle = findCycle; /* exposed for goldens */

  var MIGRATIONS = {
    '1>2': function (st) {
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
    ['weeklyOneOnOneCapacityMin', 'oneOnOneLengthMin', 'skipCadenceDefaultDays'].forEach(function (k) {
      if (typeof m.settings[k] !== 'number') { m.settings[k] = fs.settings[k]; repairs.push('settings.' + k + ' defaulted to ' + fs.settings[k]); }
    });
    if (!Array.isArray(st.people)) { st.people = []; repairs.push('people was not an array → emptied (rows already lost upstream)'); }
    if (!Array.isArray(st.events)) { st.events = []; repairs.push('events was not an array → emptied (rows already lost upstream)'); }
    st.people.forEach(function (p, i) {
      if (!p || typeof p !== 'object') { st.people[i] = { id: 'prepaired' + i, name: '(repaired row)' }; repairs.push('person row ' + i + ' not an object → placeholder'); return; }
      if (typeof p.id !== 'string' || !p.id) { p.id = 'prepaired' + i; repairs.push('person ' + i + ' missing id → minted'); }
      if (typeof p.name !== 'string') { p.name = String(p.name == null ? '(unnamed)' : p.name); repairs.push('person ' + p.id + ' name coerced'); }
      ['cadenceDays', 'skipCadenceDays'].forEach(function (f) {
        if (p[f] != null && typeof p[f] !== 'number') { p[f] = null; repairs.push('person ' + p.id + ' ' + f + ' non-number → null'); }
      });
      if (p.skipCadenceDays === undefined) p.skipCadenceDays = null;
      if (p.reportsTo != null && typeof p.reportsTo !== 'string') { p.reportsTo = null; repairs.push('person ' + p.id + ' reportsTo non-string → null'); }
      if (typeof p.archived !== 'boolean') p.archived = false;
      if (p.createdAt != null && isNaN(new Date(p.createdAt))) { p.createdAt = null; repairs.push('person ' + p.id + ' createdAt invalid → null'); }
    });
    st.events.forEach(function (e, i) {
      if (!e || typeof e !== 'object') { st.events[i] = { id: 'erepaired' + i, ts: null, type: 'note.added', data: { note: '(repaired row)' } }; repairs.push('event row ' + i + ' not an object → placeholder'); return; }
      if (typeof e.id !== 'string' || !e.id) { e.id = 'erepaired' + i; repairs.push('event ' + i + ' missing id → minted'); }
      if (typeof e.type !== 'string' || !e.type) { e.type = 'note.added'; repairs.push('event ' + e.id + ' missing type → note.added'); }
      if (e.ts == null || isNaN(new Date(e.ts))) { if (e.ts != null) repairs.push('event ' + e.id + ' ts invalid → null (projections skip + count it)'); e.ts = null; }
      if (!e.data || typeof e.data !== 'object' || Array.isArray(e.data)) { e.data = {}; repairs.push('event ' + e.id + ' data not an object → emptied'); }
    });
    /* every load re-checks line hygiene too — repair, never boot broken */
    st.people.forEach(function (p) {
      if (p.reportsTo != null && (!personById(st, p.reportsTo) || personById(st, p.reportsTo).archived || p.reportsTo === p.id)) {
        repairs.push('person ' + p.id + ' line target unusable → nulled'); p.reportsTo = null;
      }
    });
    var cr = breakCycles(st); if (cr.length) repairs = repairs.concat(cr);
    return repairs;
  }

  /* ---------- audit ---------- */
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

  /* ---------- ids / bytes / canonical ---------- */
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
  function canonical(st) { return JSON.stringify(st); }

  /* ---------- quarantine ---------- */
  function quarantineKeyFor(srcKey, kind) {
    var base = srcKey + ':quarantine:' + kind + ':' + nowIso().replace(/[:.]/g, '-');
    var k = base, n = 1;
    while (beGet(k) != null) { n++; k = base + ':' + n; }
    return k;
  }
  function quarantineRaw(srcKey, kind, raw) {
    var qk = quarantineKeyFor(srcKey, kind);
    return beSet(qk, raw) ? qk : null; /* quota-full: quarantine itself can fail; report, never throw */
  }

  /* ---------- parse funnel: pure decision, no side effects ---------- */
  function parseLoad(raw) {
    var obj;
    try { obj = JSON.parse(raw); } catch (e) { return { status: 'corrupt', note: 'JSON.parse threw: ' + e.message }; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { status: 'malformed', note: 'not a plain object' };
    if (!obj.meta || typeof obj.meta !== 'object') return { status: 'malformed', note: 'meta missing' };
    if (typeof obj.meta.lineage === 'string' && obj.meta.lineage !== LINEAGE) return { status: 'foreign', note: 'lineage "' + obj.meta.lineage + '" — cross-lineage import is refused by contract' };
    var v = obj.meta.schemaVersion;
    if (typeof v === 'number' && v > SCHEMA) return { status: 'newer', note: 'schema v' + v + ' > this build\'s v' + SCHEMA + ' — read-only, an old build never clobbers a newer database' };
    return { status: 'ok', obj: obj, version: (typeof v === 'number') ? v : null };
  }

  /* ---------- load text → ready state (migrates if needed). Pure wrt live store. ---------- */
  function loadFromText(raw, srcKey) {
    var step = parseLoad(raw);
    if (step.status !== 'ok') return step;
    var obj = step.obj, staging = null, repairs = [], qk = null;
    var v = (typeof step.version === 'number') ? step.version : 1;
    if (v < SCHEMA) {
      qk = quarantineRaw(srcKey || KEY, 'pre-migration', raw);
      try {
        staging = migrate(JSON.parse(raw), v);
      } catch (e) {
        quarantineRaw(srcKey || KEY, 'migration-failed', raw);
        return { status: 'migration-failed', note: 'step threw: ' + e.message + ' — original bytes quarantined, nothing written' };
      }
      repairs.push('migrated v' + v + ' → v' + SCHEMA + (qk ? ' (pre-migration bytes at ' + qk + ')' : ' (pre-migration quarantine FAILED — quota)'));
      if (staging.meta.migrationRepairs && staging.meta.migrationRepairs.length)
        repairs = repairs.concat(staging.meta.migrationRepairs);
    } else staging = obj;
    var nr = normalize(staging);
    repairs = repairs.concat(nr);
    return { status: v < SCHEMA ? 'migrated' : 'ok', obj: staging, repairs: repairs, quarantineKey: qk, fromV: v };
  }

  /* ---------- save ---------- */
  function save() {
    if (_readOnly) return false;
    var ok = beSet(KEY, canonical(_state));
    if (!ok) {
      _state.meta.writeFailed = true;
      _state.meta.writeFailures++;
      if (LEADOS.ui && typeof LEADOS.ui.writeFailed === 'function') LEADOS.ui.writeFailed();
    } else if (_state.meta.writeFailed) {
      _state.meta.writeFailed = false;
      if (LEADOS.ui && typeof LEADOS.ui.writeOk === 'function') LEADOS.ui.writeOk();
      beSet(KEY, canonical(_state));
    }
    return ok;
  }

  /* ---------- boot ---------- */
  function boot() {
    _volatile = !probeStorage();
    var notes = [];
    if (_volatile) notes.push('localStorage is unavailable (private mode?) — running on SESSION-ONLY memory. Nothing survives a tab close, including quarantine copies. Export from #/data before closing.');
    var raw = beGet(KEY);
    if (raw == null) {
      _state = freshState();
      if (!save()) notes.push('first write failed — quota or vault limits already bind.');
      return { status: 'fresh', notes: notes };
    }
    var r = loadFromText(raw, KEY);
    if (r.status === 'ok' || r.status === 'migrated') {
      _state = r.obj;
      if (r.status === 'migrated') {
        notes.push('store migrated v' + r.fromV + ' → v' + SCHEMA + '; pre-migration bytes kept at ' + (r.quarantineKey || '(quarantine failed)'));
        audit(_state, 'migrated', 'v' + r.fromV + '>v' + SCHEMA + '; repairs: ' + r.repairs.length);
        save();
      }
      if (r.repairs.length > (r.status === 'migrated' ? 1 : 0)) notes.push('normalize repairs on load: ' + r.repairs.length + ' (see #/health T8 for the repair doctrine)');
      return { status: r.status, notes: notes, repairs: r.repairs };
    }
    if (r.status === 'newer') {
      _readOnly = true; _readOnlyWhy = r.note;
      try { _state = JSON.parse(raw); } catch (e) { _state = freshState(); }
      notes.push('READ-ONLY BOOT: ' + r.note + '. Live key left byte-identical; writes hard-blocked.');
      return { status: 'readonly', notes: notes };
    }
    if (r.status === 'migration-failed') {
      _readOnly = true; _readOnlyWhy = r.note;
      try { _state = JSON.parse(raw); } catch (e) { _state = freshState(); }
      notes.push('MIGRATION FAILED, booting read-only: ' + r.note);
      return { status: 'readonly', notes: notes };
    }
    /* corrupt / malformed / foreign: quarantine and start clean */
    var qk = quarantineRaw(KEY, r.status, raw);
    _state = freshState();
    audit(_state, 'quarantined', r.status + ' bytes → ' + (qk || '(quarantine write failed — quota)'));
    save();
    notes.push('Stored bytes were ' + r.status + ' (' + r.note + '). A clean store was started; the damaged copy is preserved read-only at ' + (qk || 'QUARANTINE FAILED — export manually from the key browser') + '.');
    return { status: 'recovered', notes: notes, quarantineKey: qk };
  }

  /* ---------- people rows (rows, not events — cadence/lines are state) ---------- */
  function addPerson(f) {
    var p = {
      id: mintWith(_state, 'p'),
      name: String(f.name || '').trim() || '(unnamed)',
      role: String(f.role || ''),
      team: String(f.team || ''),
      cadenceDays: (typeof f.cadenceDays === 'number' && f.cadenceDays > 0) ? Math.round(f.cadenceDays) : null,
      skipCadenceDays: (typeof f.skipCadenceDays === 'number' && f.skipCadenceDays > 0) ? Math.round(f.skipCadenceDays) : null,
      reportsTo: f.reportsTo || null,
      archived: false,
      createdAt: nowIso()
    };
    _state.people.push(p);
    audit(_state, 'person.added', p.id + ' ' + p.name);
    save();
    return p;
  }
  function updatePerson(id, patch) {
    var p = personById(_state, id);
    if (!p) return { error: 'no such person ' + id };
    if (patch.reportsTo !== undefined) {
      var bad = wouldCreateCycle(id, patch.reportsTo);
      if (bad) return { error: bad };
      p.reportsTo = patch.reportsTo || null;
    }
    if (patch.cadenceDays !== undefined) p.cadenceDays = (typeof patch.cadenceDays === 'number' && patch.cadenceDays > 0) ? Math.round(patch.cadenceDays) : null;
    if (patch.skipCadenceDays !== undefined) p.skipCadenceDays = (typeof patch.skipCadenceDays === 'number' && patch.skipCadenceDays > 0) ? Math.round(patch.skipCadenceDays) : null;
    if (patch.archived !== undefined) p.archived = !!patch.archived;
    if (typeof patch.name === 'string' && patch.name.trim()) p.name = patch.name.trim();
    if (patch.role !== undefined) p.role = String(patch.role);
    if (patch.team !== undefined) p.team = String(patch.team);
    audit(_state, 'person.updated', id + ' ' + Object.keys(patch).join(','));
    save();
    return p;
  }
  /* guard used at write time; the migration/normalize use breakCycles at read time */
  function wouldCreateCycle(personId, newManagerId) {
    if (!newManagerId) return null;
    if (newManagerId === personId) return 'a person cannot report to themselves';
    var cur = personById(_state, newManagerId), guard = 0;
    while (cur && cur.reportsTo && guard++ < _state.people.length + 1) {
      if (cur.reportsTo === personId) return 'refused: ' + (personById(_state, personId) || {}).name + ' is already upstream of ' + cur.name + ' — that line would close a cycle';
      cur = personById(_state, cur.reportsTo);
    }
    return null;
  }

  /* ---------- import: refuse in order, then two-pass merge ----------
     importInto is PURE (health runs it at every render against disposable states);
     importJson is the live wrapper that snapshots, commits, and rolls back on quota. */
  function importInto(liveState, text, srcKey) {
    var r = loadFromText(text, srcKey || (KEY + ':import'));
    if (r.status === 'corrupt' || r.status === 'malformed' || r.status === 'foreign' || r.status === 'newer' || r.status === 'migration-failed')
      return { verdict: 'refused', kind: r.status, note: r.note };
    if (canonical(r.obj) === canonical(liveState))
      return { verdict: 'refused', kind: 'identical', note: 'byte-identical to the live store — nothing to merge' };
    var merged = mergeInto(liveState, r.obj);
    return { verdict: 'merged', state: merged.state, stats: merged.stats, repairs: r.repairs, migratedFrom: r.status === 'migrated' ? r.fromV : null };
  }
  function importJson(text) {
    if (_readOnly) return { verdict: 'read-only', note: 'imports are blocked while read-only: ' + _readOnlyWhy };
    var r = importInto(_state, text);
    if (r.verdict !== 'merged') return r;
    var q0 = quarantineRaw(KEY, 'pre-import', canonical(_state));
    var prev = _state;
    _state = r.state;
    audit(_state, 'imported', 'people +' + r.stats.people + ' events +' + r.stats.events + ' orphans-nulled ' + r.stats.orphansNulled + (r.migratedFrom != null ? (' · payload migrated v' + r.migratedFrom + '>v' + SCHEMA) : ''));
    if (!save()) { _state = prev; return { verdict: 'refused', kind: 'write-failed', note: 'merged state did not fit the quota — live store rolled back untouched; pre-import snapshot at ' + (q0 || 'FAILED') }; }
    if (LEADOS.ui && typeof LEADOS.ui.refresh === 'function') LEADOS.ui.refresh();
    r.snapshot = q0;
    return r;
  }

  /* mergeInto: PURE. Mint every incoming id; rewire every *Id/*Ids/reportsTo;
     unresolvable refs → null + counted (a dangling old id could collide with a
     live one and silently mis-attach). Same-named people may duplicate: accepted,
     printed, ranked in README gaps. */
  function mergeInto(live, incoming) {
    var stats = { people: 0, events: 0, orphansNulled: 0 };
    var idMap = {};   /* old id → new id (people, events, and goal-id semantics) */
    var out = JSON.parse(JSON.stringify(live));
    function remap(key, val) {
      if (val == null) return null;
      if (idMap[val]) return idMap[val];
      stats.orphansNulled++;
      return null;
    }
    /* pass 1: people */
    (incoming.people || []).forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      var np = JSON.parse(JSON.stringify(p));
      var nid = mintWith(out, 'p');
      idMap[p.id] = nid;
      np.id = nid;
      np.reportsTo = null; /* rewired in pass 1b — never trust it mid-flight */
      out.people.push(np);
      stats.people++;
    });
    /* pass 1b: rewire people lines inside the import */
    for (var i = out.people.length - stats.people; i < out.people.length; i++) {
      var old = (incoming.people || [])[i - (out.people.length - stats.people)];
      if (old && old.reportsTo) out.people[i].reportsTo = remap('reportsTo', old.reportsTo);
    }
    /* pass 2: events, in stored order (goal.set mints its goalId before dependents need it) */
    (incoming.events || []).forEach(function (e) {
      if (!e || typeof e !== 'object') return;
      var ne = { id: mintWith(out, 'e'), ts: e.ts || null, type: (typeof e.type === 'string') ? e.type : 'note.added', data: {} };
      idMap[e.id] = ne.id;
      var d = e.data || {};
      Object.keys(d).forEach(function (k) {
        var v = d[k];
        if (k === 'goalId' && e.type === 'goal.set') {
          var ng = 'g' + Math.random().toString(36).slice(2, 8) + (out.meta.idSeq = out.meta.idSeq + 1).toString(36);
          idMap[v] = ng; ne.data[k] = ng;
        } else if (/Ids$/.test(k) && Array.isArray(v)) {
          ne.data[k] = v.map(function (x) { return remap(k, x); }).filter(function (x) { return x != null; });
        } else if (/Id$/.test(k) && typeof v === 'string') {
          ne.data[k] = remap(k, v);
        } else ne.data[k] = v;
      });
      out.events.push(ne);
      stats.events++;
    });
    normalize(out);
    return { state: out, stats: stats };
  }

  /* ---------- export / keys / usage ---------- */
  function exportJson() { return canonical(_state); }
  function quarantineList() {
    return beKeys().filter(function (k) { return k.indexOf(KEY + ':quarantine:') === 0; }).sort();
  }
  function readKey(k) { return beGet(k); }
  function usage() {
    var bytes = utf8Bytes(canonical(_state));
    return { bytes: bytes, assumedQuota: ASSUMED_QUOTA_BYTES, pct: Math.round(bytes / ASSUMED_QUOTA_BYTES * 1000) / 10,
      people: _state.people.length, events: _state.events.length };
  }
  function sweepTestKeys() {
    beKeys().forEach(function (k) { if (k.indexOf('leados:t') === 0) beRemove(k); });
  }

  api.KEY = KEY; api.SCHEMA = SCHEMA; api.LINEAGE = LINEAGE; api.AUDIT_CAP = AUDIT_CAP;
  api.MIGRATIONS = MIGRATIONS;
  api.boot = boot; api.save = save;
  api.state = function () { return _state; };
  api.freshState = freshState;
  api.readOnly = function () { return _readOnly; };
  api.readOnlyWhy = function () { return _readOnlyWhy; };
  api.volatile = function () { return _volatile; };
  api.mint = function (prefix) { return mintWith(_state, prefix); };
  api.mintWith = mintWith;
  api.auditLive = function (a, d) { audit(_state, a, d); };
  api._auditState = audit;
  api.addPerson = addPerson; api.updatePerson = updatePerson; api.wouldCreateCycle = wouldCreateCycle;
  api.importJson = importJson; api.importInto = importInto; api.mergeInto = mergeInto; api.exportJson = exportJson;
  api.parseLoad = parseLoad; api.loadFromText = loadFromText;
  api.quarantineRaw = quarantineRaw; api.quarantineList = quarantineList; api.readKey = readKey;
  api.canonical = canonical; api.usage = usage;
  api.sweepTestKeys = sweepTestKeys;
  api._be = { get: beGet, set: beSet, remove: beRemove, keys: beKeys }; /* health uses the real path with disposable keys */
  return api;
})();
