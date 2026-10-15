/* LeadOS pt-3 · js/events.js — append-only event store + projections.
   Carried byte-verified from pt-2 (read this session): KNOWN registry · strict
   live append (unknown types rejected; imported unknowns kept but inert) ·
   single-pass project() in stored array order (ts order NOT assumed; last-writer
   wins by append order) · pairKey ids/one/txt · resolution clears a pair until a
   NEWER conflict reopens · _skipped counters, dangling refs never guessed ·
   suppression fold (snoozed/dismissed/unmuted) · lines: direct = no reportsTo;
   skips = exactly one live lead below; broken = missing/archived/cycled ·
   span pricing (direct+skip minutes vs stated weekly capacity, printed math).
   NEW in pt-3: plan.created / plan.checkin / plan.closed → plansById,
   plansByPerson, openPlans, per-plan D-spine (created.d + check-in re-assessments,
   chronological, source ids kept) · danglingPlan counter.
   Doctrine: nothing derived is persisted — stale state is impossible by construction. */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.events = 'js/events.js';

LEADOS.events = (function () {
  'use strict';

  var KNOWN = {
    'oneonone.logged': 1,     /* {personId, note?, mode?:'direct'|'skip'} */
    'skiplevel.logged': 1,    /* {personId, note?} */
    'pulse.recorded': 1,      /* {personId, load 0-10, mood 0-10, measured:bool} — estimated readings exist; R7 excludes + counts them */
    'feedback.given': 1,      /* {personId, polarity:'positive'|'corrective', sbi?, desc?, note?} */
    'decision.logged': 1,     /* {title, severity 1-5, reviewDate?} */
    'decision.outcome': 1,    /* {decisionId, result, lessons?} */
    'goal.set': 1,            /* {goalId?, title, ownerId?} — goalId minted on append if absent */
    'goal.progress': 1,       /* {goalId, note} */
    'goal.updated': 1,        /* {goalId, ownerId?|title?} */
    'goal.closed': 1,         /* {goalId, result?} */
    'delegation.assigned': 1, /* {personId, task, level 1-5, checkInDate?} */
    'delegation.closed': 1,   /* {delegationId, result?} */
    'conflict.logged': 1,     /* {aId?, bId?, text, intensity 1-5?} */
    'conflict.followup': 1,   /* {conflictIds:[], pairKey?, note} */
    'conflict.resolved': 1,   /* {conflictIds:[], pairKey?, note} — clears the pair until a NEWER conflict reopens */
    'sl.assessed': 1,         /* {personId, competence, commitment, d, s, note?} */
    'plan.created': 1,        /* pt-3 {personId, goal, task?, d, s, actions[], reviewBy, fromPlayId?} */
    'plan.checkin': 1,        /* pt-3 {planId, note?, d?, progress?, nextReviewBy?} — d re-assessment extends the D-spine; nextReviewBy? re-arms R10 */
    'plan.closed': 1,         /* pt-3 {planId, result:'achieved'|'re-scoped'|'dropped', note?, nextReviewBy?} */
    'note.added': 1,          /* {note} */
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
    var s = LEADOS.store.save();
    if (!s.ok) { st.events.pop(); return { error: s.why }; } /* a failed write never enters the log */
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

  /* project(state) → P. Recomputed per read, in stored array order. */
  function project(st) {
    var P = {
      people: st.people, peopleById: {}, directs: [], skips: [], lines: { broken: [] },
      oneononeLast: {}, oneononeCount: {}, skiplevelLast: {}, skiplevelCount: {},
      openDecisions: [], decisionById: {}, outcomesByDecision: {},
      openGoals: [], goalById: {},
      feedbackByPerson: {},
      delegationsOpenByPerson: {}, delegationById: {},
      pairEvents: {}, openConflictPairs: [], lastResolvedByPair: {},
      pulsesByPerson: {},
      slByPerson: {}, slHistoryByPerson: {},
      plansById: {}, plansByPerson: {}, openPlans: [],
      suppressed: {}, /* key → {kind:'snoozed'|'dismissed', until?, title?} */
      span: null,
      settings: st.meta.settings || {},
      _skipped: { missingTs: 0, danglingPerson: 0, danglingDecision: 0, danglingGoal: 0, danglingDelegation: 0, danglingPlan: 0, unknownType: 0 }
    };
    var i, e, d, pid;

    for (i = 0; i < st.people.length; i++) {
      var p0 = st.people[i];
      P.peopleById[p0.id] = p0;
    }
    /* lines: direct = live, no reportsTo. skip = reportsTo a direct (exactly one
       live lead between). broken = missing/archived target, or cycle member. */
    var broken = {}, guarded = 0, cyc;
    var cycleMembers = {};
    var stView = { people: st.people };
    while ((cyc = LEADOS.store._findCycle(stView)) && guarded++ < st.people.length + 2) {
      cyc.forEach(function (id) { cycleMembers[id] = 1; broken[id] = 'cycle ' + cyc.join(' → '); });
      var minId = cyc.slice().sort()[0];
      var mp = P.peopleById[minId];
      if (!mp) break;
      /* read-time break on a COPY-free view: mark only; rows are not mutated */
      var tmp = mp.reportsTo; mp._rtTmp = tmp; mp.reportsTo = null;
    }
    for (i = 0; i < st.people.length; i++) { var pr = st.people[i]; if (pr._rtTmp !== undefined) { pr.reportsTo = pr._rtTmp; delete pr._rtTmp; } }
    for (i = 0; i < st.people.length; i++) {
      var p = st.people[i];
      if (p.archived) continue;
      if (broken[p.id]) { P.lines.broken.push({ id: p.id, name: p.name, why: broken[p.id] }); continue; }
      if (!p.reportsTo) { P.directs.push(p); continue; }
      var boss = P.peopleById[p.reportsTo];
      if (!boss) { P.lines.broken.push({ id: p.id, name: p.name, why: 'reportsTo ' + p.reportsTo + ' — no such person' }); continue; }
      if (boss.archived) { P.lines.broken.push({ id: p.id, name: p.name, why: 'reports to archived ' + boss.name }); continue; }
      if (broken[boss.id]) { P.lines.broken.push({ id: p.id, name: p.name, why: 'lead ' + boss.name + ' is on a broken line' }); continue; }
      if (!boss.reportsTo && !boss.archived) P.skips.push(p); /* exactly one lead below me */
      else { P.lines.broken.push({ id: p.id, name: p.name, why: 'two or more leads below you (' + boss.name + ' also has a lead) — outside the leads-of-leads model' }); }
    }

    var goalsClosed = {}, decisionsDone = {}, delegationsClosed = {}, decisionIds = {};
    var lastResolvedTs = {};

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
          (P.feedbackByPerson[pid] = P.feedbackByPerson[pid] || []).push({ id: e.id, ts: e.ts, polarity: d.polarity, sbi: d.sbi || null, desc: d.desc || null, note: d.note || '' });
          break;
        case 'decision.logged':
          decisionIds[e.id] = 1;
          var dec = { id: e.id, ts: e.ts, title: d.title || '(untitled decision)', severity: d.severity, reviewDate: d.reviewDate || null };
          P.decisionById[e.id] = dec;
          P.openDecisions.push(dec);
          break;
        case 'decision.outcome':
          if (d.decisionId && decisionIds[d.decisionId]) { decisionsDone[d.decisionId] = e; P.outcomesByDecision[d.decisionId] = e; }
          else P._skipped.danglingDecision++;
          break;
        case 'goal.set':
          if (!d.goalId) { P._skipped.danglingGoal++; break; }
          P.goalById[d.goalId] = { id: d.goalId, evId: e.id, ts: e.ts, title: d.title || '(untitled goal)', ownerId: d.ownerId || null, lastProgressTs: null, progressN: 0, closed: false };
          P.openGoals.push(P.goalById[d.goalId]);
          break;
        case 'goal.progress':
          var g = P.goalById[d.goalId];
          if (!g) { P._skipped.danglingGoal++; break; }
          g.progressN++;
          if (!g.lastProgressTs || g.lastProgressTs < e.ts) g.lastProgressTs = e.ts;
          break;
        case 'goal.updated':
          var gu = P.goalById[d.goalId];
          if (!gu) { P._skipped.danglingGoal++; break; }
          if (d.ownerId !== undefined) gu.ownerId = d.ownerId;
          if (d.title) gu.title = d.title;
          break;
        case 'goal.closed':
          var gc = P.goalById[d.goalId];
          if (!gc) { P._skipped.danglingGoal++; break; }
          gc.closed = true; gc.result = d.result || null;
          break;
        case 'delegation.assigned':
          pid = d.personId;
          if (!P.peopleById[pid]) { P._skipped.danglingPerson++; break; }
          var del = { id: e.id, ts: e.ts, personId: pid, task: d.task || '(unnamed task)', level: d.level || null, checkInDate: d.checkInDate || null };
          P.delegationById[e.id] = del;
          (P.delegationsOpenByPerson[pid] = P.delegationsOpenByPerson[pid] || []).push(del);
          break;
        case 'delegation.closed':
          if (d.delegationId && P.delegationById[d.delegationId]) delegationsClosed[d.delegationId] = e;
          else P._skipped.danglingDelegation++;
          break;
        case 'conflict.logged':
          var key = pairKeyOf(d);
          var cev = { id: e.id, ts: e.ts, pairKey: key, aId: d.aId || null, bId: d.bId || null, text: d.text || '', intensity: d.intensity || null };
          (P.pairEvents[key] = P.pairEvents[key] || []).push(cev);
          break;
        case 'conflict.followup':
          if (d.pairKey && !P.pairEvents[d.pairKey]) P._skipped.danglingPerson++; /* counts as unresolved-reference signal */
          break;
        case 'conflict.resolved':
          var rk = d.pairKey || (Array.isArray(d.conflictIds) && d.conflictIds.length ? (function () {
            for (var q = 0; q < st.events.length; q++) if (st.events[q].id === d.conflictIds[0]) return pairKeyOf(st.events[q].data || {});
            return null;
          })() : null);
          if (rk) { if (!lastResolvedTs[rk] || lastResolvedTs[rk] < e.ts) lastResolvedTs[rk] = e.ts; }
          break;
        case 'sl.assessed':
          pid = d.personId;
          if (!P.peopleById[pid]) { P._skipped.danglingPerson++; break; }
          var sl = { id: e.id, ts: e.ts, competence: d.competence, commitment: d.commitment, d: d.d || null, s: d.s || null, note: d.note || '' };
          (P.slHistoryByPerson[pid] = P.slHistoryByPerson[pid] || []).push(sl);
          if (!P.slByPerson[pid] || P.slByPerson[pid].ts < e.ts) P.slByPerson[pid] = sl;
          break;
        case 'plan.created':
          pid = d.personId;
          if (!P.peopleById[pid]) { P._skipped.danglingPerson++; break; }
          var plan = {
            id: e.id, personId: pid, ts: e.ts,
            goal: d.goal || '(untitled growth goal)', task: d.task || '',
            d: d.d || null, s: d.s || null,
            actions: Array.isArray(d.actions) ? d.actions.slice() : [],
            reviewBy: d.reviewBy || null,
            spine: [{ ts: e.ts, d: d.d || null, src: e.id }],
            checkins: 0, lastActivityTs: e.ts, lastProgress: null,
            closed: false, result: null
          };
          P.plansById[e.id] = plan;
          (P.plansByPerson[pid] = P.plansByPerson[pid] || []).push(plan);
          P.openPlans.push(plan);
          break;
        case 'plan.checkin':
          var pl = P.plansById[d.planId];
          if (!pl) { P._skipped.danglingPlan++; break; }
          pl.checkins++;
          if (pl.lastActivityTs < e.ts) pl.lastActivityTs = e.ts;
          if (typeof d.progress === 'number') pl.lastProgress = d.progress;
          if (d.d && d.d !== pl.spine[pl.spine.length - 1].d) pl.spine.push({ ts: e.ts, d: d.d, src: e.id });
          else if (d.d) pl.spine.push({ ts: e.ts, d: d.d, src: e.id }); /* same level still earns a dated point */
          if (d.nextReviewBy) pl.reviewBy = String(d.nextReviewBy); /* re-arm R10 — wired from growth-review.submit */
          break;
        case 'plan.closed':
          var pc = P.plansById[d.planId];
          if (!pc) { P._skipped.danglingPlan++; break; }
          pc.closed = true; pc.result = d.result || null;
          if (pc.lastActivityTs < e.ts) pc.lastActivityTs = e.ts;
          if (d.nextReviewBy) pc.reviewBy = String(d.nextReviewBy);
          break;
        case 'engine.snoozed':
          P.suppressed[d.key] = { kind: 'snoozed', until: d.until || null, title: d.title || d.key };
          break;
        case 'engine.dismissed':
          P.suppressed[d.key] = { kind: 'dismissed', title: d.title || d.key };
          break;
        case 'engine.unmuted':
          delete P.suppressed[d.key];
          break;
      }
    }

    /* open determinations (append order wins; ts comparisons only inside a person/pair) */
    P.openDecisions = P.openDecisions.filter(function (x) { return !decisionsDone[x.id]; });
    P.openGoals = P.openGoals.filter(function (x) { return !x.closed; });
    Object.keys(P.delegationsOpenByPerson).forEach(function (pidK) {
      P.delegationsOpenByPerson[pidK] = P.delegationsOpenByPerson[pidK].filter(function (x) { return !delegationsClosed[x.id]; });
    });
    P.openPlans = P.openPlans.filter(function (x) { return !x.closed; });
    P.lastResolvedByPair = lastResolvedTs;
    Object.keys(P.pairEvents).forEach(function (k) {
      var evs = P.pairEvents[k];
      var latest = evs[evs.length - 1];
      var res = lastResolvedTs[k];
      if (res && res >= latest.ts) return; /* resolved and nothing newer → pair stays quiet */
      P.openConflictPairs.push({ pairKey: k, events: evs, latestTs: latest.ts, lastResolvedTs: res || null });
    });

    /* span pricing: stated minutes, printed math — never inferred */
    var len = P.settings.oneOnOneLengthMin || 50;
    var cap = P.settings.weeklyOneOnOneCapacityMin || 240;
    var dMin = P.directs.length * len, sMin = P.skips.length * len;
    P.span = {
      directs: P.directs.length, skips: P.skips.length,
      directMin: dMin, skipMin: sMin, totalMin: dMin + sMin, capacityMin: cap, lengthMin: len,
      over: (dMin + sMin) > cap,
      math: P.directs.length + ' directs × ' + len + 'm + ' + P.skips.length + ' skips × ' + len + 'm (same length, printed assumption) = ' + (dMin + sMin) + 'm vs stated capacity ' + cap + 'm'
    };
    return P;
  }

  return {
    KNOWN: KNOWN,
    append: append, project: project, pairKeyOf: pairKeyOf,
    nowIso: nowIso, todayIso: todayIso, daysAgoIso: daysAgoIso, inDaysIso: inDaysIso
  };
})();
