/* LeadOS mf-2 · js/store.js — storage spine (schema v2, lineage "mf").
   Doctrine carried from mf-1 (verified by Session-6 audit read of store.js):
   trySetItem is the only write path; corrupt/foreign/newer/malformed bytes are
   quarantined to timestamped keys and NEVER overwritten; repairs never drop rows.
   New in v2: a real MIGRATION ladder (permanent constraint: "schema versioning
   WITH migrations"). mf:1→mf:2 is documented and reversible-in-bytes:
     · meta.schemaVersion 1→2, meta.migrations[] appended
     · people[].reportsTo backfilled to "me" (v1 roster = direct leads by definition)
     · every event normalized (id/ts/type/data) — normalization counted as repairs
   Pre-migration bytes are preserved under a .pre-migration. key before any write.
   Foreign lineages (incl. the undocumented monolith "v3") are still refused and
   preserved read-only. No migration is invented for code nobody has read. */
window.LEADOS = window.LEADOS || {};
LEADOS.store = (function () {
  'use strict';
  var CURRENT = 2, LINEAGE = 'mf';
  var idSeq = 0;

  function nowISO() { return new Date().toISOString(); }
  function stamp() { return nowISO().replace(/[:.]/g, '-'); }
  function newId(prefix) { idSeq += 1; return prefix + '-' + Date.now().toString(36) + '-' + idSeq; }

  function fresh() {
    return {
      meta: { schemaVersion: CURRENT, lineage: LINEAGE, seeded: false,
        createdAt: nowISO(), writeFailed: false, migrations: [] },
      people: [], events: [], log: []
    };
  }
  function isBaseShape(s) { /* enough shape to attempt migration from */
    return !!(s && typeof s === 'object' && s.meta && typeof s.meta === 'object' &&
      s.meta.lineage === LINEAGE && typeof s.meta.schemaVersion === 'number' &&
      Array.isArray(s.people) && Array.isArray(s.events) && Array.isArray(s.log));
  }
  function isShape(s) { /* strict current-version shape */
    return isBaseShape(s) && s.meta.schemaVersion === CURRENT;
  }

  var MIGRATIONS = {
    /* documented 1→2. Input: verified v1 shape (read byte-exact in Session 6). */
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
    }
  };

  function validTs(ts) { return typeof ts === 'string' && !isNaN(Date.parse(ts)); }

  /* Per-event normalization. Returns {events, repairs:[]}; never drops a row. */
  function normalizeEvents(events, logRow) {
    var out = [], seen = {}, repairs = [], i, ev, e2;
    for (i = 0; i < events.length; i++) {
      ev = events[i]; e2 = (ev && typeof ev === 'object') ? ev : {};
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
      out.push(e2);
    }
    if (repairs.length && logRow) {
      logRow('normalize', repairs.length + ' event row(s) repaired in place (none dropped)');
      repairs.slice(0, 50).forEach(function (r) { logRow('repair', r); });
    }
    return { events: out, repairs: repairs };
  }

  /* re-minting walker kept verbatim from mf-1 (verified read): rewrites values whose
     KEY looks like an id reference when the value exists in idMap. */
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

  function makeStore(key) {
    var state = null;
    function qkey(kind) { return key + '.' + kind + '.' + stamp(); }
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
      try { rawSet(qkey(kind), typeof bytes === 'string' ? bytes : JSON.stringify(bytes)); } catch (e) { /* never break boot */ }
    }
    function logRow(kind, msg) {
      if (!state) return;
      state.log.push({ ts: nowISO(), kind: kind, msg: msg });
      if (state.log.length > 500) state.log = state.log.slice(-500);
    }

    function load() {
      var raw = localStorage.getItem(key), parsed = null, m, mig;
      if (raw == null) { state = fresh(); return { branch: 'absent' }; }
      try { parsed = JSON.parse(raw); }
      catch (e) {
        quarantine('corrupt', raw); localStorage.removeItem(key);
        state = fresh(); return { branch: 'corrupt' };
      }
      m = parsed && parsed.meta;
      if (m && typeof m.schemaVersion === 'number') {
        if (m.lineage !== LINEAGE) {
          quarantine('foreign', raw); localStorage.removeItem(key);
          state = fresh(); return { branch: 'foreign' };
        }
        if (m.schemaVersion > CURRENT) {
          quarantine('newer', raw); localStorage.removeItem(key);
          state = fresh(); return { branch: 'newer' };
        }
        if (m.schemaVersion < CURRENT && isBaseShape(parsed)) {
          mig = MIGRATIONS[m.schemaVersion];
          if (!mig) {
            quarantine('migration-failed', raw); localStorage.removeItem(key);
            state = fresh(); return { branch: 'malformed' };
          }
          quarantine('pre-migration', raw);              /* bytes preserved BEFORE any write */
          parsed = mig(parsed);
          var nz = normalizeEvents(parsed.events, null); /* ladder upgrade also normalizes rows */
          parsed.events = nz.events;
          parsed.log.push({ ts: nowISO(), kind: 'migration', msg: 'normalized after 1→2: ' + nz.repairs.length + ' repair(s)' });
          if (!isShape(parsed)) {
            quarantine('migration-failed', raw); localStorage.removeItem(key);
            state = fresh(); return { branch: 'malformed' };
          }
          state = parsed; state.meta.writeFailed = false;
          var r = save();
          return { branch: 'migrated', repairs: nz.repairs.length, saved: r.ok === true, quota: !!r.quota };
        }
      }
      if (!isShape(parsed)) {
        quarantine('malformed', raw); localStorage.removeItem(key);
        state = fresh(); return { branch: 'malformed' };
      }
      state = parsed;
      state.meta.writeFailed = false;
      return { branch: 'ok' };
    }

    function save() {
      if (!state) return { ok: false };
      var r = trySetItem(key, JSON.stringify(state));
      if (r.ok && state.meta.writeFailed) {
        state.meta.writeFailed = false;
        trySetItem(key, JSON.stringify(state));
      }
      return r;
    }

    /* integrity sweep: normalize every event row (id/ts/type/data), null dangling
       FKs, never drop. returns repair count; each kind logged. */
    function audit() {
      if (!state) return 0;
      var repairs = 0, i, ev, pids = {};
      for (i = 0; i < state.people.length; i++) if (state.people[i]) pids[state.people[i].id] = true;
      var nz = normalizeEvents(state.events, logRow);
      state.events = nz.events;
      repairs += nz.repairs.length;
      for (i = 0; i < state.people.length; i++) {
        var p = state.people[i];
        if (p && typeof p === 'object' && p.reportsTo === undefined) { p.reportsTo = 'me'; repairs++; logRow('audit', 'person ' + p.id + ' missing reportsTo — backfilled "me"'); }
      }
      for (i = 0; i < state.events.length; i++) {
        ev = state.events[i];
        if (ev.personId != null && !pids[ev.personId]) {
          logRow('audit', 'event ' + ev.id + ' had dangling personId "' + ev.personId + '" — set to null, row kept');
          ev.personId = null; repairs++;
        }
      }
      return repairs;
    }

    function mergeInto(base, inc) {
      var idMap = {}, i, p, ev;
      for (i = 0; i < inc.people.length; i++) idMap[inc.people[i].id] = newId('p');
      for (i = 0; i < inc.events.length; i++) idMap[inc.events[i].id] = newId('e');
      for (i = 0; i < inc.people.length; i++) { p = rewire(inc.people[i], idMap); p.id = idMap[inc.people[i].id]; base.people.push(p); }
      for (i = 0; i < inc.events.length; i++) { ev = rewire(inc.events[i], idMap); ev.id = idMap[inc.events[i].id]; base.events.push(ev); }
      return base;
    }

    function importText(text, opts) {
      opts = opts || {};
      var mode = opts.mode === 'merge' ? 'merge' : 'replace';
      var incoming, m, liveRaw, canon, mig;
      try { incoming = JSON.parse(text); }
      catch (e) { return { ok: false, status: 'unparseable' }; }
      m = incoming && incoming.meta;
      if (m && typeof m.schemaVersion === 'number') {
        if (m.lineage !== LINEAGE) return { ok: false, status: 'refuse-foreign', note: 'unknown lineage — bytes preserved read-only; no auto-migration is invented' };
        if (m.schemaVersion > CURRENT) return { ok: false, status: 'refuse-newer' };
        if (m.schemaVersion < CURRENT) {
          mig = MIGRATIONS[m.schemaVersion];
          if (!mig || !isBaseShape(incoming)) return { ok: false, status: 'refuse-malformed' };
          incoming = mig(incoming);
        }
      }
      if (!isShape(incoming)) return { ok: false, status: 'refuse-malformed' };
      liveRaw = localStorage.getItem(key);
      canon = function (s) { try { return JSON.stringify(JSON.parse(s)); } catch (e) { return s; } };
      if (liveRaw != null && canon(liveRaw) === canon(text)) {
        return { ok: false, status: 'refuse-identical', note: 'byte-identical to live state — a no-op import' };
      }
      var nz = normalizeEvents(incoming.events, null);   /* per-event validation at the gate */
      incoming.events = nz.events;
      if (liveRaw != null) quarantine('pre-import', liveRaw);
      if (mode === 'replace') state = incoming;
      else state = mergeInto(state || fresh(), incoming);
      var repairs = audit();
      logRow('import', mode + ' import applied; ' + nz.repairs.length + ' row repair(s) at gate, ' + repairs + ' integrity repair(s)');
      var r = save();
      return { ok: r.ok !== false, status: 'imported', mode: mode, repairs: repairs + nz.repairs.length, quota: !!r.quota };
    }

    function usage() {
      var raw = null;
      try { raw = localStorage.getItem(key); } catch (e) { /* read-only env */ }
      return { bytes: raw ? raw.length : 0,
        people: state ? state.people.length : 0,
        events: state ? state.events.length : 0,
        log: state ? state.log.length : 0 };
    }

    return {
      key: key, load: load, save: save, audit: audit, importText: importText,
      quarantine: quarantine, usage: usage,
      get: function () { return state; },
      exportText: function () { return JSON.stringify(state, null, 2); },
      _trySetItem: trySetItem, _rawSet: rawSet,
      _normalizeEvents: normalizeEvents
    };
  }

  return {
    CURRENT: CURRENT, LINEAGE: LINEAGE, MIGRATIONS: MIGRATIONS,
    makeStore: makeStore, fresh: fresh, isShape: isShape, isBaseShape: isBaseShape,
    newId: newId, nowISO: nowISO, validTs: validTs
  };
})();
