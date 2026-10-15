/* LeadOS mf-4 · js/events.js — append-only event layer + projections.
   Every module writes through emit(); nothing derived is persisted.
   Projections recompute from events on every read — stale derived state is
   impossible by design.
   Verified-carried from mf-3 head read: emit/emitMany, addPerson/updatePerson,
   openDecisions/openGoals/openDelegations/openConflicts/openIncidents,
   pulsesMeasured / pulsesEstimatedCount (estimated excluded — doctrine: only
   spoken numbers count), lastOneOnOne, feedbackBalance, latestSL.
   mf-4 ADDS (the conflict-pairs slice):
     · conflict.registered gains data.counterpartPersonId (nullable, additive —
       no schema bump; free-text data.counterpart remains as the fallback link)
     · pairKeyOf + conflictPairs projection — the engine's R6/R13 source
     · tourCoverage measured against the LIVE roster (stated assumption) */
window.LEADOS = window.LEADOS || {};
LEADOS.events = (function () {
  'use strict';
  var S = LEADOS.store;

  function emit(state, type, opts) {
    opts = opts || {};
    var ev = { id: S.newId('e'), ts: opts.ts || S.nowISO(), type: type,
      personId: opts.personId || null, data: opts.data || {}, seed: !!opts.seed };
    state.events.push(ev);
    return ev;
  }
  function emitMany(state, list) { /* atomic fan-out: one registration → all linked events */
    var out = [], i;
    for (i = 0; i < list.length; i++) out.push(emit(state, list[i].type, list[i]));
    return out;
  }

  function addPerson(state, p) {
    var person = { id: S.newId('p'), name: String(p.name || '').trim(),
      role: String(p.role || '').trim(),
      cadenceDays: Math.max(1, parseInt(p.cadenceDays, 10) || 7),
      reportsTo: p.reportsTo === undefined || p.reportsTo === '' ? 'me' : String(p.reportsTo),
      createdAt: S.nowISO(), archived: false, seed: !!p.seed };
    state.people.push(person);
    emit(state, 'person.added', { personId: person.id,
      data: { name: person.name, role: person.role, cadenceDays: person.cadenceDays, reportsTo: person.reportsTo },
      seed: person.seed });
    return person;
  }
  function updatePerson(state, id, fields) {
    var p = (state.people || []).filter(function (x) { return x && x.id === id; })[0];
    if (!p) return null;
    var changed = {};
    ['name', 'role', 'cadenceDays', 'reportsTo', 'archived'].forEach(function (k) {
      if (fields[k] !== undefined && fields[k] !== p[k]) {
        changed[k] = { from: p[k], to: fields[k] };
        p[k] = k === 'cadenceDays' ? Math.max(1, parseInt(fields[k], 10) || 7) : fields[k];
      }
    });
    if (Object.keys(changed).length) emit(state, 'person.updated', { personId: id, data: { changed: changed } });
    return p;
  }

  function byType(state, type) { return state.events.filter(function (e) { return e.type === type; }); }
  function sorted(events) {
    return events.slice().sort(function (a, b) { return String(a.ts) < String(b.ts) ? -1 : String(a.ts) > String(b.ts) ? 1 : 0; });
  }
  function peopleById(state) {
    var m = {};
    state.people.forEach(function (p) { if (p) m[p.id] = p; });
    return m;
  }
  function person(state, id) { return peopleById(state)[id] || null; }

  /* ---- projections (recomputed per read; single sources of truth) ---- */
  function openDecisions(state) {
    var resolved = {};
    byType(state, 'decision.outcome').forEach(function (o) {
      if (o.data && o.data.decisionId) resolved[o.data.decisionId] = true;
    });
    return byType(state, 'decision.logged').filter(function (d) { return !resolved[d.id]; }).map(function (d) {
      return { id: d.id, label: (d.data && d.data.title) || 'untitled decision', ts: d.ts,
        reviewDate: d.data && d.data.reviewDate };
    });
  }
  function openGoals(state) {
    var owners = {}, titles = {}, ts = {}, lastProg = {}, evs = sorted(state.events);
    evs.forEach(function (e) {
      if (e.type === 'goal.set') {
        titles[e.id] = (e.data && e.data.title) || 'untitled goal'; ts[e.id] = e.ts;
        owners[e.id] = (e.data && e.data.ownerPersonId) || null;
        lastProg[e.id] = e.ts;
      } else if (e.type === 'goal.assign' && e.data && e.data.goalId && titles[e.data.goalId] !== undefined) {
        owners[e.data.goalId] = e.data.ownerPersonId || null;
      } else if (e.type === 'goal.progress' && e.data && e.data.goalId && titles[e.data.goalId] !== undefined) {
        if (String(e.ts) > String(lastProg[e.data.goalId])) lastProg[e.data.goalId] = e.ts;
      }
    });
    return Object.keys(titles).map(function (id) {
      return { id: id, label: titles[id], ts: ts[id], ownerPersonId: owners[id], lastProgressTs: lastProg[id] };
    });
  }
  function openDelegations(state) {
    var closed = {};
    byType(state, 'delegation.closed').forEach(function (c) {
      if (c.data && c.data.delegationId) closed[c.data.delegationId] = true;
    });
    return byType(state, 'delegation.assigned').filter(function (a) { return !closed[a.id]; }).map(function (a) {
      return { id: a.id, label: (a.data && a.data.title) || 'untitled delegation', ts: a.ts,
        personId: a.personId, level: a.data && a.data.level, checkCadence: a.data && a.data.checkCadence };
    });
  }

  /* mf-4: conflicts carry BOTH a resolvable person reference and the legacy
     free-text label. Link precedence: counterpartPersonId → text → "me".
     counterpartPersonId absent + no text = the conflict is with the leader
     themselves ("you") — a first-class pair, not a data gap. */
  function linkOf(c) {
    var d = c.data || {};
    if (typeof d.counterpartPersonId === 'string' && d.counterpartPersonId)
      return { kind: 'id', id: d.counterpartPersonId };
    if (typeof d.counterpart === 'string' && d.counterpart.trim())
      return { kind: 'text', id: 'text:' + d.counterpart.trim().toLowerCase(), label: d.counterpart.trim() };
    return { kind: 'me', id: 'me' };
  }
  function openConflicts(state) {
    var resolved = {};
    byType(state, 'conflict.resolved').forEach(function (r) {
      if (r.data && r.data.conflictId) resolved[r.data.conflictId] = true;
    });
    return byType(state, 'conflict.registered').filter(function (c) { return !resolved[c.id]; }).map(function (c) {
      var link = linkOf(c);
      return { id: c.id, ts: c.ts, personId: c.personId,
        counterpartPersonId: link.kind === 'id' ? link.id : null,
        counterpartText: link.kind === 'text' ? link.label : null,
        link: link,
        label: ((link.kind === 'id' ? 'vs ' + ((person(state, link.id) || {}).name || 'archived person')
                : link.kind === 'text' ? 'vs “' + link.label + '” (unlinked)'
                : 'with you') + ' · ' + String(c.ts).slice(0, 10)),
        summary: (c.data && c.data.summary) || null,
        updatedTs: c.ts };
    });
  }
  /* unordered pair key — me×p === p×me; text-linked pairs are tagged so the
     engine can price the spelling-drift risk instead of pretending certainty */
  function pairKeyOf(c) {
    var a = c.personId || 'me', b = c.link.id;
    var pair = [a, b].sort();
    return pair.join('×');
  }
  function pairLabel(state, c) {
    function nm(x, link) {
      if (x === 'me') return 'you';
      if (link && link.kind === 'text') return '“' + link.label + '” (unlinked)';
      var p = person(state, x);
      return p ? p.name : 'archived person';
    }
    var a = c.personId || 'me';
    return nm(a) + ' × ' + nm(c.link.id, c.link);
  }
  function conflictPairs(state) {
    var pairs = {}, list = openConflicts(state);
    list.forEach(function (c) {
      var k = pairKeyOf(c);
      if (!pairs[k]) pairs[k] = { key: k, conflicts: [], linkKinds: {}, people: {} };
      pairs[k].conflicts.push(c);
      pairs[k].linkKinds[c.link.kind] = true;
      if (c.personId) pairs[k].people[c.personId] = true;
      if (c.link.kind === 'id') pairs[k].people[c.link.id] = true;
    });
    return Object.keys(pairs).map(function (k) { return pairs[k]; });
  }
  /* R13 nexus: persons appearing across ≥2 DISTINCT resolvable counterparts.
     Text-linked counterparts can't be deduped reliably, so they don't build a
     nexus case — they appear in the basis instead. Silent beats certain-but-wrong. */
  function conflictNexus(state) {
    var byP = {}, list = openConflicts(state);
    list.forEach(function (c) {
      [c.personId, c.link.kind === 'id' ? c.link.id : null].forEach(function (pid) {
        if (!pid || pid === 'me') return;
        if (!byP[pid]) byP[pid] = { personId: pid, counterparts: {}, open: [], textLinked: 0 };
        if (c.link.kind === 'text') byP[pid].textLinked++;
        var other = pid === c.personId ? c.link.id : c.personId;
        if (other && other !== 'me' && other.indexOf('text:') !== 0) byP[pid].counterparts[other] = true;
        if (other === 'me') byP[pid].counterparts['me'] = true;
        byP[pid].open.push(c);
      });
    });
    return Object.keys(byP).map(function (k) {
      var n = byP[k];
      n.distinctCounterparts = Object.keys(n.counterparts).length;
      return n;
    });
  }

  function openIncidents(state) {
    var resolved = {}, lastTouch = {};
    sorted(state.events).forEach(function (e) {
      if (e.type === 'incident.resolved' && e.data && e.data.incidentId) resolved[e.data.incidentId] = true;
      if (e.type === 'incident.update' && e.data && e.data.incidentId &&
          (!lastTouch[e.data.incidentId] || String(e.ts) > String(lastTouch[e.data.incidentId])))
        lastTouch[e.data.incidentId] = e.ts;
    });
    return byType(state, 'incident.registered').filter(function (x) { return !resolved[x.id]; }).map(function (x) {
      return { id: x.id, label: (x.data && x.data.title) || 'untitled incident', ts: x.ts,
        personId: x.personId, severity: x.data && x.data.severity,
        updatedTs: lastTouch[x.id] || x.ts };
    });
  }
  function openWins(state) {
    var verified = {};
    byType(state, 'earlywin.verified').forEach(function (v) {
      if (v.data && v.data.winId) verified[v.data.winId] = v;
    });
    return byType(state, 'earlywin.committed').map(function (w) {
      return { id: w.id, label: (w.data && w.data.title) || 'untitled win', ts: w.ts,
        verifyDate: w.data && w.data.verifyDate, verified: !!(verified[w.id]),
        verifiedEvent: verified[w.id] || null };
    });
  }

  function pulsesMeasured(state, pid, windowDays, today) {
    return sorted(byType(state, 'pulse.logged')).filter(function (e) {
      if (pid && e.personId !== pid) return false;
      if (e.data && e.data.estimated) return false;       /* doctrine: only spoken numbers count */
      if (windowDays == null || !today) return true;
      var d = Math.round((Date.parse(today) - Date.parse(e.ts)) / 86400000);
      return d >= 0 && d <= windowDays;
    });
  }
  function pulsesEstimatedCount(state, pid, windowDays, today) {
    return sorted(byType(state, 'pulse.logged')).filter(function (e) {
      if (pid && e.personId !== pid) return false;
      if (!(e.data && e.data.estimated)) return false;
      if (windowDays == null || !today) return true;
      var d = Math.round((Date.parse(today) - Date.parse(e.ts)) / 86400000);
      return d >= 0 && d <= windowDays;
    }).length;
  }
  function lastOneOnOne(state, pid) {
    var best = null;
    state.events.forEach(function (e) {
      if (e.type === 'oneonone.logged' && e.personId === pid && (!best || String(e.ts) > String(best.ts))) best = e;
    });
    return best;
  }
  function feedbackBalance(state, pid, windowDays, today) {
    var rows = [], i, fs = sorted(byType(state, 'feedback.logged'));
    for (i = 0; i < fs.length; i++) {
      var e = fs[i];
      if (pid && e.personId !== pid) continue;
      if (windowDays != null && today) {
        var d = Math.round((Date.parse(today) - Date.parse(e.ts)) / 86400000);
        if (d < 0 || d > windowDays) continue;
      }
      var pol = e.data && e.data.polarity;
      if (pol === 'corrective' || pol === 'positive') rows.push({ ts: e.ts, polarity: pol });
    }
    var c = rows.filter(function (r) { return r.polarity === 'corrective'; }).length;
    return { total: rows.length, corrective: c, positive: rows.length - c, rows: rows };
  }
  function latestSL(state, pid) {
    var best = null;
    state.events.forEach(function (e) {
      if (e.type === 'sl.assessed' && e.personId === pid && (!best || String(e.ts) > String(best.ts))) best = e;
    });
    return best;
  }
  function tourVisits(state) {
    var seen = {}, order = [];
    sorted(byType(state, 'tour.visit')).forEach(function (v) {
      if (v.personId && !seen[v.personId]) { seen[v.personId] = true; order.push({ personId: v.personId, ts: v.ts }); }
    });
    return { visitedIds: seen, order: order };
  }

  /* arrival instrument — v3 events, carried; coverage vs the LIVE roster */
  function arrival(state, today) {
    var appt = state.meta && state.meta.appointment;
    if (!appt || !appt.startDate) return { set: false, dayN: null };
    var d = Math.round((Date.parse(today) - Date.parse(appt.startDate)) / 86400000);
    var tour = tourVisits(state);
    var roster = state.people.filter(function (p) { return p && !p.archived; });
    var unvisited = roster.filter(function (p) { return !tour.visitedIds[p.id]; });
    return {
      set: true, dayN: d < 0 ? 0 : d, startDate: appt.startDate,
      expectations: byType(state, 'expectation.logged').length,
      tourTotal: roster.length, tourDone: roster.length - unvisited.length, unvisited: unvisited,
      wins: openWins(state)
      /* stated assumption: "tour complete" = visited everyone on TODAY'S
         roster; people who joined after the tour still count as owed visits. */
    };
  }

  /* ---- seed / purge. meta.seeded is set BEFORE rows are written, so a
     purge-then-reload can never reseed (T11). ---- */
  function seed(state) {
    if (state.meta.seeded) return 0;
    state.meta.seeded = true;
    var day = 86400000, now = Date.parse(S.todayISO() + 'T12:00:00');
    function ago(n) { return new Date(now - n * day).toISOString(); }
    state.meta.appointment = { startDate: new Date(now - 26 * day).toISOString().slice(0, 10) };
    emit(state, 'appointment.started', { ts: ago(26), data: { startDate: state.meta.appointment.startDate }, seed: true });

    var dana = addPerson(state, { name: 'Dana Okafor', role: 'lead · checkout team', cadenceDays: 7, seed: true });
    var priya = addPerson(state, { name: 'Priya Raman', role: 'lead · platform team', cadenceDays: 7, seed: true });
    var marcus = addPerson(state, { name: 'Marcus Vale', role: 'lead · growth team', cadenceDays: 14, seed: true });
    var tomas = addPerson(state, { name: 'Tomás Reyes', role: 'senior engineer', cadenceDays: 28, reportsTo: dana.id, seed: true });

    // R1: Marcus 1:1 overdue; Dana/Priya fresh
    emit(state, 'oneonone.logged', { ts: ago(3), personId: dana.id, data: { note: 'q3 sequencing' }, seed: true });
    emit(state, 'oneonone.logged', { ts: ago(5), personId: priya.id, data: {}, seed: true });
    emit(state, 'oneonone.logged', { ts: ago(20), personId: marcus.id, data: { note: 'hiring plan' }, seed: true });
    // R8: skip-level with Tomás overdue (28d cadence, last 41d)
    emit(state, 'oneonone.logged', { ts: ago(41), personId: tomas.id, data: { skip: true }, seed: true });
    // R2: decision past review, no outcome
    emit(state, 'decision.logged', { ts: ago(30), data: { title: 'freeze checkout redesign', reviewDate: new Date(now - 6 * day).toISOString().slice(0, 10) }, seed: true });
    // R3: ownerless goal + stale goal
    emit(state, 'goal.set', { ts: ago(20), data: { title: 'cut p95 latency to 300ms', ownerPersonId: null }, seed: true });
    emit(state, 'goal.set', { ts: ago(24), data: { title: 'hire 2 senior EMs', ownerPersonId: marcus.id }, seed: true });
    // R4: Priya gets only corrective feedback
    [-12, -9, -4].forEach(function (n) { emit(state, 'feedback.logged', { ts: ago(-n), personId: priya.id, data: { polarity: 'corrective', summary: 'handoff quality' }, seed: true }); });
    // R5: Dana holds 5 open delegations
    ['weekly ops review', 'incident postmortems', 'roadmap draft', 'vendor eval', 'onboard new EM'].forEach(function (t, i) {
      emit(state, 'delegation.assigned', { ts: ago(18 - i), personId: dana.id, data: { title: t, level: 2 + (i % 3) }, seed: true });
    });
    // R6 (mf-4 pair rule): Dana × Priya, two open conflicts in 90d
    emit(state, 'conflict.registered', { ts: ago(19), personId: dana.id,
      data: { summary: 'shared on-call ownership', counterpartPersonId: priya.id }, seed: true });
    emit(state, 'conflict.registered', { ts: ago(6), personId: priya.id,
      data: { summary: 'release-signoff authority', counterpartPersonId: dana.id }, seed: true });
    // R13 nexus: Marcus in 3 open conflicts with 2 distinct counterparts
    emit(state, 'conflict.registered', { ts: ago(15), personId: marcus.id,
      data: { summary: 'experiment guardrails', counterpartPersonId: dana.id }, seed: true });
    emit(state, 'conflict.registered', { ts: ago(9), personId: marcus.id,
      data: { summary: 'budget split Q3', counterpartPersonId: priya.id }, seed: true });
    emit(state, 'conflict.registered', { ts: ago(2), personId: marcus.id,
      data: { summary: 'attribution model — stated publicly as resolved, was not', counterpartPersonId: dana.id }, seed: true });
    // R7: Marcus overload — 4 measured pulses, load ≥8, mood falling
    [[10, 9, 7], [7, 9, 6], [4, 9, 5], [1, 9, 4]].forEach(function (r) {
      emit(state, 'pulse.logged', { ts: ago(r[0]), personId: marcus.id, data: { mood: r[2], load: r[1] }, seed: true });
    });
    emit(state, 'pulse.logged', { ts: ago(2), personId: dana.id, data: { mood: 6, load: 7, estimated: true }, seed: true });
    // R9: day 26, zero expectations logged → fires
    // R10: tour 1 of 4 done, past grace
    emit(state, 'tour.visit', { ts: ago(20), personId: dana.id, data: { heard: 'on-call pain' }, seed: true });
    // R11: early win past its verify date
    var win = emit(state, 'earlywin.committed', { ts: ago(21), data: { title: 'kill the 7am standup', verifyDate: new Date(now - 3 * day).toISOString().slice(0, 10) }, seed: true });
    void win;
    // R12: incident silent 11d
    emit(state, 'incident.registered', { ts: ago(11), personId: priya.id, data: { title: 'prod outage — payments', severity: 4 }, seed: true });
    return state.events.length ? state.events.filter(function (e) { return e.seed; }).length : 0;
  }
  function purge(state) {
    state.people = state.people.filter(function (p) { return !p || !p.seed; });
    state.events = state.events.filter(function (e) { return !e.seed; });
    state.log.push({ ts: S.nowISO(), kind: 'purge', msg: 'seeded rows purged; meta.seeded stays true (no reseed ever)' });
    /* meta.seeded deliberately NOT reset: purged-then-reloaded must stay empty */
  }

  return {
    emit: emit, emitMany: emitMany, addPerson: addPerson, updatePerson: updatePerson,
    byType: byType, sorted: sorted, peopleById: peopleById, person: person,
    openDecisions: openDecisions, openGoals: openGoals, openDelegations: openDelegations,
    openConflicts: openConflicts, conflictPairs: conflictPairs, conflictNexus: conflictNexus,
    linkOf: linkOf, pairKeyOf: pairKeyOf, pairLabel: pairLabel,
    openIncidents: openIncidents, openWins: openWins,
    pulsesMeasured: pulsesMeasured, pulsesEstimatedCount: pulsesEstimatedCount,
    lastOneOnOne: lastOneOnOne, feedbackBalance: feedbackBalance, latestSL: latestSL,
    tourVisits: tourVisits, arrival: arrival, seed: seed, purge: purge
  };
})();
