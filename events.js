/* LeadOS mf-1 · js/events.js — append-only event layer + projections.
   Every module writes through emit(); nothing derived is persisted.
   Projections (open decisions/goals/delegations/conflicts) are recomputed
   from events on every read — stale derived state is impossible by design. */
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

  function addPerson(state, p) {
    var person = {
      id: S.newId('p'),
      name: String(p.name || '').trim(),
      role: String(p.role || '').trim(),
      cadenceDays: Math.max(1, parseInt(p.cadenceDays, 10) || 7),
      createdAt: S.nowISO(),
      archived: false,
      seed: !!p.seed
    };
    state.people.push(person);
    emit(state, 'person.added', { personId: person.id, data: { name: person.name, role: person.role, cadenceDays: person.cadenceDays }, seed: person.seed });
    return person;
  }

  function byType(state, type) {
    return state.events.filter(function (e) { return e.type === type; });
  }
  function forPerson(events, pid) {
    return events.filter(function (e) { return e.personId === pid; });
  }

  /* ---- projections: open sets, always recomputed ---- */
  function openDecisions(state) {
    var resolved = {};
    byType(state, 'decision.outcome').forEach(function (o) {
      if (o.data && o.data.decisionId) resolved[o.data.decisionId] = true;
    });
    return byType(state, 'decision.logged').filter(function (d) { return !resolved[d.id]; })
      .map(function (d) { return { id: d.id, label: (d.data && d.data.title) || 'untitled decision', ts: d.ts, reviewDate: d.data && d.data.reviewDate }; });
  }
  function openGoals(state) {
    return byType(state, 'goal.set').map(function (g) {
      return { id: g.id, label: (g.data && g.data.title) || 'untitled goal', ts: g.ts, ownerPersonId: g.data && g.data.ownerPersonId };
    });
  }
  function openDelegations(state) {
    var closed = {};
    byType(state, 'delegation.closed').forEach(function (c) {
      if (c.data && c.data.delegationId) closed[c.data.delegationId] = true;
    });
    return byType(state, 'delegation.assigned').filter(function (a) { return !closed[a.id]; })
      .map(function (a) { return { id: a.id, label: (a.data && a.data.title) || 'untitled delegation', ts: a.ts, personId: a.personId, level: a.data && a.data.level }; });
  }
  function openConflicts(state) {
    var resolved = {};
    byType(state, 'conflict.resolved').forEach(function (r) {
      if (r.data && r.data.conflictId) resolved[r.data.conflictId] = true;
    });
    return byType(state, 'conflict.registered').filter(function (c) { return !resolved[c.id]; })
      .map(function (c) { return { id: c.id, label: ((c.data && c.data.counterpart) ? 'vs ' + c.data.counterpart : 'conflict') + ' · ' + String(c.ts).slice(0, 10), ts: c.ts, personId: c.personId }; });
  }

  /* ---- seeds: demonstrable rules, one-click purgeable, never re-seeded ---- */
  function agoISO(days) { return new Date(Date.now() - days * 86400000).toISOString(); }
  function seed(state) {
    if (state.meta.seeded) return false;
    state.meta.seeded = true; /* permanent FIRST — reseed impossible even if rows are later wiped */
    var ana = addPerson(state, { name: 'Ana Novak', role: 'Team lead — Platform', cadenceDays: 7, seed: true });
    var boris = addPerson(state, { name: 'Boris Ilic', role: 'Team lead — Growth', cadenceDays: 7, seed: true });
    var chen = addPerson(state, { name: 'Chen Wei', role: 'Team lead — Data', cadenceDays: 14, seed: true });

    emit(state, 'oneonone.logged', { personId: ana.id, ts: agoISO(12), data: { note: 'seeded baseline' }, seed: true });

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
    emit: emit,
    addPerson: addPerson,
    byType: byType,
    forPerson: forPerson,
    openDecisions: openDecisions,
    openGoals: openGoals,
    openDelegations: openDelegations,
    openConflicts: openConflicts,
    seed: seed,
    purgeSeeds: purgeSeeds
  };
})();
