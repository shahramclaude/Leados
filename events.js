/* LeadOS pt-4 - js/events.js
   Event registry: the contract every append must satisfy before it may enter
   the append-only store. Nothing enters localStorage that is not listed here. */
(function () {
  'use strict';
  const LeadOS = (window.LeadOS = window.LeadOS || {});

  // Universal leadership domain map (15 domains, full coverage).
  const DOMAINS = [
    { id: 'engineering',     label: 'Engineering',           hue: 214 },
    { id: 'finance',         label: 'Finance',               hue: 152 },
    { id: 'sales',           label: 'Sales',                 hue: 28  },
    { id: 'product',         label: 'Product Strategy',      hue: 262 },
    { id: 'operations',      label: 'Operations',            hue: 190 },
    { id: 'people',          label: 'People & HR',           hue: 326 },
    { id: 'marketing',       label: 'Marketing',             hue: 296 },
    { id: 'manufacturing',   label: 'Manufacturing',         hue: 42  },
    { id: 'design',          label: 'Design',                hue: 348 },
    { id: 'rd',              label: 'R&D',                   hue: 232 },
    { id: 'legal',           label: 'Legal & Compliance',    hue: 4   },
    { id: 'customerSuccess', label: 'Customer Success',      hue: 162 },
    { id: 'supplyChain',     label: 'Supply Chain',          hue: 62  },
    { id: 'executive',       label: 'Executive & Board',     hue: 222 },
    { id: 'bizdev',          label: 'Business Development',  hue: 102 }
  ];
  const DOMAIN_IDS = DOMAINS.map(function (d) { return d.id; });

  const REVIEW_KINDS = ['revenue', 'ops', 'board', 'compliance'];

  // type -> { require, optional, enums, numbers }
  const REGISTRY = {
    'store.initialized':      { require: ['schemaVersion', 'lineageTag'], optional: [], numbers: ['schemaVersion'] },
    'settings.changed':       { require: ['key', 'value'], optional: [] },
    'objective.created':      { require: ['id', 'domain', 'title'], optional: ['owner', 'horizon'], enums: { domain: DOMAIN_IDS } },
    'objective.statusChanged':{ require: ['id', 'status'], optional: [], enums: { status: ['active', 'paused', 'done', 'archived'] } },
    'kr.created':             { require: ['id', 'objectiveId', 'title', 'target', 'unit'], optional: ['baseline'], numbers: ['target', 'baseline'] },
    'kr.progressLogged':      { require: ['id', 'value'], optional: ['note'], numbers: ['value'] },
    'task.created':           { require: ['id', 'domain', 'title'], optional: ['dueAt', 'owner'], enums: { domain: DOMAIN_IDS }, numbers: ['dueAt'] },
    'task.completed':         { require: ['id'], optional: ['note'] },
    'decision.proposed':      { require: ['id', 'domain', 'question', 'options', 'owner', 'reversibility'], optional: ['dueAt'], enums: { domain: DOMAIN_IDS, reversibility: ['reversible', 'irreversible'] }, numbers: ['dueAt'] },
    'decision.decided':       { require: ['id', 'choice', 'rationale'], optional: [] },
    'risk.raised':            { require: ['id', 'domain', 'title', 'likelihood', 'impact'], optional: ['mitigation'], enums: { domain: DOMAIN_IDS }, numbers: ['likelihood', 'impact'] },
    'risk.statusChanged':     { require: ['id', 'status'], optional: [], enums: { status: ['open', 'mitigating', 'mitigated', 'accepted', 'closed'] } },
    'review.scheduled':       { require: ['id', 'kind', 'dueAt'], optional: ['domain'], enums: { kind: REVIEW_KINDS }, numbers: ['dueAt'] },
    'review.completed':       { require: ['id', 'outcome'], optional: ['notes'] },
    'playbook.applied':       { require: ['id', 'domain', 'playbookId'], optional: [], enums: { domain: DOMAIN_IDS } }
  };

  function isBlank(v) { return v === undefined || v === null || v === ''; }

  // Append-gate validation. Store calls this before every append.
  function validate(type, payload) {
    const errors = [];
    const spec = REGISTRY[type];
    if (!spec) { return { ok: false, errors: ['unknown event type: ' + String(type)] }; }
    if (!payload || typeof payload !== 'object') { return { ok: false, errors: ['payload must be an object'] }; }

    spec.require.forEach(function (k) { if (isBlank(payload[k])) errors.push('missing required field: ' + k); });

    Object.keys(payload).forEach(function (k) {
      if (spec.require.indexOf(k) === -1 && spec.optional.indexOf(k) === -1) {
        errors.push('field not in registry contract: ' + k);
      }
    });

    if (spec.enums) {
      Object.keys(spec.enums).forEach(function (k) {
        if (!isBlank(payload[k]) && spec.enums[k].indexOf(payload[k]) === -1) {
          errors.push('field ' + k + ' must be one of [' + spec.enums[k].join(', ') + ']');
        }
      });
    }

    if (spec.numbers) {
      spec.numbers.forEach(function (k) {
        if (!isBlank(payload[k]) && typeof payload[k] !== 'number') errors.push('field ' + k + ' must be a number');
      });
    }

    if (type === 'settings.changed' && errors.length === 0) {
      const defs = LeadOS.store && LeadOS.store.ALL_SETTING_DEFAULTS;
      if (defs) {
        if (!(payload.key in defs)) errors.push('unknown setting key: ' + String(payload.key));
        else if (typeof payload.value !== typeof defs[payload.key]) errors.push('setting ' + payload.key + ' must be a ' + typeof defs[payload.key]);
        else if (typeof payload.value === 'number' && (!isFinite(payload.value) || payload.value <= 0)) errors.push('setting ' + payload.key + ' must be a positive finite number');
      }
    }

    if ((type === 'risk.raised') && errors.length === 0) {
      ['likelihood', 'impact'].forEach(function (k) {
        if (payload[k] < 1 || payload[k] > 5) errors.push(k + ' must be between 1 and 5');
      });
    }

    if (type === 'decision.proposed' && errors.length === 0) {
      if (!Array.isArray(payload.options) || payload.options.length < 2) errors.push('options must be an array of at least 2 choices');
    }

    return { ok: errors.length === 0, errors: errors };
  }

  function domainLabel(id) {
    const d = DOMAINS.find(function (x) { return x.id === id; });
    return d ? d.label : id;
  }
  function domainHue(id) {
    const d = DOMAINS.find(function (x) { return x.id === id; });
    return d ? d.hue : 220;
  }

  LeadOS.events = { REGISTRY: REGISTRY, DOMAINS: DOMAINS, DOMAIN_IDS: DOMAIN_IDS, REVIEW_KINDS: REVIEW_KINDS, validate: validate, domainLabel: domainLabel, domainHue: domainHue };
})();
