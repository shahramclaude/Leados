/* LeadOS mf-1 · js/ui.js — view layer. Single delegated listener, string-built
   views, hash router. Known doctrine in view: nothing derived is persisted;
   finding rows close the loop by pre-filling the exact event that resolves
   them, so the engine recomputes on the very next render. */
window.LEADOS = window.LEADOS || {};
(function () {
  'use strict';
  var S = LEADOS.store, EV = LEADOS.events, EN = LEADOS.engine;
  var DB = S.makeStore('leados:data');
  var TEST_PREFIX = 'leados:test';

  var ui = { route: 'today', captureOpen: false, captureType: 'oneonone.logged', prefill: null, importResult: null };
  var flash = null;

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function todayDate() { return new Date().toISOString().slice(0, 10); }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function saveState() {
    var r = DB.save();
    if (r && r.quota) flash = { msg: 'WRITE FAILED — quota exhausted. State is in memory only; export from #/data now.', err: true };
  }

  var IC = {
    cal: '<rect x="2" y="3" width="12" height="11"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/>',
    user: '<circle cx="8" cy="5" r="3"/><path d="M2.5 14c1-3 3.6-4.5 5.5-4.5s4.5 1.5 5.5 4.5"/>',
    pulse: '<path d="M1 8.5h3.5l1.5-5 3 10 1.5-5H14"/>',
    diamond: '<rect x="4.2" y="4.2" width="7.6" height="7.6" transform="rotate(45 8 8)"/>',
    flag: '<path d="M4 14.5V1.5h8L9.5 5 12 8.5H4"/>',
    scale: '<path d="M8 2v9.5M4.5 12h7M3 5h10"/><path d="M3 5L1.5 9.2h3L3 5zM13 5l-1.5 4.2h3L13 5z"/>',
    layers: '<path d="M8 1.5l6.5 3L8 7.5 1.5 4.5 8 1.5z"/><path d="M1.5 8.5L8 11.5l6.5-3M1.5 12L8 15l6.5-3"/>',
    bolt: '<path d="M9 1L3 9.2h4l-1 5.8L13.5 7H9.5l1-6z"/>',
    warn: '<path d="M8 1.5L15 14H1L8 1.5z"/><path d="M8 6.5v3.5M8 12v.3"/>',
    check: '<path d="M2 8.5l4 4.2L14 3"/>',
    plus: '<path d="M8 2v12M2 8h12"/>',
    dl: '<path d="M8 1.5V10M4.5 6.7L8 10.2l3.5-3.5M2 13.5h12"/>',
    ul: '<path d="M8 10.5V2M4.5 5.3L8 1.8l3.5 3.5M2 13.5h12"/>',
    trash: '<path d="M3 4h10l-.8 9.5H3.8L3 4zM1.8 4h12.4M6 4V1.8h4V4"/>',
    info: '<circle cx="8" cy="8" r="6.5"/><path d="M8 7.4v3.6M8 4.8v.2"/>'
  };
  function ic(n) { return '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">' + (IC[n] || '') + '</svg>'; }

  var RULE_ICON = { R1: 'cal', R2: 'diamond', R3: 'flag', R4: 'scale', R5: 'layers', R6: 'bolt', R7: 'pulse' };
  var LEVELS = ['1 — Do exactly what I say', '2 — Research options, I decide', '3 — Propose a plan, I approve', '4 — Decide yourself, inform me', '5 — Own it fully'];

  /* ---------- quick capture: every engine-consumed event type is writable here ---------- */
  var CAPTURE = {
    'oneonone.logged':    { label: '1:1 held',          person: 1, fields: [['date', 'Date', 'date', 1], ['note', 'Covered (one line)', 'text', 0]] },
    'pulse.logged':       { label: 'Pulse reading',     person: 1, fields: [['date', 'Date', 'date', 1], ['mood', 'Mood (1–10)', 'num10', 1], ['load', 'Load (1–10)', 'num10', 1], ['estimated', 'Estimated, not measured', 'check', 0], ['note', 'Note', 'text', 0]] },
    'feedback.logged':    { label: 'Feedback',          person: 1, fields: [['date', 'Date', 'date', 1], ['polarity', 'Polarity', 'polarity', 1], ['note', 'Note (SBI when ready)', 'text', 0]] },
    'delegation.assigned':{ label: 'Delegate work',     person: 1, fields: [['title', 'Delegated item', 'text', 1], ['date', 'Date', 'date', 1], ['level', 'Level', 'level', 1]] },
    'delegation.closed':  { label: 'Close delegation',  link: 'openDelegations', fields: [['date', 'Date', 'date', 1], ['note', 'Note', 'text', 0]] },
    'conflict.registered':{ label: 'Register conflict', person: 1, fields: [['counterpart', 'Counterpart', 'text', 1], ['severity', 'Severity (1–5)', 'sev', 1], ['date', 'Date', 'date', 1], ['note', 'What is it about', 'text', 0]] },
    'conflict.resolved':  { label: 'Resolve conflict',  link: 'openConflicts', fields: [['date', 'Date', 'date', 1], ['note', 'How it resolved', 'text', 0]] },
    'decision.logged':    { label: 'Log decision',      fields: [['title', 'Decision', 'text', 1], ['severity', 'Blast radius (1–5)', 'sev', 1], ['date', 'Decided on', 'date', 1], ['reviewDate', 'Review date', 'date', 1], ['rationale', 'Rationale', 'text', 0]] },
    'decision.outcome':   { label: 'Decision outcome',  link: 'openDecisions', fields: [['date', 'Date', 'date', 1], ['outcome', 'Outcome', 'outcome', 1], ['note', 'Why', 'text', 0]] },
    'goal.set':           { label: 'Set goal',          fields: [['title', 'Goal', 'text', 1], ['date', 'Set on', 'date', 1], ['ownerPersonId', 'Owner', 'owner', 0]] },
    'goal.assign':        { label: 'Assign goal owner', link: 'openGoals', fields: [['ownerPersonId', 'Owner', 'owner', 1], ['date', 'Date', 'date', 1]] },
    'goal.progress':      { label: 'Goal progress',     link: 'openGoals', fields: [['date', 'Date', 'date', 1], ['note', 'Progress (one line)', 'text', 1]] }
  };
  var LINK_ID_FIELD = {
    'delegation.closed': 'delegationId',
    'conflict.resolved': 'conflictId',
    'decision.outcome': 'decisionId',
    'goal.assign': 'goalId',
    'goal.progress': 'goalId'
  };

  function activePeople() { return DB.get().people.filter(function (p) { return !p.archived; }); }
  function personOptions(sel) {
    var h = '';
    activePeople().forEach(function (p) {
      h += '<option value="' + esc(p.id) + '"' + (sel === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    });
    return h;
  }
  function fieldHtml(f, prefill) {
    var name = f[0], label = f[1], kind = f[2], req = f[3];
    var pv = prefill && prefill[name];
    var h = '<div class="' + (kind === 'check' ? 'full check' : '') + '"><label for="cf-' + name + '">' + esc(label) + (req ? ' *' : '') + '</label>';
    if (kind === 'date') h += '<input id="cf-' + name + '" name="' + name + '" type="date" value="' + esc(pv || todayDate()) + '">';
    else if (kind === 'text') h += '<input id="cf-' + name + '" name="' + name + '" type="text" value="' + esc(pv || '') + '" autocomplete="off">';
    else if (kind === 'check') h += '<input id="cf-' + name + '" name="' + name + '" type="checkbox"' + (pv ? ' checked' : '') + '>';
    else if (kind === 'num10' || kind === 'sev') {
      var max = kind === 'num10' ? 10 : 5, i;
      h += '<select id="cf-' + name + '" name="' + name + '"><option value="">—</option>';
      for (i = 1; i <= max; i++) h += '<option value="' + i + '"' + (String(pv) === String(i) ? ' selected' : '') + '>' + i + '</option>';
      h += '</select>';
    }
    else if (kind === 'polarity') h += '<select id="cf-' + name + '" name="' + name + '"><option value="">—</option><option value="corrective"' + (pv === 'corrective' ? ' selected' : '') + '>corrective</option><option value="positive"' + (pv === 'positive' ? ' selected' : '') + '>positive</option></select>';
    else if (kind === 'outcome') h += '<select id="cf-' + name + '" name="' + name + '"><option value="">—</option><option value="shipped"' + (pv === 'shipped' ? ' selected' : '') + '>shipped</option><option value="abandoned"' + (pv === 'abandoned' ? ' selected' : '') + '>abandoned</option><option value="deferred"' + (pv === 'deferred' ? ' selected' : '') + '>deferred</option></select>';
    else if (kind === 'level') {
      h += '<select id="cf-' + name + '" name="' + name + '"><option value="">—</option>';
      LEVELS.forEach(function (L, i) { h += '<option value="' + (i + 1) + '"' + (String(pv) === String(i + 1) ? ' selected' : '') + '>' + esc(L) + '</option>'; });
      h += '</select>';
    }
    else if (kind === 'owner') {
      h += '<select id="cf-' + name + '" name="' + name + '"><option value="">(no owner — visible defect)</option>' + personOptions(pv) + '</select>';
    }
    h += '</div>';
    return h;
  }
  function renderCapture() {
    var spec = CAPTURE[ui.captureType];
    var h = '<form class="capture" id="form-capture"><div class="fgrid">';
    h += '<div><label for="cf-type">Record</label><select id="cf-type" name="_type" data-change="cap-type">';
    Object.keys(CAPTURE).forEach(function (t) {
      h += '<option value="' + t + '"' + (t === ui.captureType ? ' selected' : '') + '>' + esc(CAPTURE[t].label) + '</option>';
    });
    h += '</select></div>';
    var blockers = [];
    if (spec.person) {
      if (!activePeople().length) blockers.push('no one on the roster yet — add a person at #/roster');
      h += '<div><label for="cf-personId">Person *</label><select id="cf-personId" name="personId">' + personOptions(ui.prefill && ui.prefill.personId) + '</select></div>';
    }
    if (spec.link) {
      var items = EV[spec.link](DB.get());
      if (!items.length) blockers.push('nothing open to link — record the base event first');
      h += '<div><label for="cf-link">' + (spec.link === 'openDecisions' ? 'Decision' : spec.link === 'openGoals' ? 'Goal' : spec.link === 'openDelegations' ? 'Delegation' : 'Conflict') + ' *</label><select id="cf-link" name="_link">';
      items.forEach(function (it) {
        var sel = ui.prefill && ui.prefill.link === it.id;
        h += '<option value="' + esc(it.id) + '"' + (sel ? ' selected' : '') + '>' + esc(it.label) + '</option>';
      });
      h += '</select></div>';
    }
    spec.fields.forEach(function (f) { h += fieldHtml(f, ui.prefill || {}); });
    h += '</div>';
    if (blockers.length) h += '<p class="mono mut" style="margin:.6rem 0">' + ic('warn') + esc(blockers.join('; ')) + '</p>';
    h += '<div class="btnrow"><button type="submit"' + (blockers.length ? ' disabled' : '') + '>' + ic('check') + 'Record</button> <button type="button" class="ghost" data-act="cap-cancel">Cancel</button></div>';
    h += '</form>';
    return h;
  }
  function buildEventFromForm(form) {
    var spec = CAPTURE[ui.captureType];
    var get = function (n) { var el = form.elements[n]; return el ? el.value.trim() : ''; };
    var ts = get('date') ? get('date') + 'T00:00:00.000Z' : undefined;
    var data = {}, missing = [];
    spec.fields.forEach(function (f) {
      var name = f[0], kind = f[2], req = f[3];
      if (kind === 'check') { if (form.elements[name].checked) data[name] = true; return; }
      var v = get(name);
      if (req && !v) missing.push(f[1]);
      if (v !== '') {
        if (kind === 'num10' || kind === 'sev' || kind === 'level') data[name] = parseInt(v, 10);
        else if (kind === 'owner') data[name] = v || null;
        else data[name] = v;
      } else if (kind === 'owner') data[name] = null;
    });
    if (spec.person && !get('personId')) missing.push('Person');
    if (spec.link && !get('_link')) missing.push('linked record');
    if (missing.length) return { error: 'missing: ' + missing.join(', ') };
    if (spec.link) data[LINK_ID_FIELD[ui.captureType]] = get('_link');
    return { type: ui.captureType, ts: ts, personId: spec.person ? get('personId') : null, data: data };
  }

  /* ---------- finding actions: each finding pre-fills the event that resolves it ---------- */
  function findingAction(f) {
    var pid = f.personId || '';
    switch (f.ruleId) {
      case 'R1': return '<button data-act="lognow" data-pid="' + esc(pid) + '">' + ic('cal') + 'Log 1:1 now</button>';
      case 'R2': return '<button data-act="prefill" data-type="decision.outcome" data-link="' + esc(f.meta.decisionId || '') + '">' + ic('diamond') + 'Log outcome</button>';
      case 'R3': return f.meta.kind === 'owner'
        ? '<button data-act="prefill" data-type="goal.assign" data-link="' + esc(f.meta.goalId || '') + '">' + ic('user') + 'Assign owner</button>'
        : '<button data-act="prefill" data-type="goal.progress" data-link="' + esc(f.meta.goalId || '') + '">' + ic('flag') + 'Log progress</button>';
      case 'R4': return '<button data-act="prefill" data-type="feedback.logged" data-pid="' + esc(pid) + '">' + ic('scale') + 'Log feedback</button>';
      case 'R5': return '<button data-act="prefill" data-type="delegation.closed" data-pid="' + esc(pid) + '">' + ic('layers') + 'Close one</button>';
      case 'R6': return '<button data-act="prefill" data-type="conflict.resolved" data-pid="' + esc(pid) + '">' + ic('bolt') + 'Resolve one</button>';
      case 'R7': return '<button data-act="prefill" data-type="pulse.logged" data-pid="' + esc(pid) + '">' + ic('pulse') + 'Log pulse</button>';
    }
    return '';
  }
  function chip(c) {
    var cls = c.level === 'high' ? 'hi' : c.level === 'medium' ? 'med' : 'lo';
    return '<span class="chip ' + cls + '" title="' + esc(c.why) + '">' + esc(c.level) + ' confidence</span>';
  }

  /* ---------- views ---------- */
  function vToday() {
    var st = DB.get();
    var fs = EN.run(st);
    var h = '<div class="ph"><h1>Today</h1><span class="sub">' + new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + fs.length + ' open finding' + (fs.length === 1 ? '' : 's') + '</span></div>';
    h += '<p class="note">Ranked by weight of evidence. Every item shows the data that triggered it; confidence labels mean what they say.</p>';
    h += flashHtml();
    h += '<div class="btnrow"><button data-act="cap-open">' + ic('plus') + 'Log event</button></div>';
    if (ui.captureOpen) h += renderCapture();
    if (!fs.length) {
      h += '<div class="empty"><p>Nothing is currently overdue.</p><p class="sub">Either a genuinely clean week, or too little data — the engine only sees what is logged. Seed the sample set from #/data to see it work.</p></div>';
      return h;
    }
    fs.forEach(function (f, i) {
      h += '<div class="frow"><div class="rank">' + pad2(i + 1) + '</div><div class="fmain">' +
        '<div class="fhead"><span class="rt' + (f.severe ? '' : ' cool') + '">' + esc(f.ruleId) + ' · ' + esc(EN.RULE_TAGS[f.ruleId] || '') + '</span>' + chip(f.confidence) + '</div>' +
        '<div class="ft">' + esc(f.title) + '</div>' +
        '<div class="fa">' + esc(f.action) + '</div>' +
        '<div class="fb">' + f.basis.map(function (b) { return ic(RULE_ICON[f.ruleId] || 'info') + esc(b); }).join('<br>') +
          '<br><b>why ' + esc(f.confidence.level) + ':</b> ' + esc(f.confidence.why) + '</div>' +
        '</div><div class="fact">' + findingAction(f) + '</div></div>';
    });
    return h;
  }

  function vRoster() {
    var st = DB.get();
    var act = st.people.filter(function (p) { return !p.archived; });
    var arch = st.people.filter(function (p) { return p.archived; });
    var h = '<div class="ph"><h1>Roster</h1><span class="sub">' + act.length + ' active · ' + arch.length + ' archived</span></div>';
    h += '<p class="note">People the engine watches. Archiving never deletes history; events stay as provenance.</p>' + flashHtml();
    h += '<form class="inline" id="form-roster-add"><div class="fgrid">' +
      '<div><label for="ra-name">Name *</label><input id="ra-name" name="name" type="text" autocomplete="off"></div>' +
      '<div><label for="ra-role">Role</label><input id="ra-role" name="role" type="text" autocomplete="off"></div>' +
      '<div><label for="ra-cad">1:1 cadence (days)</label><input id="ra-cad" name="cadenceDays" type="number" min="1" max="90" value="7"></div>' +
      '</div><div class="btnrow"><button type="submit">' + ic('plus') + 'Add person</button></div></form>';
    function row(p, archived) {
      var last = null;
      st.events.forEach(function (e) { if (e.type === 'oneonone.logged' && e.personId === p.id) last = e; });
      var openD = EV.openDelegations(st).filter(function (d) { return d.personId === p.id; }).length;
      var pulses = EV.forPerson(EV.byType(st, 'pulse.logged'), p.id).length;
      return '<tr class="' + (archived ? 'arch' : '') + '"><td class="r-name">' + esc(p.name) + (p.seed ? ' <span class="mono mut">sample</span>' : '') +
        '<br><span class="mono mut">' + esc(p.role || '') + '</span></td>' +
        '<td class="m"><input type="number" min="1" max="90" value="' + esc(p.cadenceDays) + '" data-change="cadence" data-pid="' + esc(p.id) + '" style="width:4.5rem"' + (archived ? ' disabled' : '') + '></td>' +
        '<td class="m">' + (last ? esc(String(last.ts).slice(0, 10)) : 'never') + '</td>' +
        '<td class="m">' + openD + '</td><td class="m">' + pulses + '</td>' +
        '<td class="m">' + (archived
          ? '<button class="ghost" data-act="restore" data-pid="' + esc(p.id) + '">Restore</button>'
          : '<button class="ghost" data-act="archive" data-pid="' + esc(p.id) + '">Archive</button>') + '</td></tr>';
    }
    h += '<div class="sect">Active</div><table class="tbl"><thead><tr><th>Name</th><th class="m">Cadence d</th><th class="m">Last 1:1</th><th class="m">Open deleg.</th><th class="m">Pulses</th><th></th></tr></thead><tbody>';
    h += act.length ? act.map(function (p) { return row(p, false); }).join('') : '<tr><td colspan="6" class="mut">Roster is empty. Add your first lead above, or seed the sample set at #/data.</td></tr>';
    h += '</tbody></table>';
    if (arch.length) {
      h += '<div class="sect">Archived — history preserved, engine ignores</div><table class="tbl"><tbody>' + arch.map(function (p) { return row(p, true); }).join('') + '</tbody></table>';
    }
    return h;
  }

  /* ---------- health: live-path tests + golden engine wall, executed at render ---------- */
  function keysMatching(sub) {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(sub) === 0) out.push(k);
    }
    return out;
  }
  function cleanupTest() { keysMatching(TEST_PREFIX).forEach(function (k) { localStorage.removeItem(k); }); }

  function runLiveTests() {
    var rows = [];
    function T(id, name, fn) {
      var pass = false, detail = '';
      try { var r = fn(); pass = !!r.pass; detail = r.detail || ''; }
      catch (e) { detail = 'threw: ' + String(e && e.message || e); }
      finally { cleanupTest(); }
      rows.push({ id: id, name: name, pass: pass, detail: detail });
    }

    T('T1', 'cold boot: absent key boots fresh, persists valid mf-1 shape', function () {
      localStorage.removeItem(TEST_PREFIX);
      var s = S.makeStore(TEST_PREFIX);
      var b = s.load();
      s.save();
      var raw = localStorage.getItem(TEST_PREFIX);
      var shape = S.isShape(JSON.parse(raw));
      return { pass: b.branch === 'absent' && shape, detail: 'branch=' + b.branch + ', shape=' + shape };
    });

    T('T2', 'corrupted storage quarantined byte-exact; live key removed, never overwritten', function () {
      var a = S.makeStore(TEST_PREFIX); a.load(); a.save();
      a._rawSet(TEST_PREFIX, '{bad');
      var b = S.makeStore(TEST_PREFIX);
      var r = b.load();
      var qk = keysMatching(TEST_PREFIX + '.corrupt.');
      var exact = qk.length === 1 && localStorage.getItem(qk[0]) === '{bad';
      return { pass: r.branch === 'corrupt' && exact && localStorage.getItem(TEST_PREFIX) == null,
        detail: 'branch=' + r.branch + ', quarantine=' + qk.length + ', byteExact=' + exact };
    });

    T('T3', 'quota failure caught in the production write path, state preserved in memory', function () {
      var orig = Storage.prototype.setItem;
      var r2, s;
      try {
        Storage.prototype.setItem = function () { var e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
        s = S.makeStore(TEST_PREFIX); s.load();
        r2 = s.save();
      } finally { Storage.prototype.setItem = orig; }
      return { pass: r2 && r2.ok === false && r2.quota === true && s.get().meta.writeFailed === true,
        detail: 'ok=' + (r2 && r2.ok) + ', quota=' + (r2 && r2.quota) + ', pill=' + (s && s.get().meta.writeFailed) };
    });

    T('T4', 'second-run reseed impossible: wipe after seed, reload stays empty, seeded flag permanent', function () {
      var s = S.makeStore(TEST_PREFIX); s.load();
      EV.seed(s.get()); s.save();
      EV.purgeSeeds(s.get());
      s.save();
      var b = S.makeStore(TEST_PREFIX); b.load();
      var st = b.get();
      return { pass: st.people.length === 0 && st.events.length === 0 && st.meta.seeded === true,
        detail: 'people=' + st.people.length + ', events=' + st.events.length + ', seeded=' + st.meta.seeded };
    });

    T('T5', 'end-to-end: add person + backdated 1:1 through real storage → engine reads R1 overdue 3d', function () {
      var a = S.makeStore(TEST_PREFIX); a.load();
      var p = EV.addPerson(a.get(), { name: 'T5 Person', role: 'x', cadenceDays: 7 });
      EV.emit(a.get(), 'oneonone.logged', { personId: p.id, ts: new Date(Date.now() - 10 * 86400000).toISOString() });
      a.save();
      var b = S.makeStore(TEST_PREFIX); b.load();           /* fresh instance, real reload */
      var fs = EN.run(b.get(), todayDate());
      var hit = fs.filter(function (f) { return f.ruleId === 'R1' && f.personId === p.id; })[0];
      return { pass: !!hit && hit.meta.overdue === 3, detail: hit ? 'overdue=' + hit.meta.overdue + 'd' : 'no R1 finding' };
    });

    T('T6', 'newer-version and foreign-lineage stores quarantined with bytes preserved', function () {
      var s = S.makeStore(TEST_PREFIX); s.load();
      s._rawSet(TEST_PREFIX, JSON.stringify({ meta: { schemaVersion: 9, lineage: 'mf' }, marker: 't6newer', people: [], events: [], log: [] }));
      var r1 = S.makeStore(TEST_PREFIX).load();
      var q1 = keysMatching(TEST_PREFIX + '.newer.');
      var kept1 = q1.length === 1 && localStorage.getItem(q1[0]).indexOf('t6newer') >= 0;
      s._rawSet(TEST_PREFIX, JSON.stringify({ meta: { schemaVersion: 3, lineage: 'mono' }, marker: 't6foreign', people: [], events: [], log: [] }));
      var r2 = S.makeStore(TEST_PREFIX).load();
      var q2 = keysMatching(TEST_PREFIX + '.foreign.');
      var kept2 = q2.length === 1 && localStorage.getItem(q2[0]).indexOf('t6foreign') >= 0;
      return { pass: r1.branch === 'newer' && kept1 && r2.branch === 'foreign' && kept2,
        detail: 'newer=' + r1.branch + '/' + kept1 + ', foreign=' + r2.branch + '/' + kept2 };
    });

    T('T7', 'import refuses byte-identical-to-live and unparseable payloads', function () {
      var s = S.makeStore(TEST_PREFIX); s.load(); s.save();
      var raw = localStorage.getItem(TEST_PREFIX);
      var r1 = s.importText(raw, { mode: 'replace' });
      var r2 = s.importText('{nope', { mode: 'replace' });
      return { pass: r1.status === 'refuse-identical' && r2.status === 'unparseable',
        detail: 'identical→' + r1.status + ', garbage→' + r2.status };
    });

    T('T8', 'integrity audit: dangling FK nulled (row kept), duplicate id re-minted, repairs logged', function () {
      var s = S.makeStore(TEST_PREFIX); s.load();
      s.get().events.push({ id: 'te-1', ts: '2026-01-01T00:00:00.000Z', type: 'x.a', personId: 'ghost', data: {} });
      s.get().events.push({ id: 'te-1', ts: '2026-01-02T00:00:00.000Z', type: 'x.b', personId: null, data: {} });
      var repairs = s.audit();
      var e1 = s.get().events[0], e2 = s.get().events[1];
      var logged = s.get().log.filter(function (l) { return l.kind === 'audit'; }).length >= 2;
      return { pass: repairs === 2 && e1.personId === null && e1.id !== e2.id && s.get().events.length === 2 && logged,
        detail: 'repairs=' + repairs + ', rows=' + s.get().events.length };
    });

    return rows;
  }

  function vHealth() {
    var T = runLiveTests(), G = EN.runGolden();
    var tPass = T.filter(function (r) { return r.pass; }).length;
    var gPass = G.filter(function (r) { return r.pass; }).length;
    var h = '<div class="ph"><h1>Health</h1><span class="sub">T ' + tPass + '/' + T.length + ' · G ' + gPass + '/' + G.length + ' · executed ' + new Date().toISOString() + '</span></div>';
    h += '<p class="note">Every row executes now, in this browser, against the code paths production uses. Test storage keys (' + TEST_PREFIX + '*) are cleaned up after each run; your live data is never touched. This wall is the authority over any README.</p>';
    h += '<div class="sect">Live-path tests — storage, migration, quota, audit, end-to-end</div>';
    h += '<table class="tbl"><thead><tr><th>ID</th><th>Claim</th><th class="m">Result</th><th class="m">Observed</th></tr></thead><tbody>';
    T.forEach(function (r) {
      h += '<tr><td class="m">' + r.id + '</td><td>' + esc(r.name) + '</td><td><span class="' + (r.pass ? 'pass' : 'fail') + '">' + (r.pass ? 'PASS' : 'FAIL') + '</span></td><td class="m mut">' + esc(r.detail) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="sect">Golden engine fixtures — input events in, expected finding out (fixed today: ' + '2026-03-01' + ')</div>';
    h += '<table class="tbl"><thead><tr><th>ID</th><th>Contract</th><th class="m">Result</th><th class="m">Engine output</th></tr></thead><tbody>';
    G.forEach(function (r) {
      h += '<tr><td class="m">' + r.id + '</td><td>' + esc(r.name) + '</td><td><span class="' + (r.pass ? 'pass' : 'fail') + '">' + (r.pass ? 'PASS' : 'FAIL') + '</span></td><td class="m mut">' + esc(r.detail) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<p class="note" style="margin-top:1rem">Non-claims, stated: these are fixture-based self-assertions on real code paths — not browser automation, not a fuzzer. The fixture suite covers the seven mandated rules plus malformed input and rule boundaries; it does not cover rules that do not exist yet (playbooks are the next slice).</p>';
    return h;
  }

  /* ---------- data & backup ---------- */
  function keyKind(k) {
    if (k === 'leados:data') return 'LIVE';
    if (k.indexOf(TEST_PREFIX) === 0) return 'test';
    var m = k.match(/^leados:data\.([a-z-]+)\./);
    return m ? m[1] : 'other';
  }
  function vData() {
    var st = DB.get();
    var raw = localStorage.getItem('leados:data') || '';
    var h = '<div class="ph"><h1>Data</h1><span class="sub">localStorage only · no network</span></div>' + flashHtml();
    h += '<div class="kv">' +
      '<span class="k">live key</span><span>leados:data (' + raw.length + ' B, UTF-16 units)</span>' +
      '<span class="k">schema</span><span>v' + st.meta.schemaVersion + ' · lineage ' + st.meta.lineage + '</span>' +
      '<span class="k">contents</span><span>' + st.people.length + ' people · ' + st.events.length + ' events · ' + st.log.length + ' log rows</span>' +
      '<span class="k">seeded</span><span>' + st.meta.seeded + ' (permanent — wiping rows never reseeds)</span>' +
      '<span class="k">write failed</span><span class="' + (st.meta.writeFailed ? 'acc' : '') + '">' + st.meta.writeFailed + '</span></div>';

    h += '<div class="sect">Export backup</div>';
    h += '<div class="btnrow"><button data-act="export">' + ic('dl') + 'Download JSON</button></div>';
    h += '<textarea id="export-box" readonly>' + esc(DB.exportText()) + '</textarea>';

    h += '<div class="sect">Import backup</div>';
    h += '<div class="fgrid"><div><label for="import-file">From file</label><input id="import-file" type="file" accept="application/json" data-change="import-file"></div>' +
      '<div><label>Mode</label><div class="check"><input type="radio" name="import-mode" value="replace" id="im-r" checked><label for="im-r">replace (live state quarantined first)</label></div>' +
      '<div class="check"><input type="radio" name="import-mode" value="merge" id="im-m"><label for="im-m">merge (every id re-minted, foreign keys rewired)</label></div></div></div>';
    h += '<textarea id="import-box" placeholder="paste a LeadOS export JSON here"></textarea>';
    h += '<div class="btnrow"><button data-act="import-run">' + ic('ul') + 'Validate &amp; import</button></div>';
    if (ui.importResult) {
      var IR = ui.importResult;
      h += '<div class="flash' + (IR.ok ? '' : ' err') + '">' + esc(IR.status) + (IR.note ? ' — ' + esc(IR.note) : '') + (IR.repairs != null ? ' · repairs: ' + IR.repairs : '') + '</div>';
    }
    h += '<p class="note">Refusals, by doctrine: unparseable · malformed shape · newer schema · foreign lineage (bytes preserved read-only — no migration is ever invented) · byte-identical to live.</p>';

    h += '<div class="sect">Sample data</div>';
    h += '<div class="btnrow"><button data-act="seed">' + ic('plus') + 'Seed sample set</button> <button class="ghost" data-act="purge">' + ic('trash') + 'Purge samples</button></div>';
    h += '<p class="note">Three sample leads plus events chosen to demonstrate every rule. Purging removes only rows tagged seed:true and can never trigger a reseed.</p>';

    h += '<div class="sect">Storage keys</div><table class="tbl"><thead><tr><th>Key</th><th class="m">Kind</th><th class="m">Bytes</th><th></th></tr></thead><tbody>';
    var ks = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('leados') === 0) ks.push(k); }
    ks.sort();
    if (!ks.length) h += '<tr><td class="mut" colspan="4">no LeadOS keys</td></tr>';
    ks.forEach(function (k) {
      var kind = keyKind(k);
      var v = localStorage.getItem(k) || '';
      h += '<tr><td class="m" style="word-break:break-all">' + esc(k) + (kind !== 'LIVE' && kind !== 'test' ? '<pre class="keypeek">' + esc(v.slice(0, 220)) + '</pre>' : '') + '</td>' +
        '<td class="m">' + esc(kind) + '</td><td class="m">' + v.length + '</td>' +
        '<td class="m">' + (kind === 'LIVE' ? '<span class="mut">—</span>' : '<button class="ghost" data-act="keydel" data-key="' + esc(k) + '">Delete</button>') + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<p class="note">Quarantine and foreign keys are preserved bytes, shown read-only. Deleting a key here is your explicit action; the app never deletes them itself.</p>';

    h += '<div class="sect">Integrity &amp; event log (latest 30)</div>';
    var log = st.log.slice(-30);
    h += log.length ? log.map(function (l) { return '<div class="logline">' + esc(String(l.ts).slice(0, 19).replace('T', ' ')) + ' · <b>' + esc(l.kind) + '</b> · ' + esc(l.msg) + '</div>'; }).join('') : '<p class="mono mut">log is empty</p>';

    h += '<div class="sect">Danger</div>';
    h += '<div class="btnrow"><button class="danger" data-act="reset">' + ic('warn') + 'Factory reset</button></div>';
    h += '<p class="note">Double-confirmed. Live state is quarantined to a pre-reset key before a fresh store is written — nothing is destroyed silently.</p>';
    return h;
  }

  function flashHtml() {
    if (!flash) return '';
    var h = '<div class="flash' + (flash.err ? ' err' : '') + '">' + esc(flash.msg) + '</div>';
    flash = null;
    return h;
  }

  var VIEWS = { today: vToday, roster: vRoster, health: vHealth, data: vData };

  function render() {
    Object.keys(VIEWS).forEach(function (r) {
      document.querySelectorAll('[data-route="' + r + '"]').forEach(function (a) {
        a.classList.toggle('on', r === ui.route);
      });
    });
    var st = DB.get();
    $('pill').hidden = !(st && st.meta.writeFailed);
    $('view').innerHTML = (VIEWS[ui.route] || vToday)();
  }
  function route() {
    var h = (location.hash || '#/today').replace(/^#\//, '');
    ui.route = VIEWS[h] ? h : 'today';
    ui.captureOpen = ui.route === 'today' ? ui.captureOpen : false;
    window.scrollTo(0, 0);
    render();
  }

  /* ---------- events (single delegated set) ---------- */
  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t) return;
    var act = t.getAttribute('data-act');
    var pid = t.getAttribute('data-pid');
    var st = DB.get();
    if (act === 'cap-open') { ui.captureOpen = true; ui.prefill = null; render(); }
    else if (act === 'cap-cancel') { ui.captureOpen = false; ui.prefill = null; render(); }
    else if (act === 'lognow' && pid) {
      EV.emit(st, 'oneonone.logged', { personId: pid, data: { note: 'logged from Today' } });
      saveState(); flash = flash || { msg: '1:1 recorded. The engine recomputed on this render.' };
      render();
    }
    else if (act === 'prefill') {
      ui.captureOpen = true;
      ui.captureType = t.getAttribute('data-type');
      ui.prefill = { personId: pid || undefined, link: t.getAttribute('data-link') || undefined };
      render();
    }
    else if (act === 'archive' && pid) {
      st.people.forEach(function (p) { if (p.id === pid) p.archived = true; });
      EV.emit(st, 'person.archived', { personId: pid });
      saveState(); render();
    }
    else if (act === 'restore' && pid) {
      st.people.forEach(function (p) { if (p.id === pid) p.archived = false; });
      EV.emit(st, 'person.restored', { personId: pid });
      saveState(); render();
    }
    else if (act === 'seed') {
      var did = EV.seed(st);
      saveState();
      flash = { msg: did ? 'Sample set written. Watch Today recompute.' : 'Already seeded once — the flag is permanent. Purge samples first if you want a clean demo.' };
      render();
    }
    else if (act === 'purge') {
      EV.purgeSeeds(st); saveState();
      flash = { msg: 'Seeded rows purged; meta.seeded stays true — no reseed will occur.' };
      render();
    }
    else if (act === 'export') {
      var blob = new Blob([DB.exportText()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'leados-export-' + todayDate() + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      flash = { msg: 'Export downloaded; it is also in the text box for copy-paste.' };
      render();
    }
    else if (act === 'import-run') {
      var text = $('import-box').value;
      var mode = document.querySelector('input[name="import-mode"]:checked').value;
      ui.importResult = DB.importText(text, { mode: mode });
      flash = { msg: ui.importResult.ok ? 'Import applied (' + ui.importResult.status + ').' : 'Import refused: ' + ui.importResult.status + (ui.importResult.note ? ' — ' + ui.importResult.note : ''), err: !ui.importResult.ok };
      render();
    }
    else if (act === 'keydel') {
      var k = t.getAttribute('data-key');
      if (k && window.confirm('Delete ' + k + '? This is irreversible.')) {
        localStorage.removeItem(k);
        flash = { msg: k + ' deleted at your request.' };
        render();
      }
    }
    else if (act === 'reset') {
      if (window.confirm('Factory reset? Live state will be quarantined to a pre-reset key first.') &&
          window.confirm('Second confirm: roster, events and log will be replaced by a fresh store. Proceed?')) {
        ui.importResult = DB.importText(JSON.stringify(S.fresh()), { mode: 'replace' });
        flash = { msg: 'Reset complete; prior state is quarantined under a leados:data.pre-import key.' };
        render();
      }
    }
  }

  function onChange(e) {
    var t = e.target.closest ? e.target.closest('[data-change]') : null;
    if (!t) return;
    var kind = t.getAttribute('data-change');
    if (kind === 'cap-type') { ui.captureType = t.value; ui.prefill = null; render(); }
    else if (kind === 'cadence') {
      var pid = t.getAttribute('data-pid');
      var v = Math.max(1, Math.min(90, parseInt(t.value, 10) || 7));
      var st = DB.get();
      st.people.forEach(function (p) {
        if (p.id === pid && p.cadenceDays !== v) {
          var from = p.cadenceDays;
          p.cadenceDays = v;
          EV.emit(st, 'person.cadence', { personId: pid, data: { from: from, to: v } });
        }
      });
      saveState(); render();
    }
    else if (kind === 'import-file') {
      var file = t.files && t.files[0];
      if (!file) return;
      var rd = new FileReader();
      rd.onload = function () { $('import-box').value = String(rd.result || ''); };
      rd.readAsText(file);
    }
  }

  function onSubmit(e) {
    var form = e.target;
    if (form.id === 'form-roster-add') {
      e.preventDefault();
      var name = form.elements.name.value.trim();
      if (!name) { flash = { msg: 'A name is required.', err: true }; render(); return; }
      var p = EV.addPerson(DB.get(), { name: name, role: form.elements.role.value, cadenceDays: form.elements.cadenceDays.value });
      saveState();
      flash = { msg: p.name + ' added. Cadence ' + p.cadenceDays + 'd — the engine starts watching now.' };
      render();
    }
    else if (form.id === 'form-capture') {
      e.preventDefault();
      var ev = buildEventFromForm(form);
      if (ev.error) { flash = { msg: ev.error, err: true }; render(); return; }
      var saved = EV.emit(DB.get(), ev.type, { ts: ev.ts, personId: ev.personId, data: ev.data });
      saveState();
      ui.captureOpen = false; ui.prefill = null;
      flash = flash || { msg: 'Recorded ' + saved.type + ' (' + saved.id + '). Findings recomputed.' };
      render();
    }
  }

  /* ---------- boot ---------- */
  function boot() {
    var res = DB.load();
    var repairs = DB.audit();
    DB.save();
    var msgs = [];
    if (res.branch !== 'ok' && res.branch !== 'absent') msgs.push('storage branch "' + res.branch + '" — original bytes quarantined (see #/data), booted clean on a fresh store.');
    if (res.branch === 'foreign') msgs.push('A store from another LeadOS lineage was found and preserved read-only. No migration was invented for it.');
    if (repairs) msgs.push(repairs + ' integrity repair(s) applied at boot — details in #/data.');
    if (msgs.length) flash = { msg: msgs.join(' ') };
    $('boot').hidden = true;
    $('app').hidden = false;
    window.addEventListener('hashchange', route);
    $('view').addEventListener('click', onClick);
    $('view').addEventListener('change', onChange);
    $('view').addEventListener('submit', onSubmit);
    if (!location.hash) location.hash = '#/today';
    route();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
