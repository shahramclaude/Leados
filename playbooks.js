/* LeadOS mf-2 · js/playbooks.js — structured playbooks that pre-fill from live data.
   The mentor layer: not a wiki, a procedure. Each playbook = guidance content +
   a form whose defaults come from the finding/person you came from + a submit
   that writes the RESOLVING events through the shared event layer (so every
   module updates — no capture path writes state any other way).
   Playbooks in this slice: 1:1 run sheet (incl. skip-level + load-cutting modes),
   SBI, DESC, delegation ladder (5 levels), situational leadership (D1–D4→S1–S4),
   decision review, goal review. Delegation level wording reused verbatim from
   mf-1 ui.js (verified Session-6 read), with per-level authority/cadence added. */
window.LEADOS = window.LEADOS || {};
LEADOS.playbooks = (function () {
  'use strict';
  function EV() { return LEADOS.events; }
  function EN() { return LEADOS.engine; }

  /* Katz/Blanchard-style delegation ladder; wording carried from mf-1. */
  var LEVELS = ['1 — Do exactly what I say', '2 — Research options, I decide',
    '3 — Propose a plan, I approve', '4 — Decide yourself, inform me', '5 — Own it fully'];
  var LEVEL_GUIDE = [
    { auth: 'You make and announce the decision. They execute exactly.', cadence: 'daily check-in', say: '“Here is what I decided and why. Do it this way; flag deviations immediately.”' },
    { auth: 'They gather and compare; you still decide.', cadence: 'every 2–3 days', say: '“Bring me two or three options with a recommendation. I decide.”' },
    { auth: 'They propose; you approve before anything moves.', cadence: 'weekly, at proposal points', say: '“Write the plan. Nothing starts until I sign off.”' },
    { auth: 'They decide inside the brief; you get informed after.', cadence: 'every 2 weeks / at milestones', say: '“Decide it. Tell me what you decided by Friday, and what you’d like my eyes on.”' },
    { auth: 'Full ownership: decision, execution, and informing you only when results demand it.', cadence: 'monthly outcome review', say: '“It’s yours. I’m interested in outcomes and what you learned, not steps.”' }
  ];
  var SL_TABLE = {
    D1: { style: 'S1', name: 'Directing', line: 'High commitment, low competence on THIS task.',
      do: ['Define the task in steps', 'Show an example of “done”', 'Check in daily, briefly'],
      say: '“You’re motivated; here is exactly how this works. I’ll inspect the first pass.”',
      avoid: ['Delegating the outcome', 'Asking “how would you approach it?” as the opener'] },
    D2: { style: 'S2', name: 'Coaching', line: 'Some competence, wavering commitment.',
      do: ['Explain the why, not just the what', 'Let them attempt, then debrief', 'Name the frustration out loud'],
      say: '“You’re learning fast; the dip you feel is normal. Walk me through your attempt.”',
      avoid: ['Pure direction', 'Pure delegation', 'Silence when they stumble'] },
    D3: { style: 'S3', name: 'Supporting', line: 'Capable, but confidence or motivation varies.',
      do: ['Ask, don’t tell', 'Remove blockers, not responsibility', 'Praise risk taken, not just results'],
      say: '“You can do this. What’s making it feel heavy this week?”',
      avoid: ['Stepping back in with instructions', 'Micromanaging the how'] },
    D4: { style: 'S4', name: 'Delegating', line: 'Proven competence and commitment on THIS task.',
      do: ['Hand over outcomes, keep the context alive', 'Agree what “inform me” means', 'Give them visibility upward'],
      say: '“It’s yours. Tell me the outcome and what you changed along the way.”',
      avoid: ['Re-opening their decisions', 'Un-negotiated check-ins'] }
  };
  function slMatch(comp, comm) { /* integers 1–4; assumption printed in guide */
    if (comp <= 1 && comm >= 3) return 'D1';
    if (comp === 2 && comm <= 2) return 'D2';
    if (comp >= 3 && comm >= 3) return 'D4';
    if (comp >= 3 && comm <= 2) return 'D3';
    if (comp <= 1 && comm <= 2) return 'D2';   /* low-low: structure first */
    if (comm === 1) return 'D3';               /* commitment crisis: support before structure */
    return 'D2';                                /* mixed middle: lower style, more structure — stated assumption */
  }
  function optsPerson(state, includeSelf) {
    var out = [];
    if (includeSelf) out.push({ v: 'me', l: 'me (this is my own goal)' });
    (state.people || []).forEach(function (p) {
      if (p && !p.archived) out.push({ v: p.id, l: p.name + (p.role ? ' · ' + p.role : '') });
    });
    return out;
  }

  var PBS = {
    oneonone: {
      id: 'oneonone', title: '1:1 run sheet', icon: 'cal',
      blurb: 'A 1:1 that compounds: wellbeing first, their blockers before your agenda, one feedback moment, one growth beat.',
      guide: function (ctx, prefill) {
        var g = [], p = ctx.person;
        if (prefill.skip) g.push({ h: 'Skip-level mode', warn: 'They report to ' + (ctx.nameOf(prefill.via) || 'their lead') + ', not you. Your job is signal, not supervision: what slows you down · what should I know · what would you change. Never undermine their lead in the room.' });
        if (prefill.intent === 'load') g.push({ h: 'Load-cutting mode', warn: 'Arrive with one concrete item to remove, not questions about resilience. Coach after the load drops, not before.' });
        if (p) {
          var last = EV().lastOneOnOne(ctx.state, p.id);
          var pulse = EV().pulsesMeasured(ctx.state, p.id, 21, ctx.today);
          var bal = EV().feedbackBalance(ctx.state, p.id, 60, ctx.today);
          g.push({ h: 'Pre-read (from your data)', lines: [
            'last 1:1: ' + (last ? String(last.ts).slice(0, 10) : 'never logged'),
            'measured pulse last 21d: ' + (pulse.length ? pulse.map(function (e) { return 'm' + e.data.mood + '/l' + e.data.load; }).join(' · ') : 'none'),
            'feedback balance 60d: ' + bal.corrective + ' corrective / ' + bal.positive + ' positive' ] });
          if (bal.total >= 3 && bal.positive === 0) g.push({ h: 'Feedback moment', warn: 'You have logged ONLY corrective feedback for them lately. Find one specific thing worth repeating and open with it — SBI it.' });
        }
        g.push({ h: 'Structure (25–30 min)', lines: [
          '1. Opening pulse — mood and load, their number not yours (log it measured, only if they actually said it).',
          '2. Their priorities and blockers — before yours. Ask “what is slower than it should be?”',
          '3. Your items — max two.',
          '4. One feedback moment — SBI if you have one; silence is also data (log nothing, notice that).',
          '5. Growth beat — one question about where they want to be in 6 months.',
          '6. Commitments — who does what by when. That is next session’s opening.' ] });
        return g;
      },
      fields: function (ctx, prefill) {
        return [
          { key: 'personId', label: 'Person', kind: 'person', required: 1, value: prefill.personId },
          { key: 'date', label: 'Date', kind: 'date', required: 1, value: ctx.today },
          { key: 'duration', label: 'Minutes', kind: 'num', value: '30' },
          { key: 'mood', label: 'Mood (1–10, only if they said it)', kind: 'num', value: '' },
          { key: 'load', label: 'Load (1–10, only if they said it)', kind: 'num', value: '' },
          { key: 'note', label: 'What mattered (one or two lines)', kind: 'area', value: '' },
          { key: 'followups', label: 'Commitments made ( feeds next session )', kind: 'text', value: prefill.followups || '' }
        ];
      },
      submit: function (v, ctx) {
        var evs = [{ type: 'oneonone.logged', personId: v.personId,
          data: { note: v.note || undefined, duration: Number(v.duration) || undefined,
            followups: v.followups || undefined, skip: !!ctx.prefill.skip, viaPlaybook: true } }];
        var mood = Number(v.mood), load = Number(v.load);
        if (v.mood !== '' && v.load !== '' && isFinite(mood) && isFinite(load)) {
          evs.push({ type: 'pulse.logged', personId: v.personId, data: { mood: mood, load: load, via: 'oneonone' } });
        }
        return { events: evs, ts: v.date ? v.date + 'T00:00:00.000Z' : undefined };
      }
    },

    sbi: {
      id: 'sbi', title: 'SBI feedback', icon: 'scale',
      blurb: 'Situation · Behavior · Impact — feedback that cannot be argued with because it contains no adjectives.',
      guide: function (ctx, prefill) {
        var p = ctx.person, g = [];
        if (prefill.balanceHint) g.push({ h: 'Why this, why now', warn: prefill.balanceHint });
        g.push({ h: 'Rules that keep it clean', lines: [
          'Situation pins time and place — one specific occasion, recent.',
          'Behavior is a camera recording: verbs, no adjectives, no “always/never”.',
          'Impact is the concrete effect on work, team, or you — not a guess at intent.',
          'End with a question, not a verdict: the goal is a conversation they can enter.' ] });
        g.push({ h: 'Quality bar', lines: [
          'Would a camera have seen it? If not, cut it.',
          'Could they repeat or avoid it on purpose? If not, it’s a trait, not feedback.',
          'Delivered in under 60 seconds, then you listen.' ] });
        if (p) {
          var bal = EV().feedbackBalance(ctx.state, p.id, 60, ctx.today);
          g.push({ h: 'Ledger check', lines: ['last 60d with ' + p.name + ': ' + bal.corrective + ' corrective / ' + bal.positive + ' positive logged'] });
        }
        return g;
      },
      fields: function (ctx, prefill) {
        return [
          { key: 'personId', label: 'Person', kind: 'person', required: 1, value: prefill.personId },
          { key: 'polarity', label: 'Kind', kind: 'select', required: 1, value: prefill.polarity || 'corrective',
            options: [{ v: 'corrective', l: 'corrective — stop or change' }, { v: 'positive', l: 'positive — keep and repeat' }] },
          { key: 'situation', label: 'S — when/where', kind: 'text', required: 1, value: '', hint: 'e.g. “In Tuesday’s design review…”' },
          { key: 'behavior', label: 'B — what a camera saw', kind: 'area', required: 1, value: '', hint: '“…you answered two questions before the presenter finished.”' },
          { key: 'impact', label: 'I — concrete effect', kind: 'area', required: 1, value: '', hint: '“…the presenter lost their thread and the quieter reviewers stopped speaking.”' },
          { key: 'ask', label: 'Opening question', kind: 'text', value: '', hint: '“How did you see it?” — then stop talking.' }
        ];
      },
      compose: function (v) {
        return 'In ' + (v.situation || '…') + ', ' + (v.behavior || '…') + ' The impact: ' + (v.impact || '…') + (v.ask ? ' — then: “' + v.ask + '”' : '');
      },
      submit: function (v, ctx) {
        return { events: [{ type: 'feedback.logged', personId: v.personId,
          data: { polarity: v.polarity, model: 'SBI',
            note: 'In ' + v.situation + ', ' + v.behavior + ' Impact: ' + v.impact + (v.ask ? ' Asked: ' + v.ask : ''),
            viaPlaybook: true } }] };
      }
    },

    desc: {
      id: 'desc', title: 'DESC conversation', icon: 'bolt',
      blurb: 'Describe · Express · Specify · Consequences — for the second time, the broken agreement, the pattern.',
      guide: function (ctx, prefill) {
        var g = [];
        if (prefill.counterpart) g.push({ h: 'Context', warn: 'Engine sees repeated unresolved conflict involving ' + prefill.counterpart + '. DESC exists because SBI already happened — informally — and nothing changed.' });
        g.push({ h: 'When DESC over SBI', lines: [
          'The behavior survived a previous round of feedback.',
          'An explicit agreement was broken.',
          'The cost of silence now exceeds the cost of the conversation.' ] });
        g.push({ h: 'Rules that keep it clean', lines: [
          'Describe privately, specifically, with dates. No buildup, no character.',
          'Express with “I” statements about your standard and the team’s cost — not their personality.',
          'Specify the change you need, concrete and observable, by when.',
          'Consequences are stated calmly and owned by you: what you will do if nothing changes. This is not a threat; it is information.' ] });
        return g;
      },
      fields: function (ctx, prefill) {
        return [
          { key: 'personId', label: 'Person', kind: 'person', required: 1, value: prefill.personId },
          { key: 'describe', label: 'D — the facts, with dates', kind: 'area', required: 1, value: prefill.describe || '' },
          { key: 'express', label: 'E — cost to you / the team (I-statements)', kind: 'area', required: 1, value: '' },
          { key: 'specify', label: 'S — the change you need, observable + deadline', kind: 'area', required: 1, value: '' },
          { key: 'consequences', label: 'C — what you will do if nothing changes', kind: 'area', required: 1, value: '' }
        ];
      },
      compose: function (v) {
        return '“' + (v.describe || '…') + ' ' + (v.express || '…') + ' What I need is: ' + (v.specify || '…') + ' If it doesn’t change: ' + (v.consequences || '…') + '”';
      },
      submit: function (v, ctx) {
        return { events: [{ type: 'feedback.logged', personId: v.personId,
          data: { polarity: 'corrective', model: 'DESC',
            note: 'D: ' + v.describe + ' | E: ' + v.express + ' | S: ' + v.specify + ' | C: ' + v.consequences,
            viaPlaybook: true } }] };
      }
    },

    delegation: {
      id: 'delegation', title: 'Delegation ladder', icon: 'layers',
      blurb: 'Five levels of authority. Most delegation fails because the level was never said out loud.',
      guide: function (ctx, prefill) {
        var p = ctx.person, g = [];
        if (p) {
          var open = EV().openDelegations(ctx.state).filter(function (d) { return d.personId === p.id; });
          var max = EN().DOCTRINE.DL_OPEN_MAX;
          if (open.length >= max) g.push({ h: 'Load warning', warn: p.name + ' already holds ' + open.length + ' open delegations (watch line: ' + max + '). Adding another without closing one is hoarding with extra steps.' });
          else g.push({ h: 'Current load', lines: [p.name + ' holds ' + open.length + ' open delegations: ' + open.map(function (d) { return 'L' + (d.level || '?'); }).join(' ')] });
        }
        g.push({ h: 'Pick the level by risk, not by generosity', lines: [
          'Low task risk + growing person → go a level higher than comfortable.',
          'High blast radius + unproven person → L1/L2 with real check-ins is leadership, not distrust.',
          'Saying “you own it” while meaning L3 creates a decision rights bug that surfaces at the worst moment.',
          'Level is per task, per person, and it moves — re-stating it explicitly is the whole practice.' ] });
        g.push({ h: 'The five levels', lines: LEVELS.map(function (l, i) {
          return l + ' · authority: ' + LEVEL_GUIDE[i].auth + ' · check-in: ' + LEVEL_GUIDE[i].cadence;
        }) });
        return g;
      },
      fields: function (ctx, prefill) {
        return [
          { key: 'personId', label: 'Person', kind: 'person', required: 1, value: prefill.personId },
          { key: 'title', label: 'The task, as an outcome', kind: 'text', required: 1, value: prefill.title || '' },
          { key: 'level', label: 'Level', kind: 'level', required: 1, value: prefill.level || '3' },
          { key: 'deadline', label: 'Deliverable date', kind: 'date', value: '' },
          { key: 'why', label: 'Why them (one line — development intent)', kind: 'text', value: '' }
        ];
      },
      submit: function (v, ctx) {
        var lv = parseInt(v.level, 10) || 3;
        var g = LEVEL_GUIDE[Math.max(0, Math.min(4, lv - 1))];
        return { events: [{ type: 'delegation.assigned', personId: v.personId,
          data: { title: v.title, level: lv, checkin: g.cadence, deadline: v.deadline || undefined,
            why: v.why || undefined, script: g.say, viaPlaybook: true } }] };
      }
    },

    situational: {
      id: 'situational', title: 'Situational match', icon: 'diamond',
      blurb: 'Development level per task (D1–D4) → leadership style (S1–S4). Diagnose before you delegate.',
      guide: function (ctx, prefill) {
        var g = [];
        if (ctx.person) {
          var last = EV().latestSL(ctx.state, ctx.person.id);
          if (last) g.push({ h: 'Last diagnosis (' + String(last.ts).slice(0, 10) + ')', lines: [
            last.data.task + ' → ' + last.data.development + ' → ' + last.data.style +
            (last.data.note ? ' · ' + last.data.note : ''), 'Development level is per task. Same person, new task, new diagnosis.' ] });
        }
        g.push({ h: 'The quadrants', lines: [
          'D1 — high commitment, low competence → S1 Directing: steps, examples, daily checks.',
          'D2 — some competence, wavering commitment → S2 Coaching: explain why, attempt + debrief.',
          'D3 — capable, variable confidence → S3 Supporting: ask, unblock, praise risk.',
          'D4 — proven on both → S4 Delegating: outcomes, agreed informing, visibility upward.' ] });
        g.push({ h: 'Stated assumptions (the model’s, and ours)', lines: [
          'Competence and commitment are judged on THIS task, not in general.',
          'When the inputs are mixed, this tool picks the lower style with more structure — over-directing costs less than under-directing at first.',
          'Mismatch check: if they already hold L4–L5 delegations and you diagnose S1/S2, either the ladder or the diagnosis is wrong. You will be warned.' ] });
        return g;
      },
      fields: function (ctx, prefill) {
        return [
          { key: 'personId', label: 'Person', kind: 'person', required: 1, value: prefill.personId },
          { key: 'task', label: 'The task this diagnosis is for', kind: 'text', required: 1, value: prefill.title || '' },
          { key: 'competence', label: 'Competence on THIS task', kind: 'select', required: 1, value: '2', options: [
              { v: '1', l: '1 — new to this task' }, { v: '2', l: '2 — some exposure' },
              { v: '3', l: '3 — capable with support' }, { v: '4', l: '4 — proven' }] },
          { key: 'commitment', label: 'Commitment on THIS task', kind: 'select', required: 1, value: '3', options: [
              { v: '1', l: '1 — disengaged or anxious' }, { v: '2', l: '2 — wavering' },
              { v: '3', l: '3 — motivated' }, { v: '4', l: '4 — driven' }] },
          { key: 'note', label: 'Evidence you are reading (one line)', kind: 'text', value: '' }
        ];
      },
      compose: function (v, ctx) {
        var d = slMatch(+v.competence, +v.commitment), t = SL_TABLE[d];
        var warn = '';
        if (ctx && ctx.person) {
          var open = EV().openDelegations(ctx.state).filter(function (x) { return x.personId === ctx.person.id; });
          var high = open.filter(function (x) { return (x.level || 0) >= 4; }).length;
          if (high > 0 && (t.style === 'S1' || t.style === 'S2'))
            warn = ' MISMATCH: they hold ' + high + ' L4–L5 delegation(s) but you diagnosed ' + t.style + '. Rethink one of them.';
        }
        return v.task + ' → ' + d + ' → ' + t.style + ' ' + t.name + '. ' + t.say + warn;
      },
      submit: function (v, ctx) {
        var d = slMatch(+v.competence, +v.commitment), t = SL_TABLE[d];
        return { events: [{ type: 'sl.assessment', personId: v.personId,
          data: { task: v.task, competence: +v.competence, commitment: +v.commitment,
            development: d, style: t.style, note: v.note || undefined, viaPlaybook: true } }] };
      }
    },

    decision: {
      id: 'decision', title: 'Decision review', icon: 'flag',
      blurb: 'Close the loop. Decision quality is the only calibration data you will ever get about your judgment.',
      guide: function (ctx, prefill) {
        var g = [{ h: 'How to run it', lines: [
          'Read the original rationale out loud before you look at the outcome. Memory edits; paper does not.',
          'Name what actually happened, not what should have.',
          'Separate the call from the result: a good process can lose; a sloppy win teaches you to be sloppy.',
          'Reversed or superseded is not failure — hiding it is.' ] }];
        if (prefill.decisionLabel) g.push({ h: 'On the table', lines: [prefill.decisionLabel + (prefill.daysLate != null ? ' · ' + prefill.daysLate + 'd past review date' : '')] });
        return g;
      },
      fields: function (ctx, prefill) {
        return [
          { key: 'decisionId', label: 'Decision', kind: 'decision', required: 1, value: prefill.decisionId },
          { key: 'outcome', label: 'Outcome', kind: 'select', required: 1, value: '', options: [
              { v: 'as expected', l: 'as expected' }, { v: 'better', l: 'better than expected' },
              { v: 'worse', l: 'worse than expected' }, { v: 'reversed', l: 'reversed' },
              { v: 'superseded', l: 'superseded by newer decision' }] },
          { key: 'note', label: 'Why — what the outcome teaches', kind: 'area', required: 1, value: '' }
        ];
      },
      submit: function (v, ctx) {
        return { events: [{ type: 'decision.outcome', personId: null,
          data: { decisionId: v.decisionId, outcome: v.outcome, note: v.note, viaPlaybook: true } }] };
      }
    },

    goal: {
      id: 'goal', title: 'Goal review', icon: 'flag',
      blurb: 'One line of truth per goal: owner named, progress logged, or the goal killed in the open.',
      guide: function (ctx, prefill) {
        var g = [];
        if (prefill.kind === 'owner') g.push({ h: 'Ownerless goal', warn: 'Nobody is failing at this goal; that is the problem — nobody is doing it. Assign one accountable owner or delete the goal in front of the team. Both are leadership.' });
        else g.push({ h: 'Stalled goal', warn: 'Silence past ' + EN().DOCTRINE.GOAL_STALL_DAYS + 'd means one of three things: blocked, in trouble, or quietly dropped. Ask for the line of truth and log it.' });
        g.push({ h: 'Rules', lines: [
          'One owner. “The team” is not an owner.',
          'Progress entries are facts with dates, not vibes.',
          'Killing a goal visibly teaches more than dragging it.' ] });
        return g;
      },
      fields: function (ctx, prefill) {
        var f = [{ key: 'goalId', label: 'Goal', kind: 'goal', required: 1, value: prefill.goalId }];
        if (prefill.kind === 'owner') f.push({ key: 'ownerPersonId', label: 'Accountable owner', kind: 'person', required: 1, value: prefill.personId });
        else f.push({ key: 'note', label: 'Progress / truth (one line)', kind: 'area', required: 1, value: '' });
        return f;
      },
      submit: function (v, ctx) {
        if (v.ownerPersonId != null) return { events: [{ type: 'goal.assign', personId: null,
          data: { goalId: v.goalId, ownerPersonId: v.ownerPersonId, viaPlaybook: true } }] };
        return { events: [{ type: 'goal.progress', personId: null,
          data: { goalId: v.goalId, note: v.note, viaPlaybook: true } }] };
      }
    }
  };

  /* finding → playbook + prefill. The bridge between engine and mentor. */
  function forFinding(f) {
    var pid = f.personId || undefined, m = f.meta || {};
    switch (f.ruleId) {
      case 'R1': return { pb: 'oneonone', prefill: { personId: pid, ruleKey: f.key } };
      case 'R2': return { pb: 'decision', prefill: { decisionId: m.decisionId, decisionLabel: f.title, daysLate: m.daysLate, ruleKey: f.key } };
      case 'R3': return { pb: 'goal', prefill: { goalId: m.goalId, kind: m.kind, personId: pid, ruleKey: f.key } };
      case 'R4': return { pb: 'sbi', prefill: { personId: pid,
          polarity: m.polarity === 'corrective-heavy' ? 'positive' : 'corrective',
          balanceHint: m.polarity === 'corrective-heavy'
            ? 'All-corrective ledger: pre-set to POSITIVE. Find the thing worth repeating.'
            : 'Praise-only ledger: pre-set to CORRECTIVE. One honest SBI raises the bar.', ruleKey: f.key } };
      case 'R5': return { pb: 'delegation', prefill: { personId: pid, ruleKey: f.key } };
      case 'R6': return { pb: 'desc', prefill: { personId: pid, counterpart: m.counterpart,
          describe: m.counterpart ? 'Recurring issues with ' + m.counterpart + ': ' : '', ruleKey: f.key } };
      case 'R7': return { pb: 'oneonone', prefill: { personId: pid, intent: m.signals === 'both' ? 'load' : undefined,
          followups: m.signals === 'both' ? 'Reassigned: ___ (name one concrete item)' : '', ruleKey: f.key } };
      case 'R8': return { pb: 'oneonone', prefill: { personId: pid, skip: true, via: m.via, ruleKey: f.key } };
    }
    return null;
  }

  return { PBS: PBS, forFinding: forFinding, slMatch: slMatch, SL_TABLE: SL_TABLE,
    LEVELS: LEVELS, LEVEL_GUIDE: LEVEL_GUIDE, optsPerson: optsPerson };
})();
