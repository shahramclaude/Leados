/* LeadOS pt-4 - js/ui.js
   Vanilla rendering. Every screen renders from engine.project(store events) -
   a fresh read, every time. Every user action is an event append.
   pt-4 part 6: rail nav + hash routes, domain views, roster dossier, data view.
   View state (route, domain filter, open tab, selected person) lives in
   sessionStorage ONLY - it is never written to leados:data. */
(function () {
  'use strict';
  const LeadOS = (window.LeadOS = window.LeadOS || {});
  const DAY = 86400000;
  const UIK = 'leados:ui';            // sessionStorage, deliberately NOT localStorage
  let LAST_HEALTH = null;
  const $ = function (s) { return document.querySelector(s); };

  // ---- ephemeral view state ------------------------------------------------
  function ui() {
    try { return JSON.parse(sessionStorage.getItem(UIK)) || {}; } catch (e) { return {}; }
  }
  function setUi(patch) {
    const s = Object.assign(ui(), patch);
    try { sessionStorage.setItem(UIK, JSON.stringify(s)); } catch (e) { /* storage disabled: state degrades, app still works */ }
    return s;
  }

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
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
    trending: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    hash: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/>'
  };
  function icon(n, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || ICONS.hash) + '</svg>';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function fmtD(ts) {
    if (ts === null || ts === undefined) return '—';
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtT(ts) { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function days(n) { return n + (n === 1 ? ' day' : ' days'); }
  function money(n) { return Math.round(n).toLocaleString('en-US'); }
  function pctStr(x) { return (x * 100).toFixed(1) + '%'; }
  function vals(o) { return Object.keys(o).map(function (k) { return o[k]; }); }

  // monospace sparkline + text bar: no canvas, no images, no libraries
  const SPARK = '▁▂▃▄▅▆▇█';
  function spark(nums) {
    if (!nums.length) return '<span class="dim">no data</span>';
    if (nums.length === 1) return '<span class="sparkline">' + SPARK[3] + '</span>';
    const mn = Math.min.apply(null, nums), mx = Math.max.apply(null, nums);
    return '<span class="sparkline">' + nums.map(function (n) { return mx === mn ? SPARK[3] : SPARK[Math.round((n - mn) / (mx - mn) * 7)]; }).join('') + '</span>';
  }
  function bar(pct, width) {
    width = width || 12;
    const p = Math.max(0, Math.min(100, pct || 0));
    const filled = Math.round(p / 100 * width);
    return '<span class="tbar">' + '█'.repeat(filled) + '░'.repeat(width - filled) + '</span>';
  }

  function read() {
    const raw = LeadOS.store.load();
    const state = LeadOS.engine.project(raw.events);
    return { raw: raw, state: state, set: LeadOS.engine.settings(state), now: Date.now() };
  }

  // ---- rail routes ---------------------------------------------------------
  const ROUTES = [
    { id: 'today', label: 'Today', icon: 'gauge', group: 'Command' },
    { id: 'signals', label: 'Signals', icon: 'activity', group: 'Command' },
    { id: 'playbooks', label: 'Playbooks', icon: 'play', group: 'Command' },
    { id: 'finance', label: 'Finance', icon: 'coins', group: 'Functions' },
    { id: 'sales', label: 'Sales', icon: 'trending', group: 'Functions' },
    { id: 'ops', label: 'Ops', icon: 'server', group: 'Functions' },
    { id: 'strategy', label: 'Strategy', icon: 'target', group: 'Functions' },
    { id: 'domains', label: 'Domains', icon: 'grid', group: 'Functions' },
    { id: 'roster', label: 'Roster', icon: 'users', group: 'Functions' },
    { id: 'cadences', label: 'Cadences', icon: 'calendar', group: 'Governance' },
    { id: 'decisions', label: 'Decisions', icon: 'scale', group: 'Governance' },
    { id: 'risks', label: 'Risks', icon: 'alert', group: 'Governance' },
    { id: 'data', label: 'Data', icon: 'database', group: 'System' },
    { id: 'health', label: 'Health', icon: 'shield', group: 'System' }
  ];
  const ROUTE_IDS = ROUTES.map(function (r) { return r.id; });
  function currentRoute() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    return ROUTE_IDS.indexOf(h) !== -1 ? h : 'today';
  }

  // Today filter chips -> domain ids
  const FILTERS = [
    ['ALL', null], ['PEOPLE', 'people'], ['FINANCE', 'finance'], ['SALES', 'sales'],
    ['OPS', 'operations'], ['STRATEGY', 'product'], ['MFG', 'manufacturing'],
    ['LEGAL', 'legal'], ['CS', 'customerSuccess'], ['EXEC', 'executive']
  ];
  const DOMAIN_TABS = [
    ['people', 'HR', 'hr.'], ['marketing', 'Marketing', 'mktg.'], ['manufacturing', 'Mfg', 'mfg.'],
    ['supplyChain', 'Supply', 'supply.'], ['design', 'Design', 'design.'], ['rd', 'R&D', 'rd.'],
    ['legal', 'Legal', 'legal.'], ['customerSuccess', 'CS', 'cs.'], ['executive', 'Exec', 'exec.']
  ];
  function findingDomain(f) { return f.play ? String(f.play).replace('playbook:', '') : null; }

  function pill(status, label) { return '<span class="pill pill-' + status + '">' + esc(label || status) + '</span>'; }
  function domainChip(id) { return '<span class="dchip" style="--dh:' + LeadOS.events.domainHue(id) + '">' + esc(LeadOS.events.domainLabel(id)) + '</span>'; }
  function stat(ic, value, label, sub) {
    return '<div class="stat"><div class="stat-ic">' + icon(ic) + '</div><div class="stat-v">' + esc(value) + '</div><div class="stat-l">' + esc(label) + '</div>' + (sub ? '<div class="stat-s">' + sub + '</div>' : '') + '</div>';
  }
  function sevBadge(s) { return '<span class="sev sev-' + s + '">sev ' + s + '</span>'; }
  function confBadge(c) { return '<span class="conf conf-' + c + '">' + esc(c) + '</span>'; }
  function findingRows(F) {
    return F.map(function (f) {
      return '<tr><td class="mono dim">' + f.rule + '</td><td>' + sevBadge(f.sev) + '</td><td>' + confBadge(f.conf) + '</td>' +
        '<td><strong>' + esc(f.title) + '</strong>' +
        (f.basis.length ? '<div class="basis">' + f.basis.map(esc).join('<br>') + '</div>' : '') + '</td>' +
        '<td>' + (f.play ? '<span class="chip">' + esc(f.play) + '</span>' : '<span class="dim tiny-t">no playbook: ' + esc(f.playNone || '') + '</span>') + '</td></tr>';
    }).join('');
  }

  /* ---- registry-driven quick capture --------------------------------------
     Forms are generated FROM the append-gate contract, so a quick-capture form
     cannot drift from the registry: if the contract changes, the form changes.
     Two types carry object arrays and get a documented text protocol. */
  const DATEISH = /(Date|At)$/;
  const DATE_NAMES = { date: true, next_maintenance: true };
  const STRUCTURED = {
    'strategy.okr.set': { field: 'keyResults', hint: 'one per line:  key result | target | unit', parse: function (lines) { return lines.map(function (l) { const p = l.split('|').map(function (s) { return s.trim(); }); return { kr: p[0], target: Number(p[1]), unit: p[2] || 'n' }; }); } },
    'exec.kpi.reviewed': { field: 'metrics', hint: 'one per line:  name | value | target | up|flat|down', parse: function (lines) { return lines.map(function (l) { const p = l.split('|').map(function (s) { return s.trim(); }); const m = { name: p[0], value: Number(p[1]) }; if (p[2] !== undefined && p[2] !== '') m.target = Number(p[2]); if (p[3]) m.trend = p[3]; return m; }); } }
  };
  function captureFields(type) {
    const spec = LeadOS.events.REGISTRY[type];
    const out = [];
    spec.require.concat(spec.optional).forEach(function (name) {
      if (name === 'id') return;                                  // generated, never asked
      const req = spec.require.indexOf(name) !== -1;
      const st = STRUCTURED[type];
      if (st && st.field === name) { out.push({ name: name, kind: 'lines', req: req, hint: st.hint }); return; }
      if (spec.enums && spec.enums[name]) { out.push({ name: name, kind: 'select', req: req, options: spec.enums[name] }); return; }
      if (spec.bools && spec.bools.indexOf(name) !== -1) { out.push({ name: name, kind: 'bool', req: req }); return; }
      if ((spec.arrays && spec.arrays.indexOf(name) !== -1) || (spec.nonemptyArrays && spec.nonemptyArrays.indexOf(name) !== -1)) { out.push({ name: name, kind: 'lines', req: req }); return; }
      if (spec.numbers && spec.numbers.indexOf(name) !== -1) { out.push({ name: name, kind: (DATEISH.test(name) || DATE_NAMES[name]) ? 'date' : 'num', req: req, range: spec.ranges && spec.ranges[name] }); return; }
      if (spec.ranges && spec.ranges[name]) { out.push({ name: name, kind: 'num', req: req, range: spec.ranges[name] }); return; }
      out.push({ name: name, kind: 'text', req: req });
    });
    return out;
  }
  function captureForm(type) {
    const fields = captureFields(type);
    return '<details class="cap"><summary>' + icon('plus') + ' <code>' + esc(type) + '</code></summary>' +
      '<form class="frm" data-form="capture" data-type="' + esc(type) + '">' +
      fields.map(function (f) {
        const lbl = '<span class="pbl">' + esc(f.name) + (f.req ? ' <i>*</i>' : '') + (f.range ? ' <span class="dim">(' + f.range[0] + '–' + f.range[1] + ')</span>' : '') + '</span>';
        let input;
        if (f.kind === 'select') input = '<select name="' + esc(f.name) + '"' + (f.req ? ' required' : '') + '>' + (f.req ? '' : '<option value=""></option>') + f.options.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>';
        else if (f.kind === 'bool') input = '<label class="cbx"><input type="checkbox" name="' + esc(f.name) + '"> true</label>';
        else if (f.kind === 'lines') input = '<textarea name="' + esc(f.name) + '" rows="2" placeholder="one per line"' + (f.req ? ' required' : '') + '></textarea>';
        else if (f.kind === 'date') input = '<input type="date" name="' + esc(f.name) + '"' + (f.req ? ' required' : '') + '>';
        else if (f.kind === 'num') input = '<input type="number" step="any" name="' + esc(f.name) + '"' + (f.req ? ' required' : '') + '>';
        else input = '<input type="text" name="' + esc(f.name) + '"' + (f.req ? ' required' : '') + '>';
        return '<label class="pbfield">' + lbl + input + (f.hint ? '<span class="pbhint">' + esc(f.hint) + '</span>' : '') + '</label>';
      }).join('') +
      '<button class="btn primary" type="submit">' + icon('check') + ' append ' + esc(type) + '</button></form></details>';
  }
  function captureBlock(title, types) {
    return '<section class="card"><header class="card-h"><h3>' + icon('plus') + ' ' + esc(title) + '</h3><span class="dim">forms generated from the registry contract</span></header>' +
      '<div class="caps">' + types.map(captureForm).join('') + '</div></section>';
  }
  function typesWithPrefix(prefix) {
    return Object.keys(LeadOS.events.REGISTRY).filter(function (t) { return t.indexOf(prefix) === 0; });
  }
  function buildCapturePayload(form, type) {
    const spec = LeadOS.events.REGISTRY[type];
    const fields = captureFields(type);
    const payload = {};
    if (spec.require.indexOf('id') !== -1) payload.id = LeadOS.playbooks.uid(type.split('.')[0]);
    fields.forEach(function (f) {
      const el = form.elements[f.name];
      if (!el) return;
      if (f.kind === 'bool') { payload[f.name] = !!el.checked; return; }
      const raw = String(el.value == null ? '' : el.value).trim();
      if (raw === '') return;                                    // blank optional stays absent
      if (f.kind === 'num') { payload[f.name] = Number(raw); return; }
      if (f.kind === 'date') { payload[f.name] = new Date(raw + 'T12:00:00').getTime(); return; }
      if (f.kind === 'lines') {
        const lines = raw.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        const st = STRUCTURED[type];
        payload[f.name] = (st && st.field === f.name) ? st.parse(lines) : lines;
        return;
      }
      payload[f.name] = raw;
    });
    return payload;
  }

  // ================================================================= TODAY
  function viewToday(ctx) {
    const e = LeadOS.engine, s = ctx.state, now = ctx.now;
    const tot = e.totals(s), cad = e.cadenceStatus(s, now), tl = e.taskLists(s, now);
    const all = LeadOS.rules.run(s, now);
    const counts = {};
    all.forEach(function (f) { const d = findingDomain(f) || 'system'; counts[d] = (counts[d] || 0) + 1; });
    const active = ui().filter || null;
    const shown = active ? all.filter(function (f) { return findingDomain(f) === active; }) : all;
    shown.sort(function (a, b) { return (b.sev - a.sev) || (a.rule < b.rule ? -1 : 1); });

    let h = '';
    if (s.eventCount <= 1) {
      h += '<section class="card hero"><div class="hero-in"><div class="hero-ic">' + icon('layers') + '</div>' +
        '<h2>Install the starter slate</h2><p>One click appends a complete baseline: playbooks for Executive, Sales and Engineering, baseline reviews across all four rhythms, and a live sales decision — every item written as immutable events.</p>' +
        '<button class="btn primary lg" data-action="seed">' + icon('play') + ' Install starter slate</button></div></section>';
    }

    h += '<section class="stats">' +
      stat('database', tot.events, 'events in log', 'append-only') +
      stat('activity', all.length, 'open signals', active ? shown.length + ' in filter' : 'across all domains') +
      stat('scale', tot.openDecisions, 'open decisions', '') +
      stat('alert', tot.openRisks, 'open risks', '') +
      stat('calendar', tl.overdue.length, 'overdue tasks', tl.open.length + ' open') +
      '</section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('activity') + ' Findings today</h3>' +
      '<span class="dim">' + FILTERS.slice(1).map(function (f) { return f[0].toLowerCase() + ' ' + (counts[f[1]] || 0); }).join(' · ') + '</span></header>' +
      '<div class="chiprow">' + FILTERS.map(function (f) {
        const on = (f[1] === active) || (f[1] === null && !active);
        const n = f[1] === null ? all.length : (counts[f[1]] || 0);
        return '<button class="fchip' + (on ? ' on' : '') + '" data-action="filter" data-domain="' + (f[1] || '') + '">' + esc(f[0]) + ' <b>' + n + '</b></button>';
      }).join('') + '</div>' +
      '<p class="dim pad">Filter is view state in sessionStorage — it never touches the event log.</p>';
    h += shown.length ? '<table class="tbl"><thead><tr><th>rule</th><th>sev</th><th>conf</th><th>finding</th><th>playbook</th></tr></thead><tbody>' + findingRows(shown.slice(0, 40)) + '</tbody></table>' : '<p class="empty">No findings in this filter.</p>';
    h += '</section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('calendar') + ' Operating rhythm</h3><a class="btn ghost" href="#/cadences">open cadences</a></header><div class="cad-row">';
    LeadOS.engine.CADENCE.forEach(function (c) {
      const st = cad[c.kind];
      h += '<div class="cad-mini cad-' + st.status + '"><div class="cad-mini-t">' + esc(c.label) + '</div><div class="cad-mini-s">' + pill(st.status) + '</div>' +
        '<div class="cad-mini-d">every ' + days(st.intervalDays) + '<br>last: ' + fmtD(st.lastCompletedAt) + '<br>due: ' + (st.status === 'never' ? 'now' : fmtD(st.dueAt)) + '</div></div>';
    });
    h += '</div></section>';
    return h;
  }

  // ================================================================= SIGNALS
  function viewSignals(ctx) {
    const F = LeadOS.rules.run(ctx.state, ctx.now).slice().sort(function (a, b) { return (b.sev - a.sev) || (a.rule < b.rule ? -1 : 1); });
    const bySev = [0, 0, 0, 0, 0, 0];
    F.forEach(function (f) { bySev[f.sev]++; });
    let h = '<section class="stats">' +
      stat('activity', F.length, 'open signals', 'from ' + LeadOS.rules.RULES.length + ' pure rules') +
      stat('alert', bySev[5], 'sev 5', 'immediate') + stat('alert', bySev[4], 'sev 4', 'act this week') +
      stat('calendar', bySev[3], 'sev 3', 'on the radar') + stat('shield', bySev[1] + bySev[2], 'sev 1–2', 'hygiene') + '</section>';
    h += '<section class="card"><header class="card-h"><h3>' + icon('activity') + ' Findings — rules engine R1–R40</h3><span class="dim">(P, today) → findings[] · derived per read</span></header>';
    h += F.length ? '<table class="tbl"><thead><tr><th>rule</th><th>sev</th><th>conf</th><th>finding</th><th>playbook</th></tr></thead><tbody>' + findingRows(F) + '</tbody></table>' : '<p class="empty">No findings.</p>';
    return h + '</section>';
  }

  // ================================================================= FINANCE
  function viewFinance(ctx) {
    const P = ctx.state;
    let h = '<section class="card"><header class="card-h"><h3>' + icon('coins') + ' Budgets vs actuals</h3></header>';
    const budgets = vals(P.budgetById);
    h += budgets.length ? '<table class="tbl"><thead><tr><th>category</th><th>period</th><th class="num">budget</th><th class="num">latest actual</th><th class="num">variance</th><th>trail</th></tr></thead><tbody>' + budgets.map(function (b) {
      const a = b.actuals.length ? b.actuals[b.actuals.length - 1] : null;
      const v = a ? (a.actual - b.amount) / b.amount : null;
      return '<tr><td>' + esc(b.category) + '</td><td class="mono">' + esc(b.period) + '</td><td class="num">' + money(b.amount) + ' ' + esc(b.currency) + '</td>' +
        '<td class="num">' + (a ? money(a.actual) : '<span class="dim">none logged</span>') + '</td>' +
        '<td class="num">' + (v === null ? '<span class="dim">—</span>' : '<span class="' + (Math.abs(v) > 0.15 ? 'late' : '') + '">' + (v > 0 ? '+' : '') + pctStr(v) + '</span>') + '</td>' +
        '<td>' + spark(b.actuals.map(function (x) { return x.actual; })) + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="empty">No budgets logged.</p>';
    h += '</section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('trending') + ' KPI sparklines</h3><span class="dim">append-ordered per metric</span></header>';
    const metrics = Object.keys(P.kpiByMetric);
    h += metrics.length ? '<table class="tbl"><thead><tr><th>metric</th><th>history</th><th class="num">latest</th><th class="num">target</th><th class="num">attainment</th></tr></thead><tbody>' + metrics.map(function (m) {
      const logs = P.kpiByMetric[m], last = logs[logs.length - 1];
      const att = last.target ? last.value / last.target : null;
      return '<tr><td class="mono">' + esc(m) + '</td><td>' + spark(logs.map(function (l) { return l.value; })) + ' <span class="dim tiny-t">' + logs.length + ' pts</span></td>' +
        '<td class="num">' + last.value + ' ' + esc(last.unit) + '</td><td class="num dim">' + (last.target === undefined ? '—' : last.target) + '</td>' +
        '<td class="num">' + (att === null ? '<span class="dim">no target</span>' : '<span class="' + (att < 0.85 ? 'late' : '') + '">' + pctStr(att) + '</span>') + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="empty">No KPIs logged.</p>';
    h += '</section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('scale') + ' Forecast vs actuals</h3><span class="dim">matched by period; unmatched rows say so</span></header>';
    h += P.forecastHistory.length ? '<table class="tbl"><thead><tr><th>period</th><th class="num">forecast revenue</th><th class="num">actuals (budget)</th><th class="num">deviation</th><th class="num">confidence</th></tr></thead><tbody>' + P.forecastHistory.map(function (f) {
      let actual = 0, found = false;
      vals(P.budgetById).forEach(function (b) { b.actuals.forEach(function (a) { if (a.period === f.period) { actual += a.actual; found = true; } }); });
      const dev = found && actual ? (f.revenue - actual) / actual : null;
      return '<tr><td class="mono">' + esc(f.period) + '</td><td class="num">' + money(f.revenue) + '</td>' +
        '<td class="num">' + (found ? money(actual) : '<span class="dim">not checkable</span>') + '</td>' +
        '<td class="num">' + (dev === null ? '<span class="dim">—</span>' : '<span class="' + (Math.abs(dev) > 0.2 ? 'late' : '') + '">' + (dev > 0 ? '+' : '') + pctStr(dev) + '</span>') + '</td>' +
        '<td class="num dim">' + f.confidence + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="empty">No forecasts logged.</p>';
    h += '</section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('alert') + ' Financial risk register</h3><span class="dim">sorted severity × likelihood</span></header>';
    const risks = vals(P.riskById).sort(function (a, b) { return (b.severity * b.likelihood) - (a.severity * a.likelihood); });
    h += risks.length ? '<table class="tbl"><thead><tr><th>risk</th><th class="num">S×L</th><th>status</th><th>review due</th><th>mitigation</th></tr></thead><tbody>' + risks.map(function (r) {
      const overdue = r.reviewDate && r.reviewDate < ctx.now && ['mitigated', 'accepted', 'closed'].indexOf(r.status) === -1;
      return '<tr><td>' + esc(r.title) + '</td><td class="num"><span class="score" style="--s:' + (r.severity * r.likelihood) + '">' + (r.severity * r.likelihood) + '</span></td>' +
        '<td>' + pill(r.status === 'open' ? 'due' : 'ok', r.status) + '</td>' +
        '<td class="' + (overdue ? 'late' : 'dim') + '">' + fmtD(r.reviewDate) + (overdue ? ' overdue' : '') + '</td>' +
        '<td class="dim">' + esc(r.mitigationPlan || '(none recorded)') + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="empty">No financial risks logged.</p>';
    h += '</section>';
    return h + captureBlock('Quick capture — finance', typesWithPrefix('fin.'));
  }

  // ================================================================= SALES
  function viewSales(ctx) {
    const P = ctx.state;
    const byStage = {};
    P.openDeals.forEach(function (d) { (byStage[d.stage] = byStage[d.stage] || { n: 0, v: 0 }); byStage[d.stage].n++; byStage[d.stage].v += d.value; });
    const closed = vals(P.dealById).filter(function (d) { return d.closedAt; });
    const cycles = closed.map(function (d) { return (d.closedAt - d.loggedAt) / DAY; });
    const avg = cycles.length ? cycles.reduce(function (a, b) { return a + b; }, 0) / cycles.length : null;

    let h = '<section class="stats">' +
      stat('trending', P.openDeals.length, 'open deals', money(P.openDeals.reduce(function (a, d) { return a + d.value; }, 0)) + ' value') +
      stat('check', closed.filter(function (d) { return d.result === 'won'; }).length, 'won', closed.filter(function (d) { return d.result === 'lost'; }).length + ' lost') +
      stat('calendar', avg === null ? '—' : avg.toFixed(1), 'avg cycle (days)', cycles.length + ' closed deals') +
      stat('target', ctx.set.salesCycleDays, 'salesCycleDays', 'v4 setting') + '</section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('trending') + ' Pipeline by stage</h3></header>';
    const stages = Object.keys(byStage);
    h += stages.length ? '<table class="tbl"><thead><tr><th>stage</th><th class="num">deals</th><th class="num">value</th><th>share</th></tr></thead><tbody>' + stages.map(function (st) {
      const total = P.openDeals.reduce(function (a, d) { return a + d.value; }, 0) || 1;
      return '<tr><td>' + esc(st) + '</td><td class="num">' + byStage[st].n + '</td><td class="num">' + money(byStage[st].v) + '</td><td>' + bar(byStage[st].v / total * 100) + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="empty">No open deals.</p>';
    h += '</section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('target') + ' Quota attainment</h3></header>';
    const people = Object.keys(P.quotaByPerson);
    h += people.length ? '<table class="tbl"><thead><tr><th>person</th><th>period</th><th class="num">target</th><th class="num">actual</th><th class="num">attainment</th><th></th></tr></thead><tbody>' + people.map(function (pid) {
      return P.quotaByPerson[pid].map(function (q) {
        const a = q.actuals.length ? q.actuals[q.actuals.length - 1] : null;
        const rate = a ? a.actual / q.target : null;
        return '<tr><td><a href="#/roster" data-action="person" data-id="' + esc(pid) + '">' + esc(pid) + '</a></td><td class="mono">' + esc(q.period) + '</td>' +
          '<td class="num">' + money(q.target) + '</td><td class="num">' + (a ? money(a.actual) : '<span class="dim">no actuals</span>') + '</td>' +
          '<td class="num">' + (rate === null ? '<span class="dim">—</span>' : '<span class="' + (rate < 0.7 ? 'late' : '') + '">' + pctStr(rate) + '</span>') + '</td>' +
          '<td>' + (rate === null ? '' : bar(rate * 100)) + '</td></tr>';
      }).join('');
    }).join('') + '</tbody></table>' : '<p class="empty">No quotas logged.</p>';
    h += '</section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('list') + ' Open deals</h3></header>';
    h += P.openDeals.length ? '<table class="tbl"><thead><tr><th>deal</th><th>account</th><th>stage</th><th class="num">value</th><th>close date</th></tr></thead><tbody>' + P.openDeals.slice().sort(function (a, b) { return (a.closeDate || Infinity) - (b.closeDate || Infinity); }).map(function (d) {
      const late = d.closeDate && d.closeDate < ctx.now;
      return '<tr class="' + (late ? 'row-late' : '') + '"><td>' + esc(d.title) + '</td><td class="dim">' + esc(d.accountName || '—') + '</td><td>' + esc(d.stage) + '</td>' +
        '<td class="num">' + money(d.value) + ' ' + esc(d.currency) + '</td><td class="num">' + fmtD(d.closeDate) + (late ? ' <span class="late">past</span>' : '') + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="empty">No open deals.</p>';
    h += '</section>';
    return h + captureBlock('Quick capture — sales', typesWithPrefix('sales.'));
  }

  // ================================================================= OPS
  function viewOps(ctx) {
    const P = ctx.state, now = ctx.now;
    const inc = vals(P.incidentById);
    const resolved = inc.filter(function (i) { return i.resolved; });
    const mttr = resolved.length ? resolved.reduce(function (a, i) { return a + (i.resolvedAt - i.startedAt); }, 0) / resolved.length / 3600000 : null;

    let h = '<section class="stats">' +
      stat('server', P.openIncidents.length, 'open incidents', inc.length + ' total') +
      stat('activity', mttr === null ? '—' : mttr.toFixed(1) + 'h', 'mean MTTR', resolved.length + ' resolved') +
      stat('shield', Object.keys(P.slaByMetric).length, 'SLA metrics', '') +
      stat('calendar', P.openMilestones.length, 'open milestones', '') + '</section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('alert') + ' Incident log</h3></header>';
    h += inc.length ? '<table class="tbl"><thead><tr><th>incident</th><th class="num">sev</th><th>systems</th><th>started</th><th class="num">time to resolve</th><th>root cause</th></tr></thead><tbody>' + inc.slice().sort(function (a, b) { return b.startedAt - a.startedAt; }).map(function (i) {
      const t = i.resolved ? (i.resolvedAt - i.startedAt) / 3600000 : (now - i.startedAt) / 3600000;
      return '<tr class="' + (i.resolved ? '' : 'row-late') + '"><td>' + esc(i.title) + '</td><td class="num">' + sevBadge(i.severity) + '</td>' +
        '<td class="dim mono">' + esc(i.systems.join(', ')) + '</td><td class="num dim">' + fmtD(i.startedAt) + '</td>' +
        '<td class="num">' + t.toFixed(1) + 'h' + (i.resolved ? '' : ' <span class="late">open</span>') + '</td>' +
        '<td class="dim">' + esc(i.rootCause || (i.resolved ? '(none recorded)' : '—')) + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="empty">No incidents logged.</p>';
    h += '</section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('shield') + ' SLA dashboard</h3></header>';
    const sm = Object.keys(P.slaByMetric);
    h += sm.length ? '<table class="tbl"><thead><tr><th>metric</th><th>history</th><th class="num">met</th><th class="num">latest</th><th class="num">target</th><th>status</th></tr></thead><tbody>' + sm.map(function (m) {
      const logs = P.slaByMetric[m], last = logs[logs.length - 1];
      const met = logs.filter(function (l) { return l.met; }).length;
      return '<tr><td class="mono">' + esc(m) + '</td><td><span class="sparkline">' + logs.map(function (l) { return l.met ? '▀' : '▄'; }).join('') + '</span></td>' +
        '<td class="num">' + met + '/' + logs.length + '</td><td class="num">' + last.actual + '</td><td class="num dim">' + last.target + '</td>' +
        '<td>' + (last.met ? pill('ok', 'met') : pill('overdue', 'missed')) + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="empty">No SLA records.</p>';
    h += '</section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('calendar') + ' Milestone tracker</h3><span class="dim">text Gantt — start (set) → due</span></header>';
    const ms = vals(P.milestoneById);
    if (ms.length) {
      const lo = Math.min.apply(null, ms.map(function (m) { return Math.min(m.setAt, m.dueDate); }));
      const hi = Math.max.apply(null, ms.map(function (m) { return Math.max(m.dueDate, m.statusAt); }));
      const W = 28, span = Math.max(1, hi - lo);
      h += '<pre class="gantt">' + ms.slice().sort(function (a, b) { return a.dueDate - b.dueDate; }).map(function (m) {
        const s = Math.floor((m.setAt - lo) / span * W), e = Math.max(s + 1, Math.floor((m.dueDate - lo) / span * W));
        const nowCol = Math.floor((now - lo) / span * W);
        let row = '';
        for (let i = 0; i < W; i++) row += (i >= s && i <= e) ? (m.status === 'done' ? '═' : m.status === 'blocked' ? '×' : m.status === 'at-risk' ? '▒' : '█') : (i === nowCol ? '|' : '·');
        return esc(('[' + row + ']  ' + m.status.padEnd(9) + ' due ' + fmtD(m.dueDate) + '  ' + m.title + (m.dependsOn.length ? '  ← ' + m.dependsOn.join(',') : '')));
      }).join('\n') + '</pre><p class="dim pad">█ on-track · ▒ at-risk · × blocked · ═ done · | today</p>';
    } else h += '<p class="empty">No milestones logged.</p>';
    h += '</section>';
    return h + captureBlock('Quick capture — operations', typesWithPrefix('ops.'));
  }

  // ================================================================= STRATEGY
  function viewStrategy(ctx) {
    const P = ctx.state;
    let h = '<section class="card"><header class="card-h"><h3>' + icon('target') + ' OKR tree</h3><span class="dim">objective → key results</span></header>';
    const okrs = vals(P.okrById);
    if (okrs.length) {
      h += '<pre class="okrtree">' + okrs.map(function (o) {
        const head = (o.closedAt ? '◆' : '◇') + ' ' + o.objective + '  [' + o.quarter + ']' + (o.closedAt ? '  closed · score ' + o.score : '');
        const krs = o.keyResults.map(function (kr, i) {
          const last = i === o.keyResults.length - 1;
          if (kr.current === null) return '  ' + (last ? '└' : '├') + '─ ' + '░'.repeat(12) + '   never measured   ' + kr.kr;
          const p = kr.target ? Math.max(0, Math.min(100, kr.current / kr.target * 100)) : 0;
          const filled = Math.round(p / 100 * 12);
          return '  ' + (last ? '└' : '├') + '─ ' + '█'.repeat(filled) + '░'.repeat(12 - filled) + ' ' + String(Math.round(p)).padStart(3) + '%  ' + kr.kr + '  (' + kr.current + '/' + kr.target + ' ' + kr.unit + ')';
        }).join('\n');
        return esc(head + (krs ? '\n' + krs : ''));
      }).join('\n\n') + '</pre>';
    } else h += '<p class="empty">No OKRs logged.</p>';
    h += '</section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('grid') + ' Roadmap by quarter</h3></header>';
    const items = vals(P.roadmapById);
    if (items.length) {
      const byQ = {};
      items.forEach(function (i) { (byQ[i.quarter] = byQ[i.quarter] || []).push(i); });
      h += '<div class="qgrid">' + Object.keys(byQ).sort().map(function (q) {
        return '<div class="qcol"><h4>' + esc(q) + '</h4>' + byQ[q].sort(function (a, b) { return (b.impact * (6 - b.effort)) - (a.impact * (6 - a.effort)); }).map(function (i) {
          return '<div class="qitem st-' + esc(i.status) + '"><strong>' + esc(i.title) + '</strong><span class="dim mono tiny-t">' + esc(i.status) + ' · impact ' + i.impact + ' · effort ' + i.effort + (i.pillar ? ' · ' + esc(i.pillar) : '') + '</span></div>';
        }).join('') + '</div>';
      }).join('') + '</div>';
    } else h += '<p class="empty">No roadmap items.</p>';
    h += '</section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('scale') + ' Decision log</h3></header>';
    const sd = P.strategyDecisions.slice().reverse();
    const core = LeadOS.engine.decidedLog(P);
    h += (sd.length || core.length) ? '<table class="tbl"><thead><tr><th>decision</th><th class="num">sev</th><th>chosen</th><th>rationale</th><th class="num">date</th></tr></thead><tbody>' +
      sd.map(function (d) { return '<tr><td>' + esc(d.title) + '<div class="dim tiny-t">alternatives: ' + esc(d.alternatives.join(' · ')) + '</div></td><td class="num">' + sevBadge(d.severity) + '</td><td>' + esc(d.chosen) + '</td><td class="dim">' + esc(d.rationale) + '</td><td class="num dim">' + fmtD(d.at) + '</td></tr>'; }).join('') +
      core.map(function (d) { return '<tr><td>' + esc(d.question) + ' ' + domainChip(d.domain) + '</td><td class="num dim">—</td><td>' + esc(d.choice) + '</td><td class="dim">' + esc(d.rationale) + '</td><td class="num dim">' + fmtD(d.decidedAt) + '</td></tr>'; }).join('') +
      '</tbody></table>' : '<p class="empty">No decisions recorded.</p>';
    h += '</section>';
    return h + captureBlock('Quick capture — product & strategy', typesWithPrefix('product.').concat(typesWithPrefix('strategy.')));
  }

  // ================================================================= DOMAINS
  function domainMetrics(P, domainId) {
    const M = {
      people: [['engagement score', P.engagementHistory.map(function (x) { return x.score; })], ['offers logged', P.offers.map(function (_, i) { return i + 1; })]],
      marketing: [['campaign budget', vals(P.campaignById).map(function (c) { return c.budget; })], ['content reach', P.content.map(function (c) { return c.reach || 0; })]],
      manufacturing: [['yield %', P.yieldHistory.map(function (y) { return y.yield_pct; })], ['units actual', P.productionLogs.map(function (x) { return x.units_actual; })]],
      supplyChain: [['vendor scores', vals(P.vendorById).map(function (v) { return v.lastScore; }).filter(function (x) { return x !== null; })], ['inventory qty', P.inventoryLogs.map(function (i) { return i.quantity; })]],
      design: [['UX metric', P.uxMetrics.map(function (m) { return m.value; })], ['research participants', P.designResearch.map(function (r) { return r.participants; })]],
      rd: [['open tech debt mass', P.openTechDebt.map(function (d) { return d.severity * d.effort; })], ['experiments', vals(P.experimentById).map(function (_, i) { return i + 1; })]],
      legal: [['open contracts', [P.openContracts.length]], ['compliance checks', Object.keys(P.complianceByFramework).map(function (f) { return P.complianceByFramework[f].length; })]],
      customerSuccess: [['NPS', P.npsHistory.map(function (n) { return n.score; })], ['churn %', P.churnHistory.map(function (c) { return c.total ? c.churned / c.total * 100 : 0; })]],
      executive: [['board meetings', P.boardMeetings.map(function (_, i) { return i + 1; })], ['KPI reviews', P.execKpiReviews.map(function (_, i) { return i + 1; })]]
    };
    return M[domainId] || [];
  }
  function viewDomains(ctx) {
    const P = ctx.state;
    const openTab = ui().domainTab && DOMAIN_TABS.some(function (t) { return t[0] === ui().domainTab; }) ? ui().domainTab : DOMAIN_TABS[0][0];
    const F = LeadOS.rules.run(P, ctx.now);
    let h = '<section class="card"><header class="card-h"><h3>' + icon('grid') + ' Domain index</h3><span class="dim">findings · metrics · capture, per domain</span></header>' +
      '<div class="chiprow">' + DOMAIN_TABS.map(function (t) {
        const n = F.filter(function (f) { return findingDomain(f) === t[0]; }).length;
        return '<button class="fchip' + (t[0] === openTab ? ' on' : '') + '" data-action="dtab" data-id="' + t[0] + '">' + esc(t[1]) + ' <b>' + n + '</b></button>';
      }).join('') + '</div></section>';

    const tab = DOMAIN_TABS.find(function (t) { return t[0] === openTab; });
    const mine = F.filter(function (f) { return findingDomain(f) === tab[0]; });
    h += '<section class="card"><header class="card-h"><h3>' + domainChip(tab[0]) + ' Active findings</h3><span class="dim">' + mine.length + ' open</span></header>';
    h += mine.length ? '<table class="tbl"><thead><tr><th>rule</th><th>sev</th><th>conf</th><th>finding</th><th>playbook</th></tr></thead><tbody>' + findingRows(mine) + '</tbody></table>' : '<p class="empty">No active findings in this domain.</p>';
    h += '</section>';

    const mets = domainMetrics(P, tab[0]);
    h += '<section class="card"><header class="card-h"><h3>' + icon('trending') + ' Domain metrics</h3></header>';
    h += mets.length ? '<table class="tbl"><tbody>' + mets.map(function (m) {
      const series = m[1].filter(function (x) { return typeof x === 'number'; });
      return '<tr><td class="dim">' + esc(m[0]) + '</td><td>' + spark(series) + '</td><td class="num">' + (series.length ? series[series.length - 1] : '<span class="dim">no data</span>') + '</td><td class="dim tiny-t">' + series.length + ' points</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="empty">No metric series for this domain.</p>';
    h += '</section>';
    return h + captureBlock('Quick capture — ' + tab[1], typesWithPrefix(tab[2]));
  }

  // ================================================================= ROSTER
  function viewRoster(ctx) {
    const P = ctx.state;
    const people = vals(P.rosterById).sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    const sel = ui().person && P.rosterById[ui().person] ? ui().person : (people.length ? people[0].id : null);
    let h = '<section class="card"><header class="card-h"><h3>' + icon('users') + ' Roster</h3><span class="dim">derived from the log — a person exists because events mention them</span></header>';
    h += people.length ? '<div class="chiprow">' + people.map(function (p) {
      return '<button class="fchip' + (p.id === sel ? ' on' : '') + '" data-action="person" data-id="' + esc(p.id) + '">' + esc(p.id) + (p.departed ? ' <span class="dim">departed</span>' : '') + '</button>';
    }).join('') + '</div>' : '<p class="empty">No people referenced in the log yet.</p>';
    h += '</section>';
    if (!sel) return h;

    const p = P.rosterById[sel];
    h += '<section class="card"><header class="card-h"><h3>' + icon('users') + ' Dossier: ' + esc(p.id) + '</h3><span class="dim">' + Object.keys(p.sources).map(function (s) { return '<span class="chip">' + esc(s) + '</span>'; }).join(' ') + '</span></header>' +
      '<div class="stats inner">' +
      stat('target', p.quotas.length, 'quotas', p.isSales ? 'sales role' : '') +
      stat('check', p.performance.length, 'perf reviews', p.performance.length ? p.performance[p.performance.length - 1].rating : '') +
      stat('alert', p.openPips.length, 'open PIPs', p.pips.length + ' total') +
      stat('coins', p.compensation.length, 'comp reviews', '') +
      stat('trending', p.openDeals.length, 'open deals', money(p.openDeals.reduce(function (a, d) { return a + d.value; }, 0))) +
      '</div></section>';

    function tbl(title, rows, head) {
      return '<section class="card"><header class="card-h"><h3>' + esc(title) + '</h3></header>' +
        (rows ? '<table class="tbl"><thead><tr>' + head.map(function (x) { return '<th>' + esc(x) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table>' : '<p class="empty">Nothing logged.</p>') + '</section>';
    }
    h += tbl('Quota attainment history', p.quotas.length ? p.quotas.map(function (q) {
      return q.actuals.length ? q.actuals.map(function (a) {
        const r = a.actual / q.target;
        return '<tr><td class="mono">' + esc(a.period) + '</td><td class="num">' + money(q.target) + '</td><td class="num">' + money(a.actual) + '</td><td class="num ' + (r < 0.7 ? 'late' : '') + '">' + pctStr(r) + '</td><td>' + bar(r * 100) + '</td></tr>';
      }).join('') : '<tr><td class="mono">' + esc(q.period) + '</td><td class="num">' + money(q.target) + '</td><td colspan="3" class="dim">no actuals logged</td></tr>';
    }).join('') : '', ['period', 'target', 'actual', 'attainment', '']);

    h += tbl('Performance ratings', p.performance.length ? p.performance.map(function (x) {
      return '<tr><td class="mono">' + esc(x.period) + '</td><td>' + pill(x.rating === 'below' ? 'overdue' : x.rating === 'exceeds' ? 'ok' : 'due', x.rating) + '</td><td class="dim">' + esc(x.note || '') + '</td><td class="num dim">' + fmtD(x.at) + '</td></tr>';
    }).join('') : '', ['period', 'rating', 'note', 'logged']);

    h += tbl('PIP status', p.pips.length ? p.pips.map(function (x) {
      const due = x.startedAt + x.duration_days * DAY;
      const overdue = x.result === null && due < ctx.now;
      return '<tr><td class="num dim">' + fmtD(x.startedAt) + '</td><td class="num">' + x.duration_days + 'd</td><td>' + (x.result ? pill(x.result === 'improved' ? 'ok' : 'overdue', x.result) : pill(overdue ? 'overdue' : 'due', overdue ? 'open · past term' : 'open')) + '</td><td class="dim">' + esc(x.goals.join('; ')) + '</td></tr>';
    }).join('') : '', ['started', 'term', 'status', 'goals']);

    h += tbl('Compensation reviews', p.compensation.length ? p.compensation.map(function (x) {
      return '<tr><td>' + esc(x.changeType) + '</td><td class="num dim">' + fmtD(x.effectiveDate || x.at) + '</td><td class="dim">' + esc(x.note || '') + '</td></tr>';
    }).join('') : '', ['change', 'effective', 'note']);

    if (p.isSales) h += tbl('Open deals', p.openDeals.length ? p.openDeals.map(function (d) {
      return '<tr><td>' + esc(d.title) + '</td><td class="dim">' + esc(d.accountName || '—') + '</td><td>' + esc(d.stage) + '</td><td class="num">' + money(d.value) + ' ' + esc(d.currency) + '</td><td class="num dim">' + fmtD(d.closeDate) + '</td></tr>';
    }).join('') : '', ['deal', 'account', 'stage', 'value', 'close']);

    if (p.departed) h += '<section class="card"><header class="card-h"><h3>' + icon('alert') + ' Departure</h3></header><p class="pad">Reason: <strong>' + esc(p.attrition.reason) + '</strong> · logged ' + fmtD(p.attrition.at) + (p.attrition.note ? ' · ' + esc(p.attrition.note) : '') + '</p></section>';
    return h;
  }

  // ================================================================= CADENCES / DECISIONS / RISKS
  function viewCadences(ctx) {
    const e = LeadOS.engine, cad = e.cadenceStatus(ctx.state, ctx.now);
    let h = '<section class="cad-grid">';
    e.CADENCE.forEach(function (c) {
      const st = cad[c.kind];
      const history = vals(ctx.state.reviews).filter(function (r) { return r.kind === c.kind && r.status === 'completed'; }).sort(function (a, b) { return b.completedAt - a.completedAt; });
      h += '<article class="card cad-card cad-' + st.status + '"><header class="card-h"><h3>' + esc(c.label) + '</h3>' + pill(st.status) + '</header>' +
        '<div class="cad-meta"><span>cycle ' + days(st.intervalDays) + '</span><span>last ' + fmtD(st.lastCompletedAt) + '</span><span>due ' + (st.status === 'never' ? 'now' : fmtD(st.dueAt)) + '</span>' + (st.overdueDays ? '<span class="late">' + days(st.overdueDays) + ' late</span>' : '') + '</div>';
      if (st.openScheduled) {
        h += '<form class="inline-form" data-form="complete-review" data-id="' + esc(st.openScheduled.id) + '"><span class="if-label">scheduled ' + fmtD(st.openScheduled.dueAt) + '</span>' +
          '<select name="outcome" required><option value="" disabled selected>outcome</option><option>on-track</option><option>at-risk</option><option>off-track</option><option>completed</option></select>' +
          '<input name="notes" placeholder="notes (optional)" maxlength="120"><button class="btn tiny primary" type="submit">' + icon('check') + ' complete</button></form>';
      }
      h += '<form class="inline-form" data-form="schedule-review" data-kind="' + esc(c.kind) + '"><span class="if-label">schedule next</span>' +
        '<input type="date" name="date" value="' + fmtD(ctx.now + st.intervalDays * DAY) + '" required><button class="btn tiny" type="submit">' + icon('plus') + ' schedule</button></form>';
      h += history.length ? '<table class="tbl slim"><tbody>' + history.slice(0, 4).map(function (r) { return '<tr><td class="num">' + fmtD(r.completedAt) + '</td><td>' + esc(r.outcome) + '</td><td class="dim">' + esc(r.notes || '') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="empty">No completed reviews yet.</p>';
      h += '</article>';
    });
    return h + '</section>';
  }
  function domainOptions() { return LeadOS.events.DOMAINS.map(function (d) { return '<option value="' + d.id + '">' + esc(d.label) + '</option>'; }).join(''); }
  function viewDecisions(ctx) {
    const e = LeadOS.engine, q = e.decisionQueue(ctx.state, ctx.now), log = e.decidedLog(ctx.state);
    let h = '<section class="card"><header class="card-h"><h3>' + icon('plus') + ' Propose a decision</h3></header>' +
      '<form class="frm" data-form="propose-decision"><div class="frow"><select name="domain" required>' + domainOptions() + '</select>' +
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
    h += '</section><section class="card"><header class="card-h"><h3>' + icon('check') + ' Decided</h3></header>';
    h += log.length ? '<table class="tbl"><tbody>' + log.slice(0, 8).map(function (d) { return '<tr><td>' + domainChip(d.domain) + '</td><td>' + esc(d.question) + '</td><td>' + esc(d.choice) + '</td><td class="dim">' + esc(d.rationale) + '</td><td class="num">' + fmtD(d.decidedAt) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="empty">Nothing decided yet.</p>';
    return h + '</section>';
  }
  function viewRisks(ctx) {
    const rr = LeadOS.engine.riskRegister(ctx.state, ctx.now);
    let h = '<section class="card"><header class="card-h"><h3>' + icon('plus') + ' Raise a risk</h3></header>' +
      '<form class="frm" data-form="raise-risk"><div class="frow"><select name="domain" required>' + domainOptions() + '</select>' +
      '<label class="fld">likelihood <input type="number" name="likelihood" min="1" max="5" value="3" required></label>' +
      '<label class="fld">impact <input type="number" name="impact" min="1" max="5" value="3" required></label></div>' +
      '<input name="title" placeholder="risk statement" required maxlength="160"><input name="mitigation" placeholder="mitigation (optional)" maxlength="160">' +
      '<button class="btn primary" type="submit">' + icon('plus') + ' raise</button></form></section>';
    h += '<section class="card"><header class="card-h"><h3>' + icon('alert') + ' Risk register</h3><span class="dim">review cycle ' + days(ctx.set.riskReviewCadenceDays) + '</span></header>';
    h += rr.length ? '<table class="tbl"><thead><tr><th>domain</th><th>risk</th><th class="num">L×I</th><th class="num">age</th><th>flags</th><th>status</th></tr></thead><tbody>' + rr.map(function (r) {
      return '<tr><td>' + domainChip(r.domain) + '</td><td>' + esc(r.title) + (r.mitigation ? '<div class="dim tiny-t">mitigation: ' + esc(r.mitigation) + '</div>' : '') + '</td>' +
        '<td class="num"><span class="score" style="--s:' + r.score + '">' + r.score + '</span></td><td class="num">' + days(r.ageDays) + '</td><td>' + (r.stale ? pill('due', 'needs review') : '<span class="dim">—</span>') + '</td>' +
        '<td><select class="mini" data-risk-status="' + esc(r.id) + '">' + ['open', 'mitigating', 'mitigated', 'accepted', 'closed'].map(function (st) { return '<option' + (st === r.status ? ' selected' : '') + '>' + st + '</option>'; }).join('') + '</select></td></tr>';
    }).join('') + '</tbody></table>' : '<p class="empty">No open risks.</p>';
    return h + '</section>';
  }

  // ================================================================= PLAYBOOKS
  const PB_TARGET = {};
  function fieldInput(f) {
    const nm = esc(f.name), val = (f.value === undefined || f.value === null) ? '' : f.value, req = f.required ? ' required' : '';
    if (f.type === 'textarea') return '<textarea name="' + nm + '" rows="2"' + req + '>' + esc(val) + '</textarea>';
    if (f.type === 'lines') return '<textarea name="' + nm + '" rows="3" placeholder="one per line"' + req + '>' + esc(val) + '</textarea>';
    if (f.type === 'select') return '<select name="' + nm + '"' + req + '>' + (f.required ? '' : '<option value=""></option>') + f.options.map(function (o) { return '<option' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
    if (f.type === 'checkbox') return '<label class="cbx"><input type="checkbox" name="' + nm + '"' + (val ? ' checked' : '') + '> yes</label>';
    if (f.type === 'multiselect') return '<div class="msel">' + f.options.map(function (o) { return '<label class="cbx"><input type="checkbox" name="' + nm + '" value="' + esc(o.value) + '"> ' + esc(o.label) + '</label>'; }).join('') + '</div>';
    if (f.type === 'date') return '<input type="date" name="' + nm + '" value="' + (typeof val === 'number' ? fmtD(val) : esc(val)) + '"' + req + '>';
    if (f.type === 'number') return '<input type="number" step="any" name="' + nm + '" value="' + esc(val) + '"' + req + '>';
    return '<input type="text" name="' + nm + '" value="' + esc(val) + '"' + req + '>';
  }
  function viewPlaybooks(ctx) {
    let h = '<section class="card"><header class="card-h"><h3>' + icon('play') + ' Interactive playbooks</h3><span class="dim">' + LeadOS.playbooks.INTERACTIVE.length + ' playbooks · prefill reads the log · submit appends events</span></header>' +
      '<p class="dim pad">Every value drawn from the log is marked <span class="pill pill-rec">recommended</span> and names its source. Anything the log does not know is listed as unknown and left blank — no playbook fills a gap with a guess.</p></section>';
    LeadOS.playbooks.INTERACTIVE.forEach(function (pb) {
      const cands = pb.candidates(ctx.state) || [];
      const chosen = PB_TARGET[pb.id] && cands.some(function (c) { return c.id === PB_TARGET[pb.id]; }) ? PB_TARGET[pb.id] : (cands.length ? cands[0].id : null);
      h += '<section class="card pbcard"><header class="card-h"><h3>' + icon('play') + ' ' + esc(pb.title) + '</h3><span class="dim">' + pb.forRules.map(function (r) { return '<span class="chip">' + r + '</span>'; }).join(' ') + '</span></header><p class="dim pad">' + esc(pb.blurb) + '</p>';
      if (!cands.length) { h += '<p class="empty">No eligible target in the log. Nothing is assumed, so this playbook stays closed.</p></section>'; return; }
      h += '<form class="inline-form" data-form="pb-target" data-id="' + esc(pb.id) + '"><span class="if-label">target</span><select name="target">' +
        cands.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === chosen ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') + '</select><button class="btn tiny" type="submit">load</button></form>';
      let pre;
      try { pre = pb.prefill({ today: ctx.now, targetId: chosen, settings: ctx.set }, ctx.state); }
      catch (err) { h += '<p class="empty">prefill error: ' + esc(err.message) + '</p></section>'; return; }
      if (!pre.ok) { h += '<p class="empty">' + esc(pre.reason) + '</p></section>'; return; }
      h += '<div class="pbfacts"><h4>' + esc(pre.title) + '</h4><table class="tbl slim"><tbody>' + pre.facts.map(function (f) {
        return '<tr><td class="dim">' + esc(f.label) + '</td><td><strong>' + esc(f.value) + '</strong></td><td class="dim mono tiny-t">' + esc(f.note || '') + '</td></tr>';
      }).join('') + '</tbody></table>';
      if (pre.missing.length) h += '<div class="unknowns"><span class="pill pill-unknown">not in the log</span>' + pre.missing.map(function (m) { return '<div>' + esc(m) + '</div>'; }).join('') + '</div>';
      h += '</div><form class="frm" data-form="pb-run" data-id="' + esc(pb.id) + '" data-target="' + esc(chosen) + '">' + pb.fields(pre).map(function (f) {
        return '<label class="pbfield"><span class="pbl">' + esc(f.label) + (f.required ? ' <i>*</i>' : '') + (f.recommended ? ' <span class="pill pill-rec">recommended</span>' : '') + '</span>' +
          fieldInput(f) + (f.source ? '<span class="pbsrc">' + esc(f.source) + '</span>' : '') + (f.hint ? '<span class="pbhint">' + esc(f.hint) + '</span>' : '') + '</label>';
      }).join('') + '<button class="btn primary" type="submit">' + icon('check') + ' append events</button></form></section>';
    });
    return h;
  }
  function readPlaybookForm(form, fields) {
    const v = {};
    fields.forEach(function (f) {
      if (f.type === 'multiselect') { v[f.name] = Array.prototype.slice.call(form.querySelectorAll('input[name="' + f.name + '"]:checked')).map(function (el) { return el.value; }); return; }
      const el = form.elements[f.name];
      if (!el) return;
      if (f.type === 'checkbox') { v[f.name] = !!el.checked; return; }
      const raw = String(el.value == null ? '' : el.value).trim();
      if (raw === '') { v[f.name] = undefined; return; }
      if (f.type === 'number') { const n = Number(raw); v[f.name] = isNaN(n) ? undefined : n; return; }
      if (f.type === 'date') { v[f.name] = new Date(raw + 'T12:00:00').getTime(); return; }
      if (f.type === 'lines') { v[f.name] = raw.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); return; }
      v[f.name] = raw;
    });
    return v;
  }

  // ================================================================= DATA
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
  function viewData(ctx) {
    const raw = ctx.raw, P = ctx.state, set = ctx.set;
    const expDomain = ui().exportDomain || '';
    const filtered = raw.events.filter(function (ev) { return !expDomain || (LeadOS.engine.eventDomain(ev, P) || 'system') === expDomain; });

    let h = '<section class="card"><header class="card-h"><h3>' + icon('sliders') + ' Settings</h3><span class="dim">derived per read · writes are events</span></header>' +
      '<p class="dim pad">Settings are never stored directly. Editing appends a <code>settings.changed</code> event; the current value is re-derived from the log on every read. The five v4 keys were backfilled by migration 3&gt;4 as repair events where no leader value existed.</p>' +
      '<table class="tbl"><thead><tr><th>key</th><th class="num">default</th><th class="num">current</th><th>source</th><th>set new value (days)</th></tr></thead><tbody>';
    Object.keys(LeadOS.store.ALL_SETTING_DEFAULTS).forEach(function (k) {
      let source = '<span class="dim">default · never set</span>';
      for (let i = raw.events.length - 1; i >= 0; i--) {
        const ev = raw.events[i];
        if (ev.type === 'settings.changed' && ev.payload.key === k) {
          source = ev.meta && ev.meta.repair ? '<span class="pill pill-repair">repair · ' + esc(ev.meta.migration) + '</span> <span class="mono dim">' + esc(ev.id) + '</span>' : '<span class="mono dim">' + esc(ev.id) + '</span>';
          break;
        }
      }
      const isV4 = LeadOS.store.V4_NEW_KEYS.indexOf(k) !== -1;
      h += '<tr class="' + (isV4 ? 'row-v4' : '') + '"><td class="mono">' + esc(k) + (isV4 ? ' <span class="pill pill-v4">v4</span>' : '') + '</td>' +
        '<td class="num dim">' + LeadOS.store.ALL_SETTING_DEFAULTS[k] + '</td><td class="num"><strong>' + set[k] + '</strong></td><td>' + source + '</td>' +
        '<td><form class="inline-form" data-form="set-setting" data-key="' + esc(k) + '"><input type="number" name="value" min="1" max="3650" value="' + set[k] + '" required><button class="btn tiny" type="submit">append</button></form></td></tr>';
    });
    h += '</tbody></table></section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('download') + ' Export</h3><span class="dim">domain-filtered · local file, no network</span></header>' +
      '<form class="inline-form" data-form="export-filter"><span class="if-label">domain</span><select name="domain">' +
      '<option value=""' + (expDomain === '' ? ' selected' : '') + '>all events (' + raw.events.length + ')</option>' +
      LeadOS.events.DOMAINS.map(function (d) {
        const n = raw.events.filter(function (ev) { return LeadOS.engine.eventDomain(ev, P) === d.id; }).length;
        return '<option value="' + d.id + '"' + (expDomain === d.id ? ' selected' : '') + '>' + esc(d.label) + ' (' + n + ')</option>';
      }).join('') +
      '<option value="system"' + (expDomain === 'system' ? ' selected' : '') + '>system / domain-less (' + raw.events.filter(function (ev) { return !LeadOS.engine.eventDomain(ev, P); }).length + ')</option>' +
      '</select><button class="btn tiny" type="submit">apply</button>' +
      '<button class="btn tiny primary" data-action="export" type="button">' + icon('download') + ' download ' + filtered.length + ' events</button></form>' +
      '<pre class="exportbox">' + esc(JSON.stringify({ schemaVersion: raw.schemaVersion, meta: raw.meta, filter: expDomain || 'all', events: filtered.slice(0, 6) }, null, 1)) + (filtered.length > 6 ? '\n… ' + (filtered.length - 6) + ' more events in the download' : '') + '</pre></section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('database') + ' Storage inspector</h3><span class="pill pill-ok">' + esc(LeadOS.store.KEY) + '</span></header>' +
      '<div class="insp"><div><span class="dim">root keys</span><code>' + Object.keys(raw).map(esc).join(', ') + '</code></div>' +
      '<div><span class="dim">meta</span><code>' + esc(JSON.stringify(raw.meta)) + '</code></div>' +
      '<div><span class="dim">payload</span><code>' + raw.events.length + ' events · ' + LeadOS.store.rawBytes() + ' bytes · schemaVersion ' + raw.schemaVersion + '</code></div>' +
      '<div><span class="dim">registry</span><code>' + Object.keys(LeadOS.events.REGISTRY).length + ' event types under contract</code></div>' +
      '<div><span class="dim">view state</span><code>sessionStorage ' + esc(UIK) + ' — never persisted to the log</code></div></div></section>';

    const sizeOf = function (v) { return Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0); };
    h += '<section class="card"><header class="card-h"><h3>' + icon('layers') + ' Projections</h3><span class="dim">' + LeadOS.engine.NAMED_PROJECTIONS.length + ' named · rebuilt on every read</span></header><div class="projgrid">' +
      LeadOS.engine.NAMED_PROJECTIONS.slice().sort().map(function (k) {
        const n = sizeOf(P[k]);
        return '<div class="projcell' + (n ? ' on' : '') + '"><span class="mono">' + esc(k) + '</span><b>' + n + '</b></div>';
      }).join('') + '</div></section>';

    h += '<section class="card"><header class="card-h"><h3>' + icon('list') + ' Event log</h3><span class="dim">append-only · showing ' + filtered.length + ' of ' + raw.events.length + '</span></header>' +
      '<table class="tbl"><thead><tr><th class="num">seq</th><th>id</th><th>at</th><th>domain</th><th>type</th><th>summary</th></tr></thead><tbody>' +
      filtered.slice().reverse().slice(0, 150).map(function (ev) {
        const d = LeadOS.engine.eventDomain(ev, P);
        return '<tr><td class="num mono">' + ev.seq + '</td><td class="mono dim">' + esc(ev.id) + '</td><td class="num dim">' + fmtD(ev.at) + ' ' + fmtT(ev.at) + '</td>' +
          '<td>' + (d ? domainChip(d) : '<span class="dim tiny-t">system</span>') + '</td><td>' + typeChip(ev) + '</td><td class="dim">' + esc(summarize(ev)) + '</td></tr>';
      }).join('') + '</tbody></table></section>';
    return h;
  }

  // ================================================================= HEALTH
  function findCheck(R, id) { return R.t.concat(R.g).find(function (r) { return r.id === id; }) || { pass: false }; }
  function suiteTable(title, rows) {
    return '<div class="suite"><h4>' + esc(title) + '</h4><table class="tbl slim"><tbody>' + rows.map(function (r) {
      return '<tr><td class="mono">' + r.id + '</td><td>' + esc(r.name) + '<div class="dim tiny-t">' + esc(r.detail) + '</div></td><td>' + pill(r.pass ? 'ok' : 'overdue', r.pass ? 'pass' : 'fail') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  function viewHealth() {
    const R = LAST_HEALTH;
    const pass = R.t.concat(R.g).filter(function (r) { return r.pass; }).length;
    let h = '<section class="card"><header class="card-h"><h3>' + icon('shield') + ' Authority wall</h3><div><span class="pill ' + (R.ok ? 'pill-ok' : 'pill-overdue') + '">' + pass + '/' + (R.t.length + R.g.length) + ' checks pass</span> <button class="btn tiny" data-action="run-health">' + icon('refresh') + ' re-run</button></div></header>' +
      '<p class="dim pad">T-suite proves behavior on pinned fixtures. G-suite inspects the live store at <code>leados:data</code>. The boot sequence runs G before rendering anything; a failed G check halts the app behind the wall.</p>' +
      '<div class="two-col">' + suiteTable('T-suite · fixtures (' + R.t.length + ')', R.t) +
      suiteTable('G-suite · live store G1–G12 + goldens G14–G30 (' + R.g.length + ')', R.g) + '</div></section>';
    h += '<section class="card"><header class="card-h"><h3>' + icon('activity') + ' Claim coverage</h3></header><table class="tbl"><thead><tr><th></th><th>claim</th><th>covered by</th><th>status</th></tr></thead><tbody>' +
      R.claims.map(function (c) {
        return '<tr><td class="mono dim">' + c.id + '</td><td>' + esc(c.text) + '</td><td>' + c.by.map(function (id) { return '<span class="pill ' + (findCheck(R, id).pass ? 'pill-ok' : 'pill-overdue') + '">' + id + '</span>'; }).join(' ') + '</td><td>' + pill(c.pass ? 'ok' : 'overdue', c.pass ? 'proven' : 'unproven') + '</td></tr>';
      }).join('') + '</tbody></table></section>';
    return h;
  }

  const VIEWS = {
    today: viewToday, signals: viewSignals, playbooks: viewPlaybooks, finance: viewFinance,
    sales: viewSales, ops: viewOps, strategy: viewStrategy, domains: viewDomains, roster: viewRoster,
    cadences: viewCadences, decisions: viewDecisions, risks: viewRisks, data: viewData, health: viewHealth
  };

  function render() {
    LAST_HEALTH = LeadOS.health.runAll();
    const ctx = read();
    const route = currentRoute();
    const groups = [];
    ROUTES.forEach(function (r) { if (!groups.length || groups[groups.length - 1].g !== r.group) groups.push({ g: r.group, items: [] }); groups[groups.length - 1].items.push(r); });
    $('#rail').innerHTML = groups.map(function (grp) {
      return '<div class="rail-g"><span class="rail-gl">' + esc(grp.g) + '</span>' + grp.items.map(function (r) {
        return '<a class="rail-b' + (route === r.id ? ' on' : '') + '" href="#/' + r.id + '">' + icon(r.icon) + '<span>' + esc(r.label) + '</span></a>';
      }).join('') + '</div>';
    }).join('');
    $('#sysline').innerHTML =
      '<span class="sys-pill">lineage pt</span><span class="sys-pill acc">' + esc(LeadOS.store.LINEAGE_TAG) + '</span>' +
      '<span class="sys-pill">schema v' + LeadOS.store.SCHEMA_VERSION + '</span>' +
      '<span class="sys-pill">' + ctx.raw.events.length + ' events</span>' +
      '<span class="sys-pill ' + (LAST_HEALTH.ok ? 'ok' : 'bad') + '">' + icon('shield') + (LAST_HEALTH.ok ? ' health ok' : ' health: failures') + '</span>';
    $('#view').innerHTML = VIEWS[route](ctx);
    document.title = 'LeadOS — ' + (ROUTES.find(function (r) { return r.id === route; }) || {}).label;
  }

  // ---- actions -------------------------------------------------------------
  const ACTIONS = {
    'complete-task': function (el) { LeadOS.store.append('task.completed', { id: el.dataset.id }); render(); },
    'apply-playbook': function (el) {
      const ctx = read();
      LeadOS.playbooks.apply(el.dataset.domain, { now: ctx.now, settings: ctx.set }).forEach(function (spec) { LeadOS.store.append(spec.type, spec.payload); });
      render();
    },
    'run-health': function () { render(); },
    'filter': function (el) { setUi({ filter: el.dataset.domain || null }); render(); },
    'dtab': function (el) { setUi({ domainTab: el.dataset.id }); render(); },
    'person': function (el) { setUi({ person: el.dataset.id }); if (currentRoute() !== 'roster') location.hash = '#/roster'; else render(); },
    'export': function () {
      const ctx = read(), f = ui().exportDomain || '';
      const events = ctx.raw.events.filter(function (ev) { return !f || (LeadOS.engine.eventDomain(ev, ctx.state) || 'system') === f; });
      const blob = new Blob([JSON.stringify({ schemaVersion: ctx.raw.schemaVersion, meta: ctx.raw.meta, exportedFilter: f || 'all', exportedAt: new Date().toISOString(), events: events }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'leados-' + (f || 'all') + '-' + fmtD(Date.now()) + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    },
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
      LeadOS.store.append('decision.proposed', { id: LeadOS.playbooks.uid('dec'), domain: f.domain.value, question: f.question.value.trim(), options: opts, owner: f.owner.value.trim(), reversibility: f.reversibility.value });
      f.reset(); render();
    },
    'decide': function (f) { LeadOS.store.append('decision.decided', { id: f.dataset.id, choice: f.choice.value, rationale: f.rationale.value.trim() }); render(); },
    'raise-risk': function (f) {
      LeadOS.store.append('risk.raised', { id: LeadOS.playbooks.uid('risk'), domain: f.domain.value, title: f.title.value.trim(), likelihood: Number(f.likelihood.value), impact: Number(f.impact.value), mitigation: f.mitigation.value.trim() || undefined });
      f.reset(); render();
    },
    'schedule-review': function (f) {
      LeadOS.store.append('review.scheduled', { id: LeadOS.playbooks.uid('rev'), kind: f.dataset.kind, dueAt: new Date(f.date.value + 'T12:00:00').getTime() });
      f.reset(); render();
    },
    'complete-review': function (f) { LeadOS.store.append('review.completed', { id: f.dataset.id, outcome: f.outcome.value, notes: f.notes.value.trim() || undefined }); render(); },
    'set-setting': function (f) { LeadOS.store.append('settings.changed', { key: f.dataset.key, value: Number(f.value.value) }); render(); },
    'export-filter': function (f) { setUi({ exportDomain: f.domain.value }); render(); },
    'capture': function (f) {
      const type = f.dataset.type;
      LeadOS.store.append(type, buildCapturePayload(f, type));
      f.reset(); render();
    },
    'pb-target': function (f) { PB_TARGET[f.dataset.id] = f.target.value; render(); },
    'pb-run': function (f) {
      const pb = LeadOS.playbooks.byId(f.dataset.id), ctx0 = read();
      const c = { today: ctx0.now, targetId: f.dataset.target, settings: ctx0.set };
      const pre = pb.prefill(c, ctx0.state);
      if (!pre.ok) throw new Error(pre.reason);
      const fields = pb.fields(pre), v = readPlaybookForm(f, fields);
      const missingReq = fields.filter(function (fd) { return fd.required && (v[fd.name] === undefined || (Array.isArray(v[fd.name]) && !v[fd.name].length)); });
      if (missingReq.length) throw new Error('required field empty: ' + missingReq.map(function (fd) { return fd.label; }).join(', '));
      pb.submit(v, c, pre).forEach(function (s) { LeadOS.store.append(s.type, s.payload); });
      LeadOS.store.append('playbook.applied', { id: LeadOS.playbooks.uid('pb'), domain: pb.domain, playbookId: 'interactive:' + pb.id });
      render();
    }
  };

  function onClick(ev) {
    const actEl = ev.target.closest('[data-action]');
    if (actEl && ACTIONS[actEl.dataset.action]) { ev.preventDefault(); try { ACTIONS[actEl.dataset.action](actEl); } catch (err) { showWallError(err.message); } }
  }
  function onSubmit(ev) {
    const f = ev.target.closest('[data-form]');
    if (f && FORMS[f.dataset.form]) { ev.preventDefault(); try { FORMS[f.dataset.form](f); } catch (err) { showWallError(err.message); } }
  }
  function onChange(ev) {
    const sel = ev.target.closest('[data-risk-status]');
    if (sel) { LeadOS.store.append('risk.statusChanged', { id: sel.dataset.riskStatus, status: sel.value }); render(); }
  }

  // ---- the wall ------------------------------------------------------------
  function showWall(items) {
    const w = $('#wall');
    w.innerHTML = '<div class="wall-card"><div class="wall-ic">' + icon('shield') + '</div>' +
      '<h2>Authority wall — inspection failed</h2>' +
      '<p>The inspection below failed. Nothing was written; the event log is untouched.</p>' +
      '<table class="tbl slim"><tbody>' + items.map(function (r) {
        return '<tr><td class="mono">' + r.id + '</td><td>' + esc(r.name) + '<div class="dim tiny-t">' + esc(r.detail) + '</div></td><td>' + pill(r.pass ? 'ok' : 'overdue', r.pass ? 'pass' : 'fail') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<button class="btn primary" data-action="rerun-gate">' + icon('refresh') + ' re-run inspection</button></div>';
    w.removeAttribute('hidden');
  }
  function showWallError(msg) { showWall([{ id: 'GX', name: 'runtime rejection', pass: false, detail: msg }]); }

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
    window.addEventListener('hashchange', function () { if (!$('#wall').hasAttribute('hidden')) return; render(); window.scrollTo(0, 0); });
    if (!location.hash) location.hash = '#/today';
    boot();
  });

  LeadOS.ui = { boot: boot, render: render, ROUTES: ROUTES, ROUTE_IDS: ROUTE_IDS, VIEWS: VIEWS, UIK: UIK, captureFields: captureFields, buildCapturePayload: buildCapturePayload, FILTERS: FILTERS, DOMAIN_TABS: DOMAIN_TABS };
})();
