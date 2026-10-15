/* LeadOS mf-4 · js/engine.js — rules engine. Pure: (state, todayISO) → findings.
   Contract verified by mf-3 head read and carried: DOCTRINE, CONF_FACTOR
   (high 1.0 / medium 0.8 / low 0.6), printed score math sev × conf = score,
   fin()/keyOf(), buildCtx with lineToMe (broken line → engine silent, never
   guesses), R1/R2 logic, the snooze/dismiss/unmute-as-events doctrine.
   mf-4 ADDS: R6 rewritten per-person → PER PAIR (gap #1 from mf-3's own
   ranked list) · R13 conflict nexus · goldens re-authored G1–G18 (mf-3's
   tail with G1–G16 was unreadable here — marked unverified, re-authored).
   The engine never states certainty it doesn't have: trends need ≥3 measured
   points; estimated pulses excluded AND counted; missing fields skip. */
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
    CF_NEXUS_MIN: 3, CF_NEXUS_CPS: 2,
    PULSE_WINDOW_DAYS: 21, LOAD_HIGH: 8, MOOD_SLOPE_NEG: -0.4, MIN_POINTS: 3,
    SKIP_CADENCE_DAYS: 28,
    INC_STALE_DAYS: 7,
    ARR_EXPECT_DAYS: 14,
    ARR_TOUR_DAYS: 45,
    ARR_TOUR_GRACE: 7,
    SNOOZE_DAYS: 7
  };
  var CONF_FACTOR = { high: 1.0, medium: 0.8, low: 0.6 };
  var RULE_TAGS = {
    R1: '1:1 cadence', R2: 'decision review', R3: 'goal health', R4: 'feedback balance',
    R5: 'delegation load', R6: 'conflict pattern', R7: 'overload signals', R8: 'skip-level',
    R9: 'arrival · expectations', R10: 'arrival · listening tour',
    R11: 'arrival · early wins', R12: 'incident follow-up', R13: 'conflict nexus',
    ENG: 'engine integrity'
  };
  var RULE_PLAYBOOK = {
    R1: 'oneonone', R2: 'decision', R3: 'goal', R4: 'sbi', R5: 'delegation',
    R6: 'desc', R7: 'oneonone', R8: 'oneonone',
    R9: 'charter', R10: 'tour', R11: 'wincloser', R12: null, R13: 'oneonone'
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
    o.basis = o.basis || []; o.meta = o.meta || {};
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
      state: state, today: todayISO,
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

  function dt(iso) { return String(iso).slice(0, 10); }

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
          basis: ['last logged 1:1: ' + dt(last.ts) + ' (' + d + 'd ago)',
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
          basis: ['logged: ' + dt(e.ts), 'reviewDate: ' + rd + ' — past by ' + d + 'd', 'decision.outcome events referencing it: 0'],
          confidence: conf('high', 'the loop is open in your own store — unless you track outcomes elsewhere.'),
          meta: { key: e.id, decisionId: e.id, evidenceIds: [e.id] } }));
      });
      return out;
    } },

    { id: 'R3', run: function (ctx) {                 /* goals ownerless or silent >14d */
      var out = [];
      EV().openGoals(ctx.state).forEach(function (g) {
        var dSet = days(g.ts, ctx.today), dProg = days(g.lastProgressTs, ctx.today);
        var ownerless = !g.ownerPersonId;
        var silent = dProg != null && dProg > DOCTRINE.GOAL_STALL_DAYS;
        if (!ownerless && !silent) return;
        var why = [];
        if (ownerless) why.push('ownerPersonId: null — a goal with no name on it is a wish');
        if (silent) why.push('last goal.progress: ' + dProg + 'd ago (threshold ' + DOCTRINE.GOAL_STALL_DAYS + 'd)');
        why.push('set: ' + dt(g.ts) + (dSet != null ? ' (' + dSet + 'd ago)' : ''));
        out.push(fin({ ruleId: 'R3', severity: ownerless && silent ? 76 : ownerless ? 58 : Math.min(82, 50 + (dProg || 0)),
          personId: g.ownerPersonId || undefined,
          title: 'Goal "' + g.label + '" ' + (ownerless && silent ? 'has no owner and no signal' : ownerless ? 'has no owner' : 'has gone silent'),
          action: ownerless ? 'Put one name on it in the goal review — others can contribute, one person answers.'
                            : 'Open the goal review: log a progress line or kill the goal honestly. Both are forward motion.',
          basis: why,
          confidence: conf('high', 'ownership and progress are facts of the event stream; the 14d stall bar is a doctrine constant, printed.'),
          meta: { key: g.id, goalId: g.id, evidenceIds: [g.id] } }));
      });
      return out;
    } },

    { id: 'R4', run: function (ctx) {                 /* feedback imbalance (60d window) */
      var out = [];
      ctx.people.forEach(function (p) {
        var b = EV().feedbackBalance(ctx.state, p.id, DOCTRINE.FB_WINDOW_DAYS, ctx.today);
        if (b.total < DOCTRINE.FB_MIN_COUNT) return;
        var cor = b.corrective / b.total, pos = b.positive / b.total;
        var heavy = cor >= DOCTRINE.FB_IMBALANCE ? 'corrective' : pos >= DOCTRINE.FB_IMBALANCE ? 'positive' : null;
        if (!heavy) return;
        out.push(fin({ ruleId: 'R4', personId: p.id, severity: heavy === 'corrective' ? 72 : 52,
          title: 'Your feedback to ' + ctx.name(p.id) + ' is ' + (heavy === 'corrective' ? 'all corrective' : 'all positive'),
          action: heavy === 'corrective'
            ? 'A steady diet of correction reads as hostility even when each point is fair. Find one specific, real thing worth repeating and SBI it this week.'
            : 'Praise without correction is comfort, not leadership. If nothing is worth correcting, raise the bar — then say what "better" looks like, with SBI.',
          basis: ['window: ' + DOCTRINE.FB_WINDOW_DAYS + 'd · count: ' + b.total + ' (min ' + DOCTRINE.FB_MIN_COUNT + ')',
            'polarity: ' + b.corrective + ' corrective / ' + b.positive + ' positive = ' + Math.round((heavy === 'corrective' ? cor : pos) * 100) + '% ' + heavy,
            'imbalance threshold: ≥' + (DOCTRINE.FB_IMBALANCE * 100) + '%'],
          confidence: conf(b.total >= 6 ? 'high' : 'medium',
            b.total >= 6 ? 'six or more logged events is a real trend.'
                          : 'three-to-five events clears the bar, but small samples swing — the ratio is printed so you can judge.'),
          meta: { ratio: heavy === 'corrective' ? cor : pos, direction: heavy } }));
      });
      return out;
    } },

    { id: 'R5', run: function (ctx) {                 /* delegation load > 4 open per person */
      var out = [], per = {};
      EV().openDelegations(ctx.state).forEach(function (d) {
        if (!d.personId) return;
        (per[d.personId] = per[d.personId] || []).push(d);
      });
      Object.keys(per).forEach(function (pid) {
        var list = per[pid];
        if (list.length <= DOCTRINE.DL_OPEN_MAX) return;
        out.push(fin({ ruleId: 'R5', personId: pid, severity: Math.min(84, 50 + 4 * (list.length - DOCTRINE.DL_OPEN_MAX)),
          title: ctx.name(pid) + ' is holding ' + list.length + ' open delegations',
          action: 'More than ' + DOCTRINE.DL_OPEN_MAX + ' open loops on one person is how "I delegated it" becomes "it died quietly". Close, downgrade, or re-home at least one — the delegation playbook has the ladder.',
          basis: ['open delegations: ' + list.length + ' (doctrine max ' + DOCTRINE.DL_OPEN_MAX + '):',
            list.map(function (d) { return '  · "' + d.label + '" · level ' + (d.level || '?') + ' · since ' + dt(d.ts); }).join('\n')],
          confidence: conf('high', 'a straight count of open delegation.assigned events minus delegation.closed — printed above.'),
          meta: { count: list.length, evidenceIds: list.map(function (d) { return d.id; }) } }));
      });
      return out;
    } },

    { id: 'R6', run: function (ctx) {                 /* mf-4: repeated unresolved conflict PER PAIR */
      var out = [];
      EV().conflictPairs(ctx.state).forEach(function (pair) {
        var recent = pair.conflicts.filter(function (c) {
          var d = days(c.ts, ctx.today);
          return d != null && d <= DOCTRINE.CF_WINDOW_DAYS;
        });
        if (recent.length < DOCTRINE.CF_MIN) return;
        var first = recent[0];
        var label = EV().pairLabel(ctx.state, first);
        var textLinked = !!pair.linkKinds.text, idLinked = !!pair.linkKinds.id;
        out.push(fin({ ruleId: 'R6', severity: Math.min(78, 54 + 8 * recent.length),
          title: label + ' — ' + recent.length + ' unresolved conflicts in ' + DOCTRINE.CF_WINDOW_DAYS + 'd',
          action: 'Two open loops between the same two parties is not a coincidence, it is a relationship. Run DESC with both positions named — the playbook is pre-filled from these events.',
          basis: recent.map(function (c) {
              return dt(c.ts) + ' · ' + (c.summary || 'no summary logged') +
                (c.link.kind === 'id' ? ' · linked: ' + ctx.name(c.counterpartPersonId)
                 : c.link.kind === 'text' ? ' · unlinked text: "' + c.counterpartText + '"'
                 : ' · party: you');
            }).concat([
              'window: ' + DOCTRINE.CF_WINDOW_DAYS + 'd · count ' + recent.length + ' ≥ ' + DOCTRINE.CF_MIN + ' · all unresolved',
              textLinked ? 'some links are free text — spelling drift ("Dana" vs "dana k.") would read as DIFFERENT pairs' : 'both parties resolved to roster ids — no text matching involved'
            ]),
          confidence: conf(textLinked && !idLinked ? 'medium' : 'high',
            textLinked && !idLinked
              ? 'pair matched on free-text counterpart labels; a typo would split the pair and hide the pattern. Link counterparts to roster people in the capture bar.'
              : 'pairs are matched on roster ids — spelling drift cannot split them. Resolution state comes from your own conflict.resolved events.'),
          meta: { key: EV().pairKeyOf(first), pairKey: EV().pairKeyOf(first),
            persons: [first.personId, first.counterpartPersonId].filter(Boolean),
            evidenceIds: recent.map(function (c) { return c.id; }) } }));
      });
      return out;
    } },

    { id: 'R13', run: function (ctx) {                /* mf-4: conflict nexus — friction follows one person */
      var out = [];
      EV().conflictNexus(ctx.state).forEach(function (n) {
        if (n.open.length < DOCTRINE.CF_NEXUS_MIN || n.distinctCounterparts < DOCTRINE.CF_NEXUS_CPS) return;
        out.push(fin({ ruleId: 'R13', personId: n.personId, severity: Math.min(84, 60 + 4 * n.open.length),
          title: ctx.name(n.personId) + ' is the common factor in ' + n.open.length + ' open conflicts',
          action: 'Different counterparts, same person — the variable that explains the pattern is ' + ctx.name(n.personId) + '. This is a one-on-one conversation about the pattern, not another dispute at a time. The run sheet has a conflict-nexus mode.',
          basis: ['open conflicts involving them: ' + n.open.length + ' (nexus bar ≥ ' + DOCTRINE.CF_NEXUS_MIN + ')',
            'distinct resolvable counterparts: ' + n.distinctCounterparts + ' (bar ≥ ' + DOCTRINE.CF_NEXUS_CPS + ')' +
              (n.textLinked ? ' · +' + n.textLinked + ' text-linked conflict(s) NOT counted (spelling can\'t build a nexus case)' : ''),
            n.open.map(function (c) { return '  · ' + dt(c.ts) + ' — ' + (c.summary || 'no summary'); }).join('\n')],
          confidence: conf('medium',
            'a count of open loops, not a diagnosis. They may be the problem, the lightning rod, or the person honest enough to register friction others hide. Small numbers; judge before you act.'),
          meta: { count: n.open.length, evidenceIds: n.open.map(function (c) { return c.id; }) } }));
      });
      return out;
    } },

    { id: 'R7', run: function (ctx) {                 /* overload — measured pulses only */
      var out = [];
      ctx.people.forEach(function (p) {
        var m = EV().pulsesMeasured(ctx.state, p.id, DOCTRINE.PULSE_WINDOW_DAYS, ctx.today);
        var est = EV().pulsesEstimatedCount(ctx.state, p.id, DOCTRINE.PULSE_WINDOW_DAYS, ctx.today);
        if (m.length < DOCTRINE.MIN_POINTS) return;   /* <3 measured points → silence is honest */
        var loads = m.map(function (e) { return num(e.data && e.data.load); });
        var moods = m.map(function (e) { return num(e.data && e.data.mood); });
        var lsum = 0, ln = 0;
        loads.forEach(function (v) { if (v != null) { lsum += v; ln++; } });
        var meanLoad = ln ? lsum / ln : null;
        var mslope = slope(moods);
        var loadHigh = meanLoad != null && meanLoad >= DOCTRINE.LOAD_HIGH;
        var moodFalling = mslope != null && mslope <= DOCTRINE.MOOD_SLOPE_NEG;
        if (!loadHigh && !moodFalling) return;
        out.push(fin({ ruleId: 'R7', personId: p.id, severity: Math.min(85, 62 + (loadHigh ? 8 : 0) + (moodFalling ? 8 : 0)),
          title: ctx.name(p.id) + ' is running hot' + (loadHigh && moodFalling ? ' and going quiet' : ''),
          action: 'Arrive at the 1:1 with one concrete item to REMOVE, not questions about resilience. Coach after the load drops, not before.',
          basis: ['measured pulses in ' + DOCTRINE.PULSE_WINDOW_DAYS + 'd: ' + m.length + ' (min ' + DOCTRINE.MIN_POINTS + ')',
            'mean load: ' + (meanLoad != null ? meanLoad.toFixed(1) + '/10 (high bar ≥ ' + DOCTRINE.LOAD_HIGH + ')' : 'n/a'),
            'mood slope: ' + (mslope != null ? mslope.toFixed(2) + ' per reading (falling ≤ ' + DOCTRINE.MOOD_SLOPE_NEG + ')' : 'n/a'),
            'estimated readings excluded: ' + est + ' — numbers THEY said, not your read of their face'],
          confidence: conf(ln >= 5 ? 'high' : 'medium', 'built only from ' + m.length + ' spoken readings; ' + (ln >= 5 ? 'five-plus points is a trend.' : 'three points is the floor, not a verdict.')),
          meta: { meanLoad: meanLoad, moodSlope: mslope, evidenceIds: m.map(function (e) { return e.id; }) } }));
      });
      return out;
    } },

    { id: 'R8', run: function (ctx) {                 /* skip-level 1:1s, 28d cadence */
      var out = [];
      ctx.people.forEach(function (p) {
        var line = ctx.lineToMe(p.id);
        if (!(line && line.length === 2)) return;     /* exactly one lead between them and you */
        var via = line[0];
        var last = ctx.lastEvent('oneonone.logged', p.id);
        var d = last ? days(last.ts, ctx.today) : null;
        if (last && (d == null || d <= DOCTRINE.SKIP_CADENCE_DAYS)) return;
        out.push(fin({ ruleId: 'R8', personId: p.id, severity: Math.min(80, 55 + (last ? d - DOCTRINE.SKIP_CADENCE_DAYS : 8)),
          title: last ? 'Skip-level with ' + ctx.name(p.id) + ' is ' + (d - DOCTRINE.SKIP_CADENCE_DAYS) + 'd overdue'
                      : 'No skip-level ever logged with ' + ctx.name(p.id),
          action: 'You lead their lead (' + ctx.name(via) + ') — to ' + ctx.name(p.id) + ' you are a rumor unless you show up. Signal, not supervision: what slows you down · what should I know · what would you change.',
          basis: ['reporting line: you → ' + ctx.name(via) + ' → ' + ctx.name(p.id),
            'skip cadence: ' + DOCTRINE.SKIP_CADENCE_DAYS + 'd',
            last ? 'last logged session: ' + dt(last.ts) + ' (' + d + 'd ago)' : 'oneonone.logged events for this person: 0'],
          confidence: conf('high', 'date math on your events; a broken reporting line would have gone silent instead of guessing.'),
          meta: { via: via, evidenceIds: last ? [last.id] : [] } }));
      });
      return out;
    } },

    { id: 'R9', run: function (ctx) {                 /* boss expectations uncaptured by day 14 */
      var a = EV().arrival(ctx.state, ctx.today);
      if (!a.set) return [];
      if (a.dayN < DOCTRINE.ARR_EXPECT_DAYS) return [];
      if (a.expectations > 0) return [];
      return [fin({ ruleId: 'R9', severity: 66,
        title: 'Day ' + a.dayN + ' — your boss\'s expectations are still unwritten',
        action: 'You are being measured against criteria you have not captured. Book 45 minutes and run the expectations charter: what does "great in 6 months" look like, in their words, and what would they fire you for in 3?',
        basis: ['appointment start: ' + a.startDate + ' → day ' + a.dayN,
          'expectation.logged events: 0 (gate: day ' + DOCTRINE.ARR_EXPECT_DAYS + ')'],
        confidence: conf('high', 'absence of captured expectations is a store fact — the assumption is that you capture them here.'),
        meta: { key: 'expectations' } })];
    },

    { id: 'R10', run: function (ctx) {                /* listening-tour coverage vs live roster */
      var a = EV().arrival(ctx.state, ctx.today);
      if (!a.set) return [];
      if (a.dayN <= DOCTRINE.ARR_TOUR_GRACE) return [];   /* grace week: silence is honest */
      if (!a.tourTotal) return [];
      if (a.tourDone >= a.tourTotal) return [];
      var late = a.dayN >= DOCTRINE.ARR_TOUR_DAYS;
      return [fin({ ruleId: 'R10', severity: late ? 68 : 40,
        title: 'Listening tour: ' + a.tourDone + ' of ' + a.tourTotal + ' visited' + (late ? ' — past the day-' + DOCTRINE.ARR_TOUR_DAYS + ' gate' : ''),
        action: late ? 'You are changing a system you have not finished hearing. That is the classic new-leader error and your team can name it. Book the remaining visits this week.'
                     : 'Keep the pace: visits left are listed below. Unvisited people notice who you saw first.',
        basis: ['day ' + a.dayN + ' (grace: ' + DOCTRINE.ARR_TOUR_GRACE + 'd · gate: day ' + DOCTRINE.ARR_TOUR_DAYS + ')',
          'unvisited: ' + a.unvisited.map(function (p) { return p.name; }).join(', '),
          'coverage is measured against TODAY\'S roster — people who joined after your tour still count as owed'],
        confidence: conf('medium', 'visit coverage is a fact; "tour should be complete by day ' + DOCTRINE.ARR_TOUR_DAYS + '" is doctrine, and the roster moved since you started — both stated, not hidden.'),
        meta: { key: 'tour' } })];
    },

    { id: 'R11', run: function (ctx) {                /* early win past its verify date */
      var out = [];
      EV().openWins(ctx.state).forEach(function (w) {
        if (w.verified) return;
        var d = dayUTC(w.verifyDate) == null ? null : days(w.verifyDate, ctx.today);
        if (d == null || d < 0) return;
        out.push(fin({ ruleId: 'R11', severity: Math.min(86, 70 + d),
          title: 'Early win "' + w.label + '" is ' + d + 'd past its verify date',
          action: 'Same shape as an unreviewed decision, but this one was presented as progress — to your boss. Verify it with evidence, or walk it back while the walking is cheap.',
          basis: ['committed: ' + dt(w.ts), 'verifyDate: ' + w.verifyDate + ' — past by ' + d + 'd', 'earlywin.verified events referencing it: 0'],
          confidence: conf('high', 'the loop is open in your own store.'),
          meta: { key: w.id, winId: w.id, evidenceIds: [w.id] } }));
      });
      return out;
    } },

    { id: 'R12', run: function (ctx) {                /* incidents silent ≥7d */
      var out = [];
      EV().openIncidents(ctx.state).forEach(function (x) {
        var d = days(x.updatedTs, ctx.today);
        if (d == null || d < DOCTRINE.INC_STALE_DAYS) return;
        var sev = num(x.severity);
        out.push(fin({ ruleId: 'R12', severity: Math.min(84, 58 + 2 * (d - DOCTRINE.INC_STALE_DAYS) + (sev != null && sev >= 4 ? 8 : 0)),
          title: 'Incident "' + x.label + '" has been silent for ' + d + 'd',
          action: 'Close it or move it — quiet incidents teach the team that reporting changes nothing. Log an update with the next step and owner, or resolve it honestly.',
          basis: ['registered: ' + dt(x.ts), 'last touch: ' + dt(x.updatedTs) + ' (' + d + 'd ago · stale ≥ ' + DOCTRINE.INC_STALE_DAYS + 'd)',
            'severity: ' + (sev != null ? sev + '/5' : 'unset')],
          confidence: conf('high', 'staleness is date math on your own update events.'),
          meta: { key: x.id, incidentId: x.id, evidenceIds: [x.id] } }));
      });
      return out;
    } }
  ];

  /* engine memory — snooze/dismiss/unmute are EVENTS: auditable, reversible */
  function memory(events) {
    var mem = {};
    EV().sorted(events).forEach(function (e) {
      var k = e.data && e.data.key;
      if (!k) return;
      if (e.type === 'engine.snooze') mem[k] = { dismissed: false, snoozeUntil: e.data.until || null };
      else if (e.type === 'engine.dismiss') mem[k] = { dismissed: true, snoozeUntil: null };
      else if (e.type === 'engine.unmute') mem[k] = { dismissed: false, snoozeUntil: null };
    });
    return mem;
  }

  function evaluateWith(state, todayISO, extraRules) {
    var ctx = buildCtx(state, todayISO);
    var rules = RULES.concat(extraRules || []);
    var findings = [];
    rules.forEach(function (r) {
      try {
        var got = r.run(ctx) || [];
        got.forEach(function (f) { findings.push(f); });
      } catch (err) {
        findings.push(fin({ ruleId: 'ENG', severity: 95,
          title: 'Rule ' + r.id + ' threw instead of producing findings',
          action: 'This is an engine defect, not your data. The error is preserved below; every other rule still ran.',
          basis: ['exception: ' + (err && err.message ? err.message : String(err)),
            'the engine fails LOUD on purpose — a silently dead rule would manufacture false calm'],
          confidence: conf('high', 'an exception was caught at ' + S.nowISO() + ' — that is a hard fact.'),
          meta: { key: 'rule-' + r.id, error: String(err && err.stack || err) } }));
      }
    });
    var mem = memory(state.events || []);
    var visible = [], suppressed = [];
    findings.forEach(function (f) {
      var m = mem[f.key];
      if (m && m.dismissed) { f.suppressed = 'dismissed'; suppressed.push(f); return; }
      if (m && m.snoozeUntil && dayUTC(m.snoozeUntil) != null && dayUTC(todayISO) <= dayUTC(m.snoozeUntil)) {
        f.suppressed = 'snoozed until ' + m.snoozeUntil; suppressed.push(f); return;
      }
      visible.push(f);
    });
    visible.sort(function (a, b) {
      return b.score - a.score || b.severity - a.severity || (a.title < b.title ? -1 : 1);
    });
    return { findings: visible, suppressed: suppressed, doctrine: DOCTRINE };
  }
  function evaluate(state, todayISO) { return evaluateWith(state, todayISO, null); }

  /* ================= golden fixtures G1–G18 (the rule contract) =================
     Pure: synthetic states computed against a FIXED today; zero storage I/O.
     Re-authored (mf-3's G1–G16 tail was unreadable from here — unverified). */
  var G_TODAY = '2026-02-16';
  function gd(n) { return new Date(Date.parse(G_TODAY + 'T12:00:00Z') - n * 86400000).toISOString(); }
  function gdate(n) { return gd(n).slice(0, 10); }
  function gmk(people, events, meta) {
    var st = S.fresh(); st.meta.appointment = null;
    if (meta) for (var k in meta) st.meta[k] = meta[k];
    people.forEach(function (p) {
      st.people.push({ id: p[0], name: p[1], role: '', cadenceDays: p[2] || 7,
        reportsTo: p[3] === undefined ? 'me' : p[3], createdAt: gd(90), archived: false, seed: false });
    });
    var n = 0;
    events.forEach(function (e) {
      st.events.push({ id: 'ge' + (++n), ts: e.ts || gd(1), type: e.type, personId: e.personId || null, data: e.data || {}, seed: false });
    });
    return st;
  }
  function has(fs, ruleId, pred) {
    return fs.some(function (f) { return f.ruleId === ruleId && (!pred || pred(f)); });
  }
  var GOLDENS = [
    { id: 'G1', name: 'R1 fires "never logged" for a direct report with zero 1:1s', run: function () {
      var r = evaluate(gmk([['p1', 'Ana', 7]], []), G_TODAY);
      var ok = has(r.findings, 'R1', function (f) { return f.personId === 'p1' && f.meta.never && f.severity === 70 && f.score === 70; });
      return { pass: ok, note: ok ? 'finding: never=true, sev 70, high → 70' : 'expected one never-R1 for p1' }; } },
    { id: 'G2', name: 'R1 boundary: last 1:1 at exactly cadence → silent; cadence+1d → fires', run: function () {
      var at = evaluate(gmk([['p1', 'Ana', 7]], [{ type: 'oneonone.logged', personId: 'p1', ts: gd(7) }]), G_TODAY);
      var over = evaluate(gmk([['p1', 'Ana', 7]], [{ type: 'oneonone.logged', personId: 'p1', ts: gd(8) }]), G_TODAY);
      var ok = !has(at.findings, 'R1') && has(over.findings, 'R1', function (f) { return f.meta.overdue === 1; });
      return { pass: ok, note: 'd=7: ' + (has(at.findings, 'R1') ? 'FIRED (wrong)' : 'silent') + ' · d=8: ' + (has(over.findings, 'R1') ? 'fired, overdue=1' : 'silent (wrong)') }; } },
    { id: 'G3', name: 'R2 ignores future review dates and resolved decisions; past+open fires', run: function () {
      var st = gmk([], [
        { type: 'decision.logged', ts: gd(9), data: { title: 'A', reviewDate: gdate(5) } },
        { type: 'decision.logged', ts: gd(9), data: { title: 'B', reviewDate: new Date(Date.parse(G_TODAY) + 3 * 86400000).toISOString().slice(0, 10) } }
      ]);
      st.events.push({ id: 'gout', ts: gd(1), type: 'decision.outcome', personId: null, data: { decisionId: 'ge1' }, seed: false });
      var stF = gmk([], [{ type: 'decision.logged', ts: gd(9), data: { title: 'C', reviewDate: gdate(4) } }]);
      var a = evaluate(st, G_TODAY), b = evaluate(stF, G_TODAY);
      var ok = !has(a.findings, 'R2') && has(b.findings, 'R2', function (f) { return f.meta.decisionId === 'ge1'; });
      return { pass: ok, note: 'resolved+future: ' + a.findings.filter(function(f){return f.ruleId==='R2';}).length + ' finding(s) · past+open: ' + b.findings.filter(function(f){return f.ruleId==='R2';}).length }; } },
    { id: 'G4', name: 'R3 fires for ownerless goal and for 15d silence; quiet goal <14d stays silent', run: function () {
      var st = gmk([], [{ type: 'goal.set', ts: gd(20), data: { title: 'X', ownerPersonId: null } }]);
      var st2 = gmk([], [{ type: 'goal.set', ts: gd(15), data: { title: 'Y', ownerPersonId: 'me' } }]);
      var st3 = gmk([], [{ type: 'goal.set', ts: gd(10), data: { title: 'Z', ownerPersonId: 'me' } }]);
      var ok = has(evaluate(st, G_TODAY).findings, 'R3') && has(evaluate(st2, G_TODAY).findings, 'R3') && !has(evaluate(st3, G_TODAY).findings, 'R3');
      return { pass: ok, note: 'ownerless:fires · 15d:fires · 10d:silent' }; } },
    { id: 'G5', name: 'R4 math: 3 corrective / 0 positive in 60d fires at 100%; 2/1 (67%) stays silent', run: function () {
      var mk = function (mix) { return gmk([['p1', 'Ana', 7]], mix.map(function (pol, i) {
        return { type: 'feedback.logged', personId: 'p1', ts: gd(10 + i), data: { polarity: pol } }; })); };
      var a = evaluate(mk(['corrective', 'corrective', 'corrective']), G_TODAY);
      var b = evaluate(mk(['corrective', 'corrective', 'positive']), G_TODAY);
      var ok = has(a.findings, 'R4', function (f) { return f.meta.direction === 'corrective' && f.severity === 72; }) && !has(b.findings, 'R4');
      return { pass: ok, note: '3c/0p: fires sev 72 · 2c/1p: silent (67% < 80%)' }; } },
    { id: 'G6', name: 'R5 fires at 5 open delegations; 4th stays inside doctrine max', run: function () {
      var mk = function (n) { var evs = []; for (var i = 0; i < n; i++) evs.push({ type: 'delegation.assigned', personId: 'p1', ts: gd(5 + i), data: { title: 't' + i, level: 2 } }); return gmk([['p1', 'Ana', 7]], evs); };
      var ok = has(evaluate(mk(5), G_TODAY).findings, 'R5', function (f) { return f.meta.count === 5; }) && !has(evaluate(mk(4), G_TODAY).findings, 'R5');
      return { pass: ok, note: '5 open: fires · 4 open: silent' }; } },
    { id: 'G7', name: 'R6 PAIR: two open conflicts, same id-linked pair, ≤90d → one finding naming both; one resolved → silent', run: function () {
      var st = gmk([['p1', 'Ana', 7], ['p2', 'Bo', 7]], [
        { type: 'conflict.registered', personId: 'p1', ts: gd(20), data: { summary: 'on-call', counterpartPersonId: 'p2' } },
        { type: 'conflict.registered', personId: 'p2', ts: gd(5), data: { summary: 'signoff', counterpartPersonId: 'p1' } }]);
      var a = evaluate(st, G_TODAY);
      st.events.push({ id: 'gres', ts: gd(1), type: 'conflict.resolved', personId: null, data: { conflictId: 'ge1' }, seed: false });
      var b = evaluate(st, G_TODAY);
      var f6 = a.findings.filter(function (f) { return f.ruleId === 'R6'; });
      var ok = f6.length === 1 && /Ana × Bo/.test(f6[0].title) && f6[0].confidence.level === 'high' && !has(b.findings, 'R6');
      return { pass: ok, note: 'open pair: ' + f6.length + ' finding(s) "' + (f6[0] ? f6[0].title : '—') + '" · after resolve: ' + (has(b.findings, 'R6') ? 'STILL FIRING (wrong)' : 'silent') }; } },
    { id: 'G8', name: 'R7 measured-only: 3 measured readings (load 9,9,9) fire; estimated readings excluded and counted', run: function () {
      var st = gmk([['p1', 'Ana', 7]], [
        { type: 'pulse.logged', personId: 'p1', ts: gd(9), data: { mood: 6, load: 9 } },
        { type: 'pulse.logged', personId: 'p1', ts: gd(5), data: { mood: 5, load: 9 } },
        { type: 'pulse.logged', personId: 'p1', ts: gd(1), data: { mood: 4, load: 9 } },
        { type: 'pulse.logged', personId: 'p1', ts: gd(2), data: { mood: 1, load: 10, estimated: true } }]);
      var r = evaluate(st, G_TODAY);
      var stE = gmk([['p1', 'Ana', 7]], [1, 2, 3].map(function (i) {
        return { type: 'pulse.logged', personId: 'p1', ts: gd(i * 3), data: { mood: 2, load: 10, estimated: true } }; }));
      var ok = has(r.findings, 'R7', function (f) { return f.meta.meanLoad === 9 && /excluded: 1/.test(f.basis.join(' ')); }) &&
               !has(evaluate(stE, G_TODAY).findings, 'R7');
      return { pass: ok, note: 'measured≥3 fires · all-estimated silent' }; } },
    { id: 'G9', name: 'R8 skip-level: 31d past fires; intact line required — broken line stays silent', run: function () {
      var st = gmk([['lead', 'Lead', 7], ['p1', 'Ana', 7, 'lead']], [{ type: 'oneonone.logged', personId: 'p1', ts: gd(31) }]);
      var a = evaluate(st, G_TODAY);
      var stB = gmk([['p1', 'Ana', 7, 'ghost-lead']], []);
      var b = evaluate(stB, G_TODAY);
      var ok = has(a.findings, 'R8', function (f) { return f.meta.via === 'lead'; }) && !has(b.findings, 'R8') && !has(b.findings, 'R1');
      return { pass: ok, note: 'intact line, 31d: fires · broken line: silent everywhere' }; } },
    { id: 'G10', name: 'R9: day 14 with zero expectations fires; day 13 silent; expectation captured → silent', run: function () {
      var mk = function (dayN, exp) { var evs = []; for (var i = 0; i < exp; i++) evs.push({ type: 'expectation.logged', ts: gd(1), data: { text: 'e' + i } });
        return gmk([], evs, { appointment: { startDate: gdate(dayN) } }); };
      var ok = has(evaluate(mk(14, 0), G_TODAY).findings, 'R9') && !has(evaluate(mk(13, 0), G_TODAY).findings, 'R9') && !has(evaluate(mk(20, 1), G_TODAY).findings, 'R9');
      return { pass: ok, note: 'd14/0:fires · d13/0:silent · d20/1:silent' }; } },
    { id: 'G11', name: 'R10: grace week silent; day 30 partial coverage nudges; day 45+ incomplete fires hard', run: function () {
      var mk = function (dayN, visited) { var evs = []; visited.forEach(function (pid) { evs.push({ type: 'tour.visit', personId: pid, ts: gd(3) }); });
        return gmk([['p1', 'Ana', 7], ['p2', 'Bo', 7], ['p3', 'Cy', 7]], evs, { appointment: { startDate: gdate(dayN) } }); };
      var g = evaluate(mk(6, []), G_TODAY), mid = evaluate(mk(30, ['p1']), G_TODAY), late = evaluate(mk(46, ['p1']), G_TODAY);
      var ok = !has(g.findings, 'R10') && has(mid.findings, 'R10', function (f) { return f.severity === 40; }) &&
               has(late.findings, 'R10', function (f) { return f.severity === 68; });
      return { pass: ok, note: 'd6:silent · d30 1/3:sev 40 · d46 1/3:sev 68' }; } },
    { id: 'G12', name: 'R11: win past verifyDate unverified fires; verified or future-dated stays silent', run: function () {
      var mk = function (extra) { var st = gmk([], [{ type: 'earlywin.committed', ts: gd(20), data: { title: 'W', verifyDate: gdate(3) } }]);
        (extra || []).forEach(function (e) { st.events.push(e); }); return st; };
      var a = evaluate(mk(), G_TODAY);
      var b = evaluate(mk([{ id: 'gv', ts: gd(1), type: 'earlywin.verified', personId: null, data: { winId: 'ge1' }, seed: false }]), G_TODAY);
      var ok = has(a.findings, 'R11') && !has(b.findings, 'R11');
      return { pass: ok, note: 'open past gate: fires · verified: silent' }; } },
    { id: 'G13', name: 'R12: incident untouched 8d fires; touched 3d ago silent; resolved silent', run: function () {
      var mk = function (evs) { return gmk([], evs); };
      var a = evaluate(mk([{ type: 'incident.registered', ts: gd(8), data: { title: 'I', severity: 3 } }]), G_TODAY);
      var b = evaluate(mk([{ type: 'incident.registered', ts: gd(8), data: { title: 'I', severity: 3 } },
        { type: 'incident.update', ts: gd(3), data: { incidentId: 'ge1', note: 'mitigation shipped' } }]), G_TODAY);
      var c = evaluate(mk([{ type: 'incident.registered', ts: gd(30), data: { title: 'I', severity: 3 } },
        { id: 'gr', ts: gd(20), type: 'incident.resolved', personId: null, data: { incidentId: 'ge1' }, seed: false }]), G_TODAY);
      var ok = has(a.findings, 'R12') && !has(b.findings, 'R12') && !has(c.findings, 'R12');
      return { pass: ok, note: '8d untouched: fires · updated 3d: silent · resolved: silent' }; } },
    { id: 'G14', name: 'engine memory: snooze hides a finding for SNOOZE_DAYS, then it returns on its own', run: function () {
      var st = gmk([['p1', 'Ana', 7]], []);
      var key = 'R1:p1';
      st.events.push({ id: 'gs', ts: gd(1), type: 'engine.snooze', personId: null, data: { key: key, until: gdate(-6) }, seed: false });
      var snoozed = evaluate(st, G_TODAY);
      st.events.push({ id: 'gs2', ts: gd(0), type: 'engine.snooze', personId: null, data: { key: key, until: gdate(1) }, seed: false });
      var back = evaluate(st, G_TODAY);
      var ok = has(snoozed.suppressed, 'R1') && !has(snoozed.findings, 'R1') && has(back.findings, 'R1');
      return { pass: ok, note: 'until +6d: suppressed (' + snoozed.suppressed.length + ') · until −1d: visible again' }; } },
    { id: 'G15', name: 'engine memory: dismiss hides; unmute restores — suppression is an event, hence reversible', run: function () {
      var st = gmk([['p1', 'Ana', 7]], []);
      st.events.push({ id: 'gd1', ts: gd(2), type: 'engine.dismiss', personId: null, data: { key: 'R1:p1' }, seed: false });
      var d = evaluate(st, G_TODAY);
      st.events.push({ id: 'gd2', ts: gd(1), type: 'engine.unmute', personId: null, data: { key: 'R1:p1' }, seed: false });
      var u = evaluate(st, G_TODAY);
      var ok = !has(d.findings, 'R1') && has(d.suppressed, 'R1', function (f) { return f.suppressed === 'dismissed'; }) && has(u.findings, 'R1');
      return { pass: ok, note: 'dismissed: hidden+listed · unmute: back in the column' }; } },
    { id: 'G16', name: 'rule exceptions surface as loud ENG findings instead of dying silently', run: function () {
      var st = gmk([], []);
      var r = evaluateWith(st, G_TODAY, [{ id: 'RX', run: function () { throw new Error('boom-fixture'); } }]);
      var ok = has(r.findings, 'ENG', function (f) { return f.severity === 95 && /boom-fixture/.test(f.basis.join(' ')); });
      return { pass: ok, note: ok ? 'ENG finding, sev 95, error text preserved' : 'no ENG finding' }; } },
    { id: 'G17', name: 'R6 linkage honesty: free-text pair fires at MEDIUM confidence; counterpart absent = pair with "you"', run: function () {
      var stT = gmk([['p1', 'Ana', 7]], [
        { type: 'conflict.registered', personId: 'p1', ts: gd(10), data: { counterpart: 'Dana' } },
        { type: 'conflict.registered', personId: 'p1', ts: gd(4), data: { counterpart: 'Dana' } }]);
      var stMe = gmk([['p1', 'Ana', 7]], [
        { type: 'conflict.registered', personId: 'p1', ts: gd(10), data: {} },
        { type: 'conflict.registered', personId: 'p1', ts: gd(4), data: {} }]);
      var t = evaluate(stT, G_TODAY), m = evaluate(stMe, G_TODAY);
      var ok = has(t.findings, 'R6', function (f) { return f.confidence.level === 'medium' && /unlinked/.test(f.title); }) &&
               has(m.findings, 'R6', function (f) { return /you × Ana|Ana × you/.test(f.title); });
      return { pass: ok, note: 'text pair: medium conf · no counterpart: "you × Ana"' }; } },
    { id: 'G18', name: 'R13 nexus: 3 open conflicts across 2 distinct counterparts fires; 3 against ONE counterpart does not (that is R6)', run: function () {
      var st = gmk([['p1', 'Ana', 7], ['p2', 'Bo', 7], ['p3', 'Cy', 7]], [
        { type: 'conflict.registered', personId: 'p1', ts: gd(9), data: { counterpartPersonId: 'p2' } },
        { type: 'conflict.registered', personId: 'p1', ts: gd(6), data: { counterpartPersonId: 'p3' } },
        { type: 'conflict.registered', personId: 'p1', ts: gd(2), data: { counterpartPersonId: 'p3' } }]);
      var stOne = gmk([['p1', 'Ana', 7], ['p2', 'Bo', 7]], [
        { type: 'conflict.registered', personId: 'p1', ts: gd(9), data: { counterpartPersonId: 'p2' } },
        { type: 'conflict.registered', personId: 'p1', ts: gd(6), data: { counterpartPersonId: 'p2' } },
        { type: 'conflict.registered', personId: 'p1', ts: gd(2), data: { counterpartPersonId: 'p2' } }]);
      var n = evaluate(st, G_TODAY), o = evaluate(stOne, G_TODAY);
      var ok = has(n.findings, 'R13', function (f) { return f.personId === 'p1' && f.confidence.level === 'medium'; }) && !has(o.findings, 'R13');
      return { pass: ok, note: '3 open / 2 cps: fires medium · 3 open / 1 cp: nexus silent' }; } }
  ];

  function runGoldens() {
    return GOLDENS.map(function (g) {
      try { var r = g.run(); return { id: g.id, name: g.name, pass: !!r.pass, note: r.note || '' }; }
      catch (e) { return { id: g.id, name: g.name, pass: false, note: 'threw: ' + (e && e.message || e) }; }
    });
  }

  return {
    DOCTRINE: DOCTRINE, CONF_FACTOR: CONF_FACTOR, RULE_TAGS: RULE_TAGS,
    evaluate: evaluate, evaluateWith: evaluateWith, memory: memory,
    runGoldens: runGoldens, days: days, dayUTC: dayUTC,
    _rulesCount: RULES.length
  };
})();
