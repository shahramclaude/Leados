/* LeadOS mf-4 · js/store.js — storage spine (schema v3, lineage "mf").
   Doctrine, verified by direct read of mf-3's store.js head (2026 Session 8):
   trySetItem is the ONLY write path; bad bytes are quarantined to timestamped
   keys and NEVER overwritten (collision-suffixed); normalization repairs,
   never drops. v3 ladder: 1→2 (reportsTo backfill) · 2→3 (meta.appointment —
   null = "leader hasn't said"; the arrival rules stay silent rather than guess).
   Pre-migration bytes preserved BEFORE any write. Boot audit: every load
   re-normalizes; repairs are counted in the log, rows kept.
   mf-4 note: mf-3's store.js TAIL (load pipeline, import) was not readable
   from the authoring environment (fetch truncation, same defect Session 7
   reported) — it is re-authored below to the same contract, marked REV. */
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
    /* 1→2 (verified byte-for-byte against mf-3 head read; carried). */
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
    /* 2→3 (verified against mf-3 head read; carried). Purely additive. */
    2: function (db) {
      db.meta.migrations = Array.isArray(db.meta.migrations) ? db.meta.migrations : [];
      db.meta.migrations.push({ from: 2, to: 3, at: nowISO(),
        note: 'meta.appointment added (null = unset); no event rows touched' });
      db.meta.appointment = null;
      db.meta.schemaVersion = 3;
      db.log.push({ ts: nowISO(), kind: 'migration', msg: '2→3 applied; meta.appointment := null' });
      return db;
    }
    /* mf-4 did NOT add v4: counterpartPersonId is an additive, nullable event
       field inside data{} — normalizeEvents already preserves unknown data
       fields by contract. A schema bump for an additive event field would be
       ceremony, not safety. Recorded here so the decision is auditable. */
  };

  function validTs(ts) { return typeof ts === 'string' && !isNaN(Date.parse(ts)); }

  /* Per-event normalization (mf-3 head, verified byte-for-byte; carried).
     Returns {events, repairs}; never drops a row. Unknown data fields —
     incl. mf-4's counterpartPersonId — pass through untouched. */
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

  /* Import-merge re-minting walker (verified in mf-3 head; carried). Rewrites
     values whose KEY looks like an id reference when the value is in idMap. */
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
    return rest.split('.')[0]; /* stamp contains no dots (":." → "-"), kind is first segment */
  }

  /* REV — re-authored to contract (mf-3 tail unreadable): canonical stringify
     used ONLY for the identical-import refusal. Key order is normalized so a
     re-keyed export of the same data still reads as identical. */
  function canon(o) {
    if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
    if (o && typeof o === 'object') {
      return '{' + Object.keys(o).sort().map(function (k) {
        return JSON.stringify(k) + ':' + canon(o[k]);
      }).join(',') + '}';
    }
    return JSON.stringify(o === undefined ? null : o);
  }
  function sameData(a, b) { /* identity = same people + same events; meta/log are volatile */
    return canon(a.people) === canon(b.people) && canon(a.events) === canon(b.events);
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

    /* REV — re-authored to contract (mf-3 tail unreadable). */
    function load() {
      var raw;
      try { raw = localStorage.getItem(key); }
      catch (e) { state = fresh(); logRow('boot', 'storage unreadable (' + (e && e.name) + ') — running in-memory only'); return state; }
      if (raw == null) { state = fresh(); logRow('boot', 'no existing data — fresh v' + CURRENT + ' state'); return state; }
      var parsed;
      try { parsed = JSON.parse(raw); }
      catch (e) {
        quarantine('corrupt', raw); /* bytes kept, never overwritten */
        state = fresh();
        logRow('boot', 'unparseable live bytes quarantined as "corrupt" — booted clean');
        trySetItem(key, JSON.stringify(state));
        return state;
      }
      var which = classify(parsed);
      if (which !== 'ok') {
        quarantine(which, raw);
        state = fresh();
        logRow('boot', 'live bytes classified "' + which + '" — quarantined, booted clean');
        trySetItem(key, JSON.stringify(state));
        return state;
      }
      /* migration ladder */
      if (parsed.meta.schemaVersion < CURRENT) {
        var m = runMigrations(parsed, raw);
        if (!m.ok) {
          quarantine('migration-failed', raw);
          state = fresh();
          logRow('boot', 'migration ladder failed — bytes preserved as "migration-failed", booted clean');
          trySetItem(key, JSON.stringify(state));
          return state;
        }
        state = m.state;
        save(); /* persist the migrated state immediately */
        return state;
      }
      if (!isShape(parsed)) { /* same version, missing fields — normalize upward */
        if (!('appointment' in parsed.meta)) parsed.meta.appointment = null;
      }
      state = parsed;
      /* boot audit: current-version loads normalize too; repairs counted, rows kept */
      var before = state.events.length;
      var nz = normalizeEvents(state.events, logRow);
      state.events = nz.events;
      logRow('boot', 'audit: ' + before + ' event(s), ' + state.people.length + ' people, ' +
        nz.repairs.length + ' repair(s); schema v' + state.meta.schemaVersion);
      if (nz.repairs.length) save();
      return state;
    }
    function classify(parsed) { /* order matters: most specific first.
      Shapeless-but-parseable is MALFORMED; shaped-but-not-ours is FOREIGN — two different incidents. */
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'malformed';
      if (!parsed.meta || typeof parsed.meta !== 'object') return 'malformed';
      if (parsed.meta.lineage !== LINEAGE) return 'foreign';
      if (typeof parsed.meta.schemaVersion === 'number' && parsed.meta.schemaVersion > CURRENT) return 'newer';
      if (!isBaseShape(parsed)) return 'malformed';
      return 'ok';
    }

    function save() {
      if (!state) return { ok: false, noState: true };
      var r = trySetItem(key, JSON.stringify(state));
      if (!r.ok && r.quota) logRow('quota', 'write failed — quota exceeded; in-memory state intact');
      return r;
    }

    /* REV — re-authored to contract (mf-3 tail unreadable).
       Import pipeline. Refuses: unparseable · malformed · foreign · newer ·
       identical-to-live. Migrates same-lineage older. Two-pass merge: mint
       ALL ids first, then rewire every *Id/*Ids reference. Live bytes are
       preserved as .pre-import. before merging. */
    function importData(text) {
      if (typeof text !== 'string' || !text.trim())
        return { ok: false, reason: 'empty input — nothing to import' };
      var parsed;
      try { parsed = JSON.parse(text); }
      catch (e) { return { ok: false, reason: 'unparseable JSON (' + e.message + ') — refused; nothing was written' }; }
      var which = classify(parsed);
      if (which !== 'ok') return { ok: false, reason: 'payload classified "' + which + '" — refused; nothing was written' };
      if (parsed.meta.schemaVersion < CURRENT) {
        var m = runMigrations(parsed, JSON.stringify(parsed));
        if (!m.ok) return { ok: false, reason: 'migration of the import payload failed — refused' };
        parsed = m.state;
      }
      var nz = normalizeEvents(parsed.events, null); /* gate: normalize BEFORE comparing/merging */
      parsed.events = nz.events;
      if (sameData(parsed, state))
        return { ok: false, reason: 'identical to live data — refused (importing your own export changes nothing)' };

      quarantine('pre-import', JSON.stringify(state)); /* rollback point, timestamped */
      /* pass 1: mint every id */
      var idMap = {}, i;
      for (i = 0; i < parsed.people.length; i++) {
        var p = parsed.people[i];
        if (p && typeof p === 'object' && typeof p.id === 'string') idMap[p.id] = newId('p');
      }
      for (i = 0; i < parsed.events.length; i++)
        if (parsed.events[i] && typeof parsed.events[i].id === 'string') idMap[parsed.events[i].id] = newId('e');
      /* pass 2: rewire every *Id / *Ids reference through idMap */
      var incoming = rewire({ people: parsed.people, events: parsed.events }, idMap);
      incoming.people.forEach(function (p) { if (p && typeof p === 'object') state.people.push(p); });
      incoming.events.forEach(function (e) { state.events.push(e); });
      /* post-merge audit: the union is normalized too — never dropped, repairs logged */
      var post = normalizeEvents(state.events, logRow);
      state.events = post.events;
      logRow('import', 'merged ' + incoming.events.length + ' event(s), ' + incoming.people.length +
        ' people (' + Object.keys(idMap).length + ' ids re-minted, references rewired); post-merge repairs: ' +
        post.repairs.length + '; live bytes preserved as .pre-import.');
      var r = save();
      return { ok: true, mergedEvents: incoming.events.length, mergedPeople: incoming.people.length,
        reminted: Object.keys(idMap).length, writeOk: r.ok };
    }

    function exportText() { return JSON.stringify(state, null, 2); }

    /* key browser: enumerates this store's keys incl. read-only quarantines */
    function browse(prefix) {
      var out = [], base = key;
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k == null) continue;
          if (prefix ? k.indexOf(prefix) !== 0 : (k !== base && k.indexOf(base + '.') !== 0 && k !== base)) continue;
          var v = localStorage.getItem(k) || '';
          var kind = qkindOf(k, base);
          if (prefix && kind == null) kind = 'other';
          out.push({ key: k, kind: kind || 'other', bytes: v.length, readonly: kind !== 'live', preview: v.slice(0, 280) });
        }
      } catch (e) { /* storage enumeration blocked — report what we know */
        out.push({ key: key, kind: 'live', bytes: JSON.stringify(state || {}).length, readonly: false, preview: '' });
      }
      out.sort(function (a, b) { return a.key < b.key ? -1 : 1; });
      return out;
    }
    function dropTestKeys(prefix) { /* #/health cleans up after itself */
      var kill = [], i;
      try {
        for (i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(prefix) === 0) kill.push(k);
        }
        kill.forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) { /* best effort */ }
      return kill.length;
    }

    return {
      CURRENT: CURRENT, LINEAGE: LINEAGE, KEY: key,
      nowISO: nowISO, todayISO: todayISO, newId: newId, fresh: fresh,
      isBaseShape: isBaseShape, isShape: isShape, normalizeEvents: normalizeEvents,
      rewire: rewire, canon: canon, makeStore: makeStore,
      load: load, save: save, quarantine: quarantine, logRow: logRow,
      importData: importData, exportText: exportText, browse: browse, dropTestKeys: dropTestKeys,
      trySetItem: trySetItem, classify: classify, sameData: sameData,
      state: function () { return state; },
      setState: function (s) { state = s; }
    };
  }

  return makeStore('leados:data');
})();
