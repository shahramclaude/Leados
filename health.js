/* LeadOS pt-3 · js/health.js — the authority wall.
   #/health executes the claims the README makes, against the code paths
   production uses: loadFromText funnel · quarantine · quota injection through
   the real save() · the 1>2>3 migration ladder · importInto/mergeInto purity +
   id rewiring · buildSeed → project → engine.run · every rule R1–R10 against
   fixtures with a FIXED golden today (2026-02-16) · suppression resurface.
   Where this wall and the README disagree, THIS WALL WINS. Disposable keys are
   prefixed leados:t and swept before AND after the run. Fixture states are
   built in memory — the live store is never mutated (T8/T9 restore what they
   touch; any leak would be a bug and is graded as one).
   Honesty note (carried): T8 monkey-patches localStorage.setItem; engines that
   make it non-writable will fail T8 VISIBLY. In volatile backend mode T8/T9
   report SKIP rather than faking a pass. */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.health = 'js/health.js';

LEADOS.health = (function () {
  'use strict';

  var FIXED = '2026-02-16T12:00:00.000Z'; /* golden today — every G fixture dates off this */
  function dAgo(n) { return new Date(new Date(FIXED).getTime() - n * 864e5).toISOString(); }
  function dAhead(n) { return new Date(new Date(FIXED).getTime() + n * 864e5).toISOString(); }

  function T() { return LEADOS.store._test; }

  function mkState(people, events) {
    var st = T().freshState();
    people.forEach(function (p, i) {
      st.people.push({
        id: p.id || ('fp' + i), name: p.name || ('Person ' + i), role: p.role || '',
        createdAt: p.createdAt === undefined ? dAgo(80) : p.createdAt,
        cadenceDays: p.cadenceDays === undefined ? null : p.cadenceDays,
        skipCadenceDays: p.skipCadenceDays === undefined ? null : p.skipCadenceDays,
        reportsTo: p.reportsTo === undefined ? null : p.reportsTo,
        archived: !!p.archived
      });
    });
    var seq = 0;
    events.forEach(function (e) {
      st.events.push({ id: e.id || ('fe' + (++seq)), ts: e.ts, type: e.type, data: e.data || {} });
    });
    return st;
  }
  function runOn(st) { return LEADOS.engine.run(LEADOS.events.project(st), FIXED); }
  function fired(r, ruleId) { return r.findings.filter(function (f) { return f.rule === ruleId; }); }
  function byKey(r, key) { for (var i = 0; i < r.findings.length; i++) if (r.findings[i].key === key) return r.findings[i]; return null; }

  function check(rows, id, name, pass, expected, observed, lines) {
    rows.push({ id: id, name: name, pass: pass, expected: expected, observed: observed, lines: lines || [] });
  }

  /* ================= T-suite: storage spine on real code paths ================= */
  function t1(rows) {
    var need = ['store', 'events', 'engine', 'playbooks', 'health', 'ui'], missing = [];
    need.forEach(function (m) { if (!LEADOS._mod[m]) missing.push(m); });
    check(rows, 'T1', 'module registry', missing.length === 0,
      'all 6 modules registered (' + need.join(' · ') + ')',
      missing.length ? 'MISSING: ' + missing.join(' · ') : '6/6 registered');
  }
  function t2(rows) {
    var r = LEADOS.store.loadFromText('{not json', 'leados:t:health');
    check(rows, 'T2', 'corrupt payload → funnel verdict', r.status === 'corrupt' && /parse/i.test(r.reason || ''),
      "loadFromText('{not json') → status 'corrupt' with a parse reason (quarantine-on-refusal is a caller duty — graded in T3 foreign + T7 migration-failed)",
      "status '" + r.status + "' · reason: " + (r.reason || '—'));
  }
  function t3(rows) {
    var malformed = JSON.stringify({ hello: 'world' });
    var foreign = JSON.stringify({ meta: { schemaVersion: 3, lineage: 'mf' }, people: [], events: [] });
    var newer = JSON.stringify({ meta: { schemaVersion: 99, lineage: 'pt' }, people: [], events: [] });
    var r1 = LEADOS.store.loadFromText(malformed, 'leados:t:health');
    var r2 = LEADOS.store.loadFromText(foreign, 'leados:t:health');
    var r3 = LEADOS.store.loadFromText(newer, 'leados:t:health');
    var base = T().freshState();
    var imp = LEADOS.store.importInto(base, foreign, 'leados:t:health');
    var qKeys = T().beKeys().filter(function (k) { return k.indexOf('leados:t:health:quarantine:foreign:') === 0; });
    check(rows, 'T3', 'funnel: malformed · foreign · newer (+ import refusal quarantines)',
      r1.status === 'malformed' && r2.status === 'foreign' && r3.status === 'newer' && imp.refused === 'foreign' && qKeys.length >= 1,
      "statuses malformed/foreign/newer · importInto refuses 'foreign' · quarantine key under leados:t",
      "r1 " + r1.status + " · r2 " + r2.status + " · r3 " + r3.status + " · import '" + (imp.refused || 'not refused!?') + "' · quarantine keys " + qKeys.length,
      r3.reason ? ['newer boot reason: ' + r3.reason] : []);
  }
  function t4(rows) {
    var base = T().buildSeed();
    var text = JSON.stringify(base); /* what "export your live store" produces */
    var own = LEADOS.store.importInto(base, text, 'leados:t:health');
    var first = LEADOS.store.importInto(T().freshState(), text, 'leados:t:health');
    var second = first.refused ? null : LEADOS.store.importInto(first.state, text, 'leados:t:health');
    check(rows, 'T4', "identical import refused · re-import after a merge merges again (and FLAGS the dups — accepted gap, documented)",
      own.refused === 'identical' && first && !first.refused && second && !second.refused && second.dupNames.length > 0,
      "your own export back into an unchanged store → refused 'identical' · same file into an empty store merges · into the MERGED store it merges again with same-named duplicates flagged",
      "own-export→'" + (own.refused || 'MERGED (bug)') + "' · first→" + (first.refused || first.eventsAdded + ' events') + " · second→" + (second ? (second.refused || ('merged, dupNames flagged ×' + second.dupNames.length)) : 'n/a'),
      ['why: merge re-mints every id, so post-merge bytes can never equal the file bytes — identity is only ever true against the store the export came from, unchanged']);
  function t5(rows) {
    var st = { meta: { schemaVersion: 3, lineage: 'pt' }, people: [null, { name: 42 }], events: ['garbage', { id: 'ok', ts: dAgo(1), type: 'note.added', data: null }] };
    var repairs = T().normalize(st);
    var ok = st.people.length === 2 && st.events.length === 2 && typeof st.people[1].name === 'string' && st.events[1].data && typeof st.events[1].data === 'object';
    check(rows, 'T5', 'normalize repairs, never drops', ok && repairs.length >= 3,
      'null person → placeholder row · numeric name → string · string event → placeholder note · null data → {} · all rows kept',
      'people ' + st.people.length + ' · events ' + st.events.length + ' · repairs: ' + repairs.length,
      repairs.slice(0, 6));
  }
  function t6(rows) {
    var v1 = {
      meta: { schemaVersion: 1, lineage: 'pt' },
      people: [
        { id: 'pa', name: 'A', reportsTo: 'pb' },
        { id: 'pb', name: 'B', reportsTo: 'pa' }, /* cycle pa↔pb */
        { id: 'pc', name: 'C', reportsTo: 'ghost' } /* dangling */
      ],
      events: []
    };
    var r = LEADOS.store.loadFromText(JSON.stringify(v1), 'leados:t:health');
    var ppl = {};
    (r.state ? r.state.people : []).forEach(function (p) { ppl[p.id] = p; });
    var snap = T().beKeys().filter(function (k) { return k.indexOf('leados:t:health:quarantine:pre-migration:') === 0; });
    var okCycle = ppl.pa && ppl.pb && (ppl.pa.reportsTo === null) !== (ppl.pb.reportsTo === null); /* exactly one nulled */
    var breakAtMin = ppl.pa && ppl.pa.reportsTo === null; /* lexicographic-min member is pa */
    var ok = r.status === 'ok' && r.migratedFrom === 1 && ppl.pc && ppl.pc.reportsTo === null &&
      breakAtMin && okCycle && ppl.pa.skipCadenceDays === null &&
      r.state.meta.settings.skipCadenceDefaultDays === 60 &&
      r.state.meta.settings.coachingReviewDefaultDays === 14 &&
      r.state.meta.schemaVersion === 3 && snap.length >= 1;
    check(rows, 'T6', 'v1 store climbs the real ladder 1>2>3', ok,
      "migratedFrom 1 → schema 3 · cycle pa↔pb broken at lexicographic-min 'pa' · dangling pc → null · skipCadenceDays backfilled · settings v2+v3 defaults · pre-migration snapshot quarantined",
      "status " + r.status + " · from " + r.migratedFrom + " · pa.reportsTo " + JSON.stringify(ppl.pa && ppl.pa.reportsTo) + " · pb.reportsTo " + JSON.stringify(ppl.pb && ppl.pb.reportsTo) + " · pc.reportsTo " + JSON.stringify(ppl.pc && ppl.pc.reportsTo) + " · snapshots " + snap.length,
      (r.state && r.state.meta.migrationRepairs) || []);
  }
  function t7(rows) {
    var v0 = JSON.stringify({ meta: { schemaVersion: 0, lineage: 'pt' }, people: [], events: [] });
    var r = LEADOS.store.loadFromText(v0, 'leados:t:health');
    var q = T().beKeys().filter(function (k) { return k.indexOf('leados:t:health:quarantine:migration-failed:') === 0; });
    check(rows, 'T7', 'v0 store → migration-failed, read-only posture', r.status === 'migration-failed' && q.length >= 1,
      "no step '0>1' in the ladder → status 'migration-failed' + original bytes quarantined under leados:t",
      "status " + r.status + " · quarantine keys " + q.length + " · reason: " + (r.reason || '—'));
  }
  function t8(rows) {
    if (LEADOS.store.volatile()) return check(rows, 'T8', 'quota failure through real save()', 'skip', 'localStorage backend usable', 'volatile memory vault — injection impossible; reported, not faked');
    var before = LEADOS.store.state().meta.writeFailures || 0;
    var orig = localStorage.setItem, ok = false, observed = '';
    try {
      localStorage.setItem = function () { throw new Error('QuotaExceededError (injected)'); };
      var r = LEADOS.store.save();
      ok = r.ok === false && (LEADOS.store.state().meta.writeFailures || 0) === before + 1;
      observed = "save() ok=false · writeFailures " + before + "→" + (LEADOS.store.state().meta.writeFailures) + " · why: " + r.why;
    } catch (e) { observed = 'injection threw outside save(): ' + (e && e.message); }
    try { localStorage.setItem = orig; } catch (e) {}
    var r2 = LEADOS.store.save(); /* recovery write clears writeFailed on success */
    check(rows, 'T8', 'quota failure through real save()', ok && r2.ok !== false,
      'setItem throw → save() returns {ok:false}, writeFailures+1, pill-worthy meta.writeFailed; restoring backend → next save recovers',
      observed + ' · recovery save ok=' + (r2 && r2.ok !== false));
  }
  function t9(rows) {
    if (LEADOS.store.volatile()) return check(rows, 'T9', 'audit cap 300 leaves a row', 'skip', 'localStorage backend usable', 'volatile memory vault — skipped honestly');
    var st = LEADOS.store.state();
    var keep = st.meta.audit, keepSeq = st.meta.auditSeq;
    st.meta.audit = []; for (var i = 0; i < 300; i++) st.meta.audit.push({ seq: i + 1, ts: dAgo(1), action: 'pad', ref: null });
    LEADOS.store.auditLive('T9-probe', 'cap test');
    var len = st.meta.audit.length, first = st.meta.audit[0];
    var ok = len === 300 && first && first.action === 'audit-capped';
    check(rows, 'T9', 'audit cap 300 leaves a row', ok,
      '301st entry → length stays 300, first row is an audit-capped marker naming the drop count',
      'length ' + len + ' · first row: ' + (first ? first.action + ' (' + (first.ref || '') + ')' : 'none'));
    st.meta.audit = keep; st.meta.auditSeq = keepSeq; LEADOS.store.save(); /* restore — health leaves the live log as it found it */
  }
  function t10(rows) {
    var incoming = T().freshState();
    incoming.meta.schemaVersion = 3; incoming.meta.lineage = 'pt';
    incoming.people.push({ id: 'x1', name: 'Imp Orted', reportsTo: null });
    incoming.events.push(
      { id: 'e1', ts: dAgo(30), type: 'goal.set', data: { goalId: 'g1', title: 'imported goal', ownerId: 'x1' } },
      { id: 'e2', ts: dAgo(20), type: 'goal.progress', data: { goalId: 'g1', note: 'moved' } },
      { id: 'e3', ts: dAgo(25), type: 'plan.created', data: { personId: 'x1', goal: 'imp plan', d: 'D2', s: 'S2', actions: [], reviewBy: dAgo(5) } },
      { id: 'e4', ts: dAgo(2), type: 'plan.checkin', data: { planId: 'e3', note: 'first', progress: 40 } },
      { id: 'e5', ts: dAgo(15), type: 'conflict.logged', data: { aId: 'x1', text: 'tension' } },
      { id: 'e6', ts: dAgo(10), type: 'conflict.followup', data: { conflictIds: ['e5', 'missing'], pairKey: 'one:x1|tension', note: 'talked' } }
    );
    var r = LEADOS.store.importInto(T().freshState(), JSON.stringify(incoming), 'leados:t:health');
    if (r.refused) return check(rows, 'T10', 'import rewires ids', false, 'merge accepted', "refused '" + r.refused + "'");
    var P = LEADOS.events.project(r.state);
    var newPerson = null; r.state.people.forEach(function (p) { if (p.name === 'Imp Orted') newPerson = p; });
    var goal = null; for (var gid in P.goalById) goal = P.goalById[gid];
    var checkinOk = false, planId = null;
    r.state.events.forEach(function (e) { if (e.type === 'plan.checkin') { planId = e.data.planId; if (P.plansById[e.data.planId] && P.plansById[e.data.planId].checkins === 1) checkinOk = true; } });
    var noOldIds = newPerson && newPerson.id !== 'x1' && planId !== 'e3' && goal && goal.id !== 'g1';
    var ownerOk = goal && newPerson && goal.ownerId === newPerson.id;
    var nulledOk = r.refsNulled >= 1; /* 'missing' in conflictIds */
    check(rows, 'T10', 'import rewires every id (goal·plan·person·conflictIds)', !!(noOldIds && ownerOk && checkinOk && nulledOk),
      'all ids re-minted · goal.progress→goal.set rewired · plan.checkin→plan.created rewired · ownerId→new person · unknown conflictId nulled + counted',
      "person '" + (newPerson && newPerson.id) + "' (was x1) · planId '" + planId + "' (was e3) · checkins " + (checkinOk ? 1 : 0) + " · ownerId match " + ownerOk + " · refsNulled " + r.refsNulled,
      ['dupNames: ' + (r.dupNames.length ? r.dupNames.join(' · ') : 'none')]);
  }
  function t11(rows) {
    var v1 = { meta: { schemaVersion: 1, lineage: 'pt' }, people: [{ id: 'q1', name: 'Old Schema', reportsTo: 'ghost' }], events: [] };
    var r = LEADOS.store.importInto(T().freshState(), JSON.stringify(v1), 'leados:t:health');
    var ok = !r.refused && r.migratedFrom === 1 && r.state.meta.schemaVersion === 3 && r.state.people[0].reportsTo === null;
    check(rows, 'T11', 'older-schema import migrates through the ladder before merge', ok,
      "v1 payload → migratedFrom 1 → schemaVersion 3 · dangling reportsTo nulled by MIGRATIONS['1>2'] · THEN merged",
      r.refused ? "refused '" + r.refused + "'" : "migratedFrom " + r.migratedFrom + " · schema " + r.state.meta.schemaVersion + " · q1.reportsTo " + JSON.stringify(r.state.people[0].reportsTo));
  }
  function t12(rows) {
    var st = T().buildSeed();
    var P = LEADOS.events.project(st);
    var r = LEADOS.engine.run(P, LEADOS.events.todayIso());
    var want = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10'], got = {};
    r.findings.forEach(function (f) { got[f.rule] = (got[f.rule] || 0) + 1; });
    var missing = want.filter(function (w) { return !got[w]; });
    check(rows, 'T12', 'seed makes every rule fire (grading the real buildSeed)',
      missing.length === 0,
      'buildSeed → project → engine.run(today) fires all of ' + want.join(' · '),
      missing.length ? 'MISSING: ' + missing.join(' · ') : 'all 10 fire · counts: ' + want.map(function (w) { return w + '×' + got[w]; }).join(' · '),
      ['span line: ' + (P.span ? P.span.math : 'n/a') + ' → over: ' + (P.span && P.span.over)]);
  }
  function t13(rows) {
    var incoming = T().freshState();
    incoming.people.push({ id: 'dup', name: 'Dup' });
    incoming.events.push({ id: 'dup', ts: dAgo(3), type: 'note.added', data: { note: 'same id as a person — must still re-mint uniquely' } });
    var r = LEADOS.store.importInto(T().freshState(), JSON.stringify(incoming), 'leados:t:health');
    var ids = {}, clash = false;
    r.state.people.concat(r.state.events).forEach(function (x) { if (ids[x.id]) clash = true; ids[x.id] = 1; });
    var keptIncoming = r.state.people[0].id === 'dup' || r.state.events[0].id === 'dup';
    check(rows, 'T13', 'merge re-mints every id, collisions impossible', !clash && !keptIncoming,
      "incoming person id 'dup' AND event id 'dup' → two distinct fresh ids; neither survives verbatim",
      clash ? 'ID CLASH — merge broken' : ('ids → ' + r.state.people[0].id + ' / ' + r.state.events[0].id + ' · unique, re-minted'));
  }

  /* ================= G-suite: goldens against the real engine ================= */
  function g1(rows) {
    var p = { id: 'pa', name: 'Ana', cadenceDays: 14 };
    var none14 = fired(runOn(mkState([p], [{ ts: dAgo(14), type: 'oneonone.logged', data: { personId: 'pa' } }])), 'R1').length;
    var fire15 = fired(runOn(mkState([p], [{ ts: dAgo(15), type: 'oneonone.logged', data: { personId: 'pa' } }])), 'R1');
    var never = fired(runOn(mkState([{ id: 'pa', name: 'Ana', cadenceDays: 14, createdAt: dAgo(20) }], [])), 'R1');
    var noCreated = fired(runOn(mkState([{ id: 'pa', name: 'Ana', cadenceDays: 14, createdAt: null }], [])), 'R1').length;
    check(rows, 'G1', 'R1 cadence: 14d quiet · 15d fires HIGH · never-logged MEDIUM · no createdAt skip',
      none14 === 0 && fire15.length === 1 && fire15[0].conf === 'high' && /1d overdue/.test(fire15[0].title) && never.length === 1 && never[0].conf === 'medium' && noCreated === 0,
      'gap==cad does not fire (strictly past) · cad+1 fires high · never-logged medium · no createdAt → silence',
      '14d→' + none14 + ' · 15d→' + fire15.length + ' (' + (fire15[0] ? fire15[0].conf + ', "' + fire15[0].title + '"' : '—') + ') · never→' + (never[0] ? never[0].conf : 'none') + ' · noCreated→' + noCreated);
  }
  function g2(rows) {
    var dec = function (sev, rev, withOutcome) {
      var evs = [{ id: 'dc1', ts: dAgo(20), type: 'decision.logged', data: { title: 'X', severity: sev, reviewDate: rev } }];
      if (withOutcome) evs.push({ ts: dAgo(2), type: 'decision.outcome', data: { decisionId: 'dc1', result: 'done' } });
      return fired(runOn(mkState([], evs)), 'R2');
    };
    var a = dec(5, dAgo(1)), b = dec(1, dAgo(1)), c = dec(3, null), d = dec(4, dAgo(1), true);
    check(rows, 'G2', 'R2 decision review: severity clamp 3–5 · no reviewDate skip · outcome closes',
      a.length === 1 && a[0].sev === 5 && b.length === 1 && b[0].sev === 3 && c.length === 0 && d.length === 0,
      'sev5→5 · sev1→3 (clamped) · no reviewDate → silence · logged outcome → silence',
      'sev5→' + (a[0] ? a[0].sev : 'none') + ' · sev1→' + (b[0] ? b[0].sev : 'none') + ' · noReview→' + c.length + ' · outcome→' + d.length);
  }
  function g3(rows) {
    var ownerless = runOn(mkState([], [{ id: 'gg1', ts: dAgo(40), type: 'goal.set', data: { goalId: 'g1', title: 'orphan', ownerId: null } }]));
    var silentNew = byKey(runOn(mkState([{ id: 'pa' }], [{ id: 'gg2', ts: dAgo(20), type: 'goal.set', data: { goalId: 'g2', title: 'quiet', ownerId: 'pa' } }])), 'R3s:g2');
    var silentOld = byKey(runOn(mkState([{ id: 'pa' }], [
      { id: 'gg3', ts: dAgo(60), type: 'goal.set', data: { goalId: 'g3', title: 'old', ownerId: 'pa' } },
      { ts: dAgo(20), type: 'goal.progress', data: { goalId: 'g3', note: 'x' } }])), 'R3s:g3');
    var exact14 = byKey(runOn(mkState([{ id: 'pa' }], [{ id: 'gg4', ts: dAgo(14), type: 'goal.set', data: { goalId: 'g4', title: 'young', ownerId: 'pa' } }])), 'R3s:g4');
    check(rows, 'G3', 'R3 goals: ownerless HIGH · silent-from-creation MEDIUM · silent-from-progress HIGH · 14d exact quiet',
      byKey(ownerless, 'R3o:g1') && byKey(ownerless, 'R3o:g1').conf === 'high' &&
      silentNew && silentNew.conf === 'medium' && silentOld && silentOld.conf === 'high' && !exact14,
      'ownerless → R3o high · 20d silent, no progress → R3s medium · 20d since last progress → R3s high · exactly 14d → silence',
      'R3o ' + (byKey(ownerless, 'R3o:g1') ? byKey(ownerless, 'R3o:g1').conf : 'none') + ' · new ' + (silentNew ? silentNew.conf : 'none') + ' · old ' + (silentOld ? silentOld.conf : 'none') + ' · 14d ' + (exact14 ? 'FIRED (bug)' : 'quiet'));
  }
  function g4(rows) {
    var fb = function (n, polarity, gapDays) {
      var evs = [];
      for (var i = 0; i < n; i++) evs.push({ ts: dAgo((gapDays || 10) * (i + 1)), type: 'feedback.given', data: { personId: 'pa', polarity: polarity } });
      return fired(runOn(mkState([{ id: 'pa' }], evs)), 'R4');
    };
    var n2 = fb(2, 'corrective'), n3 = fb(3, 'corrective'), n5 = fb(5, 'corrective');
    var withMissing = runOn(mkState([{ id: 'pa' }], [
      { ts: dAgo(5), type: 'feedback.given', data: { personId: 'pa', polarity: 'corrective' } },
      { ts: dAgo(10), type: 'feedback.given', data: { personId: 'pa', polarity: 'corrective' } },
      { ts: dAgo(15), type: 'feedback.given', data: { personId: 'pa', polarity: 'corrective' } },
      { ts: dAgo(20), type: 'feedback.given', data: { personId: 'pa' } } /* no polarity: excluded + counted */
    ]));
    var oldOne = fb(3, 'corrective', 30); /* ts 30/60/90 → only 2 in window → silence */
    var missingFired = fired(withMissing, 'R4');
    check(rows, 'G4', 'R4 imbalance: n=2 quiet · n=3 MEDIUM · n=5 HIGH · missing polarity excluded · stale excluded',
      n2.length === 0 && n3.length === 1 && n3[0].conf === 'medium' && n5.length === 1 && n5[0].conf === 'high' &&
      missingFired.length === 1 && /excluded/.test(missingFired[0].basis.join(' ')) && oldOne.length === 0,
      'min n=3 · HIGH needs n≥5 · polarity-less rows counted as excluded, not guessed · >60d rows out of window',
      'n2→' + n2.length + ' · n3→' + (n3[0] ? n3[0].conf : 0) + ' · n5→' + (n5[0] ? n5[0].conf : 0) + ' · missing→' + missingFired.length + ' ("' + (missingFired[0] ? missingFired[0].basis[2] : '') + '") · 61d-old→' + oldOne.length);
  }
  function g5(rows) {
    var dels = function (n) {
      var evs = [];
      for (var i = 0; i < n; i++) evs.push({ ts: dAgo(n - i), type: 'delegation.assigned', data: { personId: 'pa', task: 't' + i, level: 2 } });
      return fired(runOn(mkState([{ id: 'pa' }], evs)), 'R5');
    };
    var n4 = dels(4), n5 = dels(5), n7 = dels(7);
    check(rows, 'G5', 'R5 delegation load: 4 quiet · 5 fires sev 3 · 7 fires sev 4',
      n4.length === 0 && n5.length === 1 && n5[0].sev === 3 && n7.length === 1 && n7[0].sev === 4,
      '>4 → sev 3 · >6 → sev 4 (boundaries at exactly 4 and exactly 6)',
      '4→' + n4.length + ' · 5→sev ' + (n5[0] ? n5[0].sev : 0) + ' · 7→sev ' + (n7[0] ? n7[0].sev : 0));
  }
  function g6(rows) {
    var base = [
      { id: 'c1', ts: dAgo(50), type: 'conflict.logged', data: { aId: 'pa', bId: 'pb', text: 'deploys' } },
      { id: 'c2', ts: dAgo(20), type: 'conflict.logged', data: { aId: 'pa', bId: 'pb', text: 'deploys again' } }
    ];
    var both = fired(runOn(mkState([{ id: 'pa' }, { id: 'pb' }], base)), 'R6');
    var three = fired(runOn(mkState([{ id: 'pa' }, { id: 'pb' }], base.concat([{ id: 'c3', ts: dAgo(5), type: 'conflict.logged', data: { aId: 'pa', bId: 'pb', text: 'third' } }]))), 'R6');
    var oneId = fired(runOn(mkState([{ id: 'pa' }], [
      { id: 'c4', ts: dAgo(30), type: 'conflict.logged', data: { aId: 'pa', text: 'vendor friction' } },
      { id: 'c5', ts: dAgo(10), type: 'conflict.logged', data: { aId: 'pa', text: 'vendor friction more' } }
    ])), 'R6');
    var txt = fired(runOn(mkState([{ id: 'pa' }], [
      { id: 'c6', ts: dAgo(30), type: 'conflict.logged', data: { text: 'Hallway raised voices' } },
      { id: 'c7', ts: dAgo(10), type: 'conflict.logged', data: { text: 'hallway raised voices' } }
    ])), 'R6'); /* same normalized text → same txt: pair key (case-folded); different wording would be a DIFFERENT pair — that is the doctrine, not a bug */
    var resolved = fired(runOn(mkState([{ id: 'pa' }, { id: 'pb' }], base.concat([{ ts: dAgo(15), type: 'conflict.resolved', data: { conflictIds: ['c1', 'c2'], pairKey: 'ids:pa|pb', note: 'cleared' } }]))), 'R6');
    var reopened = fired(runOn(mkState([{ id: 'pa' }, { id: 'pb' }], base.concat([
      { ts: dAgo(15), type: 'conflict.resolved', data: { conflictIds: ['c1', 'c2'], pairKey: 'ids:pa|pb', note: 'cleared' } },
      { id: 'c8', ts: dAgo(10), type: 'conflict.logged', data: { aId: 'pa', bId: 'pb', text: 'deploys a third time' } }
    ]))), 'R6');
    check(rows, 'G6', 'R6 repeated conflict: ids HIGH · ≥3 sev 4 · one-id MEDIUM · text LOW · resolved quiet · newer reopens',
      both.length === 1 && both[0].conf === 'high' && both[0].sev === 3 &&
      three.length === 1 && three[0].sev === 4 &&
      oneId.length === 1 && oneId[0].conf === 'medium' &&
      txt.length === 1 && txt[0].conf === 'low' &&
      resolved.length === 0 && reopened.length === 1 && /NEWER/.test(reopened[0].basis.join(' ')),
      'pair id-keyed · resolution clears until a NEWER conflict · conf priced by linkage',
      '2ids→' + (both[0] ? both[0].conf + '/sev' + both[0].sev : 0) + ' · 3ids→sev ' + (three[0] ? three[0].sev : 0) + ' · oneId→' + (oneId[0] ? oneId[0].conf : 0) + ' · txt→' + (txt[0] ? txt[0].conf : 0) + ' · resolved→' + resolved.length + ' · reopened→' + reopened.length);
  }
  function g7(rows) {
    var pulses = function (arr) {
      return fired(runOn(mkState([{ id: 'pa' }], arr.map(function (x, i) {
        return { ts: dAgo(x[0]), type: 'pulse.recorded', data: { personId: 'pa', load: x[1], mood: x[2], measured: x[3] !== false } };
      }))), 'R7');
    };
    var two = pulses([[10, 9, 3], [5, 9, 2]]);
    var loadA = pulses([[30, 9, 6], [20, 9, 5], [10, 8, 4]]);
    var slopeB = pulses([[21, 5, 8], [14, 5, 6], [7, 5, 5], [1, 5, 4]]);
    var est = runOn(mkState([{ id: 'pa' }], [
      { ts: dAgo(30), type: 'pulse.recorded', data: { personId: 'pa', load: 9, mood: 6, measured: true } },
      { ts: dAgo(20), type: 'pulse.recorded', data: { personId: 'pa', load: 9, mood: 5, measured: true } },
      { ts: dAgo(10), type: 'pulse.recorded', data: { personId: 'pa', load: 9, mood: 4, measured: true } },
      { ts: dAgo(2), type: 'pulse.recorded', data: { personId: 'pa', load: 99, mood: 1, measured: false } }
    ]));
    var estF = fired(est, 'R7');
    check(rows, 'G7', 'R7 burnout: <3 quiet · trigger A (mean≥8) · trigger B (slope≤−0.5/wk) · estimated/out-of-range excluded · sev always 3',
      two.length === 0 && loadA.length === 1 && loadA[0].conf === 'medium' && loadA[0].sev === 3 &&
      slopeB.length === 1 && /trigger B/.test(slopeB[0].basis.join(' ')) && slopeB[0].sev === 3 &&
      estF.length === 1 && /excluded/.test(estF[0].basis.join(' ')),
      '2 measured → silence · mean load 8.7 → A · mood 8→4 over 20d → B · bad rows counted in basis · MEDIUM conf ceiling, sev 3 permanently',
      '2→' + two.length + ' · A→' + (loadA[0] ? 'fired ' + loadA[0].conf : 0) + ' · B→' + (slopeB[0] ? 'fired' : 0) + ' · excluded-counted→' + (estF[0] ? 'yes' : 'no'));
  }
  function g8(rows) {
    var st = mkState([{ id: 'lead', name: 'Lead' }, { id: 'sk', name: 'Skip', reportsTo: 'lead', skipCadenceDays: 60 }, { id: 'brk', name: 'Broken', reportsTo: 'ghost' }],
      [{ ts: dAgo(61), type: 'skiplevel.logged', data: { personId: 'sk', note: 'x' } }]);
    var r = runOn(st);
    var firedR8 = fired(r, 'R8');
    var onBroken = firedR8.filter(function (f) { return f.key === 'R8:brk'; }).length;
    var neverSkip = fired(runOn(mkState([{ id: 'lead', name: 'Lead' }, { id: 'sk2', name: 'NewSkip', reportsTo: 'lead', createdAt: dAgo(70) }], [])), 'R8');
    check(rows, 'G8', 'R8 skip cadence: 61d fires HIGH · never-logged MEDIUM · broken line silent here (R9 owns it)',
      firedR8.length === 1 && firedR8[0].conf === 'high' && onBroken === 0 && neverSkip.length === 1 && neverSkip[0].conf === 'medium',
      'strictly past 60d person-row cadence → high · never logged → medium from createdAt · dangling-line person produces NO R8 row',
      '61d→' + firedR8.length + ' (' + (firedR8[0] ? firedR8[0].conf : '—') + ') · broken→' + onBroken + ' · never→' + (neverSkip[0] ? neverSkip[0].conf : 0));
  }
  function g9(rows) {
    var r = fired(runOn(mkState([{ id: 'lead', name: 'Lead' }, { id: 'brk', name: 'Broken One', reportsTo: 'ghost' }], [])), 'R9');
    check(rows, 'G9', 'R9 line integrity: dangling reportsTo fires HIGH, names the person', r.length === 1 && r[0].conf === 'high' && /Broken One/.test(r[0].title) && /ghost/.test(r[0].basis.join(' ')),
      'one broken line → one finding · names person + why · conf high · no playbook (Roster fix)',
      r.length + ' finding(s) · "' + (r[0] ? r[0].title : '—') + '" · play=' + (r[0] ? r[0].play : '—'));
  }
  function g10(rows) {
    var p = [{ id: 'pa', name: 'Ana', cadenceDays: 7 }];
    var e1 = { ts: dAgo(10), type: 'oneonone.logged', data: { personId: 'pa' } };
    var plain = fired(runOn(mkState(p, [e1])), 'R1').length;
    var dismissed = fired(runOn(mkState(p, [e1, { ts: dAgo(5), type: 'engine.dismissed', data: { key: 'R1:pa', title: 'x' } }])), 'R1').length;
    var snoozedFut = fired(runOn(mkState(p, [e1, { ts: dAgo(5), type: 'engine.snoozed', data: { key: 'R1:pa', until: dAhead(7), title: 'x' } }])), 'R1').length;
    var snoozedPast = fired(runOn(mkState(p, [e1, { ts: dAgo(9), type: 'engine.snoozed', data: { key: 'R1:pa', until: dAgo(2), title: 'x' } }])), 'R1').length;
    var unmuted = fired(runOn(mkState(p, [e1,
      { ts: dAgo(5), type: 'engine.dismissed', data: { key: 'R1:pa', title: 'x' } },
      { ts: dAgo(1), type: 'engine.unmuted', data: { key: 'R1:pa' } }])), 'R1').length;
    check(rows, 'G10', 'suppression: dismiss hides · future snooze hides · EXPIRED snooze resurfaces · unmute restores',
      plain === 1 && dismissed === 0 && snoozedFut === 0 && snoozedPast === 1 && unmuted === 1,
      'dismissed → 0 · snoozed until +7d → 0 · snoozed until −2d → BACK (stale suppression must not hide live signal) · unmuted → 1',
      'plain ' + plain + ' · dismissed ' + dismissed + ' · snooze+7d ' + snoozedFut + ' · snooze−2d ' + snoozedPast + ' · unmuted ' + unmuted);
  }
  function g11(rows) {
    var exact = byKey(runOn(mkState([{ id: 'pa' }], [{ ts: dAgo(14), type: 'goal.set', data: { goalId: 'g9', title: 'x', ownerId: 'pa' } }])), 'R3s:g9');
    var over = byKey(runOn(mkState([{ id: 'pa' }], [{ ts: dAgo(15), type: 'goal.set', data: { goalId: 'g9', title: 'x', ownerId: 'pa' } }])), 'R3s:g9');
    check(rows, 'G11', 'R3 silence is STRICTLY past 14d', !exact && !!over,
      'day-exactly-14 stays quiet · day 15 fires',
      '14d→' + (exact ? 'FIRED (bug)' : 'quiet') + ' · 15d→' + (over ? 'fired' : 'quiet'));
  }
  function g12(rows) {
    var cyc = LEADOS.store._findCycle(mkState([{ id: 'pa', reportsTo: 'pb' }, { id: 'pb', reportsTo: 'pa' }, { id: 'pc' }], []));
    var r = runOn(mkState([{ id: 'pa', name: 'A', reportsTo: 'pb' }, { id: 'pb', name: 'B', reportsTo: 'pa' }, { id: 'pc', name: 'C', reportsTo: 'pa' }], []));
    var r9 = fired(r, 'R9');
    var namedBoth = r9.filter(function (f) { return /(A|B)/.test(f.title); }).length >= 2;
    /* transitive doctrine: C reports to a cycle member → C's line is broken TOO —
       'lead A is on a broken line'. Hiding C would silently drop a skip. */
    var cTransitively = r9.filter(function (f) { return /C/.test(f.title) && /on a broken line/.test(f.basis.join(' ')); }).length === 1;
    var arch = fired(runOn(mkState([{ id: 'boss', name: 'Boss', archived: true }, { id: 'sub', name: 'Sub', reportsTo: 'boss' }], [])), 'R9');
    check(rows, 'G12', 'R9 cycle detection + transitive dependents + archived-target line', !!(cyc && cyc.length === 2 && r9.length === 3 && namedBoth && cTransitively && arch.length === 1),
      'pa↔pb cycle → findCycle returns both members → both named in R9 · C (reports into the cycle) named transitively with "on a broken line" · archived-target fires',
      'cycle ' + (cyc ? '[' + cyc.join(',') + ']' : 'not found') + ' · R9 findings ' + r9.length + ' (2 members + 1 transitive) · archived-target ' + arch.length);
  }
  function g13(rows) {
    var mk = function (extra) {
      var evs = [{ id: 'pl1', ts: dAgo(21), type: 'plan.created', data: { personId: 'pa', goal: 'Grow', d: 'D2', s: 'S2', actions: [], reviewBy: dAgo(1) } }];
      if (extra) evs = evs.concat(extra);
      return runOn(mkState([{ id: 'pa' }], evs));
    };
    var overdue = byKey(mk(), 'R10:pl1');
    var onDay = byKey(mk([{ ts: dAgo(1), type: 'plan.checkin', data: { planId: 'pl1', note: 'on the day' } }]), 'R10:pl1');
    var oldPlan = byKey(runOn(mkState([{ id: 'pa' }], [{ id: 'pl2', ts: dAgo(40), type: 'plan.created', data: { personId: 'pa', goal: 'Old', d: 'D1', s: 'S1', actions: [], reviewBy: dAgo(20) } }])), 'R10:pl2');
    var closedPlan = byKey(mk([{ ts: dAgo(2), type: 'plan.closed', data: { planId: 'pl1', result: 'achieved' } }]), 'R10:pl1');
    var rearmed = byKey(mk([{ ts: dAgo(3), type: 'plan.checkin', data: { planId: 'pl1', note: 'kept moving', nextReviewBy: dAhead(10) } }]), 'R10:pl1');
    var noReview = byKey(runOn(mkState([{ id: 'pa' }], [{ id: 'pl3', ts: dAgo(30), type: 'plan.created', data: { personId: 'pa', goal: 'No date', d: 'D3', s: 'S3', actions: [] } }])), 'R10:pl3');
    var early = byKey(mk([{ ts: dAgo(5), type: 'plan.checkin', data: { planId: 'pl1', note: 'too early to count' } }]), 'R10:pl1');
    check(rows, 'G13', 'R10 growth-plan follow-through: overdue fires HIGH · day-of check-in resolves · >14d sev 3 · closed quiet · re-arm works · early check-in does NOT count · no reviewBy skips',
      overdue && overdue.conf === 'high' && overdue.sev === 2 && !onDay && oldPlan && oldPlan.sev === 3 &&
      !closedPlan && !rearmed && !noReview && !!early,
      'reviewBy+1, no check-in → sev 2 high · check-in ON review day counts · 20d late → sev 3 · plan.closed → silence · check-in with nextReviewBy +10d → re-armed silence · check-in BEFORE reviewBy does not satisfy the review · missing reviewBy → skip',
      'overdue→' + (overdue ? 'sev' + overdue.sev + '/' + overdue.conf : 'none') + ' · dayOf→' + (onDay ? 'FIRED (bug)' : 'quiet') + ' · 20d→' + (oldPlan ? 'sev' + oldPlan.sev : 'none') + ' · closed→' + (closedPlan ? 'FIRED (bug)' : 'quiet') + ' · rearmed→' + (rearmed ? 'FIRED (bug)' : 'quiet') + ' · noReview→' + (noReview ? 'FIRED' : 'skip') + ' · early→' + (early ? 'still fires (correct)' : 'WRONGLY quiet'));
  }

  function run() {
    var rows = [];
    T().sweep();
    var suite = [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13,
                 g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11, g12, g13];
    suite.forEach(function (fn) {
      try { fn(rows); }
      catch (e) {
        rows.push({ id: fn.name ? fn.name.toUpperCase() : '?', name: '(harness exception)', pass: false,
          expected: 'test function completes', observed: 'threw: ' + (e && e.message ? e.message : e), lines: [String(e && e.stack ? e.stack.split('\n')[1] || '' : '')] });
      }
    });
    T().sweep();
    var passN = 0, failN = 0, skipN = 0;
    rows.forEach(function (r) { if (r.pass === true) passN++; else if (r.pass === 'skip') skipN++; else failN++; });
    return { rows: rows, pass: passN, fail: failN, skip: skipN, total: rows.length, at: new Date().toISOString(), fixedToday: FIXED };
  }

  return { run: run, FIXED: FIXED };
})();
