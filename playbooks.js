/* LeadOS mf-5 · js/playbooks.js — the mentor layer.
   Every playbook = structured guide + form + ONE submit that writes the
   resolving event(s) through the shared layer. Pre-fill comes from live
   projections; the app never invents what it shows you.
   ── Provenance: LEVELS/LEVEL_GUIDE/SL_TABLE/slMatch names secondhand-
   verified from the S8 log's head-read; carried semantics: commitment-
   crisis → D3 · mixed-middle → D2 (stated assumption). All code re-authored.
   mf-5 adds: premortem (Klein) + meeting-audit playbooks (repo gap #1). */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.playbooks = 'js/playbooks.js';

LEADOS.playbooks = (function () {
  'use strict';

  /* ── delegation ladder (carried semantics) ──────────────────────────── */
  var LEVELS = [1, 2, 3, 4, 5];
  var LEVEL_GUIDE = {
    1: 'Tell — you decide, they execute exactly. Right for irreversible/risky work or a D1 beginner. Cost: zero growth, you stay the bottleneck.',
    2: 'Sell — you decide, but they must explain your reasoning back. Buys understanding at the price of your time.',
    3: 'Consult — they bring options and a recommendation, you decide. Default for D2/D3 on real work.',
    4: 'Agree — you decide together; you keep a veto you promise to use rarely. For D3 on high-stakes work.',
    5: 'Delegate — they decide, they inform you. Right only at D4 on this task type. Your job becomes the check-back, not the doing.'
  };

  /* ── situational (carried semantics + printed assumptions) ─────────── */
  var SL_TABLE = [
    { d: 'D1', s: 'S1', name: 'Enthusiastic beginner → Directing',
      guidance: 'High direction, low support. Define the task narrowly, show how, set frequent short check-ins. Enthusiasm is not competence — do not delegate yet.' },
    { d: 'D2', s: 'S2', name: 'Disillusioned learner → Coaching',
      guidance: 'High direction AND high support. Explain the why, ask for their view before deciding, praise progress specifically. The dip is normal; quitting here creates permanent L1 delegations.' },
    { d: 'D3', s: 'S3', name: 'Capable but cautious → Supporting',
      guidance: 'Low direction, high support. They can do it — your job is confidence, not instruction. Ask “how will you approach it?” and get out of the way. Watch for the commitment wobble.' },
    { d: 'D4', s: 'S4', name: 'Self-reliant achiever → Delegating',
      guidance: 'Low direction, low support. Hand over outcomes, agree check-back points, and resist re-intervening. Under-leading a D4 is its own failure mode.' }
  ];
  function slMatch(sl) {
    if (!sl || !sl.competence || !sl.commitment) return null;
    var c = sl.competence; /* low | growing | high */
    var m = sl.commitment; /* low | variable | high */
    if (c === 'low') return { d: 'D1', s: 'S1', why: 'competence low → beginner row, regardless of commitment' };
    if (c === 'high' && m === 'high') return { d: 'D4', s: 'S4', why: 'high competence + high commitment → self-reliant' };
    if (c === 'high') return { d: 'D3', s: 'S3', why: 'competence high but commitment ' + m + ' → commitment crisis lands at D3 (carried rule)' };
    /* growing: */
    if (m === 'high') return { d: 'D1→D2', s: 'S1', why: 'growing competence with high commitment sits at the D1/D2 boundary — stated assumption: treat as late-D1' };
    return { d: 'D2', s: 'S2', why: 'mixed middle (growing competence, ' + m + ' commitment) → D2 — stated assumption, carried' };
  }

  function peopleOpts(P, allowMe) {
    var opts = P.actives.map(function (p) { return { v: p.id, l: p.name + (p.role ? ' · ' + p.role : '') }; });
    if (allowMe) opts.unshift({ v: 'me', l: 'You' });
    return opts;
  }

  var LIST = [
    /* ───────────────────────── 1:1 run sheet ───────────────────────── */
    { id: 'oneonone', title: '1:1 run sheet', forRules: ['R1', 'R7', 'R8', 'R13'],
      modes: { regular: 'standard', skip: 'skip-level', 'load-cutting': 'load-cutting', nexus: 'pattern conversation' },
      guide: [
        { h: 'The contract', p: 'A 1:1 is their meeting, not your status review. If you leave with updates and they leave with nothing, you ran a standup in disguise.' },
        { h: 'Standard mode', list: ['Their agenda first — always. “What’s on your mind?” then silence.', 'Blockers you can remove this week, named concretely.', 'Career/growth every 3rd 1:1, not yearly.', 'End with: what will each of us do before next time? Two items max.'] },
        { h: 'Skip-level mode', list: ['Goal: learn what their lead can’t or won’t tell you — never litigate their lead.', 'Ask: “What should your manager start/stop doing?” and report PATTERNS up, not quotes.', 'Never promise to fix their lead in the room. You owe the lead the feedback, framed as yours.'] },
        { h: 'Load-cutting mode (overload signal)', list: ['Bring the data: open delegations, meeting load, pulse trend. Show, don’t accuse.', 'List every open loop together. Cut, delegate, or defer at least one in the room.', 'Agree a load number you’ll both watch, and a date to re-check.'] },
        { h: 'Pattern conversation (nexus — MEDIUM confidence data)', list: ['A count of open conflicts is not a diagnosis. Open with curiosity, not the pattern.', '“You’ve been in several tense loops lately — what’s your read?” then listen for their model of why.', 'If they blame everyone else, that IS the data. If they self-diagnose, coach the fix.'] }
      ],
      fields: [
        { key: 'personId', label: 'Person', type: 'person', required: true,
          prefill: function (ctx) { return ctx.personId || ''; }, hint: 'pre-filled from the finding when opened from Today' },
        { key: 'mode', label: 'Mode', type: 'select',
          options: [{ v: 'regular', l: 'standard' }, { v: 'skip', l: 'skip-level' }, { v: 'load-cutting', l: 'load-cutting' }, { v: 'nexus', l: 'pattern conversation' }],
          prefill: function (ctx) {
            if (!ctx.finding) return 'regular';
            return ctx.finding.rule === 'R8' ? 'skip' : ctx.finding.rule === 'R7' ? 'load-cutting' : ctx.finding.rule === 'R13' ? 'nexus' : 'regular';
          } },
        { key: 'agenda', label: 'Agenda (pre-filled from their live data — edit it)', type: 'textarea', span: 4,
          prefill: function (ctx) {
            if (!ctx.personId) return '';
            var P = ctx.P, lines = [];
            var dels = P.delegationsOpenByPerson[ctx.personId] || [];
            if (dels.length) lines.push(dels.length + ' open delegations to review: ' + dels.map(function (e) { return (e.data || {}).task; }).join('; '));
            var load = P.weeklyMeetingLoad[ctx.personId];
            if (load) lines.push('meeting load ' + load.minutes + ' min/wk across ' + load.series.length + ' series');
            var open = P.conflictNexus[ctx.personId];
            if (open) lines.push(open.open + ' open conflict loops — ask for their read');
            lines.push('career: where do they want to be in 12 months?');
            lines.push('two commitments, one each, before next 1:1');
            return lines.join('\n');
          } },
        { key: 'note', label: 'Outcome note (optional)', type: 'text', span: 4 }
      ],
      submit: function (v) {
        if (!v.personId) return { error: 'pick a person' };
        return { events: [{ type: 'oneonone.logged', personId: v.personId,
          data: { mode: v.mode || 'regular', agenda: v.agenda || '', note: v.note || '' } }],
          toast: '1:1 logged — cadence resets from today' };
      }
    },

    /* ───────────────────────── SBI feedback ────────────────────────── */
    { id: 'sbi', title: 'SBI feedback', forRules: ['R4'],
      guide: [
        { h: 'Why SBI', p: 'Situation–Behavior–Impact keeps feedback about observable reality, not character. “You’re abrasive” starts a fight; “In Tuesday’s review (S) you rejected two proposals without rationale (B) and Priya stopped offering ideas (I)” starts a conversation.' },
        { h: 'Rules', list: ['No “always/never”. One situation at a time.', 'Behavior = what a camera would record.', 'Impact = on the work or the people, stated as you observed it.', 'Reinforcing feedback uses the same rigor — vague praise teaches nothing.'] }
      ],
      fields: [
        { key: 'personId', label: 'Person', type: 'person', required: true, prefill: function (ctx) { return ctx.personId || ''; } },
        { key: 'polarity', label: 'Polarity', type: 'select', options: [{ v: 'corrective', l: 'corrective' }, { v: 'positive', l: 'reinforcing' }],
          prefill: function (ctx) {
            return ctx.finding && /corrective/.test(ctx.finding.title) ? 'positive' : 'corrective';
          }, hint: 'imbalance findings pre-fill the MISSING polarity' },
        { key: 's', label: 'Situation — when/where', type: 'text', span: 4, prefill: function () { return ''; } },
        { key: 'b', label: 'Behavior — what a camera records', type: 'textarea', span: 4 },
        { key: 'i', label: 'Impact — on work/people', type: 'textarea', span: 4 }
      ],
      submit: function (v) {
        if (!v.personId) return { error: 'pick a person' };
        if (!v.s && !v.b && !v.i) return { error: 'an empty SBI is a shrug, not feedback' };
        return { events: [{ type: 'feedback.given', personId: v.personId,
          data: { polarity: v.polarity || 'corrective', sbi: { s: v.s || '', b: v.b || '', i: v.i || '' } } }],
          toast: 'feedback logged — R4 recounts polarity from this event' };
      }
    },

    /* ───────────────────────── DESC (two-party) ────────────────────── */
    { id: 'desc', title: 'DESC script (conflict)', forRules: ['R6'],
      guide: [
        { h: 'The structure', p: 'Describe → Express → Specify → Consequences. A conflict-resolving conversation with both parties addressed, not a verdict delivered.' },
        { h: 'In the room', list: ['D: observable facts both parties would accept. No adjectives.', 'E: the effect on the work/team — “I” statements, not accusations.', 'S: the specific change you need, behavioral and checkable.', 'C: consequences — natural, stated calmly, including the good ones.', 'Close the loop: log the resolution here so the engine stops counting the pair.'] }
      ],
      fields: [
        { key: 'conflictId', label: 'Open conflict', type: 'select', required: true,
          options: function (ctx) {
            return ctx.P.openConflicts.map(function (c) { return { v: c.id, l: c.pairLabel + ' · ' + c.topic }; });
          },
          prefill: function (ctx) { return ctx.finding && ctx.finding.sources.length ? ctx.finding.sources[0] : ''; } },
        { key: 'd', label: 'Describe — agreed facts', type: 'textarea', span: 4,
          prefill: function (ctx) {
            var c = ctx.P.openConflicts.filter(function (x) { return ctx.finding && x.id === ctx.finding.sources[0]; })[0];
            return c ? 'On ' + c.ts.slice(0, 10) + ', regarding “' + c.topic + '” between ' + c.pairLabel + ':' : '';
          } },
        { key: 'e', label: 'Express — effect (I-statements)', type: 'textarea', span: 4 },
        { key: 's', label: 'Specify — the change, checkable', type: 'textarea', span: 4 },
        { key: 'c', label: 'Consequences — natural, calm', type: 'textarea', span: 4 },
        { key: 'note', label: 'Resolution note', type: 'text', span: 4 }
      ],
      submit: function (v) {
        if (!v.conflictId) return { error: 'pick the conflict this resolves' };
        return { events: [{ type: 'conflict.resolved',
          data: { conflictId: v.conflictId, desc: { d: v.d || '', e: v.e || '', s: v.s || '', c: v.c || '' }, note: v.note || '' } }],
          toast: 'conflict resolved — the pair stops counting from this event' };
      }
    },

    /* ───────────────────────── delegation ladder ───────────────────── */
    { id: 'delegation', title: 'Delegation ladder', forRules: ['R5'],
      guide: [
        { h: 'The ladder', p: 'Delegation level is a dial, not a door. Match it to the person’s development level FOR THIS TASK (run the situational playbook if unsure) — and say the level out loud. Most delegation failures are level-mismatches nobody announced.' },
        { h: 'Watch both directions', list: ['Level too high for their D-level → abdication dressed as trust.', 'Level too low → micromanagement dressed as rigor.', 'Overload rule (R5): past 4 open loops per person, every new delegation is a prioritization decision you didn’t make.'] }
      ],
      fields: [
        { key: 'personId', label: 'Person', type: 'person', required: true, prefill: function (ctx) { return ctx.personId || ''; } },
        { key: 'task', label: 'Task / outcome', type: 'text', span: 3 },
        { key: 'level', label: 'Level 1–5', type: 'select', options: LEVELS.map(function (l) { return { v: String(l), l: 'L' + l }; }),
          live: 'levelGuide', prefill: function () { return '3'; },
          hint: 'guidance for the chosen level appears below the form' },
        { key: 'checkback', label: 'Check-back date', type: 'date' }
      ],
      submit: function (v) {
        if (!v.personId) return { error: 'pick a person' };
        if (!v.task) return { error: 'name the task — an unnamed delegation is a wish' };
        return { events: [{ type: 'delegation.assigned', personId: v.personId,
          data: { task: v.task, level: Number(v.level) || 3, checkback: v.checkback || null } }],
          toast: 'delegation assigned at L' + (v.level || 3) + ' — R5 recounts open loops' };
      }
    },

    /* ───────────────────────── situational ─────────────────────────── */
    { id: 'situational', title: 'Situational match', forRules: [],
      guide: [
        { h: 'The point', p: 'Development level is per TASK TYPE, not per person. Your star engineer is a D1 at budget season. Assess competence (can they do this?) and commitment (do they want to / trust themselves to?) separately.' },
        { h: 'Edge rules (printed, not hidden)', list: ['Commitment crisis at high competence → D3.', 'Mixed middle (growing competence, low/variable commitment) → D2. Stated assumption.', 'Growing competence + high commitment sits at the D1/D2 boundary — treated as late-D1.'] }
      ],
      fields: [
        { key: 'personId', label: 'Person', type: 'person', required: true, prefill: function (ctx) { return ctx.personId || ''; } },
        { key: 'competence', label: 'Competence (this task type)', type: 'select',
          options: [{ v: 'low', l: 'low' }, { v: 'growing', l: 'growing' }, { v: 'high', l: 'high' }],
          live: 'slMatch', prefill: function (ctx) {
            var p = ctx.personId && ctx.P.peopleById[ctx.personId];
            return p && p.sl ? p.sl.competence : 'growing';
          } },
        { key: 'commitment', label: 'Commitment (this task type)', type: 'select',
          options: [{ v: 'low', l: 'low' }, { v: 'variable', l: 'variable' }, { v: 'high', l: 'high' }],
          live: 'slMatch', prefill: function (ctx) {
            var p = ctx.personId && ctx.P.peopleById[ctx.personId];
            return p && p.sl ? p.sl.commitment : 'variable';
          } }
      ],
      submit: function (v, ctx) {
        if (!v.personId) return { error: 'pick a person' };
        var m = slMatch({ competence: v.competence, commitment: v.commitment });
        return { personUpdates: [{ id: v.personId, patch: { sl: { competence: v.competence, commitment: v.commitment, assessedAt: LEADOS.store.nowISO() } } }],
          toast: m ? ('assessed ' + m.d + ' → lead at ' + m.s) : 'assessment saved' };
      }
    },

    /* ───────────────────────── premortem (NEW mf-5) ────────────────── */
    { id: 'premortem', title: 'Premortem (sev ≥ 4)', forRules: ['R15'],
      guide: [
        { h: 'Method (Klein)', p: 'Assume it is six months from now and the decision FAILED — not “might fail”, failed. Everyone writes the story of how before anyone debates whether. Prospective hindsight unlocks the doubts people self-censor in “any concerns?” meetings.' },
        { h: 'Doing it alone (you are the quorum)', list: ['Write the failure story in past tense, concrete: dates, names, numbers.', 'Top 3 risks by kill-power, not by likelihood-of-mentioning.', 'One mitigation per risk — a REAL one, not “monitor it”.', 'Tripwire: the metric that tells you early you were wrong, with a threshold and a date. Without a tripwire, a premortem is therapy.'] }
      ],
      fields: [
        { key: 'decisionId', label: 'Decision (sev ≥ 4, open)', type: 'select', required: true,
          options: function (ctx) {
            return ctx.P.openDecisions.filter(function (d) { return d.severity != null && d.severity >= 4 && !d.premortem; })
              .map(function (d) { return { v: d.id, l: 'sev' + d.severity + ' · ' + d.title }; });
          },
          prefill: function (ctx) { return ctx.finding && ctx.finding.rule === 'R15' ? ctx.finding.sources[0] : ''; } },
        { key: 'failureStory', label: 'Failure story, past tense', type: 'textarea', span: 4,
          prefill: function () { return 'It is six months from now. The decision failed. Here is what happened:\n\n1. \n2. \n3. '; } },
        { key: 'risks', label: 'Top 3 risks (one per line)', type: 'textarea', span: 4 },
        { key: 'mitigations', label: 'Mitigation per risk (real ones)', type: 'textarea', span: 4 },
        { key: 'tripwire', label: 'Tripwire: metric + threshold + date', type: 'text', span: 4,
          hint: 'example: “vendor migration error rate > 2% by <date> → rollback”' }
      ],
      submit: function (v) {
        if (!v.decisionId) return { error: 'pick the decision this gates' };
        if (!v.failureStory && !v.risks) return { error: 'a premortem with no failure story is a checkbox' };
        return { events: [{ type: 'premortem.held',
          data: { decisionId: v.decisionId, failureStory: v.failureStory || '',
            risks: String(v.risks || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
            mitigations: v.mitigations || '', tripwire: v.tripwire || '' } }],
          toast: 'premortem logged — R15 resolves at next render' };
      }
    },

    /* ───────────────────────── decision review ─────────────────────── */
    { id: 'decision-review', title: 'Decision review', forRules: ['R2'],
      guide: [
        { h: 'Why review dates', p: 'A decision without a review date is a hope. You said you’d check whether it worked — this is that check.' },
        { h: 'Grade honestly', list: ['Compare outcome against the ORIGINAL reasoning, not the revision.', '“Partially worked” with a named next step beats “fine”.', 'A failed decision + a written lesson is a good month. An ungraded one is a slow leak.'] }
      ],
      fields: [
        { key: 'decisionId', label: 'Open decision', type: 'select', required: true,
          options: function (ctx) { return ctx.P.openDecisions.map(function (d) { return { v: d.id, l: (d.reviewDate || 'no review') + ' · sev' + (d.severity || '—') + ' · ' + d.title }; }); },
          prefill: function (ctx) { return ctx.finding && ctx.finding.sources.length ? ctx.finding.sources[0] : ''; } },
        { key: 'outcome', label: 'Outcome — what actually happened', type: 'textarea', span: 4 },
        { key: 'rating', label: 'Verdict', type: 'select', options: [{ v: 'worked', l: 'worked' }, { v: 'partial', l: 'partially worked' }, { v: 'failed', l: 'failed' }], prefill: function () { return 'partial'; } },
        { key: 'learnings', label: 'Lesson for next time', type: 'text', span: 4 }
      ],
      submit: function (v) {
        if (!v.decisionId) return { error: 'pick a decision' };
        return { events: [{ type: 'decision.outcome',
          data: { decisionId: v.decisionId, outcome: v.outcome || '', rating: v.rating || 'partial', learnings: v.learnings || '' } }],
          toast: 'outcome logged — decision leaves the open list' };
      }
    },

    /* ───────────────────────── goal review ─────────────────────────── */
    { id: 'goal-review', title: 'Goal review', forRules: ['R3'],
      guide: [
        { h: 'Two failure modes', list: ['OWNERLESS: everyone’s goal is no one’s goal. Assign a name or kill it — both are decisions.', 'SILENT: 14+ days without a progress event means it’s drifting. Progress can be “blocked — here’s why”; silence can’t.'] },
        { h: 'Kill criteria', p: 'A goal you wouldn’t fund this week is a goal to close this week. Closing with a reason is leadership; letting it rot is noise the team learns to ignore.' }
      ],
      fields: [
        { key: 'goalId', label: 'Open goal', type: 'select', required: true,
          options: function (ctx) { return ctx.P.openGoals.map(function (g) { return { v: g.id, l: (g.owner ? g.owner.name : 'NO OWNER') + ' · ' + g.title }; }); },
          prefill: function (ctx) { return ctx.finding ? ctx.finding.key.replace(/^R3[os]:/, '') : ''; } },
        { key: 'ownerId', label: 'Re-assign owner (if ownerless/wrong)', type: 'person', allowMe: true, allowEmpty: true, prefill: function () { return ''; } },
        { key: 'note', label: 'Progress note (or “blocked because…”)', type: 'textarea', span: 4 },
        { key: 'pct', label: 'Progress % (optional)', type: 'number' },
        { key: 'close', label: 'Close this goal (kill or done)', type: 'checkbox' }
      ],
      submit: function (v) {
        if (!v.goalId) return { error: 'pick a goal' };
        var evs = [];
        if (v.ownerId) evs.push({ type: 'goal.assigned', data: { goalId: v.goalId, ownerId: v.ownerId } });
        if (v.note || v.pct) evs.push({ type: 'goal.progress', data: { goalId: v.goalId, note: v.note || '', pct: v.pct ? Number(v.pct) : null } });
        if (v.close) evs.push({ type: 'goal.closed', data: { goalId: v.goalId, reason: v.note || 'closed in review' } });
        if (!evs.length) return { error: 'nothing to log — reassign, note progress, or close' };
        return { events: evs, toast: 'goal updated — ' + evs.length + ' event(s) written' };
      }
    },

    /* ───────────────────────── meeting audit (NEW mf-5) ────────────── */
    { id: 'meeting-audit', title: 'Meeting-load audit', forRules: ['R14'],
      guide: [
        { h: 'The math is the message', p: 'Recurring meetings are annuity payments of attention — signed once, paid forever. The audit lists what YOU declared; ad-hoc load only adds to it.' },
        { h: 'For each series, one of four verdicts', list: ['KILL — no artifact, no decision, no loss.', 'DELEGATE — your report goes, you get the notes. This IS their development.', 'SHORTEN/DE-CADENCE — 60→25 min, weekly→biweekly (end the series here, recreate it leaner — an honest deletion, not a silent edit).', 'KEEP — it earns its hours. Few will.'] },
        { h: 'After cutting', p: 'Protect the freed hours the same week or the calendar re-fills with worse. Recurring focus blocks are the only defense that works.' }
      ],
      fields: [
        { key: 'personId', label: 'Person', type: 'person', required: true, prefill: function (ctx) { return ctx.personId || ''; } },
        { key: 'audit', label: 'Their declared series (live)', type: 'context', span: 4,
          prefill: function (ctx) {
            if (!ctx.personId) return 'pick a person to compute load';
            var rec = ctx.P.weeklyMeetingLoad[ctx.personId];
            if (!rec) return 'no declared recurring series for this person';
            return rec.series.map(function (s) { return s.minutes + ' min/wk · ' + s.title; }).join('\n') +
              '\n———\ntotal ' + rec.minutes + ' min/wk (' + Math.round(rec.minutes / 60 * 10) / 10 + 'h)';
          } },
        { key: 'endIds', label: 'End these series (kill/delegate verdicts)', type: 'multi', span: 4,
          options: function (ctx) {
            if (!ctx.personId) return [];
            var rec = ctx.P.weeklyMeetingLoad[ctx.personId];
            return rec ? rec.series.map(function (s) { return { v: s.id, l: s.title + ' · ' + s.minutes + ' min/wk' }; }) : [];
          } },
        { key: 'reason', label: 'Verdict note per ended series (shared note)', type: 'text', span: 4 }
      ],
      submit: function (v) {
        if (!v.personId) return { error: 'pick a person' };
        var ids = Array.isArray(v.endIds) ? v.endIds : [];
        if (!ids.length) return { error: 'no series selected — a no-cut audit is valid, but log nothing' };
        return { events: ids.map(function (id) { return { type: 'meeting.ended', data: { seriesId: id, reason: v.reason || 'meeting audit' } }; }),
          toast: ids.length + ' series ended here — end them in the real calendar too. R14 re-derives.' };
      }
    },

    /* ───────────────────────── incident update ─────────────────────── */
    { id: 'incident', title: 'Incident update', forRules: ['R12'],
      guide: [
        { h: 'Silence is the incident after the incident', p: 'Teams forgive outages; they don’t forgive vanished follow-through. An update can be “still investigating, next check Thursday” — it cannot be nothing.' }
      ],
      fields: [
        { key: 'incidentId', label: 'Open incident', type: 'select', required: true,
          options: function (ctx) { return ctx.P.openIncidents.map(function (x) { return { v: x.id, l: x.title }; }); },
          prefill: function (ctx) { return ctx.finding && ctx.finding.sources.length ? ctx.finding.sources[0] : ''; } },
        { key: 'note', label: 'Update (visible next steps, owner, ETA)', type: 'textarea', span: 4 },
        { key: 'closed', label: 'Close incident (resolved + communicated)', type: 'checkbox' }
      ],
      submit: function (v) {
        if (!v.incidentId) return { error: 'pick an incident' };
        if (!v.note && !v.closed) return { error: 'nothing to log' };
        return { events: [{ type: 'incident.update', data: { incidentId: v.incidentId, note: v.note || '', closed: !!v.closed } }],
          toast: v.closed ? 'incident closed' : 'incident updated — silence clock resets' };
      }
    },

    /* ───────────────────────── expectations charter ────────────────── */
    { id: 'expectations', title: 'Expectations charter', forRules: ['R9'],
      guide: [
        { h: 'The conversation to have by day 14', p: 'New leaders of leaders fail upward before they fail downward: they optimize for a rubric they invented. Ask your boss directly, write it down, re-confirm at day 90.' },
        { h: 'The four questions', list: ['What are the 3 outcomes you’ll grade me on at 6 months?', 'How will you measure each — what number or artifact?', 'What should I escalate immediately vs handle?', 'What did my predecessor do that you never want repeated?'] }
      ],
      fields: [
        { key: 'bossName', label: 'Your boss', type: 'text' },
        { key: 'priorities', label: 'Top 3 expected outcomes (one per line)', type: 'textarea', span: 4 },
        { key: 'measurement', label: 'How each is measured', type: 'textarea', span: 4 },
        { key: 'escalation', label: 'Escalation rule agreed', type: 'text', span: 4 },
        { key: 'cadence', label: 'Check-in cadence agreed (days)', type: 'number', prefill: function () { return '30'; } }
      ],
      submit: function (v) {
        if (!v.priorities) return { error: 'no priorities — the charter IS the priorities' };
        return { events: [{ type: 'expectations.captured',
          data: { bossName: v.bossName || '', priorities: String(v.priorities).split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
            measurement: v.measurement || '', escalation: v.escalation || '', cadenceDays: Number(v.cadence) || 30 } }],
          toast: 'expectations captured — R9 resolves; re-confirm at day 90' };
      }
    },

    /* ───────────────────────── listening tour ──────────────────────── */
    { id: 'tour', title: 'Listening-tour visit', forRules: ['R10'],
      guide: [
        { h: 'Protocol', list: ['45 minutes, their turf or neutral. You speak <20% of the time.', 'Same 3 questions for everyone (comparable answers are data; bespoke chats are anecdotes).', 'What should I keep / change / never touch? What should I know that nobody will say in a meeting?', 'Write the note the same day. Memory edits in your favor.'] }
      ],
      fields: [
        { key: 'personId', label: 'Visited', type: 'person', required: true,
          prefill: function (ctx) {
            var missing = ctx.P.actives.filter(function (p) { return !ctx.P.tourVisits[p.id]; });
            return ctx.personId || (missing[0] ? missing[0].id : '');
          }, hint: 'defaults to your first unvisited target' },
        { key: 'note', label: 'Same-day note: keep/change/never-touch + what they really said', type: 'textarea', span: 4 }
      ],
      submit: function (v) {
        if (!v.personId) return { error: 'pick who you visited' };
        return { events: [{ type: 'tour.visit', personId: v.personId, data: { note: v.note || '' } }],
          toast: 'visit logged — R10 recounts coverage against today’s roster' };
      }
    },

    /* ───────────────────────── early-win verification ──────────────── */
    { id: 'win', title: 'Early-win verification', forRules: ['R11'],
      guide: [
        { h: 'Verify against the claim, not the mood', p: 'An early win builds credibility only if it’s real and SEEN. Check the original claim with the original metric, then either publicize it or kill it honestly. A win you quietly stop mentioning is a loss everyone else remembers.' }
      ],
      fields: [
        { key: 'winId', label: 'Open win', type: 'select', required: true,
          options: function (ctx) { return ctx.P.openWins.map(function (w) { return { v: w.id, l: 'verify ' + (w.verifyDate || '—') + ' · ' + w.title }; }); },
          prefill: function (ctx) { return ctx.finding && ctx.finding.sources.length ? ctx.finding.sources[0] : ''; } },
        { key: 'verdict', label: 'Verdict', type: 'select', options: [{ v: 'confirmed', l: 'confirmed — real, publicize it' }, { v: 'killed', l: 'killed — didn’t hold up' }], prefill: function () { return 'confirmed'; } },
        { key: 'evidence', label: 'Evidence vs the original claim (metric/artifact)', type: 'textarea', span: 4 }
      ],
      submit: function (v) {
        if (!v.winId) return { error: 'pick a win' };
        return { events: [{ type: 'win.verified', data: { winId: v.winId, verdict: v.verdict || 'confirmed', evidence: v.evidence || '' } }],
          toast: 'win verified (' + (v.verdict || 'confirmed') + ') — R11 resolves' };
      }
    }
  ];

  var byId = {};
  LIST.forEach(function (p) { byId[p.id] = p; });
  return { LIST: LIST, byId: byId, LEVELS: LEVELS, LEVEL_GUIDE: LEVEL_GUIDE,
    SL_TABLE: SL_TABLE, slMatch: slMatch, peopleOpts: peopleOpts };
})();
