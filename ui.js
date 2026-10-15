/* LeadOS pt-1 · js/ui.js — shell, router, views, health wall.
   One ranked column (Today) · Roster+dossier · Playbook forms · Health (T1–T13,
   G1–G11 executed at render against production code paths) · Data (export/import,
   key browser, audit, mutes, rule registry, seed/purge, settings).
   All user data goes through esc() or textContent — names are attack surface too. */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.ui = 'js/ui.js';

LEADOS.ui = (function () {
  'use strict';

  var E = {
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  };

  var ICONS = {
    today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    roster: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.5c2.2.4 3.6 1.9 4 4.5"/></svg>',
    playbooks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h10l4 4v12H5z"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>',
    health: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>',
    data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5.5" rx="7" ry="2.8"/><path d="M5 5.5v13c0 1.6 3.1 2.9 7 2.9s7-1.3 7-2.9v-13"/><path d="M5 12c0 1.6 3.1 2.9 7 2.9s7-1.3 7-2.9"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>'
  };
  function icon(n) { return '<span class="ic">' + (ICONS[n] || '') + '</span>'; }

  var _flash = null, _playCtx = {}, _route = { view: 'today', arg: null }, _rosterSel = null;

  /* go(): same-hash assignment fires no hashchange — re-render in place instead,
     or the submit confirmation and the engine re-rank paint a session late. */
  function go(hashOrRefreshIsFine) { if (location.hash === hashOrRefreshIsFine) refresh(); else location.hash = hashOrRefreshIsFine; }

  function P() { return LEADOS.events.project(LEADOS.store.state()); }
  function today() { return LEADOS.events.todayIso(); }
  function fmtD(iso) { return iso ? String(iso).slice(0, 10) : '—'; }
  function daysAgo(iso) { if (!iso) return '—'; var d = Math.floor((new Date(today()) - new Date(iso)) / 864e5); return isNaN(d) ? '—' : d + 'd ago'; }
  function glyph(v) { return '▁▂▃▄▅▆▇'[Math.max(0, Math.min(6, Math.round((Number(v) || 0) / 10 * 6)))]; }
  function spark(vals) { return vals.map(glyph).join(''); }
  function hours(min) { return (min / 60).toFixed(1) + 'h'; }

  function setFlash(msg, kind) { _flash = { msg: msg, kind: kind || 'ok' }; }

  /* ---------- boot ---------- */
  function boot(summary) {
    var st = LEADOS.store.state();
    LEADOS.store.onPill = function (status) {
      var pill = document.getElementById('pill');
      if (!pill) return;
      if (status === 'read-only') { pill.textContent = 'READ-ONLY'; pill.className = 'pill bad'; }
      else if (status === 'failed') { pill.textContent = 'WRITE FAILED'; pill.className = 'pill bad'; }
      else { pill.textContent = 'offline · saved'; pill.className = 'pill'; }
    };
    LEADOS.store.onPill(LEADOS.store.isReadOnly() ? 'read-only' : (st.meta.writeFailed ? 'failed' : 'ok'));

    window.addEventListener('hashchange', route);
    route(summary);
  }

  function route(bootSummary) {
    var h = (location.hash || '#/today').replace(/^#\//, '');
    var parts = h.split('/');
    _route.view = parts[0] || 'today';
    _route.arg = parts[1] ? decodeURIComponent(parts[1]) : null;
    if (['today', 'roster', 'playbooks', 'play', 'health', 'data'].indexOf(_route.view) < 0) _route.view = 'today';
    render(bootSummary);
  }
  function refresh() { render(); }

  function links() {
    var cur = _route.view === 'play' ? 'playbooks' : _route.view;
    var defs = [['today', 'Today'], ['roster', 'Roster'], ['playbooks', 'Playbooks'], ['health', 'Health'], ['data', 'Data']];
    return defs.map(function (d) {
      return '<a href="#/' + d[0] + '" class="' + (cur === d[0] ? 'on' : '') + '">' + icon(d[0]) + '<span>' + d[1] + '</span></a>';
    }).join('');
  }
  function render(bootSummary) {
    document.getElementById('rail-links').innerHTML = links();
    var el = document.getElementById('view');
    var html = '';
    if (bootSummary) html += bootBanner(bootSummary);
    if (_flash) { html += '<p class="flash ' + _flash.kind + '">' + E.esc(_flash.msg) + '</p>'; _flash = null; }
    if (LEADOS.store.isReadOnly()) html += '<section class="banner bad"><h2>Read-only boot</h2><p class="mono">' + E.esc(LEADOS.store.readOnlyWhy()) + '</p><p>Writes are hard-blocked in this build. Exporting from the newer build and importing here is NOT supported — that path would clobber a newer database.</p></section>';
    switch (_route.view) {
      case 'roster': html += vRoster(); break;
      case 'playbooks': html += vPlaybooks(); break;
      case 'play': html += vPlay(_route.arg); break;
      case 'health': html += vHealth(); break;
      case 'data': html += vData(); break;
      default: html += vToday();
    }
    el.innerHTML = html;
    bind();
    document.querySelectorAll('#view [data-focus]').forEach(function (n) { n.focus(); });
  }

  function bootBanner(s) {
    if (!s) return '';
    if (s.status === 'newer') return ''; /* read-only banner above covers it */
    if (s.quarantined) return '<section class="banner bad"><h2>Stored data could not be read</h2><p class="mono">status ' + E.esc(s.status) + ' → quarantined to <b>' + E.esc(s.qkey || 'WRITE-FAILED') + '</b>' + (s.note ? ' · ' + E.esc(s.note) : '') + '</p><p>The bytes are preserved untouched in the key browser at <a href="#/data">#/data</a>; you booted on a clean store. Nothing was deleted.</p></section>';
    if (s.status === 'repaired') return '<section class="banner"><h2>Data normalized on boot</h2><p class="mono">' + (s.repairs || []).map(E.esc).join('<br>') + '</p><p>Repairs are counted and printed; no rows were dropped.</p></section>';
    if (s.status === 'empty') return '<section class="banner"><h2>First boot</h2><p>Add your team at <a href="#/roster">#/roster</a>, or load the sample org at <a href="#/data">#/data</a> to watch every rule fire. No account, no network — the data is yours, in this browser.</p></section>';
    return '';
  }

  /* ---------- Today ---------- */
  function vToday() {
    var proj = P(), t = today();
    var res = LEADOS.engine.run(proj, t);
    var dstr = new Date().toUTCString().slice(0, 16);
    var h = '<header class="vh"><h1>Today</h1><p class="mono dim">' + E.esc(dstr) + ' · ' + res.findings.length + ' open · ' + res.muted.length + ' muted (<a href="#/data">#/data</a>) · ranked by ' + '<span class="mono">sev × conf</span></p></header>';
    h += quickCapture(proj);
    if (proj._skipped.missingTs + proj._skipped.danglingPerson + proj._skipped.danglingDecision + proj._skipped.danglingGoal + proj._skipped.danglingDelegation > 0) {
      h += '<p class="mono dim skip">projections skipped — bad ts: ' + proj._skipped.missingTs + ' · dangling person: ' + proj._skipped.danglingPerson + ' · decision: ' + proj._skipped.danglingDecision + ' · goal: ' + proj._skipped.danglingGoal + ' · delegation: ' + proj._skipped.danglingDelegation + ' · unknown type (kept, inert): ' + proj._skipped.unknownType + ' — counted, never guessed</p>';
    }
    if (!res.findings.length) {
      h += '<section class="empty"><h2>Nothing is on fire</h2><p>' + (proj.people.length ? 'The engine found no overdue cadences, dangling decisions, silent goals, feedback imbalances, delegation overloads, conflict patterns or burnout signals in what you’ve logged. That is a claim about your data, not about your team — keep the pulses and 1:1s coming.' : 'No people yet. A mentor with no data gives no advice — add your team, or load the sample org from <a href="#/data">#/data</a>.') + '</p></section>';
    }
    h += res.findings.map(function (f, i) { return findingHtml(f, i, proj); }).join('');
    return h;
  }

  function findingHtml(f, i, proj) {
    var h = '<article class="finding' + (f.rule === 'ENG' ? ' eng' : '') + '">';
    h += '<div class="fhead mono"><span class="rtag">' + E.esc(f.rule) + '</span><span>' + E.esc(LEADOS.engine.scoreText(f)) + '</span><span class="conf c-' + f.conf + '">' + f.conf.toUpperCase() + '</span><span class="frank">#' + (i + 1) + '</span></div>';
    h += '<h3>' + E.esc(f.title) + '</h3>';
    h += '<div class="basis mono">' + f.basis.map(function (b) { return '<p>· ' + E.esc(b) + '</p>'; }).join('') + '</div>';
    h += '<p class="confwhy mono dim">confidence ' + f.conf + ' — ' + E.esc(f.confWhy) + ' · sources: ' + (f.sources.length ? f.sources.map(E.esc).join(', ') : 'none (derived from absence)') + '</p>';
    h += '<div class="factions">';
    if (f.play) h += '<button class="btn acc" data-act="play" data-play="' + E.esc(f.play) + '" data-key="' + E.esc(f.key) + '">' + icon('arrow') + 'Open playbook</button>';
    h += '<button class="btn" data-act="snooze" data-key="' + E.esc(f.key) + '" data-title="' + E.esc(f.title) + '">Snooze 7d</button>';
    h += '<button class="btn ghost" data-act="dismiss" data-key="' + E.esc(f.key) + '" data-title="' + E.esc(f.title) + '">Dismiss</button>';
    h += '</div></article>';
    return h;
  }

  var QC_TYPES = {
    'oneonone.logged': { label: '1:1', person: 1, fields: [['note', 'Notes', 'textarea']] },
    'feedback.given': { label: 'Feedback', person: 1, fields: [['polarity', 'Polarity', 'selectpol'], ['note', 'Note', 'text']] },
    'pulse.recorded': { label: 'Pulse', person: 1, fields: [['load', 'Load 0–10', 'number'], ['mood', 'Mood 0–10', 'number'], ['measured', 'Measured (real reading)', 'checkbox']] },
    'decision.logged': { label: 'Decision', fields: [['title', 'Decision', 'text'], ['severity', 'Severity 1–5', 'number'], ['reviewDate', 'Review date', 'date']] },
    'goal.set': { label: 'Goal', fields: [['title', 'Goal', 'text'], ['ownerId', 'Owner', 'selectpersonopt']] },
    'delegation.assigned': { label: 'Delegation', person: 1, fields: [['task', 'Task', 'text'], ['level', 'Level 1–5', 'number'], ['checkInDate', 'Check-in', 'date']] },
    'conflict.logged': { label: 'Conflict', fields: [['aId', 'Party A', 'selectpersonopt'], ['bId', 'Party B', 'selectpersonopt'], ['text', 'What happened', 'text']] },
    'note.added': { label: 'Note', fields: [['note', 'Note', 'textarea']] }
  };

  function quickCapture(proj) {
    var opts = Object.keys(QC_TYPES).map(function (k) { return '<option value="' + k + '">' + QC_TYPES[k].label + '</option>'; }).join('');
    return '<section class="qc"><details><summary class="mono">+ quick capture <span class="dim">— every module shares this one event stream</span></summary>' +
      '<div class="qcform"><label class="mono">Type <select id="qc-type">' + opts + '</select></label><div id="qc-fields"></div>' +
      '<p class="err mono" id="qc-err"></p><button class="btn acc" id="qc-go">Append event</button></div></details></section>';
  }

  function qcFieldsHtml(type, proj) {
    var spec = QC_TYPES[type], h = '';
    if (spec.person) h += '<label class="mono">Person <select id="qc-person">' + personOpts(proj, false) + '</select></label>';
    spec.fields.forEach(function (f) {
      var id = 'qc-f-' + f[0];
      if (f[2] === 'textarea') h += '<label class="mono">' + f[1] + ' <textarea id="' + id + '" rows="3"></textarea></label>';
      else if (f[2] === 'selectpol') h += '<label class="mono">' + f[1] + ' <select id="' + id + '"><option value="positive">positive</option><option value="corrective">corrective</option></select></label>';
      else if (f[2] === 'selectpersonopt') h += '<label class="mono">' + f[1] + ' <select id="' + id + '"><option value="">—</option>' + personOpts(proj, true) + '</select></label>';
      else if (f[2] === 'checkbox') h += '<label class="mono chk"><input type="checkbox" id="' + id + '" checked> ' + f[1] + '</label>';
      else if (f[2] === 'date') h += '<label class="mono">' + f[1] + ' <input type="date" id="' + id + '"></label>';
      else if (f[2] === 'number') h += '<label class="mono">' + f[1] + ' <input type="number" id="' + id + '" min="0" max="10"></label>';
      else h += '<label class="mono">' + f[1] + ' <input type="text" id="' + id + '"></label>';
    });
    return h;
  }
  function personOpts(proj, skips) {
    return proj.people.filter(function (p) { return !p.archived && (skips || !p.reportsTo); })
      .map(function (p) { return '<option value="' + E.esc(p.id) + '">' + E.esc(p.name) + '</option>'; }).join('');
  }

  function qcCollect(type, proj) {
    var d = {}, err = null;
    function gv(id) { var n = document.getElementById('qc-f-' + id); return n ? n.value.trim() : ''; }
    var spec = QC_TYPES[type];
    if (spec.person) {
      var pn = document.getElementById('qc-person');
      if (pn && pn.value) d.personId = pn.value;
      else if (spec.person) err = 'person required';
    }
    spec.fields.forEach(function (f) {
      var k = f[0];
      if (f[2] === 'checkbox') { var c = document.getElementById('qc-f-' + k); d[k] = c ? !!c.checked : true; }
      else if (f[2] === 'number') { var v = gv(k); if (v !== '') d[k] = Number(v); }
      else { var v2 = gv(k); if (v2 !== '') d[k] = v2; }
    });
    if (type === 'goal.set') { d.goalId = 'g' + Date.now().toString(36); if (!d.title) err = 'goal title required'; }
    if (type === 'decision.logged' && !d.title) err = 'decision title required';
    if (type === 'conflict.logged' && !d.aId && !d.bId && !d.text) err = 'conflict: give at least one party or a line of text';
    if (type === 'pulse.recorded' && d.load == null && d.mood == null) err = 'pulse: load and/or mood required';
    if (type === 'sbi') {} /* quick SBI lives in the playbook — full form required there */
    return { data: d, err: err };
  }

  /* ---------- Roster ---------- */
  function vRoster() {
    var st = LEADOS.store.state(), proj = P(), t = today();
    var sl = LEADOS.events.spanLoad(st);
    var h = '<header class="vh"><h1>Roster</h1><p class="mono dim">' + st.people.filter(function (p) { return !p.archived; }).length + ' active · cadence = the 1:1 promise you made per person</p></header>';
    var over = sl.overBy > 0;
    h += '<section class="spanload' + (over ? ' over' : '') + '"><p class="mono">1:1 load — implied <b>' + hours(sl.impliedMin) + '/wk</b> (' + sl.perPerson.length + ' directs × ' + sl.lengthMin + 'min) vs capacity <input type="number" id="cap-min" value="' + sl.capacityMin + '" min="0" step="30"> min/wk ' +
      (over ? '<b class="acc">OVER by ' + hours(sl.overBy) + '</b> — R1 will keep punishing a promise the math says you can’t keep; cut cadence or cut scope, deliberately' : '<span class="dim">fits, with ' + hours(-sl.overBy) + ' slack</span>') + '</p>';
    h += '<p class="mono dim">' + sl.perPerson.map(function (x) { return E.esc(x.name) + ' ' + x.cadenceDays + 'd' + (x.assumed ? '(default)' : '') + ' → ' + x.minPerWeek + 'min'; }).join(' · ') + '</p></section>';

    h += '<section class="addperson"><details><summary class="mono">+ add person</summary><div class="qcform">' +
      '<label class="mono">Name <input type="text" id="ap-name"></label>' +
      '<label class="mono">Role <input type="text" id="ap-role" placeholder="Team lead · Platform"></label>' +
      '<label class="mono">1:1 cadence (days) <input type="number" id="ap-cad" min="1" max="60" placeholder="14"></label>' +
      '<label class="mono">Reports to <select id="ap-reports"><option value="">— direct to me —</option>' + personOpts(proj, false) + '</select></label>' +
      '<p class="err mono" id="ap-err"></p><button class="btn acc" id="ap-go">Add person</button></div></details></section>';

    h += '<table class="rows"><thead><tr class="mono dim"><th></th><th>Name</th><th>Cad</th><th>Last 1:1</th><th>Open del</th><th>SL</th><th>Pulse load</th></tr></thead><tbody>';
    var act = st.people.filter(function (p) { return !p.archived; });
    if (!act.length) h += '<tr><td colspan="7" class="dim">No people yet. Add above — or load the sample org at <a href="#/data">#/data</a>.</td></tr>';
    act.forEach(function (p) {
      var last = proj.oneononeLast[p.id];
      var dels = (proj.delegationsOpenByPerson[p.id] || []).length;
      var slx = proj.slByPerson[p.id];
      var loads = (proj.pulsesByPerson[p.id] || []).filter(function (x) { return x.measured !== false && typeof x.load === 'number'; }).slice(-8).map(function (x) { return x.load; });
      h += '<tr class="rowl" data-sel="' + E.esc(p.id) + '"><td class="mono dim">' + (p.reportsTo ? '↳ ' + E.esc((proj.peopleById[p.reportsTo] || {}).name || '?') : '·') + '</td><td>' + E.esc(p.name) + '<span class="dim"> ' + E.esc(p.role || '') + '</span></td><td class="mono">' + (p.cadenceDays || '—') + '</td><td class="mono">' + (last ? fmtD(last.ts) : 'never') + '</td><td class="mono">' + dels + '</td><td class="mono">' + (slx ? slx.d + '→' + slx.s : '—') + '</td><td class="mono spark">' + (loads.length ? spark(loads) : '<span class="dim">—</span>') + '</td></tr>';
    });
    h += '</tbody></table>';

    if (_rosterSel && proj.peopleById[_rosterSel]) h += dossier(proj.peopleById[_rosterSel], proj, t);
    return h;
  }

  function dossier(p, proj, t) {
    var h = '<section class="dossier"><h2>' + E.esc(p.name) + ' <span class="dim">' + E.esc(p.role || '') + '</span></h2>';
    var dels = proj.delegationsOpenByPerson[p.id] || [];
    var pulses = proj.pulsesByPerson[p.id] || [];
    var slx = proj.slByPerson[p.id];
    var fb = proj.feedbackByPerson[p.id] || [];
    h += '<div class="mono dim">added ' + fmtD(p.createdAt) + ' · cadence ' + (p.cadenceDays || '14 (default)') + ' · reports to ' + (p.reportsTo ? E.esc((proj.peopleById[p.reportsTo] || {}).name || '?') : 'you') + ' · 1:1s logged: ' + (proj.oneononeCount[p.id] || 0) + ' · feedback events: ' + fb.length + '</div>';
    h += '<p class="mono">SL readiness: ' + (slx ? slx.d + ' → ' + slx.s + ' (' + fmtD(slx.ts) + ')' : 'not assessed') + ' · open delegations: ' + dels.length + '</p>';
    if (dels.length) h += '<ul class="mono list">' + dels.map(function (d) { return '<li>L' + (d.level || '?') + ' — ' + E.esc(d.task) + ' · check-in ' + fmtD(d.checkInDate) + ' <button class="btn ghost sm" data-act="closedel" data-id="' + E.esc(d.id) + '">close</button></li>'; }).join('') + '</ul>';
    var meas = pulses.filter(function (x) { return x.measured !== false; });
    var est = pulses.length - meas.length;
    h += '<p class="mono">pulses: ' + meas.length + ' measured' + (est ? ' · ' + est + ' estimated (excluded from R7, counted)' : '') + (meas.length ? ' · load ' + spark(meas.slice(-10).map(function (x) { return x.load; })) + ' · mood ' + spark(meas.slice(-10).map(function (x) { return x.mood; })) : '') + '</p>';
    h += '<div class="pulseform mono">log pulse — load <input type="number" id="pu-load" min="0" max="10"> mood <input type="number" id="pu-mood" min="0" max="10"> <label class="chk"><input type="checkbox" id="pu-meas" checked> measured (not estimated)</label> <button class="btn sm" data-act="pulse" data-id="' + E.esc(p.id) + '">Log</button></div>';
    h += '<div class="factions"><button class="btn" data-act="playfor" data-play="oneonone" data-id="' + E.esc(p.id) + '">1:1 run sheet</button>' +
      '<button class="btn" data-act="playfor" data-play="sbi" data-id="' + E.esc(p.id) + '">SBI</button>' +
      '<button class="btn" data-act="playfor" data-play="delegation" data-id="' + E.esc(p.id) + '">Delegate</button>' +
      '<button class="btn" data-act="playfor" data-play="sl-assess" data-id="' + E.esc(p.id) + '">Assess SL</button>' +
      '<button class="btn ghost" data-act="archive" data-id="' + E.esc(p.id) + '">' + (p.archived ? 'Unarchive' : 'Archive') + '</button></div>';
    var mine = LEADOS.store.state().events.filter(function (e) { return e.data && (e.data.personId === p.id || e.data.aId === p.id || e.data.bId === p.id); }).slice(-8).reverse();
    if (mine.length) h += '<div class="basis mono">' + mine.map(function (e) { return '<p>· ' + fmtD(e.ts) + ' — ' + E.esc(e.type) + (e.data.note ? ' — ' + E.esc(String(e.data.note).slice(0, 80)) : '') + '</p>'; }).join('') + '</div>';
    h += '</section>';
    return h;
  }

  /* ---------- Playbooks ---------- */
  function vPlaybooks() {
    var h = '<header class="vh"><h1>Playbooks</h1><p class="mono dim">structured mentor moves — pre-filled from your data, resolving back into it</p></header>';
    h += LEADOS.playbooks.list().map(function (p) {
      return '<section class="pblist"><h3>' + E.esc(p.title) + (p.resolves.length ? ' <span class="rtag mono">' + p.resolves.join(' · ') + '</span>' : '') + '</h3><p class="dim">' + E.esc(p.tagline) + '</p><button class="btn acc" data-act="openpb" data-id="' + E.esc(p.id) + '">' + icon('arrow') + 'Open</button></section>';
    }).join('');
    return h;
  }

  function vPlay(id) {
    var pb = LEADOS.playbooks.get(id);
    if (!pb) return '<header class="vh"><h1>Playbook</h1><p class="err">unknown playbook "' + E.esc(id) + '"</p></header>';
    var proj = P();
    var ctx = _playCtx || {};
    var h = '<header class="vh"><h1>' + E.esc(pb.title) + '</h1><p class="mono dim">' + E.esc(pb.tagline) + '</p></header>';
    h += '<section class="why">' + pb.why.map(function (w) { return '<p>' + E.esc(w) + '</p>'; }).join('') + '</section>';
    pb.sections(ctx, proj).forEach(function (s) {
      h += '<section class="pbsec"><h4 class="mono">' + E.esc(s.h) + '</h4><div class="basis mono">' + s.mono.filter(Boolean).map(function (m) { return '<p>· ' + E.esc(m) + '</p>'; }).join('') + '</div></section>';
    });
    h += '<section class="pbform"><h4 class="mono">Execute — writes resolving events</h4>';
    pb.fields(ctx, proj).forEach(function (f) {
      var id = 'pb-' + f.key, req = f.required ? ' <b class="acc">*</b>' : '';
      h += '<label class="mono">' + E.esc(f.label) + req;
      if (f.type === 'textarea') h += '<textarea id="' + id + '" rows="' + (f.rows || 3) + '">' + E.esc(f.value || '') + '</textarea>';
      else if (f.type === 'select') h += '<select id="' + id + '">' + [{ v: '', t: '—' }].concat(f.options || []).map(function (o) { return '<option value="' + E.esc(o.v) + '"' + (String(o.v) === String(f.value || '') ? ' selected' : '') + '>' + E.esc(o.t) + '</option>'; }).join('') + '</select>';
      else if (f.type === 'checkbox') h += ' <input type="checkbox" id="' + id + '"' + (f.value ? ' checked' : '') + '>';
      else if (f.type === 'date') h += '<input type="date" id="' + id + '" value="' + E.esc(f.value || '') + '">';
      else if (f.type === 'number') h += '<input type="number" id="' + id + '" value="' + E.esc(f.value || '') + '">';
      else h += '<input type="text" id="' + id + '" value="' + E.esc(f.value || '') + '">';
      if (f.help) h += '<span class="dim help">' + E.esc(f.help) + '</span>';
      h += '</label>';
    });
    h += '<p class="err mono" id="pb-err"></p><div class="factions"><button class="btn acc" data-act="pbsubmit" data-id="' + E.esc(id) + '">Log it</button><a class="btn ghost" href="#/today">Cancel</a></div></section>';
    return h;
  }

  /* ---------- Health ---------- */
  function vHealth() {
    var S = LEADOS.store, V = LEADOS.events, N = LEADOS.engine;
    var rows = [];
    function T(id, name, expected, fn) {
      var r;
      try { r = fn(); } catch (e) { r = { pass: false, observed: 'threw: ' + (e && e.message || e) }; }
      rows.push({ id: id, name: name, expected: expected, observed: r.observed, pass: !!r.pass });
    }

    T('T1', 'module registry: every expected module registered itself', 'store, events, engine, playbooks, ui',
      function () { var need = ['store', 'events', 'engine', 'playbooks', 'ui']; var have = need.filter(function (m) { return !!LEADOS._mod[m]; });
        return { pass: have.length === need.length, observed: have.join(', ') }; });

    T('T2', 'canonical roundtrip: serialize live state → parseLoad → identical', 'status ok/—, bytes round-trip',
      function () { var c = S.canonical(S.state()); var r = S.parseLoad(c);
        return { pass: (r.status === 'ok' || r.status === 'repaired') && S.canonical(r.state) === c, observed: 'status ' + r.status + ', equal ' + (r.state ? S.canonical(r.state) === c : 'n/a') }; });

    T('T3', 'corrupt bytes → quarantined, fresh boot, live key untouched', 'status corrupt + quarantine key exists',
      function () { try { localStorage.setItem('leados:t3', '{bad'); } catch (e) { return { pass: false, observed: 'setItem blocked: ' + e.message }; }
        var r = S.loadFromKey('leados:t3');
        var qk = S.quarantineKeys().filter(function (k) { return k.key.indexOf('leados:t3:quarantine:corrupt:') === 0; });
        S.sweepDisposable();
        return { pass: r.status === 'corrupt' && qk.length === 1 && r.state && r.state.people.length === 0, observed: 'status ' + r.status + ' · quarantine keys ' + qk.length + ' · qkey swept after' }; });

    T('T4', 'valid JSON, wrong shape → malformed + quarantined', '"[]" → malformed',
      function () { localStorage.setItem('leados:t4', '[]'); var r = S.loadFromKey('leados:t4'); S.sweepDisposable();
        return { pass: r.status === 'malformed', observed: r.status }; });

    T('T5', 'foreign lineage → refused + quarantined', 'lineage "mf"/other → foreign',
      function () { localStorage.setItem('leados:t5', JSON.stringify({ meta: { schemaVersion: 1, lineage: 'mf' }, people: [], events: [] })); var r = S.loadFromKey('leados:t5'); S.sweepDisposable();
        return { pass: r.status === 'foreign', observed: r.status + (r.note ? ' — ' + r.note : '') }; });

    T('T6', 'newer schema → read-only, bytes byte-identical after', 'v99 → readOnly, raw unchanged',
      function () { var blob = JSON.stringify({ meta: { schemaVersion: 99, lineage: 'pt' }, people: [], events: [] }); localStorage.setItem('leados:t6', blob);
        var r = S.loadFromKey('leados:t6'); var after = localStorage.getItem('leados:t6'); S.sweepDisposable();
        return { pass: r.status === 'newer' && r.readOnly === true && after === blob, observed: 'status ' + r.status + ' · readOnly ' + r.readOnly + ' · bytes identical ' + (after === blob) }; });

    T('T7', 'normalize repairs malformed rows, drops nothing, counts everything', 'name 42 coerced · junk ts nulled · rows kept',
      function () { var bad = JSON.stringify({ meta: { schemaVersion: 1, lineage: 'pt' }, people: [{ name: 42 }], events: [{ type: 99, ts: 'junk' }] });
        var r = S.parseLoad(bad);
        return { pass: r.status === 'repaired' && r.repairs.length >= 2 && r.state.people.length === 1 && r.state.events.length === 1,
          observed: 'status ' + r.status + ' · repairs ' + r.repairs.length + ' · people ' + r.state.people.length + ' · events ' + r.state.events.length }; });

    T('T8', 'import refusals in order: unparseable / malformed / foreign / newer / identical', 'five refusals, five verdicts',
      function () { var a = S.planImport('{bad').verdict; var b = S.planImport('{}').verdict;
        var c = S.planImport(JSON.stringify({ meta: { schemaVersion: 1, lineage: 'x' }, people: [], events: [] })).verdict;
        var d = S.planImport(JSON.stringify({ meta: { schemaVersion: 99, lineage: 'pt' }, people: [], events: [] })).verdict;
        var e = S.planImport(S.exportText()).verdict;
        return { pass: a === 'unparseable' && b === 'malformed' && c === 'foreign' && d === 'newer' && e === 'identical', observed: a + ' · ' + b + ' · ' + c + ' · ' + d + ' · ' + e }; });

    T('T9', 'import merge (pure mergeInto): ids re-minted, reportsTo + personId rewired, dangling nulled+counted', 'p2.reportsTo = NEW p1 id; ghost ref nulled',
      function () { var tgt = S.freshState();
        var inc = { meta: { schemaVersion: 1, lineage: 'pt', audit: [], settings: {} },
          people: [{ id: 'p1', name: 'Lead', reportsTo: null, archived: false, createdAt: null }, { id: 'p2', name: 'Skip', reportsTo: 'p1', archived: false, createdAt: null }],
          events: [{ id: 'e1', ts: new Date().toISOString(), type: 'oneonone.logged', data: { personId: 'p2', note: 'n' } }, { id: 'e2', ts: new Date().toISOString(), type: 'oneonone.logged', data: { personId: 'ghost' } }] };
        var stats = S.mergeInto(tgt, inc);
        var lead = tgt.people.filter(function (p) { return p.name === 'Lead'; })[0];
        var skip = tgt.people.filter(function (p) { return p.name === 'Skip'; })[0];
        var okWire = skip && lead && skip.reportsTo === lead.id && lead.id !== 'p1';
        var ghost = tgt.events.filter(function (e) { return e.data.personId === null; }).length;
        return { pass: okWire && ghost === 1 && stats.relinkFails >= 1, observed: 'reportsTo rewired ' + okWire + ' · ghost nulled ' + ghost + ' · relinkFails ' + stats.relinkFails }; });

    T('T10', 'quota: setItem throws → save() swallows, pill path flips, in-memory intact', 'save false during fault, true after',
      function () { var orig = localStorage.setItem, during, after, failed;
        try { localStorage.setItem = function () { throw new Error('injected quota fault'); }; during = S.save(); failed = S.state().meta.writeFailed === true; }
        finally { localStorage.setItem = orig; }
        after = S.save();
        return { pass: during === false && failed === true && after === true && S.state().meta.writeFailed === false, observed: 'during ' + during + ' · writeFailed ' + failed + ' · after ' + after }; });

    T('T11', 'audit log caps at ' + S.AUDIT_CAP + ' and the cap leaves a row', '305 appends → 300 rows + trim marker',
      function () { var st = S.freshState(); for (var i = 0; i < 305; i++) S._auditState(st, 'flood', String(i));
        var marker = st.meta.audit.some(function (a) { return a.action === 'audit-cap-trimmed'; });
        return { pass: st.meta.audit.length === S.AUDIT_CAP && marker, observed: 'rows ' + st.meta.audit.length + ' · trim marker ' + marker }; });

    T('T12', 'seed fires every rule ≥once; purge removes rows, keeps flag; re-seed refuses', 'R1–R7 all present → 0 rows left · seeded true',
      function () { var st = S.freshState(); var r1 = V.seed(st, V.todayIso());
        var res = N.run(V.project(st), V.todayIso());
        var fired = {}; res.findings.forEach(function (f) { fired[f.rule] = 1; });
        var all7 = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'].every(function (x) { return fired[x]; });
        var pg = V.purge(st);
        var again = V.seed(st, V.todayIso());
        return { pass: !r1.skipped && all7 && st.people.length === 0 && st.events.length === 0 && st.meta.seeded === true && again.skipped === true,
          observed: 'rules fired: ' + Object.keys(fired).sort().join(',') + ' · purged ' + pg.people + 'p/' + pg.events + 'e · reseed skipped ' + again.skipped }; });

    T('T13', 'dangling/malformed rows skipped + counted, never guessed', 'ghost person, orphan outcome, null ts → 3 counters',
      function () { var st = S.freshState();
        st.events = [{ id: 'e1', ts: new Date().toISOString(), type: 'oneonone.logged', data: { personId: 'ghost' } },
          { id: 'e2', ts: new Date().toISOString(), type: 'decision.outcome', data: { decisionId: 'nope' } },
          { id: 'e3', ts: null, type: 'note.added', data: {} }];
        var pr = V.project(st);
        return { pass: pr._skipped.danglingPerson === 1 && pr._skipped.danglingDecision === 1 && pr._skipped.missingTs === 1, observed: JSON.stringify(pr._skipped) }; });

    var gpass = 0, grows = [];
    N.golden.forEach(function (gt) {
      var r;
      try { r = gt.fn(); } catch (e) { r = { pass: false, observed: 'threw: ' + (e && e.message || e), expected: '—' }; }
      if (r.pass) gpass++;
      grows.push({ id: gt.id, name: gt.desc, expected: r.expected, observed: r.observed, pass: !!r.pass });
    });
    S.sweepDisposable();
    var tpass = rows.filter(function (r) { return r.pass; }).length;

    var h = '<header class="vh"><h1>Health</h1><p class="mono dim">the authority wall — executed NOW at render, against the code paths production uses. Where prose and this wall disagree, this wall wins.</p></header>';
    h += '<p class="mono wallsum' + (tpass + gpass === rows.length + grows.length ? '' : ' bad') + '">T: ' + tpass + '/' + rows.length + ' · G: ' + gpass + '/' + grows.length + ' · disposable leados:t* keys swept after each test</p>';
    h += '<table class="rows wall"><thead><tr class="mono dim"><th>ID</th><th>Assertion</th><th>Expected</th><th>Observed</th><th></th></tr></thead><tbody>';
    rows.concat(grows).forEach(function (r) {
      h += '<tr class="' + (r.pass ? 'pass' : 'fail') + '"><td class="mono">' + r.id + '</td><td>' + E.esc(r.name) + '</td><td class="mono dim">' + E.esc(String(r.expected)) + '</td><td class="mono">' + E.esc(String(r.observed)) + '</td><td class="mono ' + (r.pass ? 'ok' : 'bad') + '">' + (r.pass ? 'PASS' : 'FAIL') + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<p class="mono dim">Not graded here: UI rendering, browser automation, fuzzing. This wall is fixture-based assertions on real code paths — stated, not implied.</p>';
    return h;
  }

  /* ---------- Data ---------- */
  function vData() {
    var st = LEADOS.store.state(), S = LEADOS.store, proj = P();
    var fp = S.footprint();
    var pct = Math.min(100, Math.round(fp.bytes / fp.quota * 100));
    var res = LEADOS.engine.run(proj, today());
    var h = '<header class="vh"><h1>Data</h1><p class="mono dim">one key · one lineage · nothing leaves this browser</p></header>';

    h += '<section><h4 class="mono">Storage</h4><div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<p class="mono dim">' + fp.bytes.toLocaleString() + ' B of ~' + fp.quota.toLocaleString() + ' B assumed budget (labeled assumption) · ' + pct + '% · write failures: ' + fp.writeFailures + '</p>' +
      '<p class="mono">key <b>' + S.KEY + '</b> · schema v' + S.SCHEMA + ' · lineage "' + S.LINEAGE + '" · audit rows ' + st.meta.audit.length + '/' + S.AUDIT_CAP + '</p></section>';

    h += '<section><h4 class="mono">Backup</h4><div class="factions"><button class="btn acc" data-act="export">Export JSON</button></div>' +
      '<p class="dim">Import refuses, in order: unparseable · malformed · foreign lineage · newer schema · byte-identical. Older same-lineage versions migrate first. Merges re-mint every id and rewire every reference; the live bytes are snapshotted <span class="mono">pre-import</span> first.</p>' +
      '<label class="mono">Import JSON <textarea id="imp-text" rows="5" placeholder="paste export here, or choose a file below"></textarea></label>' +
      '<input type="file" id="imp-file" accept="application/json,.json">' +
      '<div class="factions"><button class="btn" data-act="import-check">Check</button><button class="btn acc" data-act="import-go" id="imp-go" disabled>Merge</button></div>' +
      '<p class="mono" id="imp-out"></p></section>';

    h += '<section><h4 class="mono">Sample org</h4><div class="factions"><button class="btn" data-act="seed">Load sample set</button><button class="btn ghost" data-act="purge">Purge sample rows</button></div>' +
      '<p class="mono dim">5 people · 43 events · fires R1–R7 at least once (asserted by T12). Purge removes seed rows, keeps the no-reseed flag.</p></section>';

    h += '<section><h4 class="mono">Capacity settings</h4><label class="mono">Weekly 1:1 capacity (min) <input type="number" id="set-cap" value="' + st.meta.settings.weeklyOneOnOneCapacityMin + '" min="0" step="30"></label>' +
      '<label class="mono">Default 1:1 length (min) <input type="number" id="set-len" value="' + st.meta.settings.oneOnOneLengthMin + '" min="15" step="5"></label>' +
      '<button class="btn" data-act="savesettings">Save settings</button></section>';

    h += '<section><h4 class="mono">Muted findings (' + res.muted.length + ')</h4>';
    if (!res.muted.length) h += '<p class="dim mono">none — suppression is events: auditable and reversible</p>';
    else h += res.muted.map(function (m) { return '<p class="mono">' + E.esc(m.f.key) + ' — ' + E.esc(m.f.title) + ' <span class="dim">(' + E.esc(m.why) + ')</span> <button class="btn ghost sm" data-act="unmute" data-key="' + E.esc(m.f.key) + '">unmute</button></p>'; }).join('');
    h += '</section>';

    h += '<section><h4 class="mono">Rule registry</h4><table class="rows"><tbody>' +
      LEADOS.engine.RULES_META.map(function (r) { return '<tr><td class="mono rtag">' + r.id + '</td><td>' + r.tag + '</td><td class="mono dim">' + E.esc(r.params) + '</td><td class="mono">→ ' + r.play + '</td></tr>'; }).join('') + '</tbody></table></section>';

    h += '<section><h4 class="mono">Key browser (read-only)</h4>';
    var qks = S.quarantineKeys();
    if (!qks.length) h += '<p class="dim mono">no quarantine keys — nothing has ever gone wrong on this install, or it was cleaned up elsewhere</p>';
    else h += qks.map(function (q) { return '<details class="qkey"><summary class="mono">' + E.esc(q.key) + ' <span class="dim">· ' + q.bytes.toLocaleString() + ' B · ' + E.esc(q.kind) + '</span></summary><pre class="mono">' + E.esc((S.readKey(q.key) || '').slice(0, 400)) + '…</pre></details>'; }).join('');
    h += '</section>';

    h += '<section><h4 class="mono">Audit log (latest 40 of ' + st.meta.audit.length + ')</h4><div class="basis mono">' +
      st.meta.audit.slice(-40).reverse().map(function (a) { return '<p>· ' + E.esc(a.ts.slice(0, 19)) + ' #' + a.seq + ' ' + E.esc(a.action) + (a.detail ? ' — ' + E.esc(String(a.detail).slice(0, 120)) : '') + '</p>'; }).join('') + '</div></section>';
    return h;
  }

  /* ---------- binding ---------- */
  function bind() {
    var view = document.getElementById('view');
    var proj;
    view.querySelectorAll('[data-act]').forEach(function (n) {
      n.addEventListener('click', function (ev) {
        var act = n.getAttribute('data-act');
        var key = n.getAttribute('data-key');
        var title = n.getAttribute('data-title') || key;
        var i;
        /* flash FIRST, append SECOND: append triggers the re-render, so the flash
           must already be set or it paints a frame behind and surfaces only after
           the next unrelated render (verified by reading the render path, pt-1). */
        if (act === 'snooze') { setFlash('Snoozed 7d — suppression is an event; unmute at #/data'); LEADOS.events.append('engine.snoozed', { key: key, until: new Date(Date.now() + 7 * 864e5).toISOString(), title: title }); }
        else if (act === 'dismiss') { setFlash('Dismissed — reversible at #/data'); LEADOS.events.append('engine.dismissed', { key: key, title: title }); }
        else if (act === 'unmute') { setFlash('Unmuted'); LEADOS.events.append('engine.unmuted', { key: key }); }
        else if (act === 'play') {
          _playCtx = findingCtx(key);
          location.hash = '#/play/' + n.getAttribute('data-play');
        }
        else if (act === 'playfor') { _playCtx = { personId: n.getAttribute('data-id') }; location.hash = '#/play/' + n.getAttribute('data-play'); }
        else if (act === 'openpb') { _playCtx = {}; location.hash = '#/play/' + n.getAttribute('data-id'); }
        else if (act === 'closedel') { setFlash('Delegation closed — R5 recounts on render'); LEADOS.events.append('delegation.closed', { delegationId: n.getAttribute('data-id'), result: 'closed from dossier' }); }
        else if (act === 'pulse') {
          var load = document.getElementById('pu-load').value, mood = document.getElementById('pu-mood').value, meas = document.getElementById('pu-meas').checked;
          if (load === '' && mood === '') { setFlash('pulse needs load and/or mood', 'err'); refresh(); return; }
          setFlash('Pulse logged' + (meas ? '' : ' (estimated — excluded from R7, counted)'));
          LEADOS.events.append('pulse.recorded', { personId: n.getAttribute('data-id'), load: load === '' ? null : Number(load), mood: mood === '' ? null : Number(mood), measured: meas });
        }
        else if (act === 'archive') {
          var st = LEADOS.store.state(), pid = n.getAttribute('data-id'), nm = pid;
          for (i = 0; i < st.people.length; i++) if (st.people[i].id === pid) { st.people[i].archived = !st.people[i].archived; nm = st.people[i].name + (st.people[i].archived ? ' archived' : ' unarchived'); }
          LEADOS.store.auditLive('person.archive-toggled', pid); setFlash(nm + ' — events retained; rules now skip this person'); LEADOS.store.save(); refresh();
        }
        else if (act === 'export') { doExport(); }
        else if (act === 'import-check') { importCheck(); }
        else if (act === 'import-go') { importGo(); }
        else if (act === 'seed') { var r = LEADOS.events.seed(LEADOS.store.state(), today()); LEADOS.store.save(); setFlash(r.note || 'seeded'); refresh(); }
        else if (act === 'purge') { var pg = LEADOS.events.purge(LEADOS.store.state()); LEADOS.store.save(); setFlash('Purged ' + pg.people + ' people, ' + pg.events + ' events'); refresh(); }
        else if (act === 'savesettings') {
          var c = Number(document.getElementById('set-cap').value), l = Number(document.getElementById('set-len').value);
          if (c >= 0 && l >= 15) { LEADOS.store.state().meta.settings.weeklyOneOnOneCapacityMin = c; LEADOS.store.state().meta.settings.oneOnOneLengthMin = l; LEADOS.store.save(); setFlash('Settings saved'); refresh(); }
        }
        else if (act === 'pbsubmit') { pbSubmit(n.getAttribute('data-id')); }
      });
    });

    view.querySelectorAll('.rowl').forEach(function (r) {
      r.addEventListener('click', function () { _rosterSel = r.getAttribute('data-sel') === _rosterSel ? null : r.getAttribute('data-sel'); refresh(); });
    });

    var qcType = document.getElementById('qc-type');
    if (qcType) {
      proj = P();
      var fill = function () { document.getElementById('qc-fields').innerHTML = qcFieldsHtml(qcType.value, proj); };
      qcType.addEventListener('change', fill); fill();
      document.getElementById('qc-go').addEventListener('click', function () {
        var col = qcCollect(qcType.value, proj);
        if (col.err) { document.getElementById('qc-err').textContent = col.err; return; }
        var r = LEADOS.events.append(qcType.value, col.data);
        if (r.error) { document.getElementById('qc-err').textContent = r.error; return; }
        setFlash(QC_TYPES[qcType.value].label + ' appended as ' + r.id + ' — engine re-ranks now');
      });
    }

    var apGo = document.getElementById('ap-go');
    if (apGo) apGo.addEventListener('click', function () {
      var name = document.getElementById('ap-name').value.trim();
      if (!name) { document.getElementById('ap-err').textContent = 'name required'; return; }
      var cad = document.getElementById('ap-cad').value;
      var st = LEADOS.store.state();
      st.people.push({ id: LEADOS.store.mint('p'), name: name, role: document.getElementById('ap-role').value.trim(), cadenceDays: cad === '' ? null : Number(cad), reportsTo: document.getElementById('ap-reports').value || null, archived: false, createdAt: new Date().toISOString() });
      LEADOS.store.auditLive('person.added', name); LEADOS.store.save(); setFlash(name + ' added — cadence clock starts now (R1 watches from createdAt)'); _rosterSel = null; go('#/roster');
    });

    var cap = document.getElementById('cap-min');
    if (cap) cap.addEventListener('change', function () {
      var v = Number(cap.value);
      if (v >= 0) { LEADOS.store.state().meta.settings.weeklyOneOnOneCapacityMin = v; LEADOS.store.save(); refresh(); }
    });

    var impFile = document.getElementById('imp-file');
    if (impFile) impFile.addEventListener('change', function () {
      var f = impFile.files && impFile.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { document.getElementById('imp-text').value = String(rd.result || ''); importCheck(); };
      rd.readAsText(f);
    });
  }

  function findingCtx(key) {
    var proj = P(), res = LEADOS.engine.run(proj, today()), i, f = null;
    for (i = 0; i < res.findings.length; i++) if (res.findings[i].key === key) f = res.findings[i];
    var ctx = { finding: f };
    if (!f) return ctx;
    var pid = key.split(':')[1];
    if (proj.peopleById[pid]) ctx.personId = pid;
    if (f.rule === 'R2') ctx.decisionId = key.slice(3);
    if (f.rule === 'R3') ctx.goalId = key.slice(4);
    if (f.rule === 'R6') { var pk = key.slice(3); var c = proj.openConflicts.filter(function (x) { return x.pairKey === pk; })[0]; if (c) { ctx.aId = c.aId || ''; ctx.bId = c.bId || ''; } }
    return ctx;
  }

  function pbSubmit(id) {
    var pb = LEADOS.playbooks.get(id);
    var vals = {};
    pb.fields(_playCtx || {}, P()).forEach(function (f) {
      var n = document.getElementById('pb-' + f.key);
      if (!n) return;
      vals[f.key] = f.type === 'checkbox' ? !!n.checked : n.value.trim();
    });
    var r = pb.submit(vals, _playCtx || {});
    if (r.error) { document.getElementById('pb-err').textContent = r.error; return; }
    _playCtx = {};
    setFlash(r.summary);
    go('#/today');
  }

  function doExport() {
    var blob = new Blob([LEADOS.store.exportText()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'leados-export-' + today().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    LEADOS.store.auditLive('exported', 'download'); LEADOS.store.save();
  }

  var _pendingImport = null;
  function importCheck() {
    var text = document.getElementById('imp-text').value;
    var plan = LEADOS.store.planImport(text);
    var out = document.getElementById('imp-out');
    var go = document.getElementById('imp-go');
    if (plan.verdict === 'mergeable') {
      _pendingImport = plan.incoming;
      out.textContent = 'verdict: mergeable — ' + plan.note + '. Live bytes will be snapshotted pre-import. Merge re-mints every id.';
      go.disabled = false;
    } else {
      _pendingImport = null; go.disabled = true;
      out.textContent = 'verdict: ' + plan.verdict + (plan.note ? ' — ' + plan.note : '');
    }
  }
  function importGo() {
    if (!_pendingImport) return;
    var stats = LEADOS.store.applyImport(_pendingImport);
    _pendingImport = null;
    if (stats.error) { setFlash(stats.error, 'err'); }
    else setFlash('Merged: +' + stats.peopleAdded + ' people, +' + stats.eventsAdded + ' events, ' + stats.relinkFails + ' unresolved refs nulled (printed, not guessed)');
    refresh();
  }

  return { boot: boot, refresh: refresh };
})();
