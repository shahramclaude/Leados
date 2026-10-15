/* LeadOS mf-2 · js/events.js — append-only event layer + projections.
   Every module writes through emit(); nothing derived is persisted.
   Projections are recomputed from events on every read — stale derived state
   is impossible by design. SESSION-6 FIX (named, verified mf-1 defect):
   openGoals() now folds goal.assign events into owner (latest wins) — v1 had two
   sources of truth and the projection silently ignored assignment events.
   New event types in v2: engine.snooze / engine.dismiss / engine.unmute
   (engine memory), sl.assessment (situational leadership), playbook.completed
   (playbook audit trail). Additive only — migration 1→2 changes no event rows. */
window.LEADOS = window.LEADOS || {};
LEADOS.events = (function () {
  'use strict';
  var S = LEADOS.store;

  function emit(state, type, opts) {
    opts = opts || {};
    var ev = {
      id: S.newId('e'),
      ts: opts.ts || S.nowISO(),
      type: type,
      personId: opts.personId || null,
      data: opts.data || {},
      seed: !!opts.seed
    };
    state.events.push(ev);
    return ev;
  }
  function emitMany(state, list) { /* atomic fan-out: one registration → all linked events */
    var out = [], i;
    for (i = 0; i < list.length; i++) out.push(emit(state, list[i].type, list[i]));
    return out;
  }

  function addPerson(state, p) {
    var person = {
      id: S.newId('p'),
      name: String(p.name || '').trim(),
      role: String(p.role || '').trim(),
      cadenceDays: Math.max(1, parseInt(p.cadenceDays, 10) || 7),
      reportsTo: p.reportsTo === undefined || p.reportsTo === '' ? 'me' : String(p.reportsTo),
      createdAt: S.nowISO(),
      archived: false,
      seed: !!p.seed
    };
    state.people.push(person);
    emit(state, 'person.added', { personId: person.id,
      data: { name: person.name, role: person.role, cadenceDays: person.cadenceDays, reportsTo: person.reportsTo },
      seed: person.seed });
    return person;
  }

  function byType(state, type) { return state.events.filter(function (e) { return e.type === type; }); }
  function forPerson(events, pid) { return events.filter(function (e) { return e.personId === pid; }); }
  function sorted(events) {
    return events.slice().sort(function (a, b) { return String(a.ts) < String(b.ts) ? -1 : String(a.ts) > String(b.ts) ? 1 : 0; });
  }

  function byId(state) {
    var m = {};
    state.events.forEach(function (e) { m[e.id] = e; });
    return m;
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
        lastProg[e.id] = e.ts;                         /* set date is the first "progress" anchor */
      } else if (e.type === 'goal.assign' && e.data && e.data.goalId && titles[e.data.goalId] !== undefined) {
        owners[e.data.goalId] = e.data.ownerPersonId || null;   /* SESSION-6 FIX: folded, latest wins */
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
      return { id: a.id, label: (a.data && a.data.title) || 'untitled delegation', ts: d_ts(a), personId: a.personId,
        level: a.data && a.data.level };
      function d_ts(x) { return x.ts; }
    });
  }
  function openConflicts(state) {
    var resolved = {};
    byType(state, 'conflict.resolved').forEach(function (r) {
      if (r.data && r.data.conflictId) resolved[r.data.conflictId] = true;
    });
    return byType(state, 'conflict.registered').filter(function (c) { return !resolved[c.id]; }).map(function (c) {
      return { id: c.id, label: ((c.data && c.data.counterpart) ? 'vs ' + c.data.counterpart : 'conflict') + ' · ' + String(c.ts).slice(0, 10),
        ts: c.ts, personId: c.personId, counterpart: c.data && c.data.counterpart };
    });
  }

  function pulsesMeasured(state, pid, windowDays, today) {
    return sorted(byType(state, 'pulse.logged')).filter(function (e) {
      if (pid && e.personId !== pid) return false;
      if (e.data && e.data.estimated) return false;
      if (windowDays == null || !today) return true;
      var d = Math.round((Date.parse(today) - Date.parse(e.ts)) / 86400000);
      return d >= 0 && d <= windowDays;
    });
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

  /* ---- seeds: demonstrate every rule incl. skip-levels; purgeable; never reseed ---- */
  function agoISO(days) { return new Date(Date.now() - days * 86400000).toISOString(); }
  function seed(state) {
    if (state.meta.seeded) return false;
    state.meta.seeded = true; /* permanent FIRST — reseed impossible even if rows wiped */
    var ana = addPerson(state, { name: 'Ana Novak', role: 'Team lead — Platform', cadenceDays: 7, seed: true });
    var boris = addPerson(state, { name: 'Boris Ilic', role: 'Team lead — Growth', cadenceDays: 7, seed: true });
    var chen = addPerson(state, { name: 'Chen Wei', role: 'Team lead — Data', cadenceDays: 14, seed: true });
    var dieter = addPerson(state, { name: 'Dieter Falk', role: 'Engineer — Data', cadenceDays: 14, reportsTo: chen.id, seed: true });

    emit(state, 'oneonone.logged', { personId: ana.id, ts: agoISO(12), data: { note: 'seeded baseline' }, seed: true });
    emit(state, 'oneonone.logged', { personId: boris.id, ts: agoISO(3), data: { note: 'seeded recent' }, seed: true });

    emit(state, 'decision.logged', { ts: agoISO(20), data: { title: 'Re-platform invoicing service', severity: 3, reviewDate: agoISO(5).slice(0, 10), rationale: 'seeded' }, seed: true });

    emit(state, 'goal.set', { ts: agoISO(20), data: { title: 'Cut standup to 15 minutes', ownerPersonId: null }, seed: true });
    var g2 = emit(state, 'goal.set', { ts: agoISO(30), data: { title: 'Ship Q1 operating plan', ownerPersonId: chen.id }, seed: true });
    emit(state, 'goal.progress', { ts: agoISO(20), data: { goalId: g2.id, note: 'outline drafted' }, seed: true });

    [40, 20, 10].forEach(function (d) {
      emit(state, 'feedback.logged', { personId: ana.id, ts: agoISO(d), data: { polarity: 'corrective', note: 'seeded' }, seed: true });
    });

    ['Status report automation', 'Vendor shortlist', 'Hiring loop redesign', 'Quarterly metric pack', 'Launch comms plan'].forEach(function (t, i) {
      emit(state, 'delegation.assigned', { personId: boris.id, ts: agoISO(25 - i * 4), data: { title: t, level: i < 2 ? 3 : 4 }, seed: true });
    });

    emit(state, 'conflict.registered', { personId: chen.id, ts: agoISO(40), data: { counterpart: 'Ana Novak', severity: 3, note: 'roadmap priority' }, seed: true });
    emit(state, 'conflict.registered', { personId: chen.id, ts: agoISO(15), data: { counterpart: 'Ana Novak', severity: 4, note: 'oncall ownership' }, seed: true });

    [{ d: 9, m: 7, l: 9 }, { d: 5, m: 6, l: 8 }, { d: 1, m: 5, l: 9 }].forEach(function (p) {
      emit(state, 'pulse.logged', { personId: chen.id, ts: agoISO(p.d), data: { mood: p.m, load: p.l }, seed: true });
    });
    emit(state, 'pulse.logged', { personId: chen.id, ts: agoISO(3), data: { mood: 9, load: 1, estimated: true }, seed: true });
    [{ d: 8, m: 7, l: 4 }, { d: 4, m: 8, l: 5 }].forEach(function (p) {
      emit(state, 'pulse.logged', { personId: boris.id, ts: agoISO(p.d), data: { mood: p.m, load: p.l }, seed: true });
    });

    emit(state, 'sl.assessment', { personId: chen.id, ts: agoISO(6),
      data: { task: 'Q1 operating plan', competence: 3, commitment: 4, development: 'D3', style: 'S3', note: 'seeded example' }, seed: true });
    /* Dieter: no oneonone.logged ever + skip-level (me → Chen → Dieter) → R8 fires. */

    state.log.push({ ts: S.nowISO(), kind: 'seed', msg: 'sample roster + events written (seed:true); purgeable at #/data without triggering reseed' });
    return true;
  }
  function purgeSeeds(state) {
    var p0 = state.people.length, e0 = state.events.length;
    state.people = state.people.filter(function (p) { return !p.seed; });
    state.events = state.events.filter(function (e) { return !e.seed; });
    state.log.push({ ts: S.nowISO(), kind: 'seed', msg: 'purged ' + (p0 - state.people.length) + ' seeded people, ' + (e0 - state.events.length) + ' seeded events; meta.seeded stays true (no reseed)' });
  }

  return {
    emit: emit, emitMany: emitMany, addPerson: addPerson,
    byType: byType, forPerson: forPerson, sorted: sorted, byId: byId, peopleById: peopleById,
    openDecisions: openDecisions, openGoals: openGoals, openDelegations: openDelegations, openConflicts: openConflicts,
    pulsesMeasured: pulsesMeasured, lastOneOnOne: lastOneOnOne, feedbackBalance: feedbackBalance, latestSL: latestSL,
    seed: seed, purgeSeeds: purgeSeeds, agoISO: agoISO
  };
})();
