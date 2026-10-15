/* LeadOS mf-2 · js/engine.js — rules engine. Pure: (state, todayISO) → findings.
   Every finding carries: what (title + action), why (basis lines from triggering
   data + evidenceIds of the exact events), confidence (level + why), and a printed
   score derivation: score = severity × confidence-factor (high 1.0 / medium 0.8 /
   low 0.6). The engine never states certainty it does not have: trends need ≥3
   measured points; estimated pulses are excluded; missing fields skip rather
   than infer; unknown reporting lines skip rather than guess.
   Engine memory: engine.snooze / engine.dismiss / engine.unmute are EVENTS, so
   suppression is auditable, exportable, and reversible. Latest unmute beats
   latest dismiss; snooze lapses on its own.
   Golden fixtures G1–G12 are the contract, executed live at #/health. */
window.LEADOS = window.LEADOS || {};
LEADOS.engine = (function () {
  'use strict';

  var DOCTRINE = {
    GOAL_STALL_DAYS: 14,     /* silence on a goal past this = visible */
    FB_WINDOW_DAYS: 60,      /* feedback balance window */
    FB_MIN_COUNT: 3,         /* fewer feedback events = not a pattern */
    DL_OPEN_MAX: 4,          /* open delegations per person past this = loaded */
    CF_WINDOW_DAYS: 90,      /* conflict recurrence window */
    CF_MIN: 2,               /* unresolved conflicts to call it a pattern */
    PULSE_WINDOW_DAYS: 21,   /* overload signal window */
    LOAD_HIGH: 8,            /* mean load ≥ this (of 10) = high */
    MIN_POINTS: 3,           /* never trend on fewer measured points */
    SKIP_CADENCE_DAYS: 28,   /* skip-level 1:1 cadence */
    SNOOZE_DAYS: 7           /* default snooze horizon */
  };
  var CONF_FACTOR = { high: 1.0, medium: 0.8, low: 0.6 };
  var RULE_TAGS = {
    R1: '1:1 cadence', R2: 'decision review', R3: 'goal health', R4: 'feedback balance',
    R5: 'delegation load', R6: 'conflict pattern', R7: 'overload signals', R8: 'skip-level'
  };
  var RULE_PLAYBOOK = { R1: 'oneonone', R2: 'decision', R3: 'goal', R4: 'sbi', R5: 'delegation', R6: 'desc', R7: 'oneonone', R8: 'oneonone' };

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
  function within(iso, today, win) { var d = days(iso, today); return d != null && d >= 0 && d <= win; }
  function num(x) { var n = Number(x); return isFinite(n) ? n : null; }
  function slope(vals) {
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
    var f = CONF_FACTOR[o.confidence.level] || 0.6;
    o.score = Math.round(o.severity * f);
    o.breakdown = 'sev ' + o.severity + ' × conf ' + f.toFixed(2) + ' = ' + o.score;
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
      /* reporting line: 'me' or a person id. undefined reportsTo (v1 data) = 'me'. */
      lineToMe: function (pid) {
        var chain = [], cur = this.byPid[pid], guard = 0;
        if (!cur) return null;
        while (cur && guard++ < 20) {
          var rt = cur.reportsTo === undefined ? 'me' : cur.reportsTo;
          if (rt === 'me') return chain.concat(['me']);
          var next = this.byPid[rt];
          if (!next || next.archived) return null;          /* broken line: engine says nothing */
          chain.push(next.id); cur = next;
        }
        return null;
      }
    };
  }

  var RULES = [
    { id: 'R1', run: function (ctx) {                    /* 1:1 cadence overdue (direct reports) */
      var out = [];
      ctx.people.forEach(function (p) {
        var line = ctx.lineToMe(p.id);
        var isDirect = !!(line && line.length === 1);    /* ['me'] = no lead between us */
        if (!isDirect) return;                           /* skip-levels are R8's job */
        var cad = num(p.cadenceDays) || 7;
        var last = ctx.lastEvent('oneonone.logged', p.id);
        if (!last) {
          out.push(fin({ ruleId: 'R1', personId: p.id, severity: 70,
            title: 'No 1:1 ever logged with ' + ctx.name(p.id),
            action: 'Book the first one now — a lead without a cadence flies on hallway signal.',
            basis: ['oneonone.logged events for this person: 0', 'cadence setting: ' + cad + 'd'],
            confidence: conf('high', 'absence of events is a hard fact of the store, not an inference.'),
            meta: { never: true, evidenceIds: [] } }));
          return;
        }
        var d = days(last.ts, ctx.today);
        if (d == null || d <= cad) return;               /* fires strictly past cadence (G2) */
        var sev = Math.min(90, 60 + 2 * (d - cad));
        out.push(fin({ ruleId: 'R1', personId: p.id, severity: sev,
          title: '1:1 with ' + ctx.name(p.id) + ' is ' + (d - cad) + 'd overdue',
          action: 'Book it inside 48h. Come with their blockers, not your agenda — see the 1:1 run sheet.',
          basis: ['last logged 1:1: ' + String(last.ts).slice(0, 10) + ' (' + d + 'd ago)',
            'cadence setting: ' + cad + 'd — fires strictly when days > cadence',
            last.data && last.data.note ? 'last session note: ' + last.data.note : 'last session has no note'],
          confidence: conf('high', 'pure date arithmetic on your logged events and your cadence setting.'),
          meta: { overdue: d - cad, lastTs: last.ts, evidenceIds: [last.id] } }));
      });
      return out;
    } },

    { id: 'R2', run: function (ctx) {                    /* decisions past review, no outcome */
      var out = [];
      var resolved = {};
      ctx.events.forEach(function (e) {
        if (e.type === 'decision.outcome' && e.data && e.data.decisionId) resolved[e.data.decisionId] = true;
      });
      ctx.events.forEach(function (e) {
        if (e.type !== 'decision.logged' || resolved[e.id]) return;
        var rd = e.data && e.data.reviewDate, d = dayUTC(rd) == null ? null : days(rd, ctx.today);
        if (d == null || d < 0) return;                  /* review date in future or absent */
        out.push(fin({ ruleId: 'R2', severity: 80,
          title: 'Decision "' + ((e.data && e.data.title) || 'untitled') + '" is ' + d + 'd past its review date',
          action: 'Close the loop: was the call right? Log the outcome — decision quality is your only calibration data.',
          basis: ['decided: ' + String(e.ts).slice(0, 10) + ' · review date: ' + rd,
            'decision.outcome events linked to it: 0'],
          confidence: conf('high', 'review date you set yourself has passed; absence of outcome is a store fact.'),
          meta: { key: 'd:' + e.id, decisionId: e.id, daysLate: d, evidenceIds: [e.id] } }));
      });
      return out;
    } },

    { id: 'R3', run: function (ctx) {                    /* goals: ownerless or stalled */
      var out = [], owners = {}, titles = {}, lastProg = {}, goalTs = {};
      ctx.events.forEach(function (e) {
        if (e.type === 'goal.set') {
          titles[e.id] = (e.data && e.data.title) || 'untitled goal';
          owners[e.id] = (e.data && e.data.ownerPersonId) || null;
          goalTs[e.id] = e.ts; lastProg[e.id] = e.ts;    /* set date anchors staleness too */
        } else if (e.type === 'goal.assign' && e.data && e.data.goalId && titles[e.data.goalId] !== undefined) {
          owners[e.data.goalId] = e.data.ownerPersonId || null;
        } else if (e.type === 'goal.progress' && e.data && e.data.goalId && titles[e.data.goalId] !== undefined) {
          if (String(e.ts) > String(lastProg[e.data.goalId])) lastProg[e.data.goalId] = e.ts;
        }
      });
      Object.keys(titles).forEach(function (id) {
        if (!owners[id]) {
          out.push(fin({ ruleId: 'R3', severity: 85,
            title: 'Goal "' + titles[id] + '" has no owner',
            action: 'Unowned goals do not fail loudly, they fade. Name one accountable owner or kill it in the open.',
            basis: ['set: ' + String(goalTs[id]).slice(0, 10), 'ownerPersonId: null (goal.assign events: none matched)'],
            confidence: conf('high', 'ownership is an explicit field; it is empty.'),
            meta: { key: 'g:' + id, kind: 'owner', goalId: id, evidenceIds: [id] } }));
          return;
        }
        var stall = days(lastProg[id], ctx.today);
        if (stall == null || stall <= DOCTRINE.GOAL_STALL_DAYS) return;
        var pid = owners[id], sev = Math.min(75, 55 + (stall - DOCTRINE.GOAL_STALL_DAYS));
        out.push(fin({ ruleId: 'R3', personId: pid, severity: sev,
          title: 'Goal "' + titles[id] + '" silent for ' + stall + 'd',
          action: 'Ask ' + ctx.name(pid) + ' for one line of truth: blocked, on track, or quietly dropped? Log the answer.',
          basis: ['owner: ' + ctx.name(pid), 'last goal.progress (or set): ' + String(lastProg[id]).slice(0, 10) + ' (' + stall + 'd ago)',
            'stall threshold: ' + DOCTRINE.GOAL_STALL_DAYS + 'd'],
          confidence: conf('medium', 'staleness assumes progress is logged when it happens — verify before escalating.'),
          meta: { key: 'g:' + id, kind: 'stalled', goalId: id, stall: stall, evidenceIds: [id] } }));
      });
      return out;
    } },

    { id: 'R4', run: function (ctx) {                    /* feedback imbalance */
      var out = [];
      ctx.people.forEach(function (p) {
        var rows = ctx.events.filter(function (e) {
          return e.type === 'feedback.logged' && e.personId === p.id && within(e.ts, ctx.today, DOCTRINE.FB_WINDOW_DAYS) &&
            e.data && (e.data.polarity === 'corrective' || e.data.polarity === 'positive');
        });
        if (rows.length < DOCTRINE.FB_MIN_COUNT) return; /* not a pattern — engine stays quiet */
        var corr = rows.filter(function (e) { return e.data.polarity === 'corrective'; }).length;
        var pos = rows.length - corr;
        var share = corr / rows.length;
        if (share >= 0.8 && share <= 0.2) return;        /* unreachable guard; real branches below */
        var onlyCorr = share >= 0.8, onlyPos = share <= 0.2;
        if (!onlyCorr && !onlyPos) return;
        out.push(fin({ ruleId: 'R4', personId: p.id, severity: Math.min(75, 45 + 5 * rows.length),
          title: onlyCorr
            ? 'Feedback to ' + ctx.name(p.id) + ' is ' + corr + '/' + rows.length + ' corrective'
            : 'Feedback to ' + ctx.name(p.id) + ' is ' + pos + '/' + rows.length + ' positive — none corrective',
          action: onlyCorr
            ? 'That balance reads as surveillance, not coaching. Catch them doing something right this week — specifically, with SBI.'
            : 'Pure praise is comfort, not leadership. One honest corrective SBI raises the bar without burning trust.',
          basis: ['feedback.logged in ' + DOCTRINE.FB_WINDOW_DAYS + 'd window: ' + rows.length + ' (min for a pattern: ' + DOCTRINE.FB_MIN_COUNT + ')',
            'corrective: ' + corr + ' · positive: ' + pos,
            'imbalance declared at ≥80% share either way'],
          confidence: conf('medium', 'this measures what you logged, not what you said. If your real ratio differs, the log is lying — fix the log.'),
          meta: { polarity: onlyCorr ? 'corrective-heavy' : 'positive-only', n: rows.length,
            evidenceIds: rows.map(function (e) { return e.id; }) } }));
      });
      return out;
    } },

    { id: 'R5', run: function (ctx) {                    /* delegation load */
      var out = [], closed = {};
      ctx.events.forEach(function (e) {
        if (e.type === 'delegation.closed' && e.data && e.data.delegationId) closed[e.data.delegationId] = true;
      });
      ctx.people.forEach(function (p) {
        var open = ctx.events.filter(function (e) {
          return e.type === 'delegation.assigned' && e.personId === p.id && !closed[e.id];
        });
        if (open.length <= DOCTRINE.DL_OPEN_MAX) return;
        out.push(fin({ ruleId: 'R5', personId: p.id, severity: Math.min(90, 70 + 5 * (open.length - DOCTRINE.DL_OPEN_MAX)),
          title: ctx.name(p.id) + ' holds ' + open.length + ' open delegations',
          action: 'Beyond ' + DOCTRINE.DL_OPEN_MAX + ', you are not delegating, you are burying. Close, downgrade a level, or re-home one item.',
          basis: ['open delegations: ' + open.length + ' (watch line: ' + DOCTRINE.DL_OPEN_MAX + ')',
            'open set recomputed from events on this read — nothing cached',
            'levels: ' + open.map(function (e) { return 'L' + (e.data && e.data.level || '?'); }).join(' ')],
          confidence: conf('high', 'open/closed state is derived live from assignment and closure events only.'),
          meta: { open: open.length, evidenceIds: open.map(function (e) { return e.id; }) } }));
      });
      return out;
    } },

    { id: 'R6', run: function (ctx) {                    /* repeated unresolved conflict */
      var out = [], resolved = {};
      ctx.events.forEach(function (e) {
        if (e.type === 'conflict.resolved' && e.data && e.data.conflictId) resolved[e.data.conflictId] = true;
      });
      ctx.people.forEach(function (p) {
        var open = ctx.events.filter(function (e) {
          return e.type === 'conflict.registered' && e.personId === p.id && !resolved[e.id] &&
            within(e.ts, ctx.today, DOCTRINE.CF_WINDOW_DAYS);
        });
        if (open.length < DOCTRINE.CF_MIN) return;
        out.push(fin({ ruleId: 'R6', personId: p.id, severity: 90,
          title: open.length + ' unresolved conflicts around ' + ctx.name(p.id) + ' in ' + DOCTRINE.CF_WINDOW_DAYS + 'd',
          action: 'A pattern, not an incident. Direct conversation with the counterpart; if it involves you, run the DESC structure.',
          basis: open.map(function (c) {
            return String(c.ts).slice(0, 10) + (c.data && c.data.counterpart ? ' vs ' + c.data.counterpart : '') +
              (c.data && c.data.note ? ' — ' + c.data.note : '');
          }).concat(['no conflict.resolved event linked to any of them']),
          confidence: conf('medium', 'counts registered-but-unresolved conflicts; it sees only conflicts someone logged.'),
          meta: { unresolved: open.length, counterpart: open[0].data && open[0].data.counterpart,
            evidenceIds: open.map(function (e) { return e.id; }) } }));
      });
      return out;
    } },

    { id: 'R7', run: function (ctx) {                    /* overload: measured pulses only */
      var out = [];
      ctx.people.forEach(function (p) {
        var pulses = ctx.events.filter(function (e) {
          return e.type === 'pulse.logged' && e.personId === p.id && within(e.ts, ctx.today, DOCTRINE.PULSE_WINDOW_DAYS);
        });
        var measured = pulses.filter(function (e) { return !(e.data && e.data.estimated); });
        var excluded = pulses.length - measured.length;
        if (measured.length < DOCTRINE.MIN_POINTS) return;
        var loads = measured.map(function (e) { return num(e.data && e.data.load); });
        var moods = measured.map(function (e) { return num(e.data && e.data.mood); });
        var lvals = loads.filter(function (v) { return v != null; });
        var loadAvg = lvals.length ? lvals.reduce(function (a, b) { return a + b; }, 0) / lvals.length : null;
        var ms = slope(moods);
        var loadHigh = loadAvg != null && loadAvg >= DOCTRINE.LOAD_HIGH;
        var moodDown = ms != null && ms < 0;
        if (!loadHigh && !moodDown) return;
        var both = loadHigh && moodDown;
        out.push(fin({ ruleId: 'R7', personId: p.id, severity: both ? 100 : 40,
          title: both ? ('Overload signals aligning for ' + ctx.name(p.id)) : ('Partial overload signal for ' + ctx.name(p.id)),
          action: both
            ? 'Cut load before you coach: reassign one concrete item this week, then watch the next two pulses.'
            : 'One signal only — do not act on it. Log the next pulse on schedule and re-check.',
          basis: ['measured pulses in ' + DOCTRINE.PULSE_WINDOW_DAYS + 'd: ' + measured.length +
              (excluded ? ' (' + excluded + ' estimated excluded)' : ''),
            'mean load ' + (loadAvg == null ? 'n/a' : loadAvg.toFixed(1) + '/10') + ' — high at ≥' + DOCTRINE.LOAD_HIGH,
            'mood slope ' + (ms == null ? 'n/a (<3 measured)' : ms.toFixed(2) + '/reading')],
          confidence: both
            ? conf('medium', 'two independent signals align (load + mood trend). A signal, not a diagnosis.')
            : conf('low', 'only one of the two signals is present; the other is absent or flat.'),
          meta: { signals: both ? 'both' : (loadHigh ? 'load-only' : 'mood-only'),
            evidenceIds: measured.map(function (e) { return e.id; }) } }));
      });
      return out;
    } },

    { id: 'R8', run: function (ctx) {                    /* skip-level 1:1 overdue */
      var out = [];
      ctx.people.forEach(function (p) {
        var line = ctx.lineToMe(p.id);
        if (!line || line.length !== 2) return;          /* exactly one lead between me and them */
        var via = line[0];
        var cad = DOCTRINE.SKIP_CADENCE_DAYS;
        var last = ctx.lastEvent('oneonone.logged', p.id);
        if (!last) {
          out.push(fin({ ruleId: 'R8', personId: p.id, severity: 65,
            title: 'No skip-level ever logged with ' + ctx.name(p.id),
            action: 'You inherit their reality through ' + ctx.name(via) + '’s filter only. 30 minutes, three questions: what slows you down, what should I know, what would you change?',
            basis: ['reporting line: me → ' + ctx.name(via) + ' → ' + ctx.name(p.id),
              'oneonone.logged for this person: 0 (any kind)', 'skip cadence doctrine: ' + cad + 'd'],
            confidence: conf('low', 'built from roster reporting lines — verify the line is current before acting on it.'),
            meta: { never: true, via: via, evidenceIds: [] } }));
          return;
        }
        var d = days(last.ts, ctx.today);
        if (d == null || d <= cad) return;
        out.push(fin({ ruleId: 'R8', personId: p.id, severity: Math.min(75, 50 + 2 * (d - cad)),
          title: 'Skip-level with ' + ctx.name(p.id) + ' is ' + (d - cad) + 'd overdue',
          action: 'Their lead gets your time; they get your silence. Book the skip-level before the org learns that.',
          basis: ['reporting line: me → ' + ctx.name(via) + ' → ' + ctx.name(p.id),
            'last 1:1 logged: ' + String(last.ts).slice(0, 10) + ' (' + d + 'd ago, cadence ' + cad + 'd)'],
          confidence: conf('medium', 'date math is hard; the reporting line is only as fresh as your roster.'),
          meta: { overdue: d - cad, via: via, evidenceIds: [last.id] } }));
      });
      return out;
    } }
  ];

  /* engine memory: latest unmute beats latest dismiss; snooze lapses naturally */
  function suppression(ctx) {
    var dismissed = {}, snoozed = {}, i, ev;
    for (i = 0; i < ctx.events.length; i++) {
      ev = ctx.events[i];
      if (ev.type === 'engine.dismiss' && ev.data && ev.data.key) dismissed[ev.data.key] = ev;
      else if (ev.type === 'engine.unmute' && ev.data && ev.data.key) {
        if (dismissed[ev.data.key] && String(ev.ts) > String(dismissed[ev.data.key].ts)) delete dismissed[ev.data.key];
      }
      else if (ev.type === 'engine.snooze' && ev.data && ev.data.key) {
        if (!snoozed[ev.data.key] || String(ev.data.until) > String(snoozed[ev.data.key])) snoozed[ev.data.key] = ev.data.until;
      }
    }
    return { dismissed: dismissed, snoozed: snoozed };
  }

  function run(state, todayISO) {
    var today = todayISO || new Date().toISOString().slice(0, 10);
    var ctx = buildCtx(state || {}, today);
    var findings = [], byRule = {};
    RULES.forEach(function (r) {
      var got = [];
      try { got = r.run(ctx) || []; }
      catch (e) { got = [fin({ ruleId: r.id, severity: 1, title: 'Rule ' + r.id + ' failed to evaluate: ' + String(e && e.message),
        action: 'Fix the data; the engine refuses to guess.', confidence: conf('low', 'rule threw an exception — output shown for debugging only.'),
        basis: ['engine self-check caught an exception'], meta: { error: true } })]; }
      byRule[r.id] = got.length;
      findings = findings.concat(got);
    });
    var sup = suppression(ctx), out = [], snz = [], mut = [];
    findings.forEach(function (f) {
      var k = keyOf(f); f.key = k;
      if (sup.dismissed[k]) { f.mutedReason = sup.dismissed[k].data && sup.dismissed[k].data.reason; mut.push(f); }
      else if (sup.snoozed[k] && dayUTC(sup.snoozed[k]) != null && dayUTC(sup.snoozed[k]) >= dayUTC(today)) { f.snoozedUntil = sup.snoozed[k]; snz.push(f); }
      else out.push(f);
    });
    out.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      var ap = a.personId || '', bp = b.personId || '';
      return ap < bp ? -1 : ap > bp ? 1 : (a.ruleId < b.ruleId ? -1 : 1);   /* deterministic, printed */
    });
    return { findings: out, snoozed: snz, muted: mut, byRule: byRule, today: today };
  }

  /* ---------------- golden fixtures: the contract, run live ---------------- */
  function mkP(id, opts) {
    opts = opts || {};
    return { id: id, name: opts.name || id, role: 'x', cadenceDays: opts.cad || 7,
      reportsTo: opts.reportsTo === undefined ? 'me' : opts.reportsTo, archived: !!opts.arch, seed: false, createdAt: '2026-01-01T00:00:00.000Z' };
  }
  function mkE(id, type, ts, pid, data) { return { id: id, type: type, ts: ts, personId: pid || null, data: data || {}, seed: false }; }
  function rel(day, minus) { return new Date(Date.parse(day + 'T00:00:00.000Z') - minus * 86400000).toISOString(); }
  var GTODAY = '2026-03-01';

  var GOLD = [
    { id: 'G1', name: 'R1 fires strictly past cadence: 9d ago, cadence 7 → 2d overdue, high confidence', fn: function () {
      var st = { people: [mkP('a1')], events: [mkE('x', 'oneonone.logged', rel(GTODAY, 9), 'a1')] };
      var f = run(st, GTODAY).findings;
      var hit = f.filter(function (x) { return x.ruleId === 'R1' && x.personId === 'a1'; })[0];
      return { pass: !!hit && hit.meta.overdue === 2 && hit.confidence.level === 'high' && /sev 64 × conf 1\.00 = 64/.test(hit.breakdown),
        detail: hit ? 'overdue=' + hit.meta.overdue + ' · ' + hit.breakdown : 'no R1 finding' };
    } },
    { id: 'G2', name: 'R1 boundary: exactly 7d ago with cadence 7 → silence (fires only when > cadence)', fn: function () {
      var st = { people: [mkP('a1')], events: [mkE('x', 'oneonone.logged', rel(GTODAY, 7), 'a1')] };
      var f = run(st, GTODAY).findings.filter(function (x) { return x.ruleId === 'R1'; });
      return { pass: f.length === 0, detail: 'R1 findings=' + f.length };
    } },
    { id: 'G3', name: 'R2: decision 2d past review fires; linked outcome before today silences it', fn: function () {
      var st = { people: [], events: [mkE('d1', 'decision.logged', rel(GTODAY, 20), null, { title: 'T', reviewDate: rel(GTODAY, 2).slice(0, 10) })] };
      var n1 = run(st, GTODAY).findings.filter(function (x) { return x.ruleId === 'R2'; }).length;
      st.events.push(mkE('o1', 'decision.outcome', rel(GTODAY, 1), null, { decisionId: 'd1', outcome: 'as expected' }));
      var n2 = run(st, GTODAY).findings.filter(function (x) { return x.ruleId === 'R2'; }).length;
      return { pass: n1 === 1 && n2 === 0, detail: 'before outcome=' + n1 + ', after=' + n2 };
    } },
    { id: 'G4', name: 'R3: ownerless goal fires (kind=owner); stalled 20d fires (kind=stalled); fresh progress silent', fn: function () {
      var st = { people: [mkP('a1')], events: [
        mkE('g1', 'goal.set', rel(GTODAY, 30), null, { title: 'G1', ownerPersonId: null }),
        mkE('g2', 'goal.set', rel(GTODAY, 30), null, { title: 'G2', ownerPersonId: 'a1' }),
        mkE('g3', 'goal.set', rel(GTODAY, 30), null, { title: 'G3', ownerPersonId: 'a1' }),
        mkE('x', 'goal.progress', rel(GTODAY, 5), null, { goalId: 'g3', note: 'moving' }) ] };
      var f = run(st, GTODAY).findings.filter(function (x) { return x.ruleId === 'R3'; });
      var kinds = f.map(function (x) { return x.meta.kind + ':' + (x.meta.goalId || ''); }).sort().join(' ');
      return { pass: f.length === 2 && kinds.indexOf('owner:g1') >= 0 && kinds.indexOf('stalled:g2') >= 0,
        detail: f.length + ' findings → ' + kinds };
    } },
    { id: 'G5', name: 'R4: 3 corrective/0 positive in 60d → imbalance; 2 events → engine stays quiet (not a pattern)', fn: function () {
      var st = { people: [mkP('a1')], events: [
        mkE('f1', 'feedback.logged', rel(GTODAY, 50), 'a1', { polarity: 'corrective' }),
        mkE('f2', 'feedback.logged', rel(GTODAY, 30), 'a1', { polarity: 'corrective' }),
        mkE('f3', 'feedback.logged', rel(GTODAY, 10), 'a1', { polarity: 'corrective' }) ] };
      var n1 = run(st, GTODAY).findings.filter(function (x) { return x.ruleId === 'R4'; }).length;
      st.events.pop();
      var n2 = run(st, GTODAY).findings.filter(function (x) { return x.ruleId === 'R4'; }).length;
      return { pass: n1 === 1 && n2 === 0, detail: '3 events→' + n1 + ', 2 events→' + n2 };
    } },
    { id: 'G6', name: 'R5: 5 open delegations fire; closing one to reach 4 silences the rule', fn: function () {
      var evs = [], i;
      for (i = 1; i <= 5; i++) evs.push(mkE('dl' + i, 'delegation.assigned', rel(GTODAY, 10 + i), 'a1', { title: 't' + i, level: 3 }));
      var st = { people: [mkP('a1')], events: evs };
      var n1 = run(st, GTODAY).findings.filter(function (x) { return x.ruleId === 'R5'; })[0];
      st.events.push(mkE('c1', 'delegation.closed', rel(GTODAY, 1), 'a1', { delegationId: 'dl1' }));
      var n2 = run(st, GTODAY).findings.filter(function (x) { return x.ruleId === 'R5'; }).length;
      return { pass: !!n1 && n1.meta.open === 5 && n2 === 0, detail: 'open=' + (n1 && n1.meta.open) + ', after close=' + n2 };
    } },
    { id: 'G7', name: 'R6: 2 unresolved conflicts in 90d fire; resolving one drops below pattern', fn: function () {
      var st = { people: [mkP('a1')], events: [
        mkE('cf1', 'conflict.registered', rel(GTODAY, 40), 'a1', { counterpart: 'X' }),
        mkE('cf2', 'conflict.registered', rel(GTODAY, 20), 'a1', { counterpart: 'X' }) ] };
      var n1 = run(st, GTODAY).findings.filter(function (x) { return x.ruleId === 'R6' && x.personId === 'a1'; }).length;
      st.events.push(mkE('r1', 'conflict.resolved', rel(GTODAY, 1), 'a1', { conflictId: 'cf1' }));
      var n2 = run(st, GTODAY).findings.filter(function (x) { return x.ruleId === 'R6' && x.personId === 'a1'; }).length;
      return { pass: n1 === 1 && n2 === 0, detail: 'open 2→' + n1 + ', after resolve→' + n2 };
    } },
    { id: 'G8', name: 'R7: 3 measured pulses (load≥8, mood slope<0) fire severe; estimated excluded; 2 measured → quiet', fn: function () {
      var st = { people: [mkP('a1')], events: [
        mkE('p1', 'pulse.logged', rel(GTODAY, 15), 'a1', { mood: 6, load: 9 }),
        mkE('p2', 'pulse.logged', rel(GTODAY, 8), 'a1', { mood: 5, load: 9 }),
        mkE('p3', 'pulse.logged', rel(GTODAY, 1), 'a1', { mood: 4, load: 8 }),
        mkE('p4', 'pulse.logged', rel(GTODAY, 2), 'a1', { mood: 10, load: 1, estimated: true }) ] };
      var hit = run(st, GTODAY).findings.filter(function (x) { return x.ruleId === 'R7'; })[0];
      st.events = st.events.slice(0, 2);
      var n2 = run(st, GTODAY).findings.filter(function (x) { return x.ruleId === 'R7'; }).length;
      return { pass: !!hit && hit.meta.signals === 'both' && hit.basis.join(' ').indexOf('1 estimated excluded') >= 0 && n2 === 0,
        detail: hit ? 'signals=' + hit.meta.signals + ' · sparse re-run=' + n2 : 'no R7 finding' };
    } },
    { id: 'G9', name: 'malformed rows (garbage ts, string numbers, ghost personId, null name) never crash the engine', fn: function () {
      var st = { people: [mkP('a1', { name: null }), { id: 'b2', name: 'ghost-holder', cadenceDays: 'abc', reportsTo: null }],
        events: [ mkE('z1', 'pulse.logged', 'garbage', 'ghost', { mood: '5', load: 'x' }),
          mkE('z2', 'oneonone.logged', undefined, 'a1', null),
          mkE('z3', 'goal.set', rel(GTODAY, 3), null, { title: 42, ownerPersonId: 'ghost' }) ] };
      var threw = false, f = [];
      try { f = run(st, GTODAY).findings; } catch (e) { threw = true; }
      var sane = f.every(function (x) { return Array.isArray(x.basis) && typeof x.score === 'number' && isFinite(x.score); });
      return { pass: !threw && sane, detail: 'threw=' + threw + ', findings=' + f.length + ', allScored=' + sane };
    } },
    { id: 'G10', name: 'R8: me→lead→skip, no 1:1 → low-confidence finding; archiving the middle lead breaks the line → silence', fn: function () {
      var st = { people: [mkP('lead1'), mkP('skip1', { reportsTo: 'lead1' })], events: [] };
      var hit = run(st, GTODAY).findings.filter(function (x) { return x.ruleId === 'R8' && x.personId === 'skip1'; })[0];
      st.people[0].archived = true;
      var n2 = run(st, GTODAY).findings.filter(function (x) { return x.ruleId === 'R8' && x.personId === 'skip1'; }).length;
      return { pass: !!hit && hit.confidence.level === 'low' && n2 === 0,
        detail: hit ? 'conf=' + hit.confidence.level + ' · broken-line re-run=' + n2 : 'no R8 finding' };
    } },
    { id: 'G11', name: 'engine memory: snooze suppresses until date; dismiss mutes; later unmute restores', fn: function () {
      var st = { people: [mkP('a1')], events: [mkE('x', 'oneonone.logged', rel(GTODAY, 20), 'a1')] };
      var key = 'R1:a1';
      st.events.push(mkE('s1', 'engine.snooze', rel(GTODAY, 1), null, { ruleId: 'R1', key: key, until: '2026-03-05' }));
      var r1 = run(st, GTODAY);
      st.events.push(mkE('s2', 'engine.dismiss', rel(GTODAY, 1), null, { ruleId: 'R1', key: key, reason: 'golden' }));
      var r2 = run(st, GTODAY);
      st.events.push(mkE('s3', 'engine.unmute', GTODAY + 'T01:00:00.000Z', null, { key: key }));
      var r3 = run(st, GTODAY);
      var pass = r1.snoozed.length === 1 && r1.findings.length === 0 &&
        r2.muted.length === 1 && r2.findings.length === 0 &&
        r3.findings.length === 1 && r3.findings[0].ruleId === 'R1';
      return { pass: pass, detail: 'snoozed=' + r1.snoozed.length + '→muted=' + r2.muted.length + '→restored=' + r3.findings.length };
    } },
    { id: 'G12', name: 'ranking is printed math: R7-both (100×0.8=80) outranks R1-3d-overdue (66×1=66); every row shows derivation', fn: function () {
      var st = { people: [mkP('p7'), mkP('p1')], events: [
        mkE('q1', 'pulse.logged', rel(GTODAY, 15), 'p7', { mood: 6, load: 9 }),
        mkE('q2', 'pulse.logged', rel(GTODAY, 8), 'p7', { mood: 5, load: 9 }),
        mkE('q3', 'pulse.logged', rel(GTODAY, 1), 'p7', { mood: 4, load: 8 }),
        mkE('q4', 'oneonone.logged', rel(GTODAY, 10), 'p1') ] };
      var f = run(st, GTODAY).findings;
      var allBroken = f.every(function (x) { return /sev \d+ × conf \d\.\d+ = \d+/.test(x.breakdown); });
      return { pass: f.length >= 2 && f[0].ruleId === 'R7' && allBroken,
        detail: f.map(function (x) { return x.ruleId + '=' + x.score; }).join(' ') + (allBroken ? ' · all derivations printed' : ' · MISSING derivation') };
    } }
  ];

  function runGolden() {
    return GOLD.map(function (g) {
      var pass = false, detail = '';
      try { var r = g.fn(); pass = !!r.pass; detail = r.detail || ''; }
      catch (e) { detail = 'threw: ' + String(e && e.message || e); }
      return { id: g.id, name: g.name, pass: pass, detail: detail };
    });
  }

  return {
    DOCTRINE: DOCTRINE, CONF_FACTOR: CONF_FACTOR, RULE_TAGS: RULE_TAGS, RULE_PLAYBOOK: RULE_PLAYBOOK,
    RULES: RULES, run: run, runGolden: runGolden, keyOf: keyOf, _days: days, _slope: slope
  };
})();
