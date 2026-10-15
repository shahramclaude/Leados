/* LeadOS mf-3 · js/playbooks.js — structured playbooks that pre-fill from live data.
   The mentor layer: not a wiki, a procedure. Each playbook = guidance content +
   a form whose defaults come from the finding/person you came from + a submit
   that writes RESOLVING events through the shared event layer. No capture path
   writes state any other way.
   v3 adds: charter (R9), tour (R10), wincloser (R11). Field kinds are typed so
   ui.js renders them generically — playbooks own content, ui owns chrome. */
window.LEADOS = window.LEADOS || {};
LEADOS.playbooks = (function () {
  'use strict';
  function EV() { return LEADOS.events; }

  /* delegation ladder (wording carried from verified mf-2 read) */
  var LEVELS = ['1 — Do exactly what I say', '2 — Research options, I decide',
    '3 — Propose a plan, I approve', '4 — Decide yourself, inform me', '5 — Own it fully'];
  var LEVEL_GUIDE = [
    { auth: 'You make and announce the decision; they execute exactly.', cadence: 'daily check-in', say: '"Here is what I decided and why. Do it this way; flag deviations immediately."' },
    { auth: 'They gather and compare; you still decide.', cadence: 'every 2–3 days', say: '"Bring me two or three options with a recommendation. I decide."' },
    { auth: 'They propose; you approve before anything moves.', cadence: 'weekly, at proposal points', say: '"Write the plan. Nothing starts until I sign off."' },
    { auth: 'They decide inside the brief; you get informed after.', cadence: 'every 2 weeks / at milestones', say: '"Decide it. Tell me what you decided by Friday, and what you\'d like my eyes on."' },
    { auth: 'Full ownership: decision, execution, and informing you only when results demand it.', cadence: 'monthly outcome review', say: '"It\'s yours. I\'m interested in outcomes and what you learned, not steps."' }
  ];

  var SL_TABLE = {
    D1: { style: 'S1', name: 'Directing', line: 'High commitment, low competence on THIS task.',
      do: ['Define the task in steps', 'Show an example of "done"', 'Check in daily, briefly'],
      say: '"You\'re motivated; here is exactly how this works. I\'ll inspect the first pass."',
      avoid: ['Delegating the outcome', 'Asking "how would you approach it?" as the opener'] },
    D2: { style: 'S2', name: 'Coaching', line: 'Some competence, wavering commitment.',
      do: ['Explain the why, not just the what', 'Let them attempt, then debrief', 'Name the frustration out loud'],
      say: '"You\'re learning fast; the dip you feel is normal. Walk me through your attempt."',
      avoid: ['Pure direction', 'Pure delegation', 'Silence when they stumble'] },
    D3: { style: 'S3', name: 'Supporting', line: 'Capable, but confidence or motivation varies.',
      do: ['Ask, don\'t tell', 'Remove blockers, not responsibility', 'Praise risk taken, not just results'],
      say: '"You can do this. What\'s making it feel heavy this week?"',
      avoid: ['Stepping back in with instructions', 'Micromanaging the how'] },
    D4: { style: 'S4', name: 'Delegating', line: 'Proven competence and commitment on THIS task.',
      do: ['Hand over outcomes, keep the context alive', 'Agree what "inform me" means', 'Give them visibility upward'],
      say: '"It\'s yours. Tell me the outcome and what you changed along the way."',
      avoid: ['Re-opening their decisions', 'Un-negotiated check-ins'] }
  };
  function slMatch(comp, comm) { /* integers 1–4; assumption printed in the guide */
    if (comp <= 1 && comm >= 3) return 'D1';
    if (comp === 2 && comm <= 2) return 'D2';
    if (comp >= 3 && comm >= 3) return 'D4';
    if (comp >= 3 && comm <= 2) return 'D3';
    if (comm === 1) return 'D3';               /* commitment crisis: support before structure */
    return 'D2';                                /* mixed middle: more structure — a stated assumption */
  }

  function optsPerson(state, includeSelf) {
    var out = [];
    if (includeSelf) out.push({ v: 'me', l: 'me (this is my own goal)' });
    (state.people || []).forEach(function (p) {
      if (p && !p.archived) out.push({ v: p.id, l: p.name + (p.role ? ' · ' + p.role : '') });
    });
    return out;
  }
  function nameOf(state, pid) {
    var p = (state.people || []).filter(function (x) { return x && x.id === pid; })[0];
    return p ? p.name : 'unknown person';
  }

  var PBS = {
    oneonone: {
      id: 'oneonone', title: '1:1 run sheet', icon: 'cal',
      blurb: 'A 1:1 that compounds: wellbeing first, their blockers before your agenda, one feedback moment, one growth beat.',
      guide: function (ctx, prefill) {
        var g = [], p = ctx.person;
        if (prefill.skip) g.push({ h: 'Skip-level mode', warn: 'They report to ' + (prefill.via ? nameOf(ctx.state, prefill.via) : 'their lead') + ', not you. Your job is signal, not supervision: what slows you down · what should I know · what would you change. Never undermine their lead in the room.' });
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
          '1. Opening pulse — mood and load, THEIR number not yours (log it measured only if they actually said it).',
          '2. Their priorities and blockers — before yours. Ask "what is slower than it should be?"',
          '3. Your items — max two.',
          '4. One feedback moment — SBI if you have one; silence is also data.',
          '5. Growth beat — one question about where they want to be in 6 months.',
          '6. Commitments — who does what by when. That is next session\'s opening.' ] });
        return g;
      },
      fields: function (ctx, prefill) {
        return [
          { key: 'personId', label: 'Person', kind: 'person', required: 1, value: prefill.personId },
          { key: 'date', label: 'Date', kind: 'date', required: 1, value: ctx.today },
          { key: 'duration', label: 'Minutes', kind: 'num', value: '30' },
          { key: 'mood', label: 'Mood (1–10, only if they said it)', kind: 'num', value: '', hint: 'empty = not said = not logged. Never invent a number.' },
          { key: 'load', label: 'Load (1–10, only if they said it)', kind: 'num', value: '' },
          { key: 'skip', label: 'This was a skip-level session', kind: 'check', value: !!prefill.skip },
          { key: 'note', label: 'What mattered (one or two lines)', kind: 'area', value: '' },
          { key: 'followups', label: 'Commitments made (feeds next session)', kind: 'text', value: '' }
        ];
      },
      submit: function (v, ctx) {
        var evs = [{ type: 'oneonone.logged', personId: v.personId,
          data: { note: v.note || undefined, duration: Number(v.duration) || undefined,
            followups: v.followups || undefined, skip: !!v.skip, viaPlaybook: true } }];
        var mood = Number(v.mood), load = Number(v.load);
        if (v.mood !== '' && v.load !== '' && isFinite(mood) && isFinite(load)) {
          evs.push({ type: 'pulse.logged', personId: v.personId,
            data: { mood: mood, load: load, estimated: false,
              source: 'spoken in 1:1 — do not mark measured unless they said it' } });
        }
        return { events: evs, flash: '1:1 logged. R1/R8 recompute from it immediately.' };
      }
    },

    sbi: {
      id: 'sbi', title: 'SBI feedback', icon: 'chat',
      blurb: 'Situation · Behavior · Impact — feedback that is hard to argue with because it contains no verdict.',
      guide: function (ctx) {
        var g = [{ h: 'The formula', lines: [
          'S — when and where. "In Tuesday\'s planning call", not "lately".',
          'B — the observable behavior. A camera would agree with you. No adjectives, no motives.',
          'I — the impact on work, team, or you. Concrete: "the estimate slipped a day", "Marta went quiet".',
          'Then stop talking. Ask: "how do you see it?"' ] },
          { h: 'Do not', lines: ['Sandwich it between praise to soften it — that teaches people to fear your praise.',
            'Corrective-feedback someone you have never praised. Fix the ratio first (R4 watches it).'] }];
        if (ctx.person) {
          var bal = EV().feedbackBalance(ctx.state, ctx.person.id, 60, ctx.today);
          g.splice(1, 0, { h: 'Ratio check (60d, from your data)', lines: [bal.corrective + ' corrective / ' + bal.positive + ' positive'],
            warn: bal.total >= 3 && bal.corrective / bal.total >= 0.8 ? 'Imbalanced toward corrective — is this the moment, or is a positive SBI overdue?' : null });
        }
        return g;
      },
      fields: function (ctx, prefill) {
        return [
          { key: 'personId', label: 'Person', kind: 'person', required: 1, value: prefill.personId },
          { key: 'polarity', label: 'Polarity', kind: 'select', required: 1, value: 'positive',
            options: [{ v: 'positive', l: 'positive — worth repeating' }, { v: 'corrective', l: 'corrective — must change' }] },
          { key: 's', label: 'Situation (when / where)', kind: 'text', required: 1, value: prefill.s || '' },
          { key: 'b', label: 'Behavior (a camera would agree)', kind: 'area', required: 1, value: prefill.b || '' },
          { key: 'i', label: 'Impact (on work / team / you)', kind: 'area', required: 1, value: '' },
          { key: 'deliveredOn', label: 'Delivered on', kind: 'date', required: 1, value: ctx.today }
        ];
      },
      submit: function (v) {
        return { events: [{ type: 'feedback.logged', personId: v.personId,
          data: { polarity: v.polarity, sbi: 'S: ' + v.s + ' · B: ' + v.b + ' · I: ' + v.i,
            deliveredOn: v.deliveredOn } }],
          flash: 'Feedback logged — it lands in the 60d balance for R4.' };
      }
    },

    desc: {
      id: 'desc', title: 'DESC for recurring conflict', icon: 'alert',
      blurb: 'Describe · Express · Specify · Consequences — the script for the third time the same conflict shows up.',
      guide: function (ctx) {
        var open = ctx.person ? EV().openConflicts(ctx.state).filter(function (c) { return c.personId === ctx.person.id; }) : [];
        var g = [{ h: 'The script', lines: [
          'D — the recurring situation, factual. "Twice this month the on-call plan changed after sign-off."',
          'E — the effect, owned. "I end up re-planning at midnight; my team absorbs the churn."',
          'S — the specific change you want. "Changes after sign-off go through me, or a named deputy, same day."',
          'C — the consequence, stated without threat. "Otherwise I take the budget decision back to the staff meeting."' ] },
          { h: 'Ground rules', lines: ['Address the pattern, not the person\'s character.',
            'If it resolves: log the resolution with the actual agreement — vague peace counts as unresolved.'] }];
        if (open.length) g.unshift({ h: 'Open conflicts on record (pre-read)', lines: open.map(function (c) { return c.label; }),
          warn: open.length >= 2 ? 'Two or more open — this is exactly the DESC case. Pick the recurring counterpart.' : null });
        return g;
      },
      fields: function (ctx, prefill) {
        var open = EV().openConflicts(ctx.state);
        var flds = [
          { key: 'personId', label: 'Person (owner of the conflict on your roster)', kind: 'person', required: 1, value: prefill.personId },
          { key: 'counterpart', label: 'Counterpart', kind: 'text', value: prefill.counterpart || '' },
          { key: 'existing', label: 'Link an open conflict (optional)', kind: 'select', value: '',
            options: [{ v: '', l: '— register as new —' }].concat(open.map(function (c) { return { v: c.id, l: c.label }; })) },
          { key: 'd', label: 'D — describe the pattern', kind: 'area', required: 1, value: '' },
          { key: 's', label: 'S — the specific change you will ask for', kind: 'area', required: 1, value: '' },
          { key: 'stage', label: 'Outcome of the session', kind: 'select', required: 1, value: 'held',
            options: [{ v: 'held', l: 'conversation held — still open' },
              { v: 'resolved', l: 'resolved — agreement logged below' }] },
          { key: 'agreement', label: 'The agreement (required if resolved)', kind: 'area', value: '' }
        ];
        return flds;
      },
      submit: function (v) {
        var evs = [], conflictId = v.existing || null;
        if (!conflictId) {
          conflictId = 'pending';
          evs.push({ type: 'conflict.registered', personId: v.personId,
            data: { counterpart: v.counterpart || undefined, note: 'DESC session: ' + v.d.slice(0, 140) } });
        }
        if (v.stage === 'resolved' && v.existing) {
          evs.push({ type: 'conflict.resolved', data: { conflictId: v.existing, how: 'DESC: ' + (v.agreement || 'agreement logged'), agreement: v.agreement || undefined } });
        } else if (v.stage === 'resolved') {
          evs.push({ type: 'conflict.resolved', data: { conflictId: 'SELF', selfRef: true, how: 'DESC: ' + (v.agreement || '') } });
        } else {
          evs.push({ type: 'conflict.addressed', personId: v.personId,
            data: { conflictId: v.existing || undefined, ask: v.s, note: 'DESC held, still open' } });
        }
        return { events: evs, selfRef: true, flash: 'DESC session recorded against the conflict stream.' };
      }
    },

    delegation: {
      id: 'delegation', title: 'Delegation ladder', icon: 'hand',
      blurb: 'Five levels from "do exactly what I say" to "own it fully" — pick the level out loud, or you delegate by vibe.',
      guide: function (ctx, prefill) {
        var open = ctx.person ? EV().openDelegations(ctx.state).filter(function (d) { return d.personId === ctx.person.id; }) : [];
        var g = [{ h: 'The five levels', lines: LEVELS.map(function (l, i) {
            return l + ' — ' + LEVEL_GUIDE[i].auth + ' (' + LEVEL_GUIDE[i].cadence + ')'; }) },
          { h: 'Say it in the room', lines: LEVEL_GUIDE.map(function (lg, i) { return (i + 1) + ': ' + lg.say; }) }];
        if (ctx.person) g.unshift({ h: 'Current load (from your data)', lines: [
          'open delegations: ' + open.length + (open.length > 4 ? ' — over the R5 threshold, rebalance before adding' : ''),
          open.length ? 'current: ' + open.map(function (d) { return d.label + ' (L' + (d.level || '?') + ')'; }).join(' · ') : 'nothing open'
        ], warn: open.length > 4 ? 'Over loaded. The move is closing or down-leveling something, not adding.' : null });
        return g;
      },
      fields: function (ctx, prefill) {
        var open = EV().openDelegations(ctx.state);
        return [
          { key: 'mode', label: 'Mode', kind: 'select', required: 1, value: prefill.personId && prefill.intent !== 'assign' ? 'close' : 'assign',
            options: [{ v: 'assign', l: 'assign something new' }, { v: 'close', l: 'close / review an open delegation' }] },
          { key: 'personId', label: 'Person', kind: 'person', required: 1, value: prefill.personId },
          { key: 'title', label: 'What (assign mode)', kind: 'text', value: '' },
          { key: 'level', label: 'Level (assign mode)', kind: 'select', value: '3',
            options: LEVELS.map(function (l, i) { return { v: String(i + 1), l: l }; }) },
          { key: 'existing', label: 'Open item (close mode)', kind: 'select', value: '',
            options: [{ v: '', l: '—' }].concat(open.map(function (d) { return { v: d.id, l: d.label }; })) },
          { key: 'result', label: 'Outcome note (close mode)', kind: 'area', value: '' }
        ];
      },
      submit: function (v) {
        if (v.mode === 'close' && v.existing) {
          return { events: [{ type: 'delegation.closed', data: { delegationId: v.existing, result: v.result || undefined } }],
            flash: 'Delegation closed — R5 load recomputes.' };
        }
        if (!v.title) return { error: 'assign mode needs a title' };
        return { events: [{ type: 'delegation.assigned', personId: v.personId,
          data: { title: v.title, level: Number(v.level) || 3 } }],
          flash: 'Delegation assigned at level ' + v.level + ' — say the level out loud to them too.' };
      }
    },

    sl: {
      id: 'sl', title: 'Situational leadership D1–D4 → S1–S4', icon: 'grid',
      blurb: 'Same person, different task, different style. Readiness is per-task — never a label on a human.',
      guide: function (ctx, prefill) {
        var prev = ctx.person ? EV().latestSL(ctx.state, ctx.person.id) : null;
        var g = [{ h: 'How to read a person-task', lines: [
          'Competence: have they done THIS task well before? 1 = never … 4 = repeatably.',
          'Commitment: energy and confidence on THIS task. 1 = avoidant … 4 = self-starting.',
          'The match is a heuristic, not a measurement — the engine states the assumption, you own the judgment.' ] },
          { h: 'The four styles', lines: ['D1 → S1 Directing · D2 → S2 Coaching · D3 → S3 Supporting · D4 → S4 Delegating'] }];
        if (prev) g.unshift({ h: 'Last assessment for ' + (ctx.person ? ctx.person.name : 'them'), lines: [
          String(prev.ts).slice(0, 10) + ' · task: ' + (prev.data.task || '—'),
          'competence ' + prev.data.competence + ' · commitment ' + prev.data.commitment + ' → ' + prev.data.style + ' ' + (SL_TABLE[prev.data.level] || {}).name ] });
        if (prefill.comp && prefill.comm) {
          var lvl = slMatch(Number(prefill.comp), Number(prefill.comm));
          var t = SL_TABLE[lvl];
          g.unshift({ h: 'Matched: ' + lvl + ' → ' + t.style + ' ' + t.name, lines:
            [t.line].concat(t.do.map(function (x) { return 'do: ' + x; })).concat(['say: ' + t.say])
              .concat(t.avoid.map(function (x) { return 'avoid: ' + x; })),
            warn: 'Heuristic match — if it feels wrong, your competence/commitment read is wrong, not the table.' });
        }
        return g;
      },
      fields: function (ctx, prefill) {
        return [
          { key: 'personId', label: 'Person', kind: 'person', required: 1, value: prefill.personId },
          { key: 'task', label: 'The specific task', kind: 'text', required: 1, value: prefill.task || '' },
          { key: 'competence', label: 'Competence on this task (1–4)', kind: 'select', required: 1, value: '2',
            options: [1, 2, 3, 4].map(function (n) { return { v: String(n), l: String(n) }; }) },
          { key: 'commitment', label: 'Commitment on this task (1–4)', kind: 'select', required: 1, value: '2',
            options: [1, 2, 3, 4].map(function (n) { return { v: String(n), l: String(n) }; }) },
          { key: 'oneMove', label: 'The one move you will make', kind: 'text', value: '' }
        ];
      },
      submit: function (v) {
        var lvl = slMatch(Number(v.competence), Number(v.commitment)), t = SL_TABLE[lvl];
        return { events: [{ type: 'sl.assessment', personId: v.personId,
          data: { task: v.task, competence: Number(v.competence), commitment: Number(v.commitment),
            level: lvl, style: t.style, styleName: t.name, oneMove: v.oneMove || undefined, heuristic: true } }],
          flash: 'Assessed ' + lvl + ' → ' + t.style + ' ' + t.name + '. ' + t.say };
      }
    },

    decision: {
      id: 'decision', title: 'Decision review', icon: 'diamond',
      blurb: 'A decision without a review date is a hope. A review without an outcome is a wasted calibration point.',
      guide: function (ctx, prefill) {
        var open = EV().openDecisions(ctx.state);
        var g = [{ h: 'Review standard', lines: [
          'Judge the decision by what was knowable WHEN decided, not by the outcome alone — good calls lose sometimes.',
          'right / wrong / mixed — "mixed" is usually the honest answer; say what was each.',
          'Log the lesson as one sentence a stranger could act on.' ] }];
        if (prefill.decisionId || open.length) g.unshift({ h: 'Open decisions', lines: open.map(function (d) {
          return d.label + ' · review ' + (d.reviewDate || '—'); }) });
        return g;
      },
      fields: function (ctx, prefill) {
        var open = EV().openDecisions(ctx.state);
        return [
          { key: 'mode', label: 'Mode', kind: 'select', required: 1, value: prefill.decisionId ? 'outcome' : 'new',
            options: [{ v: 'new', l: 'log a new decision' }, { v: 'outcome', l: 'record an outcome' }] },
          { key: 'title', label: 'Decision (new mode)', kind: 'text', value: '' },
          { key: 'context', label: 'What was knowable at the time (new mode)', kind: 'area', value: '' },
          { key: 'reviewDate', label: 'Review date (new mode)', kind: 'date', value: ctx.today },
          { key: 'existing', label: 'Decision (outcome mode)', kind: 'select', value: prefill.decisionId || '',
            options: [{ v: '', l: '—' }].concat(open.map(function (d) { return { v: d.id, l: d.label }; })) },
          { key: 'outcome', label: 'Verdict (outcome mode)', kind: 'select', value: 'mixed',
            options: [{ v: 'right', l: 'right call' }, { v: 'wrong', l: 'wrong call' }, { v: 'mixed', l: 'mixed — details below' }] },
          { key: 'lesson', label: 'The one-sentence lesson', kind: 'area', value: '' }
        ];
      },
      submit: function (v) {
        if (v.mode === 'outcome') {
          if (!v.existing) return { error: 'pick which decision this outcome closes' };
          return { events: [{ type: 'decision.outcome', data: { decisionId: v.existing, outcome: v.outcome, lesson: v.lesson || undefined } }],
            flash: 'Outcome logged — R2 goes quiet for this decision.' };
        }
        if (!v.title) return { error: 'new decision needs a title' };
        return { events: [{ type: 'decision.logged', data: { title: v.title, context: v.context || undefined, reviewDate: v.reviewDate || undefined } }],
          flash: 'Decision logged with a review date — R2 will hold you to it.' };
      }
    },

    goal: {
      id: 'goal', title: 'Goal review', icon: 'goal',
      blurb: 'One owner, one next visible step. Goals die of silence, not of ambition.',
      guide: function (ctx, prefill) {
        var open = EV().openGoals(ctx.state);
        var g = [{ h: 'Review standard', lines: [
          'Every goal has exactly one owner — a name, not "the team".',
          'Progress means a dated fact ("3 finalists in pipeline"), not a feeling.',
          'If a goal has been silent twice in a row, kill it out loud or re-scope it. Zombie goals tax the living ones.' ] }];
        if (open.length) g.unshift({ h: 'Open goals (from your data)', lines: open.map(function (gl) {
          var owner = gl.ownerPersonId ? nameOf(ctx.state, gl.ownerPersonId) : 'NO OWNER';
          return gl.label + ' · ' + owner + ' · last anchor ' + String(gl.lastProgressTs).slice(0, 10); }) });
        return g;
      },
      fields: function (ctx, prefill) {
        var open = EV().openGoals(ctx.state);
        return [
          { key: 'mode', label: 'Mode', kind: 'select', required: 1, value: prefill.goalId ? 'progress' : 'new',
            options: [{ v: 'new', l: 'set a new goal' }, { v: 'progress', l: 'log progress' }, { v: 'assign', l: 'assign an owner' }] },
          { key: 'title', label: 'Goal (new mode)', kind: 'text', value: '' },
          { key: 'ownerPersonId', label: 'Owner', kind: 'select', value: prefill.personId || '',
            options: [{ v: '', l: '— pick one name —' }].concat(optsPerson(ctx.state, true)) },
          { key: 'reviewBy', label: 'Review by (new mode)', kind: 'date', value: '' },
          { key: 'existing', label: 'Goal (progress/assign mode)', kind: 'select', value: prefill.goalId || '',
            options: [{ v: '', l: '—' }].concat(open.map(function (gl) { return { v: gl.id, l: gl.label }; })) },
          { key: 'note', label: 'Progress note — a dated fact', kind: 'area', value: '' }
        ];
      },
      submit: function (v) {
        if (v.mode === 'new') {
          if (!v.title) return { error: 'goal needs a title' };
          return { events: [{ type: 'goal.set', data: { title: v.title,
            ownerPersonId: v.ownerPersonId || undefined, reviewBy: v.reviewBy || undefined } }],
            flash: v.ownerPersonId ? 'Goal set with an owner.' : 'Goal set WITHOUT an owner — R3 will nag until it has a name.' };
        }
        if (!v.existing) return { error: 'pick the goal' };
        if (v.mode === 'assign') {
          if (!v.ownerPersonId) return { error: 'assign needs an owner name' };
          return { events: [{ type: 'goal.assign', data: { goalId: v.existing, ownerPersonId: v.ownerPersonId } }],
            flash: 'Owner assigned.' };
        }
        return { events: [{ type: 'goal.progress', data: { goalId: v.existing, note: v.note || undefined } }],
          flash: 'Progress logged — the stall clock resets from this entry.' };
      }
    },

    /* ---------------- arrival playbooks (v3) ---------------- */
    charter: {
      id: 'charter', title: 'Expectations charter (with your boss)', icon: 'shield',
      blurb: 'Five questions that turn "do a great job" into a contract you can actually be measured against.',
      guide: function (ctx) {
        var a = EV().arrival(ctx.state, ctx.today);
        var g = [{ h: 'The five questions (ask them in this order)', lines: [
          '1. "Ninety days from now, what has to be true for you to say hiring me was the right call?"',
          '2. "What should I keep, stop, and change — in that order?"',
          '3. "Which decisions are mine alone, mine-with-notice, and yours?"',
          '4. "How do we communicate — cadence, format, and what counts as urgent enough to interrupt you?"',
          '5. "What are the landmines — what did my predecessor do that I should never repeat?"' ] },
          { h: 'Rules of the room', lines: [
            'Write THEIR words, not your translation. Disagreement recorded honestly beats fake alignment.',
            'End by repeating the top one back: "so my 90-day bar is ___." If they flinch, you just saved a quarter.',
            'Log every answer below — one entry per question. This kills R9 and anchors R10/R11.' ] }];
        if (a.set) g.unshift({ h: 'Where you stand', lines: [
          'day ' + (a.day == null ? '?' : a.day) + ' since ' + a.startDate,
          'expectations captured so far: ' + a.expectationCount ],
          warn: a.expectationCount === 0 ? 'Zero so far. Every day without this you are optimizing toward a guess.' : null });
        return g;
      },
      fields: function (ctx) {
        return [
          { key: 'boss', label: 'Who you aligned with', kind: 'text', value: '', hint: 'name / skip-level boss / board — whoever owns your review' },
          { key: 'q1', label: '1 · The 90-day bar', kind: 'area', required: 1, value: '' },
          { key: 'q2', label: '2 · Keep / stop / change', kind: 'area', value: '' },
          { key: 'q3', label: '3 · Decision rights', kind: 'area', value: '' },
          { key: 'q4', label: '4 · Comms cadence', kind: 'area', value: '' },
          { key: 'q5', label: '5 · Landmines', kind: 'area', value: '' }
        ];
      },
      submit: function (v) {
        var items = [];
        [['q1', '90-day bar'], ['q2', 'keep/stop/change'], ['q3', 'decision rights'], ['q4', 'comms'], ['q5', 'landmines']]
          .forEach(function (pair) { if (v[pair[0]] && v[pair[0]].trim()) items.push(pair[1] + ': ' + v[pair[0]].trim()); });
        if (!items.length) return { error: 'capture at least one answer — an empty charter is worse than none' };
        return { events: [{ type: 'expectation.logged', data: { source: 'boss', boss: v.boss || undefined, items: items } }],
          flash: items.length + ' expectation(s) captured. R9 resolves; revisit this monthly and after each re-org rumor.' };
      }
    },

    tour: {
      id: 'tour', title: 'Listening-tour visit', icon: 'tour',
      blurb: 'Twenty structured minutes per lead before you change anything. The tour buys you the right to have opinions.',
      guide: function (ctx) {
        var a = EV().arrival(ctx.state, ctx.today);
        var g = [{ h: 'The four questions', lines: [
          '1. "What is working that I should never touch?"',
          '2. "What is slower than it should be — and since when?"',
          '3. "If you had my job for a day, what would you change first?"',
          '4. "What are you afraid a new boss will break?"' ] },
          { h: 'Rules of the road', lines: [
            'Listen. You are allowed exactly zero commitments and zero rebuttals in this meeting.',
            'Log the visit with THEIR themes, in their words. The coverage bar counts visits, not vibes.'] }];
        if (a.set) {
          g.unshift({ h: 'Coverage (from your roster)', lines: [
            'visited: ' + a.tour.visitedCount + '/' + a.tour.directCount + ' direct leads · day ' + (a.day == null ? '?' : a.day),
            a.tour.missing.length ? 'still missing: ' + a.tour.missing.map(function (p) { return p.name; }).join(' · ') : 'tour complete — opinions unlocked',
            'skip-level visits logged: ' + a.tour.skipCount ] });
        }
        return g;
      },
      fields: function (ctx, prefill) {
        return [
          { key: 'mode', label: 'Who', kind: 'select', required: 1, value: prefill.mode || 'lead',
            options: [{ v: 'lead', l: 'a direct lead' }, { v: 'skiplevel', l: 'a skip-level (their report)' }, { v: 'peer', l: 'a peer / partner' }] },
          { key: 'personId', label: 'Person (for leads / skip-levels on roster)', kind: 'person', value: prefill.personId },
          { key: 'counterpart', label: 'Name (if not on roster)', kind: 'text', value: '' },
          { key: 'themes', label: 'Themes in their words', kind: 'area', required: 1, value: '' },
          { key: 'protect', label: 'What they asked you to protect', kind: 'text', value: '' },
          { key: 'change', label: 'What they would change first', kind: 'text', value: '' }
        ];
      },
      submit: function (v) {
        if (v.mode === 'lead' && !v.personId) return { error: 'a lead visit needs a roster person — that is what the coverage bar counts' };
        return { events: [{ type: 'tour.visit', personId: v.personId || null,
          data: { mode: v.mode, counterpart: v.counterpart || undefined, themes: v.themes,
            protect: v.protect || undefined, change: v.change || undefined } }],
          flash: 'Visit logged. R10 coverage recomputes against today\'s roster.' };
      }
    },

    wincloser: {
      id: 'wincloser', title: 'Early-win verification', icon: 'flag',
      blurb: 'You announced it. Now prove it — or walk it back while walking back is cheap.',
      guide: function (ctx, prefill) {
        var g = [{ h: 'The verification standard', lines: [
          'Would the metric, as committed, convince a skeptic? Not "things feel better".',
          'Has it survived at least two ordinary weeks — not one heroic one?',
          'Who besides you has seen the evidence? Name them.',
          'What result would make you walk it back? If nothing would, you are not verifying, you are campaigning.' ] },
          { h: 'On walking back', lines: [
            '"I said X; the data says Y; here is what I am doing about it" — said once, early, buys more trust than five verified wins.',
            'A partial is not a miss. Log it honestly and recommit a narrower metric.' ] }];
        if (prefill.title) g.unshift({ h: 'The open loop', lines: [
          'win: ' + prefill.title,
          'metric as committed: ' + (prefill.metric || 'NONE — the real problem; you cannot verify a vibe'),
          'verify date was: ' + (prefill.verifyDate || '—'),
          prefill.announcedTo ? 'announced to: ' + prefill.announcedTo + ' — they are waiting' : 'not announced — verify quietly' ] });
        return g;
      },
      fields: function (ctx, prefill) {
        var open = EV().arrival(ctx.state, ctx.today).wins.open;
        return [
          { key: 'winId', label: 'Which win', kind: 'select', required: 1, value: prefill.winId || '',
            options: [{ v: '', l: '—' }].concat(open.map(function (w) { return { v: w.id, l: w.title + ' · verify ' + (w.verifyDate || '—') }; })) },
          { key: 'outcome', label: 'Verdict', kind: 'select', required: 1, value: 'hit',
            options: [{ v: 'hit', l: 'verified — metric met' }, { v: 'partial', l: 'partial — met in part' }, { v: 'missed', l: 'missed — walking it back' }] },
          { key: 'evidence', label: 'The evidence (numbers, witnesses)', kind: 'area', required: 1, value: '' },
          { key: 'publicCorrection', label: 'I announced this and owe a public correction/update', kind: 'check', value: !!prefill.announcedTo },
          { key: 'nextMetric', label: 'Recommitted metric (if partial/missed)', kind: 'text', value: '' }
        ];
      },
      submit: function (v) {
        if (!v.winId) return { error: 'pick the win this closes' };
        var evs = [{ type: 'earlywin.verified', data: { winId: v.winId, outcome: v.outcome,
          evidence: v.evidence, publicCorrection: !!v.publicCorrection } }];
        if ((v.outcome === 'partial' || v.outcome === 'missed') && v.nextMetric) {
          evs.push({ type: 'earlywin.committed', data: { title: 'recommit after ' + v.outcome,
            metric: v.nextMetric, verifyDate: undefined, followUpTo: v.winId } });
        }
        return { events: evs,
          flash: v.outcome === 'hit' ? 'Verified. One data point of trust, banked.' :
            v.outcome === 'partial' ? 'Logged as partial — honest fractions compound.' :
            'Walked back. Expensive today, cheap compared to being found out.' };
      }
    }
  };

  function list() {
    return Object.keys(PBS).map(function (k) {
      return { id: k, title: PBS[k].title, blurb: PBS[k].blurb, icon: PBS[k].icon };
    });
  }
  return { PBS: PBS, list: list, LEVELS: LEVELS, SL_TABLE: SL_TABLE, slMatch: slMatch };
})();
