/* LeadOS pt-2 · js/events.js — append-only event store + projections.
   Carried byte-verified from pt-1: KNOWN registry · strict live append (unknown
   types rejected — typo-compat; imported unknowns kept but inert — forward-compat)
   · single-pass project() in stored array order (ts order NOT assumed; last-writer
   wins by append order) · pairKey ids/one/txt · resolution clears a pair until a
   NEWER conflict reopens · _skipped counters, dangling refs never guessed.
   NEW in pt-2: skiplevel.logged type · P.lines (skips = exactly one lead between;
   broken = missing/archived target or cycle — feed R9) · P.skiplevelLast ·
   P.span load pricing (directs AND skip minutes vs stated capacity).
   Pre-fill doctrine: nothing derived is ever persisted — stale state is impossible
   by construction. */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.events = 'js/events.js';

LEADOS.events = (function () {
  'use strict';

  var KNOWN = {
    'oneonone.logged': 1,     /* {personId, note?, mode?} */
    'skiplevel.logged': 1,    /* {personId, note?} — pt-2 */
    'pulse.recorded': 1,      /* {personId, load 0-10, mood 0-10, measured:bool} — estimated readings exist; R7 excludes them and counts */
    'feedback.given': 1,      /* {personId, polarity:'positive'|'corrective', sbi?{s,b,i,ask}, desc?{d,e,s,c}, note?} */
    'decision.logged': 1,     /* {title, severity 1-5, reviewDate?, refs?} */
    'decision.outcome': 1,    /* {decisionId, result, lessons?} */
    'goal.set': 1,            /* {goalId?, title, ownerId?} — goalId minted on append if absent */
    'goal.progress': 1,       /* {goalId, note} */
    'goal.updated': 1,        /* {goalId, ownerId?|title?} */
    'goal.closed': 1,         /* {goalId, result?} */
    'delegation.assigned': 1, /* {personId, task, level 1-5, checkInDate?} */
    'delegation.closed': 1,   /* {delegationId, result?} */
    'conflict.logged': 1,     /* {aId?, bId?, text, intensity 1-5?} — ids preferred; text-only allowed, priced LOW confidence by R6 */
    'conflict.followup': 1,   /* {conflictIds:[], pairKey?, note} */
    'conflict.resolved': 1,   /* {conflictIds:[], pairKey?, note} — clears pair until a NEWER conflict reopens */
    'sl.assessed': 1,         /* {personId, competence, commitment, d, s, note?} */
    'note.added': 1,
    'engine.snoozed': 1,      /* {key, until, title} — suppression is an event: auditable, reversible */
    'engine.dismissed': 1,    /* {key, title} */
    'engine.unmuted': 1,      /* {key} */
    'playbook.completed': 1   /* {playId, ctx?} */
  };

  function nowIso() { return new Date().toISOString(); }
  function todayIso() { var d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString(); }
  function daysAgoIso(n) { return new Date(Date.now() - n * 864e5).toISOString(); }
  function inDaysIso(n) { return new Date(Date.now() + n * 864e5).toISOString(); }

  function append(type, data, opts) {
    opts = opts || {};
    var st = LEADOS.store.state();
    if (!st) return { error: 'no state' };
    if (LEADOS.store.readOnly()) return { error: 'read-only boot — writes are hard-blocked (' + LEADOS.store.readOnlyWhy() + ')' };
    if (!KNOWN[type]) return { error: 'unknown event type "' + type + '" — live append is strict; imported unknowns are kept but inert' };
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'event data must be a plain object' };
    var d = JSON.parse(JSON.stringify(data));
    if (type === 'goal.set' && !d.goalId) d.goalId = LEADOS.store.mint('g');
    var ev = { id: LEADOS.store.mint('e'), ts: opts.ts || nowIso(), type: type, data: d };
    st.events.push(ev);
    LEADOS.store.auditLive('event:' + type, ev.id);
    LEADOS.store.save();
    if (!opts.silent && LEADOS.ui && typeof LEADOS.ui.refresh === 'function') LEADOS.ui.refresh();
    return ev;
  }

  function normText(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function pairKeyOf(d) {
    var ids = [];
    if (d.aId) ids.push(d.aId);
    if (d.bId) ids.push(d.bId);
    if (ids.length === 2) { ids.sort(); return 'ids:' + ids.join('|'); }
    if (ids.length === 1) return 'one:' + ids[0] + '|' + normText(d.text).slice(0, 24);
    return 'txt:' + normText(d.text).slice(0, 32);
  }

  /* project(state) → P. Recomputed per read. */
  function project(st) {
    var P = {
      people: st.people, peopleById: {}, directs: [], skips: [], lines: { broken: [] },
      oneononeLast: {}, oneononeCount: {}, skiplevelLast: {}, skiplevelCount: {},
      openDecisions: [], outcomesByDecision: {},
      openGoals: [], goalById: {},
      feedbackByPerson: {},
      delegationsOpenByPerson: {}, delegationById: {},
      openConflicts: [], conflictCountsByPair: {},
      pulsesByPerson: {},
      slByPerson: {},
      suppressed: {}, /* key → {kind, until?} */
      span: null,
      settings: st.meta.settings || {}, /* engine reads cadence defaults via P, not via store — fixtures stay module-free */
      _skipped: { missingTs: 0, danglingPerson: 0, danglingDecision: 0, danglingGoal: 0, danglingDelegation: 0, unknownType: 0 }
    };
    var i, e, d, pid;
    for (i = 0; i < st.people.length; i++) {
      var p = st.people[i];
      P.peopleById[p.id] = p;
      if (!p.archived && !p.reportsTo) P.directs.push(p); /* direct-to-me = no reportsTo; skips hang exactly one lead below */
    }
    var goalsClosed = {}, decisionsDone = {}, decisionIds = {}, delegationsClosed = {}, lastResolvedByPair = {};

    for (i = 0; i < st.events.length; i++) {
      e = st.events[i]; d = e.data || {};
      if (!KNOWN[e.type]) { P._skipped.unknownType++; continue; }
      if (!e.ts) { P._skipped.missingTs++; continue; }
      switch (e.type) {
        case 'oneonone.logged':
          pid = d.personId;
          if (!P.peopleById[pid]) { P._skipped.danglingPerson++; break; }
          P.oneononeCount[pid] = (P.oneononeCount[pid] || 0) + 1;
          if (!P.oneononeLast[pid] || P.oneononeLast[pid].ts < e.ts) P.oneononeLast[pid] = { ts: e.ts, id: e.id };
          break;
        case 'skiplevel.logged':
          pid = d.personId;
          if (!P.peopleById[pid]) { P._skipped.danglingPerson++; break; }
          P.skiplevelCount[pid] = (P.skiplevelCount[pid] || 0) + 1;
          if (!P.skiplevelLast[pid] || P.skiplevelLast[pid].ts < e.ts) P.skiplevelLast[pid] = { ts: e.ts, id: e.id };
          break;
        case 'pulse.recorded':
          pid = d.personId;
          if (!P.peopleById[pid]) { P._skipped.danglingPerson++; break; }
          (P.pulsesByPerson[pid] = P.pulsesByPerson[pid] || []).push({ id: e.id, ts: e.ts, load: d.load, mood: d.mood, measured: d.measured !== false });
          break;
        case 'feedback.given':
          pid = d.personId;
          if (!P.peopleById[pid]) { P._skipped.danglingPerson++; break; }
          (P.feedbackByPerson[pid] = P.feedbackByPerson[pid] || []).push({ id: e.id, ts: e.ts, polarity: d.polarity });
          break;
        case 'decision.logged':
          decisionIds[e.id] = 1;
          P.openDecisions.push({ id: e.id, ts: e.ts, title: d.title || '(untitled decision)', severity: d.severity, reviewDate: d.reviewDate || null });
          break;
        case 'decision.outcome':
          if (d.decisionId && decisionIds[d.decisionId]) { decisionsDone[d.decisionId] = e; P.outcomesByDecision[d.decisionId] = e; }
          else P._skipped.danglingDecision++;
          break;
        case 'goal.set':
          if (!d.goalId) { P._skipped.danglingGoal++; break; }
          P.goalById[d.goalId] = { id: d.goalId, evId: e.id, ts: e.ts, title: d.title || '(untitled goal)', ownerId: d.ownerId || null, lastProgressTs: null, progressN: 0 };
          break;
        case 'goal.progress':
          var g = P.goalById[d.goalId];
          if (!g) { P._skipped.danglingGoal++; break; }
          g.progressN++;
          if (!g.lastProgressTs || g.lastProgressTs < e.ts) g.lastProgressTs = e.ts;
          break;
        case 'goal.updated':
          var g2 = P.goalById[d.goalId];
          if (!g2) { P._skipped.danglingGoal++; break; }
          if (d.ownerId !== undefined) g2.ownerId = d.ownerId;
          if (typeof d.title === 'string' && d.title) g2.title = d.title;
          break;
        case 'goal.closed':
          if (d.goalId && P.goalById[d.goalId]) goalsClosed[d.goalId] = e;
          else P._skipped.danglingGoal++;
          break;
        case 'delegation.assigned':
          pid = d.personId;
          if (!P.peopleById[pid]) { P._skipped.danglingPerson++; break; }
          var row = { id: e.id, ts: e.ts, task: d.task || '(untitled task)', level: d.level || null, checkInDate: d.checkInDate || null, personId: pid };
          P.delegationById[e.id] = row;
          (P.delegationsOpenByPerson[pid] = P.delegationsOpenByPerson[pid] || []).push(row);
          break;
        case 'delegation.closed':
          if (d.delegationId && P.delegationById[d.delegationId]) delegationsClosed[d.delegationId] = e;
          else P._skipped.danglingDelegation++;
          break;
        case 'conflict.logged':
          var pk = pairKeyOf(d);
          var cRow = { id: e.id, ts: e.ts, pairKey: pk, aId: d.aId || null, bId: d.bId || null, text: d.text || '', intensity: d.intensity || null };
          P.openConflicts.push(cRow);
          P.conflictCountsByPair[pk] = (P.conflictCountsByPair[pk] || 0) + 1;
          if (!lastResolvedByPair[pk] || lastResolvedByPair[pk].ts < e.ts) delete lastResolvedByPair[pk];
          break;
        case 'conflict.resolved':
          var rp = d.pairKey || pairKeyOf(d);
          var rr = lastResolvedByPair[rp];
          if (!rr || rr.ts < e.ts) lastResolvedByPair[rp] = e;
          break;
        case 'conflict.followup': break; /* recorded for the log; no engine meaning */
        case 'sl.assessed':
          pid = d.personId;
          if (!P.peopleById[pid]) { P._skipped.danglingPerson++; break; }
          if (!P.slByPerson[pid] || P.slByPerson[pid].ts < e.ts) P.slByPerson[pid] = { id: e.id, ts: e.ts, d: d.d, s: d.s, competence: d.competence, commitment: d.commitment };
          break;
        case 'engine.snoozed':
          if (d.key) {
            if (d.until && d.until > todayIso()) P.suppressed[d.key] = { kind: 'snoozed', until: d.until, title: d.title || '' };
          }
          break;
        case 'engine.dismissed':
          if (d.key) P.suppressed[d.key] = { kind: 'dismissed', title: d.title || '' };
          break;
        case 'engine.unmuted':
          if (d.key) delete P.suppressed[d.key];
          break;
        default: break; /* note.added, playbook.completed: log only */
      }
    }

    /* post-pass: closes + resolutions + orphans (carried pt-1 doctrine) */
    P.openDecisions = P.openDecisions.filter(function (x) { return !decisionsDone[x.id]; });
    P.openGoals = Object.keys(P.goalById).map(function (k) { return P.goalById[k]; }).filter(function (g) { return !goalsClosed[g.id]; });
    Object.keys(delegationsClosed).forEach(function (did) {
      var row = P.delegationById[did]; if (!row) return;
      var list = P.delegationsOpenByPerson[row.personId] || [];
      P.delegationsOpenByPerson[row.personId] = list.filter(function (x) { return x.id !== did; });
    });
    P.openConflicts = P.openConflicts.filter(function (c) {
      var r = lastResolvedByPair[c.pairKey];
      return !(r && r.ts >= c.ts); /* resolution clears until a NEWER conflict reopens */
    });

    /* org lines: skips = exactly one live lead between person and you */
    var cyc = LEADOS.store._findCycle(st);
    st.people.forEach(function (p) {
      if (p.archived) return;
      if (!p.reportsTo) return; /* direct */
      if (cyc && cyc.indexOf(p.id) >= 0) { P.lines.broken.push({ person: p, reason: 'cycle', detail: 'member of reporting cycle ' + cyc.join('→') }); return; }
      var m = P.peopleById[p.reportsTo];
      if (!m) { P.lines.broken.push({ person: p, reason: 'target-missing', detail: 'reportsTo ' + p.reportsTo + ' — no such person' }); return; }
      if (m.archived) { P.lines.broken.push({ person: p, reason: 'target-archived', detail: 'reports to archived ' + m.name }); return; }
      if (!m.reportsTo) P.skips.push(p); /* manager is direct-to-me → this is my skip-level */
    });

    /* span-load: priced in weekly minutes, directs AND skips (pt-1 priced directs only) */
    var len = st.meta.settings.oneOnOneLengthMin, cap = st.meta.settings.weeklyOneOnOneCapacityMin;
    var dMin = 0, sMin = 0;
    P.directs.forEach(function (p) { dMin += len * (7 / (p.cadenceDays || 14)); });
    P.skips.forEach(function (p) { sMin += len * (7 / (p.skipCadenceDays || st.meta.settings.skipCadenceDefaultDays)); });
    P.span = { directMin: Math.round(dMin), skipMin: Math.round(sMin), totalMin: Math.round(dMin + sMin), capacityMin: cap, over: (dMin + sMin) > cap };
    return P;
  }

  /* ---------- demo seed / purge (flag set BEFORE rows; purge keeps the flag,
     so seeding is a once-ever demo decision, printed on the Data view) ---------- */
  function seedInto(st) {
    if (st.meta.seeded) return { error: 'seeded flag already set — the demo set is a once-ever decision; purge removes rows, not the flag' };
    st.meta.seeded = true;
    function person(f) { var p = { id: 'p-seed-' + f.n, name: f.n, role: f.r || '', team: f.t || '', cadenceDays: f.c || null, skipCadenceDays: f.sc || null, reportsTo: f.m || null, archived: false, createdAt: daysAgoIso(f.age), seed: true }; st.people.push(p); return p; }
    function ev(type, ago, data) { data = data || {}; data.seed = true; st.events.push({ id: 'e-seed-' + (st.events.length + 1) + '-' + type, ts: daysAgoIso(ago), type: type, data: data }); }
    var anika = person({ n: 'Anika Rao', r: 'Team lead · Payments', c: 7, age: 90 });
    var marcus = person({ n: 'Marcus Lee', r: 'Team lead · Platform', age: 20 });
    var dana = person({ n: 'Dana Kim', r: 'Team lead · Mobile', age: 90 });
    var priya = person({ n: 'Priya Nair', r: 'IC · Mobile', m: dana.id, age: 70 });

    ev('oneonone.logged', 15, { personId: anika.id });              /* Anika: cadence 7 → 8d over (R1) */
    ev('oneonone.logged', 29, { personId: anika.id });
    ev('oneonone.logged', 3, { personId: dana.id });                /* Dana: clean */
    /* Marcus: never logged, added 20d ago → R1 never-logged MEDIUM */
    ev('decision.logged', 30, { title: 'Cut release cadence to weekly', severity: 4, reviewDate: daysAgoIso(10) }); /* R2 sev 4 */
    ev('goal.set', 20, { goalId: 'g-seed-hiring', title: 'Define Q3 hiring plan' }); /* R3 ownerless + silent MEDIUM */
    ev('goal.set', 45, { goalId: 'g-seed-onboarding', title: 'Cut onboarding time to 2 weeks', ownerId: marcus.id });
    ev('goal.progress', 18, { goalId: 'g-seed-onboarding', note: 'drafted week-1 plan' }); /* R3 silent HIGH */
    [50, 41, 34, 26, 12].forEach(function (ago) { ev('feedback.given', ago, { personId: marcus.id, polarity: 'corrective' }); }); /* R4 n=5 HIGH */
    for (var k = 1; k <= 5; k++) ev('delegation.assigned', 30 - k, { personId: anika.id, task: 'seed task ' + k, level: 3 }); /* R5 sev 3 */
    ev('conflict.logged', 40, { aId: dana.id, bId: priya.id, text: 'scope dispute on mobile roadmap', intensity: 3 });
    ev('conflict.logged', 10, { aId: dana.id, bId: priya.id, text: 'flare-up over release ownership', intensity: 4 }); /* R6 */
    [[30, 9, 6], [20, 9, 5], [10, 8, 4], [2, 9, 3]].forEach(function (t) {
      ev('pulse.recorded', t[0], { personId: marcus.id, load: t[1], mood: t[2], measured: true }); /* R7 trigger A + B */
    });
    ev('sl.assessed', 21, { personId: anika.id, competence: 3, commitment: 3, d: 'D3', s: 'S3' });
    return { ok: true };
  }
  function purge(st) {
    st.people = st.people.filter(function (p) { return !p.seed; });
    st.events = st.events.filter(function (e) { return !(e.data && e.data.seed); });
    LEADOS.store._auditState(st, 'seed-purged', 'seed rows removed; meta.seeded flag kept (once-ever)');
    return { ok: true };
  }

  return {
    KNOWN: KNOWN,
    append: append, project: project, pairKeyOf: pairKeyOf,
    seedInto: seedInto, purge: purge,
    nowIso: nowIso, todayIso: todayIso, daysAgoIso: daysAgoIso, inDaysIso: inDaysIso
  };
})();
