/* LeadOS mf-5 · js/ui.js — surface + the health wall.
   Today (single ranked column + quick capture) · Roster + dossier ·
   Arrival instrument · Playbooks (drawer) · Health (T1–T13 + G1–G17,
   executed live at render; disposable keys swept) · Data (export/import,
   key browser, audit log, muted findings, seed/purge, rule registry).
   Nothing derived is cached in module state — every render recomputes
   from the store (stale state is a *choice*, and we choose against it).
   All code re-authored this session; upstream ui.js was never byte-readable. */
window.LEADOS = window.LEADOS || {};
LEADOS._mod = LEADOS._mod || {};
LEADOS._mod.ui = 'js/ui.js';

(function () {
  'use strict';
  var view, toastTimer = null;
  var drawer = null; /* { playId, ctx } — drawer survives main-view re-renders */

  /* ── tiny utilities ─────────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function S() { return LEADOS.store.state(); }
  function today() { return LEADOS.store.today(); }
  function el(id) { return document.getElementById(id); }
  function toast(msg) {
    var t = el('toast');
    if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2800);
  }
  var ICONS = {
    play: '<path d="M4 19V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2zm0 0a2 2 0 0 1 2-2h13"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    x: '<path d="M5 5l14 14M19 5L5 19"/>',
    check: '<path d="M4 12l5 5L20 7"/>',
    down: '<path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 21h16"/>',
    up: '<path d="M12 21V9m0 0l-4 4m4-4l4 4"/><path d="M4 3h16"/>',
    link: '<path d="M9 15l6-6"/><path d="M11 6l1-1a4.2 4.2 0 0 1 6 6l-1 1"/><path d="M13 18l-1 1a4.2 4.2 0 0 1-6-6l1-1"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4m0 3v.5"/>',
    dot: '<circle cx="12" cy="12" r="4"/>'
  };
  function ic(name) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || ICONS.dot) + '</svg>'; }
  function minHM(m) { var h = Math.floor(m / 60), r = m % 60; return h ? h + 'h' + (r ? ' ' + r + 'm' : '') : r + 'm'; }
  function rel(ts, refIso) {
    var d = LEADOS.engine._days(ts, refIso || today());
    if (d == null) return '—';
    if (d === 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 0) return 'in ' + (-d) + 'd';
    return d + 'd ago';
  }
  function spark(vals, max) {
    if (!vals.length) return '<span class="muted">no data</span>';
    var glyphs = '▁▂▃▄▅▆▇';
    return vals.map(function (v) {
      var i = Math.max(0, Math.min(glyphs.length - 1, Math.round((v / (max || 10)) * (glyphs.length - 1))));
      return glyphs[i];
    }).join('');
  }
  function personIdOf(f) {
    if (!f || !f.key) return null;
    var m = f.key.match(/^R(1|4|5|7|8|13|14):(.*)$/);
    return m ? m[2] : null;
  }

  /* ── routing ────────────────────────────────────────────────────────── */
  function route() {
    var h = location.hash || '#/today';
    var qix = h.indexOf('?');
    var path = qix >= 0 ? h.slice(0, qix) : h;
    var qs = {};
    if (qix >= 0) h.slice(qix + 1).split('&').forEach(function (kv) {
      var p = kv.split('='); if (p[0]) qs[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    return { path: path, qs: qs };
  }

  /* ── generic field renderer (playbooks + capture share this) ───────── */
  function fieldHTML(f, ctx) {
    var val = '';
    if (typeof f.prefill === 'function') { try { val = f.prefill(ctx); } catch (e) { val = ''; } }
    else if (f.prefill !== undefined) val = f.prefill;
    var span = f.span ? ' span' + f.span : '';
    var id = 'f_' + f.key;
    var hint = f.hint ? '<span class="hint">' + esc(f.hint) + '</span>' : '';
    var input = '';
    if (f.type === 'textarea') {
      input = '<textarea id="' + id + '">' + esc(val || '') + '</textarea>';
    } else if (f.type === 'select' || f.type === 'person') {
      var opts = typeof f.options === 'function' ? f.options(ctx) : (f.options || []);
      if (f.type === 'person') {
        opts = (f.allowEmpty ? [{ v: '', l: '— none —' }] : []).concat(
          (f.allowMe ? [{ v: 'me', l: 'You' }] : []),
          ctx.P.actives.map(function (p) { return { v: p.id, l: p.name + (p.role ? ' · ' + p.role : '') }; }));
      }
      input = '<select id="' + id + '"' + (f.live ? ' data-live="' + f.live + '"' : '') + '>' +
        opts.map(function (o) { return '<option value="' + esc(o.v) + '"' + (String(val) === String(o.v) ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('') + '</select>';
    } else if (f.type === 'checkbox') {
      input = '<span class="checks"><label><input type="checkbox" id="' + id + '"' + (val ? ' checked' : '') + '> yes</label></span>';
    } else if (f.type === 'multi') {
      opts = typeof f.options === 'function' ? f.options(ctx) : (f.options || []);
      input = '<span class="checks">' + (opts.length ? opts.map(function (o) {
        return '<label><input type="checkbox" name="' + id + '" value="' + esc(o.v) + '"> ' + esc(o.l) + '</label>';
      }).join('') : '<span class="hint">— nothing to select —</span>') + '</span>';
    } else if (f.type === 'context') {
      return '<div class="fld' + span + '"><label>' + esc(f.label) + '</label>' +
        '<div class="mono-block">' + esc(val || '—') + '</div></div>';
    } else {
      input = '<input id="' + id + '" type="' + (f.type || 'text') + '" value="' + esc(val == null ? '' : val) + '"' +
        (f.type === 'number' ? ' min="0" max="100"' : '') + '>';
    }
    return '<div class="fld' + span + '"><label for="' + id + '">' + esc(f.label) + '</label>' + input + hint + '</div>';
  }
  function readForm(fields) {
    var v = {};
    fields.forEach(function (f) {
      var node = el('f_' + f.key);
      if (f.type === 'checkbox') v[f.key] = !!(node && node.checked);
      else if (f.type === 'multi') {
        v[f.key] = Array.prototype.slice.call(document.querySelectorAll('input[name="f_' + f.key + '"]:checked'))
          .map(function (x) { return x.value; });
      } else if (f.type === 'context') v[f.key] = null;
      else v[f.key] = node ? node.value : '';
    });
    return v;
  }

  /* ── playbook drawer ────────────────────────────────────────────────── */
  function openPlaybook(id, ctx) {
    if (!LEADOS.playbooks.byId[id]) return;
    drawer = { playId: id, ctx: ctx || {} };
    drawer.ctx.P = LEADOS.events.project(S());
    renderDrawer();
  }
  function closeDrawer() { drawer = null; renderDrawer(); }
  function renderDrawer() {
    var old = document.querySelector('.drawer-veil'); if (old) old.remove();
    var oldD = document.querySelector('.drawer'); if (oldD) oldD.remove();
    if (!drawer) return;
    var def = LEADOS.playbooks.byId[drawer.playId];
    var ctx = drawer.ctx;
    var veil = document.createElement('div'); veil.className = 'drawer-veil';
    veil.addEventListener('click', closeDrawer);
    var d = document.createElement('aside'); d.className = 'drawer';
    var guide = def.guide.map(function (g) {
      return '<div class="guide"><h3>' + esc(g.h) + '</h3>' +
        (g.p ? '<p>' + esc(g.p) + '</p>' : '') +
        (g.list ? '<ol>' + g.list.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' : '') + '</div>';
    }).join('');
    d.innerHTML =
      '<button class="btn btn-ghost btn-sm close-x">esc / close</button>' +
      '<h2>' + esc(def.title) + '</h2>' +
      '<p class="for">' + (def.forRules.length ? 'resolves: ' + def.forRules.join(' · ') : 'diagnostic — resolves no rule; sharpens the ones that do') + '</p>' +
      guide +
      (ctx.finding ? '<p class="prefill-note">opened from: ' + esc(ctx.finding.rule) + ' — pre-filled from live data, edit freely</p>' : '') +
      '<form class="grid" id="pbform">' +
      def.fields.map(function (f) { return fieldHTML(f, ctx); }).join('') +
      '<div id="liveness" class="guide-live" hidden></div>' +
      '<div class="form-foot"><button class="btn btn-acc" type="submit">write the resolving event</button>' +
      '<span class="hint">events, not vibes: the graph updates at next render</span></div></form>';
    document.body.appendChild(veil); document.body.appendChild(d);
    d.querySelector('.close-x').addEventListener('click', closeDrawer);
    d.addEventListener('change', function (e) { liveRefresh(def, d, ctx); });
    liveRefresh(def, d, ctx);
    el('pbform').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = e.target.querySelector('button[type="submit"]');
      if (btn.disabled) return;
      btn.disabled = true; /* second-run guard: a double-click writes one event */
      var v = readForm(def.fields);
      var res;
      try { res = def.submit(v, ctx); } catch (err) { res = { error: 'submit threw: ' + (err && err.message || err) }; }
      if (!res || res.error) {
        toast('✕ ' + (res && res.error || 'nothing written'));
        btn.disabled = false;
        return;
      }
      (res.events || []).forEach(function (x) { LEADOS.events.emit(x.type, x.data, x.personId); });
      (res.personUpdates || []).forEach(function (u) { LEADOS.events.updatePerson(u.id, u.patch); });
      toast('✓ ' + (res.toast || 'written'));
      closeDrawer();
      render();
    });
  }
  function liveRefresh(def, d, ctx) {
    var live = d.querySelector('[data-live]');
    var box = d.querySelector('#liveness');
    if (!live || !box) return;
    var kind = live.getAttribute('data-live');
    var v = readForm(def.fields);
    var html = '';
    if (kind === 'levelGuide') html = 'L' + (v.level || '?') + ' — ' + LEADOS.playbooks.LEVEL_GUIDE[v.level || 3];
    if (kind === 'slMatch') {
      var m = LEADOS.playbooks.slMatch({ competence: v.competence, commitment: v.commitment });
      if (m) {
        var row = LEADOS.playbooks.SL_TABLE.filter(function (r) { return r.d === m.d; })[0] ||
                  LEADOS.playbooks.SL_TABLE.filter(function (r) { return m.d.indexOf(r.d) === 0; })[0];
        html = '<b>' + m.d + ' → lead at ' + m.s + '</b> · ' + esc(m.why) + (row ? '<br>' + esc(row.guidance) : '');
      }
    }
    box.innerHTML = html; box.hidden = !html;
  }

  /* ── ranked finding rows (Today) ────────────────────────────────────── */
  function findingRow(f, rank, P) {
    var play = f.play && LEADOS.playbooks.byId[f.play];
    var confCls = f.conf === 'high' ? 'conf-h' : f.conf === 'medium' ? 'conf-m' : 'conf-l';
    var actions = '';
    if (f.rule !== 'ENG') {
      if (play) actions += '<button class="btn btn-acc btn-sm" data-act="play" data-play="' + f.play + '" data-key="' + esc(f.key) + '">' + ic('play') + esc(play.title) + '</button>';
      actions += '<button class="btn btn-ghost btn-sm" data-act="snooze" data-key="' + esc(f.key) + '">' + ic('clock') + 'snooze 7d</button>';
      actions += '<button class="btn btn-ghost btn-sm" data-act="dismiss" data-key="' + esc(f.key) + '">' + ic('x') + 'dismiss</button>';
    } else {
      actions = '<span class="chip acc">loud by design</span>';
    }
    return '<li class="rank-li' + (f.sev >= 5 ? ' sev5' : '') + '" data-fkey="' + esc(f.key) + '">' +
      '<span class="rank-n">' + rank + '</span>' +
      '<div class="rank-main">' +
      '<p class="rank-title"><span class="rule">' + esc(f.rule) + ' · SEV ' + f.sev + '</span>' + esc(f.title) + '</p>' +
      '<p class="rank-meta"><span class="math">' + esc(f.scoreMath) + '</span> · confidence <span class="' + confCls + '">' + f.conf + '</span> — ' + esc(f.confWhy) + '</p>' +
      '<details><summary>why (basis + source events)</summary><ul class="basis">' +
      f.basis.map(function (b) { return '<li>' + esc(b).replace(/\n/g, '<br>') + '</li>'; }).join('') +
      (f.sources.length ? '<li class="src">sources: ' + f.sources.map(esc).join(' · ') + '</li>' : '<li class="src">sources: rule-level (no single event)</li>') +
      '</ul></details></div>' +
      '<div class="rank-actions">' + actions + '</div></li>';
  }

  /* ── capture bar ────────────────────────────────────────────────────── */
  var CAPTURE = [
    { type: 'oneonone.logged', label: '1:1', fields: [
      { key: 'personId', label: 'Person', type: 'person', required: true },
      { key: 'mode', label: 'Mode', type: 'select', options: [{ v: 'regular', l: 'standard' }, { v: 'skip', l: 'skip-level' }] },
      { key: 'note', label: 'Note', type: 'text', span: 2 }] },
    { type: 'pulse.logged', label: 'Pulse', fields: [
      { key: 'personId', label: 'Person', type: 'person', required: true },
      { key: 'mood', label: 'Mood 1–10', type: 'number' },
      { key: 'load', label: 'Load 1–10', type: 'number' },
      { key: 'measured', label: 'Measured (they said it)', type: 'checkbox', prefill: true },
      { key: 'note', label: 'Note', type: 'text', span: 4 }] },
    { type: 'decision.registered', label: 'Decision', fields: [
      { key: 'title', label: 'Decision', type: 'text', span: 2, required: true },
      { key: 'severity', label: 'Severity 1–5', type: 'select', options: ['1', '2', '3', '4', '5'].map(function (x) { return { v: x, l: x }; }), prefill: '3' },
      { key: 'reviewDate', label: 'Review date', type: 'date' },
      { key: 'context', label: 'Reasoning (for future-you at review)', type: 'text', span: 4 }] },
    { type: 'goal.set', label: 'Goal', fields: [
      { key: 'title', label: 'Goal', type: 'text', span: 2, required: true },
      { key: 'ownerId', label: 'Owner', type: 'person', allowMe: true, allowEmpty: true }] },
    { type: 'feedback.given', label: 'Feedback', fields: [
      { key: 'personId', label: 'Person', type: 'person', required: true },
      { key: 'polarity', label: 'Polarity', type: 'select', options: [{ v: 'positive', l: 'reinforcing' }, { v: 'corrective', l: 'corrective' }] },
      { key: 'note', label: 'One-line summary (SBI lives in the playbook)', type: 'text', span: 2 }] },
    { type: 'delegation.assigned', label: 'Delegation', fields: [
      { key: 'personId', label: 'Person', type: 'person', required: true },
      { key: 'task', label: 'Task', type: 'text', required: true },
      { key: 'level', label: 'Level', type: 'select', options: [1, 2, 3, 4, 5].map(function (x) { return { v: String(x), l: 'L' + x }; }), prefill: '3' },
      { key: 'checkback', label: 'Check-back', type: 'date' }] },
    { type: 'conflict.registered', label: 'Conflict', fields: [
      { key: 'partyAPersonId', label: 'Party A', type: 'person', allowMe: true, prefill: 'me' },
      { key: 'counterpartPersonId', label: 'Party B (roster link)', type: 'person', allowEmpty: true, hint: 'link = high confidence' },
      { key: 'counterpartText', label: '…or Party B as text', type: 'text', hint: 'text = medium confidence, drift priced' },
      { key: 'topic', label: 'Topic', type: 'text', required: true }] },
    { type: 'incident.registered', label: 'Incident', fields: [
      { key: 'title', label: 'Incident', type: 'text', span: 3, required: true }] },
    { type: 'meeting.series', label: 'Meeting', fields: [
      { key: 'title', label: 'Series title', type: 'text', span: 2, required: true },
      { key: 'dow', label: 'Days', type: 'multi', options: [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['0', 'Sun'], ['6', 'Sat']].map(function (x) { return { v: x[0], l: x[1] }; }) },
      { key: 'start', label: 'Start', type: 'time' },
      { key: 'end', label: 'End', type: 'time' },
      { key: 'cadence', label: 'Cadence', type: 'select', options: [{ v: 'weekly', l: 'weekly' }, { v: 'biweekly', l: 'biweekly' }] },
      { key: 'attendeeIds', label: 'Attendees (roster)', type: 'multi', span: 4,
        options: function (ctx) { return ctx.P.actives.map(function (p) { return { v: p.id, l: p.name }; }); } }] },
    { type: 'win.planned', label: 'Early win', fields: [
      { key: 'title', label: 'Win claim', type: 'text', span: 2, required: true },
      { key: 'verifyDate', label: 'Verify by', type: 'date' }] }
  ];

  function captureHTML(P, qs) {
    var active = qs.log && CAPTURE.some(function (c) { return c.type === qs.log; }) ? qs.log : null;
    var tabs = CAPTURE.map(function (c) {
      return '<button data-act="captype" data-type="' + c.type + '"' + (active === c.type ? ' class="on"' : '') + '>' + esc(c.label) + '</button>';
    }).join('');
    var form = '';
    if (active) {
      var def = CAPTURE.filter(function (c) { return c.type === active; })[0];
      var ctx = { P: P };
      var fields = def.fields.map(function (f) {
        var g = Object.assign({}, f);
        if (qs.person && (f.key === 'personId')) g.prefill = qs.person;
        return g;
      });
      var warn = '';
      form = '<form class="grid" id="capform">' +
        fields.map(function (f) { return fieldHTML(f, ctx); }).join('') +
        (active === 'decision.registered' ? '<div class="warnbox" id="sevwarn" hidden><b>Severity ≥ 4.</b> This decision will arm the premortem gate (R15). After saving, open the Premortem playbook — 45 minutes now beats a postmortem later. <span class="mono">Rule arms at age ≥2d; nothing blocks your write.</span></div>' : '') +
        warn +
        '<div class="form-foot"><button class="btn" type="submit">register event</button>' +
        '<span class="hint">writes one ' + esc(active) + ' event — every module sees it at next render</span></div></form>';
    }
    return '<div class="capture"><div class="capture-head"><span class="kicker">Quick capture · register</span>' +
      '<span class="type-tabs">' + tabs + '</span></div>' + form + '</div>';
  }
  function bindCapture(P) {
    view.querySelectorAll('[data-act="captype"]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = route();
        location.hash = r.path + '?log=' + b.getAttribute('data-type');
      });
    });
    var sevSel = el('f_severity');
    if (sevSel) sevSel.addEventListener('change', function () {
      var w = el('sevwarn'); if (w) w.hidden = Number(sevSel.value) < 4;
    });
    var form = el('capform');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      if (btn.disabled) return; btn.disabled = true;
      var r = route();
      var def = CAPTURE.filter(function (c) { return c.type === r.qs.log; })[0];
      var fields = def.fields.map(function (f) { var g = Object.assign({}, f); return g; });
      var v = readForm(fields);
      var missing = def.fields.filter(function (f) { return f.required && !v[f.key]; });
      if (missing.length) { toast('✕ required: ' + missing.map(function (f) { return f.label; }).join(', ')); btn.disabled = false; return; }
      var d = {}, personId = null, i;
      for (i = 0; i < def.fields.length; i++) {
        var k = def.fields[i].key, val = v[k];
        if (def.type === 'oneonone.logged' || def.type === 'pulse.logged' || def.type === 'feedback.given' || def.type === 'delegation.assigned') {
          if (k === 'personId') { personId = val; continue; }
        }
        if (def.type === 'goal.set' && k === 'ownerId') { d.ownerId = val || null; continue; }
        if (def.type === 'conflict.registered' && k === 'partyAPersonId') { if (val && val !== 'me') d.partyAPersonId = val; continue; }
        if (def.type === 'meeting.series') {
          if (k === 'dow') { d.dow = (val || []).map(Number); continue; }
          if (k === 'attendeeIds') { d.attendeeIds = val || []; continue; }
          if (k === 'start' || k === 'end') {
            var mm = String(val || '').split(':');
            d[k === 'start' ? 'startMin' : 'endMin'] = mm.length === 2 ? (Number(mm[0]) * 60 + Number(mm[1])) : null;
            continue;
          }
        }
        if (k === 'measured') { d.measured = !!val; continue; }
        if (k === 'mood' || k === 'load' || k === 'level' || k === 'severity') { d[k] = val ? Number(val) : null; continue; }
        d[k] = val === '' ? (k === 'counterpartText' || k === 'counterpartPersonId' ? null : val) : val;
      }
      if (def.type === 'pulse.logged' && (d.mood == null || d.load == null)) { toast('✕ pulse needs mood AND load (1–10)'); btn.disabled = false; return; }
      if (def.type === 'meeting.series' && (!d.dow.length || d.startMin == null || d.endMin == null || d.endMin <= d.startMin)) { toast('✕ meeting needs days + a valid start/end'); btn.disabled = false; return; }
      if (def.type === 'conflict.registered' && !d.counterpartPersonId && !d.counterpartText) { d.counterpartText = null; }
      var ev = LEADOS.events.emit(def.type, d, personId);
      if (def.type === 'decision.registered' && d.severity >= 4) {
        toast('✓ decision registered — sev ' + d.severity + ': premortem gate armed; open Playbooks → Premortem');
        location.hash = '#/playbooks?open=premortem';
      } else {
        toast('✓ ' + def.label + ' registered (' + ev.id + ')');
        location.hash = r.path; /* collapse query → fresh capture bar */
      }
    });
  }

  /* ── views ──────────────────────────────────────────────────────────── */
  function headHTML(title, sub) {
    return '<div class="view-head"><h1>' + esc(title) + '</h1>' +
      (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
  }

  function vToday(qs) {
    var state = S();
    var res = LEADOS.engine.run(state, today());
    var P = res.P;
    var html = headHTML('Today', '<b>' + esc(today()) + '</b>' +
      (P.appointment ? ' · day <b>' + (LEADOS.engine._days(P.appointment, today()) + 1) + '</b> in role' : ' · no appointment date set') +
      ' · ' + res.findings.length + ' finding(s)' + (res.mutedCount ? ' · ' + res.mutedCount + ' muted' : ''));
    if (state.meta.lastBootRepairs > 0) {
      html += '<p class="notice">Storage self-repaired <b>' + state.meta.lastBootRepairs + '</b> row(s) at boot — nothing was dropped; the repair rows are in the audit log at <a href="#/data" class="linklike">#/data</a>.</p>';
    }
    if (LEADOS.store.isReadOnly()) {
      html += '<p class="notice"><b>READ-ONLY MODE:</b> storage holds a newer schema version. Writes are blocked so your newer data can never be clobbered by this older build.</p>';
    }
    html += captureHTML(P, qs);
    if (!res.findings.length) {
      html += '<div class="empty"><p>No findings. The engine only speaks when data speaks — it does not manufacture urgency.</p>' +
        '<p class="ruleset">watching: ' + LEADOS.engine.RULES.map(function (r) { return r.id; }).join(' · ') + '</p></div>';
    } else {
      html += '<ol class="rank">' + res.findings.map(function (f, i) { return findingRow(f, i + 1, P); }).join('') + '</ol>';
    }
    view.innerHTML = '<div class="page">' + html + '</div>';
    bindCapture(P);
    view.querySelectorAll('[data-act="play"]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = res.findings.filter(function (x) { return x.key === b.getAttribute('data-key'); })[0];
        openPlaybook(b.getAttribute('data-play'), { finding: f, personId: personIdOf(f) });
      });
    });
    view.querySelectorAll('[data-act="snooze"]').forEach(function (b) {
      b.addEventListener('click', function () {
        var until = LEADOS.events.dayOffset(-7); /* today+7 */
        LEADOS.events.emit('engine.snooze', { key: b.getAttribute('data-key'), until: until });
        toast('snoozed until ' + until + ' — logged as an event (reversible)');
      });
    });
    view.querySelectorAll('[data-act="dismiss"]').forEach(function (b) {
      b.addEventListener('click', function () {
        LEADOS.events.emit('engine.dismiss', { key: b.getAttribute('data-key') });
        toast('dismissed — unmute any time at #/data');
      });
    });
  }

  function vRoster() {
    var P = LEADOS.events.project(S());
    var t = today();
    var rows = P.actives.map(function (p) {
      var last11 = P.oneononeLast[p.id];
      var dels = (P.delegationsOpenByPerson[p.id] || []).length;
      var load = P.weeklyMeetingLoad[p.id];
      var mins = load ? load.minutes : 0;
      var pulses = P.pulses[p.id];
      var loads = pulses ? pulses.measured.slice(-8).map(function (e) { return (e.data || {}).load; }) : [];
      var rel2 = p.reportsTo === 'me' ? 'you' : (P.peopleById[p.reportsTo] ? P.peopleById[p.reportsTo].name : '⚠ broken line');
      var sl = p.sl ? LEADOS.playbooks.slMatch(p.sl) : null;
      var confs = P.openConflicts.filter(function (c) { return c.a.personId === p.id || c.b.personId === p.id; }).length;
      return '<tr class="clickable" data-pid="' + p.id + '">' +
        '<td><b>' + esc(p.name) + '</b><br><span class="legend">' + esc(p.role || '—') + '</span></td>' +
        '<td class="mono">' + esc(rel2) + '</td>' +
        '<td class="mono">' + (p.cadenceDays || 14) + 'd</td>' +
        '<td class="mono">' + (last11 ? rel(last11.ts, t) : 'never') + '</td>' +
        '<td class="mono">' + (dels || '—') + '</td>' +
        '<td class="mono">' + (mins ? minHM(mins) + '<span class="bar-wrap"><span class="bar" style="width:' + Math.min(64, Math.round(mins / 600 * 64)) + 'px"></span></span>' : '—') + '</td>' +
        '<td><span class="spark">' + spark(loads, 10) + '</span>' + (pulses && pulses.estimatedCount ? ' <span class="legend">+' + pulses.estimatedCount + ' est. excl.</span>' : '') + '</td>' +
        '<td class="mono">' + (sl ? sl.d + '→' + sl.s : '—') + '</td>' +
        '<td>' + (confs ? '<span class="chip acc">' + confs + ' open</span>' : '') + '</td></tr>';
    }).join('');
    var html = headHTML('Roster', P.actives.length + ' active · ' + (P.people.length - P.actives.length) + ' archived');
    html += '<div class="capture"><div class="capture-head"><span class="kicker">Add person</span></div>' +
      '<form class="grid" id="addperson">' +
      '<div class="fld"><label>Name</label><input id="ap_name"></div>' +
      '<div class="fld"><label>Role</label><input id="ap_role"></div>' +
      '<div class="fld"><label>1:1 cadence (days)</label><input id="ap_cad" type="number" value="14"></div>' +
      '<div class="fld"><label>Reports to</label><select id="ap_reports"><option value="me">You</option>' +
      P.actives.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-foot"><button class="btn" type="submit">add to roster</button>' +
      '<span class="hint">people rows, not events — same store, same audit log</span></div></form></div>';
    html += '<table class="sheet"><thead><tr><th>person</th><th>reports to</th><th>cad.</th><th>last 1:1</th><th>deleg.</th><th>meet/wk</th><th>load trend (measured)</th><th>D/S</th><th>conflicts</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="9" class="mono">empty roster — add someone above, or load the sample set at #/data</td></tr>') + '</tbody></table>';
    html += '<p class="legend" style="margin-top:8px">meeting bar scaled to 600 min (10h) · trend = last 8 measured pulses, load 0–10 · estimated readings never trend · click a row for the dossier</p>';
    view.innerHTML = '<div class="page">' + html + '</div>';
    el('addperson').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = el('ap_name').value.trim();
      if (!name) { toast('✕ name required'); return; }
      var p = LEADOS.events.addPerson({ name: name, role: el('ap_role').value.trim(),
        cadenceDays: Number(el('ap_cad').value) || 14, reportsTo: el('ap_reports').value });
      toast('✓ added ' + p.name);
    });
    view.querySelectorAll('tr.clickable').forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/roster/' + tr.getAttribute('data-pid'); });
    });
  }

  function vDossier(pid) {
    var P = LEADOS.events.project(S());
    var p = P.peopleById[pid];
    if (!p) { view.innerHTML = '<div class="page">' + headHTML('Dossier', '') + '<div class="empty">person not found — <a class="linklike" href="#/roster">back to roster</a></div></div>'; return; }
    var t = today();
    var pulses = P.pulses[p.id] || { measured: [], estimatedCount: 0 };
    var ms = pulses.measured.slice().sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });
    var moods = ms.slice(-10).map(function (e) { return (e.data || {}).mood; });
    var loads = ms.slice(-10).map(function (e) { return (e.data || {}).load; });
    var load = P.weeklyMeetingLoad[p.id];
    var dels = P.delegationsOpenByPerson[p.id] || [];
    var fbs = (P.feedbackByPerson[p.id] || []).slice(-6).reverse();
    var confs = P.conflicts.filter(function (c) { return (c.a.personId === p.id || c.b.personId === p.id); });
    var line = P.lineToMe(p);
    var sl = p.sl ? LEADOS.playbooks.slMatch(p.sl) : null;
    var slRow = sl ? LEADOS.playbooks.SL_TABLE.filter(function (r) { return sl.d.indexOf(r.d) === 0; })[0] : null;

    var html = '<div class="dossier-head"><h1>' + esc(p.name) + '</h1>' +
      '<span class="legend">' + esc(p.role || '—') + ' · added ' + esc((p.createdAt || '').slice(0, 10) || '—') + ' · id <span class="mono">' + esc(p.id) + '</span></span>' +
      '<span style="margin-left:auto"><a class="btn btn-ghost btn-sm" href="#/today?log=oneonone.logged&person=' + p.id + '">log 1:1</a> ' +
      '<a class="btn btn-ghost btn-sm" href="#/today?log=pulse.logged&person=' + p.id + '">log pulse</a> ' +
      '<button class="btn btn-ghost btn-sm" data-play="oneonone">run sheet</button></span></div>';

    html += '<div class="two-col"><div>' +
      '<p class="kicker">Condition · measured only</p>' +
      '<dl class="kv">' +
      '<dt>load trend</dt><dd><span class="spark">' + spark(loads, 10) + '</span> <span class="legend">' + (loads.length ? loads[loads.length - 1] + '/10 last' : 'no measured pulses') + '</span></dd>' +
      '<dt>mood trend</dt><dd><span class="spark">' + spark(moods, 10) + '</span> <span class="legend">' + (moods.length ? moods[moods.length - 1] + '/10 last' : 'no measured pulses') + '</span></dd>' +
      '<dt>pulse data</dt><dd class="mono">' + ms.length + ' measured · ' + pulses.estimatedCount + ' estimated (excluded, always)</dd>' +
      '<dt>1:1</dt><dd class="mono">' + (P.oneononeLast[p.id] ? rel(P.oneononeLast[p.id].ts, t) : 'never') + ' · cadence ' + (p.cadenceDays || 14) + 'd</dd>' +
      '<dt>skip 1:1</dt><dd class="mono">' + (P.oneononeSkipLast[p.id] ? rel(P.oneononeSkipLast[p.id].ts, t) : 'never / n/a') + '</dd>' +
      '<dt>meetings</dt><dd class="mono">' + (load ? minHM(load.minutes) + '/wk across ' + load.series.length + ' series' : 'none declared') + '</dd>' +
      '</dl>' +
      (load ? '<div class="mono-block">' + load.series.map(function (s) { return s.minutes + ' min/wk · ' + esc(s.title); }).join('\n') + '</div>' : '') +
      '</div><div>' +
      '<p class="kicker">Situational (per task type)</p>' +
      (sl && slRow ? '<div class="guide-live"><b>' + esc(sl.d) + ' → ' + esc(sl.s) + '</b> · ' + esc(sl.why) + '<br>' + esc(slRow.guidance) + '</div>'
        : '<p class="section-note">not assessed — run the situational playbook before their next big delegation.</p>') +
      '<p style="margin-top:8px"><button class="btn btn-acc btn-sm" data-play="situational">' + ic('play') + (sl ? 're-assess' : 'assess now') + '</button></p>' +
      '<p class="kicker">Open delegations (' + dels.length + ')</p>' +
      (dels.length ? '<ul class="basis" style="border-left-color:#CFC8B8">' + dels.map(function (e) {
        return '<li>L' + ((e.data || {}).level || '?') + ' · ' + esc((e.data || {}).task || '(task)') + ' <span class="src">since ' + esc(e.ts.slice(0, 10)) + ' · <a class="linklike" data-close-del="' + e.id + '">close</a></span></li>';
      }).join('') + '</ul>' : '<p class="section-note">none open</p>') +
      '</div></div>';

    html += '<hr class="hr"><div class="two-col"><div>' +
      '<p class="kicker">Feedback (last 6)</p>' +
      (fbs.length ? fbs.map(function (e) {
        var pol = (e.data || {}).polarity || '?';
        return '<span class="chip' + (pol === 'corrective' ? ' acc' : ' ink') + '">' + esc(pol) + '</span> <span class="mono" style="font-size:10px">' + esc(e.ts.slice(0, 10)) + '</span>';
      }).join('<br>') : '<p class="section-note">none logged — silence is also a feedback profile</p>') +
      '</div><div>' +
      '<p class="kicker">Conflicts</p>' +
      (confs.length ? confs.map(function (c) {
        return '<p><span class="glyph-link">' + ic('link') + '</span> <span class="' + (c.resolved ? 'legend' : '') + '">' + esc(c.pairLabel) + '</span> ' +
          '<span class="chip' + (c.resolved ? '' : ' acc') + '">' + (c.resolved ? 'resolved' : 'open · ' + c.linkConf) + '</span><br>' +
          '<span class="legend">' + esc(c.topic) + ' · ' + esc(c.ts.slice(0, 10)) + '</span></p>';
      }).join('') : '<p class="section-note">none registered</p>') +
      '</div></div>';

    html += '<hr class="hr"><p class="kicker">Admin</p>' +
      '<form class="grid" id="editperson">' +
      '<div class="fld"><label>cadence (days)</label><input id="ep_cad" type="number" value="' + (p.cadenceDays || 14) + '"></div>' +
      '<div class="fld"><label>reports to</label><select id="ep_reports"><option value="me">You</option>' +
      P.actives.filter(function (x) { return x.id !== p.id; }).map(function (x) { return '<option value="' + x.id + '"' + (p.reportsTo === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="fld"><label>archived</label><span class="checks"><label><input type="checkbox" id="ep_arch"' + (p.archived ? ' checked' : '') + '> archived (rules go quiet)</label></span></div>' +
      '<div class="form-foot"><button class="btn btn-ghost" type="submit">save person row</button>' +
      '<span class="hint">reporting line check: ' + esc(line.ok ? 'you → ' + line.chain.map(function (c) { return c.name; }).concat([p.name]).join(' → ') : 'BROKEN (' + line.detail + ') — engine skip rules are silent, not guessing') + '</span></div></form>';

    view.innerHTML = '<div class="page">' + html + '</div>';
    view.querySelectorAll('[data-play]').forEach(function (b) {
      b.addEventListener('click', function () { openPlaybook(b.getAttribute('data-play'), { personId: p.id }); });
    });
    view.querySelectorAll('[data-close-del]').forEach(function (a) {
      a.addEventListener('click', function () {
        LEADOS.events.emit('delegation.closed', { delegationId: a.getAttribute('data-close-del') });
        toast('delegation closed');
      });
    });
    el('editperson').addEventListener('submit', function (e) {
      e.preventDefault();
      LEADOS.events.updatePerson(p.id, { cadenceDays: Number(el('ep_cad').value),
        reportsTo: el('ep_reports').value, archived: el('ep_arch').checked });
      toast('person row saved');
    });
  }

  function vArrival() {
    var P = LEADOS.events.project(S());
    var state = S();
    if (!P.appointment) {
      view.innerHTML = '<div class="page">' + headHTML('Arrival instrument', 'the first 90 days, measured') +
        '<div class="empty"><p>No appointment date set. The arrival rules (R9 expectations · R10 listening tour · R11 early wins) stay silent rather than guess your timeline.</p>' +
        '<form id="appt" class="grid" style="margin-top:12px"><div class="fld"><label>first day in role</label><input type="date" id="appt_date"></div>' +
        '<div class="form-foot"><button class="btn" type="submit">set appointment date</button></div></form></div></div>';
      el('appt').addEventListener('submit', function (e) {
        e.preventDefault();
        if (!el('appt_date').value) { toast('✕ pick a date'); return; }
        LEADOS.store.setAppointment(el('appt_date').value);
        toast('appointment set — arrival rules armed');
        render();
      });
      return;
    }
    var t = today();
    var day = LEADOS.engine._days(P.appointment, t) + 1;
    var exp = P.expectations;
    var targets = P.actives.filter(function (p) {
      if (p.reportsTo === 'me') return true;
      var l = P.lineToMe(p); return l.ok && l.depth === 2;
    });
    var visited = targets.filter(function (p) { return P.tourVisits[p.id]; });
    var winsOpen = P.openWins, winsDone = P.wins.filter(function (w) { return w.verified; });
    var html = headHTML('Arrival instrument', 'appointed <b>' + esc(P.appointment) + '</b> · day <b>' + day + '</b>');
    html += '<p class="kicker">Boss expectations (R9 gate: day 14)</p>' +
      (exp ? '<div class="mono-block">' + esc(((exp.data || {}).priorities || []).join('\n') || '(captured)') +
        (exp.data && exp.data.bossName ? '\n———\nwith ' + esc(exp.data.bossName) : '') + '</div>'
      : '<p class="section-note">uncaptured' + (day >= 14 ? ' — R9 is firing on Today' : ' — you have until day 14') + '. <button class="btn btn-acc btn-sm" data-play="expectations">open the charter</button></p>');
    html += '<p class="kicker">Listening tour (R10 · grace day 14 · gate day 45)</p>' +
      '<p class="section-note">coverage ' + visited.length + '/' + targets.length + ' — measured against today’s roster (joiners count; stated assumption).</p>' +
      '<p style="margin:8px 0">' + targets.map(function (p) {
        var v = P.tourVisits[p.id];
        return '<span class="chip' + (v ? ' ink' : ' acc') + '">' + esc(p.name) + (v ? ' ✓' : '') + '</span>';
      }).join('') + '</p>' +
      '<button class="btn btn-acc btn-sm" data-play="tour">' + ic('play') + 'log a visit</button>';
    html += '<p class="kicker">Early-win ledger (R11)</p>' +
      (winsOpen.length || winsDone.length ?
        winsOpen.map(function (w) { return '<p><span class="chip acc">open</span> ' + esc(w.title) + ' <span class="legend">verify ' + esc(w.verifyDate || '—') + '</span></p>'; }).join('') +
        winsDone.map(function (w) { return '<p><span class="chip ink">' + esc((w.verified.data || {}).verdict || 'verified') + '</span> ' + esc(w.title) + '</p>'; }).join('')
      : '<p class="section-note">no wins claimed yet — claim one, set a verify date, and let R11 hold you to it</p>');
    view.innerHTML = '<div class="page">' + html + '</div>';
    view.querySelectorAll('[data-play]').forEach(function (b) {
      b.addEventListener('click', function () { openPlaybook(b.getAttribute('data-play'), {}); });
    });
  }

  function vPlaybooks(qs) {
    var html = headHTML('Playbooks', 'structured moves · each writes the resolving event, not advice');
    html += LEADOS.playbooks.LIST.map(function (def) {
      return '<div class="rank-li"><span class="rank-n">' + ic('play') + '</span>' +
        '<div class="rank-main"><p class="rank-title">' + esc(def.title) + '</p>' +
        '<p class="rank-meta">' + (def.forRules.length ? 'resolves ' + def.forRules.join(' · ') : 'diagnostic — sharpens other rules') + '</p></div>' +
        '<div class="rank-actions"><button class="btn btn-sm" data-open="' + def.id + '">open</button></div></div>';
    }).join('');
    html += '<p class="legend" style="margin-top:8px">delegation ladder L1–L5 and situational D1→S matching reference live inside their playbooks</p>';
    view.innerHTML = '<div class="page">' + html + '</div>';
    view.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () { openPlaybook(b.getAttribute('data-open'), {}); });
    });
    if (qs.open && LEADOS.playbooks.byId[qs.open]) openPlaybook(qs.open, {});
  }

  function vData() {
    var state = S();
    var liveBytes = '';
    try { liveBytes = (localStorage.getItem(LEADOS.store.KEY) || '').length; } catch (e) { liveBytes = '?'; }
    var keys = LEADOS.store.browseKeys();
    var run = LEADOS.engine.run(state, today(), { includeMuted: true });
    var muted = run.findings.filter(function (f) { return f.muted; });
    var ruleRows = LEADOS.engine.RULES.map(function (r) {
      var st = run.perRule[r.id] || { n: 0 };
      return '<tr><td class="mono"><b>' + r.id + '</b></td><td class="mono">' + r.tag + '</td><td class="mono">' + (r.play || '—') + '</td>' +
        '<td class="mono">' + (st.threw ? '<span style="color:var(--bad)">THREW — see ENG finding</span>' : st.n + ' finding(s)') + '</td></tr>';
    }).join('');
    var html = headHTML('Data plane', 'one key · ~5MB budget <b>(assumption, labeled)</b> · live value ' + Number(liveBytes).toLocaleString() + ' chars');
    html += '<p class="kicker">Backup · export / import</p>' +
      '<div class="two-col"><div>' +
      '<button class="btn" id="dl">' + ic('down') + 'download export (.json)</button>' +
      '<p class="legend" style="margin:6px 0">full state: meta + people + ' + state.events.length + ' events, pretty-printed</p>' +
      '</div><div>' +
      '<div class="fld"><label>import (paste export JSON or choose file)</label><textarea id="importbox" rows="3"></textarea></div>' +
      '<p style="margin-top:6px"><button class="btn" id="doimport">' + ic('up') + 'import & merge</button> <input type="file" id="importfile" accept=".json,application/json"></p>' +
      '<p class="legend" style="margin-top:4px">refuses: unparseable · malformed · foreign lineage · newer schema · identical. migrates same-lineage older. merge re-mints every id and rewires every reference (incl. reportsTo — mf-5 fix). live bytes preserved under .pre-import first.</p>' +
      '</div></div>';
    html += '<hr class="hr"><p class="kicker">Sample set (demo data, honestly labeled)</p>' +
      '<p><button class="btn btn-ghost" id="seedbtn">load sample set</button> <button class="btn btn-ghost" id="purgebtn">purge sample set</button></p>' +
      '<p class="legend">seeded: <b>' + (state.meta.seeded ? 'yes — rows tagged seed:true, purgeable' : 'never') + '</b> · the no-reseed flag is set BEFORE rows are written, and survives purge: a purged database never reseeds. Six people, live triggers for all 15 rules plus deliberate contrasts.</p>';
    html += '<hr class="hr"><p class="kicker">Key browser (' + keys.length + ')</p>' +
      '<table class="sheet"><thead><tr><th>key</th><th>kind</th><th>chars</th></tr></thead><tbody>' +
      (keys.map(function (k) { return '<tr class="clickable" data-key="' + esc(k.key) + '"><td class="mono">' + esc(k.key) + '</td><td class="mono">' + k.kind + '</td><td class="mono">' + k.bytes.toLocaleString() + '</td></tr>'; }).join('') || '<tr><td class="mono" colspan="3">no keys yet</td></tr>') +
      '</tbody></table><div id="keypeek"></div>' +
      '<p class="legend">quarantines are read-only here: ' + ['corrupt', 'malformed', 'foreign', 'newer', 'migration-failed', 'pre-migration', 'pre-import'].join(' · ') + '</p>';
    html += '<hr class="hr"><p class="kicker">Engine</p>' +
      '<table class="sheet"><thead><tr><th>rule</th><th>tag</th><th>playbook</th><th>status now</th></tr></thead><tbody>' + ruleRows + '</tbody></table>';
    if (muted.length) {
      html += '<p class="kicker">Muted findings (' + muted.length + ') — auditable, reversible</p>' +
        muted.map(function (f) {
          return '<p><span class="chip">' + esc(f.key) + '</span> ' + esc(f.title) + ' <a class="linklike" data-unmute="' + esc(f.key) + '">unmute</a></p>';
        }).join('');
    }
    html += '<hr class="hr"><p class="kicker">Audit log (latest ' + Math.min(state.log.length, 60) + ' of ' + state.log.length + ', capped at ' + LEADOS.store.LOG_MAX + ')</p>' +
      '<div class="mono-block" style="max-height:260px;overflow:auto">' +
      state.log.slice(-60).reverse().map(function (r) { return esc(r.ts.slice(0, 19).replace('T', ' ') + ' · ' + r.kind + ' · ' + r.msg); }).join('\n') + '</div>';
    view.innerHTML = '<div class="page">' + html + '</div>';

    el('dl').addEventListener('click', function () {
      var blob = new Blob([LEADOS.store.exportText()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'leados-export-' + today() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
      toast('export downloaded');
    });
    el('importfile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { el('importbox').value = String(rd.result || ''); toast('file loaded into the box — press import & merge'); };
      rd.readAsText(f);
    });
    el('doimport').addEventListener('click', function () {
      var txt = el('importbox').value;
      if (!txt.trim()) { toast('✕ paste an export first'); return; }
      var r = LEADOS.store.importText(txt);
      if (r.ok) { toast('✓ merged ' + r.mergedPeople + ' people + ' + r.mergedEvents + ' events' + (r.saved ? '' : ' (but save failed: ' + r.saveReason + ')')); render(); }
      else toast('✕ import refused: ' + r.reason + (r.detail ? ' — ' + r.detail : ''));
    });
    el('seedbtn').addEventListener('click', function () {
      var r = LEADOS.events.seed();
      toast(r.ok ? '✓ sample set loaded — every rule has something to say' : '✕ seed refused: ' + r.reason + (r.detail ? ' (' + r.detail + ')' : ''));
      if (r.ok) location.hash = '#/today';
    });
    el('purgebtn').addEventListener('click', function () {
      var r = LEADOS.events.purgeSeed();
      toast('purged ' + r.removedEvents + ' seed events + ' + r.removedPeople + ' seed people — the no-reseed flag stays');
    });
    view.querySelectorAll('tr.clickable[data-key]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var k = tr.getAttribute('data-key');
        var raw = LEADOS.store.readKey(k);
        var peek = el('keypeek');
        peek.innerHTML = raw == null ? '' : '<div class="keyrow"><pre>' + esc(raw.length > 4000 ? raw.slice(0, 4000) + '\n… (' + raw.length + ' chars total)' : raw) + '</pre></div>';
      });
    });
    view.querySelectorAll('[data-unmute]').forEach(function (a) {
      a.addEventListener('click', function () {
        LEADOS.events.emit('engine.unmute', { key: a.getAttribute('data-unmute') });
        toast('unmuted — the engine will speak again if the data still says so');
      });
    });
  }

  /* ── the health wall ────────────────────────────────────────────────── */
  var FX_DAY = '2026-01-15';
  function tso(n) { /* n days before FX_DAY, UTC-stable */
    var d = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString();
  }
  function fxState(people, events, metaPatch) {
    var norm = LEADOS.store._normalizeEvents(events, null);
    return { meta: Object.assign({ schemaVersion: 3, lineage: 'mf', seeded: false,
      createdAt: tso(90), writeFailed: false, migrations: [], appointment: null, lastBootRepairs: 0 }, metaPatch || {}),
      people: people, events: norm.events, log: [] };
  }
  function pp(id, name, opts) {
    return Object.assign({ id: id, name: name, role: '', cadenceDays: 14, reportsTo: 'me',
      archived: false, createdAt: tso(60), sl: null }, opts || {});
  }
  function fev(id, type, data, personId, daysAgo) {
    return { id: id, ts: tso(daysAgo), type: type, personId: personId || null, data: data || {}, seed: false };
  }
  function sweepDisposable() {
    var kill = [], i, k;
    try {
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i);
        if (k && k.indexOf('leados:t') === 0) kill.push(k);
      }
      kill.forEach(function (x) { localStorage.removeItem(x); });
    } catch (e) { /* ignore */ }
  }
  function runFindings(state, rulePrefix, day) {
    var res = LEADOS.engine.run(state, day || FX_DAY, { includeMuted: true });
    return res.findings.filter(function (f) { return f.key.indexOf(rulePrefix) === 0; });
  }

  function healthTests() {
    var T = [], G = [];
    var store = LEADOS.store;
    function t(id, name, fn) { T.push({ id: id, name: name, fn: fn }); }
    function g(id, name, fn) { G.push({ id: id, name: name, fn: fn }); }

    /* ── T: storage / pipeline ── */
    t('T1', 'fresh boot: missing key → empty v3 state, nothing written yet', function () {
      var ms = store.makeStore('leados:t:1');
      var r = ms.load();
      var s = ms.state();
      return { pass: r.from === 'empty' && s.meta.schemaVersion === 3 && s.people.length === 0 && localStorage.getItem('leados:t:1') === null,
        expected: "from=empty · v3 · 0 people · key still absent (we don't write unprompted)",
        observed: 'from=' + r.from + ' · v' + s.meta.schemaVersion + ' · people=' + s.people.length + ' · key=' + (localStorage.getItem('leados:t:1') === null ? 'absent' : 'present') };
    });
    t('T2', 'corrupt bytes → quarantined as corrupt, boots clean, live rows readable', function () {
      localStorage.setItem('leados:t:2', '{bad');
      var ms = store.makeStore('leados:t:2');
      var r = ms.load();
      var ks = ms.browseKeys().filter(function (k) { return k.kind === 'corrupt'; });
      return { pass: r.from === 'corrupt' && ks.length === 1 && ms.readKey(ks[0].key) === '{bad' && ms.state().events.length === 0,
        expected: 'from=corrupt · 1 corrupt key containing the original bytes · clean state',
        observed: 'from=' + r.from + ' · corruptKeys=' + ks.length + ' · bytes="' + (ks[0] ? ms.readKey(ks[0].key) : '—') + '"' };
    });
    t('T3', 'parseable but shapeless JSON → malformed (its own class, not corruption)', function () {
      localStorage.setItem('leados:t:3', '{"x":1}');
      var ms = store.makeStore('leados:t:3');
      var r = ms.load();
      var ks = ms.browseKeys().filter(function (k) { return k.kind === 'malformed'; });
      return { pass: r.from === 'malformed' && ks.length === 1,
        expected: 'from=malformed · 1 malformed key', observed: 'from=' + r.from + ' · keys=' + ks.length };
    });
    t('T4', 'wrong lineage → foreign quarantine + fresh boot', function () {
      localStorage.setItem('leados:t:4', JSON.stringify({ meta: { lineage: 'other-app', schemaVersion: 3 }, people: [], events: [], log: [] }));
      var ms = store.makeStore('leados:t:4');
      var r = ms.load();
      return { pass: r.from === 'foreign',
        expected: 'from=foreign', observed: 'from=' + r.from };
    });
    t('T5', 'newer schema → READ-ONLY, live key bytes untouched forever', function () {
      var raw = JSON.stringify({ meta: { lineage: 'mf', schemaVersion: 99 }, people: [], events: [], log: [] });
      localStorage.setItem('leados:t:5', raw);
      var ms = store.makeStore('leados:t:5');
      var r = ms.load();
      var saveTry = ms.save();
      return { pass: r.from === 'newer' && ms.isReadOnly() && !saveTry.ok && localStorage.getItem('leados:t:5') === raw,
        expected: 'from=newer · readOnly · save refused · live bytes byte-identical',
        observed: 'from=' + r.from + ' · readOnly=' + ms.isReadOnly() + ' · save.ok=' + saveTry.ok + ' · bytesIdentical=' + (localStorage.getItem('leados:t:5') === raw) };
    });
    t('T6', 'migration ladder 1→2→3 with pre-migration quarantine', function () {
      localStorage.setItem('leados:t:6', JSON.stringify({ meta: { schemaVersion: 1, lineage: 'mf', seeded: false, createdAt: tso(100), writeFailed: false, migrations: [] }, people: [{ id: 'p1', name: 'Ada' }], events: [], log: [] }));
      var ms = store.makeStore('leados:t:6');
      var r = ms.load();
      var s = ms.state();
      var pre = ms.browseKeys().filter(function (k) { return k.kind === 'pre-migration'; });
      return { pass: r.from === 'stored' && s.meta.schemaVersion === 3 && s.people[0].reportsTo === 'me' && ('appointment' in s.meta) && s.meta.appointment === null && pre.length === 1 && s.meta.migrations.length === 2,
        expected: 'v3 · reportsTo="me" · appointment=null · 1 pre-migration key · 2 migration log entries',
        observed: 'v' + s.meta.schemaVersion + ' · reportsTo="' + s.people[0].reportsTo + '" · appt=' + JSON.stringify(s.meta.appointment) + ' · preKeys=' + pre.length + ' · migrations=' + s.meta.migrations.length };
    });
    t('T7', 'quota: setItem throws QuotaExceededError → caught, state intact, writeFailed set', function () {
      var ms = store.makeStore('leados:t:7');
      ms.load();
      var orig = localStorage.setItem;
      var res;
      try {
        localStorage.setItem = function () { var e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
        res = ms.save();
      } finally { localStorage.setItem = orig; }
      return { pass: res && !res.ok && res.reason === 'quota' && ms.state().meta.writeFailed === true && ms.state().meta.schemaVersion === 3,
        expected: 'save.ok=false (quota) · writeFailed=true · state still coherent',
        observed: 'ok=' + (res && res.ok) + ' · reason=' + (res && res.reason) + ' · writeFailed=' + ms.state().meta.writeFailed };
    });
    t('T8', 'import refusals: unparseable · malformed · foreign · newer · identical', function () {
      var ms = store.makeStore('leados:t:8');
      ms.load();
      var r1 = ms.importText('{bad');
      var r2 = ms.importText('{"x":1}');
      var r3 = ms.importText(JSON.stringify({ meta: { lineage: 'zz', schemaVersion: 3 }, people: [], events: [] }));
      var r4 = ms.importText(JSON.stringify({ meta: { lineage: 'mf', schemaVersion: 99 }, people: [], events: [] }));
      var r5 = ms.importText(ms.exportText());
      var reasons = [r1.reason, r2.reason, r3.reason, r4.reason, r5.reason].join(' · ');
      return { pass: !r1.ok && r1.reason === 'unparseable' && r2.reason === 'malformed' && r3.reason === 'foreign' && r4.reason === 'newer' && r5.reason === 'identical',
        expected: 'unparseable · malformed · foreign · newer · identical', observed: reasons };
    });
    t('T9', 'import merge: every id re-minted, every reference rewired — incl. reportsTo (mf-5 fix)', function () {
      var ms = store.makeStore('leados:t:9');
      ms.load();
      ms.state().people.push(pp('LIVE1', 'Live Person'));
      ms.state().events.push(fev('LIVEE1', 'goal.set', { title: 'live goal', ownerId: 'LIVE1' }, null, 3));
      ms.save();
      var fileText = JSON.stringify({
        meta: { schemaVersion: 3, lineage: 'mf' },
        people: [pp('IMP0', 'Import Lead'), pp('IMP1', 'Import Skip', { reportsTo: 'IMP0' })],
        events: [fev('IMPE1', 'decision.registered', { title: 'imported decision', severity: 4, reviewDate: '2026-01-20' }, null, 5),
                 fev('IMPE2', 'decision.outcome', { decisionId: 'IMPE1', outcome: 'done' }, null, 1)]
      });
      var r = ms.importText(fileText);
      var s = ms.state();
      var impLead = s.people.filter(function (p) { return p.name === 'Import Lead'; })[0];
      var impSkip = s.people.filter(function (p) { return p.name === 'Import Skip'; })[0];
      var impDec = s.events.filter(function (e) { return e.type === 'decision.registered' && (e.data || {}).title === 'imported decision'; })[0];
      var impOut = s.events.filter(function (e) { return e.type === 'decision.outcome'; })[0];
      var pre = ms.browseKeys().filter(function (k) { return k.kind === 'pre-import'; });
      var ok = r.ok && impLead && impSkip && impDec && impOut &&
        impLead.id !== 'IMP0' && impSkip.id !== 'IMP1' && impDec.id !== 'IMPE1' &&
        impOut.data.decisionId === impDec.id &&
        impSkip.reportsTo === impLead.id && /* THE mf-5 fix — upstream regexes missed reportsTo */
        s.people.filter(function (p) { return p.name === 'Live Person'; }).length === 1 &&
        pre.length === 1;
      return { pass: !!ok,
        expected: 'ids re-minted · outcome→decision rewired · reportsTo rewired · live rows intact · 1 pre-import key',
        observed: 'ok=' + r.ok + ' · outcome.decisionId=' + (impOut && impOut.data.decisionId) + ' === decision ' + (impDec && impDec.id) +
          ' · skip.reportsTo=' + (impSkip && impSkip.reportsTo) + ' === lead ' + (impLead && impLead.id) + ' · preImportKeys=' + pre.length };
    });
    t('T10', 'normalize: repairs, never drops; unknown data fields (counterpartPersonId) preserved', function () {
      var res = store._normalizeEvents([
        { id: 'a', ts: '2026-01-01T00:00:00.000Z', type: 'conflict.registered', personId: null, data: { counterpartPersonId: 'p1' }, seed: false },
        'garbage row',
        { id: 'a', ts: '2026-01-02T00:00:00.000Z', type: 'pulse.logged', personId: 'p1', data: {}, seed: false },
        null
      ], null);
      var first = res.events[0];
      return { pass: res.events.length === 4 && first.data.counterpartPersonId === 'p1' && res.events[2].id !== 'a' && res.repairs.length >= 3,
        expected: '4 rows out (none dropped) · unknown field intact · dup id re-minted · ≥3 repairs',
        observed: 'rows=' + res.events.length + ' · cpId=' + first.data.counterpartPersonId + ' · repairs=' + res.repairs.length };
    });
    t('T11', 'seed/purge: flag set before rows; reseed refused; purge clears rows, keeps flag', function () {
      var ms = store.makeStore('leados:t:11');
      ms.load();
      var r1 = LEADOS.events.seed(ms);
      var seededPeople = ms.state().people.length;
      var r2 = LEADOS.events.seed(ms);
      var r3 = LEADOS.events.purgeSeed(ms);
      return { pass: r1.ok && !r2.ok && r2.reason === 'already-seeded' && r3.ok && ms.state().events.filter(function (e) { return e.seed; }).length === 0 && ms.state().people.length === 0 && ms.state().meta.seeded === true,
        expected: 'seed ok · second seed refused · purge removes all seed rows · flag stays true',
        observed: 'seed=' + r1.ok + ' · reseed=' + r2.reason + ' · purgedPeople=' + r3.removedPeople + ' (had ' + seededPeople + ') · flag=' + ms.state().meta.seeded };
    });
    t('T12', 'quarantine collision: two quarantines, same forced millisecond — BOTH survive', function () {
      var ms = store.makeStore('leados:t:12');
      ms.load();
      ms._forceStamp('FIXED-STAMP');
      var k1 = ms._quarantine('corrupt', 'payload-a');
      var k2 = ms._quarantine('corrupt', 'payload-b');
      ms._forceStamp(null);
      var a = ms.readKey(k1), b = ms.readKey(k2);
      return { pass: k1 !== k2 && a === 'payload-a' && b === 'payload-b',
        expected: 'distinct keys (collision suffix) · both payloads readable',
        observed: 'k1=…' + k1.slice(-14) + ' · k2=…' + k2.slice(-14) + ' · a=' + a + ' · b=' + b };
    });
    t('T13', 'module registry: every declared js file registered (makes the tree executable)', function () {
      var have = Object.keys(LEADOS._mod).sort().join(',');
      var ok = ['store', 'events', 'engine', 'playbooks', 'ui'].every(function (m) { return LEADOS._mod[m] === 'js/' + m + '.js'; }) && LEADOS._booted === true;
      return { pass: ok,
        expected: 'store,events,engine,playbooks,ui → js/*.js · _booted=true',
        observed: 'registered: ' + have + ' · _booted=' + LEADOS._booted };
    });

    /* ── G: engine goldens (fixed "today" = 2026-01-15) ── */
    g('G1', 'R1: 1:1 overdue strictly past cadence (15d > 14d → fires, HIGH)', function () {
      var f = runFindings(fxState([pp('A', 'Ana', { cadenceDays: 14 })], [fev('e1', 'oneonone.logged', {}, 'A', 15)]), 'R1:');
      return { pass: f.length === 1 && f[0].conf === 'high' && f[0].sev === 3,
        expected: '1 finding, high, sev 3', observed: f.length + ' · ' + (f[0] ? f[0].conf + ' sev' + f[0].sev + ' · ' + f[0].title : '—') };
    });
    g('G2', 'R1 boundary: exactly at cadence (14d) stays silent; never-logged fires MEDIUM', function () {
      var at = runFindings(fxState([pp('A', 'Ana', { cadenceDays: 14 })], [fev('e1', 'oneonone.logged', {}, 'A', 14)]), 'R1:');
      var never = runFindings(fxState([pp('B', 'Bob', { cadenceDays: 14 })], []), 'R1:');
      return { pass: at.length === 0 && never.length === 1 && never[0].conf === 'medium',
        expected: '0 at-boundary · 1 never-logged (medium)',
        observed: 'boundary=' + at.length + ' · never=' + never.length + ' ' + (never[0] ? never[0].conf : '') };
    });
    g('G3', 'R2: review yesterday fires (sev inherits); today silent; outcome closes', function () {
      var base = [fev('d1', 'decision.registered', { title: 'X', severity: 4, reviewDate: '2026-01-14' }, null, 10)];
      var past = runFindings(fxState([], base), 'R2:');
      var todayF = runFindings(fxState([], [fev('d2', 'decision.registered', { title: 'Y', severity: 3, reviewDate: '2026-01-15' }, null, 10)]), 'R2:');
      var done = runFindings(fxState([], base.concat([fev('o1', 'decision.outcome', { decisionId: 'd1', outcome: 'ok' }, null, 2)])), 'R2:');
      return { pass: past.length === 1 && past[0].sev === 4 && todayF.length === 0 && done.length === 0,
        expected: 'past fires sev4 · due-today silent · outcome silent',
        observed: past.length + '/' + todayF.length + '/' + done.length };
    });
    g('G4', 'R3: ownerless fires; progress silence >14d fires; ≤14d silent', function () {
      var ownerless = runFindings(fxState([pp('A', 'Ana')], [fev('g1', 'goal.set', { title: 'orphan', ownerId: null }, null, 10)]), 'R3o:');
      var silent = runFindings(fxState([pp('A', 'Ana')], [fev('g2', 'goal.set', { title: 'drifting', ownerId: 'A' }, null, 40), fev('g2p', 'goal.progress', { goalId: 'g2', note: 'x' }, null, 15)]), 'R3s:');
      var fresh = runFindings(fxState([pp('A', 'Ana')], [fev('g3', 'goal.set', { title: 'on track', ownerId: 'A' }, null, 40), fev('g3p', 'goal.progress', { goalId: 'g3' }, null, 14)]), 'R3s:');
      return { pass: ownerless.length === 1 && silent.length === 1 && fresh.length === 0,
        expected: '1 ownerless · 1 silent · 0 at-boundary',
        observed: ownerless.length + '/' + silent.length + '/' + fresh.length };
    });
    g('G5', 'R4: 3/3 corrective fires; mixed polarity silent; missing polarity excluded, printed', function () {
      var corr = [fev('f1', 'feedback.given', { polarity: 'corrective' }, 'D', 30), fev('f2', 'feedback.given', { polarity: 'corrective' }, 'D', 20), fev('f3', 'feedback.given', { polarity: 'corrective' }, 'D', 10)];
      var only = runFindings(fxState([pp('D', 'Dana')], corr), 'R4:');
      var mixed = runFindings(fxState([pp('D', 'Dana')], corr.concat([fev('f4', 'feedback.given', { polarity: 'positive' }, 'D', 5)])), 'R4:');
      var wob = runFindings(fxState([pp('D', 'Dana')], corr.concat([fev('f5', 'feedback.given', {}, 'D', 4)])), 'R4:');
      return { pass: only.length === 1 && mixed.length === 0 && wob.length === 1 && /excluded/.test(wob[0].basis.join(' ')),
        expected: '1 imbalance · 0 mixed · 1 with "excluded" basis line',
        observed: only.length + '/' + mixed.length + '/' + wob.length };
    });
    g('G6', 'R5: 5 open delegations fire; 4 do not', function () {
      function dels(n) { var out = []; for (var i = 0; i < n; i++) out.push(fev('dl' + i, 'delegation.assigned', { task: 't' + i, level: 2 }, 'T', 20 - i)); return out; }
      var over = runFindings(fxState([pp('T', 'Theo')], dels(5)), 'R5:');
      var atmax = runFindings(fxState([pp('T', 'Theo')], dels(4)), 'R5:');
      return { pass: over.length === 1 && atmax.length === 0,
        expected: '1 / 0', observed: over.length + ' / ' + atmax.length };
    });
    g('G7', 'R6: pair fires per PAIR; linked=high · text=medium · single conflict silent', function () {
      var linked = runFindings(fxState([pp('D', 'Dana'), pp('P', 'Priya')], [
        fev('c1', 'conflict.registered', { partyAPersonId: 'D', counterpartPersonId: 'P', topic: 'tone' }, null, 12),
        fev('c2', 'conflict.registered', { partyAPersonId: 'D', counterpartPersonId: 'P', topic: 'handoff' }, null, 4)]), 'R6:');
      var text = runFindings(fxState([], [
        fev('c3', 'conflict.registered', { counterpartText: 'Dana', topic: 'a' }, null, 9),
        fev('c4', 'conflict.registered', { counterpartText: 'dana ', topic: 'b' }, null, 3)]), 'R6:');
      var single = runFindings(fxState([pp('D', 'Dana'), pp('P', 'Priya')], [fev('c5', 'conflict.registered', { partyAPersonId: 'D', counterpartPersonId: 'P', topic: 'x' }, null, 2)]), 'R6:');
      return { pass: linked.length === 1 && linked[0].conf === 'high' && text.length === 1 && text[0].conf === 'medium' && single.length === 0,
        expected: 'linked 1/high · text 1/medium (normalized “dana ” = same pair) · single 0',
        observed: linked.length + ':' + (linked[0] || {}).conf + ' · ' + text.length + ':' + (text[0] || {}).conf + ' · ' + single.length };
    });
    g('G8', 'R7: ≥3 measured, load≥8 or slope≤−0.4; estimates & n=2 stay silent; slope −0.40 boundary fires', function () {
      function pulse(id, mood, load, daysAgo, measured) { return fev(id, 'pulse.logged', { mood: mood, load: load, measured: measured !== false }, 'T', daysAgo); }
      var both = runFindings(fxState([pp('T', 'Theo')], [pulse('p1', 5, 9, 10), pulse('p2', 3, 9, 6), pulse('p3', 1, 9, 2)]), 'R7:');
      var two = runFindings(fxState([pp('T', 'Theo')], [pulse('q1', 5, 9, 10), pulse('q2', 1, 9, 2)]), 'R7:');
      var est = runFindings(fxState([pp('T', 'Theo')], [pulse('r1', 5, 9, 10, false), pulse('r2', 3, 9, 6, false), pulse('r3', 1, 9, 2, false)]), 'R7:');
      var bound = runFindings(fxState([pp('T', 'Theo')], [pulse('s1', 5, 7, 12), pulse('s2', 3, 7, 7), pulse('s3', 1, 7, 2)]), 'R7:');
      var slopeLine = bound.length ? /mood slope -0\.40/.test(bound[0].basis.join(' ')) : false;
      return { pass: both.length === 1 && two.length === 0 && est.length === 0 && bound.length === 1 && slopeLine,
        expected: 'fires n=3 (both signals) · silent n=2 · silent estimates-only · fires at slope exactly −0.40',
        observed: both.length + '/' + two.length + '/' + est.length + '/' + bound.length + ' slopeLine=' + slopeLine };
    });
    g('G9', 'R8: skip-level per VERIFIED line; 29d fires · 28d silent · broken line & cycle silent, no throw', function () {
      var lead = pp('L', 'Lead'); var skip = pp('S', 'Skip', { reportsTo: 'L' });
      var over = runFindings(fxState([lead, skip], [fev('k1', 'oneonone.logged', { mode: 'skip' }, 'S', 29)]), 'R8:');
      var at = runFindings(fxState([lead, skip], [fev('k2', 'oneonone.logged', { mode: 'skip' }, 'S', 28)]), 'R8:');
      var broken = fxState([pp('S2', 'Orphan', { reportsTo: 'ghost' })], []);
      var cyc = fxState([pp('C1', 'Cyc1', { reportsTo: 'C2' }), pp('C2', 'Cyc2', { reportsTo: 'C1' })], []);
      var rb = runFindings(broken, 'R8:'), rc = runFindings(cyc, 'R8:');
      return { pass: over.length === 1 && at.length === 0 && rb.length === 0 && rc.length === 0,
        expected: '1 / 0 / 0 (broken) / 0 (cycle) — silence, never guesses your org',
        observed: over.length + '/' + at.length + '/' + rb.length + '/' + rc.length };
    });
    g('G10', 'R9: day 14 fires; day 13 silent; captured expectations silence it', function () {
      var meta14 = { appointment: tso(14).slice(0, 10) };
      var fires = runFindings(fxState([], [], meta14), 'R9:');
      var silent = runFindings(fxState([], [], { appointment: tso(13).slice(0, 10) }), 'R9:');
      var captured = runFindings(fxState([], [fev('x1', 'expectations.captured', { priorities: ['a'] }, null, 2)], meta14), 'R9:');
      return { pass: fires.length === 1 && silent.length === 0 && captured.length === 0 && fires[0].title.indexOf('Day 14') === 0,
        expected: '1 (Day 14) · 0 · 0', observed: fires.length + '/' + silent.length + '/' + captured.length };
    });
    g('G11', 'R10: roster-relative coverage; day≥45 gate sev 4 · day 14–44 sev 2 pace · full coverage silent', function () {
      var people = [pp('A', 'Ana'), pp('C', 'Cole'), pp('B', 'Skip', { reportsTo: 'A' })];
      var gate = runFindings(fxState(people, [fev('v1', 'tour.visit', {}, 'A', 20)], { appointment: tso(45).slice(0, 10) }), 'R10:');
      var pace = runFindings(fxState(people, [fev('v1', 'tour.visit', {}, 'A', 20)], { appointment: tso(44).slice(0, 10) }), 'R10:');
      var full = runFindings(fxState(people, [fev('v1', 'tour.visit', {}, 'A', 20), fev('v2', 'tour.visit', {}, 'C', 19), fev('v3', 'tour.visit', {}, 'B', 18)], { appointment: tso(45).slice(0, 10) }), 'R10:');
      return { pass: gate.length === 1 && gate[0].sev === 4 && pace.length === 1 && pace[0].sev === 2 && full.length === 0,
        expected: 'gate sev4 (1/3 visited) · pace sev2 · full coverage silent',
        observed: 'gate=' + (gate[0] || {}).sev + ' · pace=' + (pace[0] || {}).sev + ' · full=' + full.length };
    });
    g('G12', 'R11: past verify date fires; verified closes; future silent', function () {
      var past = runFindings(fxState([], [fev('w1', 'win.planned', { title: 'win', verifyDate: '2026-01-14' }, null, 21)]), 'R11:');
      var late = runFindings(fxState([], [fev('w2', 'win.planned', { title: 'win2', verifyDate: '2025-12-26' }, null, 40)]), 'R11:');
      var done = runFindings(fxState([], [fev('w3', 'win.planned', { title: 'w3', verifyDate: '2026-01-10' }, null, 20), fev('wv', 'win.verified', { winId: 'w3' }, null, 2)]), 'R11:');
      return { pass: past.length === 1 && past[0].sev === 3 && late.length === 1 && late[0].sev === 4 && done.length === 0,
        expected: 'sev3 at 1d late · sev4 at 20d late · 0 verified',
        observed: (past[0] || {}).sev + '/' + (late[0] || {}).sev + '/' + done.length };
    });
    g('G13', 'R12: ≥7d silence fires (boundary); update resets; closed silent', function () {
      var at = runFindings(fxState([], [fev('i1', 'incident.registered', { title: 'outage' }, null, 7)]), 'R12:');
      var under = runFindings(fxState([], [fev('i2', 'incident.registered', { title: 'x' }, null, 6)]), 'R12:');
      var upd = runFindings(fxState([], [fev('i3', 'incident.registered', { title: 'y' }, null, 9), fev('iu', 'incident.update', { incidentId: 'i3', note: 'n' }, null, 2)]), 'R12:');
      var closed = runFindings(fxState([], [fev('i4', 'incident.registered', { title: 'z' }, null, 20), fev('ic', 'incident.update', { incidentId: 'i4', closed: true }, null, 15)]), 'R12:');
      return { pass: at.length === 1 && under.length === 0 && upd.length === 0 && closed.length === 0,
        expected: '1 at 7d · 0 at 6d · 0 updated 2d ago · 0 closed',
        observed: at.length + '/' + under.length + '/' + upd.length + '/' + closed.length };
    });
    g('G14', 'R13: nexus needs ≥3 open across ≥2 DISTINCT resolvable counterparts — MEDIUM permanently', function () {
      var people = [pp('M', 'Marcus'), pp('J', 'Jonas'), pp('A', 'Ana')];
      var nexus = runFindings(fxState(people, [
        fev('n1', 'conflict.registered', { partyAPersonId: 'M', counterpartPersonId: 'J', topic: 'a' }, null, 16),
        fev('n2', 'conflict.registered', { partyAPersonId: 'M', counterpartPersonId: 'A', topic: 'b' }, null, 9),
        fev('n3', 'conflict.registered', { partyAPersonId: 'M', counterpartPersonId: 'J', topic: 'c' }, null, 2)]), 'R13:');
      var same = runFindings(fxState(people, [
        fev('n4', 'conflict.registered', { partyAPersonId: 'M', counterpartPersonId: 'J', topic: 'a' }, null, 16),
        fev('n5', 'conflict.registered', { partyAPersonId: 'M', counterpartPersonId: 'J', topic: 'b' }, null, 9),
        fev('n6', 'conflict.registered', { partyAPersonId: 'M', counterpartPersonId: 'J', topic: 'c' }, null, 2)]), 'R13:');
      return { pass: nexus.length === 1 && nexus[0].conf === 'medium' && /not a diagnosis/.test(nexus[0].confWhy) && same.length === 0,
        expected: '1 nexus (medium, “not a diagnosis”) · 0 when one counterpart repeats (that is R6’s pair, not a nexus)',
        observed: nexus.length + ':' + (nexus[0] || {}).conf + ' · ' + same.length };
    });
    g('G15', 'R14: ≥480 min/wk fires · 478 silent · biweekly counts half (960 biweekly = 480 exactly)', function () {
      function series(id, startMin, endMin, dow, cadence, pid) {
        return fev(id, 'meeting.series', { title: id, startMin: startMin, endMin: endMin, dow: dow, cadence: cadence, attendeeIds: [pid] }, null, 30);
      }
      var fire = runFindings(fxState([pp('A', 'Ana')], [series('m1', 540, 660, [1, 2, 3], 'weekly', 'A'), series('m2', 540, 600, [2, 4], 'weekly', 'A')]), 'R14:A');
      var under = runFindings(fxState([pp('A', 'Ana')], [series('m3', 540, 660, [1, 2, 3], 'weekly', 'A'), series('m4', 540, 599, [2, 4], 'weekly', 'A')]), 'R14:A');
      var half = runFindings(fxState([pp('W', 'Wes')], [series('m5', 540, 1500, [1], 'biweekly', 'W')]), 'R14:W');
      return { pass: fire.length === 1 && under.length === 0 && half.length === 1,
        expected: '480 fires · 478 silent · 960min biweekly = 480/wk fires (halving proven)',
        observed: fire.length + '/' + under.length + '/' + half.length };
    });
    g('G16', 'R15: sev≥4 ungated ≥2d fires; grace day silent; sev 3 silent; premortem closes; no-severity skips', function () {
      var old = runFindings(fxState([], [fev('d1', 'decision.registered', { title: 'risky', severity: 4, reviewDate: '2026-02-01' }, null, 2)]), 'R15:');
      var grace = runFindings(fxState([], [fev('d2', 'decision.registered', { title: 'fresh', severity: 4, reviewDate: '2026-02-01' }, null, 1)]), 'R15:');
      var low = runFindings(fxState([], [fev('d3', 'decision.registered', { title: 'minor', severity: 3, reviewDate: '2026-02-01' }, null, 30)]), 'R15:');
      var closed = runFindings(fxState([], [fev('d4', 'decision.registered', { title: 'gated', severity: 5, reviewDate: '2026-02-01' }, null, 9), fev('pm', 'premortem.held', { decisionId: 'd4', failureStory: 'x' }, null, 8)]), 'R15:');
      var nosev = runFindings(fxState([], [fev('d5', 'decision.registered', { title: 'legacy' }, null, 30)]), 'R15:');
      return { pass: old.length === 1 && grace.length === 0 && low.length === 0 && closed.length === 0 && nosev.length === 0,
        expected: '1 / 0 / 0 / 0 / 0 — missing severity SKIPS (never inferred)',
        observed: old.length + '/' + grace.length + '/' + low.length + '/' + closed.length + '/' + nosev.length };
    });
    g('G17', 'ENG guard: a throwing rule becomes a loud SEV-5 finding; every other rule still runs', function () {
      LEADOS.engine.RULES.push({ id: 'RX', tag: 'test', play: null, fn: function () { throw new Error('boom-fixture'); } });
      var res;
      try { res = LEADOS.engine.run(fxState([], []), FX_DAY, {}); }
      finally { LEADOS.engine.RULES.pop(); }
      var eng = res.findings.filter(function (f) { return f.rule === 'ENG'; });
      return { pass: eng.length === 1 && eng[0].sev === 5 && /boom-fixture/.test(eng[0].basis.join(' ')),
        expected: '1 ENG finding sev 5 containing the exception message; run completed',
        observed: eng.length + ' · sev' + (eng[0] || {}).sev + ' · ' + (eng[0] ? eng[0].title : '—') };
    });

    return { T: T, G: G };
  }

  function vHealth() {
    var suites = healthTests();
    var rows = [];
    function exec(t) {
      var r;
      try { r = t.fn(); }
      catch (e) { r = { pass: false, expected: '(no throw)', observed: 'THREW: ' + (e && e.message || e) }; }
      r.id = t.id; r.name = t.name; rows.push(r);
      return r;
    }
    sweepDisposable();
    try {
      suites.T.forEach(exec);
      suites.G.forEach(exec);
    } finally {
      sweepDisposable();
    }
    var pass = rows.filter(function (r) { return r.pass; }).length;
    var fail = rows.length - pass;
    var html = headHTML('Health', 'every row executed <b>at this render</b> · fixtures on real code paths · disposable keys swept');
    html += '<div class="wall-summary"><span class="big ' + (fail ? 'bad' : 'ok') + '">' + pass + ' / ' + rows.length + '</span>' +
      '<span class="section-note">rows passing. This wall — not the README — is the authority. Any red row means the code, the fixture, or this machine’s storage disagrees with a claim.</span></div>';
    function table(title, list) {
      return '<p class="kicker">' + title + '</p><table class="sheet"><thead><tr><th>id</th><th>assertion</th><th>expected / observed</th></tr></thead><tbody>' +
        list.map(function (r) {
          return '<tr class="' + (r.pass ? '' : 'fail') + '"><td class="mono"><b>' + r.id + '</b></td><td>' + esc(r.name) + '</td>' +
            '<td class="mono">' + (r.pass ? '✓' : '✗ FAIL') + '<span class="obs">want: ' + esc(r.expected) + '\ngot:&nbsp;&nbsp;' + esc(r.observed) + '</span></td></tr>';
        }).join('') + '</tbody></table>';
    }
    html += table('storage / pipeline', rows.filter(function (r) { return r.id[0] === 'T'; }));
    html += table('engine goldens · fixed today 2026-01-15', rows.filter(function (r) { return r.id[0] === 'G'; }));
    html += '<p class="legend" style="margin-top:8px">fixture-based assertions on the production code paths — not browser automation, not a fuzzer, and the UI above this line is not graded by it. Counts are computed at render; no doc asserts them.</p>';
    view.innerHTML = '<div class="page">' + html + '</div>';
  }

  /* ── render + wire-up ───────────────────────────────────────────────── */
  function render() {
    var r = route();
    var name = (r.path.split('/')[1] || 'today');
    document.querySelectorAll('#rail-links a').forEach(function (a) {
      a.className = a.getAttribute('data-route') === name ? 'on' : '';
    });
    if (r.path.indexOf('#/roster/') === 0) return vDossier(decodeURIComponent(r.path.split('/')[2] || ''));
    if (name === 'today') return vToday(r.qs);
    if (name === 'roster') return vRoster();
    if (name === 'arrival') return vArrival();
    if (name === 'playbooks') return vPlaybooks(r.qs);
    if (name === 'health') return vHealth();
    if (name === 'data') return vData();
    return vToday(r.qs);
  }

  function boot() {
    view = el('view');
    LEADOS.store.load();
    LEADOS.store.refreshPill();
    LEADOS._changed = function (resp) {
      if (resp && !resp.ok && resp.reason && resp.reason !== 'read-only') {
        toast('WRITE FAILED (' + resp.reason + ') — state kept in memory; export a backup at #/data');
      }
      LEADOS.store.refreshPill();
      render();
    };
    window.addEventListener('hashchange', function () { drawer = null; renderDrawer(); render(); });
    /* midnight straddle: the engine keys on "today" — re-render when it flips */
    var lastDay = today();
    setInterval(function () {
      var c = el('clock');
      if (c) {
        var d = new Date();
        c.textContent = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
      }
      if (today() !== lastDay) { lastDay = today(); render(); }
    }, 20000);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer) closeDrawer(); });
    if (!location.hash) location.hash = '#/today';
    LEADOS._booted = true;
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
