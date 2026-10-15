/* LeadOS pt-4 - js/ui.js
   Vanilla rendering. Every screen renders from engine.project(store events) -
   a fresh read, every time. Every user action is an event append. No state
   lives in the DOM or in this module beyond 'which tab am I on'. */
(function () {
  'use strict';
  const LeadOS = (window.LeadOS = window.LeadOS || {});
  let TAB = 'command';
  let LAST_HEALTH = null;

  const DAY = 86400000;
  const $ = function (s) { return document.querySelector(s); };

  // Inline lucide-style icon set (no network, no CDN - paths ship with the app).
  const ICONS = {
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 9.5h18"/>',
    scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    sliders: '<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
    layers: '<path d="m12 2 9 4.9-9 4.9-9-4.9Z"/><path d="m3 11.9 9 4.9 9-4.9"/><path d="m3 16.9 9 4.9 9-4.9"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    hash: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/>'
  };
  function icon(n, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || ICONS.hash) + '</svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtD(ts) {
    if (ts === null || ts === undefined) return '—';
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtT(ts) { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function days(n) { return n + (n === 1 ? ' day' : ' days'); }

  // ---- read context: the only read path in the UI --------------------------
  function read() {
    const raw = LeadOS.store.load();
    const state = LeadOS.engine.project(raw.events);
    return { raw: raw, state: state, set: LeadOS.engine.settings(state), now: Date.now() };
  }

  const TABS = [
    ['command', 'Command', 'gauge'],
    ['signals', 'Signals', 'activity'],
    ['domains', 'Domains', 'grid'],
    ['cadences', 'Cadences', 'calendar'],
    ['decisions', 'Decisions', 'scale'],
    ['risks', 'Risks', 'alert'],
    ['events', 'Event log', 'list'],
    ['health', 'Health', 'shield'],
    ['settings', 'Settings', 'sliders']
  ];

  function pill(status, label) {
    return '<span class="pill pill-' + status + '">' + esc(label || status) + '</span>';
  }
  function domainChip(id) {
    const h = LeadOS.events.domainHue(id);
    return '<span class="dchip" style="--dh:' + h + '">' + esc(LeadOS.events.domainLabel(id)) + '</span>';
  }
  function stat(ic, value, label, sub) {
    return '<div class="stat"><div class="stat-ic">' + icon(ic) + '</div><div class="stat-v">' + esc(value) + '</div><div class="stat-l">' + esc(label) + '</div>' + (sub ? '<div class="stat-s">' + sub + '</div>' : '') + '</div>';
  }

  // ---------------------------------------------------------------- Command
  function viewCommand(ctx) {
    const e = LeadOS.engine, s = ctx.state, now = ctx.now;
    const tot = e.totals(s), cad = e.cadenceStatus(s, now), dq = e.decisionQueue(s, now), rr = e.riskRegister(s, now), tl = e.taskLists(s, now);
    const stale = dq.filter(function (d) { return d.stale; }).length;
    const rolls = e.domainRollups(s);

    let h = '';
    if (s.eventCount <= 1) {
      h += '<section class="card hero"><div class="hero-in"><div class="hero-ic">' + icon('layers') + '</div>' +
        '<h2>Install the starter slate</h2><p>One click appends a complete baseline: playbooks for Executive, Sales and Engineering, baseline reviews across all four rhythms, and a live sales decision - every item written as immutable events.</p>' +
        '<button class="btn primary lg" data-action="seed">' + icon('play') + ' Install starter slate</button></div></section>';
    }

    h += '<section class="stats">' +
      stat('database', tot.events, 'events in log', 'append-only') +
      stat('activity', tot.activeObjectives, 'active objectives', '') +
      stat('scale', tot.openDecisions, 'open decisions', stale ? stale + ' stale' : 'none stale') +
      stat('alert', tot.openRisks, 'open risks', rr.length ? 'max score ' + rr[0].score : '') +
      stat('calendar', tl.overdue.length, 'overdue tasks', tl.open.length + ' open') +
      stat('shield', LeadOS.store.rawBytes() + ' B', 'storage used', 'single key') +
      '</section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('calendar') + ' Operating rhythm</h3><button class="btn ghost" data-tab="cadences">open cadences</button></header><div class="cad-row">';
    LeadOS.engine.CADENCE.forEach(function (c) {
      const st = cad[c.kind];
      h += '<div class="cad-mini cad-' + st.status + '"><div class="cad-mini-t">' + esc(c.label) + '</div>' +
        '<div class="cad-mini-s">' + pill(st.status) + '</div>' +
        '<div class="cad-mini-d">every ' + days(st.intervalDays) + '<br>last: ' + fmtD(st.lastCompletedAt) + '<br>due: ' + (st.status === 'never' ? 'now' : fmtD(st.dueAt)) + '</div></div>';
    });
    h += '</div></section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('grid') + ' Domain pulse</h3><button class="btn ghost" data-tab="domains">all 15 domains</button></header><div class="dstrip">';
    LeadOS.events.DOMAINS.forEach(function (d) {
      const r = rolls[d.id];
      const active = r.activeObjectives + r.openTasks + r.openRisks + r.openDecisions;
      h += '<button class="dchip-lg" style="--dh:' + d.hue + '" data-tab="domains"><span class="dchip-lg-l">' + esc(d.label) + '</span><span class="dchip-lg-n">' + active + '</span></button>';
    });
    h += '</div></section>';

    h += '<div class="two-col">';
    h += '<section class="card"><header class="card-h"><h3>' + icon('check') + ' Open tasks</h3></header>';
    h += tl.open.length ? '<table class="tbl"><tbody>' + tl.open.slice(0, 6).map(function (t) {
      const late = t.dueAt !== null && now > t.dueAt;
      return '<tr class="' + (late ? 'row-late' : '') + '"><td>' + domainChip(t.domain) + '</td><td>' + esc(t.title) + '</td><td class="num">' + (t.dueAt ? fmtD(t.dueAt) : '—') + '</td><td class="num"><button class="btn tiny" data-action="complete-task" data-id="' + esc(t.id) + '">' + icon('check') + '</button></td></tr>';
    }).join('') + '</tbody></table>' : '<p class="empty">No open tasks.</p>';
    h += '</section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('list') + ' Latest events</h3><button class="btn ghost" data-tab="events">full log</button></header>';
    const last = ctx.raw.events.slice(-8).reverse();
    h += '<table class="tbl"><tbody>' + last.map(function (ev) {
      return '<tr><td class="mono dim">' + esc(ev.id) + '</td><td>' + typeChip(ev) + '</td><td class="dim">' + esc(summarize(ev)) + '</td></tr>';
    }).join('') + '</tbody></table></section>';
    h += '</div>';
    return h;
  }

  // ---------------------------------------------------------------- Domains
  function viewDomains(ctx) {
    const rolls = LeadOS.engine.domainRollups(ctx.state);
    const DC = LeadOS.playbooks.DOMAIN_CADENCE, RL = LeadOS.playbooks.RITUAL_LABEL;
    let h = '<section class="dgrid">';
    LeadOS.playbooks.PLAYBOOKS.forEach(function (pb) {
      const r = rolls[pb.domain];
      const kind = DC[pb.domain];
      h += '<article class="dcard" style="--dh:' + LeadOS.events.domainHue(pb.domain) + '">' +
        '<header class="dcard-h"><h3>' + esc(LeadOS.events.domainLabel(pb.domain)) + '</h3>' + pill(kind, RL[kind]) + '</header>' +
        '<p class="dcard-obj">' + esc(pb.objective) + '</p>' +
        '<div class="chips">' + pb.metrics.map(function (m) { return '<span class="chip">' + esc(m) + '</span>'; }).join('') + '</div>' +
        '<dl class="dkpis">' +
        '<div><dt>objectives</dt><dd>' + r.activeObjectives + '</dd></div>' +
        '<div><dt>open tasks</dt><dd>' + r.openTasks + '</dd></div>' +
        '<div><dt>open risks</dt><dd>' + r.openRisks + '</dd></div>' +
        '<div><dt>decisions</dt><dd>' + r.openDecisions + '</dd></div>' +
        '<div><dt>KRs</dt><dd>' + r.krCount + '</dd></div>' +
        '</dl>' +
        '<footer class="dcard-f"><span class="dim">' + (r.lastActivityAt ? 'last activity ' + fmtD(r.lastActivityAt) : 'no activity yet') + (r.playbooks ? ' · applied ×' + r.playbooks : '') + '</span>' +
        '<button class="btn tiny" data-action="apply-playbook" data-domain="' + esc(pb.domain) + '">' + icon('play') + ' apply playbook</button></footer></article>';
    });
    return h + '</section>';
  }

  // --------------------------------------------------------------- Cadences
  function viewCadences(ctx) {
    const e = LeadOS.engine, cad = e.cadenceStatus(ctx.state, ctx.now);
    let h = '<section class="cad-grid">';
    e.CADENCE.forEach(function (c) {
      const st = cad[c.kind];
      const history = Object.keys(ctx.state.reviews).map(function (k) { return ctx.state.reviews[k]; })
        .filter(function (r) { return r.kind === c.kind && r.status === 'completed'; })
        .sort(function (a, b) { return b.completedAt - a.completedAt; });
      h += '<article class="card cad-card cad-' + st.status + '"><header class="card-h"><h3>' + esc(c.label) + '</h3>' + pill(st.status) + '</header>' +
        '<div class="cad-meta"><span>cycle ' + days(st.intervalDays) + '</span><span>last ' + fmtD(st.lastCompletedAt) + '</span><span>due ' + (st.status === 'never' ? 'now' : fmtD(st.dueAt)) + '</span>' + (st.overdueDays ? '<span class="late">' + days(st.overdueDays) + ' late</span>' : '') + '</div>';
      if (st.openScheduled) {
        h += '<form class="inline-form" data-form="complete-review" data-id="' + esc(st.openScheduled.id) + '">' +
          '<span class="if-label">scheduled ' + fmtD(st.openScheduled.dueAt) + '</span>' +
          '<select name="outcome" required><option value="" disabled selected>outcome</option><option>on-track</option><option>at-risk</option><option>off-track</option><option>completed</option></select>' +
          '<input name="notes" placeholder="notes (optional)" maxlength="120">' +
          '<button class="btn tiny primary" type="submit">' + icon('check') + ' complete</button></form>';
      }
      h += '<form class="inline-form" data-form="schedule-review" data-kind="' + esc(c.kind) + '">' +
        '<span class="if-label">schedule next</span><input type="date" name="date" value="' + fmtD(ctx.now + st.intervalDays * DAY) + '" required>' +
        '<button class="btn tiny" type="submit">' + icon('plus') + ' schedule</button></form>';
      h += history.length ? '<table class="tbl slim"><tbody>' + history.slice(0, 4).map(function (r) {
        return '<tr><td class="num">' + fmtD(r.completedAt) + '</td><td>' + esc(r.outcome) + '</td><td class="dim">' + esc(r.notes || '') + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="empty">No completed reviews yet.</p>';
      h += '</article>';
    });
    return h + '</section>';
  }

  // --------------------------------------------------------------- Decisions
  function viewDecisions(ctx) {
    const e = LeadOS.engine, q = e.decisionQueue(ctx.state, ctx.now), log = e.decidedLog(ctx.state);
    let h = '<section class="card"><header class="card-h"><h3>' + icon('plus') + ' Propose a decision</h3></header>' +
      '<form class="frm" data-form="propose-decision"><div class="frow">' +
      '<select name="domain" required>' + domainOptions() + '</select>' +
      '<input name="owner" placeholder="owner (decider)" required maxlength="60">' +
      '<select name="reversibility"><option value="reversible">reversible</option><option value="irreversible">irreversible</option></select></div>' +
      '<input name="question" placeholder="the question to decide" required maxlength="160">' +
      '<input name="options" placeholder="options, comma separated (min 2)" required maxlength="200">' +
      '<button class="btn primary" type="submit">' + icon('plus') + ' propose</button></form></section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('scale') + ' Decision queue</h3><span class="dim">max open ' + days(ctx.set.decisionMaxOpenDays) + ' · sales cycle ' + days(ctx.set.salesCycleDays) + '</span></header>';
    h += q.length ? '<table class="tbl"><thead><tr><th>domain</th><th>question</th><th>owner</th><th class="num">age</th><th>flags</th><th>decide</th></tr></thead><tbody>' + q.map(function (d) {
      const flags = (d.stale ? pill('overdue', 'stale') : '') + (d.beyondSalesCycle ? ' ' + pill('overdue', 'beyond sales cycle') : '');
      return '<tr><td>' + domainChip(d.domain) + '</td><td>' + esc(d.question) + '<div class="dim tiny-t">' + d.options.map(esc).join(' · ') + '</div></td><td>' + esc(d.owner) + '</td><td class="num">' + days(d.ageDays) + '</td><td>' + (flags || '<span class="dim">—</span>') + '</td>' +
        '<td><form class="decide-f" data-form="decide" data-id="' + esc(d.id) + '"><select name="choice" required><option value="" disabled selected>choose</option>' + d.options.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select><input name="rationale" placeholder="rationale" required maxlength="140"><button class="btn tiny primary">' + icon('check') + '</button></form></td></tr>';
    }).join('') + '</tbody></table>' : '<p class="empty">Queue is clear.</p>';
    h += '</section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('check') + ' Decided</h3></header>';
    h += log.length ? '<table class="tbl"><tbody>' + log.slice(0, 8).map(function (d) {
      return '<tr><td>' + domainChip(d.domain) + '</td><td>' + esc(d.question) + '</td><td>' + esc(d.choice) + '</td><td class="dim">' + esc(d.rationale) + '</td><td class="num">' + fmtD(d.decidedAt) + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="empty">Nothing decided yet.</p>';
    return h + '</section>';
  }

  // ------------------------------------------------------------------ Risks
  function viewRisks(ctx) {
    const rr = LeadOS.engine.riskRegister(ctx.state, ctx.now);
    let h = '<section class="card"><header class="card-h"><h3>' + icon('plus') + ' Raise a risk</h3></header>' +
      '<form class="frm" data-form="raise-risk"><div class="frow">' +
      '<select name="domain" required>' + domainOptions() + '</select>' +
      '<label class="fld">likelihood <input type="number" name="likelihood" min="1" max="5" value="3" required></label>' +
      '<label class="fld">impact <input type="number" name="impact" min="1" max="5" value="3" required></label></div>' +
      '<input name="title" placeholder="risk statement" required maxlength="160">' +
      '<input name="mitigation" placeholder="mitigation (optional)" maxlength="160">' +
      '<button class="btn primary" type="submit">' + icon('plus') + ' raise</button></form></section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('alert') + ' Risk register</h3><span class="dim">review cycle ' + days(ctx.set.riskReviewCadenceDays) + '</span></header>';
    h += rr.length ? '<table class="tbl"><thead><tr><th>domain</th><th>risk</th><th class="num">L×I</th><th class="num">age</th><th>flags</th><th>status</th></tr></thead><tbody>' + rr.map(function (r) {
      return '<tr><td>' + domainChip(r.domain) + '</td><td>' + esc(r.title) + (r.mitigation ? '<div class="dim tiny-t">mitigation: ' + esc(r.mitigation) + '</div>' : '') + '</td>' +
        '<td class="num"><span class="score" style="--s:' + r.score + '">' + r.score + '</span></td><td class="num">' + days(r.ageDays) + '</td><td>' + (r.stale ? pill('due', 'needs review') : '<span class="dim">—</span>') + '</td>' +
        '<td><select class="mini" data-risk-status="' + esc(r.id) + '">' + ['open', 'mitigating', 'mitigated', 'accepted', 'closed'].map(function (st) { return '<option' + (st === r.status ? ' selected' : '') + '>' + st + '</option>'; }).join('') + '</select></td></tr>';
    }).join('') + '</tbody></table>' : '<p class="empty">No open risks.</p>';
    return h + '</section>';
  }

  // ----------------------------------------------------------------- Events
  function typeChip(ev) {
    const rep = ev.meta && ev.meta.repair;
    return '<span class="tchip' + (rep ? ' tchip-rep' : '') + '">' + esc(ev.type) + '</span>' + (rep ? ' <span class="pill pill-repair">repair · ' + esc(ev.meta.migration) + '</span>' : '');
  }
  function summarize(ev) {
    const p = ev.payload || {};
    if (ev.type === 'settings.changed') return p.key + ' = ' + p.value;
    if (ev.type === 'store.initialized') return 'schema v' + p.schemaVersion + ' · ' + (p.lineageTag || '');
    return p.title || p.name || p.objective || p.hypothesis || p.question || p.metric || p.counterparty ||
           p.accountName || p.candidateName || p.role || p.framework || p.key || p.outcome || p.result ||
           (p.description ? String(p.description).slice(0, 60) : '') || p.id || '';
  }
  function viewEvents(ctx) {
    const raw = ctx.raw;
    let h = '<section class="card"><header class="card-h"><h3>' + icon('database') + ' Storage inspector</h3><span class="pill pill-ok">' + esc(LeadOS.store.KEY) + '</span></header>' +
      '<div class="insp"><div><span class="dim">root keys</span><code>' + Object.keys(raw).map(esc).join(', ') + '</code></div>' +
      '<div><span class="dim">meta</span><code>' + esc(JSON.stringify(raw.meta)) + '</code></div>' +
      '<div><span class="dim">payload</span><code>' + raw.events.length + ' events · ' + LeadOS.store.rawBytes() + ' bytes · schemaVersion ' + raw.schemaVersion + '</code></div>' +
      '<div><span class="dim">registry</span><code>' + Object.keys(LeadOS.events.REGISTRY).length + ' event types under contract</code></div></div></section>';
    h += '<section class="card"><header class="card-h"><h3>' + icon('list') + ' Event log</h3><span class="dim">append-only · ' + raw.events.length + ' events</span></header>' +
      '<table class="tbl"><thead><tr><th class="num">seq</th><th>id</th><th>at</th><th>type</th><th>summary</th></tr></thead><tbody>' +
      raw.events.slice().reverse().map(function (ev) {
        return '<tr><td class="num mono">' + ev.seq + '</td><td class="mono dim">' + esc(ev.id) + '</td><td class="num dim">' + fmtD(ev.at) + ' ' + fmtT(ev.at) + '</td><td>' + typeChip(ev) + '</td><td class="dim">' + esc(summarize(ev)) + '</td></tr>';
      }).join('') + '</tbody></table></section>';
    return h;
  }

  // ----------------------------------------------------------------- Health
  function viewHealth(ctx) {
    const R = LAST_HEALTH;
    const pass = R.t.concat(R.g).filter(function (r) { return r.pass; }).length;
    let h = '<section class="card"><header class="card-h"><h3>' + icon('shield') + ' Authority wall</h3><div><span class="pill ' + (R.ok ? 'pill-ok' : 'pill-overdue') + '">' + pass + '/' + (R.t.length + R.g.length) + ' checks pass</span> <button class="btn tiny" data-action="run-health">' + icon('refresh') + ' re-run</button></div></header>' +
      '<p class="dim pad">T-suite proves behavior on pinned fixtures. G-suite inspects the live store at <code>leados:data</code>. The boot sequence runs G before rendering anything; a failed G check halts the app behind the wall.</p>';
    h += '<div class="two-col">';
    h += suiteTable('T-suite · fixtures', R.t);
    h += suiteTable('G-suite · live store', R.g);
    h += '</div></section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('activity') + ' Claim coverage — pt-4 part 1</h3></header>' +
      '<table class="tbl"><thead><tr><th></th><th>claim</th><th>covered by</th><th>status</th></tr></thead><tbody>' +
      R.claims.map(function (c) {
        return '<tr><td class="mono dim">' + c.id + '</td><td>' + esc(c.text) + '</td><td>' + c.by.map(function (id) { return '<span class="pill ' + (findCheck(R, id).pass ? 'pill-ok' : 'pill-overdue') + '">' + id + '</span>'; }).join(' ') + '</td><td>' + pill(c.pass ? 'ok' : 'overdue', c.pass ? 'proven' : 'unproven') + '</td></tr>';
      }).join('') + '</tbody></table></section>';
    return h;
  }
  function findCheck(R, id) { return R.t.concat(R.g).find(function (r) { return r.id === id; }) || { pass: false }; }
  function suiteTable(title, rows) {
    return '<div class="suite"><h4>' + esc(title) + '</h4><table class="tbl slim"><tbody>' +
      rows.map(function (r) {
        return '<tr><td class="mono">' + r.id + '</td><td>' + esc(r.name) + '<div class="dim tiny-t">' + esc(r.detail) + '</div></td><td>' + pill(r.pass ? 'ok' : 'overdue', r.pass ? 'pass' : 'fail') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // --------------------------------------------------------------- Settings
  function viewSettings(ctx) {
    const raw = ctx.raw, set = ctx.set;
    let h = '<section class="card"><header class="card-h"><h3>' + icon('sliders') + ' Settings</h3><span class="dim">derived per read · writes are events</span></header>' +
      '<p class="dim pad">Settings are never stored directly. Editing appends a <code>settings.changed</code> event; the current value is re-derived from the log on every read. v4 keys were backfilled by migration 3&gt;4 as repair events where no leader value existed.</p>' +
      '<table class="tbl"><thead><tr><th>key</th><th class="num">default</th><th class="num">current</th><th>source</th><th>set new value (days)</th></tr></thead><tbody>';
    Object.keys(LeadOS.store.ALL_SETTING_DEFAULTS).forEach(function (k) {
      let source = '<span class="dim">default · never set</span>';
      for (let i = raw.events.length - 1; i >= 0; i--) {
        const ev = raw.events[i];
        if (ev.type === 'settings.changed' && ev.payload.key === k) {
          source = ev.meta && ev.meta.repair
            ? '<span class="pill pill-repair">repair · ' + esc(ev.meta.migration) + '</span> <span class="mono dim">' + esc(ev.id) + '</span>'
            : '<span class="mono dim">' + esc(ev.id) + '</span>';
          break;
        }
      }
      const isV4 = LeadOS.store.V4_NEW_KEYS.indexOf(k) !== -1;
      h += '<tr class="' + (isV4 ? 'row-v4' : '') + '"><td class="mono">' + esc(k) + (isV4 ? ' <span class="pill pill-v4">v4</span>' : '') + '</td>' +
        '<td class="num dim">' + LeadOS.store.ALL_SETTING_DEFAULTS[k] + '</td><td class="num"><strong>' + set[k] + '</strong></td><td>' + source + '</td>' +
        '<td><form class="inline-form" data-form="set-setting" data-key="' + esc(k) + '"><input type="number" name="value" min="1" max="3650" value="' + set[k] + '" required><button class="btn tiny" type="submit">append</button></form></td></tr>';
    });
    return h + '</tbody></table></section>';
  }

  // ---------------------------------------------------------------- Signals
  function sevBadge(s) { return '<span class="sev sev-' + s + '">sev ' + s + '</span>'; }
  function confBadge(c) { return '<span class="conf conf-' + c + '">' + c + '</span>'; }
  function viewSignals(ctx) {
    const F = LeadOS.rules.run(ctx.state, ctx.now).slice().sort(function (a, b) { return (b.sev - a.sev) || (a.rule < b.rule ? -1 : 1); });
    const bySev = [0, 0, 0, 0, 0, 0];
    F.forEach(function (f) { bySev[f.sev]++; });
    let h = '<section class="stats">' +
      stat('activity', F.length, 'open signals', 'from ' + LeadOS.rules.RULES.length + ' pure rules') +
      stat('alert', bySev[5], 'sev 5', 'immediate') +
      stat('alert', bySev[4], 'sev 4', 'act this week') +
      stat('calendar', bySev[3], 'sev 3', 'on the radar') +
      stat('shield', bySev[1] + bySev[2], 'sev 1–2', 'hygiene') +
      '</section>';
    h += '<section class="card"><header class="card-h"><h3>' + icon('activity') + ' Findings — rules engine R1–R40</h3><span class="dim">(P, today) → findings[] · derived per read · nothing persisted</span></header>';
    h += F.length ? '<table class="tbl"><thead><tr><th>rule</th><th>sev</th><th>conf</th><th>finding</th><th>playbook</th></tr></thead><tbody>' + F.map(function (f) {
      return '<tr><td class="mono dim">' + f.rule + '</td><td>' + sevBadge(f.sev) + '</td><td>' + confBadge(f.conf) + '</td>' +
        '<td><strong>' + esc(f.title) + '</strong>' +
        (f.basis.length ? '<div class="basis">' + f.basis.map(function (b) { return esc(b); }).join('<br>') + '</div>' : '') +
        (f.refs.length ? '<div class="dim tiny-t mono">' + f.refs.map(function (r) { return esc(r); }).join(' · ') + '</div>' : '') + '</td>' +
        '<td>' + (f.play ? '<span class="chip">' + esc(f.play) + '</span>' : '<span class="dim tiny-t">no playbook: ' + esc(f.playNone || 'unspecified') + '</span>') + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="empty">No findings. The operating picture is clean — or the log is still thin.</p>';
    return h + '</section>';
  }

  // ---------------------------------------------------------------- helpers
  function domainOptions() {
    return LeadOS.events.DOMAINS.map(function (d) { return '<option value="' + d.id + '">' + esc(d.label) + '</option>'; }).join('');
  }

  const VIEWS = { command: viewCommand, signals: viewSignals, domains: viewDomains, cadences: viewCadences, decisions: viewDecisions, risks: viewRisks, events: viewEvents, health: viewHealth, settings: viewSettings };

  function render() {
    LAST_HEALTH = LeadOS.health.runAll();
    const ctx = read();
    $('#nav').innerHTML = TABS.map(function (t) {
      return '<button class="nav-b' + (TAB === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + icon(t[2]) + '<span>' + esc(t[1]) + '</span></button>';
    }).join('');
    $('#sysline').innerHTML =
      '<span class="sys-pill">lineage pt</span><span class="sys-pill acc">' + esc(LeadOS.store.LINEAGE_TAG) + '</span>' +
      '<span class="sys-pill">schema v' + LeadOS.store.SCHEMA_VERSION + '</span>' +
      '<span class="sys-pill">' + ctx.raw.events.length + ' events</span>' +
      '<span class="sys-pill ' + (LAST_HEALTH.ok ? 'ok' : 'bad') + '">' + icon('shield') + (LAST_HEALTH.ok ? ' health ok' : ' health: failures') + '</span>';
    $('#view').innerHTML = VIEWS[TAB](ctx);
  }

  // ---------------------------------------------------------------- actions
  const ACTIONS = {
    'complete-task': function (el) { LeadOS.store.append('task.completed', { id: el.dataset.id }); render(); },
    'apply-playbook': function (el) {
      const ctx = read();
      LeadOS.playbooks.apply(el.dataset.domain, { now: ctx.now, settings: ctx.set })
        .forEach(function (spec) { LeadOS.store.append(spec.type, spec.payload); });
      render();
    },
    'run-health': function () { TAB = 'health'; render(); },
    'seed': function () {
      const ctx = read(), now = ctx.now, uid = LeadOS.playbooks.uid;
      ['executive', 'sales', 'engineering'].forEach(function (d) {
        LeadOS.playbooks.apply(d, { now: now, settings: ctx.set }).forEach(function (spec) { LeadOS.store.append(spec.type, spec.payload); });
      });
      LeadOS.engine.CADENCE.forEach(function (c) {
        const id = uid('rev');
        LeadOS.store.append('review.scheduled', { id: id, kind: c.kind, dueAt: now });
        LeadOS.store.append('review.completed', { id: id, outcome: 'on-track', notes: 'Baseline review complete — seeded by starter slate' });
      });
      LeadOS.store.append('decision.proposed', { id: uid('dec'), domain: 'sales', question: 'Discount approval path for enterprise deals?', options: ['VP approval above 20%', 'Deal desk review', 'Flat 15% ceiling'], owner: 'CRO', reversibility: 'reversible' });
      const fresh = read();
      LeadOS.engine.krView(fresh.state).slice(0, 3).forEach(function (kr) {
        LeadOS.store.append('kr.progressLogged', { id: kr.id, value: Math.round(kr.target * 0.4 * 100) / 100, note: 'First checkpoint' });
      });
      render();
    },
    'rerun-gate': function () { boot(); }
  };

  const FORMS = {
    'propose-decision': function (f) {
      const opts = f.options.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      LeadOS.store.append('decision.proposed', {
        id: LeadOS.playbooks.uid('dec'), domain: f.domain.value, question: f.question.value.trim(),
        options: opts, owner: f.owner.value.trim(), reversibility: f.reversibility.value
      });
      f.reset(); render();
    },
    'decide': function (f) { LeadOS.store.append('decision.decided', { id: f.dataset.id, choice: f.choice.value, rationale: f.rationale.value.trim() }); render(); },
    'raise-risk': function (f) {
      LeadOS.store.append('risk.raised', {
        id: LeadOS.playbooks.uid('risk'), domain: f.domain.value, title: f.title.value.trim(),
        likelihood: Number(f.likelihood.value), impact: Number(f.impact.value), mitigation: f.mitigation.value.trim() || undefined
      });
      f.reset(); render();
    },
    'schedule-review': function (f) {
      const due = new Date(f.date.value + 'T12:00:00').getTime();
      LeadOS.store.append('review.scheduled', { id: LeadOS.playbooks.uid('rev'), kind: f.dataset.kind, dueAt: due });
      f.reset(); render();
    },
    'complete-review': function (f) {
      LeadOS.store.append('review.completed', { id: f.dataset.id, outcome: f.outcome.value, notes: f.notes.value.trim() || undefined });
      render();
    },
    'set-setting': function (f) {
      LeadOS.store.append('settings.changed', { key: f.dataset.key, value: Number(f.value.value) });
      render();
    }
  };

  function onClick(ev) {
    const tabEl = ev.target.closest('[data-tab]');
    if (tabEl) { TAB = tabEl.dataset.tab; render(); return; }
    const actEl = ev.target.closest('[data-action]');
    if (actEl && ACTIONS[actEl.dataset.action]) { ev.preventDefault(); ACTIONS[actEl.dataset.action](actEl); }
  }
  function onSubmit(ev) {
    const f = ev.target.closest('[data-form]');
    if (f && FORMS[f.dataset.form]) { ev.preventDefault(); try { FORMS[f.dataset.form](f); } catch (err) { showWallError(err.message); } }
  }
  function onChange(ev) {
    const sel = ev.target.closest('[data-risk-status]');
    if (sel) { LeadOS.store.append('risk.statusChanged', { id: sel.dataset.riskStatus, status: sel.value }); render(); }
  }

  // ---------------------------------------------------------------- the wall
  function showWall(items) {
    const w = $('#wall');
    w.innerHTML = '<div class="wall-card"><div class="wall-ic">' + icon('shield') + '</div>' +
      '<h2>Authority wall — boot inspection failed</h2>' +
      '<p>The G-suite found the store below in violation. The application refuses to render until every check passes. Nothing was written; the event log is untouched.</p>' +
      '<table class="tbl slim"><tbody>' + items.map(function (r) {
        return '<tr><td class="mono">' + r.id + '</td><td>' + esc(r.name) + '<div class="dim tiny-t">' + esc(r.detail) + '</div></td><td>' + pill(r.pass ? 'ok' : 'overdue', r.pass ? 'pass' : 'fail') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<button class="btn primary" data-action="rerun-gate">' + icon('refresh') + ' re-run inspection</button></div>';
    w.removeAttribute('hidden');
  }
  function showWallError(msg) {
    showWall([{ id: 'GX', name: 'runtime rejection', pass: false, detail: msg }]);
  }

  function boot() {
    let gate;
    try { gate = LeadOS.health.boot(); }
    catch (err) { showWall([{ id: 'G0', name: 'store readable', pass: false, detail: err.message }]); return; }
    if (!gate.ok) { showWall(gate.g); return; }
    $('#wall').setAttribute('hidden', '');
    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('change', onChange);
    boot();
  });

  LeadOS.ui = { boot: boot, render: render };
})();
