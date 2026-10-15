/* LeadOS mf-3 · js/store.js — storage spine (schema v3, lineage "mf").
   Doctrine (verified by Session-7 audit read of mf-2 store.js):
   trySetItem is the ONLY write path; bad bytes are quarantined to timestamped
   keys and NEVER overwritten; normalization repairs, never drops.
   v3 ladder: 1→2 (reportsTo backfill) · 2→3 (meta.appointment added — the
   arrival instrument needs a start date; null = "not set", module stays silent
   rather than guessing). Pre-migration bytes preserved before any write.
   Current-version loads also normalize (boot audit): repairs counted, rows kept. */
window.LEADOS = window.LEADOS || {};
LEADOS.store = (function () {
  'use strict';
  var CURRENT = 3, LINEAGE = 'mf';
  var idSeq = 0;

  function nowISO() { return new Date().toISOString(); }
  function todayISO() { /* LOCAL calendar date — the day the leader means by "today" */
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function stamp() { return nowISO().replace(/[:.]/g, '-'); }
  function newId(prefix) { idSeq += 1; return prefix + '-' + Date.now().toString(36) + '-' + idSeq; }

  function fresh() {
    return {
      meta: { schemaVersion: CURRENT, lineage: LINEAGE, seeded: false,
        createdAt: nowISO(), writeFailed: false, migrations: [], appointment: null },
      people: [], events: [], log: []
    };
  }
  function isBaseShape(s) { /* enough shape to attempt a migration from */
    return !!(s && typeof s === 'object' && s.meta && typeof s.meta === 'object' &&
      s.meta.lineage === LINEAGE && typeof s.meta.schemaVersion === 'number' &&
      Array.isArray(s.people) && Array.isArray(s.events) && Array.isArray(s.log));
  }
  function isShape(s) { /* strict current-version shape, incl. the v3 field */
    return isBaseShape(s) && s.meta.schemaVersion === CURRENT &&
      ('appointment' in s.meta);
  }

  var MIGRATIONS = {
    /* 1→2 (verified byte-exact against mf-1 fixture in Session 6; carried). */
    1: function (db) {
      var i, n = 0;
      for (i = 0; i < db.people.length; i++) {
        var p = db.people[i];
        if (p && typeof p === 'object' && p.reportsTo === undefined) { p.reportsTo = 'me'; n++; }
      }
      db.meta.migrations = Array.isArray(db.meta.migrations) ? db.meta.migrations : [];
      db.meta.migrations.push({ from: 1, to: 2, at: nowISO(),
        note: 'reportsTo backfilled "me" on ' + n + ' people; event schema unchanged (additive)' });
      db.meta.schemaVersion = 2;
      db.log.push({ ts: nowISO(), kind: 'migration', msg: '1→2 applied; ' + n + ' people backfilled reportsTo="me"' });
      return db;
    },
    /* 2→3: the arrival instrument. Purely additive: meta.appointment := null.
       Null is a REAL value ("leader hasn't told us"), not a guess. */
    2: function (db) {
      db.meta.migrations = Array.isArray(db.meta.migrations) ? db.meta.migrations : [];
      db.meta.migrations.push({ from: 2, to: 3, at: nowISO(),
        note: 'meta.appointment added (null = unset); no event rows touched' });
      db.meta.appointment = null;
      db.meta.schemaVersion = 3;
      db.log.push({ ts: nowISO(), kind: 'migration', msg: '2→3 applied; meta.appointment := null' });
      return db;
    }
  };

  function validTs(ts) { return typeof ts === 'string' && !isNaN(Date.parse(ts)); }

  /* Per-event normalization. Returns {events, repairs}; never drops a row. */
  function normalizeEvents(events, logRow) {
    var out = [], seen = {}, repairs = [], i, ev, e2;
    for (i = 0; i < events.length; i++) {
      ev = events[i]; e2 = (ev && typeof ev === 'object' && !Array.isArray(ev)) ? ev : {};
      if (e2 !== ev) repairs.push('row ' + i + ' was not an object — replaced with empty event shell');
      if (typeof e2.id !== 'string' || !e2.id || seen[e2.id]) {
        var old = e2.id;
        e2.id = newId('e');
        repairs.push('event id ' + (old ? 'duplicate "' + old + '"' : 'missing') + ' re-minted → ' + e2.id);
      }
      seen[e2.id] = true;
      if (!validTs(e2.ts)) { e2.ts = nowISO(); repairs.push('event ' + e2.id + ' had invalid ts — stamped now'); }
      if (typeof e2.type !== 'string' || !e2.type) { e2.type = 'unknown.event'; repairs.push('event ' + e2.id + ' had no type — marked unknown.event'); }
      if (e2.personId != null && typeof e2.personId !== 'string') { e2.personId = null; repairs.push('event ' + e2.id + ' personId non-string — nulled'); }
      if (!e2.data || typeof e2.data !== 'object' || Array.isArray(e2.data)) { e2.data = {}; repairs.push('event ' + e2.id + ' data missing/invalid — replaced with {}'); }
      if (typeof e2.seed !== 'boolean') e2.seed = false;
      out.push(e2);
    }
    if (repairs.length && logRow) {
      logRow('normalize', repairs.length + ' event row(s) repaired in place (none dropped)');
      repairs.slice(0, 50).forEach(function (r) { logRow('repair', r); });
    }
    return { events: out, repairs: repairs };
  }

  /* Import-merge re-minting walker (verified in mf-2): rewrites values whose KEY
     looks like an id reference when the value exists in idMap. */
  function rewire(obj, idMap) {
    var k, v, out, i;
    if (Array.isArray(obj)) { out = []; for (i = 0; i < obj.length; i++) out.push(rewire(obj[i], idMap)); return out; }
    if (obj && typeof obj === 'object') {
      out = {};
      for (k in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        v = obj[k];
        if (typeof v === 'string' && /(^id$|Id$)/.test(k) && idMap[v]) out[k] = idMap[v];
        else if (Array.isArray(v) && /Ids$/.test(k)) out[k] = v.map(function (x) { return idMap[x] || x; });
        else out[k] = rewire(v, idMap);
      }
      return out;
    }
    return obj;
  }

  function qkindOf(k, base) {
    if (k === base) return 'live';
    if (k.indexOf(base + '.') !== 0) return null;
    var rest = k.slice(base.length + 1);
    return rest.split('.')[0]; /* stamp contains no dots (":." → "-"), kind is the first segment */
  }

  function makeStore(key) {
    var state = null;
    function qkey(kind) { /* two quarantines in the same millisecond must BOTH survive */
      var base = key + '.' + kind + '.' + stamp(), k = base, n = 1;
      try { while (localStorage.getItem(k) != null && n < 100) { k = base + '-' + (++n); } } catch (e) { /* fall through */ }
      return k;
    }
    function rawSet(k, v) { localStorage.setItem(k, v); }
    function trySetItem(k, v) {
      try { rawSet(k, v); return { ok: true }; }
      catch (e) {
        var quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
        if (quota) { if (state) state.meta.writeFailed = true; return { ok: false, quota: true }; }
        throw e;
      }
    }
    function quarantine(kind, bytes) {
      try { rawSet(qkey(kind), typeof bytes === 'string' ? bytes : JSON.stringify(bytes)); }
      catch (e) { /* quarantine must never break boot */ }
    }
    function logRow(kind, msg) {
      if (!state) return;
      state.log.push({ ts: nowISO(), kind: kind, msg: msg });
      if (state.log.length > 500) state.log = state.log.slice(-500);
    }

    function runMigrations(parsed, raw) {
      var steps = 0, guard = 0;
      quarantine('pre-migration', raw); /* original bytes preserved BEFORE any write */
      while (parsed.meta.schemaVersion < CURRENT && guard++ < 20) {
        var mig = MIGRATIONS[parsed.meta.schemaVersion];
        if (!mig) return { ok: false };
        parsed = mig(parsed); steps++;
      }
      if (!isBaseShape(parsed)) return { ok: false };
      var nz = normalizeEvents(parsed.events, null);
      parsed.events = nz.events;
      parsed.log.push({ ts: nowISO(), kind: 'migration',
        msg: steps + ' migration step(s) applied; normalized: ' + nz.repairs.length + ' repair(s)' });
      if (!isShape(parsed)) return { ok: false };
      return { ok: true, state: parsed, repairs: nz.repairs.length, steps: steps };
    }

    function load() {
      var raw = localStorage.getItem(key), parsed = null, m;
      if (raw == null) {
        state = fresh();
        logRow('boot', 'no existing data — fresh v' + CURRENT + ' state created');
        return { branch: 'absent' };
      }
      try { parsed = JSON.parse(raw); }
      catch (e) {
        quarantine('corrupt', raw); localStorage.removeItem(key);
        state = fresh(); logRow('boot', 'stored bytes were unparseable — quarantined as corrupt, booted clean');
        return { branch: 'corrupt' };
      }
      m = parsed && parsed.meta;
      if (m && typeof m.schemaVersion === 'number') {
        if (m.lineage !== LINEAGE) {
          quarantine('foreign', raw); localStorage.removeItem(key);
          state = fresh(); logRow('boot', 'foreign lineage "' + m.lineage + '" refused and preserved');
          return { branch: 'foreign' };
        }
        if (m.schemaVersion > CURRENT) {
          quarantine('newer', raw); localStorage.removeItem(key);
          state = fresh(); logRow('boot', 'data from a NEWER version (v' + m.schemaVersion + ') refused and preserved — upgrade the app, never guess');
          return { branch: 'newer' };
        }
        if (m.schemaVersion < CURRENT && isBaseShape(parsed)) {
          var r = runMigrations(parsed, raw);
          if (!r.ok) {
            quarantine('migration-failed', raw); localStorage.removeItem(key);
            state = fresh(); logRow('boot', 'migration from v' + m.schemaVersion + ' FAILED — original preserved, booted clean');
            return { branch: 'migration-failed' };
          }
          state = r.state; state.meta.writeFailed = false;
          var s = save();
          logRow('boot', 'migrated v' + m.schemaVersion + '→v' + CURRENT + (s.ok ? '' : ' (SAVE FAILED: quota)'));
          return { branch: 'migrated', from: m.schemaVersion, repairs: r.repairs, saved: s.ok === true, quota: !!s.quota };
        }
      }
      if (!isShape(parsed)) {
        quarantine('malformed', raw); localStorage.removeItem(key);
        state = fresh(); logRow('boot', 'bytes parsed but failed shape check — quarantined as malformed');
        return { branch: 'malformed' };
      }
      state = parsed;                                  /* current version: still boot-audit */
      var nz = normalizeEvents(state.events, logRow);  /* repairs, never drops */
      state.events = nz.events;
      if (!state.meta.appointment) state.meta.appointment = state.meta.appointment || null;
      logRow('boot', 'loaded v' + CURRENT + ' state: ' + state.people.length + ' people, ' +
        state.events.length + ' events' + (nz.repairs.length ? ', ' + nz.repairs.length + ' repair(s)' : ''));
      return { branch: 'ok', repairs: nz.repairs.length };
    }

    function save() {
      if (!state) return { ok: false, reason: 'no state' };
      state.meta.writeFailed = false;            /* a successful write clears the pill */
      var r = trySetItem(key, JSON.stringify(state));
      if (!r.ok && r.quota) logRow('quota', 'WRITE FAILED — storage full or blocked; in-memory state intact, export NOW');
      return r;
    }

    function exportJSON() { return JSON.stringify(state, null, 2); }

    /* Import pipeline. Refuses: unparseable / malformed / newer / foreign /
       identical-to-live. Migrates same-lineage older. Merges: every imported id
       re-minted, every *Id/*Ids reference rewired; normalization at the gate. */
    function importJSON(text) {
      if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'empty input' };
      var parsed;
      try { parsed = JSON.parse(text); }
      catch (e) { return { ok: false, reason: 'unparseable JSON — refused before touching live state' }; }
      var m = parsed && parsed.meta;
      if (!m || typeof m.schemaVersion !== 'number') return { ok: false, reason: 'no meta.schemaVersion — not a LeadOS export' };
      if (m.lineage !== LINEAGE) return { ok: false, reason: 'foreign lineage "' + m.lineage + '" — refused (no migration invented for code nobody has read)' };
      if (m.schemaVersion > CURRENT) return { ok: false, reason: 'export is from newer v' + m.schemaVersion + ' — upgrade the app first' };
      if (!isBaseShape(parsed)) return { ok: false, reason: 'parsed but malformed (people/events/log must be arrays)' };
      if (JSON.stringify(parsed) === JSON.stringify(state)) return { ok: false, reason: 'identical to live state — nothing to do' };
      var incoming = parsed;
      if (m.schemaVersion < CURRENT) {
        var r = runMigrations(JSON.parse(text), text);
        if (!r.ok) return { ok: false, reason: 'migration of imported v' + m.schemaVersion + ' data failed — refused, live state untouched' };
        incoming = r.state;
      }
      quarantine('pre-import', exportJSON());           /* live bytes recoverable before merge */
      /* two passes: (1) mint ALL new ids — people and events — into one idMap,
         (2) rewire every reference against the COMPLETE map. A single pass breaks
         references that point backwards in the array (outcome before decision). */
      var idMap = {}, i, p, imported = { people: 0, events: 0 };
      var nz = normalizeEvents(incoming.events, logRow);
      for (i = 0; i < incoming.people.length; i++) {
        p = incoming.people[i];
        if (!p || typeof p !== 'object') continue;
        if (p.id) idMap[p.id] = newId('p');
      }
      for (i = 0; i < nz.events.length; i++) idMap[nz.events[i].id] = newId('e');
      for (i = 0; i < incoming.people.length; i++) {
        p = incoming.people[i];
        if (!p || typeof p !== 'object') continue;
        state.people.push({ id: idMap[p.id] || newId('p'),
          name: String(p.name || '').trim() || 'unnamed',
          role: String(p.role || '').trim(), cadenceDays: Math.max(1, parseInt(p.cadenceDays, 10) || 7),
          reportsTo: p.reportsTo, createdAt: validTs(p.createdAt) ? p.createdAt : nowISO(),
          archived: !!p.archived, seed: !!p.seed });
        imported.people++;
      }
      for (i = 0; i < nz.events.length; i++) {
        var ev2 = rewire(nz.events[i], idMap);          /* ids, personId, *Id/*Ids refs */
        state.events.push(ev2); imported.events++;
      }
      for (i = 0; i < state.people.length; i++) {
        p = state.people[i];
        if (p.reportsTo && p.reportsTo !== 'me' && idMap[p.reportsTo]) p.reportsTo = idMap[p.reportsTo];
      }
      if (incoming.meta.appointment && !state.meta.appointment) {
        state.meta.appointment = incoming.meta.appointment;
        logRow('import', 'imported appointment (live had none): ' + JSON.stringify(incoming.meta.appointment));
      }
      if (incoming.meta.seeded) state.meta.seeded = true;
      logRow('import', 'merged ' + imported.people + ' people + ' + imported.events + ' events (ids re-minted, refs rewired, live bytes preserved pre-import)');
      var s = save();
      if (!s.ok) return { ok: false, reason: 'merge built but SAVE FAILED (quota) — live bytes preserved under pre-import key' };
      return { ok: true, mode: 'merged', imported: imported };
    }

    function listKeys() {
      var out = [], i, k;
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i);
        if (k && k.indexOf(key) === 0) {
          var v = localStorage.getItem(k) || '';
          out.push({ key: k, bytes: v.length, kind: qkindOf(k, key) || 'other' });
        }
      }
      return out.sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    }
    function readKey(k) {
      if (!k || k === key || k.indexOf(key + '.') !== 0) return null; /* read-only: quarantines only */
      return localStorage.getItem(k);
    }

    return {
      key: function () { return key; },
      load: load, save: save,
      get: function () { return state; },
      set: function (s) { state = s; },
      exportJSON: exportJSON, importJSON: importJSON,
      listKeys: listKeys, readKey: readKey,
      logRow: logRow,
      _trySetItem: trySetItem, _quarantine: quarantine, _normalize: normalizeEvents
    };
  }

  var main = makeStore('leados:data');
  return {
    CURRENT: CURRENT, LINEAGE: LINEAGE,
    newId: newId, nowISO: nowISO, todayISO: todayISO, fresh: fresh,
    boot: function () { return main.load(); },
    get: main.get, set: main.set, save: main.save,
    exportJSON: main.exportJSON, importJSON: main.importJSON,
    listKeys: main.listKeys, readKey: main.readKey, logRow: main.logRow,
    _makeStore: makeStore           /* health tests run stores on disposable keys */
  };
})();
