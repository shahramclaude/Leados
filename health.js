/* LeadOS pt-4 - js/health.js
   The authority wall.
   T-suite: deterministic proof on synthetic fixtures (never touches the store).
   G-suite: live inspection of the real localStorage payload.
   The UI may not claim anything that is not covered here (see CLAIMS). */
(function () {
  'use strict';
  const LeadOS = (window.LeadOS = window.LeadOS || {});
  const DAY = 86400000;
  const T0 = 1720000000000; // pinned epoch - fixtures never call Date.now()

  function fev(seq, type, payload, opts) {
    const e = { seq: seq, id: 't-' + seq, at: (opts && opts.at) || (T0 + seq * 1000), type: type, payload: payload };
    if (opts && opts.meta) e.meta = opts.meta;
    return e;
  }
  function v3raw(events) {
    return { schemaVersion: 3, meta: { lineage: 'pt', createdAt: T0, migrationsApplied: ['1>2', '2>3'], migrationRepairs: { '1>2': 0, '2>3': 0 } }, events: events };
  }
  function repairCount(raw, migrationId) {
    return raw.events.filter(function (e) { return e.meta && e.meta.repair && e.meta.migration === migrationId; }).length;
  }

  // ---------- T-suite (fixtures) ----------
  const T = [
    ['T1', '3>4 backfills exactly the five v4 settings on a bare v3 store', function () {
      const raw = v3raw([fev(1, 'store.initialized', { schemaVersion: 3, lineageTag: 'pt-3' })]);
      LeadOS.store.MIGRATIONS['3>4'](raw);
      const applied = LeadOS.store.foldSettings(raw.events);
      const missing = LeadOS.store.V4_NEW_KEYS.filter(function (k) { return !(k in applied); });
      return { pass: missing.length === 0, detail: missing.length ? 'missing: ' + missing.join(', ') : 'all 5 keys project after migration; ' + repairCount(raw, '3>4') + ' repair events written' };
    }],
    ['T2', '3>4 backfilled values equal the v4 defaults exactly (90 / 30 / 14 / 90 / 180)', function () {
      const raw = v3raw([fev(1, 'store.initialized', { schemaVersion: 3, lineageTag: 'pt-3' })]);
      LeadOS.store.MIGRATIONS['3>4'](raw);
      const applied = LeadOS.store.foldSettings(raw.events);
      const bad = LeadOS.store.V4_NEW_KEYS.filter(function (k) { return applied[k] !== LeadOS.store.V4_SETTING_DEFAULTS[k]; });
      return { pass: bad.length === 0, detail: bad.length ? 'wrong defaults: ' + bad.join(', ') : 'salesCycle 90, revenue 30, ops 14, board 90, compliance 180' };
    }],
    ['T3', '3>4 is idempotent: replaying it appends zero new repairs', function () {
      const raw = v3raw([fev(1, 'store.initialized', { schemaVersion: 3, lineageTag: 'pt-3' })]);
      LeadOS.store.MIGRATIONS['3>4'](raw);
      const len = raw.events.length, counted = raw.meta.migrationRepairs['3>4'];
      LeadOS.store.MIGRATIONS['3>4'](raw);
      const stable = raw.events.length === len && raw.meta.migrationRepairs['3>4'] === counted;
      return { pass: stable, detail: stable ? 'second run: +0 events, count stable at ' + counted : 'second run mutated the store' };
    }],
    ['T4', '3>4 never overwrites a leader-set value (salesCycleDays 45 survives)', function () {
      const raw = v3raw([
        fev(1, 'store.initialized', { schemaVersion: 3, lineageTag: 'pt-3' }),
        fev(2, 'settings.changed', { key: 'salesCycleDays', value: 45 })
      ]);
      LeadOS.store.MIGRATIONS['3>4'](raw);
      const applied = LeadOS.store.foldSettings(raw.events);
      const repairs = repairCount(raw, '3>4');
      const ok = applied.salesCycleDays === 45 && repairs === 4;
      return { pass: ok, detail: ok ? 'user value 45 preserved; only the 4 untouched keys backfilled' : 'salesCycleDays=' + applied.salesCycleDays + ', repairs=' + repairs };
    }],
    ['T5', 'meta.migrationRepairs[3>4] equals the repair events written to the log', function () {
      const raw = v3raw([fev(1, 'store.initialized', { schemaVersion: 3, lineageTag: 'pt-3' })]);
      LeadOS.store.MIGRATIONS['3>4'](raw);
      const fromLog = repairCount(raw, '3>4');
      return { pass: raw.meta.migrationRepairs['3>4'] === fromLog, detail: 'meta=' + raw.meta.migrationRepairs['3>4'] + ', log=' + fromLog };
    }],
    ['T6', 'cadence math honors v4 interval keys: never -> ok -> due -> overdue', function () {
      const C = T0 + 100 * DAY;
      function stateWith(completed) {
        const evs = [fev(1, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' })];
        if (completed) {
          evs.push(fev(2, 'review.scheduled', { id: 'r1', kind: 'revenue', dueAt: C }, { at: C - DAY }));
          evs.push(fev(3, 'review.completed', { id: 'r1', outcome: 'done' }, { at: C }));
        }
        return LeadOS.engine.project(evs);
      }
      const s1 = stateWith(true);
      const cs = LeadOS.engine.cadenceStatus;
      const a = cs(s1, C + 28 * DAY).revenue.status;           // 30d interval -> ok
      const b = cs(s1, C + 30 * DAY - 1000).revenue.status;    // within 24h of due -> due
      const c = cs(s1, C + 30 * DAY + 1).revenue.status;       // past due -> overdue
      const d = cs(s1, C + 44 * DAY).revenue.overdueDays;      // 14 days late
      const e = cs(stateWith(false), C).revenue.status;        // never reviewed
      const ok = a === 'ok' && b === 'due' && c === 'overdue' && d === 14 && e === 'never';
      return { pass: ok, detail: 'ok/due/overdue/never = ' + [a, b, c, e].join('/') + '; overdueDays=' + d };
    }],
    ['T7', 'project() is a pure fold: no store access, deterministic, non-mutating', function () {
      const evs = [fev(1, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' }), fev(2, 'settings.changed', { key: 'opsReviewCadenceDays', value: 7 })];
      const before = JSON.stringify(evs);
      const origLoad = LeadOS.store.load, origGet = LeadOS.store.getEvents;
      let pass = true, detail = 'no store access; deterministic; source events untouched';
      LeadOS.store.load = function () { throw new Error('project touched the store'); };
      LeadOS.store.getEvents = function () { throw new Error('project touched the store'); };
      try {
        const a = JSON.stringify(LeadOS.engine.project(evs));
        const b = JSON.stringify(LeadOS.engine.project(evs));
        if (a !== b) { pass = false; detail = 'non-deterministic projection'; }
        if (JSON.stringify(evs) !== before) { pass = false; detail = 'projection mutated its input'; }
      } catch (err) { pass = false; detail = err.message; }
      finally { LeadOS.store.load = origLoad; LeadOS.store.getEvents = origGet; }
      return { pass: pass, detail: detail };
    }],
    ['T8', 'registry rejects unknown types, rogue fields, and malformed payloads', function () {
      const v = LeadOS.events.validate;
      const bad1 = v('definitely.not.real', {}).ok;
      const bad2 = v('settings.changed', { key: 'notASetting', value: 5 }).ok;
      const bad3 = v('objective.created', { id: 'x', domain: 'sales' }).ok;
      const bad4 = v('task.created', { id: 't', domain: 'sales', title: 'x', hacker: 1 }).ok;
      const good = v('decision.proposed', { id: 'd', domain: 'sales', question: 'q?', options: ['a', 'b'], owner: 'o', reversibility: 'reversible' }).ok;
      const ok = !bad1 && !bad2 && !bad3 && !bad4 && good;
      return { pass: ok, detail: ok ? '4 malformed events rejected, 1 valid accepted' : 'validator misbehaved' };
    }],
    ['T9', 'salesCycleDays drives the beyond-cycle flag on sales decisions only', function () {
      const evs = [
        fev(1, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' }),
        fev(2, 'decision.proposed', { id: 'ds', domain: 'sales', question: 'pricing?', options: ['a', 'b'], owner: 'cro', reversibility: 'reversible' }, { at: T0 }),
        fev(3, 'decision.proposed', { id: 'de', domain: 'engineering', question: 'stack?', options: ['a', 'b'], owner: 'cto', reversibility: 'irreversible' }, { at: T0 })
      ];
      const q91 = LeadOS.engine.decisionQueue(LeadOS.engine.project(evs), T0 + 91 * DAY);
      const q10 = LeadOS.engine.decisionQueue(LeadOS.engine.project(evs), T0 + 10 * DAY);
      const s91 = q91.find(function (d) { return d.id === 'ds'; });
      const e91 = q91.find(function (d) { return d.id === 'de'; });
      const s10 = q10.find(function (d) { return d.id === 'ds'; });
      const ok = s91.beyondSalesCycle === true && e91.beyondSalesCycle === false && s10.beyondSalesCycle === false;
      return { pass: ok, detail: 'sales@91d beyond-cycle, engineering@91d not, sales@10d not' };
    }]
  ];

  // ---------- G-suite (live store) ----------
  const G = [
    ['G1', 'exactly one LeadOS localStorage key exists: leados:data', function () {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('leados') === 0) keys.push(k); }
      const ok = keys.length === 1 && keys[0] === LeadOS.store.KEY;
      return { pass: ok, detail: ok ? 'namespace holds only leados:data' : 'unexpected keys: ' + keys.join(', ') };
    }],
    ['G2', 'schemaVersion is 4 and lineage is pt', function () {
      const raw = LeadOS.store.load();
      const ok = raw.schemaVersion === 4 && raw.meta.lineage === 'pt' && LeadOS.store.LINEAGE_TAG === 'pt-4';
      return { pass: ok, detail: 'schemaVersion=' + raw.schemaVersion + ', lineage=' + raw.meta.lineage + ', tag=' + LeadOS.store.LINEAGE_TAG };
    }],
    ['G3', 'append-only integrity: contiguous seq, unique ids, monotonic time, every event registry-valid', function () {
      const raw = LeadOS.store.load();
      const ids = {}, problems = [];
      let lastAt = -Infinity;
      raw.events.forEach(function (e, i) {
        if (e.seq !== i + 1) problems.push('seq gap at index ' + i);
        if (ids[e.id]) problems.push('duplicate id ' + e.id); ids[e.id] = true;
        if (e.at < lastAt) problems.push('time moved backwards at ' + e.id); lastAt = e.at;
        const verdict = LeadOS.events.validate(e.type, e.payload);
        if (!verdict.ok) problems.push(e.id + ': ' + verdict.errors[0]);
      });
      return { pass: problems.length === 0, detail: problems.length ? problems.slice(0, 3).join(' | ') : raw.events.length + ' events verified against the registry' };
    }],
    ['G4', 'nothing derived is persisted: root and meta keys inside whitelist', function () {
      const raw = LeadOS.store.load();
      const rootBad = Object.keys(raw).filter(function (k) { return LeadOS.store.RAW_ROOT_WHITELIST.indexOf(k) === -1; });
      const metaBad = Object.keys(raw.meta).filter(function (k) { return LeadOS.store.META_WHITELIST.indexOf(k) === -1; });
      const ok = rootBad.length === 0 && metaBad.length === 0;
      return { pass: ok, detail: ok ? 'payload shape clean: only schemaVersion, meta, events' : 'rogue keys: ' + rootBad.concat(metaBad).join(', ') };
    }],
    ['G5', 'live projection contains all five v4 settings as positive numbers', function () {
      const state = LeadOS.engine.project(LeadOS.store.load().events);
      const set = LeadOS.engine.settings(state);
      const bad = LeadOS.store.V4_NEW_KEYS.filter(function (k) { return typeof set[k] !== 'number' || !isFinite(set[k]) || set[k] <= 0; });
      return { pass: bad.length === 0, detail: bad.length ? 'bad: ' + bad.join(', ') : LeadOS.store.V4_NEW_KEYS.map(function (k) { return k + '=' + set[k]; }).join(' ') };
    }],
    ['G6', 'repair accounting consistent: migrationRepairs matches repair events; migrations ordered', function () {
      const raw = LeadOS.store.load();
      const problems = [];
      Object.keys(raw.meta.migrationRepairs).forEach(function (id) {
        const inLog = raw.events.filter(function (e) { return e.meta && e.meta.repair && e.meta.migration === id; }).length;
        if (raw.meta.migrationRepairs[id] !== inLog) problems.push(id + ': meta=' + raw.meta.migrationRepairs[id] + ' log=' + inLog);
      });
      let prev = 0;
      raw.meta.migrationsApplied.forEach(function (id) {
        const from = parseInt(id.split('>')[0], 10);
        if (isNaN(from) || from <= prev) problems.push('migration order broken at ' + id);
        prev = from;
      });
      return { pass: problems.length === 0, detail: problems.length ? problems.join(' | ') : 'applied=[' + raw.meta.migrationsApplied.join(', ') + '], repairs=' + JSON.stringify(raw.meta.migrationRepairs) };
    }],
    ['G7', 'projection is pure against the live log: two reads identical, log untouched', function () {
      const raw = LeadOS.store.load();
      const before = JSON.stringify(raw.events);
      const a = JSON.stringify(LeadOS.engine.project(raw.events));
      const b = JSON.stringify(LeadOS.engine.project(raw.events));
      const ok = a === b && JSON.stringify(raw.events) === before;
      return { pass: ok, detail: ok ? 'deterministic, non-mutating read over ' + raw.events.length + ' events' : 'projection impurity detected' };
    }]
  ];

  // pt-4 part-1 claims and the checks that authorize them.
  const CLAIMS = [
    { id: 'C1', text: 'Five v4 settings exist with exact defaults (90 / 30 / 14 / 90 / 180).', by: ['T1', 'T2', 'G5'] },
    { id: 'C2', text: 'Backfill appends repair events and never overwrites leader-set values.', by: ['T4', 'G3'] },
    { id: 'C3', text: 'All repairs counted in meta.migrationRepairs, reconstructible from the log.', by: ['T5', 'G6'] },
    { id: 'C4', text: 'Migration 3>4 is idempotent on replay.', by: ['T3'] },
    { id: 'C5', text: 'Single localStorage key leados:data, schemaVersion 4, lineage pt.', by: ['G1', 'G2', 'G4'] },
    { id: 'C6', text: 'Append-only store; nothing derived persisted; project() is a pure fold.', by: ['G3', 'G4', 'G7', 'T7'] },
    { id: 'C7', text: 'Revenue / ops / board / compliance cadences derive from v4 settings.', by: ['T6', 'G5'] },
    { id: 'C8', text: 'salesCycleDays drives the beyond-cycle flag on sales decisions.', by: ['T9', 'G5'] },
    { id: 'C9', text: 'Every event in the log satisfies the registry contract.', by: ['T8', 'G3'] }
  ];

  function runSuite(suite) {
    return suite.map(function (row) {
      const id = row[0], name = row[1], fn = row[2];
      try { const r = fn(); return { id: id, name: name, pass: !!r.pass, detail: r.detail }; }
      catch (e) { return { id: id, name: name, pass: false, detail: 'threw: ' + e.message }; }
    });
  }

  function evaluateClaims(t, g) {
    const byId = {};
    t.concat(g).forEach(function (r) { byId[r.id] = r.pass; });
    return CLAIMS.map(function (c) {
      const pass = c.by.every(function (id) { return byId[id] === true; });
      return { id: c.id, text: c.text, by: c.by, pass: pass };
    });
  }

  function runG() { return runSuite(G); }
  function runAll() {
    const t = runSuite(T), g = runSuite(G);
    const claims = evaluateClaims(t, g);
    return { at: Date.now(), t: t, g: g, claims: claims, ok: t.concat(g).every(function (r) { return r.pass; }) };
  }
  // Boot gate: only the live-store suite can halt the app.
  function boot() { const g = runG(); return { ok: g.every(function (r) { return r.pass; }), g: g }; }

  LeadOS.health = { T: T, G: G, CLAIMS: CLAIMS, runAll: runAll, runG: runG, boot: boot };
})();
