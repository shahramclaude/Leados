/* LeadOS pt-2 · js/engine.js — the rules engine (the product).
   Carried byte-verified from pt-1: CONF_FACTOR {high:1,medium:.7,low:.45} · fin()
   shape (what + why basis lines + source ids + confidence with its own why) ·
   R1–R4 semantics · printed score math (sev × conf factor) · rule exceptions
   surface as loud ENG findings, never swallowed · suppression read from events.
   R5–R7 re-authored to the documented contract (upstream bodies never byte-
   readable — labeled, not hidden). NEW in pt-2: R8 skip-level cadence (exactly
   one lead between; broken-line silence) · R9 line integrity · G-suite G1–G12.
   Non-negotiables: trends need ≥3 MEASURED points · missing fields skip rather
   than infer · a count is never stated as certainty · sev 3 = MEDIUM ceiling for
   anything trend-based. */
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
  function skipCad(P, p) {
    if (p.skipCadenceDays) return { days: p.skipCadenceDays, src: 'skip cadence ' + p.skipCadenceDays + 'd (person row)' };
    var dft = (P.settings && P.settings.skipCadenceDefaultDays) || 60;
    return { days: dft, src: 'skip cadence ' + dft + 'd (default — not set on person row, labeled assumption)' };
  }

  var RULES = [
    { id: 'R1', tag: 'cadence', play: 'oneonone',
      params: 'strictly past per-person cadence (default 14d, stated); never-logged fires MEDIUM conf from createdAt; no createdAt → skip',
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
      params: 'past own reviewDate, no outcome linked; severity inherits the decision’s (clamped 3–5); no reviewDate → skip',
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
      params: 'ownerless fires (conf HIGH — explicit null is data); silent >14d strictly fires (conf HIGH from last progress, MEDIUM from creation)',
      fn: function (P, today) {
        var out = [];
        P.openGoals.forEach(function (g) {
          if (g.ownerId == null) {
            out.push(fin('R3', 3, 'high', 'owner field is explicitly null — data, not inference',
              'Goal has no owner: "' + g.title + '"',
              ['set ' + fmtD(g.ts) + ' · ownerId null (goal ' + g.id + ')',
               'an unowned goal is a decision someone made by omission'],
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
      params: '60d window · ≥80% one polarity · min n=3 (conf HIGH at n≥5) · missing polarity excluded + printed',
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
      params: '>4 open delegations per person fires sev 3; >6 fires sev 4 (documented contract; body re-authored)',
      fn: function (P, today) {
        var out = [];
        Object.keys(P.delegationsOpenByPerson).forEach(function (pid) {
          if (!P.peopleById[pid] || P.peopleById[pid].archived) return;
          var list = P.delegationsOpenByPerson[pid];
          var n = list.length;
          if (n <= 4) return;
          var oldest = null, overdueChk = 0;
          list.forEach(function (d) {
            if (!oldest || d.ts < oldest) oldest = d.ts;
            if (d.checkInDate && days(d.checkInDate, today) > 0) overdueChk++;
          });
          out.push(fin('R5', n > 6 ? 4 : 3, 'high', 'open count is computed from your own assignment/close events',
            pName(P, pid) + ' carries ' + n + ' open delegations',
            ['threshold: >4 open → sev 3, >6 open → sev 4 (' + n + ' open now)',
             'oldest open assignment: ' + fmtD(oldest) + ' (' + days(oldest, today) + 'd)',
             overdueChk ? overdueChk + ' of them past their own check-in date — check-ins are how delegation avoids becoming abandonment' : 'no check-in dates are past',
             'close what is done; renegotiate the rest — load you priced beats load you discover'],
            list.map(function (d) { return d.id; }), 'R5:' + pid));
        });
        return out;
      } },

    { id: 'R6', tag: 'conflict', play: 'desc',
      params: 'same pair ≥2 conflicts in 60d; resolution clears until a NEWER conflict reopens; conf HIGH both ids / MEDIUM one / LOW text-only; flat window named in basis',
      fn: function (P, today) {
        var out = [];
        var byPair = {};
        P.openConflicts.forEach(function (c) {
          if (days(c.ts, today) > 60) return;
          (byPair[c.pairKey] = byPair[c.pairKey] || []).push(c);
        });
        Object.keys(byPair).forEach(function (pk) {
          var list = byPair[pk];
          if (list.length < 2) return;
          var conf = pk.indexOf('ids:') === 0 ? 'high' : pk.indexOf('one:') === 0 ? 'medium' : 'low';
          var names = pk.indexOf('ids:') === 0
            ? pName(P, list[0].aId) + ' × ' + pName(P, list[0].bId)
            : pk.indexOf('one:') === 0 ? pName(P, list[0].aId || list[0].bId) + ' × (unnamed party)' : '"' + (list[0].text || '').slice(0, 40) + '"';
          var sev = conf === 'high' ? 4 : 3;
          out.push(fin('R6', sev, conf,
            conf === 'high' ? 'both parties are identified roster members' : conf === 'medium' ? 'only one party identified — pair matching is partially textual' : 'text-only conflicts — pair matching is fuzzy text, priced LOW and said so',
            'Repeated conflict: ' + names + ' (' + list.length + '× in 60d)',
            ['conflicts counted in window (60d, flat — no recency weighting; a named gap): ' + list.map(function (c) { return fmtD(c.ts); }).join(', '),
             'resolution state: no newer resolution cleared this pair — it is live',
             conf === 'low' ? 'LOW confidence is the price of free-text conflicts: log aId/bId for a stronger basis' : 'two repeats is a pattern asking for a structure fix, not a third conversation',
             'open the DESC playbook pre-filled for this pair'],
            list.map(function (c) { return c.id; }), 'R6:' + pk));
        });
        return out;
      } },

    { id: 'R7', tag: 'burnout', play: 'oneonone',
      params: 'measured pulses only · n≥3 in 45d · A: mean load ≥8/10 · B: mood slope ≤−0.5/wk over span ≥7d · out-of-range excluded + counted · sev stays 3 (a trend is a signal, not a diagnosis)',
      fn: function (P, today) {
        var out = [];
        Object.keys(P.pulsesByPerson).forEach(function (pid) {
          if (!P.peopleById[pid] || P.peopleById[pid].archived) return;
          var win = [], estN = 0, oorN = 0;
          P.pulsesByPerson[pid].forEach(function (ev) {
            var age = days(ev.ts, today);
            if (age == null || age > 45) return;
            if (!ev.measured) { estN++; return; }
            if (typeof ev.load !== 'number' || typeof ev.mood !== 'number' || ev.load < 0 || ev.load > 10 || ev.mood < 0 || ev.mood > 10) { oorN++; return; }
            win.push(ev);
          });
          if (win.length < 3) return; /* trends need ≥3 measured points — hard floor */
          win.sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });
          var meanLoad = win.reduce(function (s, e) { return s + e.load; }, 0) / win.length;
          /* least-squares mood slope per week over the measured span */
          var x0 = dayUTC(win[0].ts), xn = dayUTC(win[win.length - 1].ts), span = xn - x0;
          var slope = 0;
          if (span >= 7) {
            var mx = 0, my = 0, i;
            for (i = 0; i < win.length; i++) { mx += (dayUTC(win[i].ts) - x0) / 7; my += win[i].mood; }
            mx /= win.length; my /= win.length;
            var num = 0, den = 0, x;
            for (i = 0; i < win.length; i++) { x = (dayUTC(win[i].ts) - x0) / 7; num += (x - mx) * (win[i].mood - my); den += (x - mx) * (x - mx); }
            slope = den ? num / den : 0;
          }
          var trigA = meanLoad >= 8;
          var trigB = span >= 7 && slope <= -0.5;
          if (!trigA && !trigB) return;
          var ex = [];
          if (estN) ex.push(estN + ' estimated pulse(s) excluded — self-reported guesses don’t build trends');
          if (oorN) ex.push(oorN + ' out-of-range reading(s) excluded (accepted 0–10; got garbage)');
          out.push(fin('R7', 3, 'medium',
            'n=' + win.length + ' measured in 45d' + (span >= 7 ? ' · span ' + span + 'd' : '') + ' — a signal to talk, not a verdict',
            'Burnout signals for ' + pName(P, pid) + (trigA && trigB ? ' (load + mood)' : trigA ? ' (load)' : ' (mood trend)'),
            [(trigA ? 'trigger A: mean measured load ' + meanLoad.toFixed(1) + '/10 ≥ 8 · ' : '') + (trigB ? 'trigger B: mood slope ' + slope.toFixed(2) + '/wk ≤ −0.5 over ' + span + 'd' : ''),
             'measured readings: ' + win.map(function (e) { return fmtD(e.ts) + ' L' + e.load + '/M' + e.mood; }).join(' · '),
             ex.length ? ex.join(' · ') : 'all in-window pulses measured and in range',
             'SEV STAYS 3 BY DESIGN: the playbook is a load-cutting 1:1, not a conclusion'],
            win.map(function (e) { return e.id; }), 'R7:' + pid));
        });
        return out;
      } },

    { id: 'R8', tag: 'skip-level', play: 'oneonone',
      params: 'NEW pt-2 · people exactly one live lead below you · strictly past skip cadence (row value, else settings default 60d, printed) · never-logged fires MEDIUM conf from createdAt · broken lines stay silent here (R9 reports them)',
      fn: function (P, today) {
        var out = [];
        P.skips.forEach(function (p) {
          var lead = P.peopleById[p.reportsTo];
          var cad = skipCad(P, p);
          var via = 'via ' + (lead ? lead.name : '?') + ' (your direct) · ' + cad.src;
          var last = P.skiplevelLast[p.id];
          if (last) {
            var gap = days(last.ts, today);
            if (gap != null && gap > cad.days) {
              out.push(fin('R8', 3, 'high', 'measured against your own logged skip-levels',
                'Skip-level with ' + p.name + ' is ' + (gap - cad.days) + 'd overdue',
                ['last skip-level ' + fmtD(last.ts) + ' → ' + gap + 'd ago · ' + via,
                 'skips decay silently — the lead filters everything you know about this person',
                 'source: skiplevel.logged ' + last.id],
                [last.id], 'R8:' + p.id));
            }
          } else if (p.createdAt && days(p.createdAt, today) > cad.days) {
            out.push(fin('R8', 3, 'medium', 'never logged — measured from the day they joined the roster, not a real session',
              'No skip-level ever logged with ' + p.name,
              ['added ' + fmtD(p.createdAt) + ' (' + days(p.createdAt, today) + 'd ago) · ' + via,
               'their lead has a 1:1 cadence; this person has only a rumor of you'],
              [], 'R8:' + p.id));
          }
        });
        return out;
      } },

    { id: 'R9', tag: 'lines', play: null,
      params: 'NEW pt-2 · reporting line dangling (missing/archived target) or in a cycle → sev 3, conf HIGH (the stored ref is explicit data; the fix is judgment) · R8 stays silent on these people until repaired',
      fn: function (P, today) {
        var out = [];
        P.lines.broken.forEach(function (b) {
          out.push(fin('R9', 3, 'high', 'the stored reportsTo value is explicit data — no inference; choosing the right new line is yours',
            'Broken reporting line: ' + b.person.name,
            ['reason: ' + b.detail,
             'until repaired this person is invisible to skip-level cadence (R8 stays silent) and to span-load pricing',
             'fix on the Roster — the line editor refuses circles'],
            [], 'R9:' + b.person.id));
        });
        return out;
      } }
  ];

  function scoreOf(f) { return Math.round(f.sev * (CONF_FACTOR[f.conf] || 0) * 10) / 10; }

  /* run(P, todayIso) → findings, ranked, with suppression + loud rule errors */
  function run(P, today) {
    var findings = [];
    RULES.forEach(function (r) {
      var got;
      try { got = r.fn(P, today) || []; }
      catch (e) {
        got = [fin('ENG', 5, 'high', 'a broken rule shouts; it never silently skips',
          'Rule ' + r.id + ' threw: ' + e.message,
          ['the engine caught an exception in ' + r.id + ' — every other rule still ran',
           'this finding cannot be snoozed below sev 3; fix the cause, not the symptom'],
          [], 'ENG:' + r.id)];
      }
      got.forEach(function (f) {
        var fp = { rule: f.rule, sev: f.sev, conf: f.conf, confWhy: f.confWhy, title: f.title, basis: f.basis, sources: f.sources, key: f.key };
        fp.score = scoreOf(fp);
        fp.scoreMath = f.rule + ' · sev ' + f.sev + ' × conf ' + f.conf + ' (' + (CONF_FACTOR[f.conf] || 0) + ') = ' + fp.score;
        var s = P.suppressed[fp.key];
        if (s) { fp.hidden = s.kind; }
        findings.push(fp);
      });
    });
    var visible = findings.filter(function (f) { return !f.hidden; });
    visible.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.sev !== a.sev) return b.sev - a.sev;
      return (a.rule + a.key) < (b.rule + b.key) ? -1 : 1;
    });
    return { findings: visible, hiddenCount: findings.length - visible.length, ran: RULES.length };
  }

  /* ---------- golden suite: every rule has a case built against real code paths ---------- */
  function mkState(people, events) {
    return { meta: LEADOS.store.freshState().meta, people: people, events: events };
  }
  function P(n, opts) {
    opts = opts || {};
    var p = { id: 'p-' + n, name: n, role: '', team: '', cadenceDays: opts.cad || null, skipCadenceDays: opts.scad || null,
      reportsTo: opts.m !== undefined ? opts.m : null, archived: !!opts.arch, createdAt: opts.age != null ? isoDaysBefore(opts.age) : null };
    if (opts.id) p.id = opts.id;
    return p;
  }
  var T0 = '2026-03-01T00:00:00.000Z';
  function isoDaysBefore(n) { var d = new Date(T0); return new Date(d.getTime() - n * 864e5).toISOString(); }
  function E(type, ageDays, data) { return { id: 'e' + (++E._n), ts: isoDaysBefore(ageDays), type: type, data: data || {} }; }
  E._n = 0;

  function has(findings, rule, keySub) {
    return findings.filter(function (f) { return f.rule === rule && (!keySub || f.key.indexOf(keySub) >= 0); });
  }
  function none(findings, rule, keySub) { return has(findings, rule, keySub).length === 0; }

  var GOLDENS = [
    { id: 'G1', name: 'R1 strictly-past cadence fires; inside-cadence silent', run: function () {
      var st = mkState([P('Ada', { cad: 7 }), P('Bob', { cad: 14 })],
        [E('oneonone.logged', 15, { personId: 'p-Ada' }), E('oneonone.logged', 3, { personId: 'p-Bob' })]);
      var out = run(LEADOS.events.project(st), T0).findings;
      var a = has(out, 'R1', 'p-Ada')[0];
      if (!a) return 'R1 missing for Ada (15d vs 7d cadence)';
      if (a.basis.join(' ').indexOf('8') < 0) return 'R1 basis should say 8d overdue; got: ' + a.basis[0];
      if (a.conf !== 'high') return 'R1 logged-cadence conf should be high, got ' + a.conf;
      return none(out, 'R1', 'p-Bob') ? null : 'R1 must stay silent at 3d vs 14d';
    } },
    { id: 'G2', name: 'R1 never-logged MEDIUM conf from createdAt; young person silent', run: function () {
      var st = mkState([P('Cid', { age: 20 }), P('Dee', { age: 5 })], []);
      var out = run(LEADOS.events.project(st), T0).findings;
      var a = has(out, 'R1', 'p-Cid')[0];
      if (!a) return 'R1 never-logged missing for Cid';
      if (a.conf !== 'medium') return 'never-logged conf should be medium, got ' + a.conf;
      return none(out, 'R1', 'p-Dee') ? null : 'R1 must stay silent for a 5d-old row';
    } },
    { id: 'G3', name: 'R2 inherits severity clamped 3–5; outcome and future review silent', run: function () {
      var st = mkState([], [
        E('decision.logged', 30, { title: 'A', severity: 5, reviewDate: isoDaysBefore(3) }),
        E('decision.logged', 30, { title: 'B', severity: 2, reviewDate: isoDaysBefore(3) }),
        E('decision.logged', 30, { title: 'C', severity: 4, reviewDate: '2026-03-10T00:00:00.000Z' }),
        E('decision.logged', 30, { title: 'D', severity: 4, reviewDate: isoDaysBefore(3) })
      ]);
      st.events[3].id = 'e-dec-D';
      st.events.push({ id: 'e-out-D', ts: isoDaysBefore(1), type: 'decision.outcome', data: { decisionId: 'e-dec-D', result: 'kept' } });
      var out = run(LEADOS.events.project(st), T0).findings;
      var sevs = has(out, 'R2').map(function (f) { return f.sev; }).sort();
      if (sevs.join(',') !== '3,5') return 'expected sevs [3,5] (B clamps up, A inherits), got ' + sevs.join(',');
      if (has(out, 'R2').some(function (f) { return f.title.indexOf('"C"') >= 0 || f.title.indexOf('"D"') >= 0; })) return 'R2 must be silent for future review and for answered decisions';
      return null;
    } },
    { id: 'G4', name: 'R3 ownerless HIGH conf; silent-from-progress HIGH; silent-from-creation MEDIUM', run: function () {
      var st = mkState([P('Eva')], [
        E('goal.set', 20, { goalId: 'g1', title: 'ownerless' }),
        E('goal.set', 45, { goalId: 'g2', title: 'owned', ownerId: 'p-Eva' }),
        E('goal.progress', 18, { goalId: 'g2', note: 'x' }),
        E('goal.set', 2, { goalId: 'g3', title: 'fresh', ownerId: 'p-Eva' }),
        E('goal.progress', 1, { goalId: 'g3', note: 'y' })
      ]);
      var out = run(LEADOS.events.project(st), T0).findings;
      var o = has(out, 'R3', 'R3o:g1')[0]; if (!o || o.conf !== 'high') return 'ownerless should fire conf high';
      var s2 = has(out, 'R3', 'R3s:g2')[0]; if (!s2 || s2.conf !== 'high') return 'silent-from-progress should be HIGH conf';
      var s1 = has(out, 'R3', 'R3s:g1')[0]; if (!s1 || s1.conf !== 'medium') return 'silent-from-creation should be MEDIUM conf';
      return none(out, 'R3', 'g3') ? null : 'R3 must be silent for a fresh active goal';
    } },
    { id: 'G5', name: 'R4 imbalance thresholds: n=5 HIGH, n=4 MEDIUM, n<3 silent, polarity-missing excluded', run: function () {
      function fb(pid, kind, age) { return E('feedback.given', age, { personId: pid, polarity: kind }); }
      var evs = [fb('p-Fay', 'corrective', 50), fb('p-Fay', 'corrective', 40), fb('p-Fay', 'corrective', 30), fb('p-Fay', 'corrective', 20), fb('p-Fay', 'corrective', 10),
        fb('p-Gus', 'corrective', 40), fb('p-Gus', 'corrective', 30), fb('p-Gus', 'corrective', 20), fb('p-Gus', 'corrective', 10),
        fb('p-Hal', 'corrective', 30), fb('p-Hal', 'corrective', 20),
        fb('p-Ivy', 'positive', 30), fb('p-Ivy', 'corrective', 20), fb('p-Ivy', 'corrective', 10),
        E('feedback.given', 15, { personId: 'p-Jay' }), fb('p-Jay', 'positive', 12), fb('p-Jay', 'positive', 10), fb('p-Jay', 'positive', 8)];
      var st = mkState([P('Fay'), P('Gus'), P('Hal'), P('Ivy'), P('Jay')], evs);
      var out = run(LEADOS.events.project(st), T0).findings;
      var f = has(out, 'R4', 'p-Fay')[0]; if (!f || f.conf !== 'high') return 'n=5 should fire HIGH';
      var g = has(out, 'R4', 'p-Gus')[0]; if (!g || g.conf !== 'medium') return 'n=4 should fire MEDIUM';
      if (!none(out, 'R4', 'p-Hal')) return 'n=2 must be silent';
      if (!none(out, 'R4', 'p-Ivy')) return '60/40 mix must be silent';
      var j = has(out, 'R4', 'p-Jay')[0]; if (!j) return 'n=3 positive (one no-polarity excluded) should fire';
      if (j.basis.join(' ').indexOf('lacked polarity') < 0) return 'basis must print the excluded no-polarity event';
      return null;
    } },
    { id: 'G6', name: 'R5 load: 5→sev3, 7→sev4, 4 silent, closing drops below', run: function () {
      function d5(pid, n) { var evs = []; for (var i = 0; i < n; i++) evs.push(E('delegation.assigned', 30 - i, { personId: pid, task: 't' + i, level: 3 })); return evs; }
      var evs = d5('p-Kai', 5).concat(d5('p-Liv', 7)).concat(d5('p-Mel', 4));
      var st = mkState([P('Kai'), P('Liv'), P('Mel')], evs);
      var out = run(LEADOS.events.project(st), T0).findings;
      var a = has(out, 'R5', 'p-Kai')[0]; if (!a || a.sev !== 3) return '>4 should be sev 3';
      var b = has(out, 'R5', 'p-Liv')[0]; if (!b || b.sev !== 4) return '>6 should be sev 4';
      if (!none(out, 'R5', 'p-Mel')) return 'n=4 must be silent';
      var evs2 = d5('p-Kai', 5);
      var st2 = mkState([P('Kai')], evs2.concat([{ id: 'e-close', ts: isoDaysBefore(1), type: 'delegation.closed', data: { delegationId: evs2[0].id } }]));
      return none(run(LEADOS.events.project(st2), T0).findings, 'R5', 'p-Kai') ? null : 'closing one of 5 must silence R5';
    } },
    { id: 'G7', name: 'R6 pair ≥2/60d; resolution clears; newer conflict reopens; text-only LOW', run: function () {
      var evs = [E('conflict.logged', 40, { aId: 'p-Nia', bId: 'p-Ole', text: 'x' }), E('conflict.logged', 10, { aId: 'p-Nia', bId: 'p-Ole', text: 'y' })];
      var st = mkState([P('Nia'), P('Ole')], evs);
      var out = run(LEADOS.events.project(st), T0).findings;
      var c = has(out, 'R6')[0]; if (!c || c.conf !== 'high' || c.sev !== 4) return 'ids pair should fire sev4/conf high';
      var st2 = mkState([P('Nia'), P('Ole')], evs.concat([E('conflict.resolved', 5, { conflictIds: [evs[1].id], pairKey: 'ids:p-Nia|p-Ole' })]));
      if (!none(run(LEADOS.events.project(st2), T0).findings, 'R6')) return 'resolution must clear the pair';
      var st3 = mkState([P('Nia'), P('Ole')], st2.events.concat([E('conflict.logged', 2, { aId: 'p-Nia', bId: 'p-Ole', text: 'z' })]));
      if (none(run(LEADOS.events.project(st3), T0).findings, 'R6')) return 'a newer conflict must reopen the pair';
      var evs4 = [E('conflict.logged', 30, { text: 'hallway tension' }), E('conflict.logged', 12, { text: 'hallway tension again' })];
      var t = has(run(LEADOS.events.project(mkState([], evs4)), T0).findings, 'R6')[0];
      return t && t.conf === 'low' ? null : 'text-only pair should fire LOW conf, got ' + (t && t.conf);
    } },
    { id: 'G8', name: 'R7 measured-only: A load-mean, B mood-slope, estimated/out-of-range excluded, sev 3 ceiling', run: function () {
      function pu(pid, ago, l, m, meas) { return E('pulse.recorded', ago, { personId: pid, load: l, mood: m, measured: meas !== false }); }
      var stA = mkState([P('Pat')], [pu('p-Pat', 20, 9, 7), pu('p-Pat', 10, 8, 7), pu('p-Pat', 2, 9, 7)]);
      var a = has(run(LEADOS.events.project(stA), T0).findings, 'R7', 'p-Pat')[0];
      if (!a || a.basis.join(' ').indexOf('trigger A') < 0) return 'trigger A should fire on mean load ≥8';
      if (a.sev !== 3) return 'R7 must NEVER exceed sev 3, got ' + a.sev;
      var stB = mkState([P('Quin')], [pu('p-Quin', 21, 4, 6), pu('p-Quin', 10, 4, 5), pu('p-Quin', 2, 4, 4)]);
      var b = has(run(LEADOS.events.project(stB), T0).findings, 'R7', 'p-Quin')[0];
      if (!b || b.basis.join(' ').indexOf('trigger B') < 0) return 'trigger B should fire on slope −1/wk over 19d';
      var stC = mkState([P('Rue')], [pu('p-Rue', 20, 9, 3, false), pu('p-Rue', 10, 99, 1), pu('p-Rue', 2, 9, 6)]);
      if (!none(run(LEADOS.events.project(stC), T0).findings, 'R7', 'p-Rue')) return 'estimated + out-of-range must leave n=1 → silent';
      var stD = mkState([P('Sam')], [pu('p-Sam', 10, 9, 3), pu('p-Sam', 2, 9, 2)]);
      return none(run(LEADOS.events.project(stD), T0).findings, 'R7', 'p-Sam') ? null : 'n=2 measured must stay silent (hard floor)';
    } },
    { id: 'G9', name: 'R8 skip cadence: overdue fires, recent silent, directs silent, row cadence respected', run: function () {
      var dana = P('Dana'); var p1 = P('Ann', { m: 'p-Dana', scad: 30 }); var p2 = P('Ben', { m: 'p-Dana', scad: 30 }); var p3 = P('Cat', { m: 'p-Dana', age: 70 });
      var evs = [E('skiplevel.logged', 40, { personId: 'p-Ann' }), E('skiplevel.logged', 5, { personId: 'p-Ben' })];
      var st = mkState([dana, p1, p2, p3], evs);
      var out = run(LEADOS.events.project(st), T0).findings;
      var a = has(out, 'R8', 'p-Ann')[0]; if (!a) return 'R8 missing for Ann (40d vs 30d)';
      if (a.basis.join(' ').indexOf('Dana') < 0) return 'R8 basis must name the lead';
      if (!none(out, 'R8', 'p-Ben')) return 'R8 must be silent at 5d';
      if (!none(out, 'R8', 'p-Dana')) return 'R8 must never fire for a direct report';
      var c = has(out, 'R8', 'p-Cat')[0];
      if (!c || c.conf !== 'medium' || c.basis.join(' ').indexOf('default') < 0) return 'never-logged skip over default 60d should fire MEDIUM conf with the default printed';
      var st2 = mkState([P('Dana'), P('Cat', { m: 'p-Dana', age: 70, scad: 90 })], []);
      return none(run(LEADOS.events.project(st2), T0).findings, 'R8', 'p-Cat') ? null : 'row skipCadenceDays 90 must be respected at 70d';
    } },
    { id: 'G10', name: 'engine memory: snooze hides, unmute restores, dismiss hides', run: function () {
      var base = [E('oneonone.logged', 20, { personId: 'p-Tom' })];
      var st = mkState([P('Tom', { cad: 7 })], base);
      if (!has(run(LEADOS.events.project(st), T0).findings, 'R1', 'p-Tom')[0]) return 'fixture broken: R1 should fire';
      var stS = mkState([P('Tom', { cad: 7 })], base.concat([E('engine.snoozed', 1, { key: 'R1:p-Tom', until: '2026-03-05T00:00:00.000Z' })]));
      if (has(run(LEADOS.events.project(stS), T0).findings, 'R1', 'p-Tom')[0]) return 'snoozed finding must hide';
      var stU = mkState([P('Tom', { cad: 7 })], stS.events.concat([E('engine.unmuted', 0, { key: 'R1:p-Tom' })]));
      if (!has(run(LEADOS.events.project(stU), T0).findings, 'R1', 'p-Tom')[0]) return 'unmute must restore';
      var stD = mkState([P('Tom', { cad: 7 })], base.concat([E('engine.dismissed', 1, { key: 'R1:p-Tom' })]));
      return has(run(LEADOS.events.project(stD), T0).findings, 'R1', 'p-Tom')[0] ? 'dismissed finding must hide' : null;
    } },
    { id: 'G11', name: 'ranking is printed score math: sev×conf desc', run: function () {
      var evs = [E('oneonone.logged', 20, { personId: 'p-Uma' }),
        E('decision.logged', 30, { title: 'big', severity: 5, reviewDate: isoDaysBefore(3) }),
        E('pulse.recorded', 20, { personId: 'p-Uma', load: 9, mood: 7, measured: true }),
        E('pulse.recorded', 10, { personId: 'p-Uma', load: 9, mood: 7, measured: true }),
        E('pulse.recorded', 2, { personId: 'p-Uma', load: 9, mood: 7, measured: true })];
      var out = run(LEADOS.events.project(mkState([P('Uma', { cad: 7 })], evs)), T0).findings;
      if (out.length < 3) return 'expected ≥3 findings (R1,R2,R7), got ' + out.length;
      var ok = out[0].rule === 'R2' && out[0].score === 5 && out[1].rule === 'R1' && out[1].score === 3 && out[2].rule === 'R7' && out[2].score === 2.1;
      return ok ? null : 'expected order R2(5.0)>R1(3.0)>R7(2.1), got ' + out.map(function (f) { return f.rule + '(' + f.score + ')'; }).join('>');
    } },
    { id: 'G12', name: 'R9 line integrity: dangling target and cycles fire; R8 silent for them', run: function () {
      var st = mkState([P('Van', { m: 'p-ghost', age: 80 })], []);
      var out = run(LEADOS.events.project(st), T0).findings;
      var a = has(out, 'R9', 'p-Van')[0];
      if (!a || a.basis.join(' ').indexOf('p-ghost') < 0) return 'R9 must fire naming the dangling target';
      if (!none(out, 'R8', 'p-Van')) return 'R8 must stay silent on broken lines';
      var st2 = mkState([P('Wes', { m: 'p-Xan' }), P('Xan', { m: 'p-Wes' })], []);
      var out2 = run(LEADOS.events.project(st2), T0).findings;
      var c = has(out2, 'R9');
      if (c.length !== 2 || c[0].basis.join(' ').indexOf('cycle') < 0) return 'cycle should produce R9 for both members naming the cycle, got ' + c.length;
      return none(out2, 'R8') ? null : 'R8 must stay silent for cycle members';
    } }
  ];

  function runGoldens() {
    return GOLDENS.map(function (g) {
      var fail = null;
      try { fail = g.run(); } catch (e) { fail = 'threw: ' + e.message; }
      return { id: g.id, name: g.name, pass: !fail, detail: fail || '' };
    });
  }

  var DOCTRINE = [
    ['Ranking', 'score = severity (1–5) × confidence factor (high 1.0 · medium 0.7 · low 0.45); ties by sev, then key. Math printed on every row.'],
    ['Severity', '3 = standard pressure · 4 = inherited or structural (decision sev 4+, >6 delegations, repeated conflict with ids) · 5 = decision sev 5 or a broken rule (ENG). Trend-based findings (R7) never exceed 3.'],
    ['Confidence', 'priced from the basis, never decorative: measured-vs-assumed cadence · n-in-window · ids-vs-text pair matching · measured-vs-estimated pulses.'],
    ['Silence rules', 'missing fields skip rather than infer · trends need ≥3 measured points · n<3 feedback events stays silent · broken lines stay silent in R8 (R9 reports them instead).'],
    ['Memory', 'snooze/dismiss/unmute are events — auditable, exportable, reversible. Suppressed findings are counted on Today, never quietly gone.'],
    ['Sources', 'every finding carries the event ids that triggered it; a finding without sources is a confession.']
  ];

  return { CONF_FACTOR: CONF_FACTOR, RULES: RULES, run: run, runGoldens: runGoldens, DOCTRINE: DOCTRINE, scoreOf: scoreOf,
    days: days, fmtD: fmtD, dayUTC: dayUTC };
})();
