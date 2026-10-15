/* LeadOS pt-1 · js/events.js — append-only event store + projections.
   One shared data layer: every module writes through LEADOS.events.append;
   every read comes from LEADOS.events.project(state) — recomputed per read,
   nothing derived is ever persisted (stale state is impossible by construction).
   Unknown event types in IMPORTED data are kept and ignored by projections
   (forward-compat); unknown types via live append are rejected (typo-compat).
   Dangling refs and bad timestamps are skipped + counted + printed — never guessed. */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.events = 'js/events.js';

LEADOS.events = (function () {
  'use strict';

  var KNOWN = {
    'oneonone.logged': 1,
    'pulse.recorded': 1,     /* data: {personId, load 0-10, mood 0-10, measured:bool} — estimated readings exist; R7 excludes them and counts */
    'feedback.given': 1,     /* data: {personId, polarity:'positive'|'corrective', sbi?{s,b,i,ask}, note?} */
    'decision.logged': 1,    /* data: {title, severity 1-5, reviewDate?, refs?} */
    'decision.outcome': 1,   /* data: {decisionId, result, lessons?} */
    'goal.set': 1,           /* data: {goalId?, title, ownerId?} — goalId minted here if absent */
    'goal.progress': 1,      /* data: {goalId, note} */
    'goal.updated': 1,       /* data: {goalId, ownerId?|title?} */
    'goal.closed': 1,        /* data: {goalId, result?} */
    'delegation.assigned': 1,/* data: {personId, task, level 1-5, checkInDate?} */
    'delegation.closed': 1,  /* data: {delegationId, result?} */
    'conflict.logged': 1,    /* data: {aId?, bId?, text, intensity 1-5?} — ids preferred; text-only is allowed, priced at low confidence */
    'conflict.followup': 1,  /* data: {conflictIds:[], pairKey?, note} */
    'conflict.resolved': 1,  /* data: {conflictIds:[], pairKey?, note} — clears the pair until a NEWER conflict reopens it */
    'sl.assessed': 1,        /* data: {personId, competence, commitment, d:'D1'..'D4', s:'S1'..'S4', note?} */
    'note.added': 1,
    'engine.snoozed': 1,     /* data: {key, until, title} — suppression is an event: auditable, reversible */
    'engine.dismissed': 1,   /* data: {key, title} */
    'engine.unmuted': 1,     /* data: {key} */
    'playbook.completed': 1  /* data: {playId, ctx?} */
  };

  function nowIso() { return new Date().toISOString(); }
  function todayIso() { var d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString(); }

  function append(type, data, opts) {
    opts = opts || {};
    var st = LEADOS.store.state();
    if (!st) return { error: 'no state' };
    if (!KNOWN[type]) return { error: 'unknown event type "' + type + '" — live append is strict; imported unknowns are kept but inert' };
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'event data must be a plain object' };
    var ev = { id: LEADOS.store.mint('e'), ts: opts.ts || nowIso(), type: type, data: JSON.parse(JSON.stringify(data)) };
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

  /* project(state) → P. Single pass over events, in stored order (ts order is NOT
     assumed — last-writer-wins is by array order, the append contract). */
  function project(st) {
    var P = {
      people: st.people, peopleById: {}, directs: [],
      oneononeLast: {}, oneononeCount: {},
      openDecisions: [], outcomesByDecision: {},
      openGoals: [], goalById: {},
      feedbackByPerson: {},
      delegationsOpenByPerson: {}, delegationById: {},
      openConflicts: [], conflictCountsByPair: {},
      pulsesByPerson: {},
      slByPerson: {},
      suppressed: {}, /* key → {kind:'snoozed'|'dismissed', until?} */
      _skipped: { missingTs: 0, danglingPerson: 0, danglingDecision: 0, danglingGoal: 0, danglingDelegation: 0, unknownType: 0 }
    };
    var i, e, d, pid;
    for (i = 0; i < st.people.length; i++) {
      var p = st.people[i];
      P.peopleById[p.id] = p;
      if (!p.archived && !p.reportsTo) P.directs.push(p); /* direct-to-me = no reportsTo set; skip-levels hang off a lead */
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
          if (d.decisionId) { decisionsDone[d.decisionId] = e; P.outcomesByDecision[d.decisionId] = e; }
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
          goalsClosed[d.goalId] = e; break;
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
          P.openConflicts.push({ id: e.id, ts: e.ts, aId: d.aId || null, bId: d.bId || null, text: d.text || '', pairKey: pk });
          break;
        case 'conflict.resolved':
          var rk = d.pairKey;
          if (!rk && Array.isArray(d.conflictIds)) {
            for (var ci = 0; ci < d.conflictIds.length; ci++) {
              for (var cj = 0; cj < P.openConflicts.length; cj++) if (P.openConflicts[cj].id === d.conflictIds[ci]) { rk = P.openConflicts[cj].pairKey; break; }
              if (rk) break;
            }
          }
          if (rk) lastResolvedByPair[rk] = e.ts;
          break;
        case 'sl.assessed':
          pid = d.personId;
          if (!P.peopleById[pid]) { P._skipped.danglingPerson++; break; }
          if (!P.slByPerson[pid] || P.slByPerson[pid].ts < e.ts) P.slByPerson[pid] = { ts: e.ts, d: d.d, s: d.s, competence: d.competence, commitment: d.commitment };
          break;
        case 'engine.snoozed':
          P.suppressed[d.key] = { kind: 'snoozed', until: d.until || null, title: d.title || '' };
          break;
        case 'engine.dismissed':
          P.suppressed[d.key] = { kind: 'dismissed', until: null, title: d.title || '' };
          break;
        case 'engine.unmuted':
          delete P.suppressed[d.key];
          break;
      }
    }

    /* post-pass orphan checks: an outcome/close pointing at a target that never
       existed is dangling — counted, dropped, never guessed. (Append order is the
       lineage contract; out-of-order refs inside a hand-built blob are dangling
       from the reader's seat regardless of intent.) */
    var ok;
    for (ok in decisionsDone) if (decisionsDone.hasOwnProperty(ok) && !decisionIds[ok]) { P._skipped.danglingDecision++; delete P.outcomesByDecision[ok]; delete decisionsDone[ok]; }
    for (ok in goalsClosed) if (goalsClosed.hasOwnProperty(ok) && !P.goalById[ok]) { P._skipped.danglingGoal++; delete goalsClosed[ok]; }
    for (ok in delegationsClosed) if (delegationsClosed.hasOwnProperty(ok) && !P.delegationById[ok]) { P._skipped.danglingDelegation++; delete delegationsClosed[ok]; }

    /* resolution fold: a pair is open only on conflicts newer than its last resolution */
    var stillOpen = [];
    for (i = 0; i < P.openConflicts.length; i++) {
      var c = P.openConflicts[i];
      var lr = lastResolvedByPair[c.pairKey];
      if (lr && c.ts <= lr) continue;
      stillOpen.push(c);
      P.conflictCountsByPair[c.pairKey] = (P.conflictCountsByPair[c.pairKey] || 0) + 1;
    }
    P.openConflicts = stillOpen;

    P.openDecisions = P.openDecisions.filter(function (x) { return !decisionsDone[x.id]; });
    for (var gid in P.goalById) if (P.goalById.hasOwnProperty(gid) && !goalsClosed[gid]) P.openGoals.push(P.goalById[gid]);
    for (pid in P.delegationsOpenByPerson) {
      if (!P.delegationsOpenByPerson.hasOwnProperty(pid)) continue;
      P.delegationsOpenByPerson[pid] = P.delegationsOpenByPerson[pid].filter(function (x) { return !delegationsClosed[x.id]; });
      if (!P.delegationsOpenByPerson[pid].length) delete P.delegationsOpenByPerson[pid];
    }
    for (pid in P.pulsesByPerson) {
      if (!P.pulsesByPerson.hasOwnProperty(pid)) continue;
      P.pulsesByPerson[pid].sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });
    }
    return P;
  }

  /* spanLoad: implied weekly 1:1 minutes from per-person cadences vs stated capacity.
     pt-1 addition — new multi-team leaders overcommit 1:1s structurally; R1 then
     punishes a promise the math said they couldn't keep. Shows the promise first.
     Cadence null → 14d default, printed as an assumption by the UI. */
  function spanLoad(st) {
    var per = [], total = 0;
    var len = (st.meta.settings && st.meta.settings.oneOnOneLengthMin) || 50;
    for (var i = 0; i < st.people.length; i++) {
      var p = st.people[i];
      if (p.archived || p.reportsTo) continue; /* directs only — skip-level 1:1s priced separately when R8 lands */
      var cad = p.cadenceDays || 14;
      var min = Math.round((7 / cad) * len);
      per.push({ id: p.id, name: p.name, cadenceDays: cad, assumed: !p.cadenceDays, minPerWeek: min });
      total += min;
    }
    var cap = (st.meta.settings && st.meta.settings.weeklyOneOnOneCapacityMin) || 240;
    return { perPerson: per, impliedMin: total, capacityMin: cap, overBy: total - cap, lengthMin: len };
  }

  /* Seed: a sample org that fires every rule at least once, for exploration and
     for verify-step 3. meta.seeded is set BEFORE rows (a mid-seed crash must not
     re-seed); purge removes seed rows, keeps the flag (no auto-reseed). */
  function seed(st, today, opts) {
    opts = opts || {};
    if (st.meta.seeded && !opts.force) return { skipped: true, note: 'already seeded — purge first or force' };
    st.meta.seeded = true;
    function day(off) { var d = new Date(today); d.setUTCDate(d.getUTCDate() + off); return d.toISOString(); }
    function mkPerson(name, role, cad, reportsTo, createdOff) {
      var p = { id: 'p' + Math.random().toString(36).slice(2, 8) + (++st.meta.idSeq).toString(36), name: name, role: role, cadenceDays: cad, reportsTo: reportsTo, archived: false, createdAt: day(createdOff), seed: true };
      st.people.push(p); return p;
    }
    function ev(type, off, data) { data.seed = true; st.events.push({ id: 'e' + Math.random().toString(36).slice(2, 8) + (++st.meta.idSeq).toString(36), ts: day(off), type: type, data: data }); }

    var priya = mkPerson('Priya Nair', 'Team lead · Platform', 7, null, -40);
    var dana = mkPerson('Dana Kovac', 'Team lead · Product', 14, null, -60);
    var marcus = mkPerson('Marcus Hale', 'Team lead · Ops', 14, null, -90);
    var anika = mkPerson('Anika Rao', 'Team lead · Data', 7, null, -45);
    var tom = mkPerson('Tom Reyes', 'Engineer (skip-level)', null, priya.id, -30);

    ev('oneonone.logged', -21, { personId: dana.id, note: 'sample: quarterly priorities' });   /* R1 fires high: 21 > 14 */
    ev('oneonone.logged', -3, { personId: anika.id, note: 'sample: fresh' });                   /* R1 silent */
    ev('oneonone.logged', -10, { personId: marcus.id, note: 'sample' });
    ev('oneonone.logged', -12, { personId: tom.id, note: 'sample skip-level' });
    /* Priya: never logged → R1 medium from createdAt -40d, cadence 7 */

    ev('decision.logged', -10, { title: 'CI vendor migration', severity: 4, reviewDate: day(-2).slice(0, 10) }); /* R2 sev 4 */
    ev('decision.logged', -5, { title: 'Retro format change', severity: 2, reviewDate: day(5).slice(0, 10) });   /* silent */
    ev('decision.logged', -30, { title: 'Freeze deploys Friday', severity: 2, reviewDate: day(-20).slice(0, 10) });
    ev('decision.outcome', -19, { decisionId: st.events[st.events.length - 1].id, result: 'validated', lessons: 'kept' }); /* out past review → silent */

    ev('goal.set', -20, { goalId: 'g-sample-orphan', title: 'Write the onboarding playbook', ownerId: null });    /* R3 ownerless high */
    ev('goal.set', -30, { goalId: 'g-sample-silent', title: 'Cut data-pipeline cycle time', ownerId: anika.id });
    ev('goal.progress', -16, { goalId: 'g-sample-silent', note: 'instrumented stage timings' });                  /* R3 silent 16>14 */
    ev('goal.set', -5, { goalId: 'g-sample-ok', title: 'Hire pipeline: 3 finalists', ownerId: dana.id });
    ev('goal.progress', -2, { goalId: 'g-sample-ok', note: 'onsite loops booked' });

    var fbDays = [-10, -20, -30, -40];
    fbDays.forEach(function (x) { ev('feedback.given', x, { personId: dana.id, polarity: 'corrective', note: 'sample corrective' }); }); /* R4 medium 4/4 */
    [-6, -16, -26, -36, -46].forEach(function (x) { ev('feedback.given', x, { personId: marcus.id, polarity: 'positive', note: 'sample reinforcing' }); }); /* R4 high 5/5 */
    ev('feedback.given', -8, { personId: anika.id, polarity: 'positive', note: 'sample' });
    ev('feedback.given', -18, { personId: anika.id, polarity: 'corrective', note: 'sample' });
    ev('feedback.given', -9, { personId: priya.id, note: 'sample no polarity → excluded, counted' });

    ['Sprint board ownership', 'Release checklist', 'On-call rota', 'Vendor ticket triage', 'Hiring screen calls'].forEach(function (t, ix) {
      ev('delegation.assigned', -6 - ix, { personId: anika.id, task: t, level: 3, checkInDate: day(4).slice(0, 10) }); /* R5: 5 open */
    });
    ev('delegation.assigned', -9, { personId: dana.id, task: 'Roadmap draft', level: 4 });
    ev('delegation.assigned', -11, { personId: dana.id, task: 'Budget review', level: 2 });

    ev('conflict.logged', -25, { aId: dana.id, bId: priya.id, text: 'sample: deploy window dispute' });
    ev('conflict.logged', -12, { aId: dana.id, bId: priya.id, text: 'sample: shared contractor flared again' });  /* R6 high-linked pair */
    ev('conflict.logged', -20, { text: 'sample: vendor escalation (unnamed)' });
    ev('conflict.logged', -7, { text: 'sample: vendor escalation (unnamed)' });                                  /* R6 low-text pair */

    ev('pulse.recorded', -21, { personId: marcus.id, load: 9, mood: 6, measured: true });
    ev('pulse.recorded', -14, { personId: marcus.id, load: 8, mood: 6, measured: true });
    ev('pulse.recorded', -7, { personId: marcus.id, load: 9, mood: 5, measured: true });                         /* R7: mean 8.7 ≥ 8 */
    [-6, -13, -20].forEach(function (x) { ev('pulse.recorded', x, { personId: priya.id, load: 9, mood: 4, measured: false }); }); /* estimated → R7 EXCLUDES + counts */

    ev('sl.assessed', -15, { personId: anika.id, competence: 'some', commitment: 'high', d: 'D2', s: 'S2', note: 'sample' });

    LEADOS.store._auditState(st, 'seeded', '5 people · 43 events · fires R1–R7 (plus silent controls)');
    return { added: true, note: 'sample org: Priya/Dana/Marcus/Anika/Tom — every rule fires at least once; controls stay silent' };
  }

  function purge(st) {
    var pN = 0, eN = 0, i;
    for (i = st.people.length - 1; i >= 0; i--) if (st.people[i].seed) { st.people.splice(i, 1); pN++; }
    for (i = st.events.length - 1; i >= 0; i--) if (st.events[i].data && st.events[i].data.seed) { st.events.splice(i, 1); eN++; }
    LEADOS.store._auditState(st, 'purged-seeds', 'removed ' + pN + ' people, ' + eN + ' events; meta.seeded kept true (no auto-reseed)');
    return { people: pN, events: eN };
  }

  return {
    KNOWN: KNOWN, append: append, project: project, spanLoad: spanLoad,
    seed: seed, purge: purge, todayIso: todayIso, pairKeyOf: pairKeyOf
  };
})();
