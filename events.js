/* LeadOS mf-5 · js/events.js — the shared event layer.
   Every module writes events; every module reads the SAME projections.
   Projections are recomputed per read — nothing derived is persisted,
   so a case registered anywhere is visible everywhere at next render.
   ── Provenance ──────────────────────────────────────────────────────────
   API names (emit/emitMany, addPerson/updatePerson, open* projections,
   pulsesMeasured discipline, pair projections) secondhand-verified from the
   mf-4 README + S8 log head-reads; ALL code here is re-authored (upstream
   bodies were never byte-readable from this environment).
   mf-5 additions: meetings projection (weekly load), premortem projection,
   lineToMe with cycle guard, conflict model made EXPLICIT (mf-4's docs
   contradicted themselves on empty-counterpart semantics — see pairLabel). */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.events = 'js/events.js';

LEADOS.events = (function () {
  'use strict';
  var store = function () { return LEADOS.store; };

  /* ── write path ─────────────────────────────────────────────────────── */
  function emit(type, data, personId, seed) {
    var st = store().state();
    var ev = { id: store().newId('e'), ts: store().nowISO(), type: type,
      personId: personId || null, data: data || {}, seed: !!seed };
    st.events.push(ev);
    var r = store().save();
    store().refreshPill();
    if (LEADOS._changed) LEADOS._changed(r);
    return ev;
  }
  function emitMany(list, seed) {
    return list.map(function (x) { return emit(x.type, x.data, x.personId, seed); });
  }
  function addPerson(fields, seed) {
    var st = store().state();
    var p = { id: store().newId('p'),
      name: String(fields.name || '').trim() || 'unnamed',
      role: String(fields.role || '').trim(),
      cadenceDays: (fields.cadenceDays > 0 && fields.cadenceDays <= 365) ? Math.round(fields.cadenceDays) : 14,
      reportsTo: fields.reportsTo || 'me',
      archived: false, seed: !!seed,
      createdAt: store().nowISO(),   /* additive mf-5: R1/R8 "never logged" need a start date */
      sl: fields.sl || null };
    st.people.push(p);
    store().log('person', 'added ' + p.name + ' (' + p.id + (seed ? ', seed' : '') + ')');
    var r = store().save(); store().refreshPill();
    if (LEADOS._changed) LEADOS._changed(r);
    return p;
  }
  function updatePerson(id, patch) {
    var st = store().state();
    var p = null, i;
    for (i = 0; i < st.people.length; i++) if (st.people[i].id === id) { p = st.people[i]; break; }
    if (!p) return null;
    Object.keys(patch).forEach(function (k) {
      if (k === 'id') return;
      if (k === 'cadenceDays') { var n = Math.round(patch[k]); if (n > 0 && n <= 365) p.cadenceDays = n; return; }
      p[k] = patch[k];
    });
    store().log('person', 'updated ' + p.name + ' → ' + Object.keys(patch).join(', '));
    var r = store().save(); store().refreshPill();
    if (LEADOS._changed) LEADOS._changed(r);
    return p;
  }

  /* ── read path: projections ─────────────────────────────────────────── */
  function dayUTC(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return null;
    return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 864e5);
  }
  function normText(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /* Endpoints of a conflict: 'me' (the leader — default party A) or a
     roster id / free text / 'unnamed'. EXPLICIT mf-5 semantics:
       partyA absent            → 'me'
       partyB (counterpart) id  → linked endpoint, link confidence high
       partyB text only         → text endpoint, medium (spelling drift printed)
       partyB absent entirely   → 'unnamed', low — basis tells you to name them */
  function endpointOf(ev, side) {
    var d = ev.data || {};
    if (side === 'a') {
      if (typeof d.partyAPersonId === 'string' && d.partyAPersonId) return { kind: 'person', key: 'p:' + d.partyAPersonId, personId: d.partyAPersonId };
      if (normText(d.partyAText)) return { kind: 'text', key: 't:' + normText(d.partyAText), text: normText(d.partyAText) };
      return { kind: 'me', key: 'me' };
    }
    if (typeof d.counterpartPersonId === 'string' && d.counterpartPersonId) return { kind: 'person', key: 'p:' + d.counterpartPersonId, personId: d.counterpartPersonId };
    if (normText(d.counterpartText)) return { kind: 'text', key: 't:' + normText(d.counterpartText), text: normText(d.counterpartText) };
    return { kind: 'unnamed', key: 'unnamed' };
  }
  function pairKeyOf(a, b) { return a.key < b.key ? a.key + '×' + b.key : b.key + '×' + a.key; }
  function pairLabel(a, b, peopleById) {
    function name(e) {
      if (e.kind === 'me') return 'You';
      if (e.kind === 'person') { var p = peopleById[e.personId]; return p ? p.name : '(archived person)'; }
      if (e.kind === 'text') return '“' + e.text + '” (text link)';
      return 'unnamed counterpart';
    }
    return name(a) + ' × ' + name(b);
  }

  function project(state) {
    var P = {};
    var people = state.people || [], events = state.events || [];
    var peopleById = P.peopleById = {};
    people.forEach(function (p) { peopleById[p.id] = p; });
    P.people = people;
    P.actives = people.filter(function (p) { return !p.archived; });
    P.directs = P.actives.filter(function (p) { return p.reportsTo === 'me'; });

    /* lineToMe with cycle guard — NEW mf-5. A reportsTo cycle (or archived /
       missing intermediate) is a broken line → arrival/skip rules go SILENT
       rather than guess. */
    P.lineToMe = function (person) {
      var chain = [], seen = {}, cur = person;
      seen[person.id] = true;
      var hops = 0;
      while (cur && cur.reportsTo && cur.reportsTo !== 'me') {
        var next = peopleById[cur.reportsTo];
        if (!next) return { ok: false, reason: 'broken', chain: chain, detail: cur.name + ' reports to unknown id "' + cur.reportsTo + '"' };
        if (seen[next.id]) return { ok: false, reason: 'cycle', chain: chain, detail: 'reportsTo cycle at ' + next.name };
        if (next.archived) return { ok: false, reason: 'archived', chain: chain, detail: next.name + ' (intermediate) is archived' };
        chain.push(next); seen[next.id] = true; cur = next;
        if (++hops > 20) return { ok: false, reason: 'cycle', chain: chain, detail: 'chain longer than 20 — treated as cycle' };
      }
      if (!cur || cur.reportsTo !== 'me') return { ok: false, reason: 'broken', chain: chain, detail: 'chain does not reach you' };
      return { ok: true, chain: chain, depth: chain.length + 1 };
    };

    /* single-pass event projections */
    var oneLast = {}, oneSkipLast = {};
    var decisions = [], decisionsById = {}, outcomes = {}, premortems = {};
    var goals = [], goalsById = {}, goalLastProgress = {}, goalProgressN = {}, goalOwner = {}, goalClosed = {};
    var feedbackByPerson = {};
    var delegationsById = {}, delegClosed = {};
    var conflicts = [], conflictResolved = {};
    var pulses = {};
    var meetingsById = {}, meetingEnded = {}, meetingUpdates = {};
    var incidentsById = {}, incidentLast = {}, incidentClosed = {};
    var winsById = {}, winVerified = {};
    var expectations = null;
    var tourVisits = {};
    var snoozed = {}, dismissed = {};

    events.forEach(function (ev) {
      var d = ev.data || {};
      switch (ev.type) {
        case 'oneonone.logged':
          if (ev.personId) {
            if (d.mode === 'skip') { if (!oneSkipLast[ev.personId] || ev.ts > oneSkipLast[ev.personId].ts) oneSkipLast[ev.personId] = ev; }
            else { if (!oneLast[ev.personId] || ev.ts > oneLast[ev.personId].ts) oneLast[ev.personId] = ev; }
          }
          break;
        case 'decision.registered': decisions.push(ev); decisionsById[ev.id] = ev; break;
        case 'decision.outcome': if (d.decisionId) outcomes[d.decisionId] = ev; break;
        case 'premortem.held': if (d.decisionId) premortems[d.decisionId] = ev; break;
        case 'goal.set': goals.push(ev); goalsById[ev.id] = ev; if (d.ownerId) goalOwner[ev.id] = d.ownerId; break;
        case 'goal.assigned': if (d.goalId) goalOwner[d.goalId] = d.ownerId || null; break;
        case 'goal.progress':
          if (d.goalId) {
            goalProgressN[d.goalId] = (goalProgressN[d.goalId] || 0) + 1;
            if (!goalLastProgress[d.goalId] || ev.ts > goalLastProgress[d.goalId]) goalLastProgress[d.goalId] = ev.ts;
          }
          break;
        case 'goal.closed': if (d.goalId) goalClosed[d.goalId] = ev; break;
        case 'feedback.given':
          if (ev.personId) {
            (feedbackByPerson[ev.personId] = feedbackByPerson[ev.personId] || []).push(ev);
          }
          break;
        case 'delegation.assigned': delegationsById[ev.id] = ev; break;
        case 'delegation.closed': if (d.delegationId) delegClosed[d.delegationId] = ev; break;
        case 'conflict.registered': conflicts.push(ev); break;
        case 'conflict.resolved': if (d.conflictId) conflictResolved[d.conflictId] = ev; break;
        case 'pulse.logged':
          if (ev.personId) {
            var rec = pulses[ev.personId] = pulses[ev.personId] || { measured: [], estimatedCount: 0 };
            if (d.measured === true && typeof d.mood === 'number' && typeof d.load === 'number') {
              rec.measured.push(ev);
            } else { rec.estimatedCount++; }
          }
          break;
        case 'meeting.series': meetingsById[ev.id] = ev; break;
        case 'meeting.updated': if (d.seriesId) meetingUpdates[d.seriesId] = ev; break;
        case 'meeting.ended': if (d.seriesId) meetingEnded[d.seriesId] = ev; break;
        case 'incident.registered': incidentsById[ev.id] = ev; incidentLast[ev.id] = ev.ts; break;
        case 'incident.update':
          if (d.incidentId) {
            if (!incidentLast[d.incidentId] || ev.ts > incidentLast[d.incidentId]) incidentLast[d.incidentId] = ev.ts;
            if (d.closed === true) incidentClosed[d.incidentId] = ev;
          }
          break;
        case 'win.planned': winsById[ev.id] = ev; break;
        case 'win.verified': if (d.winId) winVerified[d.winId] = ev; break;
        case 'expectations.captured': if (!expectations || ev.ts > expectations.ts) expectations = ev; break;
        case 'tour.visit': if (ev.personId) tourVisits[ev.personId] = (tourVisits[ev.personId] || 0) + 1; break;
        case 'engine.snooze': if (d.key && d.until) snoozed[d.key] = d.until; break;
        case 'engine.dismiss': if (d.key) dismissed[d.key] = true; break;
        case 'engine.unmute': if (d.key) delete dismissed[d.key]; break;
      }
    });

    P.oneononeLast = oneLast; P.oneononeSkipLast = oneSkipLast;

    P.decisions = decisions.map(function (ev) {
      var d = ev.data || {};
      return { id: ev.id, ts: ev.ts, title: String(d.title || '(untitled decision)'),
        severity: (typeof d.severity === 'number' && d.severity >= 1 && d.severity <= 5) ? d.severity : null,
        reviewDate: (typeof d.reviewDate === 'string' && !isNaN(Date.parse(d.reviewDate))) ? d.reviewDate : null,
        outcome: outcomes[ev.id] || null, premortem: premortems[ev.id] || null, ev: ev };
    });
    P.openDecisions = P.decisions.filter(function (x) { return !x.outcome; });
    P.premortems = premortems;

    P.goals = goals.map(function (ev) {
      var d = ev.data || {};
      var ownerId = goalOwner[ev.id] || null;
      return { id: ev.id, ts: ev.ts, title: String(d.title || '(untitled goal)'),
        ownerId: ownerId, owner: ownerId === 'me' ? { name: 'You' } : (peopleById[ownerId] || null),
        lastProgressTs: goalLastProgress[ev.id] || null, progressN: goalProgressN[ev.id] || 0,
        closed: goalClosed[ev.id] || null, ev: ev };
    });
    P.openGoals = P.goals.filter(function (g) { return !g.closed; });

    P.feedbackByPerson = feedbackByPerson;

    P.openDelegations = Object.keys(delegationsById).map(function (id) { return delegationsById[id]; })
      .filter(function (ev) { return !delegClosed[ev.id]; });
    P.delegationsOpenByPerson = {};
    P.openDelegations.forEach(function (ev) {
      if (!ev.personId) return;
      (P.delegationsOpenByPerson[ev.personId] = P.delegationsOpenByPerson[ev.personId] || []).push(ev);
    });

    P.conflicts = conflicts.map(function (ev) {
      var a = endpointOf(ev, 'a'), b = endpointOf(ev, 'b');
      var conf = (a.kind === 'unnamed' || b.kind === 'unnamed') ? 'low'
        : (a.kind === 'text' || b.kind === 'text') ? 'medium' : 'high';
      return { id: ev.id, ts: ev.ts, topic: String((ev.data || {}).topic || '(no topic)'),
        a: a, b: b, pairKey: pairKeyOf(a, b), pairLabel: pairLabel(a, b, peopleById),
        linkConf: conf, resolved: conflictResolved[ev.id] || null, ev: ev };
    });
    P.openConflicts = P.conflicts.filter(function (c) { return !c.resolved; });
    P.conflictPairs = {};
    P.openConflicts.forEach(function (c) {
      (P.conflictPairs[c.pairKey] = P.conflictPairs[c.pairKey] || []).push(c);
    });
    /* nexus: per PERSON endpoint, count open conflicts + distinct RESOLVABLE
       counterparts (roster-linked or 'me'; text endpoints are listed in basis,
       never counted — you cannot dedupe a name reliably). */
    P.conflictNexus = {};
    P.openConflicts.forEach(function (c) {
      [c.a, c.b].forEach(function (ep, idx) {
        if (ep.kind !== 'person') return;
        var other = idx === 0 ? c.b : c.a;
        var n = P.conflictNexus[ep.personId] = P.conflictNexus[ep.personId] || { open: 0, distinct: {}, textCounterparts: [] };
        n.open++;
        if (other.kind === 'person' || other.kind === 'me') n.distinct[other.key] = true;
        else n.textCounterparts.push(other.kind === 'text' ? other.text : 'unnamed');
      });
    });

    P.pulses = pulses;
    Object.keys(feedbackByPerson).forEach(function (pid) {
      feedbackByPerson[pid].sort(function (x, y) { return x.ts < y.ts ? -1 : 1; });
    });

    /* meetings: active series + weekly load per person — NEW mf-5 */
    P.meetingSeries = Object.keys(meetingsById).map(function (id) {
      var ev = meetingsById[id];
      var d = Object.assign({}, ev.data || {}, (meetingUpdates[id] || {}).data || {});
      var dur = (typeof d.endMin === 'number' && typeof d.startMin === 'number') ? d.endMin - d.startMin : 0;
      var dow = Array.isArray(d.dow) ? d.dow.filter(function (x) { return x >= 0 && x <= 6; }) : [];
      var weekly = dur > 0 && dow.length ? Math.round(dur * dow.length * (d.cadence === 'biweekly' ? 0.5 : 1)) : 0;
      return { id: id, ts: ev.ts, title: String(d.title || '(untitled meeting)'),
        startMin: d.startMin, endMin: d.endMin, dow: dow,
        attendeeIds: Array.isArray(d.attendeeIds) ? d.attendeeIds : [],
        cadence: d.cadence === 'biweekly' ? 'biweekly' : 'weekly',
        weeklyMinutes: weekly, ended: meetingEnded[id] || null, ev: ev };
    }).filter(function (s) { return !s.ended; });
    P.weeklyMeetingLoad = {};
    P.meetingSeries.forEach(function (s) {
      s.attendeeIds.forEach(function (pid) {
        var rec = P.weeklyMeetingLoad[pid] = P.weeklyMeetingLoad[pid] || { minutes: 0, series: [] };
        rec.minutes += s.weeklyMinutes;
        rec.series.push({ title: s.title, minutes: s.weeklyMinutes, id: s.id });
      });
    });

    P.incidents = Object.keys(incidentsById).map(function (id) {
      var ev = incidentsById[id];
      return { id: id, ts: ev.ts, title: String((ev.data || {}).title || '(untitled incident)'),
        lastUpdateTs: incidentLast[id] || ev.ts, closed: incidentClosed[id] || null, ev: ev };
    });
    P.openIncidents = P.incidents.filter(function (x) { return !x.closed; });

    P.wins = Object.keys(winsById).map(function (id) {
      var ev = winsById[id];
      var d = ev.data || {};
      return { id: id, ts: ev.ts, title: String(d.title || '(untitled win)'),
        verifyDate: (typeof d.verifyDate === 'string' && !isNaN(Date.parse(d.verifyDate))) ? d.verifyDate : null,
        verified: winVerified[id] || null, ev: ev };
    });
    P.openWins = P.wins.filter(function (w) { return !w.verified; });

    P.expectations = expectations;
    P.tourVisits = tourVisits;
    P.memory = { snoozed: snoozed, dismissed: dismissed };
    P.appointment = state.meta ? state.meta.appointment : null;
    P.dayUTC = dayUTC;
    return P;
  }

  /* ── seed / purge (dev tooling; honest about what it is) ────────────── */
  function dayOffset(n) { /* today minus n days, local */
    var d = new Date(); d.setDate(d.getDate() - n);
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function ts(nDaysAgo, h) { return dayOffset(nDaysAgo) + 'T' + (h || '10') + ':00:00'; }

  /* seed(apiArg) — apiArg lets the health wall seed a DISPOSABLE store
     (T11). Without a param it targets the singleton and fires _changed;
     with one it writes silently and never re-renders (recursion guard:
     T11 runs INSIDE a render; an unguarded _changed would loop the wall).
     People rows are created inline — the public addPerson() saves on
     every call, which would violate flag-before-rows on a mid-seed crash. */
  function seed(apiArg) {
    var api = apiArg || LEADOS.store;
    var S = api.state();
    if (S.meta.seeded) return { ok: false, reason: 'already-seeded',
      detail: 'the no-reseed flag is permanent (set before any row is written) — purge clears the rows, not the flag' };
    /* doctrine: flag BEFORE rows, so a crash mid-seed never reseeds */
    S.meta.seeded = true;
    S.meta.seedPrevAppointment = S.meta.appointment || null;

    function mkPerson(fields) {
      var p = { id: api._newId('p'), name: fields.name, role: fields.role || '',
        cadenceDays: fields.cadenceDays || 14, reportsTo: fields.reportsTo || 'me',
        archived: false, seed: true, createdAt: api.nowISO ? api.nowISO() : new Date().toISOString(), sl: null };
      S.people.push(p); return p;
    }
    var A = mkPerson({ name: 'Anika Rao', role: 'Team lead · Platform', cadenceDays: 7 });
    var M = mkPerson({ name: 'Marcus Lindqvist', role: 'Team lead · Growth' });
    var T = mkPerson({ name: 'Theo Baker', role: 'Engineer (direct)' });
    var D = mkPerson({ name: 'Dana Cole', role: 'Engineer · Platform', reportsTo: A.id });
    var Pr = mkPerson({ name: 'Priya Nair', role: 'Designer · Platform', reportsTo: A.id });
    var J = mkPerson({ name: 'Jonas Weber', role: 'Growth marketer', reportsTo: M.id });

    function seedEmit(type, data, personId, tsStr) {
      var ev = { id: api._newId('e'), ts: tsStr, type: type, personId: personId || null, data: data || {}, seed: true };
      S.events.push(ev); return ev;
    }

    /* R1: Theo 1:1 21d ago on a 14d cadence → overdue. Anika fresh. */
    seedEmit('oneonone.logged', { mode: 'regular', note: 'career chat' }, T.id, ts(21));
    seedEmit('oneonone.logged', { mode: 'regular' }, A.id, ts(3));
    /* R8: Dana skip-level 40d ago (28d cadence). Jonas recent. */
    seedEmit('oneonone.logged', { mode: 'skip' }, D.id, ts(40));
    seedEmit('oneonone.logged', { mode: 'skip' }, J.id, ts(9));
    /* R2: decision past review, no outcome. R15: sev-4 ungated at 4d (fires)
       and sev-4 at 1d (grace — silent). Contrast is deliberate. */
    var d1 = seedEmit('decision.registered', { title: 'Move Platform to a weekly release train', severity: 3, reviewDate: dayOffset(5) }, null, ts(30));
    seedEmit('decision.registered', { title: 'Consolidate CI vendors (contracts, migration risk)', severity: 4, reviewDate: dayOffset(-10) }, null, ts(4));
    seedEmit('decision.registered', { title: 'Re-seat the Growth pod', severity: 4, reviewDate: dayOffset(-20) }, null, ts(1));
    /* R3: ownerless goal + silent goal */
    var g1 = seedEmit('goal.set', { title: 'Cut onboarding drop-off to <20%', ownerId: T.id }, null, ts(30));
    seedEmit('goal.set', { title: 'SOC2 Type I readiness', ownerId: null }, null, ts(10));
    /* R4: Dana — 3 corrective in 60d, nothing reinforcing */
    seedEmit('feedback.given', { polarity: 'corrective', sbi: { s: 'code review', b: 'rejected without rationale', i: 'Priya stopped proposing' } }, D.id, ts(30));
    seedEmit('feedback.given', { polarity: 'corrective', sbi: { s: 'standup', b: 'interrupted twice', i: 'updates got shorter' } }, D.id, ts(20));
    seedEmit('feedback.given', { polarity: 'corrective', sbi: { s: 'incident review', b: 'blamed the junior', i: 'team went quiet' } }, D.id, ts(10));
    /* R5: Theo carries 5 open delegations */
    ['Own the release checklist', 'Run vendor bake-off', 'Mentor the intern', 'Write the on-call runbook', 'Triage incoming bugs'].forEach(function (task, i) {
      seedEmit('delegation.assigned', { task: task, level: (i % 3) + 1 }, T.id, ts(28 - i * 4));
    });
    seedEmit('delegation.assigned', { task: 'Plan Q3 roadmap draft', level: 3 }, A.id, ts(15));
    /* R6: Dana × Priya pair, twice in 12 days, both open → pair fires, HIGH (both linked) */
    seedEmit('conflict.registered', { partyAPersonId: D.id, counterpartPersonId: Pr.id, topic: 'code review tone' }, null, ts(12));
    seedEmit('conflict.registered', { partyAPersonId: D.id, counterpartPersonId: Pr.id, topic: 'design handoff quality' }, null, ts(4));
    /* R13: Marcus in 3 open conflicts across 2+ distinct linked counterparts */
    seedEmit('conflict.registered', { partyAPersonId: M.id, counterpartPersonId: J.id, topic: 'campaign budget split' }, null, ts(16));
    seedEmit('conflict.registered', { partyAPersonId: M.id, counterpartPersonId: A.id, topic: 'shared designer time' }, null, ts(9));
    seedEmit('conflict.registered', { partyAPersonId: M.id, counterpartPersonId: J.id, topic: 'launch date pressure' }, null, ts(2));
    /* R7: Theo — measured pulses, load high, mood sliding. Dana: estimated
       only (excluded & counted — the engine will NOT trend guesses). */
    seedEmit('pulse.logged', { mood: 5, load: 8, measured: true, note: 'post-launch' }, T.id, ts(12));
    seedEmit('pulse.logged', { mood: 4, load: 8, measured: true }, T.id, ts(8));
    seedEmit('pulse.logged', { mood: 2, load: 9, measured: true }, T.id, ts(4));
    seedEmit('pulse.logged', { mood: 1, load: 9, measured: true, note: 'looks exhausted' }, T.id, ts(2));
    seedEmit('pulse.logged', { mood: 3, load: 6, measured: false, note: 'guess from standup' }, D.id, ts(5));
    /* R14: Anika at 630 min/wk of recurring meetings. Marcus: 240. */
    seedEmit('meeting.series', { title: 'Platform staff meeting', startMin: 540, endMin: 660, dow: [1, 3], attendeeIds: [A.id, M.id], cadence: 'weekly' }, null, ts(60));
    seedEmit('meeting.series', { title: 'Vendor standup', startMin: 570, endMin: 600, dow: [1, 2, 3, 4, 5], attendeeIds: [A.id], cadence: 'weekly' }, null, ts(55));
    seedEmit('meeting.series', { title: 'Program reviews', startMin: 780, endMin: 900, dow: [2, 4], attendeeIds: [A.id], cadence: 'weekly' }, null, ts(50));
    /* R12: one incident silent 10d; one recently updated (contrast) */
    var inc = seedEmit('incident.registered', { title: 'Prod outage — partial data loss' }, null, ts(10));
    var inc2 = seedEmit('incident.registered', { title: 'Access review finding' }, null, ts(3));
    seedEmit('incident.update', { incidentId: inc2.id, note: 'vendor engaged' }, null, ts(1));
    /* R11: early win past its verify date */
    seedEmit('win.planned', { title: 'Ship onboarding revamp', verifyDate: dayOffset(3) }, null, ts(21));
    /* Arrival: appointment 50d ago → R9 fires; tour 2/6 → R10 fires */
    S.meta.appointment = dayOffset(50);
    api.log('seed', 'appointment set to ' + S.meta.appointment + ' by seed');
    seedEmit('tour.visit', { note: 'listening tour' }, D.id, ts(45));
    seedEmit('tour.visit', { note: 'listening tour' }, Pr.id, ts(44));

    api.log('seed', 'sample set loaded: 6 people, every rule R1–R15 has at least one live trigger AND one deliberate contrast');
    var r = api.save();
    if (!apiArg) { api.refreshPill(); if (LEADOS._changed) LEADOS._changed(r); }
    return { ok: true };
  }

  function purgeSeed(apiArg) {
    var api = apiArg || LEADOS.store;
    var S = api.state();
    var n = 0;
    S.events = S.events.filter(function (ev) { if (ev.seed) { n++; return false; } return true; });
    var before = S.people.length;
    S.people = S.people.filter(function (p) { return !p.seed; });
    /* seed appointment is reset to its pre-seed value; flag stays — a purged
       database never reseeds (T11 doctrine, permanent by design). */
    S.meta.appointment = S.meta.seedPrevAppointment || null;
    api.log('purge', 'purged ' + n + ' seed events + ' + (before - S.people.length) +
      ' seed people; no-reseed flag retained; appointment restored to pre-seed value');
    var r = api.save();
    if (!apiArg) { api.refreshPill(); if (LEADOS._changed) LEADOS._changed(r); }
    return { ok: true, removedEvents: n, removedPeople: before - S.people.length };
  }

  return {
    emit: emit, emitMany: emitMany,
    addPerson: addPerson, updatePerson: updatePerson,
    project: project, dayOffset: dayOffset,
    seed: seed, purgeSeed: purgeSeed,
    _endpointOf: endpointOf, _pairKeyOf: pairKeyOf, _normText: normText
  };
})();
