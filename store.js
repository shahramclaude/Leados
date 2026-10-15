/* LeadOS mf-5 · js/store.js — storage spine (schema v3, lineage "mf").
   ── Provenance (authoring-environment reads, mf-5 session) ─────────────
   HEAD-of-file VERIFIED-CARRIED from mf-4 store.js raw read: CURRENT/LINEAGE,
   fresh() shape, isBaseShape/isShape, MIGRATIONS 1→2 + 2→3 (bodies adapted),
   normalizeEvents (repairs, never drops), rewire walker regexes, canon/
   sameData, qkey collision suffix, trySetItem prelude. Everything from the
   middle of trySetItem onward was TRUNCATED upstream → re-authored to the
   README contract, marked REV. normalizePeople, the reportsTo rewire fix,
   log-capping, read-only-on-newer and the force-stamp test hook are NEW
   (mf-5), each labeled where it lives.
   ─────────────────────────────────────────────────────────────────────── */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.store = 'js/store.js';

LEADOS.store = (function () {
  'use strict';
  var CURRENT = 3, LINEAGE = 'mf', KEY = 'leados:data';
  var LOG_MAX = 300;              /* NEW mf-5: unbounded log growth in a one-key
                                     store eventually dies of its own audit trail. */
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
        createdAt: nowISO(), writeFailed: false, migrations: [], appointment: null,
        lastBootRepairs: 0 },
      people: [], events: [], log: []
    };
  }
  function isBaseShape(s) { /* enough shape to attempt a migration from */
    return !!(s && typeof s === 'object' && s.meta && typeof s.meta === 'object' &&
      s.meta.lineage === LINEAGE && typeof s.meta.schemaVersion === 'number' &&
      Array.isArray(s.people) && Array.isArray(s.events) && Array.isArray(s.log));
  }
  function isShape(s) {
    return isBaseShape(s) && s.meta.schemaVersion === CURRENT && ('appointment' in s.meta);
  }

  /* capLog — NEW mf-5. Keeps the audit useful (recent tail) and honest
     (the cap itself leaves a row). */
  function capLog(state) {
    if (!Array.isArray(state.log)) { state.log = []; return; }
    if (state.log.length > LOG_MAX) {
      var dropped = state.log.length - LOG_MAX + 1;
      state.log.splice(0, dropped);
      state.log.unshift({ ts: nowISO(), kind: 'log-cap',
        msg: dropped + ' oldest audit row(s) dropped at cap ' + LOG_MAX });
    }
  }
  function pushLog(state, kind, msg) {
    if (!Array.isArray(state.log)) state.log = [];
    state.log.push({ ts: nowISO(), kind: kind, msg: String(msg) });
    capLog(state);
  }

  var MIGRATIONS = {
    /* 1→2 (verified-carried; body adapted to pushLog). */
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
      pushLog(db, 'migration', '1→2 applied; ' + n + ' people backfilled reportsTo="me"');
      return db;
    },
    /* 2→3 (verified-carried; purely additive). mf-5 adds NO v4: meeting.series,
       premortem.held, goal.assigned and decision.severity are all additive
       event/data fields which normalizeEvents preserves by contract. Ceremony
       ≠ safety; recorded here so the decision is auditable. */
    2: function (db) {
      db.meta.migrations = Array.isArray(db.meta.migrations) ? db.meta.migrations : [];
      db.meta.migrations.push({ from: 2, to: 3, at: nowISO(),
        note: 'meta.appointment added (null = unset); no event rows touched' });
      db.meta.appointment = null;
      db.meta.schemaVersion = 3;
      pushLog(db, 'migration', '2→3 applied; meta.appointment := null');
      return db;
    }
  };

  function validTs(ts) { return typeof ts === 'string' && !isNaN(Date.parse(ts)); }

  function normalizeEvents(events, logRow) { /* verified-carried */
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

  /* normalizePeople — NEW mf-5 (symmetric with events). People rows carry the
     same never-drop doctrine; unknown fields pass through untouched. */
  function normalizePeople(people, logRow) {
    var out = [], seen = {}, repairs = [], i, p, q;
    for (i = 0; i < people.length; i++) {
      p = people[i]; q = (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};
      if (q !== p) repairs.push('person row ' + i + ' was not an object — replaced with shell');
      if (typeof q.id !== 'string' || !q.id || seen[q.id]) {
        var old = q.id; q.id = newId('p');
        repairs.push('person id ' + (old ? 'duplicate "' + old + '"' : 'missing') + ' re-minted → ' + q.id);
      }
      seen[q.id] = true;
      if (typeof q.name !== 'string' || !q.name.trim()) { q.name = q.name ? String(q.name) : 'unnamed'; repairs.push('person ' + q.id + ' name repaired'); }
      if (typeof q.cadenceDays !== 'number' || !(q.cadenceDays > 0) || q.cadenceDays > 365) {
        if (q.cadenceDays !== undefined) repairs.push('person ' + q.id + ' cadenceDays invalid — reset to 14');
        q.cadenceDays = 14;
      }
      if (typeof q.reportsTo !== 'string' || !q.reportsTo) { q.reportsTo = 'me'; }
      if (typeof q.archived !== 'boolean') q.archived = false;
      if (typeof q.role !== 'string') q.role = '';
      out.push(q);
    }
    if (repairs.length && logRow) {
      logRow('normalize', repairs.length + ' person row(s) repaired in place (none dropped)');
      repairs.slice(0, 50).forEach(function (r) { logRow('repair', r); });
    }
    return { people: out, repairs: repairs };
  }

  /* Import-merge rewiring walker (head verified-carried). NEW mf-5 FIX: person
     rows' `reportsTo` is an id reference that neither /(^id$|Id$)/ nor /Ids$/
     matches — upstream imports silently broke skip-level chains (lineToMe →
     silence). rewirePersonRows() below closes that hole; 'me' passes through
     because idMap never contains it. */
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
  function rewirePersonRows(people, idMap) { /* NEW mf-5 */
    return people.map(function (p) {
      var q = rewire(p, idMap);
      if (q && typeof q === 'object' && typeof q.reportsTo === 'string' && idMap[q.reportsTo]) {
        q.reportsTo = idMap[q.reportsTo];
      }
      return q;
    });
  }

  function qkindOf(k, base) {
    if (k === base) return 'live';
    if (k.indexOf(base + '.') !== 0) return null;
    var rest = k.slice(base.length + 1);
    return rest.split('.')[0]; /* stamp contains no dots (":." → "-"), kind is first segment */
  }

  /* REV — re-authored to contract: canonical stringify used ONLY for the
     identical-import refusal. */
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

  var forceStamp = null; /* test hook (T12): make two quarantines land on one stamp */

  function makeStore(key) {
    var state = null;
    var readOnly = false; /* true when storage holds a NEWER schema — never overwrite it */

    function qkey(kind) { /* two quarantines in the same millisecond must BOTH survive */
      var st = forceStamp || stamp();
      var base = key + '.' + kind + '.' + st, k = base, n = 1;
      try { while (localStorage.getItem(k) != null && n < 200) { k = base + '-' + (++n); } } catch (e) { /* fall through */ }
      return k;
    }
    function quarantine(kind, payload) { /* REV — never overwrites; failure here must not kill boot */
      var k = qkey(kind);
      try {
        localStorage.setItem(k, typeof payload === 'string' ? payload : JSON.stringify(payload));
      } catch (e) { /* quota on the quarantine itself: keep the row in the in-memory log only */ }
      return k;
    }
    function trySetItem(k, v) { /* the ONLY write path */
      try { localStorage.setItem(k, v); return { ok: true }; }
      catch (e) {
        var quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
        return { ok: false, reason: quota ? 'quota' : 'io', error: String(e && e.message || e) };
      }
    }

    function runMigrations(db) { /* REV to contract; pre-migration bytes preserved BEFORE any write */
      var from = db.meta.schemaVersion;
      quarantine('pre-migration', JSON.stringify(db));
      var v = from;
      while (v < CURRENT) {
        if (typeof MIGRATIONS[v] !== 'function') throw new Error('no migration registered for v' + v);
        db = MIGRATIONS[v](db);
        v = db.meta.schemaVersion;
        if (v <= from) throw new Error('migration v' + from + ' did not advance schemaVersion');
        from = v;
      }
      return db;
    }

    function load() {
      readOnly = false;
      var raw;
      try { raw = localStorage.getItem(key); } catch (e) { raw = null; }
      if (raw == null) {
        state = fresh();
        state.meta.lastBootRepairs = 0;
        pushLog(state, 'boot', 'no stored state — fresh v' + CURRENT + ' state created (not yet written)');
        return { ok: true, from: 'empty' };
      }
      var parsed;
      try { parsed = JSON.parse(raw); }
      catch (e) {
        quarantine('corrupt', raw);
        state = fresh();
        pushLog(state, 'boot', 'stored bytes unparseable — quarantined as corrupt, booted fresh');
        return { ok: true, from: 'corrupt' };
      }
      if (!parsed || typeof parsed !== 'object' || !parsed.meta || typeof parsed.meta !== 'object' ||
          !Array.isArray(parsed.people) || !Array.isArray(parsed.events)) {
        quarantine('malformed', raw);
        state = fresh();
        pushLog(state, 'boot', 'stored JSON failed base shape — quarantined as malformed, booted fresh');
        return { ok: true, from: 'malformed' };
      }
      if (parsed.meta.lineage !== LINEAGE) {
        quarantine('foreign', raw);
        state = fresh();
        pushLog(state, 'boot', 'stored lineage "' + parsed.meta.lineage + '" ≠ "' + LINEAGE + '" — quarantined as foreign, booted fresh');
        return { ok: true, from: 'foreign' };
      }
      if (typeof parsed.meta.schemaVersion === 'number' && parsed.meta.schemaVersion > CURRENT) {
        /* NEW mf-5: newer data is PRECIOUS. Inspect copy → quarantine; live key left
           untouched; boot EMPTY and READ-ONLY so a save can never clobber it. */
        quarantine('newer', raw);
        readOnly = true;
        state = fresh();
        pushLog(state, 'boot', 'stored schema v' + parsed.meta.schemaVersion + ' is newer than v' + CURRENT +
          ' — live key untouched, booted read-only. Export here will NOT overwrite stored data.');
        return { ok: true, from: 'newer' };
      }
      var db = parsed;
      if (!isShape(db)) {
        if (isBaseShape(db)) {
          try { db = runMigrations(db); }
          catch (e) {
            quarantine('migration-failed', raw);
            state = fresh();
            pushLog(state, 'boot', 'migration failed (' + e.message + ') — original bytes quarantined, booted fresh');
            return { ok: true, from: 'migration-failed' };
          }
        } else {
          quarantine('malformed', raw);
          state = fresh();
          pushLog(state, 'boot', 'stored JSON failed shape — quarantined as malformed, booted fresh');
          return { ok: true, from: 'malformed' };
        }
      }
      var repairs = 0;
      var en = normalizeEvents(db.events || [], function (k, m) { pushLog(db, k, m); });
      var pn = normalizePeople(db.people || [], function (k, m) { pushLog(db, k, m); });
      db.events = en.events; db.people = pn.people;
      repairs = en.repairs.length + pn.repairs.length;
      if (!Array.isArray(db.log)) db.log = [];
      db.meta.lastBootRepairs = repairs;
      capLog(db);
      state = db;
      pushLog(state, 'boot', 'loaded v' + state.meta.schemaVersion + ' · ' + state.people.length + ' people · ' +
        state.events.length + ' events · ' + repairs + ' repair(s) this boot');
      if (repairs > 0 || db.meta.schemaVersion !== undefined) save(); /* persist repairs/migrations */
      return { ok: true, from: 'stored', repairs: repairs };
    }

    function save() {
      if (!state) return { ok: false, reason: 'no-state' };
      if (readOnly) {
        pushLog(state, 'save-blocked', 'read-only mode (newer schema in storage) — live key untouched');
        return { ok: false, reason: 'read-only' };
      }
      state.meta.updatedAt = nowISO();
      var r = trySetItem(key, JSON.stringify(state));
      if (!r.ok) {
        state.meta.writeFailed = true;
        pushLog(state, 'write-failed', r.reason + (r.error ? ' · ' + r.error : '') +
          ' — in-memory state intact; export a backup before clearing anything');
      } else if (state.meta.writeFailed) {
        state.meta.writeFailed = false;
        pushLog(state, 'write-recovered', 'write succeeded again after a previous failure');
      }
      return r;
    }

    function exportText() {
      return JSON.stringify({
        meta: Object.assign({}, state.meta, { exportedAt: nowISO() }),
        people: state.people, events: state.events
      }, null, 2);
    }

    /* Import pipeline — REV to README contract. Refuses: unparseable,
       malformed, foreign, newer, identical. Migrates same-lineage older.
       Two-pass merge: mint ALL ids, then rewire every id reference
       (incl. reportsTo — mf-5 fix). Live bytes preserved .pre-import. first. */
    function importText(text) {
      var parsed;
      try { parsed = typeof text === 'string' ? JSON.parse(text) : text; }
      catch (e) { return { ok: false, reason: 'unparseable', detail: String(e && e.message || e) }; }
      if (!parsed || typeof parsed !== 'object' || !parsed.meta || typeof parsed.meta !== 'object' ||
          !Array.isArray(parsed.people) || !Array.isArray(parsed.events)) {
        return { ok: false, reason: 'malformed', detail: 'missing meta/people[]/events[]' };
      }
      if (parsed.meta.lineage !== LINEAGE) {
        return { ok: false, reason: 'foreign', detail: 'lineage "' + parsed.meta.lineage + '"' };
      }
      if (parsed.meta.schemaVersion > CURRENT) {
        return { ok: false, reason: 'newer', detail: 'file is v' + parsed.meta.schemaVersion + ', app understands ≤ v' + CURRENT };
      }
      var incoming = JSON.parse(JSON.stringify({ meta: parsed.meta, people: parsed.people, events: parsed.events, log: [] }));
      /* one canonical input path: same-lineage older files migrate first,
         exactly as stored bytes would (pre-migration bytes quarantined
         inside runMigrations). */
      if (incoming.meta.schemaVersion < CURRENT) {
        if (isBaseShape(incoming)) {
          try { incoming = runMigrations(incoming); }
          catch (e) { return { ok: false, reason: 'migration-failed', detail: String(e.message || e) }; }
        } else {
          return { ok: false, reason: 'malformed', detail: 'shape too incomplete to migrate from v' + incoming.meta.schemaVersion };
        }
      }
      var en = normalizeEvents(incoming.events, null); incoming.events = en.events;
      var pn = normalizePeople(incoming.people, null); incoming.people = pn.people;
      if (sameData({ people: incoming.people, events: incoming.events }, state)) {
        return { ok: false, reason: 'identical', detail: 'this file IS the live data (people + events identical)' };
      }
      quarantine('pre-import', JSON.stringify(state));
      /* pass 1: mint every id */
      var idMap = {}, i;
      for (i = 0; i < incoming.people.length; i++) {
        var np = newId('p'); idMap[incoming.people[i].id] = np;
      }
      for (i = 0; i < incoming.events.length; i++) {
        var ne = newId('e'); idMap[incoming.events[i].id] = ne;
      }
      /* pass 2: rewire all references, then re-root */
      incoming.people = rewirePersonRows(incoming.people, idMap).map(function (p) { p.id = idMap[p.id] || p.id; return p; });
      incoming.events = incoming.events.map(function (ev) {
        var q = rewire(ev, idMap);
        q.id = idMap[q.id] || q.id;
        if (q.personId && idMap[q.personId]) q.personId = idMap[q.personId];
        return q;
      });
      state.people = state.people.concat(incoming.people);
      state.events = state.events.concat(incoming.events);
      var ren = normalizeEvents(state.events, function (k, m) { pushLog(state, k, m); });
      var rep = normalizePeople(state.people, function (k, m) { pushLog(state, k, m); });
      state.events = ren.events; state.people = rep.people;
      pushLog(state, 'import', 'merged ' + incoming.people.length + ' people + ' + incoming.events.length +
        ' events; every imported id re-minted, references rewired; live bytes preserved under .pre-import.');
      var r = save();
      return { ok: true, mergedPeople: incoming.people.length, mergedEvents: incoming.events.length, saved: r.ok, saveReason: r.reason };
    }

    function browseKeys() {
      var rows = [], i, k;
      try {
        for (i = 0; i < localStorage.length; i++) {
          k = localStorage.key(i);
          var kind = qkindOf(k, key);
          if (kind == null) continue;
          var v = localStorage.getItem(k) || '';
          rows.push({ key: k, kind: kind, bytes: v.length });
        }
      } catch (e) { /* storage enum blocked — report what we know */ }
      rows.sort(function (a, b) { return a.key < b.key ? -1 : 1; });
      return rows;
    }
    function readKey(k) {
      if (k !== key && qkindOf(k, key) == null) return null; /* refuse to read other apps' keys */
      try { return localStorage.getItem(k); } catch (e) { return null; }
    }

    return {
      key: key, CURRENT: CURRENT, LINEAGE: LINEAGE,
      load: load, save: save,
      state: function () { return state; },
      isReadOnly: function () { return readOnly; },
      exportText: exportText, importText: importText,
      browseKeys: browseKeys, readKey: readKey,
      log: function (kind, msg) { if (state) { pushLog(state, kind, msg); } },
      refreshPill: function () {
        var pill = document.getElementById('pill');
        if (!pill) return;
        if (readOnly) { pill.textContent = 'READ-ONLY'; pill.className = 'pill pill-bad'; pill.title = 'storage holds a newer schema — writes blocked'; }
        else if (state && state.meta.writeFailed) { pill.textContent = 'WRITE FAILED'; pill.className = 'pill pill-bad'; pill.title = 'last write failed — in-memory state intact; export a backup'; }
        else { pill.textContent = 'OK'; pill.className = 'pill pill-ok'; pill.title = 'storage write path healthy'; }
      },
      setAppointment: function (isoOrNull) {
        state.meta.appointment = isoOrNull || null;
        pushLog(state, 'appointment', isoOrNull ? 'appointment set to ' + isoOrNull : 'appointment cleared');
        return save();
      },
      _forceStamp: function (s) { forceStamp = s; }, /* test hook — cleared by tests */
      _newId: newId, _normalizeEvents: normalizeEvents, _normalizePeople: normalizePeople,
      _canon: canon, _sameData: sameData, _quarantine: quarantine, _trySetItem: trySetItem
    };
  }

  var api = makeStore(KEY);
  api.makeStore = makeStore;   /* health wall uses disposable keys */
  api.KEY = KEY;
  api.today = todayISO;
  api.nowISO = nowISO;
  api.newId = newId;
  api.LOG_MAX = LOG_MAX;
  return api;
})();
