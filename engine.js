/* LeadOS pt-3 · js/engine.js — the rules engine (the product).
   Carried byte-verified from pt-2 (read this session): CONF_FACTOR {high:1,
   medium:.7, low:.45} · fin() shape (what + why basis lines + source ids +
   confidence with its own why) · R1–R4 near-verbatim (byte-read) · R5–R9 to the
   pt-2 documented contract (upstream bodies never byte-readable — labeled) ·
   printed score math (sev × conf factor) · rule exceptions surface as loud ENG
   findings · suppression read from events (dismiss = gone until unmute; snooze =
   hidden until the date passes, then RESURFACES — golden G10).
   NEW in pt-3: R10 growth-plan follow-through (reviewBy strictly past, no
   check-in on/after that day; sev 2 → 3 past 14d; conf HIGH — your own dates;
   resolved by a plan.checkin, not by dismissal) · goldens G1–G13 in js/health.js.
   Non-negotiables: trends need ≥3 MEASURED points · missing fields skip rather
   than infer · a count is never stated as certainty · sev 3 = ceiling for
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
    var score = sev * CONF_FACTOR[conf];
    return { rule: rule, sev: sev, conf: conf, confWhy: confWhy, title: title, basis: basis || [], sources: sources || [], key: key,
      score: Math.round(score * 100) / 100,
      scoreMath: 'sev ' + sev + ' × conf ' + conf + ' ' + CONF_FACTOR[conf].toFixed(2) + ' = ' + (Math.round(score * 100) / 100).toFixed(2) };
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
      params: 'ownerless fires (conf HIGH — explicit null is data); silent >14d strictly (conf HIGH from last progress, MEDIUM from creation); exactly 14d does NOT fire (G11)',
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
               'silence threshold 14d (strictly past — exactly 14d stays quiet, G11 grades this) · progress events logged: ' + g.progressN],
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
          var win = [], skippedNoPolarity = 0, src = [];
          P.feedbackByPerson[pid].forEach(function (ev) {
            var age = days(ev.ts, today);
            if (age == null || age > 60) return;
            if (ev.polarity === 'positive' || ev.polarity === 'corrective') { win.push(ev.polarity); src.push(ev.id); }
            else skippedNoPolarity++;
          });
          if (win.length < 3) return; /* insufficient data → silence, by design (G4 grades the boundary) */
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
             skippedNoPolarity ? skippedNoPolarity + ' event(s) lacked polarity — excluded from the count, not guessed' : 'every in-window event had explicit polarity'],
            src, 'R4:' + pid));
        });
        return out;
      } },

    { id: 'R5', tag: 'delegation', play: 'delegation',
      params: '>4 open delegations per person → sev 3 · >6 → sev 4 (G5 grades 4/5/6/7)',
      fn: function (P, today) {
        var out = [];
        Object.keys(P.delegationsOpenByPerson).forEach(function (pid) {
          if (!P.peopleById[pid] || P.peopleById[pid].archived) return;
          var open = P.delegationsOpenByPerson[pid];
          if (open.length <= 4) return;
          out.push(fin('R5', open.length > 6 ? 4 : 3, 'high', 'a count of your own open delegation rows — data, not a trend',
            pName(P, pid) + ' is holding ' + open.length + ' open delegations',
            ['open delegations: ' + open.length + ' (>4 fires sev 3, >6 fires sev 4) · ' + open.slice(0, 3).map(function (x) { return '"' + x.task + '" L' + (x.level || '—'); }).join(' · ') + (open.length > 3 ? ' · …' : ''),
             'load that never finishes converts a developer into a queue — close, downgrade the level, or re-scope'],
            open.map(function (x) { return x.id; }), 'R5:' + pid));
        });
        return out;
      } },

    { id: 'R6', tag: 'conflict', play: 'desc',
      params: '≥2 conflicts for one pair in 60d → sev 3 (≥3 → sev 4); resolution clears the pair until a NEWER conflict reopens; conf = HIGH both ids / MEDIUM one / LOW text-only; flat window printed',
      fn: function (P, today) {
        var out = [];
        P.openConflictPairs.forEach(function (pair) {
          var win = pair.events.filter(function (ev) { var a = days(ev.ts, today); return a != null && a <= 60; });
          if (win.length < 2) return;
          var latest = win[win.length - 1];
          var conf = (latest.aId && latest.bId) ? 'high' : (latest.aId || latest.bId) ? 'medium' : 'low';
          var who = conf === 'high' ? pName(P, latest.aId) + ' ↔ ' + pName(P, latest.bId)
            : conf === 'medium' ? pName(P, latest.aId || latest.bId) + ' + unlinked party'
            : 'a text-only pair (“' + (latest.text || '').slice(0, 40) + '…”)';
          out.push(fin('R6', win.length >= 3 ? 4 : 3, conf,
            conf === 'low' ? 'no roster ids on the latest conflict — a name in prose is the weakest signal there is'
              : conf === 'medium' ? 'one party is a free-text name — link both people on the roster for HIGH'
              : 'both parties are roster people; repeats are counted on their shared pair key',
            'Repeated conflict: ' + who,
            [win.length + ' conflicts in 60d on pair ' + pair.pairKey + ' (flat 60d window — printed, not weighted; ≥3 raises sev to 4)',
             'latest ' + fmtD(latest.ts) + ' · ' + (pair.lastResolvedTs ? 'a resolution exists (' + fmtD(pair.lastResolvedTs) + ') but a NEWER conflict reopened the pair' : 'never resolved'),
             'a third conversation about the same thing is a process problem, not a people problem'],
            win.map(function (x) { return x.id; }), 'R6:' + pair.pairKey));
        });
        return out;
      } },

    { id: 'R7', tag: 'burnout', play: 'oneonone',
      params: 'measured pulses only, n≥3 in 45d · trigger A mean load ≥8/10 · trigger B mood slope ≤−0.5/wk over span ≥7d (least-squares, printed) · estimated + out-of-range excluded + counted · sev 3 permanently: a trend is a signal, not a diagnosis',
      fn: function (P, today) {
        var out = [];
        Object.keys(P.pulsesByPerson).forEach(function (pid) {
          if (!P.peopleById[pid] || P.peopleById[pid].archived) return;
          var measured = [], excluded = 0;
          P.pulsesByPerson[pid].forEach(function (pu) {
            var age = days(pu.ts, today);
            if (age == null || age > 45) return;
            if (!pu.measured) { excluded++; return; }
            if (typeof pu.load !== 'number' || pu.load < 0 || pu.load > 10 || typeof pu.mood !== 'number' || pu.mood < 0 || pu.mood > 10) { excluded++; return; }
            measured.push(pu);
          });
          if (measured.length < 3) return; /* trend discipline: <3 measured points → silence (G7) */
          measured.sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });
          var loadSum = 0, i;
          for (i = 0; i < measured.length; i++) loadSum += measured[i].load;
          var meanLoad = Math.round((loadSum / measured.length) * 10) / 10;
          var trigA = meanLoad >= 8;
          /* least-squares mood slope per week over the measured span */
          var d0 = dayUTC(measured[0].ts), spanD = (dayUTC(measured[measured.length - 1].ts) - d0);
          var trigB = false, slopeWk = 0;
          if (spanD >= 7) {
            var n = measured.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
            for (i = 0; i < n; i++) {
              var x = (dayUTC(measured[i].ts) - d0) / 7, y = measured[i].mood;
              sx += x; sy += y; sxy += x * y; sxx += x * x;
            }
            var den = n * sxx - sx * sx;
            if (den !== 0) {
              var slope = (n * sxy - sx * sy) / den;
              slopeWk = Math.round(slope * 100) / 100;
              trigB = slope <= -0.5;
            }
          }
          if (!trigA && !trigB) return;
          out.push(fin('R7', 3, 'medium', 'a trend over ' + measured.length + ' measured readings — MEDIUM is the ceiling; sev 3 permanently: this is a signal to go and talk, never a diagnosis',
            'Load/mood trend says check on ' + pName(P, pid),
            [trigA ? 'trigger A: mean load ' + meanLoad + '/10 across ' + measured.length + ' measured pulses in 45d (threshold ≥8)' : 'trigger A not met (mean load ' + meanLoad + '/10)',
             trigB ? 'trigger B: mood slope ' + slopeWk + '/wk over a ' + spanD + 'd span (threshold ≤−0.5, least-squares on measured points)' : 'trigger B not met' + (spanD >= 7 ? ' (slope ' + slopeWk + '/wk)' : ' (span ' + spanD + 'd < 7d — slope not computed)'),
             excluded ? excluded + ' pulse(s) excluded — estimated or out of range 0–10, counted not guessed' : 'all in-window pulses were measured and in range',
             'the right next step is a conversation, not an intervention — the playbook pre-loads the talking points'],
            measured.map(function (x) { return x.id; }), 'R7:' + pid));
        });
        return out;
      } },

    { id: 'R8', tag: 'skiplevel', play: 'oneonone',
      params: 'people exactly one live lead below you · strictly past skip cadence (person row, else settings default 60d — printed) · never-logged MEDIUM conf from createdAt · broken lines stay SILENT here by design (R9 reports the silence) · sev 2 (one degree removed)',
      fn: function (P, today) {
        var out = [];
        P.skips.forEach(function (p) {
          var cad = skipCad(P, p);
          var last = P.skiplevelLast[p.id];
          if (last) {
            var gap = days(last.ts, today);
            if (gap != null && gap > cad.days) {
              out.push(fin('R8', 2, 'high', 'measured against your own logged skip-levels',
                'Skip-level with ' + p.name + ' is ' + (gap - cad.days) + 'd overdue',
                ['last skip-level ' + fmtD(last.ts) + ' → ' + gap + 'd ago; ' + cad.src + ' — strictly past',
                 'skip-levels are how you hear what your leads smooth over — silence there is information loss you chose'],
                [last.id], 'R8:' + p.id));
            }
          } else if (p.createdAt && days(p.createdAt, today) > cad.days) {
            out.push(fin('R8', 2, 'medium', 'never logged — measured from the day you added them, not from a real conversation',
              'No skip-level ever logged with ' + p.name,
              ['added ' + fmtD(p.createdAt) + ' (' + days(p.createdAt, today) + 'd ago); ' + cad.src,
               'no skiplevel.logged events exist for this person'],
              [], 'R8:' + p.id));
          }
        });
        return out;
      } },

    { id: 'R9', tag: 'lines', play: null,
      params: 'dangling/archived/cycled reportsTo → sev 3, conf HIGH (a stored reference is explicit data; the fix is judgment). Resolves on the Roster, not in a playbook — printed why.',
      fn: function (P, today) {
        var out = [];
        P.lines.broken.forEach(function (b) {
          out.push(fin('R9', 3, 'high', 'the stored reportsTo reference is explicit data; what to do about it is your call, not ours',
            'Broken reporting line: ' + b.name,
            ['why broken: ' + b.why,
             'broken lines silently exclude people from skip-level cadence (R8 stays silent on them BY DESIGN) — this finding exists so that silence is itself reported',
             'no playbook: fix the line on the Roster — the right structure is a judgment call, and automating org design would be faking certainty'],
            [b.id], 'R9:' + b.id));
        });
        return out;
      } },

    { id: 'R10', tag: 'growth', play: 'growth-review',
      params: 'open growth plan with reviewBy strictly past and no plan.checkin on/after that day → sev 2 (>14d late → 3); conf HIGH (your own dates); no reviewBy → skip; resolved by a check-in, not by dismissal — second-run safe, golden G13',
      fn: function (P, today) {
        var out = [];
        P.openPlans.forEach(function (pl) {
          if (!pl.reviewBy) return; /* missing fields skip */
          var late = days(pl.reviewBy, today);
          if (late == null || late <= 0) return;
          var reviewed = pl.checkins > 0 && days(pl.reviewBy, pl.lastActivityTs) >= 0; /* a check-in ON or AFTER the review day counts */
          if (reviewed) return;
          out.push(fin('R10', late > 14 ? 3 : 2, 'high', 'reviewBy is a date you set yourself; check-in absence is explicit — a plan nobody reviews is a plan nobody runs',
            'Growth plan review overdue for ' + pName(P, pl.personId) + ': "' + pl.goal + '"',
            ['created ' + fmtD(pl.ts) + ' · review by ' + fmtD(pl.reviewBy) + ' → ' + late + 'd late (sev 2; >14d late raises to 3 · currently ' + late + 'd)',
             'check-ins logged: ' + pl.checkins + (pl.checkins ? ' (latest ' + fmtD(pl.lastActivityTs) + ' — before the review date, so the review never happened)' : ' — none'),
             'assessed ' + (pl.d || 'D?') + ' → style ' + (pl.s || 'S?') + ' at creation; the review is where you re-assess and change style — that re-assessment IS the coaching'],
            [pl.id], 'R10:' + pl.id));
        });
        return out;
      } }
  ];

  /* run(P, todayIso) → {findings, suppressedCount, engErrors} — pure in P. */
  function run(P, today) {
    var findings = [], engErrors = [];
    RULES.forEach(function (r) {
      var got;
      try { got = r.fn(P, today) || []; }
      catch (e) {
        var errFin = fin('ENG', 5, 'high', 'an engine rule crashed — loud, never swallowed',
          'Rule ' + r.id + ' threw: ' + (e && e.message ? e.message : e),
          ['rule id ' + r.id + ' · params: ' + r.params,
           'this finding means SOME checks did not run — treat Today as incomplete until fixed'],
          [], 'ENG:' + r.id);
        findings.push(errFin); engErrors.push(errFin);
        return;
      }
      for (var i = 0; i < got.length; i++) got[i].play = r.play;
      findings = findings.concat(got);
    });
    var suppressedCount = 0;
    var active = findings.filter(function (f) {
      var s = P.suppressed[f.key];
      if (!s) return true;
      if (s.kind === 'dismissed') { suppressedCount++; return false; }
      if (s.kind === 'snoozed' && s.until && days(today, s.until) >= 0) { suppressedCount++; return false; }
      return true; /* expired snooze RESURFACES — G10 grades this */
    });
    active.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.rule !== b.rule) return a.rule < b.rule ? -1 : 1;
      return a.key < b.key ? -1 : 1;
    });
    return { findings: active, suppressedCount: suppressedCount, engErrors: engErrors };
  }

  return {
    run: run, RULES: RULES, CONF_FACTOR: CONF_FACTOR,
    _fin: fin, _days: days, _dayUTC: dayUTC, _clamp: clamp
  };
})();
