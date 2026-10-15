/* LeadOS mf-3 · js/events.js — append-only event layer + projections.
   Every module writes through emit(); nothing derived is persisted.
   Projections recompute from events on every read — stale derived state is
   impossible by design. New in v3 (the arrival slice, additive events only):
     appointment.started · expectation.logged · tour.visit
     earlywin.committed / earlywin.verified · incident.registered / .resolved
   The arrival projection is the instrument's single source of truth. */
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
        personId: a.personId, level: a.data && a.data.level };
    });
  }
  function openConflicts(state) {
    var resolved = {};
    byType(state, 'conflict.resolved').forEach(function (r) {
      if (r.data && r.data.conflictId) resolved[r.data.conflictId] = true;
    });
    return byType(state, 'conflict.registered').filter(function (c) { return !resolved[c.id]; }).map(function (c) {
      return { id: c.id, label: ((c.data && c.data.counterpart) ? 'vs ' + c.data.counterpart : 'conflict') + ' · ' + String(c.ts).slice(0, 10),
        ts: c.ts, personId: c.personId, counterpart: c.data && c.data.counterpart,
        updatedTs: c.ts };
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
      if (e.type === 'sl.assessment' && e.personId === pid && (!best || String(e.ts) > String(best.ts))) best = e;
    });
    return best;
  }

  /* ---- the arrival projection (v3): everything the instrument knows ---- */
  function arrival(state, today) {
    var appts = sorted(byType(state, 'appointment.started'));
    var appt = appts.length ? appts[appts.length - 1] : null;   /* latest wins; history kept */
    var startDate = (state.meta && state.meta.appointment && state.meta.appointment.startDate) ||
      (appt && appt.data && appt.data.startDate) || null;
    var day = null;
    if (startDate && today) {
      var a = Date.parse(startDate), b = Date.parse(today);
      if (!isNaN(a) && !isNaN(b)) day = Math.round((b - a) / 86400000);
    }
    var expectations = sorted(byType(state, 'expectation.logged'));
    var wins = { open: [], closed: [] };
    var verified = {};
    byType(state, 'earlywin.verified').forEach(function (v) {
      if (v.data && v.data.winId) verified[v.data.winId] = v;
    });
    byType(state, 'earlywin.committed').forEach(function (c) {
      var row = { id: c.id, title: (c.data && c.data.title) || 'untitled win',
        metric: c.data && c.data.metric, verifyDate: c.data && c.data.verifyDate,
        announcedTo: c.data && c.data.announcedTo, ts: c.ts };
      if (verified[c.id]) { row.outcome = verified[c.id].data && verified[c.id].data.outcome; wins.closed.push(row); }
      else wins.open.push(row);
    });
    /* listening tour: coverage against the CURRENT roster's direct line */
    var visits = sorted(byType(state, 'tour.visit'));
    var visitedIds = {}, skipCount = 0;
    visits.forEach(function (v) {
      if (v.personId) visitedIds[v.personId] = true;
      if (v.data && v.data.mode === 'skiplevel') skipCount++;
    });
    var byId = peopleById(state);
    function lineToMe(p) {
      var cur = p, guard = 0;
      while (cur && guard++ < 20) {
        var rt = cur.reportsTo === undefined ? 'me' : cur.reportsTo;
        if (rt === 'me') return true;
        cur = byId[rt];
        if (!cur || cur.archived) return false;
      }
      return false;
    }
    var directs = (state.people || []).filter(function (p) { return p && !p.archived && lineToMe(p); });
    var missing = directs.filter(function (p) { return !visitedIds[p.id]; });
    return {
      set: !!startDate, startDate: startDate, day: day,
      scope: state.meta && state.meta.appointment && state.meta.appointment.scope ||
        (appt && appt.data && appt.data.scope) || null,
      expectations: expectations, expectationCount: expectations.length,
      lastExpectationTs: expectations.length ? expectations[expectations.length - 1].ts : null,
      wins: wins,
      tour: { visits: visits, visitedIds: visitedIds, directs: directs,
        missing: missing, visitedCount: directs.length - missing.length,
        directCount: directs.length, skipCount: skipCount,
        coveragePct: directs.length ? Math.round(100 * (directs.length - missing.length) / directs.length) : null }
    };
  }

  /* ---- seeds: demonstrate every rule incl. arrival; purgeable; never reseeds ---- */
  function agoISO(days) { return new Date(Date.now() - days * 86400000).toISOString(); }
  function agoDate(days) { return agoISO(days).slice(0, 10); }
  function plusDate(days) { return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10); }
  function seed(state) {
    if (state.meta.seeded) return false;
    state.meta.seeded = true;          /* permanent FIRST — reseed impossible even if rows wiped */
    state.meta.appointment = { startDate: agoDate(26), scope: 'step-up', notes: 'seeded demo appointment' };
    emit(state, 'appointment.started', { ts: agoISO(26), seed: true,
      data: { startDate: agoDate(26), scope: 'step-up', notes: 'took over three team leads' } });

    var ana = addPerson(state, { name: 'Ana Novak', role: 'Team lead — Platform', cadenceDays: 7, seed: true });
    var boris = addPerson(state, { name: 'Boris Ilic', role: 'Team lead — Growth', cadenceDays: 7, seed: true });
    var chen = addPerson(state, { name: 'Chen Wei', role: 'Team lead — Data', cadenceDays: 14, seed: true });
    var dieter = addPerson(state, { name: 'Dieter Falk', role: 'Engineer — Data', cadenceDays: 14, reportsTo: chen.id, seed: true });

    emit(state, 'oneonone.logged', { personId: ana.id, ts: agoISO(12), data: { note: 'seeded baseline' }, seed: true });
    emit(state, 'oneonone.logged', { personId: boris.id, ts: agoISO(3), data: { note: 'seeded recent' }, seed: true });
    emit(state, 'oneonone.logged', { personId: dieter.id, ts: agoISO(33), data: { note: 'last skip-level', skip: true }, seed: true });

    var dec = emit(state, 'decision.logged', { ts: agoISO(20), seed: true,
      data: { title: 'Freeze scope on Atlas release', reviewDate: agoDate(3), context: 'quality vs date' } });
    emit(state, 'decision.logged', { ts: agoISO(10), seed: true,
      data: { title: 'Move standup to async', reviewDate: plusDate(5) } });
    void dec;

    emit(state, 'goal.set', { ts: agoISO(30), seed: true, data: { title: 'Cut deploy lead time under 1h' } });
    var g2 = emit(state, 'goal.set', { ts: agoISO(21), seed: true,
      data: { title: 'Hire senior data engineer', ownerPersonId: chen.id } });
    emit(state, 'goal.progress', { ts: agoISO(18), seed: true, data: { goalId: g2.id, note: 'pipeline at 3 finalists' } });

    var i;
    for (i = 0; i < 5; i++)
      emit(state, 'delegation.assigned', { personId: boris.id, ts: agoISO(9 - i), seed: true,
        data: { title: 'Growth initiative ' + (i + 1), level: 3 } });

    emit(state, 'conflict.registered', { personId: ana.id, ts: agoISO(40), seed: true,
      data: { counterpart: 'Boris Ilic', note: 'shared on-call budget' } });
    emit(state, 'conflict.registered', { personId: ana.id, ts: agoISO(9), seed: true,
      data: { counterpart: 'Boris Ilic', note: 'on-call budget again' } });

    emit(state, 'feedback.logged', { personId: ana.id, ts: agoISO(20), seed: true,
      data: { polarity: 'corrective', sbi: 'standup: interrupted twice' } });
    emit(state, 'feedback.logged', { personId: ana.id, ts: agoISO(13), seed: true,
      data: { polarity: 'corrective', sbi: 'review: rejected design w/o reason' } });
    emit(state, 'feedback.logged', { personId: ana.id, ts: agoISO(6), seed: true,
      data: { polarity: 'corrective', sbi: 'planning: scope change unflagged' } });

    var pulseDays = [9, 6, 3], moods = [7, 5, 3], loads = [8, 9, 9];
    for (i = 0; i < 3; i++)
      emit(state, 'pulse.logged', { personId: chen.id, ts: agoISO(pulseDays[i]), seed: true,
        data: { mood: moods[i], load: loads[i], estimated: false } });
    emit(state, 'pulse.logged', { personId: ana.id, ts: agoISO(2), seed: true,
      data: { mood: 6, load: 6, estimated: true } });     /* excluded from R7 by doctrine */

    emit(state, 'incident.registered', { ts: agoISO(9), seed: true,
      data: { title: 'Prod outage — stale cache rollout', severity: 'high' } });

    /* arrival: expectations missing (R9 fires), tour 1 of 3 (R10 fires), win past gate (R11 fires) */
    emit(state, 'tour.visit', { personId: ana.id, ts: agoISO(21), seed: true,
      data: { mode: 'lead', themes: 'deploy pain, unclear priorities' } });
    emit(state, 'earlywin.committed', { ts: agoISO(15), seed: true,
      data: { title: 'Kill 11 recurring meetings', metric: 'meeting hours/lead/week 9 → ≤5', verifyDate: agoDate(4), announcedTo: 'staff meeting' } });
    return true;
  }
  function purgeSeeds(state) {
    var pBefore = state.people.length, eBefore = state.events.length;
    state.people = state.people.filter(function (p) { return p && !p.seed; });
    state.events = state.events.filter(function (e) { return !e.seed; });
    state.meta.appointment = null;
    state.log.push({ ts: S.nowISO(), kind: 'purge',
      msg: 'purged ' + (pBefore - state.people.length) + ' people + ' + (eBefore - state.events.length) + ' seeded events; seeded flag KEPT (never reseeds)' });
    return true;
  }

  return {
    emit: emit, emitMany: emitMany,
    addPerson: addPerson, updatePerson: updatePerson,
    byType: byType, sorted: sorted, peopleById: peopleById,
    openDecisions: openDecisions, openGoals: openGoals,
    openDelegations: openDelegations, openConflicts: openConflicts, openIncidents: openIncidents,
    pulsesMeasured: pulsesMeasured, pulsesEstimatedCount: pulsesEstimatedCount,
    lastOneOnOne: lastOneOnOne, feedbackBalance: feedbackBalance, latestSL: latestSL,
    arrival: arrival,
    seed: seed, purgeSeeds: purgeSeeds
  };
})();
