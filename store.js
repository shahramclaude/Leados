/* LeadOS mf-1 · js/store.js — storage spine.
   Doctrine: trySetItem is the only write path. Corrupt/foreign/newer/malformed
   bytes are quarantined to timestamped keys and NEVER overwritten. Live key is
   removed (not rewritten) after its bytes are preserved in quarantine. */
window.LEADOS = window.LEADOS || {};
LEADOS.store = (function () {
  'use strict';
  var CURRENT = 1, LINEAGE = 'mf';
  var idSeq = 0;

  function nowISO() { return new Date().toISOString(); }
  function stamp() { return nowISO().replace(/[:.]/g, '-'); }
  function newId(prefix) { idSeq += 1; return prefix + '-' + Date.now().toString(36) + '-' + idSeq; }

  function fresh() {
    return {
      meta: { schemaVersion: CURRENT, lineage: LINEAGE, seeded: false, createdAt: nowISO(), writeFailed: false },
      people: [], events: [], log: []
    };
  }
  function isShape(s) {
    return !!(s && typeof s === 'object' && s.meta && typeof s.meta === 'object' &&
      s.meta.schemaVersion === CURRENT && s.meta.lineage === LINEAGE &&
      Array.isArray(s.people) && Array.isArray(s.events) && Array.isArray(s.log));
  }

  /* re-minting walker: rewrites any value whose KEY looks like an id reference
     (ends in Id/ids or is exactly id) when the value exists in idMap. */
  function rewire(obj, idMap) {
    var k, v, out, i;
    if (Array.isArray(obj)) {
      out = [];
      for (i = 0; i < obj.length; i++) out.push(rewire(obj[i], idMap));
      return out;
    }
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
      /* quarantine must never break boot; timestamped key means never overwritten */
      try { rawSet(qkey(kind), String(bytes)); } catch (e) { /* swallow */ }
    }
    function logRow(kind, msg) {
      if (!state) return;
      state.log.push({ ts: nowISO(), kind: kind, msg: msg });
      if (state.log.length > 500) state.log = state.log.slice(-500);
    }

    function load() {
      var raw = localStorage.getItem(key), parsed = null, m;
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

    /* repairs, never drops rows. returns count of repairs, each logged. */
    function audit() {
      if (!state) return 0;
      var repairs = 0, seen = {}, i, ev, pids = {};
      for (i = 0; i < state.people.length; i++) pids[state.people[i].id] = true;
      for (i = 0; i < state.events.length; i++) {
        ev = state.events[i];
        if (!ev || typeof ev !== 'object') continue;
        if (ev.id && seen[ev.id]) {
          ev.id = newId('e'); repairs++;
          logRow('audit', 'duplicate event id re-minted → ' + ev.id);
        }
        if (ev.id) seen[ev.id] = true;
        if (ev.personId != null && !pids[ev.personId]) {
          logRow('audit', 'event ' + ev.id + ' had dangling personId "' + ev.personId + '" — set to null, row kept');
          ev.personId = null; repairs++;
        }
      }
      return repairs;
    }

    function mergeInto(base, inc) {
      var idMap = {}, i, p, ev, c;
      for (i = 0; i < inc.people.length; i++) idMap[inc.people[i].id] = newId('p');
      for (i = 0; i < inc.events.length; i++) idMap[inc.events[i].id] = newId('e');
      for (i = 0; i < inc.people.length; i++) {
        p = rewire(inc.people[i], idMap); p.id = idMap[inc.people[i].id];
        base.people.push(p);
      }
      for (i = 0; i < inc.events.length; i++) {
        ev = rewire(inc.events[i], idMap); ev.id = idMap[inc.events[i].id];
        base.events.push(ev);
      }
      return base;
    }

    function importText(text, opts) {
      opts = opts || {};
      var mode = opts.mode === 'merge' ? 'merge' : 'replace';
      var incoming, m, liveRaw, canon;
      try { incoming = JSON.parse(text); }
      catch (e) { return { ok: false, status: 'unparseable' }; }
      m = incoming && incoming.meta;
      if (m && typeof m.schemaVersion === 'number') {
        if (m.lineage !== LINEAGE) return { ok: false, status: 'refuse-foreign', note: 'unknown lineage — bytes preserved read-only; no auto-migration is invented' };
        if (m.schemaVersion > CURRENT) return { ok: false, status: 'refuse-newer' };
      }
      if (!isShape(incoming)) return { ok: false, status: 'refuse-malformed' };
      liveRaw = localStorage.getItem(key);
      canon = function (s) { try { return JSON.stringify(JSON.parse(s)); } catch (e) { return s; } };
      if (liveRaw != null && canon(liveRaw) === canon(text)) {
        return { ok: false, status: 'refuse-identical', note: 'byte-identical to live state — a no-op import' };
      }
      if (liveRaw != null) quarantine('pre-import', liveRaw);
      if (mode === 'replace') state = incoming;
      else state = mergeInto(state || fresh(), incoming);
      var repairs = audit();
      logRow('import', mode + ' import applied; ' + repairs + ' integrity repair(s)');
      var r = save();
      return { ok: r.ok !== false, status: 'imported', mode: mode, repairs: repairs, quota: !!r.quota };
    }

    return {
      key: key,
      load: load,
      save: save,
      audit: audit,
      importText: importText,
      quarantine: quarantine,
      get: function () { return state; },
      exportText: function () { return JSON.stringify(state, null, 2); },
      _trySetItem: trySetItem,   /* test affordance — used by T3 */
      _rawSet: rawSet            /* test affordance — used by T2/T6 */
    };
  }

  return {
    CURRENT: CURRENT,
    LINEAGE: LINEAGE,
    makeStore: makeStore,
    fresh: fresh,
    isShape: isShape,
    newId: newId,
    nowISO: nowISO
  };
})();
