/* LeadOS mf-1 · js/engine.js — rules engine. Pure: (state, todayISO) → findings.
   Every finding carries: what (title+action), why (basis lines from triggering
   data), confidence (level + why). The engine never states certainty it does
   not have: trends need ≥3 measured points; estimated pulses are excluded;
   missing fields skip rather than infer. Golden fixtures G1–G9 below are the
   contract, executed live at #/health. */
window.LEADOS = window.LEADOS || {};
LEADOS.engine = (function () {
  'use strict';

  var DOCTRINE = {
    GOAL_STALL_DAYS: 14,     /* silence on a goal past this = visible */
    FB_WINDOW_DAYS: 60,      /* feedback balance window */
    FB_MIN_COUNT: 3,         /* fewer feedback events = not a pattern */
    DL_OPEN_MAX: 4,          /* open delegations per person past this = loaded */
    DL_WATCH_LEVEL: 4,       /* levels ≥4 with little oversight */
    CF_WINDOW_DAYS: 90,      /* conflict recurrence window */
    CF_MIN: 2,               /* unresolved conflicts to call it a pattern */
    PULSE_WINDOW_DAYS: 21,   /* overload signal window */
    LOAD_HIGH: 8,            /* mean load ≥ this = high */
    MIN_POINTS: 3            /* never trend on fewer measured points */
  };

  var RULE_TAGS = {
    R1: 'cadence', R2: 'decision review', R3: 'goal health', R4: 'feedback balance',
    R5: 'delegation load', R6: 'conflict pattern', R7: 'overload signals'
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
  function finding(o) { o.basis = o.basis || []; o.meta = o.meta || {}; return o; }

  function buildCtx(state, todayISO) {
    var people = (state.people || []).filter(function (p) { return p && !p.archived; });
    var events = (state.events || []).slice().sort(function (a, b) {
      return String(a.ts) < String(b.ts) ? -1 : 1;
    });
    var names = {};
    (state.people || []).forEach(function (p) { if (p) names[p.id] = p.name; });
    var ctx = {
      today: todayISO,
      people: people,
      events: events,
      name: function (pid) { return names[pid] || 'unknown person'; },
      lastEvent: function (type, pid) {
        var best = null;
        for (var i = 0; i < events.length; i++) {
          var e = events[i];
          if (e.type === type && (pid == null || e.personId === pid)) best = e;
        }
        return best;
      }
    };
    return ctx;
  }

  var RULES = [
    { id: 'R7', run: function (ctx) {                    /* overload: load trend + mood trend, measured only */
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
        var basis = ['measured pulses in ' + DOCTRINE.PULSE_WINDOW_DAYS + 'd: ' + measured.length +
          (excluded ? ' (' + excluded + ' estimated excluded)' : ''),
          'mean load ' + (loadAvg == null ? 'n/a' : loadAvg.toFixed(1) + '/10') + ' — threshold ' + DOCTRINE.LOAD_HIGH,
          'mood slope ' + (ms == null ? 'n/a (<3 points)' : ms.toFixed(2) + '/reading')];
        out.push(finding({
          ruleId: 'R7', personId: p.id, severe: both,
          score: both ? 100 : 40,
          title: both ? ('Overload signals aligning for ' + p.name) : ('Partial overload signal for ' + p.name),
          action: both
            ? 'Cut load before you coach: reassign one concrete item this week, then watch the next two pulses.'
            : 'One signal only — do not act on it. Log the next pulse on schedule and re-check.',
          basis: basis,
          confidence: both
            ? conf('medium', 'two independent signals align (load + mood trend). This is a signal, not a diagnosis.')
            : conf('low', 'only one of the two required signals is present; the other is absent or flat.'),
          meta: { signals: both ? 'both' : (loadHigh ? 'load-only' : 'mood-only'), loadAvg: loadAvg, moodSlope: ms, measured: measured.length, excluded: excluded }
        }));
      });
      return out;
    } },

    { id: 'R6', run: function (ctx) {                    /* repeated unresolved conflict */
      var out = [];
      var resolved = {};
      ctx.events.forEach(function (e) {
        if (e.type === 'conflict.resolved' && e.data && e.data.conflictId) resolved[e.data.conflictId] = true;
      });
      ctx.people.forEach(function (p) {
        var open = ctx.events.filter(function (e) {
          return e.type === 'conflict.registered' && e.personId === p.id && !resolved[e.id] &&
            within(e.ts, ctx.today, DOCTRINE.CF_WINDOW_DAYS);
        });
        if (open.length < DOCTRINE.CF_MIN) return;
        out.push(finding({
          ruleId: 'R6', personId: p.id, severe: true, score: 90,
          title: open.length + ' unresolved conflicts around ' + p.name + ' in ' + DOCTRINE.CF_WINDOW_DAYS + 'd',
          action: 'This is a pattern, not an incident. Book a direct conversation with the counterpart; if it involves you, use the DESC structure.',
          basis: open.map(function (c) {
            return String(c.ts).slice(0, 10) + (c.data && c.data.counterpart ? ' vs ' + c.data.counterpart : '') +
              (c.data && c.data.note ? ' — ' + c.data.note : '');
          }).concat(['no conflict.resolved events linked to any of them']),
          confidence: conf('medium', 'counts registered-but-unresolved conflicts; depends on conflicts being logged when they happen.'),
          meta: { unresolved: open.length }
        }));
      });
      return out;
    } },

    { id: 'R1', run: function (ctx) {                    /* 1:1 cadence overdue */
      var out = [];
      ctx.people.forEach(function (p) {
        var cad = num(p.cadenceDays) || 7;
        var last = ctx.lastEvent('oneonone.logged', p.id);
        if (!last) {
          out.push(finding({
            ruleId: 'R1', personId: p.id, score: 70,
            title: 'No 1:1 ever logged with ' + p.name,
            action: 'Book the first one now — a lead without a cadence flies on hallway signal.',
            basis: ['on roster since ' + String(p.createdAt || '?').slice(0, 10), 'cadence ' + cad + 'd', 'oneonone.logged events: 0'],
            confidence: conf('medium', 'no measured 1:1 events exist yet, so "overdue" cannot be computed — absence is the finding.'),
            meta: { overdue: null }
          }));
          return;
        }
        var diff = days(last.ts, ctx.today);
        if (diff != null && diff > cad) {
          var over = diff - cad;
          out.push(finding({
            ruleId: 'R1', personId: p.id, score: 80 + Math.min(over, 30),
            title: '1:1 with ' + p.name + ' is ' + over + 'd overdue',
            action: 'Hold the 1:1 before any non-urgent work. Cadence debt compounds silently.',
            basis: ['last 1:1 ' + String(last.ts).slice(0, 10) + ' (' + diff + 'd ago)', 'cadence ' + cad + 'd', 'overdue ' + over + 'd'],
            confidence: conf('high', 'overdue computed from a measured oneonone.logged event and the person\u2019s own cadence.'),
            meta: { overdue: over }
          }));
        }
      });
      return out;
    } },

    { id: 'R2', run: function (ctx) {                    /* decision past review, no outcome */
      var out = [];
      var resolved = {};
      ctx.events.forEach(function (e) {
        if (e.type === 'decision.outcome' && e.data && e.data.decisionId) resolved[e.data.decisionId] = true;
      });
      ctx.events.forEach(function (e) {
        if (e.type !== 'decision.logged' || resolved[e.id]) return;
        var rd = e.data && e.data.reviewDate;
        if (!rd) return;                                   /* cannot assert without a date — skip, never infer */
        var late = days(rd, ctx.today);
        if (late == null || late <= 0) return;
        out.push(finding({
          ruleId: 'R2', score: 70 + Math.min(late, 20),
          title: 'Decision "' + ((e.data && e.data.title) || 'untitled') + '" is ' + late + 'd past review with no outcome',
          action: 'Close the loop: log shipped / abandoned / deferred and one sentence of why. Unreviewed decisions teach the team that reviews are optional.',
          basis: ['review date ' + rd, 'days past review ' + late, 'decision.outcome events linked: 0'],
          confidence: conf('high', 'an explicit review date passed with no linked outcome event.'),
          meta: { late: late, decisionId: e.id }
        }));
      });
      return out;
    } },

    { id: 'R3', run: function (ctx) {                    /* goals: ownerless / stalled */
      var out = [];
      var assigns = {};
      ctx.events.forEach(function (e) {
        if (e.type === 'goal.assign' && e.data && e.data.goalId) assigns[e.data.goalId] = e.data.ownerPersonId || null;
      });
      var lastProgress = {};
      ctx.events.forEach(function (e) {
        if (e.type === 'goal.progress' && e.data && e.data.goalId) lastProgress[e.data.goalId] = e;
      });
      ctx.events.forEach(function (e) {
        if (e.type !== 'goal.set') return;
        var title = (e.data && e.data.title) || 'untitled goal';
        var owner = (e.data && e.data.ownerPersonId !== undefined) ? e.data.ownerPersonId : null;
        if (assigns[e.id] !== undefined) owner = assigns[e.id];
        if (owner == null) {
          out.push(finding({
            ruleId: 'R3', score: 55,
            title: 'Goal "' + title + '" has no owner',
            action: 'Assign exactly one named owner or kill the goal. Shared ownership is no ownership.',
            basis: ['goal.set ' + String(e.ts).slice(0, 10), 'ownerPersonId: empty', 'goal.assign events: ' + (assigns[e.id] !== undefined ? 1 : 0)],
            confidence: conf('high', 'the owner field is empty and no goal.assign event overrides it.'),
            meta: { kind: 'owner', goalId: e.id }
          }));
        }
        var lp = lastProgress[e.id];
        var silence = days(lp ? lp.ts : e.ts, ctx.today);
        if (silence != null && silence > DOCTRINE.GOAL_STALL_DAYS) {
          out.push(finding({
            ruleId: 'R3', personId: owner || undefined, score: 65,
            title: 'Goal "' + title + '" stalled — ' + silence + 'd without progress',
            action: lp
              ? 'Ask the owner for a one-line status in the next 1:1; stale-by-silence is how goals die invisibly.'
              : 'No progress has ever been logged. Get a first measurable checkpoint or decommit.',
            basis: ['set ' + String(e.ts).slice(0, 10), lp ? ('last progress ' + String(lp.ts).slice(0, 10)) : 'progress events: 0',
              'stall threshold ' + DOCTRINE.GOAL_STALL_DAYS + 'd', 'owner ' + (owner ? ctx.name(owner) : 'none')],
            confidence: lp
              ? conf('medium', 'stall computed from the last logged progress; progress may have happened unlogged.')
              : conf('medium', 'no progress events exist at all; if progress is tracked elsewhere, log it here.'),
            meta: { kind: 'stall', goalId: e.id, silence: silence }
          }));
        }
      });
      return out;
    } },

    { id: 'R5', run: function (ctx) {                    /* delegation load per person */
      var out = [];
      var closed = {};
      ctx.events.forEach(function (e) {
        if (e.type === 'delegation.closed' && e.data && e.data.delegationId) closed[e.data.delegationId] = true;
      });
      ctx.people.forEach(function (p) {
        var openD = ctx.events.filter(function (e) {
          return e.type === 'delegation.assigned' && e.personId === p.id && !closed[e.id];
        });
        if (openD.length <= DOCTRINE.DL_OPEN_MAX) return;
        var maxLevel = 0;
        openD.forEach(function (d) { var l = num(d.data && d.data.level); if (l != null && l > maxLevel) maxLevel = l; });
        out.push(finding({
          ruleId: 'R5', personId: p.id, score: 60 + openD.length,
          title: p.name + ' carries ' + openD.length + ' open delegations (watch line: ' + DOCTRINE.DL_OPEN_MAX + ')',
          action: 'De-load, not motivate: close or reassign the lowest-value item, and schedule a check-in on anything at level ' + DOCTRINE.DL_WATCH_LEVEL + '+.',
          basis: openD.slice(0, 3).map(function (d) {
            return '· ' + ((d.data && d.data.title) || 'untitled') + ' (L' + ((d.data && d.data.level) || '?') + ', ' + String(d.ts).slice(0, 10) + ')';
          }).concat([openD.length > 3 ? '…and ' + (openD.length - 3) + ' more' : '—', 'max delegation level open: L' + maxLevel]),
          confidence: conf('high', 'derived mechanically from delegation.assigned minus delegation.closed events.'),
          meta: { open: openD.length, maxLevel: maxLevel }
        }));
      });
      return out;
    } },

    { id: 'R4', run: function (ctx) {                    /* feedback imbalance */
      var out = [];
      ctx.people.forEach(function (p) {
        var fb = ctx.events.filter(function (e) {
          return e.type === 'feedback.logged' && e.personId === p.id && within(e.ts, ctx.today, DOCTRINE.FB_WINDOW_DAYS);
        });
        var cor = 0, pos = 0;
        fb.forEach(function (e) {
          var pol = e.data && e.data.polarity;
          if (pol === 'corrective') cor++;
          else if (pol === 'positive') pos++;
        });
        var total = cor + pos;
        if (total < DOCTRINE.FB_MIN_COUNT) return;         /* too little data to call a pattern */
        if (cor > 0 && pos === 0) {
          out.push(finding({
            ruleId: 'R4', personId: p.id, score: 50,
            title: 'Feedback for ' + p.name + ' is ' + cor + ' corrective / 0 positive in ' + DOCTRINE.FB_WINDOW_DAYS + 'd',
            action: 'Find one real, specific positive and deliver it with SBI. Corrective-only feedback reads as bias and erodes the channel.',
            basis: ['corrective ' + cor + ' · positive ' + pos + ' · window ' + DOCTRINE.FB_WINDOW_DAYS + 'd', 'minimum count for a pattern: ' + DOCTRINE.FB_MIN_COUNT],
            confidence: total >= 5 ? conf('medium', 'five or more logged events, one polarity only.') : conf('low', 'just past the minimum count; an imbalance, not yet a habit.'),
            meta: { kind: 'only-corrective', corrective: cor, positive: pos }
          }));
        } else if (pos > 0 && cor === 0) {
          out.push(finding({
            ruleId: 'R4', personId: p.id, score: 50,
            title: 'Feedback for ' + p.name + ' is ' + pos + ' positive / 0 corrective in ' + DOCTRINE.FB_WINDOW_DAYS + 'd',
            action: 'Withholding corrective feedback is kind to you, not to them. Prepare one corrective SBI for the next 1:1.',
            basis: ['positive ' + pos + ' · corrective ' + cor + ' · window ' + DOCTRINE.FB_WINDOW_DAYS + 'd', 'minimum count for a pattern: ' + DOCTRINE.FB_MIN_COUNT],
            confidence: total >= 5 ? conf('medium', 'five or more logged events, one polarity only.') : conf('low', 'just past the minimum count; an imbalance, not yet a habit.'),
            meta: { kind: 'only-positive', corrective: cor, positive: pos }
          }));
        }
      });
      return out;
    } }
  ];

  function run(state, todayISO) {
    var ctx = buildCtx(state, todayISO || new Date().toISOString());
    var out = [];
    RULES.forEach(function (r) {
      try { out = out.concat(r.run(ctx)); }
      catch (e) {
        out.push(finding({
          ruleId: r.id, score: 1, title: 'Rule ' + r.id + ' failed to evaluate',
          action: 'This is a defect — check #/health.', basis: [String(e)],
          confidence: conf('low', 'the rule threw an exception; output may be incomplete.')
        }));
      }
    });
    out.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.ruleId < b.ruleId ? -1 : 1;
    });
    return out;
  }

  /* ---------- golden fixtures: the contract, executed at #/health ---------- */
  /* captured fixture ids — declared BEFORE the GOLDEN array so the array
     literal can assign them during construction (a later `var x = null`
     statement would wipe the captured values — defect caught pre-delivery). */
  var GOLDEN_G2_DEC = null, GOLDEN_G3_G3 = null, GOLDEN_G3_G4 = null, GOLDEN_G9_GOAL = null;
  var GT = '2026-03-01';
  function back(n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(GT);
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - n * 86400000).toISOString();
  }
  var gseq = 0;
  function gP(id, name, cad) { return { id: id, name: name, role: 'fixture', cadenceDays: cad, createdAt: '2026-01-01T00:00:00.000Z', archived: false }; }
  function gE(ts, type, pid, data) { gseq++; return { id: 'gx-' + gseq, ts: ts, type: type, personId: pid || null, data: data || {} }; }
  function has(fs, ruleId, pid, where) {
    return fs.some(function (f) {
      if (f.ruleId !== ruleId) return false;
      if (pid !== undefined && f.personId !== pid) return false;
      if (where && !where(f)) return false;
      return true;
    });
  }

  var GOLDEN = [
    { id: 'G1', name: 'R1 fires with exact overdue on measured 1:1 (10d vs 7d cadence)',
      people: [gP('A', 'Fixture Ana', 7)],
      events: [gE(back(10), 'oneonone.logged', 'A')],
      expect: function (fs) { return has(fs, 'R1', 'A', function (f) { return f.meta.overdue === 3; }) && !has(fs, 'R1', 'A', function (f) { return f.meta.overdue === null; }); } },

    { id: 'G2', name: 'R2 fires 1d past review without outcome; resolved & future decisions silent',
      people: [],
      events: [
        gE(back(30), 'decision.logged', null, { title: 'late one', reviewDate: back(1).slice(0, 10) }),
        (function () { var d = gE(back(30), 'decision.logged', null, { title: 'closed one', reviewDate: back(1).slice(0, 10) });
          GOLDEN_G2_DEC = d.id; return d; })(),
        gE(back(5), 'decision.logged', null, { title: 'future one', reviewDate: '2026-03-10' })
      ],
      expect: function (fs) {
        return has(fs, 'R2', undefined, function (f) { return f.meta.late === 1 && f.title.indexOf('late one') >= 0; }) &&
          !has(fs, 'R2', undefined, function (f) { return f.meta.decisionId === GOLDEN_G2_DEC || f.title.indexOf('future one') >= 0; });
      },
      extraEvents: function () { return [gE(back(2), 'decision.outcome', null, { decisionId: GOLDEN_G2_DEC, outcome: 'shipped' })]; } },

    { id: 'G3', name: 'R3: ownerless fires, 20d-silent owned goal stalls, assigned owner clears, fresh goal silent',
      people: [gP('C', 'Fixture Chen', 14)],
      events: (function () {
        var g1 = gE(back(20), 'goal.set', null, { title: 'no owner', ownerPersonId: null });
        var g2 = gE(back(30), 'goal.set', null, { title: 'stalled', ownerPersonId: 'C' });
        var g3 = gE(back(20), 'goal.set', null, { title: 'fixed owner', ownerPersonId: null });
        GOLDEN_G3_G3 = g3.id;
        var g4 = gE(back(5), 'goal.set', null, { title: 'fresh', ownerPersonId: 'C' });
        GOLDEN_G3_G4 = g4.id;
        return [g1, gE(back(19), 'goal.progress', null, { goalId: g1.id, note: 'x' }),
          g2, gE(back(20), 'goal.progress', null, { goalId: g2.id, note: 'y' }),
          g3, gE(back(2), 'goal.assign', null, { goalId: g3.id, ownerPersonId: 'C' }),
          g4, gE(back(1), 'goal.progress', null, { goalId: g4.id, note: 'z' })];
      })(),
      expect: function (fs) {
        return has(fs, 'R3', undefined, function (f) { return f.meta.kind === 'owner' && f.title.indexOf('no owner') >= 0; }) &&
          has(fs, 'R3', undefined, function (f) { return f.meta.kind === 'stall' && f.title.indexOf('stalled') >= 0 && f.meta.silence === 20; }) &&
          !has(fs, 'R3', undefined, function (f) { return f.meta.goalId === GOLDEN_G3_G3 || f.meta.goalId === GOLDEN_G3_G4; });
      } },

    { id: 'G4', name: 'R4: 3 corrective / 0 positive fires only-corrective; mixed person silent',
      people: [gP('B', 'Fixture Boris', 7), gP('C', 'Fixture Cyd', 7)],
      events: [
        gE(back(10), 'feedback.logged', 'B', { polarity: 'corrective' }),
        gE(back(20), 'feedback.logged', 'B', { polarity: 'corrective' }),
        gE(back(40), 'feedback.logged', 'B', { polarity: 'corrective' }),
        gE(back(10), 'feedback.logged', 'C', { polarity: 'corrective' }),
        gE(back(11), 'feedback.logged', 'C', { polarity: 'corrective' }),
        gE(back(12), 'feedback.logged', 'C', { polarity: 'positive' }),
        gE(back(13), 'feedback.logged', 'C', { polarity: 'positive' })
      ],
      expect: function (fs) {
        return has(fs, 'R4', 'B', function (f) { return f.meta.kind === 'only-corrective'; }) && !has(fs, 'R4', 'C');
      } },

    { id: 'G5', name: 'R5: 5 open delegations fire; exactly 4 (the watch line) stay silent',
      people: [gP('D', 'Fixture Dora', 7), gP('E', 'Fixture Eli', 7)],
      events: [1, 2, 3, 4, 5].map(function (i) { return gE(back(i * 5), 'delegation.assigned', 'D', { title: 't' + i, level: 3 }); })
        .concat([1, 2, 3, 4].map(function (i) { return gE(back(i * 5), 'delegation.assigned', 'E', { title: 'u' + i, level: 2 }); })),
      expect: function (fs) { return has(fs, 'R5', 'D', function (f) { return f.meta.open === 5; }) && !has(fs, 'R5', 'E'); } },

    { id: 'G6', name: 'R6: two conflicts in 90d unresolved fire; resolved ones do not count',
      people: [gP('F', 'Fixture Fay', 7), gP('H', 'Fixture Hal', 7)],
      events: (function () {
        var c1 = gE(back(10), 'conflict.registered', 'F', { counterpart: 'x' });
        var c2 = gE(back(20), 'conflict.registered', 'F', { counterpart: 'y' });
        var h1 = gE(back(10), 'conflict.registered', 'H', { counterpart: 'x' });
        var h2 = gE(back(20), 'conflict.registered', 'H', { counterpart: 'y' });
        return [c1, c2, h1, h2,
          gE(back(5), 'conflict.resolved', null, { conflictId: h1.id }),
          gE(back(4), 'conflict.resolved', null, { conflictId: h2.id })];
      })(),
      expect: function (fs) { return has(fs, 'R6', 'F', function (f) { return f.meta.unresolved === 2; }) && !has(fs, 'R6', 'H'); } },

    { id: 'G7', name: 'R7: high load + declining mood = medium both; flat mood = low load-only; <3 measured = silence; estimated excluded',
      people: [gP('I', 'Fixture Ida', 7), gP('J', 'Fixture Jo', 7), gP('K', 'Fixture Kim', 7)],
      events: [
        gE(back(9), 'pulse.logged', 'I', { mood: 7, load: 9 }),
        gE(back(5), 'pulse.logged', 'I', { mood: 6, load: 8 }),
        gE(back(1), 'pulse.logged', 'I', { mood: 5, load: 9 }),
        gE(back(3), 'pulse.logged', 'I', { mood: 10, load: 10, estimated: true }),
        gE(back(9), 'pulse.logged', 'J', { mood: 7, load: 9 }),
        gE(back(5), 'pulse.logged', 'J', { mood: 7, load: 9 }),
        gE(back(1), 'pulse.logged', 'J', { mood: 7, load: 9 }),
        gE(back(9), 'pulse.logged', 'K', { mood: 3, load: 9 }),
        gE(back(5), 'pulse.logged', 'K', { mood: 2, load: 9 })
      ],
      expect: function (fs) {
        return has(fs, 'R7', 'I', function (f) { return f.meta.signals === 'both' && f.confidence.level === 'medium' && f.meta.excluded === 1; }) &&
          has(fs, 'R7', 'J', function (f) { return f.meta.signals === 'load-only' && f.confidence.level === 'low'; }) &&
          !has(fs, 'R7', 'K');
      } },

    { id: 'G8', name: 'malformed data: null personId, string numbers, bad timestamps — engine does not throw, no findings',
      people: [{ id: 'L', name: 'Fixture Len', role: 'x', cadenceDays: 'not-a-number', createdAt: null, archived: false }],
      events: [
        { id: 'gm-1', ts: 'not-a-date', type: 'oneonone.logged', personId: 'L', data: null },
        { id: 'gm-2', ts: back(2), type: 'pulse.logged', personId: null, data: { mood: 'high', load: 'heavy' } },
        { id: 'gm-3', ts: back(2), type: 'feedback.logged', personId: 'L', data: {} },
        { id: 'gm-4', ts: undefined, type: 'decision.logged', personId: null, data: { title: null, reviewDate: '99/99' } }
      ],
      expect: function (fs) {
        return !fs.some(function (f) { return f.title.indexOf('failed to evaluate') >= 0; });
      } },

    { id: 'G9', name: 'boundaries: cadence exactly met, review exactly today, stall exactly 14d — none fire',
      people: [gP('M', 'Fixture Mo', 7)],
      events: (function () {
        /* the goal's id is its goal.set event id; the progress event MUST link
           it, else the goal reads 30d silent and this fixture fails for the
           wrong reason — defect caught pre-delivery. */
        var g = gE(back(30), 'goal.set', null, { title: 'on the line', ownerPersonId: 'M' });
        GOLDEN_G9_GOAL = g.id;
        return [
          gE(back(7), 'oneonone.logged', 'M'),
          gE(back(30), 'decision.logged', null, { title: 'due today', reviewDate: GT }),
          g,
          gE(back(14), 'goal.progress', null, { goalId: g.id, note: 'exactly at threshold' })
        ];
      })(),
      expect: function (fs) {
        return !has(fs, 'R1', 'M') &&
          !has(fs, 'R2', undefined, function (f) { return f.title.indexOf('due today') >= 0; }) &&
          !fs.some(function (f) { return f.meta && f.meta.goalId === GOLDEN_G9_GOAL; });
      } }
  ];
  function runGolden() {
    return GOLDEN.map(function (g) {
      var events = g.events;
      if (g.extraEvents) events = events.concat(g.extraEvents());
      var findings, err = null;
      try { findings = run({ people: g.people, events: events, log: [] }, GT); }
      catch (e) { err = e; findings = []; }
      var pass = false, detail = '';
      if (err) detail = 'engine threw: ' + String(err);
      else {
        try { pass = !!g.expect(findings); }
        catch (e) { detail = 'expectation threw: ' + String(e); }
        if (!detail) detail = 'findings: ' + (findings.length ? findings.map(function (f) { return f.ruleId; }).join(',') : '(none)');
      }
      return { id: g.id, name: g.name, pass: pass, detail: detail };
    });
  }

  return {
    DOCTRINE: DOCTRINE,
    RULE_TAGS: RULE_TAGS,
    run: run,
    runGolden: runGolden,
    days: days
  };
})();
