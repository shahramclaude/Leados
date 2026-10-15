/* LeadOS mf-3 · js/engine.js — rules engine. Pure: (state, todayISO) → findings.
   Every finding carries what (title + action), why (basis lines + source-event
   ids), confidence (level + why), and printed score math: sev × conf = score.
   The engine never states certainty it doesn't have: trends need ≥3 measured
   points; estimated pulses excluded AND counted; missing fields skip rather
   than infer; broken reporting lines fall silent rather than guess.
   Engine memory (snooze/dismiss/unmute) is EVENTS — auditable, exportable,
   reversible. Golden fixtures G1–G16 are the contract and run live at #/health.
   v3 adds R9 (day-14 expectations), R10 (tour coverage), R11 (early-win gate),
   R12 (incident staleness). */
window.LEADOS = window.LEADOS || {};
LEADOS.engine = (function () {
  'use strict';
  function EV() { return LEADOS.events; }
  var S = LEADOS.store;

  var DOCTRINE = {
    GOAL_STALL_DAYS: 14,
    FB_WINDOW_DAYS: 60, FB_MIN_COUNT: 3, FB_IMBALANCE: 0.8,
    DL_OPEN_MAX: 4,
    CF_WINDOW_DAYS: 90, CF_MIN: 2,
    PULSE_WINDOW_DAYS: 21, LOAD_HIGH: 8, MOOD_SLOPE_NEG: -0.4, MIN_POINTS: 3,
    SKIP_CADENCE_DAYS: 28,
    INC_STALE_DAYS: 7,
    ARR_EXPECT_DAYS: 14,       /* day-N by which boss expectations should be captured */
    ARR_TOUR_DAYS: 45,         /* day-N by which the listening tour should be complete */
    ARR_TOUR_GRACE: 7,         /* no tour nagging in the first week — silence is honest */
    SNOOZE_DAYS: 7
  };
  var CONF_FACTOR = { high: 1.0, medium: 0.8, low: 0.6 };
  var RULE_TAGS = {
    R1: '1:1 cadence', R2: 'decision review', R3: 'goal health', R4: 'feedback balance',
    R5: 'delegation load', R6: 'conflict pattern', R7: 'overload signals', R8: 'skip-level',
    R9: 'arrival · expectations', R10: 'arrival · listening tour',
    R11: 'arrival · early wins', R12: 'incident follow-up'
  };
  var RULE_PLAYBOOK = {
    R1: 'oneonone', R2: 'decision', R3: 'goal', R4: 'sbi', R5: 'delegation',
    R6: 'desc', R7: 'oneonone', R8: 'oneonone',
    R9: 'charter', R10: 'tour', R11: 'wincloser', R12: null /* quick-capture instead */
  };

  function dayUTC(iso) {
    if (typeof iso !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return isFinite(t) ? t : null;
  }
  function days(fromISO, toISO) {
    var a = dayUTC(fromISO), b = dayUTC(toISO);
    if (a == null || b == null) return null;
    return Math.round((b - a) / 86400000);
  }
  function num(x) { var n = Number(x); return isFinite(n) ? n : null; }
  function slope(vals) { /* least squares over non-null points; null when < MIN_POINTS */
    var pts = vals.filter(function (v) { return v != null; });
    var n = pts.length, sx = 0, sy = 0, sxy = 0, sxx = 0, i;
    if (n < DOCTRINE.MIN_POINTS) return null;
    for (i = 0; i < n; i++) { sx += i; sy += pts[i]; sxy += i * pts[i]; sxx += i * i; }
    var den = n * sxx - sx * sx;
    return den === 0 ? 0 : (n * sxy - sx * sy) / den;
  }
  function conf(level, why) { return { level: level, why: why }; }
  function fin(o) {
    o.basis = o.basis || []; o.meta = o.meta || {}; o.meta.evidenceIds = o.meta.evidenceIds || [];
    if (!o.meta.evidenceIds.length) delete o.meta.evidenceIds;
    var f = CONF_FACTOR[o.confidence.level] || 0.6;
    o.score = Math.round(o.severity * f);
    o.breakdown = 'sev ' + o.severity + ' × conf ' + f.toFixed(2) + ' = ' + o.score;
    o.tag = RULE_TAGS[o.ruleId] || o.ruleId;
    o.playbook = RULE_PLAYBOOK[o.ruleId] || null;
    o.key = keyOf(o);
    return o;
  }
  function keyOf(f) { return f.ruleId + ':' + (f.personId || (f.meta && f.meta.key) || 'global'); }

  function buildCtx(state, todayISO) {
    var people = (state.people || []).filter(function (p) { return p && typeof p === 'object'; });
    var events = (state.events || []).slice().sort(function (a, b) {
      return String(a.ts) < String(b.ts) ? -1 : String(a.ts) > String(b.ts) ? 1 : 0;
    });
    var byPid = {}, names = {};
    people.forEach(function (p) { byPid[p.id] = p; names[p.id] = p.name || 'unnamed'; });
    return {
      today: todayISO,
      people: people.filter(function (p) { return !p.archived; }),
      allPeople: people, events: events, byPid: byPid,
      name: function (pid) { return names[pid] || 'unknown person'; },
      lastEvent: function (type, pid) {
        var best = null;
        for (var i = 0; i < events.length; i++) {
          var e = events[i];
          if (e.type === type && (pid == null || e.personId === pid)) best = e;
        }
        return best;
      },
      /* reporting line → array ending in 'me'; null = broken/foreign (engine goes silent) */
      lineToMe: function (pid) {
        var chain = [], cur = this.byPid[pid], guard = 0;
        if (!cur || cur.archived) return null;
        while (cur && guard++ < 20) {
          var rt = cur.reportsTo === undefined ? 'me' : cur.reportsTo;
          if (rt === 'me') return chain.concat(['me']);
          var next = this.byPid[rt];
          if (!next || next.archived) return null;
          chain.push(next.id); cur = next;
        }
        return null;
      }
    };
  }

  var RULES = [
    { id: 'R1', run: function (ctx) {                 /* 1:1 cadence overdue (direct reports) */
      var out = [];
      ctx.people.forEach(function (p) {
        var line = ctx.lineToMe(p.id);
        if (!(line && line.length === 1)) return;     /* skip-levels are R8's job */
        var cad = num(p.cadenceDays) || 7;
        var last = ctx.lastEvent('oneonone.logged', p.id);
        if (!last) {
          out.push(fin({ ruleId: 'R1', personId: p.id, severity: 70,
            title: 'No 1:1 ever logged with ' + ctx.name(p.id),
            action: 'Book the first one now — a lead without a cadence flies on hallway signal.',
            basis: ['oneonone.logged events for this person: 0', 'cadence setting: ' + cad + 'd'],
            confidence: conf('high', 'absence of events is a hard fact of the store — the assumption is that you log 1:1s here, not elsewhere.'),
            meta: { never: true } }));
          return;
        }
        var d = days(last.ts, ctx.today);
        if (d == null || d <= cad) return;            /* fires strictly past cadence (G2) */
        var sev = Math.min(90, 60 + 2 * (d - cad));
        out.push(fin({ ruleId: 'R1', personId: p.id, severity: sev,
          title: '1:1 with ' + ctx.name(p.id) + ' is ' + (d - cad) + 'd overdue',
          action: 'Book it inside 48h. Come with their blockers, not your agenda — the 1:1 run sheet has the structure.',
          basis: ['last logged 1:1: ' + String(last.ts).slice(0, 10) + ' (' + d + 'd ago)',
            'cadence setting: ' + cad + 'd — fires strictly when days > cadence',
            last.data && last.data.note ? 'last session note: ' + last.data.note : 'last session has no note'],
          confidence: conf('high', 'pure date arithmetic on your logged events and your cadence setting.'),
          meta: { overdue: d - cad, evidenceIds: [last.id] } }));
      });
      return out;
    } },

    { id: 'R2', run: function (ctx) {                 /* decisions past review, no outcome */
      var out = [], resolved = {};
      ctx.events.forEach(function (e) {
        if (e.type === 'decision.outcome' && e.data && e.data.decisionId) resolved[e.data.decisionId] = true;
      });
      ctx.events.forEach(function (e) {
        if (e.type !== 'decision.logged' || resolved[e.id]) return;
        var rd = e.data && e.data.reviewDate, d = dayUTC(rd) == null ? null : days(rd, ctx.today);
        if (d == null || d < 0) return;               /* future or absent review date → silent */
        out.push(fin({ ruleId: 'R2', severity: Math.min(88, 78 + d),
          title: 'Decision "' + ((e.data && e.data.title) || 'untitled') + '" is ' + d + 'd past its review date',
          action: 'Close the loop: was the call right? Log the outcome — decision quality is your only calibration data.',
          basis: ['decided: ' + String(e.ts).slice(0, 10) + ' · review date: ' + rd,
            'decision.outcome events referencing this id: 0'],
          confidence: conf('high', 'id-linked event arithmetic; either the outcome event exists or it does not.'),
          meta: { key: e.id, pastDays: d, evidenceIds: [e.id] } }));
      });
      return out;
    } },

    { id: 'R3', run: function (ctx) {                 /* goals ownerless or silent */
      var out = [];
      EV().openGoals(ctxState(ctx)).forEach(function (g) {
        var problems = [], sev = 0;
        if (!g.ownerPersonId) { problems.push('no owner'); sev = 62; }
        var silent = days(g.lastProgressTs, ctx.today);
        if (silent != null && silent > DOCTRINE.GOAL_STALL_DAYS) {
          problems.push('silent ' + silent + 'd (>' + DOCTRINE.GOAL_STALL_DAYS + 'd)');
          sev = Math.max(sev, Math.min(84, 55 + (silent - DOCTRINE.GOAL_STALL_DAYS)));
        }
        if (!problems.length) return;
        out.push(fin({ ruleId: 'R3', personId: g.ownerPersonId || undefined, severity: sev,
          title: 'Goal "' + g.label + '": ' + problems.join(' · '),
          action: !g.ownerPersonId
            ? 'Assign one name — not a team, a person. An ownerless goal is a wish.'
            : 'Ask the owner for one sentence of progress today; if it is dead, kill it out loud.',
          basis: ['goal.set: ' + String(g.ts).slice(0, 10),
            'owner: ' + (g.ownerPersonId ? ctx.name(g.ownerPersonId) : 'none'),
            'last progress anchor: ' + String(g.lastProgressTs).slice(0, 10)],
          confidence: conf('high', 'goal state is folded from your goal.* events; silence is measured against your own anchors.'),
          meta: { key: g.id, evidenceIds: [g.id] } }));
      });
      return out;
    } },

    { id: 'R4', run: function (ctx) {                 /* feedback imbalance per person */
      var out = [];
      ctx.people.forEach(function (p) {
        var bal = EV().feedbackBalance(ctxState(ctx), p.id, DOCTRINE.FB_WINDOW_DAYS, ctx.today);
        if (bal.total < DOCTRINE.FB_MIN_COUNT) return;
        var shareC = bal.corrective / bal.total, shareP = bal.positive / bal.total;
        if (shareC < DOCTRINE.FB_IMBALANCE && shareP < DOCTRINE.FB_IMBALANCE) return;
        var only = shareC >= DOCTRINE.FB_IMBALANCE ? 'corrective' : 'positive';
        out.push(fin({ ruleId: 'R4', personId: p.id, severity: 58,
          title: 'Feedback to ' + ctx.name(p.id) + ' is ' + Math.round((only === 'corrective' ? shareC : shareP) * 100) + '% ' + only,
          action: only === 'corrective'
            ? 'A diet of pure correction teaches avoidance, not excellence. Find one specific thing worth repeating — SBI it this week.'
            : 'Pure praise feels kind and rots standards. Find the one thing you are tolerating — SBI it this week.',
          basis: [DOCTRINE.FB_WINDOW_DAYS + 'd window: ' + bal.corrective + ' corrective / ' + bal.positive + ' positive (n=' + bal.total + ', min ' + DOCTRINE.FB_MIN_COUNT + ')',
            'imbalance threshold: ≥' + (DOCTRINE.FB_IMBALANCE * 100) + '% either polarity'],
          confidence: conf('medium', 'the count is exact; that your logged feedback matches what you actually SAY is an assumption only you can check.'),
          meta: { corrective: bal.corrective, positive: bal.positive } }));
      });
      return out;
    } },

    { id: 'R5', run: function (ctx) {                 /* delegation load per person */
      var out = [], byP = {};
      EV().openDelegations(ctxState(ctx)).forEach(function (d) {
        if (!d.personId) return;
        byP[d.personId] = byP[d.personId] || [];
        byP[d.personId].push(d);
      });
      Object.keys(byP).forEach(function (pid) {
        var list = byP[pid], p = ctx.byPid[pid];
        if (!p || p.archived) return;
        if (list.length <= DOCTRINE.DL_OPEN_MAX) return;
        out.push(fin({ ruleId: 'R5', personId: pid, severity: Math.min(86, 52 + 6 * (list.length - DOCTRINE.DL_OPEN_MAX)),
          title: ctx.name(pid) + ' carries ' + list.length + ' open delegations',
          action: 'Rebalance, don\'t praise. Drop, trade, or close one item before adding anything — check its delegation level first.',
          basis: ['open delegations: ' + list.length + ' (threshold >' + DOCTRINE.DL_OPEN_MAX + ')',
            'items: ' + list.map(function (d) { return d.label; }).slice(0, 4).join(' · ') + (list.length > 4 ? ' …' : '')],
          confidence: conf('high', 'delegation.closed either references the assignment or it is still open — event arithmetic, no inference.'),
          meta: { count: list.length, evidenceIds: list.map(function (d) { return d.id; }) } }));
      });
      return out;
    } },

    { id: 'R6', run: function (ctx) {                 /* repeated unresolved conflict */
      var out = [], byP = {};
      EV().openConflicts(ctxState(ctx)).forEach(function (c) {
        if (!c.personId) return;
        var d = days(c.ts, ctx.today);
        if (d == null || d > DOCTRINE.CF_WINDOW_DAYS) return;
        byP[c.personId] = byP[c.personId] || [];
        byP[c.personId].push(c);
      });
      Object.keys(byP).forEach(function (pid) {
        var list = byP[pid], p = ctx.byPid[pid];
        if (!p || p.archived || list.length < DOCTRINE.CF_MIN) return;
        var cps = list.map(function (c) { return c.counterpart; }).filter(Boolean);
        out.push(fin({ ruleId: 'R6', personId: pid, severity: 72,
          title: ctx.name(pid) + ': ' + list.length + ' unresolved conflicts in ' + DOCTRINE.CF_WINDOW_DAYS + 'd',
          action: 'This is now a pattern, not an incident. Run DESC on the recurring counterpart before it calcifies.',
          basis: list.map(function (c) { return c.label + ' (unresolved)'; })
            .concat(['per-person count, ' + DOCTRINE.CF_WINDOW_DAYS + 'd window — resolved conflicts excluded',
              cps.length ? 'counterparts as logged: ' + cps.join(' · ') : 'no counterparts logged — pair-level analysis impossible until you record them']),
          confidence: conf('high', 'only your unresolved, in-window conflict events are counted.'),
          meta: { count: list.length, evidenceIds: list.map(function (c) { return c.id; }) } }));
      });
      return out;
    } },

    { id: 'R7', run: function (ctx) {                 /* overload: measured pulses only */
      var out = [];
      ctx.people.forEach(function (p) {
        var m = EV().pulsesMeasured(ctxState(ctx), p.id, DOCTRINE.PULSE_WINDOW_DAYS, ctx.today);
        var est = EV().pulsesEstimatedCount(ctxState(ctx), p.id, DOCTRINE.PULSE_WINDOW_DAYS, ctx.today);
        if (m.length < DOCTRINE.MIN_POINTS) return;   /* never trend on fewer points */
        var loads = m.map(function (e) { return num(e.data && e.data.load); });
        var moods = m.map(function (e) { return num(e.data && e.data.mood); });
        var lvals = loads.filter(function (v) { return v != null; });
        var meanLoad = lvals.length ? lvals.reduce(function (a, b) { return a + b; }, 0) / lvals.length : null;
        var sl = slope(moods);
        var high = meanLoad != null && meanLoad >= DOCTRINE.LOAD_HIGH;
        var neg = sl != null && sl <= DOCTRINE.MOOD_SLOPE_NEG;
        if (!high && !neg) return;
        var sig = [high ? 'mean load ' + meanLoad.toFixed(1) + '/10 ≥ ' + DOCTRINE.LOAD_HIGH : null,
          neg ? 'mood slope ' + sl.toFixed(2) + '/reading ≤ ' + DOCTRINE.MOOD_SLOPE_NEG : null].filter(Boolean).join(' · ');
        out.push(fin({ ruleId: 'R7', personId: p.id, severity: high && neg ? 88 : 76,
          title: ctx.name(p.id) + ' shows overload signals',
          action: 'Cut load before coaching resilience — book a load-cutting 1:1 and arrive with one concrete item to remove.',
          basis: [sig,
            'measured pulses in ' + DOCTRINE.PULSE_WINDOW_DAYS + 'd: ' + m.length + ' → ' + m.map(function (e) {
              return String(e.ts).slice(5, 10) + ' m' + (e.data.mood ?? '?') + '/l' + (e.data.load ?? '?'); }).join(' · '),
            'estimated readings excluded: ' + est + (est ? ' (doctrine: only spoken numbers count)' : '')],
          confidence: conf('medium', 'arithmetic on ' + m.length + ' spoken readings is exact; whether three readings a trend make is judgment — that is why this is medium, not high.'),
          meta: { measured: m.length, estimatedExcluded: est, evidenceIds: m.map(function (e) { return e.id; }) },
          prefill: { intent: 'load' } }));
      });
      return out;
    } },

    { id: 'R8', run: function (ctx) {                 /* skip-level 1:1 overdue */
      var out = [];
      ctx.people.forEach(function (p) {
        var line = ctx.lineToMe(p.id);
        if (!(line && line.length === 2)) return;     /* exactly one lead between us */
        var via = line[0];
        var last = ctx.lastEvent('oneonone.logged', p.id);
        var d = last ? days(last.ts, ctx.today) : null;
        if (!last) {
          out.push(fin({ ruleId: 'R8', personId: p.id, severity: 55,
            title: 'No skip-level 1:1 ever logged with ' + ctx.name(p.id),
            action: 'Their lead (' + ctx.name(via) + ') owns supervision; you own signal. 20 minutes: what slows you down, what should I know, what would you change.',
            basis: ['reporting line: ' + ctx.name(p.id) + ' → ' + ctx.name(via) + ' → me',
              'oneonone.logged events for this person: 0', 'skip cadence: ' + DOCTRINE.SKIP_CADENCE_DAYS + 'd'],
            confidence: conf('high', 'absence of events is a hard fact; the reporting line is read from your roster, not guessed.'),
            meta: { never: true, via: via }, prefill: { skip: true, via: via } }));
          return;
        }
        if (d == null || d <= DOCTRINE.SKIP_CADENCE_DAYS) return;
        out.push(fin({ ruleId: 'R8', personId: p.id, severity: Math.min(80, 50 + (d - DOCTRINE.SKIP_CADENCE_DAYS)),
          title: 'Skip-level 1:1 with ' + ctx.name(p.id) + ' is ' + (d - DOCTRINE.SKIP_CADENCE_DAYS) + 'd overdue',
          action: 'Book 20 minutes inside a week. Signal, not supervision — never undermine their lead in the room.',
          basis: ['reporting line: ' + ctx.name(p.id) + ' → ' + ctx.name(via) + ' → me',
            'last logged: ' + String(last.ts).slice(0, 10) + ' (' + d + 'd ago) · skip cadence: ' + DOCTRINE.SKIP_CADENCE_DAYS + 'd'],
          confidence: conf('high', 'date arithmetic on your events and your roster.'),
          meta: { overdue: d - DOCTRINE.SKIP_CADENCE_DAYS, via: via, evidenceIds: [last.id] },
          prefill: { skip: true, via: via } }));
      });
      return out;
    } },

    /* ---------------- the arrival instrument (v3) ---------------- */
    { id: 'R9', run: function (ctx) {                 /* day-14 boss-expectations nudge */
      var a = EV().arrival(ctxState(ctx), ctx.today);
      if (!a.set || a.day == null) return [];
      if (a.day < DOCTRINE.ARR_EXPECT_DAYS || a.expectationCount > 0) return [];
      var late = a.day - DOCTRINE.ARR_EXPECT_DAYS;
      return [fin({ ruleId: 'R9', severity: Math.min(84, 64 + late),
        title: 'Day ' + a.day + ' — boss expectations still uncaptured',
        action: 'Book 45 minutes with your boss this week and run the Expectations charter. Every day without it you are optimizing toward a guess.',
        basis: ['appointment started: ' + a.startDate + ' (day ' + a.day + ')',
          'expectation.logged events: 0', 'doctrine threshold: captured by day ' + DOCTRINE.ARR_EXPECT_DAYS],
        confidence: conf('medium', 'zero events is a hard fact; that you have not aligned with your boss OUTSIDE this app is an assumption. If you have, log what you agreed and this goes away honestly.'),
        meta: { day: a.day } })];
    } },

    { id: 'R10', run: function (ctx) {                /* listening-tour coverage */
      var a = EV().arrival(ctxState(ctx), ctx.today);
      if (!a.set || a.day == null || a.tour.directCount === 0) return [];
      if (a.day < DOCTRINE.ARR_TOUR_GRACE || a.tour.missing.length === 0) return [];
      var overdue = a.day > DOCTRINE.ARR_TOUR_DAYS;
      var sev = overdue ? Math.min(88, 68 + (a.day - DOCTRINE.ARR_TOUR_DAYS))
        : 46 + Math.round(26 * (1 - a.tour.coveragePct / 100));
      return [fin({ ruleId: 'R10', severity: sev,
        title: overdue
          ? 'Listening tour is ' + (a.day - DOCTRINE.ARR_TOUR_DAYS) + 'd past the day-' + DOCTRINE.ARR_TOUR_DAYS + ' gate — ' + a.tour.missing.length + ' lead(s) never visited'
          : 'Listening tour ' + a.tour.coveragePct + '% — ' + a.tour.missing.length + ' lead(s) not yet visited',
        action: 'Sit with ' + a.tour.missing[0].name + ' next. Four questions: what works, what is slow, what would you change, what should I protect. Log it as a tour visit.',
        basis: ['coverage: ' + a.tour.visitedCount + '/' + a.tour.directCount + ' direct leads visited (' + a.tour.coveragePct + '%), day ' + a.day,
          'not yet visited: ' + a.tour.missing.map(function (p) { return p.name; }).slice(0, 5).join(' · '),
          'skip-level visits also logged: ' + a.tour.skipCount + ' · completion gate: day ' + DOCTRINE.ARR_TOUR_DAYS],
        confidence: conf('medium', 'coverage is measured against TODAY\'s roster — people added after a visit still count as unvisited until you sit with them. Visits held outside the app are unknown to it.'),
        meta: { missing: a.tour.missing.map(function (p) { return p.id; }) } })];
    } },

    { id: 'R11', run: function (ctx) {                /* early-win verification gate */
      var a = EV().arrival(ctxState(ctx), ctx.today);
      var out = [];
      a.wins.open.forEach(function (w) {
        var d = w.verifyDate && dayUTC(w.verifyDate) != null ? days(w.verifyDate, ctx.today) : null;
        if (d == null || d <= 0) return;
        out.push(fin({ ruleId: 'R11', severity: Math.min(85, 74 + 2 * d),
          title: 'Early win "' + w.title + '" is ' + d + 'd past its verify date — unverified',
          action: w.announcedTo
            ? 'You announced this to ' + w.announcedTo + '. Verify the metric out loud — or walk it back while walking back is cheap.'
            : 'Verify the metric out loud. An unverified win you believe in is a debt with interest.',
          basis: ['committed: ' + String(w.ts).slice(0, 10) + ' · verify date: ' + w.verifyDate,
            'metric as committed: ' + (w.metric || 'none — which is itself the problem'),
            'earlywin.verified events referencing this id: 0',
            'same shape as R2 by design: an open loop presented as progress — to your boss this time'],
          confidence: conf('high', 'id-linked date arithmetic; the verified event either exists or it does not.'),
          meta: { key: w.id, winId: w.id },
          prefill: { winId: w.id, title: w.title, metric: w.metric, verifyDate: w.verifyDate, announcedTo: w.announcedTo } }));
      });
      return out;
    } },

    { id: 'R12', run: function (ctx) {                /* incident staleness */
      var out = [];
      EV().openIncidents(ctxState(ctx)).forEach(function (x) {
        var d = days(x.updatedTs, ctx.today);
        if (d == null || d < DOCTRINE.INC_STALE_DAYS) return;
        var base = x.severity === 'high' ? 72 : x.severity === 'low' ? 50 : 60;
        out.push(fin({ ruleId: 'R12', personId: x.personId || undefined, severity: Math.min(82, base + Math.min(10, d - DOCTRINE.INC_STALE_DAYS)),
          title: 'Incident "' + x.label + '" has had no update in ' + d + 'd',
          action: 'Close it or move it — log an incident update with what changed. Incidents that go quiet teach the team that reporting changes nothing.',
          basis: ['registered: ' + String(x.ts).slice(0, 10) + ' · last touch: ' + String(x.updatedTs).slice(0, 10),
            'open incidents either get incident.update / incident.resolved events, or they age — this one is ' + d + 'd old',
            'severity as registered: ' + (x.severity || 'unset')],
          confidence: conf('high', 'event arithmetic on the incident\'s own update stream.'),
          meta: { key: x.id, incidentId: x.id, evidenceIds: [x.id] },
          capture: 'incident.update' }));
      });
      return out;
    } }
  ];

  function ctxState(ctx) { return ctx._state; }      /* state carried for projections */

  /* ---- engine memory: suppression is data, not a setting ---- */
  function memoryMap(state, today) {
    var mem = {};
    (state.events || []).forEach(function (e) {
      if (!e.data || !e.data.key) return;
      var k = e.data.key, m = mem[k] = mem[k] || {};
      if (e.type === 'engine.snooze') { if (!m.snooze || String(e.ts) > String(m.snooze.ts)) m.snooze = e; }
      if (e.type === 'engine.dismiss') { if (!m.dismiss || String(e.ts) > String(m.dismiss.ts)) m.dismiss = e; }
      if (e.type === 'engine.unmute') { if (!m.unmute || String(e.ts) > String(m.unmute.ts)) m.unmute = e; }
    });
    var out = {};
    Object.keys(mem).forEach(function (k) {
      var m = mem[k];
      var dismissed = m.dismiss && (!m.unmute || String(m.dismiss.ts) > String(m.unmute.ts));
      var snoozed = m.snooze && m.snooze.data.until && days(today, m.snooze.data.until) != null &&
        days(today, m.snooze.data.until) > 0 &&
        (!m.unmute || String(m.snooze.ts) > String(m.unmute.ts));
      if (dismissed) out[k] = 'dismissed';
      else if (snoozed) out[k] = 'snoozed until ' + m.snooze.data.until;
    });
    return out;
  }

  function ranked(state, todayISO) {
    var ctx = buildCtx(state, todayISO);
    ctx._state = state;
    var all = [];
    RULES.forEach(function (r) {
      try {
        var got = r.run(ctx) || [];
        got.forEach(function (f) { f._err || all.push(f); });
      } catch (err) {
        all.push(fin({ ruleId: 'RX', severity: 40,
          title: 'Rule ' + r.id + ' failed to evaluate',
          action: 'The engine refused to guess. This row exists so a broken rule is loud, not silent.',
          basis: ['error: ' + (err && err.message), 'no other findings from ' + r.id + ' were emitted'],
          confidence: conf('high', 'the exception was caught at the rule boundary.'),
          meta: { key: 'rx-' + r.id } }));
      }
    });
    var mem = memoryMap(state, todayISO);
    var items = [], muted = [];
    all.forEach(function (f) { (mem[f.key] ? muted : items).push(f); });
    muted.forEach(function (f) { f.mutedAs = mem[f.key]; });
    items.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.severity !== a.severity) return b.severity - a.severity;
      return a.title < b.title ? -1 : 1;
    });
    return { items: items, muted: muted, today: todayISO };
  }

  /* ---- golden fixtures: the contract, executed live at #/health ---- */
  var ANCHOR = '2026-01-15';
  function ago(n) { return new Date(Date.UTC(2026, 0, 15) - n * 86400000).toISOString(); }
  function agoD(n) { return ago(n).slice(0, 10); }
  function plusD(n) { return new Date(Date.UTC(2026, 0, 15) + n * 86400000).toISOString().slice(0, 10); }
  function mk() { return S.fresh(); }
  function person(st, name, cad, reportsTo, archived) {
    var p = { id: S.newId('p'), name: name, role: 'lead', cadenceDays: cad || 7,
      reportsTo: reportsTo === undefined ? 'me' : reportsTo,
      createdAt: ago(50), archived: !!archived, seed: false };
    st.people.push(p); return p;
  }
  function ev(st, type, o) {
    o = o || {};
    var e = { id: S.newId('e'), ts: o.ts || ago(1), type: type,
      personId: o.personId || null, data: o.data || {}, seed: false };
    st.events.push(e); return e;
  }
  function find(r, ruleId, personId) {
    return r.items.filter(function (f) {
      return f.ruleId === ruleId && (personId === undefined || f.personId === personId);
    });
  }

  var GOLDENS = [
    { id: 'G1', name: 'R1 fires when no 1:1 ever logged', run: function () {
      var st = mk(), a = person(st, 'Ana', 7);
      var f = find(ranked(st, ANCHOR), 'R1', a.id);
      return { pass: f.length === 1 && f[0].meta.never === true && f[0].severity === 70,
        observed: f.length ? f[0].title + ' · sev ' + f[0].severity : 'no finding' };
    } },
    { id: 'G2', name: 'R1 strictly past cadence (7d silent, 8d fires)', run: function () {
      var st = mk(), a = person(st, 'Ana', 7), b = person(st, 'Boris', 7);
      ev(st, 'oneonone.logged', { personId: a.id, ts: ago(7) });
      ev(st, 'oneonone.logged', { personId: b.id, ts: ago(8) });
      var r = ranked(st, ANCHOR);
      return { pass: find(r, 'R1', a.id).length === 0 && find(r, 'R1', b.id).length === 1,
        observed: 'Ana@7d: ' + find(r, 'R1', a.id).length + ' findings · Boris@8d: ' + find(r, 'R1', b.id).length };
    } },
    { id: 'G3', name: 'R2 past review without outcome; resolved is silent', run: function () {
      var st = mk();
      ev(st, 'decision.logged', { ts: ago(10), data: { title: 'open', reviewDate: agoD(3) } });
      var d2 = ev(st, 'decision.logged', { ts: ago(9), data: { title: 'closed', reviewDate: agoD(4) } });
      ev(st, 'decision.outcome', { ts: ago(2), data: { decisionId: d2.id, outcome: 'right' } });
      var r = ranked(st, ANCHOR);
      var f = r.items.filter(function (x) { return x.ruleId === 'R2'; });
      return { pass: f.length === 1 && /open/.test(f[0].title) && f[0].meta.pastDays === 3,
        observed: f.map(function (x) { return x.title; }).join(' | ') || 'none' };
    } },
    { id: 'G4', name: 'R3 ownerless fires; stale fires; fresh progress silent', run: function () {
      var st = mk(), a = person(st, 'Ana', 7);
      ev(st, 'goal.set', { ts: ago(2), data: { title: 'ownerless' } });
      ev(st, 'goal.set', { ts: ago(21), data: { title: 'stale', ownerPersonId: a.id } });
      var g3 = ev(st, 'goal.set', { ts: ago(21), data: { title: 'fresh', ownerPersonId: a.id } });
      ev(st, 'goal.progress', { ts: ago(1), data: { goalId: g3.id, note: 'moving' } });
      var f = ranked(st, ANCHOR).items.filter(function (x) { return x.ruleId === 'R3'; });
      return { pass: f.length === 2 && /ownerless/.test(f.map(function (x) { return x.title; }).join()) &&
        /stale/.test(f.map(function (x) { return x.title; }).join()) && !/fresh/.test(f.map(function (x) { return x.title; }).join()),
        observed: f.map(function (x) { return x.title; }).join(' | ') || 'none' };
    } },
    { id: 'G5', name: 'R4 ≥80% corrective at n=3; below min-count silent', run: function () {
      var st = mk(), a = person(st, 'Ana', 7), b = person(st, 'Boris', 7);
      [10, 7, 4].forEach(function (d) { ev(st, 'feedback.logged', { personId: a.id, ts: ago(d), data: { polarity: 'corrective' } }); });
      [9, 5].forEach(function (d) { ev(st, 'feedback.logged', { personId: b.id, ts: ago(d), data: { polarity: 'corrective' } }); });
      var r = ranked(st, ANCHOR);
      return { pass: find(r, 'R4', a.id).length === 1 && find(r, 'R4', b.id).length === 0,
        observed: 'Ana(n=3): ' + find(r, 'R4', a.id).length + ' · Boris(n=2): ' + find(r, 'R4', b.id).length };
    } },
    { id: 'G6', name: 'R5 fires at 5 open delegations, silent at 4', run: function () {
      var st = mk(), a = person(st, 'Ana', 7), b = person(st, 'Boris', 7), i;
      for (i = 0; i < 5; i++) ev(st, 'delegation.assigned', { personId: a.id, ts: ago(i + 1), data: { title: 'A' + i } });
      for (i = 0; i < 4; i++) ev(st, 'delegation.assigned', { personId: b.id, ts: ago(i + 1), data: { title: 'B' + i } });
      var r = ranked(st, ANCHOR);
      return { pass: find(r, 'R5', a.id).length === 1 && find(r, 'R5', b.id).length === 0,
        observed: 'Ana(5): ' + find(r, 'R5', a.id).length + ' · Boris(4): ' + find(r, 'R5', b.id).length };
    } },
    { id: 'G7', name: 'R6 two unresolved in 90d; resolved excluded', run: function () {
      var st = mk(), a = person(st, 'Ana', 7), b = person(st, 'Boris', 7);
      ev(st, 'conflict.registered', { personId: a.id, ts: ago(30), data: { counterpart: 'X' } });
      ev(st, 'conflict.registered', { personId: a.id, ts: ago(10), data: { counterpart: 'X' } });
      var c1 = ev(st, 'conflict.registered', { personId: b.id, ts: ago(30), data: { counterpart: 'Y' } });
      ev(st, 'conflict.registered', { personId: b.id, ts: ago(20), data: { counterpart: 'Z' } });
      ev(st, 'conflict.resolved', { ts: ago(5), data: { conflictId: c1.id, how: 'talked' } });
      var r = ranked(st, ANCHOR);
      return { pass: find(r, 'R6', a.id).length === 1 && find(r, 'R6', b.id).length === 0,
        observed: 'Ana(2 open): ' + find(r, 'R6', a.id).length + ' · Boris(1 open): ' + find(r, 'R6', b.id).length };
    } },
    { id: 'G8', name: 'R7 mean load ≥8 on measured; estimated-only silent', run: function () {
      var st = mk(), a = person(st, 'Ana', 7), b = person(st, 'Boris', 7);
      [9, 6, 3].forEach(function (d) { ev(st, 'pulse.logged', { personId: a.id, ts: ago(d), data: { mood: 5, load: 9, estimated: false } }); });
      [9, 6, 3].forEach(function (d) { ev(st, 'pulse.logged', { personId: b.id, ts: ago(d), data: { mood: 5, load: 10, estimated: true } }); });
      var r = ranked(st, ANCHOR);
      return { pass: find(r, 'R7', a.id).length === 1 && find(r, 'R7', b.id).length === 0,
        observed: 'Ana(measured): ' + find(r, 'R7', a.id).length + ' · Boris(estimated): ' + find(r, 'R7', b.id).length };
    } },
    { id: 'G9', name: 'R7 negative mood slope 8→5→2 at low load', run: function () {
      var st = mk(), a = person(st, 'Ana', 7);
      var moods = [8, 5, 2], dd = [9, 6, 3];
      dd.forEach(function (d, i) { ev(st, 'pulse.logged', { personId: a.id, ts: ago(d), data: { mood: moods[i], load: 4, estimated: false } }); });
      var f = find(ranked(st, ANCHOR), 'R7', a.id);
      return { pass: f.length === 1 && /slope/.test(f[0].basis[0]),
        observed: f.length ? f[0].basis[0] : 'no finding' };
    } },
    { id: 'G10', name: 'R8 skip overdue at 29d; broken line silent', run: function () {
      var st = mk();
      var lead = person(st, 'Lead', 7); var skip = person(st, 'Skip', 14, lead.id);
      var ghost = person(st, 'Ghost', 14, 'p-nonexistent');
      ev(st, 'oneonone.logged', { personId: skip.id, ts: ago(29) });
      var r = ranked(st, ANCHOR);
      return { pass: find(r, 'R8', skip.id).length === 1 && find(r, 'R8', ghost.id).length === 0,
        observed: 'Skip(29d): ' + find(r, 'R8', skip.id).length + ' · Ghost(broken line): ' + find(r, 'R8', ghost.id).length };
    } },
    { id: 'G11', name: 'engine memory: snooze hides, unmute restores', run: function () {
      var st = mk(), a = person(st, 'Ana', 7);
      var key = 'R1:' + a.id;
      ev(st, 'engine.snooze', { ts: ago(1), data: { key: key, until: plusD(5) } });
      var r1 = ranked(st, ANCHOR);
      var snoozed = r1.items.length === 0 && r1.muted.length === 1;
      ev(st, 'engine.unmute', { ts: ago(0), data: { key: key } });
      var r2 = ranked(st, ANCHOR);
      return { pass: snoozed && r2.items.length === 1 && r2.muted.length === 0,
        observed: 'snoozed: items=' + r1.items.length + ' muted=' + r1.muted.length +
          ' → after unmute: items=' + r2.items.length + ' muted=' + r2.muted.length };
    } },
    { id: 'G12', name: 'score math printed and correct (70 × 1.00 = 70)', run: function () {
      var st = mk(), a = person(st, 'Ana', 7);
      var f = find(ranked(st, ANCHOR), 'R1', a.id)[0];
      return { pass: !!f && f.score === 70 && f.breakdown === 'sev 70 × conf 1.00 = 70',
        observed: f ? f.breakdown : 'no finding' };
    } },
    { id: 'G13', name: 'R9 day-14 gate: day 20 fires, captured is silent', run: function () {
      var st = mk();
      st.meta.appointment = { startDate: agoD(20), scope: 'step-up', notes: '' };
      var r1 = ranked(st, ANCHOR);
      ev(st, 'expectation.logged', { ts: ago(1), data: { source: 'boss', items: ['ship atlas'] } });
      var r2 = ranked(st, ANCHOR);
      var f1 = find(r1, 'R9');
      return { pass: f1.length === 1 && f1[0].meta.day === 20 && find(r2, 'R9').length === 0,
        observed: 'before: ' + (f1[0] ? f1[0].title : 'none') + ' · after logging: ' + find(r2, 'R9').length + ' findings' };
    } },
    { id: 'G14', name: 'R10 coverage 1/3 names the missing 2; full tour silent', run: function () {
      var st = mk();
      st.meta.appointment = { startDate: agoD(30), scope: 'step-up', notes: '' };
      var a = person(st, 'Ana', 7), b = person(st, 'Boris', 7), c = person(st, 'Chen', 14);
      ev(st, 'expectation.logged', { ts: ago(10), data: { items: ['x'] } });
      ev(st, 'tour.visit', { personId: a.id, ts: ago(20), data: { mode: 'lead' } });
      var r1 = ranked(st, ANCHOR); var f1 = find(r1, 'R10');
      ev(st, 'tour.visit', { personId: b.id, ts: ago(9), data: { mode: 'lead' } });
      ev(st, 'tour.visit', { personId: c.id, ts: ago(8), data: { mode: 'lead' } });
      var r2 = ranked(st, ANCHOR);
      var names = f1.length ? (f1[0].basis[1] || '') : '';
      return { pass: f1.length === 1 && /67%/.test(f1[0].basis[0]) === false && f1[0].title.indexOf('33%') > -1 &&
          /Boris/.test(names) && /Chen/.test(names) && find(r2, 'R10').length === 0,
        observed: f1.length ? f1[0].title + ' → after full tour: ' + find(r2, 'R10').length : 'no finding' };
    } },
    { id: 'G15', name: 'R11 verify-date gate: past fires, verified silent', run: function () {
      var st = mk();
      st.meta.appointment = { startDate: agoD(30), scope: 'step-up', notes: '' };
      ev(st, 'expectation.logged', { ts: ago(10), data: { items: ['x'] } });
      var w = ev(st, 'earlywin.committed', { ts: ago(12), data: { title: 'meeting cull', metric: 'hours≤5', verifyDate: agoD(5) } });
      ev(st, 'earlywin.committed', { ts: ago(6), data: { title: 'future win', metric: 'x', verifyDate: plusD(5) } });
      var r1 = ranked(st, ANCHOR); var f1 = r1.items.filter(function (x) { return x.ruleId === 'R11'; });
      ev(st, 'earlywin.verified', { ts: ago(1), data: { winId: w.id, outcome: 'hit' } });
      var r2 = ranked(st, ANCHOR);
      return { pass: f1.length === 1 && /meeting cull/.test(f1[0].title) &&
          r2.items.filter(function (x) { return x.ruleId === 'R11'; }).length === 0,
        observed: 'before: ' + f1.length + ' (' + (f1[0] ? f1[0].title : 'none') + ') · after: ' +
          r2.items.filter(function (x) { return x.ruleId === 'R11'; }).length };
    } },
    { id: 'G16', name: 'R12 stale incident at 8d; resolved silent', run: function () {
      var st = mk();
      ev(st, 'incident.registered', { ts: ago(8), data: { title: 'stale one', severity: 'high' } });
      var i2 = ev(st, 'incident.registered', { ts: ago(9), data: { title: 'closed one', severity: 'high' } });
      ev(st, 'incident.resolved', { ts: ago(2), data: { incidentId: i2.id } });
      var f = ranked(st, ANCHOR).items.filter(function (x) { return x.ruleId === 'R12'; });
      return { pass: f.length === 1 && /stale one/.test(f[0].title),
        observed: f.map(function (x) { return x.title; }).join(' | ') || 'none' };
    } }
  ];

  function runGoldens() {
    return GOLDENS.map(function (g) {
      try { var r = g.run(); return { id: g.id, name: g.name, pass: !!r.pass, observed: r.observed }; }
      catch (e) { return { id: g.id, name: g.name, pass: false, observed: 'THREW: ' + e.message }; }
    });
  }

  return {
    DOCTRINE: DOCTRINE, RULE_TAGS: RULE_TAGS,
    ranked: ranked, keyOf: keyOf, days: days, slope: slope,
    runGoldens: runGoldens, _buildCtx: buildCtx, _memoryMap: memoryMap
  };
})();
