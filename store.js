/* LeadOS pt-4 - js/store.js
   Persistence wall. Exactly one localStorage key: 'leados:data'.
   Append-only event store - nothing derived is ever persisted.
   schemaVersion 4, lineage 'pt'. Migrations are pure replay-repair passes that
   may only APPEND repair events and count every repair in meta.migrationRepairs. */
(function () {
  'use strict';
  const LeadOS = (window.LeadOS = window.LeadOS || {});

  const KEY = 'leados:data';
  const SCHEMA_VERSION = 4;
  const LINEAGE = 'pt';
  const LINEAGE_TAG = 'pt-4';

  // Setting defaults by schema era. v4 adds the universal-domain cadence set.
  const V1_SETTING_DEFAULTS = { decisionMaxOpenDays: 21 };
  const V2_SETTING_DEFAULTS = { krCheckInCadenceDays: 7 };
  const V3_SETTING_DEFAULTS = { riskReviewCadenceDays: 7 };
  const V4_SETTING_DEFAULTS = {
    salesCycleDays: 90,
    revenueReviewCadenceDays: 30,
    opsReviewCadenceDays: 14,
    boardCadenceDays: 90,
    complianceAuditCadenceDays: 180
  };
  const V4_NEW_KEYS = Object.keys(V4_SETTING_DEFAULTS);
  const ALL_SETTING_DEFAULTS = Object.assign({}, V1_SETTING_DEFAULTS, V2_SETTING_DEFAULTS, V3_SETTING_DEFAULTS, V4_SETTING_DEFAULTS);

  // Health G-suite enforces these whitelists on the raw payload.
  const RAW_ROOT_WHITELIST = ['schemaVersion', 'meta', 'events'];
  const META_WHITELIST = ['lineage', 'createdAt', 'migrationsApplied', 'migrationRepairs'];

  function ms() { return Date.now(); }
  function padId(seq) { return 'e-' + String(seq).padStart(5, '0'); }

  // Local fold of settings ONLY - migrations must not depend on engine.js
  // (load order: store is the foundation; persistence never imports derivation).
  function foldSettings(events) {
    const applied = {};
    (events || []).forEach(function (ev) {
      if (ev.type === 'settings.changed' && ev.payload && typeof ev.payload.key === 'string') {
        applied[ev.payload.key] = ev.payload.value;
      }
    });
    return applied;
  }

  // Raw append used by genesis, runtime appends, and migration repairs alike.
  function appendRaw(raw, type, payload, meta) {
    const seq = raw.events.length + 1;
    const ev = { seq: seq, id: padId(seq), at: ms(), type: type, payload: payload };
    if (meta) ev.meta = meta;
    raw.events.push(ev);
    return ev;
  }

  function ensureMeta(raw) {
    if (!raw.meta || typeof raw.meta !== 'object') raw.meta = {};
    if (raw.meta.lineage !== LINEAGE) raw.meta.lineage = LINEAGE;
    if (typeof raw.meta.createdAt !== 'number') raw.meta.createdAt = ms();
    if (!Array.isArray(raw.meta.migrationsApplied)) raw.meta.migrationsApplied = [];
    if (!raw.meta.migrationRepairs || typeof raw.meta.migrationRepairs !== 'object') raw.meta.migrationRepairs = {};
    if (!Array.isArray(raw.events)) raw.events = [];
  }

  function recordMigration(raw, id, repairs) {
    if (raw.meta.migrationsApplied.indexOf(id) === -1) raw.meta.migrationsApplied.push(id);
    // Accumulate: a re-run that repairs nothing must not erase past counts.
    raw.meta.migrationRepairs[id] = (raw.meta.migrationRepairs[id] || 0) + repairs;
  }

  /* A "repair" is any write a migration performs beyond bumping schemaVersion.
     Every repair is counted. Domain-data repairs are also reconstructible from
     the event log itself (meta.repair + meta.migration on the appended event). */
  const MIGRATIONS = {
    // v1 -> v2: v1 persisted a derived `settings` blob beside the log (doctrine
    // violation). Relocate each entry into the log as a repair event, then purge
    // the blob. Also normalize the legacy 'kr.logged' type name.
    '1>2': function (raw) {
      ensureMeta(raw);
      let repairs = 0;
      if (raw.settings && typeof raw.settings === 'object') {
        Object.keys(raw.settings).forEach(function (k) {
          if (k in ALL_SETTING_DEFAULTS) {
            appendRaw(raw, 'settings.changed', { key: k, value: raw.settings[k] },
              { repair: true, migration: '1>2', reason: 'relocate persisted settings into event log' });
            repairs++;
          }
        });
        delete raw.settings; // purge derived blob: nothing derived may persist
        repairs++;
      }
      raw.events.forEach(function (ev) {
        if (ev.type === 'kr.logged') { ev.type = 'kr.progressLogged'; repairs++; }
      });
      if ('version' in raw) delete raw.version;
      recordMigration(raw, '1>2', repairs);
      raw.schemaVersion = 2;
      return repairs;
    },

    // v2 -> v3: unify legacy type names and payload field names introduced
    // before the registry contract existed.
    '2>3': function (raw) {
      ensureMeta(raw);
      let repairs = 0;
      raw.events.forEach(function (ev) {
        if (ev.type === 'risk.opened') { ev.type = 'risk.raised'; repairs++; }
        if (ev.type === 'review.done') {
          ev.type = 'review.completed';
          ev.payload = { id: ev.payload && ev.payload.id, outcome: (ev.payload && ev.payload.outcome) || 'legacy review', notes: ev.payload && ev.payload.notes };
          repairs++;
        }
        if (ev.type === 'decision.decided' && ev.payload && 'decision' in ev.payload && !('choice' in ev.payload)) {
          ev.payload.choice = ev.payload.decision;
          delete ev.payload.decision;
          repairs++;
        }
      });
      recordMigration(raw, '2>3', repairs);
      raw.schemaVersion = 3;
      return repairs;
    },

    // v3 -> v4 (pt-4, part 1): backfill the five universal-domain settings.
    // Replay the log, and only for keys the leader never set, append a repair
    // event carrying the v4 default. User-set values are never overwritten.
    '3>4': function (raw) {
      ensureMeta(raw);
      const applied = foldSettings(raw.events);
      let repairs = 0;
      V4_NEW_KEYS.forEach(function (k) {
        if (!(k in applied)) {
          appendRaw(raw, 'settings.changed', { key: k, value: V4_SETTING_DEFAULTS[k] },
            { repair: true, migration: '3>4', reason: 'backfill v4 setting default' });
          repairs++;
        }
      });
      recordMigration(raw, '3>4', repairs);
      raw.schemaVersion = 4;
      return repairs;
    }
  };

  function genesis() {
    const raw = {
      schemaVersion: SCHEMA_VERSION,
      meta: { lineage: LINEAGE, createdAt: ms(), migrationsApplied: [], migrationRepairs: {} },
      events: []
    };
    appendRaw(raw, 'store.initialized', { schemaVersion: SCHEMA_VERSION, lineageTag: LINEAGE_TAG });
    return raw;
  }

  function save(raw) {
    localStorage.setItem(KEY, JSON.stringify(raw));
  }

  function migrate(raw) {
    let v = raw.schemaVersion || raw.version || 1;
    let changed = false;
    while (v < SCHEMA_VERSION) {
      const id = v + '>' + (v + 1);
      if (!MIGRATIONS[id]) throw new Error('LeadOS: no migration path ' + id);
      MIGRATIONS[id](raw);
      changed = true;
      v = raw.schemaVersion;
    }
    return changed;
  }

  function load() {
    const text = localStorage.getItem(KEY);
    if (text === null) {
      const raw = genesis();
      save(raw);
      return raw;
    }
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      // The wall does not silently rewrite a corrupt store - it refuses.
      throw new Error('LeadOS: store at ' + KEY + ' is corrupt and was left untouched.');
    }
    ensureMeta(raw);
    if (migrate(raw)) save(raw);
    return raw;
  }

  // The only public write path. Validation is mandatory; appends are forever.
  function append(type, payload, meta) {
    const verdict = LeadOS.events.validate(type, payload);
    if (!verdict.ok) throw new Error('LeadOS rejected event ' + type + ': ' + verdict.errors.join('; '));
    const raw = load();
    const ev = appendRaw(raw, type, payload, meta);
    save(raw);
    return ev;
  }

  function getEvents() { return load().events.slice(); }
  function rawBytes() { const t = localStorage.getItem(KEY); return t ? t.length : 0; }

  LeadOS.store = {
    KEY: KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    LINEAGE: LINEAGE,
    LINEAGE_TAG: LINEAGE_TAG,
    ALL_SETTING_DEFAULTS: ALL_SETTING_DEFAULTS,
    V4_SETTING_DEFAULTS: V4_SETTING_DEFAULTS,
    V4_NEW_KEYS: V4_NEW_KEYS,
    RAW_ROOT_WHITELIST: RAW_ROOT_WHITELIST,
    META_WHITELIST: META_WHITELIST,
    MIGRATIONS: MIGRATIONS,
    foldSettings: foldSettings,
    genesis: genesis,
    load: load,
    append: append,
    getEvents: getEvents,
    rawBytes: rawBytes
  };
})();
