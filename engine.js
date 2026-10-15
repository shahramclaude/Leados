/* LeadOS mf-5 · js/engine.js — the rules engine (the product).
   Doctrine (carried, secondhand-verified from mf-4 README + S8 log):
   rules are PURE (projection P, today) → findings; every finding =
   what + why (basis lines + source event ids) + confidence (level + why)
   + printed score math (sev × conf factor). Rule exceptions surface as
   loud ENG findings — never swallowed. Engine memory (snooze/dismiss/
   unmute) is events, so suppression is auditable and reversible.
   Non-negotiables: trends need ≥3 MEASURED points · missing fields skip
   rather than infer · broken reporting lines go silent rather than guess ·
   a count is never stated as certainty.
   R1–R13 parameters per mf-4 README contract. R14 (meeting load) and
   R15 (premortem gate) are NEW mf-5 — repo gap #1. All code re-authored. */
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
  function slope(points) { /* [ [x, y] ] least squares; x in days */
    var n = points.length; if (n < 2) return 0;
    var mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += points[i][0]; my += points[i][1]; }
    mx /= n; my /= n;
    var num = 0, den = 0;
    for (i = 0; i < n; i++) { num += (points[i][0] - mx) * (points[i][1] - my); den += (points[i][0] - mx) * (points[i][0] - mx); }
    return den === 0 ? 0 : num / den;
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function fin(rule, sev, conf, confWhy, title, basis, sources, key) {
    return { rule: rule, sev: sev, conf: conf, confWhy: confWhy, title: title,
      basis: basis || [], sources: sources || [], key: key };
  }
  function pName(P, pid) { var p = P.peopleById[pid]; return p ? p.name : '(unknown person)'; }
  function fmtDate(iso) { return iso ? String(iso).slice(0, 10) : '—'; }

  var RULES = [
    { id: 'R1', tag: 'cadence', play: 'oneonone', fn: function (P, today) {
      var out = [];
      P.directs.forEach(function (p) {
        var cad = p.cadenceDays || 14;
        var last = P.oneononeLast[p.id];
        if (last) {
          var gap = days(last.ts, today);
          if (gap != null && gap > cad) {
            out.push(fin('R1', 3, 'high', 'measured against your own logged 1:1s',
              '1:1 with ' + p.name + ' is ' + (gap - cad) + 'd overdue',
              ['last 1:1 ' + fmtDate(last.ts) + ' → ' + gap + 'd ago; cadence ' + cad + 'd (person row) — strictly past',
               'source: oneonone.logged ' + last.id],
              [last.id], 'R1:' + p.id));
          }
        } else if (p.createdAt && days(p.createdAt, today) > cad) {
          out.push(fin('R1', 3, 'medium', 'never logged — cadence measured from the day you added them, not from a real 1:1',
            'No 1:1 ever logged with ' + p.name,
            ['added ' + fmtDate(p.createdAt) + ' (' + days(p.createdAt, today) + 'd ago); cadence ' + cad + 'd',
             'no oneonone.logged events exist for this person'],
            [], 'R1:' + p.id));
        }
        /* no last AND no createdAt → skip. Missing fields skip; we don't infer. */
      });
      return out;
    }},
    { id: 'R2', tag: 'decisions', play: 'decision-review', fn: function (P, today) {
      var out = [];
      P.openDecisions.forEach(function (d) {
        if (!d.reviewDate) return; /* no review date → skip (do not infer) */
        var late = days(d.reviewDate, today);
        if (late != null && late > 0) {
          out.push(fin('R2', clamp(d.severity || 3, 3, 5), 'high', 'review date is your own; outcome absence is explicit',
            'Decision past review with no outcome: “' + d.title + '”',
            ['decided ' + fmtDate(d.ts) + ' · review date ' + fmtDate(d.reviewDate) + ' → ' + late + 'd late',
             'severity inherits the decision’s own sev ' + (d.severity || '—') + ' → finding sev ' + clamp(d.severity || 3, 3, 5),
             'no decision.outcome event links to ' + d.id],
            [d.id], 'R2:' + d.id));
        }
      });
      return out;
    }},
    { id: 'R3', tag: 'goals', play: 'goal-review', fn: function (P, today) {
      var out = [];
      P.openGoals.forEach(function (g) {
        if (g.ownerId == null) {
          out.push(fin('R3', 3, 'high', 'owner field is explicitly null — this is data, not inference',
            'Goal has no owner: “' + g.title + '”',
            ['set ' + fmtDate(g.ts) + ' · ownerId null (goal ' + g.id + ')',
             'an unowned goal is a decision you made by omission'],
            [g.id], 'R3o:' + g.id));
        }
        var ref = g.lastProgressTs || g.ts;
        var silent = days(ref, today);
        if (silent != null && silent > 14) {
          out.push(fin('R3', 3, g.lastProgressTs ? 'high' : 'medium',
            g.lastProgressTs ? 'measured from your last logged progress' : 'no progress ever logged — measured from creation date',
            'Goal silent ' + silent + 'd: “' + g.title + '”',
            ['last progress ' + (g.lastProgressTs ? fmtDate(g.lastProgressTs) : 'never logged') + ' · set ' + fmtDate(g.ts),
             'silence threshold 14d · progress events logged: ' + g.progressN],
            g.lastProgressTs ? [g.id] : [g.id], 'R3s:' + g.id));
        }
      });
      return out;
    }},
    { id: 'R4', tag: 'feedback', play: 'sbi', fn: function (P, today) {
      var out = [];
      Object.keys(P.feedbackByPerson).forEach(function (pid) {
        if (!P.peopleById[pid] || P.peopleById[pid].archived) return;
        var win = [], skippedNoPolarity = 0;
        P.feedbackByPerson[pid].forEach(function (ev) {
          var age = days(ev.ts, today);
          if (age == null || age > 60) return;
          var pol = (ev.data || {}).polarity;
          if (pol === 'positive' || pol === 'corrective') win.push(pol);
          else skippedNoPolarity++;
        });
        if (win.length < 3) return; /* insufficient data → silence, by design */
        var pos = win.filter(function (x) { return x === 'positive'; }).length;
        var share = pos / win.length;
        var kind = share >= 0.8 ? 'positive' : share <= 0.2 ? 'corrective' : null;
        if (!kind) return;
        var n = win.filter(function (x) { return x === kind; }).length;
        out.push(fin('R4', 3, win.length >= 5 ? 'high' : 'medium',
          'n=' + win.length + ' in-window (min 3; high needs ≥5)',
          'Feedback to ' + pName(P, pid) + ' is all ' + (kind === 'corrective' ? 'corrective' : 'reinforcing'),
          [n + '/' + win.length + ' ' + kind + ' in the last 60d (imbalance = ≥80% one polarity; min n=3)',
           kind === 'corrective'
             ? 'people under only-corrective feedback stop hearing it — the next one will land as noise'
             : 'people under only-reinforcing feedback stop growing — they can’t tell praise from comfort',
           skippedNoPolarity ? skippedNoPolarity + ' event(s) lacked polarity — excluded from the count, not guessed' : 'every in-window event had explicit polarity'],
          P.feedbackByPerson[pid].slice(-6).map(function (e) { return e.id; }),
          'R4:' + pid));
      });
      return out;
    }},
    { id: 'R5', tag: 'delegation', play: 'delegation', fn: function (P, today) {
      var out = [];
      Object.keys(P.delegationsOpenByPerson).forEach(function (pid) {
        if (!P.peopleById[pid] || P.peopleById[pid].archived) return;
        var list = P.delegationsOpenByPerson[pid];
        if (list.length <= 4) return;
        out.push(fin('R5', list.length > 6 ? 4 : 3, 'high', 'open delegations counted from your own assign/close events',
          pName(P, pid) + ' carries ' + list.length + ' open delegations',
          ['threshold >4 open per person; ' + list.length + ' is ' + (list.length - 4) + ' over',
           list.map(function (ev) { return 'L' + ((ev.data || {}).level || '?') + ' ' + ((ev.data || {}).task || '(task)') + ' · since ' + fmtDate(ev.ts); }).join('\n'),
           'load ≠ fault — but everything past 4 open loops starts deciding your priorities for you'],
          list.map(function (e) { return e.id; }), 'R5:' + pid));
      });
      return out;
    }},
    { id: 'R6', tag: 'conflict', play: 'desc', fn: function (P, today) {
      var out = [];
      Object.keys(P.conflictPairs).forEach(function (pairKey) {
        var members = P.conflictPairs[pairKey].filter(function (c) {
          var age = days(c.ts, today); return age != null && age <= 60;
        });
        if (members.length < 2) return;
        var worst = members.reduce(function (w, c) {
          var rank = { high: 3, medium: 2, low: 1 };
          return rank[c.linkConf] < rank[w] ? c.linkConf : w;
        }, 'high');
        var textLinked = members.some(function (c) { return c.linkConf !== 'high'; });
        out.push(fin('R6', members.length >= 3 ? 4 : 3, worst,
          worst === 'high' ? 'both parties are roster-linked on every conflict in this pair'
            : worst === 'medium' ? 'at least one party is free text — “Dana” vs “dana k.” would be a different pair; drift risk, priced not hidden'
            : 'at least one conflict has an unnamed counterpart — link them in the roster to sharpen this',
          'Repeated unresolved conflict: ' + members[0].pairLabel,
          [members.length + ' open conflicts in the last 60d on one pair:',
           members.map(function (c) { return fmtDate(c.ts) + ' · ' + c.topic + ' (' + c.id + ')'; }).join('\n'),
           'flat 60d window — a pair from 59d ago weighs the same as yesterday; temporal weighting is a ranked gap, stated not hidden'],
          members.map(function (c) { return c.id; }), 'R6:' + pairKey));
      });
      return out;
    }},
    { id: 'R7', tag: 'overload', play: 'oneonone', fn: function (P, today) {
      var out = [];
      Object.keys(P.pulses).forEach(function (pid) {
        if (!P.peopleById[pid] || P.peopleById[pid].archived) return;
        var rec = P.pulses[pid];
        var pts = rec.measured.filter(function (ev) { var age = days(ev.ts, today); return age != null && age <= 45; });
        if (pts.length < 3) return; /* trends need ≥3 MEASURED points — estimates are not data */
        pts.sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });
        var d0 = dayUTC(pts[0].ts);
        var loads = pts.map(function (ev) { return (ev.data || {}).load; });
        var meanLoad = loads.reduce(function (a, b) { return a + b; }, 0) / loads.length;
        var moodSlope = slope(pts.map(function (ev) { return [dayUTC(ev.ts) - d0, (ev.data || {}).mood]; }));
        var sigLoad = meanLoad >= 8, sigMood = moodSlope <= -0.4;
        if (!sigLoad && !sigMood) return;
        out.push(fin('R7', 4, pts.length >= 5 ? 'high' : 'medium',
          'n=' + pts.length + ' measured in 45d (min 3; high needs ≥5) · ' + rec.estimatedCount + ' estimated reading(s) EXCLUDED — the engine does not trend your guesses',
          'Overload signals: ' + pName(P, pid),
          [(sigLoad ? 'mean self-reported load ' + meanLoad.toFixed(1) + '/10 ≥ 8 over ' + pts.length + ' measured readings' : 'load signal clear (' + meanLoad.toFixed(1) + ' < 8)'),
           (sigMood ? 'mood slope ' + moodSlope.toFixed(2) + '/day ≤ −0.4 over ' + pts.length + ' measured readings' : 'mood signal clear (' + moodSlope.toFixed(2) + ' > −0.4)'),
           'window 45d · points ' + pts.map(function (ev) { return fmtDate(ev.ts); }).join(', '),
           'this is a signal, not a diagnosis — the resolving move is a conversation (load-cutting 1:1), not a conclusion'],
          pts.map(function (e) { return e.id; }), 'R7:' + pid);
      });
      return out;
    }},
    { id: 'R8', tag: 'skip-level', play: 'oneonone', fn: function (P, today) {
      var out = [];
      P.actives.forEach(function (p) {
        if (p.reportsTo === 'me') return; /* directs are R1's job */
        var line = P.lineToMe(p);
        if (!line.ok || line.depth !== 2) return; /* broken lines go SILENT — the engine declines to guess your org */
        var last = P.oneononeSkipLast[p.id];
        if (last) {
          var gap = days(last.ts, today);
          if (gap != null && gap > 28) {
            out.push(fin('R8', 3, 'high', 'measured against your own skip-level 1:1s; line verified: you → ' + line.chain[0].name + ' → ' + p.name,
              'Skip-level 1:1 with ' + p.name + ' is ' + (gap - 28) + 'd overdue',
              ['last skip-level 1:1 ' + fmtDate(last.ts) + ' → ' + gap + 'd ago; cadence 28d (fixed)',
               'line: you → ' + line.chain[0].name + ' → ' + p.name + ' (roster-verified, not guessed)',
               'source: oneonone.logged (mode skip) ' + last.id],
              [last.id], 'R8:' + p.id));
          }
        } else if (p.createdAt && days(p.createdAt, today) > 28) {
          out.push(fin('R8', 3, 'medium', 'never logged — measured from the day they were added to the roster',
            'No skip-level 1:1 ever logged with ' + p.name,
            ['you → ' + line.chain[0].name + ' → ' + p.name + ' · added ' + fmtDate(p.createdAt)],
            [], 'R8:' + p.id));
        }
      });
      return out;
    }},
    { id: 'R9', tag: 'arrival', play: 'expectations', fn: function (P, today) {
      if (!P.appointment) return [];
      var day = days(P.appointment, today);
      if (day == null || day < 14 || P.expectations) return [];
      return [fin('R9', 3, 'high', 'appointment date is yours; capture absence is explicit',
        'Day ' + day + ' — your boss’s expectations are still uncaptured',
        ['appointed ' + fmtDate(P.appointment) + ' · day-14 gate passed ' + (day - 14) + 'd ago',
         'leading leaders without a written expectations charter means grading yourself against a rubric you invented'],
        [], 'R9:expectations')];
    }},
    { id: 'R10', tag: 'arrival', play: 'tour', fn: function (P, today) {
      if (!P.appointment) return [];
      var day = days(P.appointment, today);
      if (day == null || day < 14) return [];
      var targets = P.actives.filter(function (p) {
        if (p.reportsTo === 'me') return true;
        var line = P.lineToMe(p);
        return line.ok && line.depth === 2;
      });
      if (!targets.length) return [];
      var missing = targets.filter(function (p) { return !P.tourVisits[p.id]; });
      if (!missing.length) return [];
      var visited = targets.length - missing.length;
      return [fin('R10', day >= 45 ? 4 : 2, day >= 45 ? 'high' : 'medium',
        'coverage ' + visited + '/' + targets.length + ' measured against TODAY’S roster — people who joined after your appointment still count; stated assumption',
        'Listening tour ' + visited + '/' + targets.length + (day >= 45 ? ' — past the day-45 gate' : ' — still time, pace it'),
        ['appointed ' + fmtDate(P.appointment) + ' (day ' + day + ') · grace until day 14, gate at day 45',
         'not yet visited: ' + missing.map(function (p) { return p.name; }).join(', ')],
        [], 'R10:tour')];
    }},
    { id: 'R11', tag: 'arrival', play: 'win', fn: function (P, today) {
      var out = [];
      P.openWins.forEach(function (w) {
        if (!w.verifyDate) return;
        var late = days(w.verifyDate, today);
        if (late != null && late > 0) {
          out.push(fin('R11', late > 14 ? 4 : 3, 'high', 'verify date is your own',
            'Early win past verify date: “' + w.title + '”',
            ['planned ' + fmtDate(w.ts) + ' · verify by ' + fmtDate(w.verifyDate) + ' → ' + late + 'd late',
             'an unverified “win” is a story you’re telling yourself — verify against the original claim or kill it'],
            [w.id], 'R11:' + w.id));
        }
      });
      return out;
    }},
    { id: 'R12', tag: 'incidents', play: 'incident', fn: function (P, today) {
      var out = [];
      P.openIncidents.forEach(function (x) {
        var silent = days(x.lastUpdateTs, today);
        if (silent != null && silent >= 7) {
          out.push(fin('R12', silent >= 14 ? 4 : 3, 'high', 'silence measured from your last incident.update (or registration)',
            'Incident silent ' + silent + 'd: “' + x.title + '”',
            ['registered ' + fmtDate(x.ts) + ' · last update ' + fmtDate(x.lastUpdateTs) + ' → ' + silent + 'd silent (threshold 7d)',
             'silent incidents read to the team as forgotten incidents'],
            [x.id], 'R12:' + x.id));
        }
      });
      return out;
    }},
    { id: 'R13', tag: 'conflict', play: 'oneonone', fn: function (P, today) {
      var out = [];
      Object.keys(P.conflictNexus).forEach(function (pid) {
        if (!P.peopleById[pid] || P.peopleById[pid].archived) return;
        var n = P.conflictNexus[pid];
        var distinct = Object.keys(n.distinct).length;
        if (n.open < 3 || distinct < 2) return;
        var names = Object.keys(n.distinct).map(function (k) { return k === 'me' ? 'You' : pName(P, k.slice(2)); });
        out.push(fin('R13', 3, 'medium',
          'MEDIUM PERMANENTLY: a count of open loops is not a diagnosis — this person may be the common problem, or the only one honest enough to register friction',
          pName(P, pid) + ' is the common factor in ' + n.open + ' open conflicts',
          ['≥3 open conflicts across ≥2 distinct resolvable counterparts: ' + names.join(', '),
           n.textCounterparts.length ? n.textCounterparts.length + ' text/unnamed counterpart(s) listed, NOT counted (a name can’t be deduped): ' + n.textCounterparts.join(', ') : 'all counterparts roster-linked',
           'you don’t DESC a pattern — you have a pattern conversation (1:1, nexus mode)'],
          P.openConflicts.filter(function (c) { return c.a.personId === pid || c.b.personId === pid; }).map(function (c) { return c.id; }),
          'R13:' + pid));
      });
      return out;
    }},
    /* ── NEW mf-5 ─────────────────────────────────────────────────────── */
    { id: 'R14', tag: 'meetings', play: 'meeting-audit', fn: function (P, today) {
      var out = [];
      Object.keys(P.weeklyMeetingLoad).forEach(function (pid) {
        if (!P.peopleById[pid] || P.peopleById[pid].archived) return;
        var rec = P.weeklyMeetingLoad[pid];
        if (rec.minutes < 480) return;
        out.push(fin('R14', rec.minutes >= 600 ? 4 : 3, 'high',
          'computed from DECLARED recurring series only — ad-hoc meetings are not captured, so real load is ≥ this',
          pName(P, pid) + ' is in ' + Math.round(rec.minutes / 60 * 10) / 10 + 'h/wk of recurring meetings',
          ['threshold 480 min/wk (8h = 20% of a 40h week — stated assumption, not science)',
           rec.series.map(function (s) { return s.title + ' · ' + s.minutes + ' min/wk'; }).join('\n'),
           'total ' + rec.minutes + ' min/wk across ' + rec.series.length + ' series',
           'calendar is where delegation strategy goes to die — audit before adding anything new'],
          rec.series.map(function (s) { return s.id; }), 'R14:' + pid));
      });
      return out;
    }},
    { id: 'R15', tag: 'decisions', play: 'premortem', fn: function (P, today) {
      var out = [];
      P.openDecisions.forEach(function (d) {
        if (d.severity == null || d.severity < 4) return; /* no severity → skip, never infer importance */
        if (d.premortem) return;
        var age = days(d.ts, today);
        if (age == null || age < 2) return; /* 2d grace so capture doesn't instantly flag */
        out.push(fin('R15', 4, 'high', 'severity is your own declaration; premortem absence is explicit',
          'Severity-' + d.severity + ' decision with no premortem: “' + d.title + '”',
          ['registered ' + fmtDate(d.ts) + ' · ' + age + 'd old (grace 2d)',
           'you rated this sev ' + d.severity + ' — the cost of being wrong is high and the cost of asking “how does this fail?” is 45 minutes',
           'no premortem.held event links to ' + d.id],
          [d.id], 'R15:' + d.id));
      });
      return out;
    }}
  ];

  function run(state, today, opts) {
    var P = LEADOS.events.project(state);
    var includeMuted = opts && opts.includeMuted;
    var findings = [], perRule = {};
    RULES.forEach(function (r) {
      var got = [];
      try { got = r.fn(P, today) || []; }
      catch (e) {
        got = [fin('ENG', 5, 'high', 'this is a rule EXCEPTION, surfaced loudly — a silent engine is a lying engine',
          'Rule ' + r.id + ' threw an exception',
          ['message: ' + String(e && e.message || e),
           'the rule was skipped for this run; every other rule still ran',
           'report this at the repo — include this finding’s basis lines'],
          [], 'ENG:' + r.id)];
        perRule[r.id] = { n: 0, threw: String(e && e.message || e) };
        got.forEach(function (f) { findings.push(f); });
        return;
      }
      got.forEach(function (f) { findings.push(f); });
      perRule[r.id] = { n: got.length };
    });
    /* engine memory: snooze/dismiss are events; suppression is reversible */
    var mutedCount = 0;
    findings = findings.filter(function (f) {
      if (f.rule === 'ENG') { f.muted = false; return true; } /* engine errors are never mutable */
      var snoozed = P.memory.snoozed[f.key], dismissed = P.memory.dismissed[f.key];
      f.muted = !!(dismissed || (snoozed && today <= snoozed));
      if (f.muted) { mutedCount++; return includeMuted === true; }
      return true;
    });
    findings.forEach(function (f) {
      var factor = CONF_FACTOR[f.conf] || 0.4;
      f.score = f.sev * factor;
      f.scoreMath = f.sev + ' × ' + factor.toFixed(2) + ' (' + f.conf + ') = ' + f.score.toFixed(2);
    });
    findings.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.sev !== a.sev) return b.sev - a.sev;
      return a.key < b.key ? -1 : 1;
    });
    return { findings: findings, perRule: perRule, P: P, mutedCount: mutedCount, today: today };
  }

  return { run: run, RULES: RULES, CONF_FACTOR: CONF_FACTOR,
    _dayUTC: dayUTC, _days: days, _slope: slope };
})();
