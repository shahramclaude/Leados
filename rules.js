/* LeadOS pt-4 - js/rules.js
   Rules engine. Every rule is a pure function (P, today) -> findings[].
   P is a projection from engine.project(); `today` is injected (never Date.now
   inside a rule) so the T-suite can pin time. Nothing here touches storage.

   DOCTRINES ENFORCED STRUCTURALLY (pt-4 part 9):
   1. Stable keys. Every finding carries `key` = `<rule>:<scope|refs[0]>`, e.g.
      `R11:fr1`, `R12:dl1`. Same input -> same key, so a second run is safe to
      diff, dedupe or track. Keys are unique within a run (T28 asserts both).
   2. Sev 3 ceiling for trend-based findings. Any finding whose SEVERITY is
      derived from a multi-observation pattern (run, streak, slope, window
      count) sets `trend: true` and is clamped to 3 by fin() itself - not by
      each rule remembering to. The clamp prints what it did in the basis.
      Exceptions are the two the doctrine names: safety (R28) and legal
      (R30 'fail'); those read direct data, so they never set `trend`.
   3. >= 3 measured points before any trend claim (explicit spec exceptions:
      R20 and R33 slopes, marked inline).
   4. Missing fields SKIP, never infer.
   5. A count is never stated as certainty - basis lines print the math and
      name where the number came from.
   6. Every finding carries a playbook id in .play, or .playNone says why not. */
(function () {
  'use strict';
  const LeadOS = (window.LeadOS = window.LeadOS || {});
  const DAY = 86400000, H = 3600000;
  const MIN_TREND_POINTS = 3;
  const TREND_SEV_CEILING = 3;

  const PB = {
    fin: 'playbook:finance', sales: 'playbook:sales', product: 'playbook:product',
    ops: 'playbook:operations', people: 'playbook:people', mktg: 'playbook:marketing',
    mfg: 'playbook:manufacturing', supply: 'playbook:supplyChain', design: 'playbook:design',
    rd: 'playbook:rd', legal: 'playbook:legal', cs: 'playbook:customerSuccess', exec: 'playbook:executive'
  };

  function fin(o) {
    if (!o.rule || !o.sev || !o.conf || !o.title) throw new Error('finding missing identity fields');
    if (!o.play && !o.playNone) throw new Error(o.rule + ': finding has neither .play nor .playNone');
    const refs = o.refs || [], basis = (o.basis || []).slice();
    let sev = o.sev;
    if (o.trend && sev > TREND_SEV_CEILING) {
      basis.push('trend-derived severity capped at ' + TREND_SEV_CEILING + ' by doctrine (pattern evidence suggested ' + sev + '); direct-data rules are not capped');
      sev = TREND_SEV_CEILING;
    }
    const scope = o.scope !== undefined ? String(o.scope) : (refs.length ? String(refs[0]) : '*');
    return {
      rule: o.rule, key: o.rule + ':' + scope, scope: scope,
      sev: sev, conf: o.conf, title: o.title,
      basis: basis, refs: refs, trend: !!o.trend,
      play: o.play || null, playNone: o.playNone || null
    };
  }
  const clampSev = function (n, lo, hi) { return Math.max(lo, Math.min(hi, n)); };
  const vals = function (o) { return Object.keys(o).map(function (k) { return o[k]; }); };
  const dBetween = function (a, b) { return (b - a) / DAY; };
  function slope(ys) {
    const n = ys.length; if (n < 2) return 0;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += ys[i]; sxy += i * ys[i]; sxx += i * i; }
    const den = n * sxx - sx * sx;
    return den === 0 ? 0 : (n * sxy - sx * sy) / den;
  }
  function median(nums) {
    const a = nums.slice().sort(function (x, y) { return x - y; });
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  const money = function (n) { return Math.round(n).toLocaleString('en-US'); };
  const pct = function (x) { return (x * 100).toFixed(1) + '%'; };
  const iso = function (ts) { return new Date(ts).toISOString().slice(0, 10); };

  /* ============ R1–R10 — heritage rules (reconstructed; AI-SESSION-LOG §10) ============ */
  function ruleCadence(kind, play) {
    return function (P, today) {
      const c = LeadOS.engine.cadenceStatus(P, today)[kind];
      const set = LeadOS.engine.settings(P);
      const interval = set[c.settingKey], out = [];
      if (c.status === 'overdue') out.push(fin({ rule: '', scope: kind, sev: 3, conf: 'HIGH', title: c.label + ' is ' + c.overdueDays + 'd overdue', basis: ['every ' + interval + 'd; last completed ' + (c.lastCompletedAt ? iso(c.lastCompletedAt) : 'unknown') + '; due ' + iso(c.dueAt)], play: play }));
      else if (c.status === 'never' && P.firstAt !== null && dBetween(P.firstAt, today) > interval) out.push(fin({ rule: '', scope: kind, sev: 2, conf: 'HIGH', title: c.label + ' has never run', basis: ['log is ' + Math.floor(dBetween(P.firstAt, today)) + 'd old; cadence is ' + interval + 'd'], play: play }));
      return out;
    };
  }

  const RULES = [
    { id: 'R1', fn: ruleCadence('revenue', PB.fin) },
    { id: 'R2', fn: ruleCadence('ops', PB.ops) },
    { id: 'R3', fn: ruleCadence('board', PB.exec) },
    { id: 'R4', fn: ruleCadence('compliance', PB.legal) },

    { id: 'R5', fn: function (P, today) {
      return LeadOS.engine.decisionQueue(P, today).filter(function (d) { return d.stale; }).map(function (d) {
        return fin({ rule: 'R5', sev: 3, conf: 'HIGH', title: 'Decision open ' + d.ageDays + 'd: ' + d.question, basis: ['max open ' + LeadOS.engine.settings(P).decisionMaxOpenDays + 'd; owner ' + d.owner + '; domain ' + d.domain], refs: [d.id], play: 'playbook:' + d.domain });
      });
    } },
    { id: 'R6', fn: function (P, today) {
      const set = LeadOS.engine.settings(P);
      return LeadOS.engine.decisionQueue(P, today).filter(function (d) { return d.beyondSalesCycle; }).map(function (d) {
        return fin({ rule: 'R6', sev: d.ageDays > 1.5 * set.salesCycleDays ? 4 : 3, conf: 'HIGH', title: 'Sales decision aged past a full cycle (' + d.ageDays + 'd)', basis: [d.question + '; salesCycleDays=' + set.salesCycleDays + '; age=' + d.ageDays + 'd'], refs: [d.id], play: PB.sales });
      });
    } },
    { id: 'R7', fn: function (P, today) {
      const set = LeadOS.engine.settings(P);
      return LeadOS.engine.riskRegister(P, today).filter(function (r) { return r.stale; }).map(function (r) {
        return fin({ rule: 'R7', sev: r.ageDays > 3 * set.riskReviewCadenceDays ? 3 : 2, conf: 'HIGH', title: 'Risk unreviewed ' + r.ageDays + 'd: ' + r.title, basis: ['review cycle ' + set.riskReviewCadenceDays + 'd; score ' + r.score + ' (L' + r.likelihood + '×I' + r.impact + ')'], refs: [r.id], play: 'playbook:' + r.domain });
      });
    } },
    { id: 'R8', fn: function (P, today) {
      const set = LeadOS.engine.settings(P), out = [];
      LeadOS.engine.krView(P).forEach(function (kr) {
        const obj = P.objectives[kr.objectiveId];
        if (!obj || obj.status !== 'active') return;
        const lastAt = kr.logs.length ? kr.logs[kr.logs.length - 1].at : obj.createdAt;
        const silent = Math.floor(dBetween(lastAt, today));
        if (silent > set.krCheckInCadenceDays) out.push(fin({ rule: 'R8', sev: 2, conf: 'HIGH', title: 'KR silent ' + silent + 'd: ' + kr.title, basis: ['check-in cadence ' + set.krCheckInCadenceDays + 'd; current ' + kr.current + ' ' + kr.unit + ' of ' + kr.target], refs: [kr.id], play: 'playbook:' + (kr.domain || 'product') }));
      });
      return out;
    } },
    { id: 'R9', fn: function (P, today) {
      return LeadOS.engine.taskLists(P, today).overdue.map(function (t) {
        const late = Math.floor(dBetween(t.dueAt, today));
        return fin({ rule: 'R9', sev: late > 14 ? 3 : 2, conf: 'HIGH', title: 'Task ' + late + 'd overdue: ' + t.title, basis: ['due ' + iso(t.dueAt)], refs: [t.id], play: 'playbook:' + t.domain });
      });
    } },
    { id: 'R10', fn: function (P, today) {
      const hasKr = {};
      Object.keys(P.krs).forEach(function (k) { hasKr[P.krs[k].objectiveId] = true; });
      return vals(P.objectives).filter(function (o) { return o.status === 'active' && !hasKr[o.id] && dBetween(o.createdAt, today) > 14; }).map(function (o) {
        return fin({ rule: 'R10', sev: 2, conf: 'HIGH', title: 'Objective has no KR: ' + o.title, basis: ['active ' + Math.floor(dBetween(o.createdAt, today)) + 'd with zero key results — unmeasurable'], refs: [o.id], play: 'playbook:' + o.domain });
      });
    } },

    /* ============ R11–R40 ============ */

    { id: 'R11', fn: function (P, today) {
      const RESOLVED = ['mitigated', 'accepted', 'closed'];
      return vals(P.finRisks).filter(function (r) {
        if (!r.reviewDate || r.reviewDate >= today) return false;          // missing/future skips
        return !(RESOLVED.indexOf(r.status) !== -1 && r.updatedAt >= r.reviewDate);
      }).map(function (r) {
        const factor = r.likelihood >= 4 ? 1 : 0;
        const sev = clampSev(r.severity + factor, 3, 5);
        return fin({ rule: 'R11', sev: sev, conf: 'HIGH', title: 'Financial risk review overdue: ' + r.title, basis: ['reviewDate ' + iso(r.reviewDate) + ' is ' + Math.floor(dBetween(r.reviewDate, today)) + 'd past', 'sev math: clamp(severity ' + r.severity + ' + likelihood-band ' + factor + ', 3, 5) = ' + sev, 'status is "' + r.status + '"; only fin.risk.updated clears this'], refs: [r.id], play: PB.fin });
      });
    } },
    { id: 'R12', fn: function (P, today) {
      return vals(P.deals).filter(function (d) {
        return !d.result && d.closeDate && d.closeDate < today && d.updatedAt <= d.closeDate;
      }).map(function (d) {
        const past = Math.floor(dBetween(d.closeDate, today));
        return fin({ rule: 'R12', sev: past > 30 ? 4 : 3, conf: 'HIGH', title: 'Deal ' + past + 'd past closeDate, untouched: ' + d.title, basis: ['value ' + money(d.value) + ' ' + d.currency + '; stage "' + d.stage + '"; closeDate ' + iso(d.closeDate), past > 30 ? '>30d past close -> sev 4' : 'past close -> sev 3', 'a pipeline nobody cleans is a pipeline that lies'], refs: [d.id], play: PB.sales });
      });
    } },
    { id: 'R13', fn: function (P) {
      const out = [];
      vals(P.quotas).forEach(function (q) {
        if (!q.actuals.length || !q.target) return;                         // missing actuals -> skip
        const last = q.actuals[q.actuals.length - 1];
        const rate = last.actual / q.target;
        if (rate >= 0.7) return;
        out.push(fin({ rule: 'R13', sev: rate < 0.5 ? 4 : 3, conf: 'HIGH', title: 'Quota attainment ' + pct(rate) + ' for ' + q.personId + ' (' + last.period + ')', basis: ['math: ' + money(last.actual) + ' / ' + money(q.target) + ' = ' + pct(rate) + ' (thresholds 70% / 50%)', 'source: sales.quota.actuals, latest record for this quota'], refs: [q.id], play: PB.sales }));
      });
      return out;
    } },
    { id: 'R14', fn: function (P, today) {
      return vals(P.okrs).filter(function (o) {
        if (o.closedAt) return false;
        if (o.keyResults.some(function (kr) { return kr.logs.length > 0; })) return false;
        return dBetween(o.setAt, today) > 21;
      }).map(function (o) {
        const silent = dBetween(o.setAt, today);
        return fin({ rule: 'R14', sev: silent > 42 ? 3 : 2, conf: 'HIGH', title: 'OKR silent ' + Math.floor(silent) + 'd: ' + o.objective, basis: ['set ' + iso(o.setAt) + '; zero progress events (thresholds 21d / 42d, strictly)', 'an OKR without a signal is a wish'], refs: [o.id], play: PB.product });
      });
    } },
    { id: 'R15', fn: function (P) {
      const out = [];
      const closed = vals(P.okrs).filter(function (o) { return o.closedAt && typeof o.score === 'number'; })
        .sort(function (a, b) { return a.closedAt - b.closedAt; });
      closed.forEach(function (o) {
        if (o.score >= 0.4) return;
        // direct data: an explicit score, not a pattern -> not trend-capped
        out.push(fin({ rule: 'R15', sev: o.score === 0 ? 4 : 3, conf: 'HIGH', title: 'OKR scored ' + o.score + ': ' + o.objective, basis: ['score math: ' + o.score + ' < 0.4 threshold' + (o.score === 0 ? ' (score 0 -> sev 4)' : ''), 'source: strategy.okr.closed for ' + o.quarter], refs: [o.id], play: PB.product }));
      });
      let run = [];
      closed.forEach(function (o) { run = o.score < 0.4 ? run.concat([o]) : []; });
      if (run.length >= MIN_TREND_POINTS) {
        out.push(fin({ rule: 'R15', scope: 'pattern', trend: true, sev: 4, conf: 'HIGH', title: 'Pattern: ' + run.length + ' consecutive OKRs scored < 0.4', basis: ['run: ' + run.map(function (o) { return o.id + '=' + o.score; }).join(', '), 'measured points: ' + run.length + ' (>=3 requirement met) — systemic, not a blip'], refs: run.map(function (o) { return o.id; }), play: PB.product }));
      }
      return out;
    } },
    { id: 'R16', fn: function (P, today) {
      const out = [];
      vals(P.incidents).forEach(function (i) {
        const thr = i.severity >= 4 ? 4 * H : i.severity === 3 ? 24 * H : 72 * H;
        const sev = clampSev(i.severity, 3, 5);
        if (i.resolved) {
          const gap = i.resolvedAt - i.startedAt;
          if (gap > thr) out.push(fin({ rule: 'R16', sev: sev, conf: 'HIGH', title: 'MTTR ' + (gap / H).toFixed(1) + 'h on sev' + i.severity + ' incident: ' + i.title, basis: ['MTTR math: resolvedAt − startedAt = ' + (gap / H).toFixed(1) + 'h; threshold 4h for severity ' + i.severity, 'started ' + new Date(i.startedAt).toISOString() + '; resolved ' + new Date(i.resolvedAt).toISOString()], refs: [i.id], play: PB.ops }));
        } else if (today - i.startedAt > thr) {
          out.push(fin({ rule: 'R16', sev: sev, conf: 'HIGH', title: 'Incident open ' + ((today - i.startedAt) / H).toFixed(1) + 'h (over threshold): ' + i.title, basis: ['threshold ' + thr / H + 'h for severity ' + i.severity + '; still unresolved'], refs: [i.id], play: PB.ops }));
        }
      });
      return out;
    } },
    { id: 'R17', fn: function (P) {
      const out = [], byMetric = {};
      P.slaLogs.forEach(function (l) {
        if (l.met !== false) return;
        out.push(fin({ rule: 'R17', scope: l.metric + ':' + l.period, sev: 3, conf: 'HIGH', title: 'SLA miss: ' + l.metric + ' (' + l.period + ')', basis: ['gap math: target ' + l.target + ' − actual ' + l.actual + ' = ' + (l.target - l.actual).toFixed(2), 'source: ops.sla.logged met=false'], play: PB.ops }));
        (byMetric[l.metric] = byMetric[l.metric] || []).push(l);
      });
      Object.keys(byMetric).forEach(function (m) {
        const misses = byMetric[m]; if (misses.length < MIN_TREND_POINTS) return;
        // streak-derived severity -> trend-capped
        out.push(fin({ rule: 'R17', scope: m + ':streak', trend: true, sev: 4, conf: 'HIGH', title: 'SLA ' + m + ' missed ' + misses.length + ' consecutive periods', basis: ['streak: ' + misses.map(function (x) { return x.period + '(' + x.actual + '/' + x.target + ')'; }).join(' '), 'measured points: ' + misses.length + ' (>=3 met)'], play: PB.ops }));
      });
      return out;
    } },
    { id: 'R18', fn: function (P, today) {
      const out = [];
      vals(P.milestones).forEach(function (m) {
        if (m.status === 'done') return;
        const past = m.dueDate < today;
        if (m.status === 'at-risk' || m.status === 'blocked' || past) {
          out.push(fin({ rule: 'R18', sev: past ? 4 : 3, conf: 'HIGH', title: 'Milestone ' + m.status + (past ? ' and past due' : '') + ': ' + m.title, basis: ['due ' + iso(m.dueDate) + (past ? ' (' + Math.floor(dBetween(m.dueDate, today)) + 'd past)' : ''), m.dependsOn.length ? 'dependsOn: ' + m.dependsOn.join(', ') : 'no declared dependencies'], refs: [m.id], play: PB.ops }));
        }
      });
      return out;
    } },
    { id: 'R19', fn: function (P, today) {
      const w = P.attrition.filter(function (a) { return dBetween(a.at, today) <= 60; });
      if (w.length < 2) return [];
      const vol = w.filter(function (a) { return a.reason === 'voluntary'; }).length;
      const invol = w.filter(function (a) { return a.reason === 'involuntary'; }).length;
      const restr = w.filter(function (a) { return a.reason === 'restructure'; }).length;
      // window-count pattern -> trend-capped at 3
      return [fin({ rule: 'R19', scope: '60d', trend: true, sev: w.length >= 3 ? 4 : 3, conf: 'MEDIUM', title: 'Attrition spike: ' + w.length + ' departures in 60d', basis: ['breakdown: voluntary ' + vol + ' · involuntary ' + invol + ' · restructure ' + restr + ' (of ' + w.length + ')', 'source: hr.attrition.logged inside a rolling 60d window', 'a second departure is a pattern, not a coincidence'], refs: w.map(function (a) { return a.personId; }), play: PB.people })];
    } },
    { id: 'R20', fn: function (P, today) {
      const logs = P.engagement.slice().sort(function (a, b) { return a.at - b.at; });
      const out = [];
      if (!logs.length) return out;
      const last = logs[logs.length - 1];
      if (last.score < 6.5) {
        const ys = logs.map(function (l) { return l.score; });
        const sl = ys.length >= 2 ? slope(ys) : 0;                           // spec exception: >=2 periods
        const trendLine = ys.length >= 2 && sl < 0 ? ['slope: ' + sl.toFixed(3) + ' per period over ' + ys.length + ' periods (declining)'] : [];
        // severity comes from the latest measured score (direct data), not the slope
        out.push(fin({ rule: 'R20', scope: 'score', sev: last.score < 5 ? 4 : 3, conf: trendLine.length ? 'MEDIUM' : 'HIGH', title: 'Engagement score ' + last.score + '/10 (' + last.period + ')', basis: ['thresholds 6.5 / 5.0; respondents ' + last.respondents + ' (source: hr.engagement.logged)'].concat(trendLine), play: PB.people }));
      }
      if (logs.length >= MIN_TREND_POINTS) {
        const gaps = [];
        for (let i = 1; i < logs.length; i++) gaps.push(logs[i].at - logs[i - 1].at);
        const med = median(gaps);
        if (today - last.at > 2 * med) out.push(fin({ rule: 'R20', scope: 'cadence', sev: 2, conf: 'HIGH', title: 'Engagement survey cadence broken', basis: ['median interval ' + Math.round(med / DAY) + 'd; silence now ' + Math.floor(dBetween(last.at, today)) + 'd (> 2x median)'], play: PB.people }));
      }
      return out;
    } },
    { id: 'R21', fn: function (P, today) {
      return vals(P.pips).filter(function (x) { return !x.result && x.startedAt + x.duration_days * DAY < today; }).map(function (x) {
        return fin({ rule: 'R21', sev: 4, conf: 'HIGH', title: 'PIP past its ' + x.duration_days + 'd term with no review: ' + x.personId, basis: ['started ' + iso(x.startedAt) + '; ' + Math.floor(dBetween(x.startedAt, today)) + 'd elapsed; goals: ' + x.goals.join('; '), 'a PIP is a commitment, not a filing'], refs: [x.id], play: PB.people });
      });
    } },
    { id: 'R22', fn: function (P) {
      const out = [];
      vals(P.finBudgets).forEach(function (b) {
        if (!b.amount) return;
        b.actuals.forEach(function (a) {
          const v = Math.abs(a.actual - b.amount) / b.amount;
          if (v <= 0.15) return;
          const dir = a.actual > b.amount ? 'overspend' : 'underspend';
          out.push(fin({ rule: 'R22', scope: b.id + ':' + a.period, sev: v > 0.30 ? 4 : 3, conf: 'HIGH', title: 'Budget variance ' + pct(v) + ' (' + dir + '): ' + b.category + ' ' + a.period, basis: ['math: |' + money(a.actual) + ' − ' + money(b.amount) + '| / ' + money(b.amount) + ' = ' + pct(v) + ' (thresholds 15% / 30%)', 'source: fin.budget.actuals against fin.budget.set', 'underspend fires at the same thresholds — both are signals'], refs: [b.id], play: PB.fin }));
        });
      });
      return out;
    } },
    { id: 'R23', fn: function (P) {
      const out = [], byMetric = {};
      P.finKpis.forEach(function (k) { if (k.target && k.target !== 0) (byMetric[k.metric] = byMetric[k.metric] || []).push(k); });
      Object.keys(byMetric).forEach(function (m) {
        const logs = byMetric[m].sort(function (a, b) { return a.at - b.at; });
        const last = logs[logs.length - 1];
        const ratio = last.value / last.target;
        if (ratio >= 0.85) return;
        const sl = logs.length >= MIN_TREND_POINTS ? slope(logs.map(function (k) { return k.value; })) : 0;
        const trendLine = logs.length >= MIN_TREND_POINTS && sl < 0 ? ['slope: ' + sl.toFixed(3) + ' per period over ' + logs.length + ' measured points'] : [];
        // severity from the latest measured ratio (direct), slope only informs
        out.push(fin({ rule: 'R23', scope: m, sev: ratio < 0.7 ? 4 : 3, conf: trendLine.length ? 'MEDIUM' : 'HIGH', title: 'KPI ' + m + ' at ' + pct(ratio) + ' of target', basis: ['math: ' + last.value + ' / ' + last.target + ' = ' + pct(ratio) + ' (thresholds 85% / 70%)', 'source: fin.kpi.logged, latest record for this metric'].concat(trendLine), play: PB.fin }));
      });
      return out;
    } },
    { id: 'R24', fn: function (P) {
      const out = [], checkable = [];
      P.finForecasts.forEach(function (f) {
        let actual = 0, found = false;
        vals(P.finBudgets).forEach(function (b) { b.actuals.forEach(function (a) { if (a.period === f.period) { actual += a.actual; found = true; } }); });
        if (!found || !actual) return;                                       // not checkable -> skip
        const dev = Math.abs(f.revenue - actual) / actual;
        checkable.push({ f: f, actual: actual, dev: dev, over: f.revenue > actual });
        if (dev > 0.20) out.push(fin({ rule: 'R24', scope: f.period, sev: 3, conf: 'HIGH', title: 'Forecast off ' + pct(dev) + ' for ' + f.period, basis: ['math: |' + money(f.revenue) + ' − ' + money(actual) + '| / ' + money(actual) + ' = ' + pct(dev), 'source: fin.forecast.logged vs summed fin.budget.actuals for the same period', f.revenue > actual ? 'over-optimistic' : 'over-conservative'], play: PB.fin }));
      });
      let streak = 0;
      checkable.sort(function (a, b) { return a.f.at - b.f.at; }).forEach(function (c) { streak = c.over && c.dev > 0.20 ? streak + 1 : 0; });
      if (streak >= MIN_TREND_POINTS) out.push(fin({ rule: 'R24', scope: 'streak', trend: true, sev: 4, conf: 'HIGH', title: 'Systematic over-optimism: ' + streak + ' consecutive over-forecasts', basis: ['measured points: ' + streak + ' (>=3 met); all deviations >20% in the same direction'], play: PB.fin }));
      return out;
    } },
    { id: 'R25', fn: function (P, today) {
      return vals(P.vendors).filter(function (v) {
        if (v.risk_level < 4 || !v.reviewDate || v.reviewDate >= today) return false;
        return !v.reviews.some(function (r) { return r.at >= v.reviewDate; });
      }).map(function (v) {
        return fin({ rule: 'R25', sev: v.risk_level === 5 ? 4 : 3, conf: 'HIGH', title: 'High-risk vendor unreviewed: ' + v.name, basis: ['risk_level ' + v.risk_level + '; reviewDate ' + iso(v.reviewDate) + ' past ' + Math.floor(dBetween(v.reviewDate, today)) + 'd', 'a high-risk vendor is a single point of failure you chose to forget about'], refs: [v.id], play: PB.supply });
      });
    } },
    { id: 'R26', fn: function (P, today) {
      return P.disruptions.filter(function (d) {
        if (d.severity < 4 || dBetween(d.at, today) <= 7) return false;
        const reviewed = d.vendorId && P.vendors[d.vendorId] && P.vendors[d.vendorId].reviews.some(function (r) { return r.at > d.at; });
        const ack = P.disruptions.some(function (later) { return later !== d && later.at > d.at && later.vendorId === d.vendorId && d.vendorId && later.mitigation; });
        return !reviewed && !ack;
      }).map(function (d) {
        return fin({ rule: 'R26', scope: 'disruption:' + d.at, sev: 4, conf: 'HIGH', title: 'Unmitigated supply disruption, open ' + Math.floor(dBetween(d.at, today)) + 'd', basis: ['severity ' + d.severity + '; no vendor review and no mitigation acknowledgement since', d.description], refs: d.vendorId ? [d.vendorId] : [], play: PB.supply });
      });
    } },
    { id: 'R27', fn: function (P) {
      const out = [], byLine = {};
      P.yieldLogs.forEach(function (y) { if (typeof y.yield_pct !== 'number') return; (byLine[y.line || '(plant)'] = byLine[y.line || '(plant)'] || []).push(y); });
      Object.keys(byLine).forEach(function (line) {
        const logs = byLine[line].sort(function (a, b) { return a.at - b.at; });
        const last = logs[logs.length - 1];
        if (last.yield_pct >= 90) return;
        const sl = logs.length >= MIN_TREND_POINTS ? slope(logs.map(function (y) { return y.yield_pct; })) : 0;
        const trendLine = logs.length >= MIN_TREND_POINTS && sl < 0 ? ['slope: ' + sl.toFixed(3) + ' yield-points per period over ' + logs.length + ' points'] : [];
        out.push(fin({ rule: 'R27', scope: line, sev: last.yield_pct < 80 ? 4 : 3, conf: trendLine.length ? 'MEDIUM' : 'HIGH', title: 'Yield ' + last.yield_pct + '% on ' + line + ' (' + last.period + ')', basis: ['thresholds 90% / 80%; source: mfg.yield.logged, latest record for this line'].concat(trendLine), play: PB.mfg }));
      });
      return out;
    } },
    { id: 'R28', fn: function (P, today) {
      // DOCTRINE EXCEPTION: safety reads direct data and is never trend-capped.
      const out = [];
      P.safetyIncidents.forEach(function (i) {
        if (i.severity === 5) out.push(fin({ rule: 'R28', scope: 'sev5:' + i.at, sev: 5, conf: 'HIGH', title: 'Sev-5 safety incident: ' + i.type, basis: [i.description, 'any sev-5 safety incident fires immediately — direct data, not a trend'], play: PB.mfg }));
      });
      const w = P.safetyIncidents.filter(function (i) { return dBetween(i.at, today) <= 30; });
      if (w.length >= 2) out.push(fin({ rule: 'R28', scope: '30d', sev: 4, conf: 'HIGH', title: w.length + ' safety incidents in 30d', basis: ['types: ' + w.map(function (i) { return i.type; }).join(', '), 'safety is the named exception to the sev-3 trend ceiling', 'a second safety incident is never acceptable'], play: PB.mfg }));
      return out;
    } },
    { id: 'R29', fn: function (P, today) {
      const out = [];
      vals(P.equipment).forEach(function (e) {
        const ageH = (today - e.at) / H;
        if (e.status === 'down' && ageH > 4) out.push(fin({ rule: 'R29', sev: 4, conf: 'HIGH', title: 'Asset down ' + ageH.toFixed(1) + 'h: ' + e.assetId, basis: ['down threshold 4h; no "operational" entry since'], refs: [e.assetId], play: PB.mfg }));
        else if (e.status === 'degraded' && ageH > 24) out.push(fin({ rule: 'R29', sev: 3, conf: 'HIGH', title: 'Asset degraded ' + ageH.toFixed(1) + 'h: ' + e.assetId, basis: ['degraded threshold 24h; note: ' + (e.note || '—')], refs: [e.assetId], play: PB.mfg }));
      });
      return out;
    } },
    { id: 'R30', fn: function (P, today) {
      // DOCTRINE EXCEPTION: a logged 'fail' is direct data -> sev 5, never capped.
      const out = [], set = LeadOS.engine.settings(P), byFw = {};
      P.complianceChecks.forEach(function (c) { (byFw[c.framework] = byFw[c.framework] || []).push(c); });
      let lastAny = null;
      Object.keys(byFw).forEach(function (fw) {
        const logs = byFw[fw].sort(function (a, b) { return a.at - b.at; });
        const last = logs[logs.length - 1];
        if (!lastAny || last.at > lastAny.at) lastAny = last;
        if (last.result === 'fail') { out.push(fin({ rule: 'R30', scope: fw, sev: 5, conf: 'HIGH', title: 'Compliance FAIL: ' + fw, basis: ['latest check ' + iso(last.at) + '; findings: ' + (last.findings.join('; ') || 'none itemized'), 'a logged fail is direct data — fires immediately, exempt from the trend ceiling'], play: PB.legal })); return; }
        if (last.result === 'finding' && dBetween(last.at, today) > 30) out.push(fin({ rule: 'R30', scope: fw, sev: 4, conf: 'HIGH', title: 'Compliance finding aged ' + Math.floor(dBetween(last.at, today)) + 'd: ' + fw, basis: ['findings: ' + (last.findings.join('; ') || 'none itemized'), 'no subsequent pass for this framework — direct data'], play: PB.legal }));
      });
      if (!P.complianceChecks.length) {
        if (P.firstAt !== null && dBetween(P.firstAt, today) > set.complianceAuditCadenceDays) out.push(fin({ rule: 'R30', scope: 'cadence', sev: 2, conf: 'HIGH', title: 'No compliance check ever logged', basis: ['log older than complianceAuditCadenceDays (' + set.complianceAuditCadenceDays + 'd)'], play: PB.legal }));
      } else if (lastAny && dBetween(lastAny.at, today) > set.complianceAuditCadenceDays) {
        out.push(fin({ rule: 'R30', scope: 'cadence', sev: 2, conf: 'HIGH', title: 'Compliance check cadence miss', basis: ['last check ' + Math.floor(dBetween(lastAny.at, today)) + 'd ago; cadence ' + set.complianceAuditCadenceDays + 'd'], play: PB.legal }));
      }
      return out;
    } },
    { id: 'R31', fn: function (P, today) {
      const out = [];
      P.legalRisks.forEach(function (r) {
        const overdue = r.dueDate && r.dueDate < today;
        if (overdue) out.push(fin({ rule: 'R31', scope: r.id, sev: 4, conf: 'HIGH', title: 'Legal risk past dueDate: ' + r.title, basis: ['area ' + r.area + '; due ' + iso(r.dueDate) + '; owner ' + (r.ownerId || 'null') + '; no update on record'], refs: [r.id], play: PB.legal }));
        else if (r.ownerId === null || r.ownerId === undefined) out.push(fin({ rule: 'R31', scope: r.id, sev: 3, conf: 'HIGH', title: 'Legal risk unowned: ' + r.title, basis: ['ownerId is explicitly null — an explicit null is data', 'area ' + r.area + '; severity ' + r.severity], refs: [r.id], play: PB.legal }));
      });
      return out;
    } },
    { id: 'R32', fn: function (P, today) {
      const out = [], SAFE = ['renewed', 'terminated'];
      vals(P.contracts).forEach(function (c) {
        if (!c.expiryDate || SAFE.indexOf(c.status) !== -1) return;
        const delta = dBetween(today, c.expiryDate);
        if (delta < 0 && c.status === 'active') { out.push(fin({ rule: 'R32', sev: 5, conf: 'HIGH', title: 'Contract expired but still "active": ' + c.counterparty, basis: ['expired ' + Math.floor(-delta) + 'd ago (' + iso(c.expiryDate) + ')'], refs: [c.id], play: PB.legal })); return; }
        if (delta <= 7) out.push(fin({ rule: 'R32', sev: 4, conf: 'HIGH', title: 'Contract expires in ' + Math.max(0, Math.ceil(delta)) + 'd: ' + c.counterparty, basis: ['expiry ' + iso(c.expiryDate) + '; status ' + c.status], refs: [c.id], play: PB.legal }));
        else if (delta <= 30) out.push(fin({ rule: 'R32', sev: 3, conf: 'HIGH', title: 'Contract expires in ' + Math.ceil(delta) + 'd: ' + c.counterparty, basis: ['expiry ' + iso(c.expiryDate) + '; status ' + c.status], refs: [c.id], play: PB.legal }));
      });
      return out;
    } },
    { id: 'R33', fn: function (P, today) {
      const logs = P.npsLogs.slice().sort(function (a, b) { return a.at - b.at; });
      const out = [];
      if (!logs.length) return out;
      const last = logs[logs.length - 1];
      if (last.score < 0) out.push(fin({ rule: 'R33', scope: 'nps', sev: 4, conf: 'HIGH', title: 'NPS negative: ' + last.score, basis: ['detractors ' + last.detractors + ' vs promoters ' + last.promoters + ' (' + last.period + ') — direct measurement'], play: PB.cs }));
      else if (logs.length >= 2) {                                           // spec exception: >=2 periods
        const sl = slope(logs.map(function (l) { return l.score; }));
        if (sl < 0 && last.score < 30) out.push(fin({ rule: 'R33', scope: 'nps', trend: true, sev: 3, conf: 'MEDIUM', title: 'NPS declining to ' + last.score, basis: ['slope: ' + sl.toFixed(2) + ' per period over ' + logs.length + ' periods; latest ' + last.score + ' < 30'], play: PB.cs }));
      }
      if (dBetween(last.at, today) > 90) out.push(fin({ rule: 'R33', scope: 'cadence', sev: 2, conf: 'HIGH', title: 'No NPS logged in ' + Math.floor(dBetween(last.at, today)) + 'd', basis: ['cadence miss threshold 90d'], play: PB.cs }));
      return out;
    } },
    { id: 'R34', fn: function (P) {
      const out = [];
      P.churnLogs.forEach(function (c) {
        if (!c.total) return;
        const rate = c.churned / c.total;
        const mrrRate = (typeof c.mrr_lost === 'number' && typeof c.mrr_total === 'number' && c.mrr_total > 0) ? (c.mrr_lost / c.mrr_total) : null;
        const countFires = rate > 0.05, mrrFires = mrrRate !== null && mrrRate > 0.15;
        if (!countFires && !mrrFires) return;
        const basis = ['math: ' + c.churned + ' / ' + c.total + ' = ' + pct(rate) + ' (thresholds 5% / 10%)', 'source: cs.churn.logged for ' + c.period];
        if (mrrRate !== null) basis.push('MRR math: ' + money(c.mrr_lost) + ' / ' + money(c.mrr_total) + ' = ' + pct(mrrRate) + (mrrFires ? ' > 15% -> sev 4 regardless of account count' : ' (under the 15% escalation)'));
        else if (typeof c.mrr_lost === 'number') basis.push('mrr_lost ' + money(c.mrr_lost) + ' logged without mrr_total; the >15%-of-MRR escalation is NOT inferred (skip-not-infer)');
        out.push(fin({ rule: 'R34', scope: c.period, sev: (rate > 0.10 || mrrFires) ? 4 : 3, conf: 'HIGH', title: 'Churn ' + pct(rate) + ' in ' + c.period + (mrrFires ? ' · MRR loss ' + pct(mrrRate) : ''), basis: basis, play: PB.cs }));
      });
      return out;
    } },
    { id: 'R35', fn: function (P, today) {
      const out = [];
      vals(P.escalations).forEach(function (e) {
        if (e.resolved) return;
        if (e.severity === 5 && (today - e.loggedAt) > 4 * H) { out.push(fin({ rule: 'R35', sev: 5, conf: 'HIGH', title: 'Sev-5 escalation unresolved ' + ((today - e.loggedAt) / H).toFixed(1) + 'h: ' + e.accountName, basis: [e.description, 'sev-5 unresolved > 4h -> immediate sev-5 finding'], refs: [e.id], play: PB.cs })); return; }
        if (e.dueDate && e.dueDate < today) out.push(fin({ rule: 'R35', sev: clampSev(e.severity, 3, 5), conf: 'HIGH', title: 'Escalation ' + Math.floor(dBetween(e.dueDate, today)) + 'd overdue: ' + e.accountName, basis: [e.description, 'inherited severity ' + e.severity + ' clamped 3-5'], refs: [e.id], play: PB.cs }));
      });
      return out;
    } },
    { id: 'R36', fn: function (P, today) {
      const out = [];
      const qual = vals(P.campaigns).filter(function (c) { return c.results.some(function (r) { return r.spend_actual > 0 && r.conversions > 0; }); })
        .sort(function (a, b) { return a.loggedAt - b.loggedAt; });
      const cpa = function (c) { const r = c.results[c.results.length - 1]; return r.spend_actual / r.conversions; };
      qual.forEach(function (c, i) {
        if (i < MIN_TREND_POINTS) return;
        const prev3 = qual.slice(i - MIN_TREND_POINTS, i).map(cpa);
        const avg = prev3.reduce(function (a, b) { return a + b; }, 0) / prev3.length;
        const mine = cpa(c);
        if (mine > 2 * avg) out.push(fin({ rule: 'R36', trend: true, sev: 3, conf: 'MEDIUM', title: 'CPA ' + money(mine) + ' vs avg ' + money(avg) + ': ' + c.name, basis: ['math: ' + money(mine) + ' > 2 × mean(' + prev3.map(money).join(', ') + ') = ' + money(2 * avg), 'basis campaigns: ' + prev3.length + ' measured (>=3 met)'], refs: [c.id], play: PB.mktg }));
      });
      vals(P.campaigns).forEach(function (c) {
        if (!c.results.length && dBetween(c.loggedAt, today) > 14) out.push(fin({ rule: 'R36', sev: 2, conf: 'HIGH', title: 'Campaign live ' + Math.floor(dBetween(c.loggedAt, today)) + 'd, zero results: ' + c.name, basis: ['budget ' + money(c.budget) + '; channel ' + c.channel], refs: [c.id], play: PB.mktg }));
      });
      return out;
    } },
    { id: 'R37', fn: function (P, today) {
      return vals(P.experiments).filter(function (e) { return !e.result && e.reviewDate && e.reviewDate < today; }).map(function (e) {
        return fin({ rule: 'R37', sev: 3, conf: 'HIGH', title: 'Experiment past reviewDate, no result: ' + e.hypothesis, basis: ['reviewDate ' + iso(e.reviewDate) + ' past ' + Math.floor(dBetween(e.reviewDate, today)) + 'd; method ' + e.method, 'a hypothesis nobody tested is a bet nobody called'], refs: [e.id], play: PB.rd });
      });
    } },
    { id: 'R38', fn: function (P, today) {
      const items = vals(P.techDebt).filter(function (d) { return !d.resolved && dBetween(d.loggedAt, today) <= 90; });
      if (!items.length) return [];
      const terms = items.map(function (d) { return { id: d.id, term: d.severity * d.effort, text: d.severity + 'x' + d.effort }; });
      const sum = terms.reduce(function (a, t) { return a + t.term; }, 0);
      if (sum <= 30) return [];
      // aggregate of explicitly logged values (not a temporal pattern) -> not trend-capped
      return [fin({ rule: 'R38', scope: 'backlog', sev: sum > 60 ? 4 : 3, conf: 'MEDIUM', title: 'Tech debt mass ' + sum + ' accumulated in 90d', basis: ['math: ' + terms.map(function (t) { return t.text; }).join(' + ') + ' = ' + sum + ' (thresholds 30 / 60)', 'source: unresolved rd.tech.debt.logged items inside a 90d window'], refs: terms.map(function (t) { return t.id; }), play: PB.rd })];
    } },
    { id: 'R39', fn: function (P, today) {
      const set = LeadOS.engine.settings(P);
      if (!P.boardMeetings.length) {
        if (P.firstAt !== null && dBetween(P.firstAt, today) > set.boardCadenceDays) return [fin({ rule: 'R39', scope: 'board', sev: 2, conf: 'HIGH', title: 'No board meeting ever logged', basis: ['log is ' + Math.floor(dBetween(P.firstAt, today)) + 'd old; boardCadenceDays=' + set.boardCadenceDays], play: PB.exec })];
        return [];
      }
      const last = P.boardMeetings.reduce(function (a, b) { return a.at > b.at ? a : b; });
      const gap = dBetween(last.at, today);
      if (gap > set.boardCadenceDays) return [fin({ rule: 'R39', scope: 'board', sev: 3, conf: 'HIGH', title: 'Board cadence miss: ' + Math.floor(gap) + 'd since last meeting', basis: ['boardCadenceDays=' + set.boardCadenceDays + '; quorum was ' + (last.quorum ? 'met' : 'NOT met'), 'source: exec.board.meeting dates'], play: PB.exec })];
      return [];
    } },
    { id: 'R40', fn: function (P, today) {
      const set = LeadOS.engine.settings(P);
      if (!P.execKpiReviews.length) return [];                               // never logged -> skip
      const last = P.execKpiReviews.reduce(function (a, b) { return a.at > b.at ? a : b; });
      const gap = dBetween(last.at, today);
      if (gap > 2 * set.revenueReviewCadenceDays) return [fin({ rule: 'R40', scope: 'kpi', sev: 3, conf: 'HIGH', title: 'Executive KPI review ' + Math.floor(gap) + 'd stale', basis: ['gap > 2x revenueReviewCadenceDays (' + set.revenueReviewCadenceDays + 'd)'], play: PB.exec })];
      if (gap > set.revenueReviewCadenceDays) return [fin({ rule: 'R40', scope: 'kpi', sev: 2, conf: 'HIGH', title: 'Executive KPI review gap: ' + Math.floor(gap) + 'd', basis: ['revenueReviewCadenceDays=' + set.revenueReviewCadenceDays], play: PB.exec })];
      return [];
    } }
  ];

  // Deterministic run: pure over (P, today), stable sort by key, nothing persisted.
  function run(P, today) {
    const out = [];
    RULES.forEach(function (r) {
      (r.fn(P, today) || []).forEach(function (f) {
        if (!f.rule) { f.rule = r.id; f.key = r.id + ':' + f.scope; }
        out.push(f);
      });
    });
    out.sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : (a.title < b.title ? -1 : a.title > b.title ? 1 : 0); });
    return out;
  }

  LeadOS.rules = { RULES: RULES, run: run, fin: fin, MIN_TREND_POINTS: MIN_TREND_POINTS, TREND_SEV_CEILING: TREND_SEV_CEILING, PLAY_IDS: Object.keys(PB).map(function (k) { return PB[k]; }) };
})();
