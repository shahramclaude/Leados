/* LeadOS mf-4 · js/playbooks.js — structured playbooks that pre-fill from live data.
   The mentor layer: not a wiki, a procedure. Each playbook = guidance blocks +
   a typed form whose defaults come from the finding/person you came from +
   a submit that writes RESOLVING events through the shared event layer.
   No capture path writes state any other way.
   Verified-carried from mf-3 head read: delegation LEVELS/LEVEL_GUIDE wording,
   SL_TABLE with slMatch (incl. "commitment crisis → D3", "mixed middle → D2 —
   a stated assumption"), the 1:1 run sheet structure, measured-only pulse
   discipline ("only if they said it"). mf-4 ADDS: DESC is now two-party
   (counterpart pre-fill + conflict.resolved on submit) · nexus mode in the
   1:1 sheet. Playbooks own content; ui owns chrome. */
window.LEADOS = window.LEADOS || {};
LEADOS.playbooks = (function () {
  'use strict';
  function EV() { return LEADOS.events; }

  /* delegation ladder (wording carried from verified mf-3 read) */
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
        if (prefill.intent === 'nexus') g.push({ h: 'Conflict-nexus mode', warn: 'Do NOT relitigate individual disputes. Name the pattern once, plainly: "Three open frictions, different people, one common factor — us two in one of them is not the case; the common factor is you. I want to understand what\'s underneath." Then listen. Your job today is a hypothesis, not a verdict.' });
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
        g.push({ h: 'Failure modes', lines: [
          'Status-report capture: if you could have read it, don\'t meet it.',
          'Therapy drift: empathize, then route to action or help — thirty minutes of venting teaches venting.',
          'Your monologue: if you talked more than half, you supervised, you didn\'t lead.' ] });
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
        var evs = [{ type: 'oneonone.logged', personId: v.personId, ts: v.date ? v.date + 'T12:00:00' : undefined,
          data: { note: v.note || undefined, duration: Number(v.duration) || undefined,
            followups: v.followups || undefined, skip: !!v.skip, viaPlaybook: true } }];
        var mood = Number(v.mood), load = Number(v.load);
        if (v.mood !== '' && v.load !== '' && isFinite(mood) && isFinite(load)) {
          evs.push({ type: 'pulse.logged', personId: v.personId, ts: v.date ? v.date + 'T12:00:00' : undefined,
            data: { mood: mood, load: load, estimated: false, source: 'oneonone' } });
        }
        return evs;
      }
    },

    sbi: {
      id: 'sbi', title: 'SBI feedback', icon: 'msg',
      blurb: 'Situation–Behavior–Impact: feedback specific enough to act on, clean enough to hear.',
      guide: function (ctx, prefill) {
        var p = ctx.person, g = [];
        if (p) {
          var bal = EV().feedbackBalance(ctx.state, p.id, 60, ctx.today);
          g.push({ h: 'Balance check (60d)', lines: ['logged for ' + p.name + ': ' + bal.corrective + ' corrective / ' + bal.positive + ' positive'],
            warn: bal.total >= 3 && bal.positive === 0 ? 'All corrective lately. Consider making THIS one a reinforcing SBI — specificity is what makes praise land as true.' :
                  bal.total >= 3 && bal.corrective === 0 ? 'All positive lately. If there is a hard thing unsaid, this is the moment.' : null });
        }
        g.push({ h: 'The frame', lines: [
          'Situation — where and when. One sentence, verifiable: "In Tuesday\'s roadmap review…"',
          'Behavior — what a camera recorded. No adjectives, no motives: "…you interrupted Priya three times…"',
          'Impact — the effect on people/work, not on your feelings: "…she stopped contributing and we lost the risk she was about to name."',
          'Then STOP. Ask: "How do you see it?" — the conversation after is the feedback.' ] });
        g.push({ h: 'Kills the frame', lines: [
          '"Always / never" — invites one counterexample to end the point.',
          'Motive guesses ("you don\'t care") — you can\'t verify intent, they know it, the trust cost is real.',
          'The sandwich — people hear only the bread and file you as vague.' ] });
        return g;
      },
      fields: function (ctx, prefill) {
        return [
          { key: 'personId', label: 'Person', kind: 'person', required: 1, value: prefill.personId },
          { key: 'polarity', label: 'Polarity', kind: 'select', required: 1, value: 'positive',
            options: [{ v: 'positive', l: 'positive / reinforcing' }, { v: 'corrective', l: 'corrective / redirecting' }] },
          { key: 'situation', label: 'S — Situation', kind: 'text', value: '', hint: 'where/when, one verifiable sentence' },
          { key: 'behavior', label: 'B — Behavior (camera-visible)', kind: 'area', value: '' },
          { key: 'impact', label: 'I — Impact', kind: 'area', value: '' },
          { key: 'ask', label: 'The ask / the repeat', kind: 'text', value: '' }
        ];
      },
      submit: function (v) {
        return [{ type: 'feedback.logged', personId: v.personId,
          data: { polarity: v.polarity, structure: 'sbi', situation: v.situation, behavior: v.behavior,
            impact: v.impact, ask: v.ask, delivered: true,
            summary: (v.situation || '').slice(0, 60), viaPlaybook: true } }];
      }
    },

    desc: {
      id: 'desc', title: 'DESC conflict script', icon: 'link',
      blurb: 'Describe–Express–Specify–Consequences: for conflicts that repeat, structured so both parties can hear it. mf-4: two-party pre-fill from the pair finding.',
      guide: function (ctx, prefill) {
        var g = [], other = prefill.counterpartPersonId ? nameOf(ctx.state, prefill.counterpartPersonId) : (prefill.counterpartText || null);
        var aName = ctx.person ? ctx.person.name : 'Party A';
        g.push({ h: 'The pair', lines: ['This conversation is framed for: ' + aName + (other ? ' × ' + other : ' × (counterparty — select below)') + '.',
          'If the pattern involves you, say so in E — owning your half first disarms the other half.'] });
        if (prefill.conflicts && prefill.conflicts.length) g.push({ h: 'The repeating pattern (from your data)', lines: prefill.conflicts.map(function (c) {
          return String(c.ts).slice(0, 10) + ' · ' + (c.summary || 'no summary logged'); }) });
        g.push({ h: 'The frame', lines: [
          'Describe — the observable situation, both parties would nod: "The last two releases, signoff landed the night before ship."',
          'Express — your experience, owned: "I end up choosing between shipping blind and slipping the date." Not "you make me".',
          'Specify — the concrete change, small enough to try for two weeks: "Signoff by Thursday noon, or you flag it red."',
          'Consequences — what better looks like when it works, and what you\'ll do next if it doesn\'t. Stated calmly, not threatened.' ] });
        g.push({ h: 'Multi-team addendum', warn: 'You lead leads. When the conflict is between two of YOUR leads: stay structural — the question is rarely "who is right", it is "what in the system puts them at each other twice a quarter". Fix the interface (RACI, signoff SLA, on-call ownership) or the conflict returns with the next two people.' });
        g.push({ h: 'Failure modes', lines: [
          'Mediating to compromise every time — teaches them the prize goes to whoever escalates loudest.',
          'Solving it FOR them when one of them is you — that\'s avoidance wearing a referee shirt.',
          'Closing the loop in your head only — log the resolution below or the engine keeps (correctly) nagging.' ] });
        return g;
      },
      fields: function (ctx, prefill) {
        var f = [
          { key: 'personId', label: 'Party A', kind: 'person', required: 1, value: prefill.personId },
          { key: 'counterpartPersonId', label: 'Party B (roster)', kind: 'person', value: prefill.counterpartPersonId, hint: 'leave empty if they\'re not on the roster — use the text field' },
          { key: 'counterpartText', label: 'Party B (name, if not on roster)', kind: 'text', value: prefill.counterpartText || '' },
          { key: 'withMe', label: 'This conflict involves me directly', kind: 'check', value: !!prefill.withMe },
          { key: 'describe', label: 'D — Describe (observable)', kind: 'area', value: '' },
          { key: 'express', label: 'E — Express (owned experience)', kind: 'area', value: '' },
          { key: 'specify', label: 'S — Specify (two-week-testable change)', kind: 'area', value: '' },
          { key: 'consequences', label: 'C — Consequences (better when it works / next step if not)', kind: 'area', value: '' }
        ];
        if (prefill.conflictIds && prefill.conflictIds.length)
          f.push({ key: 'closeIds', label: 'Mark these conflicts resolved (the conversation happened)', kind: 'multicheck',
            options: prefill.conflicts.map(function (c) { return { v: c.id, l: String(c.ts).slice(0, 10) + ' · ' + (c.summary || 'no summary') }; }), value: prefill.conflictIds });
        return f;
      },
      submit: function (v) {
        var evs = [{ type: 'feedback.logged', personId: v.personId,
          data: { polarity: 'corrective', structure: 'desc',
            counterpartPersonId: v.counterpartPersonId || undefined,
            counterpart: v.counterpartText || undefined, withMe: !!v.withMe,
            describe: v.describe, express: v.express, specify: v.specify, consequences: v.consequences,
            summary: 'DESC ' + (v.counterpartPersonId ? 'vs ' + v.counterpartPersonId : v.counterpartText ? 'vs ' + v.counterpartText : v.withMe ? 'with me' : ''),
            viaPlaybook: true } }];
        (v.closeIds || []).forEach(function (cid) {
          evs.push({ type: 'conflict.resolved', personId: v.personId,
            data: { conflictId: cid, how: 'desc', note: (v.specify || '').slice(0, 120) } });
        });
        return evs;
      }
    },

    delegation: {
      id: 'delegation', title: 'Delegation ladder', icon: 'ladder',
      blurb: 'Five levels of authority. Most delegation failures are level mismatches, not people failures.',
      guide: function (ctx, prefill) {
        var g = [{ h: 'The ladder', lines: LEVELS.slice() }];
        var lvl = parseInt(prefill.level, 10);
        if (lvl >= 1 && lvl <= 5) {
          var L = LEVEL_GUIDE[lvl - 1];
          g.push({ h: 'Level ' + lvl + ' means', lines: ['Authority: ' + L.auth, 'Check cadence: ' + L.cadence], script: L.say });
        }
        var open = prefill.personId ? EV().openDelegations(ctx.state).filter(function (d) { return d.personId === prefill.personId; }) : [];
        if (open.length) g.push({ h: 'Already on their plate (' + open.length + ' open)', lines: open.map(function (d) { return '"' + d.label + '" · level ' + (d.level || '?') + ' · since ' + String(d.ts).slice(0, 10); }),
          warn: open.length > 4 ? 'They are past the doctrine max of 4 open delegations. Adding another without closing one is how work dies quietly.' : null });
        g.push({ h: 'Rules of the ladder', lines: [
          'Name the level out loud. Unspoken level = they think 2, you think 4, both blame the other.',
          'Move UP one level at a time, on evidence — skipping feels like trust and behaves like abandonment.',
          'Level is per TASK, not per person: the same human is a 5 on ops and a 2 on pricing.',
          'If you\'ll override their call anyway, that\'s level 1 with extra steps — say it or don\'t delegate.' ] });
        return g;
      },
      fields: function (ctx, prefill) {
        return [
          { key: 'personId', label: 'Person', kind: 'person', required: 1, value: prefill.personId },
          { key: 'title', label: 'What is being delegated', kind: 'text', required: 1, value: '' },
          { key: 'level', label: 'Level', kind: 'select', required: 1, value: String(prefill.level || '2'),
            options: LEVELS.map(function (l, i) { return { v: String(i + 1), l: l }; }) },
          { key: 'successLooks', label: 'Done looks like', kind: 'text', value: '' },
          { key: 'checkCadence', label: 'Check cadence agreed', kind: 'text', value: '' }
        ];
      },
      submit: function (v) {
        return [{ type: 'delegation.assigned', personId: v.personId,
          data: { title: v.title, level: Number(v.level), successLooks: v.successLooks || undefined,
            checkCadence: v.checkCadence || undefined, viaPlaybook: true } }];
      }
    },

    sl: {
      id: 'sl', title: 'Situational match', icon: 'compass',
      blurb: 'D1–D4 → S1–S4: diagnose competence and commitment on THIS task, then lead that person, not the average person.',
      guide: function (ctx, prefill) {
        var g = [{ h: 'The diagnosis grid', lines: ['D1 enthusiast: low competence, high commitment → S1 Directing',
          'D2 learner: some competence, dipping commitment → S2 Coaching',
          'D3 cautious: high competence, variable commitment → S3 Supporting',
          'D4 self-reliant: high both → S4 Delegating'] }];
        Object.keys(SL_TABLE).forEach(function (d) {
          var T = SL_TABLE[d];
          g.push({ h: d + ' → ' + T.style + ' ' + T.name, lines: [T.line].concat(T.do.map(function (x) { return 'do: ' + x; })).concat(T.avoid.map(function (x) { return 'avoid: ' + x; })), script: T.say });
        });
        g.push({ h: 'Honesty notes', lines: [
          'Diagnosis is per task and it decays — re-assess after scope changes, not just quarterly.',
          'Commitment dip on a capable person is INFORMATION (boredom, conflict, home load) — ask before you prescribe.',
          'Your default style is the one to suspect. Most leaders over-direct D4s and under-support D3s.',
          'The mapping comp=1&comm=1 → D2 and similar mixed cases are a stated assumption (structure first), not science.' ] });
        return g;
      },
      fields: function (ctx, prefill) {
        return [
          { key: 'personId', label: 'Person', kind: 'person', required: 1, value: prefill.personId },
          { key: 'task', label: 'The specific task/domain', kind: 'text', required: 1, value: '' },
          { key: 'competence', label: 'Competence on this task (1–4)', kind: 'num', required: 1, value: '' },
          { key: 'commitment', label: 'Commitment right now (1–4)', kind: 'num', required: 1, value: '' },
          { key: 'note', label: 'Why you read it this way (one line)', kind: 'text', value: '' }
        ];
      },
      submit: function (v) {
        var comp = Math.max(1, Math.min(4, parseInt(v.competence, 10) || 1));
        var comm = Math.max(1, Math.min(4, parseInt(v.commitment, 10) || 1));
        var d = slMatch(comp, comm), T = SL_TABLE[d];
        return [{ type: 'sl.assessed', personId: v.personId,
          data: { task: v.task, competence: comp, commitment: comm, development: d,
            style: T.style, styleName: T.name, note: v.note || undefined, viaPlaybook: true } }];
      }
    },

    decision: {
      id: 'decision', title: 'Decision review', icon: 'scale',
      blurb: 'Decisions are only data if you close the loop. Outcome logged, quality scored, lesson extracted.',
      guide: function (ctx, prefill) {
        var open = EV().openDecisions(ctx.state);
        var g = [{ h: 'Open loops (' + open.length + ')', lines: open.length ? open.map(function (d) {
          return '"' + d.label + '" · logged ' + String(d.ts).slice(0, 10) + ' · review ' + (d.reviewDate || 'unset'); }) : ['none — nothing past its gate or waiting'] }];
        g.push({ h: 'The review questions', lines: [
          'Given what we knew THEN, was the process sound? (Outcome and decision quality are different axes — judge both.)',
          'What signal did we discount that turned out to matter?',
          'Was it reversible? Did we treat it with reversibility-appropriate speed?',
          'What would make us decide this FASTER next time without being sloppier?' ] });
        g.push({ h: 'Anti-patterns', lines: [
          'Resulting: calling a good bet bad because variance lost. That teaches the team to hide bets.',
          'Retroactive certainty: "we knew all along" — write what you actually believed at log time, or the calibration data is fiction.',
          'Orphan decisions: >4 severity calls with no review date ever set. The log is only as honest as its review gates.' ] });
        return g;
      },
      fields: function (ctx, prefill) {
        var open = EV().openDecisions(ctx.state);
        return [
          { key: 'decisionId', label: 'Decision', kind: 'select', required: 1, value: prefill.decisionId,
            options: open.map(function (d) { return { v: d.id, l: d.label + ' · review ' + (d.reviewDate || 'unset') }; }) },
          { key: 'outcome', label: 'What actually happened', kind: 'area', required: 1, value: '' },
          { key: 'quality', label: 'Decision quality, given what we knew then (1–5)', kind: 'num', value: '' },
          { key: 'learn', label: 'Change next time', kind: 'text', value: '' }
        ];
      },
      submit: function (v) {
        return [{ type: 'decision.outcome', personId: null,
          data: { decisionId: v.decisionId, outcome: v.outcome, quality: Number(v.quality) || undefined,
            learn: v.learn || undefined, viaPlaybook: true } }];
      }
    },

    goal: {
      id: 'goal', title: 'Goal review', icon: 'target',
      blurb: 'Set goals with one owner, or close the silence on stale ones. Both moves are logged as progress.',
      guide: function (ctx, prefill) {
        var open = EV().openGoals(ctx.state);
        var g = [{ h: 'Open goals (' + open.length + ')', lines: open.length ? open.map(function (gl) {
          return '"' + gl.label + '" · owner ' + (gl.ownerPersonId === 'me' ? 'you' : gl.ownerPersonId ? nameOf(ctx.state, gl.ownerPersonId) : '—NONE—') + ' · last signal ' + String(gl.lastProgressTs).slice(0, 10); }) : ['none set yet'] }];
        g.push({ h: 'Rules that keep goals alive', lines: [
          'One name owns each goal. Others contribute; one person answers.',
          'A goal older than 14 days with no signal is either stalled or dead — choose in the open, not in silence.',
          'Progress notes are one line. If writing the update is heavy, the goal\'s cadence is wrong.',
          'Killing a goal with a reason logged is GOOD goal hygiene, and the engine treats it as handled.' ] });
        return g;
      },
      fields: function (ctx, prefill) {
        var open = EV().openGoals(ctx.state);
        if (open.length && prefill.goalId) return [
          { key: 'mode', label: '', kind: 'hidden', value: 'progress' },
          { key: 'goalId', label: 'Goal', kind: 'select', required: 1, value: prefill.goalId,
            options: open.map(function (gl) { return { v: gl.id, l: gl.label }; }) },
          { key: 'note', label: 'Progress (one line — or "killed: <reason>")', kind: 'area', required: 1, value: '' },
          { key: 'assignTo', label: 'Assign owner (if missing)', kind: 'select', value: '', options: [{ v: '', l: '— leave as is —' }].concat(optsPerson(ctx.state, true)) }
        ];
        return [
          { key: 'mode', label: '', kind: 'hidden', value: 'set' },
          { key: 'title', label: 'The goal', kind: 'text', required: 1, value: '' },
          { key: 'ownerPersonId', label: 'Owner (exactly one)', kind: 'select', required: 1, value: prefill.ownerPersonId || 'me', options: optsPerson(ctx.state, true) },
          { key: 'metric', label: 'Measured by', kind: 'text', value: '' },
          { key: 'due', label: 'Target date', kind: 'date', value: '' }
        ];
      },
      submit: function (v) {
        if (v.mode === 'progress') {
          var evs = [{ type: 'goal.progress', personId: v.assignTo || null,
            data: { goalId: v.goalId, note: v.note, viaPlaybook: true } }];
          if (v.assignTo) evs.push({ type: 'goal.assign', personId: v.assignTo, data: { goalId: v.goalId, ownerPersonId: v.assignTo } });
          return evs;
        }
        return [{ type: 'goal.set', personId: v.ownerPersonId === 'me' ? null : v.ownerPersonId,
          data: { title: v.title, ownerPersonId: v.ownerPersonId, metric: v.metric || undefined,
            due: v.due || undefined, viaPlaybook: true } }];
      }
    },

    charter: {
      id: 'charter', title: 'Expectations charter', icon: 'flag',
      blurb: 'Capture what your boss actually measures — before you optimize toward a guess. (R9 resolver)',
      guide: function (ctx, prefill) {
        var g = [];
        var count = EV().byType(ctx.state, 'expectation.logged').length;
        if (count) g.push({ h: 'Already captured (' + count + ')', lines: EV().byType(ctx.state, 'expectation.logged').map(function (e) { return '· ' + (e.data && e.data.text || ''); }) });
        g.push({ h: 'The 45 minutes that de-risk your first year', lines: [
          '"If I do an outstanding job, what is different in 6 months — in your words?"',
          '"What would make you intervene in my teams without asking me first?"',
          '"Which two or three metrics do you actually read, and what do you wish they said by year-end?"',
          '"What did my predecessor do that you never want to see again?"',
          '"How do you want to hear bad news — how early, in what shape?"' ] });
        g.push({ h: 'Why this is urgent', warn: 'Every week without captured expectations, you optimize toward your GUESS of their model. Two months in, the guess has hardened into commitments, and correcting course then costs real trust. Day 14 is not an arbitrary nag.' });
        g.push({ h: 'Rules', lines: [
          'Capture their words, not your translation — quote-level fidelity is the point.',
          'Explicit beats safe: "ship X by Q3" is capturable; "do great work" is a request to ask again.',
          'One line per expectation below. Each becomes an expectation.logged event and closes R9.' ] });
        return g;
      },
      fields: function () {
        return [
          { key: 'lines', label: 'Expectations, one per line, their words', kind: 'area', required: 1, value: '' },
          { key: 'source', label: 'Captured with', kind: 'text', value: 'boss 1:1' }
        ];
      },
      submit: function (v) {
        return String(v.lines || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).map(function (line) {
          return { type: 'expectation.logged', personId: null, data: { text: line, source: v.source || undefined, viaPlaybook: true } };
        });
      }
    },

    tour: {
      id: 'tour', title: 'Listening-tour visit', icon: 'ear',
      blurb: 'Same five questions for everyone, answers logged verbatim-ish. Coverage is measured against today\'s roster. (R10 resolver)',
      guide: function (ctx, prefill) {
        var a = EV().arrival(ctx.state, ctx.today), g = [];
        if (a.set) g.push({ h: 'Coverage', lines: ['visited ' + a.tourDone + ' of ' + a.tourTotal,
            a.unvisited.length ? 'still owed: ' + a.unvisited.map(function (p) { return p.name; }).join(', ') : 'tour complete'],
          warn: a.unvisited.length && a.dayN >= 45 ? 'Past the day-45 gate with visits owed. Every change you announce now lands on people you haven\'t heard.' : null });
        g.push({ h: 'The five questions (ask all five, everyone, same order)', lines: [
          '1. What should I definitely NOT change here?',
          '2. What is slower than it should be, and why do you think that is?',
          '3. What do people complain about that never reaches a staff meeting?',
          '4. If you ran this org for a month, what would you do first?',
          '5. What should I have asked you that I didn\'t?' ] });
        g.push({ h: 'Discipline', lines: [
          'Listen. Defending a decision in a tour visit converts the visit into a negotiation.',
          'Log what they said, not what you think of it — analysis comes after full coverage.',
          'Order matters politically: the last team visited notices being last.' ] });
        return g;
      },
      fields: function (ctx, prefill) {
        var a = EV().arrival(ctx.state, ctx.today);
        var def = prefill.personId || (a.set && a.unvisited.length ? a.unvisited[0].id : undefined);
        return [
          { key: 'personId', label: 'Visited', kind: 'person', required: 1, value: def },
          { key: 'heard', label: 'What they said (their words, condensed)', kind: 'area', required: 1, value: '' },
          { key: 'cherish', label: 'What they begged you not to change', kind: 'text', value: '' },
          { key: 'surprised', label: 'What surprised you', kind: 'text', value: '' }
        ];
      },
      submit: function (v) {
        return [{ type: 'tour.visit', personId: v.personId,
          data: { heard: v.heard, cherish: v.cherish || undefined, surprised: v.surprised || undefined, viaPlaybook: true } }];
      }
    },

    wincloser: {
      id: 'wincloser', title: 'Early-win closer', icon: 'check2',
      blurb: 'Committed a win to your boss? Verify it with evidence or walk it back. Unverified wins are loans — they come due. (R11 resolver)',
      guide: function (ctx, prefill) {
        var open = EV().openWins(ctx.state).filter(function (w) { return !w.verified; });
        var g = [{ h: 'Open win commitments (' + open.length + ')', lines: open.length ? open.map(function (w) {
          return '"' + w.label + '" · committed ' + String(w.ts).slice(0, 10) + ' · verify by ' + (w.verifyDate || 'unset'); }) : ['none — either verified or never over-committed. Good.'] }];
        g.push({ h: 'Verification standard', lines: [
          'Evidence = something a skeptic would accept: a number before/after, a shipped thing, a named person who changed behavior.',
          '"The team feels better" is not evidence. "Standup went from 7 attendees silent to 5 speaking, per the last three retro notes" is.',
          'Partial: verify the part that landed, restate the remainder with a NEW date. Do not let the whole claim ride.' ] });
        g.push({ h: 'Walking back (when it didn\'t land)', script: '"I told you we\'d see X by now. We haven\'t — here\'s what I got wrong about the system, and here\'s the revised gate. I\'d rather correct the claim than defend it." — said early, this BUYS credibility; said late, it spends it.' });
        return g;
      },
      fields: function (ctx, prefill) {
        var open = EV().openWins(ctx.state).filter(function (w) { return !w.verified; });
        if (open.length || prefill.winId) return [
          { key: 'mode', label: '', kind: 'hidden', value: 'verify' },
          { key: 'winId', label: 'Win commitment', kind: 'select', required: 1, value: prefill.winId,
            options: open.map(function (w) { return { v: w.id, l: w.label + ' · verify ' + (w.verifyDate || 'unset') }; }) },
          { key: 'result', label: 'Result', kind: 'select', required: 1, value: 'landed',
            options: [{ v: 'landed', l: 'landed (verified)' }, { v: 'partial', l: 'partial — restate remainder' }, { v: 'missed', l: 'missed — walking it back' }] },
          { key: 'evidence', label: 'Evidence a skeptic would accept', kind: 'area', required: 1, value: '' }
        ];
        return [
          { key: 'mode', label: '', kind: 'hidden', value: 'commit' },
          { key: 'title', label: 'The win you are committing to', kind: 'text', required: 1, value: '' },
          { key: 'verifyDate', label: 'Verify by', kind: 'date', required: 1, value: ctx.today }
        ];
      },
      submit: function (v) {
        if (v.mode === 'verify') return [{ type: 'earlywin.verified', personId: null,
          data: { winId: v.winId, result: v.result, evidence: v.evidence, viaPlaybook: true } }];
        return [{ type: 'earlywin.committed', personId: null,
          data: { title: v.title, verifyDate: v.verifyDate, viaPlaybook: true } }];
      }
    }
  };

  function list() { return Object.keys(PBS).map(function (k) { return PBS[k]; }); }
  function get(id) { return PBS[id] || null; }

  return { list: list, get: get, LEVELS: LEVELS, LEVEL_GUIDE: LEVEL_GUIDE, SL_TABLE: SL_TABLE, slMatch: slMatch };
})();
