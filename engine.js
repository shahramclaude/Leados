/* LeadOS pt-4 - js/engine.js
   Derivation engine. project() folds the event log into state ON EVERY READ.
   Nothing in this module touches localStorage. Every selector is pure and
   takes `now` explicitly so the T-suite can pin time. */
(function () {
  'use strict';
  const LeadOS = (window.LeadOS = window.LeadOS || {});

  const DAY = 86400000;

  // Review rhythms and the v4 setting that governs each.
  const CADENCE = [
    { kind: 'revenue',    label: 'Revenue review',   settingKey: 'revenueReviewCadenceDays' },
    { kind: 'ops',        label: 'Ops review',       settingKey: 'opsReviewCadenceDays' },
    { kind: 'board',      label: 'Board meeting',    settingKey: 'boardCadenceDays' },
    { kind: 'compliance', label: 'Compliance audit', settingKey: 'complianceAuditCadenceDays' }
  ];

  function project(events) {
    const s = {
      eventCount: events.length,
      appliedSettings: {},
      objectives: {}, krs: {}, tasks: {}, decisions: {}, risks: {}, reviews: {},
      playbooks: [],
      counts: {},
      repairs: [],
      firstAt: null, lastAt: null
    };

    events.forEach(function (ev) {
      s.counts[ev.type] = (s.counts[ev.type] || 0) + 1;
      if (s.firstAt === null || ev.at < s.firstAt) s.firstAt = ev.at;
      if (s.lastAt === null || ev.at > s.lastAt) s.lastAt = ev.at;
      if (ev.meta && ev.meta.repair) s.repairs.push(ev);
      const p = ev.payload || {};

      switch (ev.type) {
        case 'settings.changed':
          s.appliedSettings[p.key] = p.value; break;
        case 'objective.created':
          s.objectives[p.id] = { id: p.id, domain: p.domain, title: p.title, owner: p.owner || '', horizon: p.horizon || '', status: 'active', createdAt: ev.at }; break;
        case 'objective.statusChanged':
          if (s.objectives[p.id]) s.objectives[p.id].status = p.status; break;
        case 'kr.created':
          s.krs[p.id] = { id: p.id, objectiveId: p.objectiveId, title: p.title, target: p.target, unit: p.unit, baseline: (p.baseline == null ? 0 : p.baseline), logs: [] }; break;
        case 'kr.progressLogged':
          if (s.krs[p.id]) s.krs[p.id].logs.push({ at: ev.at, value: p.value, note: p.note || '' }); break;
        case 'task.created':
          s.tasks[p.id] = { id: p.id, domain: p.domain, title: p.title, owner: p.owner || '', dueAt: p.dueAt || null, status: 'open', createdAt: ev.at, completedAt: null }; break;
        case 'task.completed':
          if (s.tasks[p.id]) { s.tasks[p.id].status = 'done'; s.tasks[p.id].completedAt = ev.at; } break;
        case 'decision.proposed':
          s.decisions[p.id] = { id: p.id, domain: p.domain, question: p.question, options: (p.options || []).slice(), owner: p.owner, reversibility: p.reversibility, dueAt: p.dueAt || null, status: 'open', choice: null, rationale: null, createdAt: ev.at, decidedAt: null }; break;
        case 'decision.decided':
          if (s.decisions[p.id] && s.decisions[p.id].status === 'open') {
            s.decisions[p.id].status = 'decided'; s.decisions[p.id].choice = p.choice;
            s.decisions[p.id].rationale = p.rationale; s.decisions[p.id].decidedAt = ev.at;
          } break;
        case 'risk.raised':
          s.risks[p.id] = { id: p.id, domain: p.domain, title: p.title, likelihood: p.likelihood, impact: p.impact, mitigation: p.mitigation || '', status: 'open', createdAt: ev.at, updatedAt: ev.at }; break;
        case 'risk.statusChanged':
          if (s.risks[p.id]) { s.risks[p.id].status = p.status; s.risks[p.id].updatedAt = ev.at; } break;
        case 'review.scheduled':
          s.reviews[p.id] = { id: p.id, kind: p.kind, domain: p.domain || null, dueAt: p.dueAt, status: 'scheduled', outcome: null, notes: '', completedAt: null, createdAt: ev.at }; break;
        case 'review.completed':
          if (s.reviews[p.id]) { s.reviews[p.id].status = 'completed'; s.reviews[p.id].outcome = p.outcome; s.reviews[p.id].notes = p.notes || ''; s.reviews[p.id].completedAt = ev.at; } break;
        case 'playbook.applied':
          s.playbooks.push({ id: p.id, domain: p.domain, playbookId: p.playbookId, at: ev.at }); break;
      }
    });
    return s;
  }

  function settings(state) {
    return Object.assign({}, LeadOS.store.ALL_SETTING_DEFAULTS, state.appliedSettings);
  }

  // ---- Cadences (v4) -------------------------------------------------------
  // status: 'never' (no completed review yet - due now), 'ok', 'due' (within
  // 24h of dueAt), 'overdue' (strictly past dueAt).
  function cadenceStatus(state, now) {
    now = (typeof now === 'number') ? now : Date.now();
    const set = settings(state);
    const out = {};
    CADENCE.forEach(function (c) {
      const reviews = Object.keys(state.reviews).map(function (k) { return state.reviews[k]; })
        .filter(function (r) { return r.kind === c.kind; });
      const completed = reviews.filter(function (r) { return r.status === 'completed'; })
        .sort(function (a, b) { return b.completedAt - a.completedAt; });
      const open = reviews.filter(function (r) { return r.status === 'scheduled'; })
        .sort(function (a, b) { return a.dueAt - b.dueAt; });
      const intervalDays = set[c.settingKey];
      const lastCompletedAt = completed.length ? completed[0].completedAt : null;
      let status, dueAt, overdueDays = 0;
      if (lastCompletedAt === null) {
        status = 'never'; dueAt = open.length ? open[0].dueAt : null;
      } else {
        dueAt = lastCompletedAt + intervalDays * DAY;
        if (now > dueAt) { status = 'overdue'; overdueDays = Math.ceil((now - dueAt) / DAY); }
        else if (dueAt - now <= DAY) { status = 'due'; }
        else { status = 'ok'; }
      }
      out[c.kind] = { kind: c.kind, label: c.label, settingKey: c.settingKey, intervalDays: intervalDays, lastCompletedAt: lastCompletedAt, dueAt: dueAt, status: status, overdueDays: overdueDays, openScheduled: open.length ? open[0] : null, completedCount: completed.length };
    });
    return out;
  }

  // ---- Decisions -----------------------------------------------------------
  function decisionQueue(state, now) {
    now = (typeof now === 'number') ? now : Date.now();
    const set = settings(state);
    return Object.keys(state.decisions).map(function (k) { return state.decisions[k]; })
      .filter(function (d) { return d.status === 'open'; })
      .map(function (d) {
        const ageDays = Math.floor((now - d.createdAt) / DAY);
        return Object.assign({}, d, {
          ageDays: ageDays,
          stale: ageDays > set.decisionMaxOpenDays,
          // v4: a sales decision older than the sales cycle has missed a full cycle.
          beyondSalesCycle: d.domain === 'sales' && ageDays > set.salesCycleDays
        });
      })
      .sort(function (a, b) { return b.ageDays - a.ageDays; });
  }

  function decidedLog(state) {
    return Object.keys(state.decisions).map(function (k) { return state.decisions[k]; })
      .filter(function (d) { return d.status === 'decided'; })
      .sort(function (a, b) { return b.decidedAt - a.decidedAt; });
  }

  // ---- Risks ---------------------------------------------------------------
  function riskRegister(state, now) {
    now = (typeof now === 'number') ? now : Date.now();
    const set = settings(state);
    return Object.keys(state.risks).map(function (k) { return state.risks[k]; })
      .filter(function (r) { return r.status === 'open' || r.status === 'mitigating'; })
      .map(function (r) {
        const ageDays = Math.floor((now - r.updatedAt) / DAY);
        return Object.assign({}, r, { score: r.likelihood * r.impact, ageDays: ageDays, stale: ageDays > set.riskReviewCadenceDays });
      })
      .sort(function (a, b) { return (b.score - a.score) || (b.ageDays - a.ageDays); });
  }

  // ---- KRs / tasks ---------------------------------------------------------
  function krView(state) {
    return Object.keys(state.krs).map(function (k) { return state.krs[k]; })
      .map(function (kr) {
        const current = kr.logs.length ? kr.logs[kr.logs.length - 1].value : kr.baseline;
        const span = kr.target - kr.baseline;
        const pct = span > 0 ? Math.max(0, Math.min(100, Math.round(((current - kr.baseline) / span) * 100))) : (kr.target > 0 ? Math.round((current / kr.target) * 100) : 0);
        const obj = state.objectives[kr.objectiveId];
        return Object.assign({}, kr, { current: current, pct: pct, domain: obj ? obj.domain : null, checkIns: kr.logs.length });
      });
  }

  function taskLists(state, now) {
    now = (typeof now === 'number') ? now : Date.now();
    const all = Object.keys(state.tasks).map(function (k) { return state.tasks[k]; });
    const open = all.filter(function (t) { return t.status === 'open'; });
    return {
      open: open.sort(function (a, b) { return (a.dueAt || Infinity) - (b.dueAt || Infinity); }),
      overdue: open.filter(function (t) { return t.dueAt !== null && now > t.dueAt; })
        .sort(function (a, b) { return a.dueAt - b.dueAt; }),
      doneCount: all.filter(function (t) { return t.status === 'done'; }).length
    };
  }

  // ---- Domain rollups ------------------------------------------------------
  function domainRollups(state) {
    const out = {};
    LeadOS.events.DOMAINS.forEach(function (d) {
      out[d.id] = { id: d.id, label: d.label, hue: d.hue, activeObjectives: 0, openTasks: 0, openRisks: 0, openDecisions: 0, krCount: 0, playbooks: 0, lastActivityAt: null };
    });
    function touch(id, at) {
      const r = out[id]; if (!r) return;
      if (at !== null && (r.lastActivityAt === null || at > r.lastActivityAt)) r.lastActivityAt = at;
    }
    Object.keys(state.objectives).forEach(function (k) { const o = state.objectives[k]; if (out[o.domain] && o.status === 'active') out[o.domain].activeObjectives++; touch(o.domain, o.createdAt); });
    Object.keys(state.tasks).forEach(function (k) { const t = state.tasks[k]; if (out[t.domain] && t.status === 'open') out[t.domain].openTasks++; touch(t.domain, t.completedAt || t.createdAt); });
    Object.keys(state.risks).forEach(function (k) { const r = state.risks[k]; if (out[r.domain] && (r.status === 'open' || r.status === 'mitigating')) out[r.domain].openRisks++; touch(r.domain, r.updatedAt); });
    Object.keys(state.decisions).forEach(function (k) { const d = state.decisions[k]; if (out[d.domain] && d.status === 'open') out[d.domain].openDecisions++; touch(d.domain, d.decidedAt || d.createdAt); });
    Object.keys(state.krs).forEach(function (k) { const kr = state.krs[k]; const o = state.objectives[kr.objectiveId]; if (o && out[o.domain]) out[o.domain].krCount++; });
    state.playbooks.forEach(function (p) { if (out[p.domain]) out[p.domain].playbooks++; touch(p.domain, p.at); });
    return out;
  }

  function totals(state) {
    const objectives = Object.keys(state.objectives).map(function (k) { return state.objectives[k]; });
    return {
      events: state.eventCount,
      activeObjectives: objectives.filter(function (o) { return o.status === 'active'; }).length,
      openDecisions: Object.keys(state.decisions).filter(function (k) { return state.decisions[k].status === 'open'; }).length,
      openRisks: Object.keys(state.risks).filter(function (k) { const r = state.risks[k]; return r.status === 'open' || r.status === 'mitigating'; }).length,
      repairs: state.repairs.length
    };
  }

  LeadOS.engine = {
    DAY: DAY, CADENCE: CADENCE,
    project: project, settings: settings,
    cadenceStatus: cadenceStatus, decisionQueue: decisionQueue, decidedLog: decidedLog,
    riskRegister: riskRegister, krView: krView, taskLists: taskLists,
    domainRollups: domainRollups, totals: totals
  };
})();
