/* LeadOS pt-1 · js/engine.js — the rules engine (the product).
   Rules are PURE (projection P, today) → findings. Every finding =
   what + why (basis lines + source event ids) + confidence (level + its own why)
   + printed score math (sev × conf factor). Rule exceptions surface as loud ENG
   findings — never swallowed. Suppression (snooze/dismiss/unmute) is events, so
   engine memory is auditable and reversible.
   Non-negotiables: trends need ≥3 MEASURED points · missing fields skip rather
   than infer · a count is never stated as certainty.
   R1–R4 semantics byte-verified against upstream engine.js head; R5–R7 re-authored
   to the documented contract (upstream body truncated at fetch — labeled, not hidden). */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.engine = 'js/engine.js';

LEADOS.engine = (function () {
  'use strict';

  var CONF_FACTOR = { high: 1, medium: 0.7, low: 0.45 };

  function dayUTC(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return null;
    return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 864e5);
  }
  function days(fromIso, toIso) { var a = dayUTC(fromIso), b = dayUTC(toIso); return (a == null || b == null) ? null : b - a; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function fmtD(iso) { return iso ? String(iso).slice(0, 10) : '—'; }
  function fin(rule, sev, conf, confWhy, title, basis, sources, key) {
    return { rule: rule, sev: sev, conf: conf, confWhy: confWhy, title: title, basis: basis || [], sources: sources || [], key: key };
  }
  function pName(P, pid) { var p = P.peopleById[pid]; return p ? p.name : '(unknown person)'; }

  var RULES = [
    { id: 'R1', tag: 'cadence', play: 'oneonone',
      params: 'strictly past per-person cadence (default 14d, stated); never-logged fires MEDIUM from createdAt; no createdAt → skip',
      fn: function (P, today) {
        var out = [];
        P.directs.forEach(function (p) {
          var cad = p.cadenceDays || 14;
          var cadNote = p.cadenceDays ? 'cadence ' + cad + 'd (person row)' : 'cadence 14d (default — not set on person row, labeled assumption)';
          var last = P.oneononeLast[p.id];
          if (last) {
            var gap = days(last.ts, today);
            if (gap != null && gap > cad) {
              out.push(fin('R1', 3, 'high', 'measured against your own logged 1:1s',
                '1:1 with ' + p.name + ' is ' + (gap - cad) + 'd overdue',
                ['last 1:1 ' + fmtD(last.ts) + ' → ' + gap + 'd ago; ' + cadNote + ' — strictly past',
                 'source: oneonone.logged ' + last.id],
                [last.id], 'R1:' + p.id));
            }
          } else if (p.createdAt && days(p.createdAt, today) > cad) {
            out.push(fin('R1', 3, 'medium', 'never logged — cadence measured from the day you added them, not from a real 1:1',
              'No 1:1 ever logged with ' + p.name,
              ['added ' + fmtD(p.createdAt) + ' (' + days(p.createdAt, today) + 'd ago); ' + cadNote,
               'no oneonone.logged events exist for this person'],
              [], 'R1:' + p.id));
          }
          /* no last AND no createdAt → skip. Missing fields skip; we don't infer. */
        });
        return out;
      } },

    { id: 'R2', tag: 'decisions', play: 'decision-review',
      params: 'past own reviewDate, no decision.outcome linked; severity inherits the decision’s (clamped 3–5); no reviewDate → skip',
      fn: function (P, today) {
        var out = [];
        P.openDecisions.forEach(function (d) {
          if (!d.reviewDate) return;
          var late = days(d.reviewDate, today);
          if (late != null && late > 0) {
            out.push(fin('R2', clamp(d.severity || 3, 3, 5), 'high', 'review date is your own; outcome absence is explicit',
              'Decision past review, no outcome: "' + d.title + '"',
              ['decided ' + fmtD(d.ts) + ' · review ' + fmtD(d.reviewDate) + ' → ' + late + 'd late',
               'severity inherits decision sev ' + (d.severity || '—') + ' → finding sev ' + clamp(d.severity || 3, 3, 5),
               'no decision.outcome event links to ' + d.id],
              [d.id], 'R2:' + d.id));
          }
        });
        return out;
      } },

    { id: 'R3', tag: 'goals', play: 'goal-review',
      params: 'ownerless fires HIGH; silent >14d (strictly) fires HIGH from last progress, MEDIUM from creation if none ever',
      fn: function (P, today) {
        var out = [];
        P.openGoals.forEach(function (g) {
          if (g.ownerId == null) {
            out.push(fin('R3', 3, 'high', 'owner field is explicitly null — data, not inference',
              'Goal has no owner: "' + g.title + '"',
              ['set ' + fmtD(g.ts) + ' · ownerId null (goal ' + g.id + ')',
               'an unowned goal is a decision you made by omission'],
              [g.evId], 'R3o:' + g.id));
          }
          var ref = g.lastProgressTs || g.ts;
          var silent = days(ref, today);
          if (silent != null && silent > 14) {
            out.push(fin('R3', 3, g.lastProgressTs ? 'high' : 'medium',
              g.lastProgressTs ? 'measured from your last logged progress' : 'no progress ever logged — measured from creation date',
              'Goal silent ' + silent + 'd: "' + g.title + '"',
              ['last progress ' + (g.lastProgressTs ? fmtD(g.lastProgressTs) : 'never logged') + ' · set ' + fmtD(g.ts),
               'silence threshold 14d (strictly past) · progress events logged: ' + g.progressN],
              [g.evId], 'R3s:' + g.id));
          }
        });
        return out;
      } },

    { id: 'R4', tag: 'feedback', play: 'sbi',
      params: '60d window · ≥80% one polarity · min n=3 (HIGH at n≥5) · missing polarity excluded + printed',
      fn: function (P, today) {
        var out = [];
        Object.keys(P.feedbackByPerson).forEach(function (pid) {
          if (!P.peopleById[pid] || P.peopleById[pid].archived) return;
          var win = [], skippedNoPolarity = 0;
          P.feedbackByPerson[pid].forEach(function (ev) {
            var age = days(ev.ts, today);
            if (age == null || age > 60) return;
            if (ev.polarity === 'positive' || ev.polarity === 'corrective') win.push(ev.polarity);
            else skippedNoPolarity++;
          });
          if (win.length < 3) return; /* insufficient data → silence, by design */
          var pos = win.filter(function (x) { return x === 'positive'; }).length;
          var share = pos / win.length;
          var kind = share >= 0.8 ? 'positive' : share <= 0.2 ? 'corrective' : null;
          if (!kind) return;
          var n = win.filter(function (x) { return x === kind; }).length;
          out.push(fin('R4', 3, win.length >= 5 ? 'high' : 'medium',
            'n=' + win.length + ' in-window (min 3; HIGH needs ≥5)',
            'Feedback to ' + pName(P, pid) + ' is all ' + (kind === 'corrective' ? 'corrective' : 'reinforcing'),
            [n + '/' + win.length + ' ' + kind + ' in the last 60d (imbalance = ≥80% one polarity; min n=3)',
             kind === 'corrective'
               ? 'under only-corrective feedback people stop hearing it — the next one lands as noise'
               : 'under only-reinforcing feedback people stop growing — they can’t tell praise from comfort',
             skippedNoPolarity ? skippedNoPolarity + ' event(s) lacked polarity — excluded from the count, not guessed' : 'every in-window event had explicit polarity',
             'open the SBI playbook pre-filled with the missing polarity'],
            P.feedbackByPerson[pid].slice(-6).map(function (e) { return e.id; }),
            'R4:' + pid));
        });
        return out;
      } },

    { id: 'R5', tag: 'delegation', play: 'delegation',
      params: '>4 open delegations per person fires sev 3; >6 fires sev 4; closes counted from delegation.closed events',
      fn: function (P, today) {
        var out = [];
        Object.keys(P.delegationsOpenByPerson).forEach(function (pid) {
          if (!P.peopleById[pid] || P.peopleById[pid].archived) return;
          var list = P.delegationsOpenByPerson[pid];
          if (list.length <= 4) return;
          var oldest = list[0].ts, i;
          for (i = 1; i < list.length; i++) if (list[i].ts < oldest) oldest = list[i].ts;
          var names = list.slice(0, 4).map(function (x) { return x.task; }).join(' · ');
          out.push(fin('R5', list.length > 6 ? 4 : 3, 'high', 'open delegations counted from your own assign/close events',
            pName(P, pid) + ' carries ' + list.length + ' open delegations',
            ['open: ' + names + (list.length > 4 ? ' · +' + (list.length - 4) + ' more' : ''),
             'threshold >4 open; oldest open ' + fmtD(oldest) + ' (' + days(oldest, today) + 'd)',
             'above ~5 concurrent owned items, follow-through — not effort — becomes the failure mode; close or re-level one via the delegation playbook'],
            list.map(function (x) { return x.id; }), 'R5:' + pid));
        });
        return out;
      } },

    { id: 'R6', tag: 'conflict', play: 'desc',
      params: 'same pair ≥2 open conflicts in 60d · conf HIGH both ids · MEDIUM one · LOW text-only · flat 60d window (temporal weighting = named gap)',
      fn: function (P, today) {
        var out = [];
        Object.keys(P.conflictCountsByPair).forEach(function (pk) {
          var n = P.conflictCountsByPair[pk];
          if (n < 2) return;
          var evs = P.openConflicts.filter(function (c) { return c.pairKey === pk; });
          var inWin = evs.filter(function (c) { var a = days(c.ts, today); return a != null && a <= 60; });
          if (inWin.length < 2) return;
          var first = inWin[0];
          var conf = (first.aId && first.bId) ? 'high' : (first.aId || first.bId) ? 'medium' : 'low';
          var who = (first.aId && first.bId) ? pName(P, first.aId) + ' × ' + pName(P, first.bId)
            : (first.aId || first.bId) ? pName(P, first.aId || first.bId) + ' × (unnamed)' : '"' + (first.text || 'unnamed').slice(0, 40) + '"';
          out.push(fin('R6', inWin.length >= 3 ? 4 : 3, conf,
            conf === 'high' ? 'both parties are roster people — the pair link is data'
              : conf === 'medium' ? 'one party identified — pairing partly by text, drift priced into confidence'
              : 'paired by text only — this is a cluster, not a proven pair',
            'Repeated unresolved conflict: ' + who + ' (' + inWin.length + '× in 60d)',
            inWin.slice(0, 3).map(function (c, i) { return (i + 1) + '. ' + fmtD(c.ts) + ' — ' + (c.text || '(no text)'); })
              .concat(['no conflict.resolved event reached this pair after the latest one',
                'flat 60d window — recency is not weighted (named gap, printed in the basis)',
                'a repeated pair is a system signal: look at the structure between them before the people']),
            inWin.map(function (c) { return c.id; }), 'R6:' + pk));
        });
        return out;
      } },

    { id: 'R7', tag: 'burnout', play: 'oneonone',
      params: 'MEASURED pulses only · n≥3 in 45d · trigger A mean load ≥8/10 · trigger B mood slope ≤−0.5/wk over span ≥7d · always MEDIUM: a trend is a signal, not a diagnosis',
      fn: function (P, today) {
        var out = [];
        Object.keys(P.pulsesByPerson).forEach(function (pid) {
          if (!P.peopleById[pid] || P.peopleById[pid].archived) return;
          var measured = [], estimated = 0;
          var invalid = 0;
          P.pulsesByPerson[pid].forEach(function (pu) {
            var age = days(pu.ts, today);
            if (age == null || age > 45) return;
            if (pu.measured === false) { estimated++; return; }
            var lo = pu.load, mo = pu.mood;
            if (lo != null && (typeof lo !== 'number' || lo < 0 || lo > 10)) lo = (invalid++, null);
            if (mo != null && (typeof mo !== 'number' || mo < 0 || mo > 10)) mo = (invalid++, null);
            if (lo == null && mo == null) return;
            measured.push({ id: pu.id, ts: pu.ts, load: lo, mood: mo, measured: true });
          });
          if (measured.length < 3) return; /* silence with reason */
          var loads = measured.filter(function (x) { return typeof x.load === 'number'; });
          var moods = measured.filter(function (x) { return typeof x.mood === 'number'; });
          var meanLoad = loads.length ? loads.reduce(function (s, x) { return s + x.load; }, 0) / loads.length : null;
          var trigA = meanLoad != null && loads.length >= 3 && meanLoad >= 8;
          var slopeWk = null, spanD = null, trigB = false;
          if (moods.length >= 3) {
            var d0 = dayUTC(moods[0].ts), dn = dayUTC(moods[moods.length - 1].ts);
            spanD = dn - d0;
            if (spanD >= 7) {
              var pts = moods.map(function (m) { return [dayUTC(m.ts) - d0, m.mood]; });
              var mx = 0, my = 0, i;
              for (i = 0; i < pts.length; i++) { mx += pts[i][0]; my += pts[i][1]; }
              mx /= pts.length; my /= pts.length;
              var num = 0, den = 0;
              for (i = 0; i < pts.length; i++) { num += (pts[i][0] - mx) * (pts[i][1] - my); den += (pts[i][0] - mx) * (pts[i][0] - mx); }
              slopeWk = den === 0 ? 0 : (num / den) * 7;
              trigB = slopeWk <= -0.5;
            }
          }
          if (!trigA && !trigB) return;
          var basis = ['measured pulses in 45d: ' + measured.length + ' (estimated excluded: ' + estimated + (invalid ? ' · out-of-range values dropped: ' + invalid : '') + ' — not guessed, counted)'];
          if (trigA) basis.push('trigger A: mean load ' + meanLoad.toFixed(1) + '/10 ≥ 8 over ' + loads.length + ' measured points');
          if (trigB) basis.push('trigger B: mood slope ' + slopeWk.toFixed(2) + '/wk ≤ −0.5 across ' + spanD + 'd span');
          if (!trigA && meanLoad == null) basis.push('load never measured in-window — only mood evaluated');
          if (trigA && slopeWk != null && !trigB) basis.push('mood slope ' + slopeWk.toFixed(2) + '/wk — under threshold, load alone triggered');
          basis.push('this warrants a load conversation, not a wellness speech — open the 1:1 run sheet, it pre-fills this data');
          out.push(fin('R7', trigA && trigB ? 5 : 4, 'medium', 'measured data only, but a trend is a signal, not a diagnosis — MEDIUM permanently',
            'Burnout signals for ' + pName(P, pid),
            basis, measured.map(function (m) { return m.id; }), 'R7:' + pid));
        });
        return out;
      } }
  ];

  function scoreOf(f) { return f.sev * (CONF_FACTOR[f.conf] || 0); }
  function scoreText(f) { return 'sev ' + f.sev + ' × conf ' + (CONF_FACTOR[f.conf] || 0) + ' = ' + scoreOf(f).toFixed(1); }

  var RULES_META = RULES.map(function (r) { return { id: r.id, tag: r.tag, play: r.play, params: r.params }; });

  function run(P, today) {
    var findings = [], muted = [], i;
    var playByRule = {};
    for (i = 0; i < RULES.length; i++) playByRule[RULES[i].id] = RULES[i].play;
    for (i = 0; i < RULES.length; i++) {
      var r = RULES[i], list;
      try { list = r.fn(P, today) || []; }
      catch (e) {
        list = [fin('ENG', 5, 'high', 'the rule itself threw — this is a defect, surfaced loudly instead of swallowed',
          'Rule ' + r.id + ' threw: ' + (e && e.message || e),
          ['engine self-check caught an exception inside ' + r.id,
           'the finding list below is INCOMPLETE — treat ' + r.id + '’s territory as unmonitored until fixed'],
          [], 'ENG:' + r.id)];
      }
      for (var j = 0; j < list.length; j++) {
        var f = list[j];
        f.play = playByRule[f.rule] || null;
        var sup = P.suppressed[f.key];
        if (sup) {
          if (sup.kind === 'dismissed') { muted.push({ f: f, why: 'dismissed' }); continue; }
          if (sup.kind === 'snoozed' && sup.until && new Date(sup.until) > new Date(today)) { muted.push({ f: f, why: 'snoozed until ' + fmtD(sup.until) }); continue; }
          /* expired snooze falls through to active automatically */
        }
        findings.push(f);
      }
    }
    findings.sort(function (a, b) {
      var d = scoreOf(b) - scoreOf(a);
      if (d) return d;
      if (a.sev !== b.sev) return b.sev - a.sev;
      return a.title < b.title ? -1 : 1;
    });
    return { findings: findings, muted: muted };
  }

  /* Health-only: temporarily replace a rule body (G11 injects a thrower). Returns restore fn. */
  function _swapRule(id, fn) {
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i].id === id) { var old = RULES[i].fn; RULES[i].fn = fn; return function () { RULES[i].fn = old; }; }
    }
    return function () {};
  }

  /* ---- Golden tests: input events → expected engine output. One per rule minimum,
     plus boundaries, plus suppression, plus the ENG path. Built against the REAL
     store/event/engine code paths on disposable in-memory states — no fixtures
     file, no mocks. The health wall executes these at render. ---- */
  function blankP(peopleRows, events) {
    var st = LEADOS.store.freshState();
    st.people = peopleRows || [];
    st.events = events || [];
    return LEADOS.events.project(st);
  }
  function person(id, over) { var p = { id: id, name: id.toUpperCase(), role: 't', cadenceDays: 14, reportsTo: null, archived: false, createdAt: null }; for (var k in over) p[k] = over[k]; return p; }
  function ev(type, ts, data) { return { id: 'x' + Math.random().toString(36).slice(2, 8), ts: ts, type: type, data: data }; }
  function day(today, off) { var d = new Date(today); d.setUTCDate(d.getUTCDate() + off); return d.toISOString(); }
  function onlyRule(P, today, id) {
    var all = run(P, today);
    return { active: all.findings.filter(function (f) { return f.rule === id; }), muted: all.muted, all: all.findings };
  }
  function g(id, rule, desc, fn) { return { id: id, rule: rule, desc: desc, fn: fn }; }

  var golden = [
    g('G1', 'R1', 'last 1:1 20d ago, cadence 14 → fires, conf high',
      function () { var t = LEADOS.events.todayIso();
        var P = blankP([person('a', { createdAt: day(t, -60) })], [ev('oneonone.logged', day(t, -20), { personId: 'a' })]);
        var r = onlyRule(P, t, 'R1');
        return { pass: r.active.length === 1 && r.active[0].conf === 'high' && r.active[0].key === 'R1:a', observed: r.active.length + ' finding(s), conf ' + (r.active[0] ? r.active[0].conf : '—'), expected: '1 finding, conf high' }; }),
    g('G2', 'R1', 'gap exactly == cadence (14d) → strictly-past does NOT fire',
      function () { var t = LEADOS.events.todayIso();
        var P = blankP([person('a', { createdAt: day(t, -60) })], [ev('oneonone.logged', day(t, -14), { personId: 'a' })]);
        var r = onlyRule(P, t, 'R1');
        return { pass: r.active.length === 0, observed: r.active.length + ' finding(s)', expected: '0 findings (boundary silent)' }; }),
    g('G3', 'R1', 'never logged, added 30d ago cad 14 → fires MEDIUM; no createdAt → skips entirely',
      function () { var t = LEADOS.events.todayIso();
        var P = blankP([person('a', { createdAt: day(t, -30) }), person('b', { createdAt: null })], []);
        var r = onlyRule(P, t, 'R1');
        return { pass: r.active.length === 1 && r.active[0].conf === 'medium' && r.active[0].key === 'R1:a', observed: r.active.length + ' finding(s), keys ' + r.active.map(function (f) { return f.key; }).join(','), expected: '1 finding R1:a medium; R1:b silent (no createdAt)' }; }),
    g('G4', 'R2', 'decision review yesterday sev 5 → fires sev 5; with outcome linked → silent',
      function () { var t = LEADOS.events.todayIso();
        var dec = ev('decision.logged', day(t, -10), { title: 'X', severity: 5, reviewDate: day(t, -1).slice(0, 10) });
        var r1 = onlyRule(blankP([], [dec]), t, 'R2');
        var r2 = onlyRule(blankP([], [dec, ev('decision.outcome', day(t, -2), { decisionId: dec.id, result: 'validated' })]), t, 'R2');
        return { pass: r1.active.length === 1 && r1.active[0].sev === 5 && r2.active.length === 0, observed: 'open: ' + r1.active.length + ' (sev ' + (r1.active[0] ? r1.active[0].sev : '—') + ') · with outcome: ' + r2.active.length, expected: '1 finding sev 5 · 0 with outcome' }; }),
    g('G5', 'R3', 'ownerless fires; silent exactly 14d does NOT; 15d does (medium from creation)',
      function () { var t = LEADOS.events.todayIso();
        var P = blankP([], [
          ev('goal.set', day(t, -20), { goalId: 'g1', title: 'ownerless' }),
          ev('goal.set', day(t, -14), { goalId: 'g2', title: 'edge', ownerId: 'x' }),
          ev('goal.set', day(t, -15), { goalId: 'g3', title: 'silent', ownerId: 'x' })]);
        var r = onlyRule(P, t, 'R3');
        var keys = r.active.map(function (f) { return f.key; }).sort();
        return { pass: keys.join(',') === 'R3o:g1,R3s:g1,R3s:g3', observed: keys.join(','), expected: 'R3o:g1,R3s:g1,R3s:g3 (g2 edge silent)' }; }),
    g('G6', 'R4', '4/4 corrective → MEDIUM; 5/5 → HIGH; 4-of-5 → silent; missing polarity excluded',
      function () { var t = LEADOS.events.todayIso();
        function fb(pid, pol, n, extraNoPol) { var a = []; for (var i = 0; i < n; i++) a.push(ev('feedback.given', day(t, -5 - i), extraNoPol && i === 0 ? { personId: pid } : { personId: pid, polarity: pol })); return a; }
        var P1 = blankP([person('a', { createdAt: day(t, -90) })], fb('a', 'corrective', 4));
        var P2 = blankP([person('a', { createdAt: day(t, -90) })], fb('a', 'positive', 5));
        var P3 = blankP([person('a', { createdAt: day(t, -90) })], fb('a', 'corrective', 3).concat(fb('a', 'positive', 1)).concat(fb('a', 'corrective', 1, true)));
        var r1 = onlyRule(P1, t, 'R4'), r2 = onlyRule(P2, t, 'R4'), r3 = onlyRule(P3, t, 'R4');
        return { pass: r1.active.length === 1 && r1.active[0].conf === 'medium' && r2.active.length === 1 && r2.active[0].conf === 'high' && r3.active.length === 0,
          observed: '4/4 → ' + r1.active.length + ' (' + (r1.active[0] ? r1.active[0].conf : '—') + ') · 5/5 → ' + r2.active.length + ' (' + (r2.active[0] ? r2.active[0].conf : '—') + ') · 3c+1p (+1 nopolarity) → ' + r3.active.length,
          expected: '1 medium · 1 high · 0 (75% < 80% after no-polarity exclusion)' }; }),
    g('G7', 'R5', '4 open → silent · 5 open → sev 3 · 7 open → sev 4; closed ones not counted',
      function () { var t = LEADOS.events.todayIso();
        function del(pid, n, closeLast) { var a = [], ids = []; for (var i = 0; i < n; i++) { var e = ev('delegation.assigned', day(t, -3 - i), { personId: pid, task: 't' + i, level: 3 }); a.push(e); ids.push(e.id); } if (closeLast) a.push(ev('delegation.closed', day(t, -1), { delegationId: ids[n - 1] })); return a; }
        var mkP = function (evs) { return blankP([person('a', { createdAt: day(t, -90) })], evs); };
        var r4 = onlyRule(mkP(del('a', 4)), t, 'R5');
        var r5 = onlyRule(mkP(del('a', 5)), t, 'R5');
        var r7 = onlyRule(mkP(del('a', 7)), t, 'R5');
        var rC = onlyRule(mkP(del('a', 5, true)), t, 'R5');
        return { pass: r4.active.length === 0 && r5.active.length === 1 && r5.active[0].sev === 3 && r7.active[0] && r7.active[0].sev === 4 && rC.active.length === 0,
          observed: '4→' + r4.active.length + ' · 5→' + r5.active.length + '(sev' + (r5.active[0] ? r5.active[0].sev : '—') + ') · 7→' + r7.active.length + '(sev' + (r7.active[0] ? r7.active[0].sev : '—') + ') · 5-with-1-closed→' + rC.active.length,
          expected: 'silent · 1 sev3 · 1 sev4 · silent' }; }),
    g('G8', 'R6', 'pair a×b twice in 60d → HIGH · once → silent · after resolution → silent · text-only → LOW',
      function () { var t = LEADOS.events.todayIso();
        var ppl = [person('a', { createdAt: day(t, -90) }), person('b', { createdAt: day(t, -90) })];
        var pair = [ev('conflict.logged', day(t, -20), { aId: 'a', bId: 'b', text: 'x' }), ev('conflict.logged', day(t, -5), { aId: 'a', bId: 'b', text: 'y' })];
        var rA = onlyRule(blankP(ppl, pair), t, 'R6');
        var rB = onlyRule(blankP(ppl, [pair[0]]), t, 'R6');
        var res = blankP(ppl, pair.concat([ev('conflict.resolved', day(t, -2), { conflictIds: [pair[0].id, pair[1].id], note: 'talked' })]));
        var rC = onlyRule(res, t, 'R6');
        var txt = [ev('conflict.logged', day(t, -10), { text: 'vendor escalation' }), ev('conflict.logged', day(t, -3), { text: 'vendor escalation' })];
        var rD = onlyRule(blankP(ppl, txt), t, 'R6');
        return { pass: rA.active.length === 1 && rA.active[0].conf === 'high' && rB.active.length === 0 && rC.active.length === 0 && rD.active.length === 1 && rD.active[0].conf === 'low',
          observed: 'pair×2 → ' + rA.active.length + '(high?' + (rA.active[0] ? rA.active[0].conf : '—') + ') · ×1 → ' + rB.active.length + ' · resolved → ' + rC.active.length + ' · text×2 → ' + rD.active.length + '(' + (rD.active[0] ? rD.active[0].conf : '—') + ')',
          expected: '1 high · 0 · 0 · 1 low' }; }),
    g('G9', 'R7', 'measured loads 9,8,9 → trigger A MEDIUM · estimated-only → silent + excluded · mood 8→6→4 weekly → trigger B',
      function () { var t = LEADOS.events.todayIso();
        function pu(pid, off, load, mood, measured) { return ev('pulse.recorded', day(t, off), { personId: pid, load: load, mood: mood, measured: measured }); }
        var rA = onlyRule(blankP([person('a', { createdAt: day(t, -90) })], [pu('a', -21, 9, 6, true), pu('a', -14, 8, 6, true), pu('a', -7, 9, 6, true)]), t, 'R7');
        var rB = onlyRule(blankP([person('a', { createdAt: day(t, -90) })], [pu('a', -21, 9, 4, false), pu('a', -14, 9, 4, false), pu('a', -7, 9, 4, false)]), t, 'R7');
        var rC = onlyRule(blankP([person('a', { createdAt: day(t, -90) })], [pu('a', -21, 5, 8, true), pu('a', -14, 5, 6, true), pu('a', -7, 5, 4, true)]), t, 'R7');
        var trigBok = rC.active.length === 1 && rC.active[0].basis.join(' ').indexOf('trigger B') >= 0;
        return { pass: rA.active.length === 1 && rA.active[0].conf === 'medium' && rB.active.length === 0 && rC.active.length === 1 && trigBok,
          observed: 'loads 9/8/9 → ' + rA.active.length + ' · estimated-only → ' + rB.active.length + ' · mood 8/6/4 → ' + rC.active.length + ' (trigger B line: ' + trigBok + ')',
          expected: '1 medium (A) · 0 (estimated excluded) · 1 with trigger B' }; }),
    g('G10', 'SUP', 'snooze hides until expiry · dismiss hides permanently · unmute restores',
      function () { var t = LEADOS.events.todayIso();
        function P(evs) { return blankP([person('a', { createdAt: day(t, -60) })], [ev('oneonone.logged', day(t, -20), { personId: 'a' })].concat(evs)); }
        var r0 = run(P([]), t);
        var r1 = run(P([ev('engine.snoozed', day(t, -1), { key: 'R1:a', until: day(t, 7) })]), t);
        var r2 = run(P([ev('engine.snoozed', day(t, -9), { key: 'R1:a', until: day(t, -2) })]), t);
        var r3 = run(P([ev('engine.dismissed', day(t, -1), { key: 'R1:a' })]), t);
        var r4 = run(P([ev('engine.dismissed', day(t, -2), { key: 'R1:a' }), ev('engine.unmuted', day(t, -1), { key: 'R1:a' })]), t);
        return { pass: r0.findings.length === 1 && r1.findings.length === 0 && r1.muted.length === 1 && r2.findings.length === 1 && r3.findings.length === 0 && r4.findings.length === 1,
          observed: 'plain ' + r0.findings.length + ' · snoozed +7d ' + r1.findings.length + '(muted ' + r1.muted.length + ') · expired-snooze ' + r2.findings.length + ' · dismissed ' + r3.findings.length + ' · unmuted ' + r4.findings.length,
          expected: '1 · 0 (1 muted) · 1 · 0 · 1' }; }),
    g('G11', 'ENG', 'a throwing rule surfaces as a loud ENG finding, other rules still run',
      function () { var t = LEADOS.events.todayIso();
        var restore = _swapRule('R2', function () { throw new Error('injected test fault'); });
        var r = run(blankP([person('a', { createdAt: day(t, -60) })], [ev('oneonone.logged', day(t, -20), { personId: 'a' })]), t);
        restore();
        var eng = r.findings.filter(function (f) { return f.rule === 'ENG'; });
        var r1 = r.findings.filter(function (f) { return f.rule === 'R1'; });
        return { pass: eng.length === 1 && eng[0].sev === 5 && r1.length === 1, observed: 'ENG findings ' + eng.length + ' · R1 still fired ' + r1.length, expected: '1 ENG sev 5 · R1 unaffected' }; })
  ];

  return {
    CONF_FACTOR: CONF_FACTOR, RULES_META: RULES_META,
    run: run, scoreOf: scoreOf, scoreText: scoreText, golden: golden, _swapRule: _swapRule
  };
})();
