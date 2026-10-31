/**
 * app/core/domain/interfaceSchema.js — Schema v68 persistence & fail-closed
 * normalizers for the Cross-Boundary Interface, Queue-Network & Operating Pact
 * Terminal (`#/interfaces`).
 *
 * Three collections:
 *   interfacePacts    declared bilateral operating pacts (`sourceUnit -> targetUnit`),
 *                     Team Topologies / Coasean interaction mode, queue-network
 *                     arrival/service/rework parameters, symmetric give-get
 *                     commitments, and dated bilateral exchange logs.
 *   interfaceAudits   content-free, aggregate-only prospective compliance /
 *                     redesign forecasts frozen before `reviewOn` and graded
 *                     irreversibly once after `reviewOn` with Brier (1950).
 *   interfaceMarkers  bounded idempotency markers for RULE-INT-01..06.
 *
 * Honesty invariants:
 *   - Fail closed: an unreadable pact or audit is dropped with a warning, never
 *     silently zero-filled.
 *   - Missing money (`weeklyDelayPrice`) stays `null`, never `0`, and requires a
 *     3-letter ISO currency code.
 *   - `interfaceAudits` stores zero prose, zero personal names, and zero titles.
 */

export const INTERFACE_MODES = Object.freeze([
  'x-as-a-service',
  'collaboration',
  'facilitating',
  'gatekeeper',
  'ad-hoc',
]);

export const PACT_STATUSES = Object.freeze(['active', 'renegotiating', 'retired']);
export const INTERFACE_PACT_CAP = 60;
export const INTERFACE_AUDIT_CAP = 60;
export const INTERFACE_EXCHANGE_CAP = 120;
export const INTERFACE_MARKER_CAP = 400;

const LINKABLE_EXCHANGE_TYPES = new Set([
  'case',
  'decision',
  'delegation',
  'negotiation',
  'dependency',
]);

function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function iso(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function text(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function finite(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function clampOrDefault(value, min, max, fallback) {
  const n = finite(value, min, max);
  return n === null ? fallback : n;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function normalizeExchange(raw, index, pactTurnaround, state, todayDay, warnings, pactTitle) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const recordedOn = day(raw.recordedOn);
  if (!recordedOn || (todayDay && recordedOn > todayDay)) {
    warnings.push(`Boundary pacts: dropped a missing or future-dated exchange on “${pactTitle}”.`);
    return null;
  }
  const id = text(raw.id, 60) || `iex-${index + 1}`;
  if (typeof raw.intakeClean !== 'boolean') {
    warnings.push(`Boundary pacts: dropped exchange ${id} on “${pactTitle}” without an explicit intakeClean flag.`);
    return null;
  }
  const turnaroundDays = raw.turnaroundDays === null || raw.turnaroundDays === undefined || raw.turnaroundDays === ''
    ? null
    : finite(raw.turnaroundDays, 0, 365);
  if (raw.turnaroundDays !== null && raw.turnaroundDays !== undefined && raw.turnaroundDays !== '' && turnaroundDays === null) {
    warnings.push(`Boundary pacts: dropped exchange ${id} on “${pactTitle}” with an invalid turnaround duration.`);
    return null;
  }
  let metSla = null;
  if (typeof raw.metSla === 'boolean') {
    metSla = raw.metSla;
  } else if (turnaroundDays !== null) {
    metSla = turnaroundDays <= pactTurnaround;
  }
  const bounced = raw.bounced === true;
  let linkedType = null;
  let linkedId = null;
  if (raw.linkedType && LINKABLE_EXCHANGE_TYPES.has(raw.linkedType) && typeof raw.linkedId === 'string') {
    const candidateId = text(raw.linkedId, 80);
    const collectionMap = {
      case: state?.cases,
      decision: state?.decisions,
      delegation: state?.delegations,
      negotiation: state?.negotiations,
      dependency: state?.dependencies,
    };
    const collection = collectionMap[raw.linkedType] || [];
    if (candidateId && collection.some((r) => r && r.id === candidateId)) {
      linkedType = raw.linkedType;
      linkedId = candidateId;
    }
  }
  return {
    id,
    recordedOn,
    summary: text(raw.summary, 200),
    intakeClean: raw.intakeClean,
    turnaroundDays: turnaroundDays === null ? null : round4(turnaroundDays),
    metSla,
    bounced,
    linkedType,
    linkedId,
  };
}

export function normalizeInterfacePacts(raw, state, todayDay, now, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const personIds = new Set((state?.people || []).map((p) => p?.id).filter(Boolean));
  const stakeholderIds = new Set((state?.stakeholders || []).map((s) => s?.id).filter(Boolean));
  const dependencyIds = new Set((state?.dependencies || []).map((d) => d?.id).filter(Boolean));
  const seen = new Set();
  const out = [];

  for (const item of raw.slice(0, INTERFACE_PACT_CAP)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = text(item.id, 60);
    const title = text(item.title, 160);
    const sourceUnit = text(item.sourceUnit, 80);
    const targetUnit = text(item.targetUnit, 80);
    if (!id || !title || !sourceUnit || !targetUnit || seen.has(id)) {
      warnings.push('Boundary pacts: dropped an incomplete or duplicate operating pact.');
      continue;
    }
    if (sourceUnit.toLowerCase() === targetUnit.toLowerCase()) {
      warnings.push(`Boundary pacts: dropped “${title}” because sourceUnit and targetUnit must be distinct units.`);
      continue;
    }

    const mode = INTERFACE_MODES.includes(item.mode) ? item.mode : 'ad-hoc';
    const status = PACT_STATUSES.includes(item.status) ? item.status : 'active';

    const externalArrivalPerWeek = item.externalArrivalPerWeek === null || item.externalArrivalPerWeek === undefined || item.externalArrivalPerWeek === ''
      ? null
      : finite(item.externalArrivalPerWeek, 0, 10000);
    const serviceCapacityPerWeek = item.serviceCapacityPerWeek === null || item.serviceCapacityPerWeek === undefined || item.serviceCapacityPerWeek === ''
      ? null
      : finite(item.serviceCapacityPerWeek, 0.05, 10000);
    if (
      (item.externalArrivalPerWeek !== null && item.externalArrivalPerWeek !== undefined && item.externalArrivalPerWeek !== '' && externalArrivalPerWeek === null) ||
      (item.serviceCapacityPerWeek !== null && item.serviceCapacityPerWeek !== undefined && item.serviceCapacityPerWeek !== '' && serviceCapacityPerWeek === null)
    ) {
      warnings.push(`Boundary pacts: dropped “${title}” because queue arrival or service capacity was invalid.`);
      continue;
    }

    const reworkRate = clampOrDefault(item.reworkRate, 0, 0.95, 0);
    if (item.reworkRate !== undefined && item.reworkRate !== null && finite(item.reworkRate, 0, 0.95) === null) {
      warnings.push(`Boundary pacts: dropped “${title}” because reworkRate must lie in [0, 0.95].`);
      continue;
    }

    const arrivalCv = clampOrDefault(item.arrivalCv, 0, 5, 1);
    const serviceCv = clampOrDefault(item.serviceCv, 0, 5, 1);
    const coordinationHoursPerWeek = clampOrDefault(item.coordinationHoursPerWeek, 0, 80, 1);

    let weeklyDelayPrice = item.weeklyDelayPrice === null || item.weeklyDelayPrice === undefined || item.weeklyDelayPrice === ''
      ? null
      : finite(item.weeklyDelayPrice, 0.01, 1e12);
    let currency = text(item.currency, 3).toUpperCase() || null;
    if (weeklyDelayPrice !== null && (!currency || !/^[A-Z]{3}$/.test(currency))) {
      warnings.push(`Boundary pacts: cleared invalid currency/price on “${title}” rather than inventing a currency.`);
      weeklyDelayPrice = null;
      currency = null;
    } else if (weeklyDelayPrice === null) {
      currency = currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
    }

    const turnaroundDays = Math.round(clampOrDefault(item.turnaroundDays, 1, 90, 3));
    const wipCapRaw = item.wipCap === null || item.wipCap === undefined || item.wipCap === ''
      ? null
      : finite(item.wipCap, 1, 50);
    const wipCap = wipCapRaw === null ? null : Math.round(wipCapRaw);

    const ownerId = item.ownerId && personIds.has(item.ownerId) ? item.ownerId : null;
    if (item.ownerId && !ownerId) warnings.push(`Boundary pacts: cleared missing owner reference on “${title}”.`);
    const stakeholderId = item.stakeholderId && stakeholderIds.has(item.stakeholderId) ? item.stakeholderId : null;
    if (item.stakeholderId && !stakeholderId) warnings.push(`Boundary pacts: cleared missing stakeholder reference on “${title}”.`);
    const dependencyId = item.dependencyId && dependencyIds.has(item.dependencyId) ? item.dependencyId : null;
    if (item.dependencyId && !dependencyId) warnings.push(`Boundary pacts: cleared missing dependency reference on “${title}”.`);

    const seenEx = new Set();
    const exchanges = [];
    for (const [idx, rawEx] of (Array.isArray(item.exchanges) ? item.exchanges : []).slice(-INTERFACE_EXCHANGE_CAP).entries()) {
      const normalized = normalizeExchange(rawEx, idx, turnaroundDays, state, todayDay, warnings, title);
      if (!normalized || seenEx.has(normalized.id)) continue;
      seenEx.add(normalized.id);
      exchanges.push(normalized);
    }
    exchanges.sort((a, b) => a.recordedOn.localeCompare(b.recordedOn) || a.id.localeCompare(b.id));

    seen.add(id);
    const createdAt = iso(item.createdAt) || now;
    out.push({
      id,
      title,
      sourceUnit,
      targetUnit,
      mode,
      status,
      ownerId,
      stakeholderId,
      dependencyId,
      externalArrivalPerWeek: externalArrivalPerWeek === null ? null : round4(externalArrivalPerWeek),
      serviceCapacityPerWeek: serviceCapacityPerWeek === null ? null : round4(serviceCapacityPerWeek),
      arrivalCv: round4(arrivalCv),
      serviceCv: round4(serviceCv),
      reworkRate: round4(reworkRate),
      coordinationHoursPerWeek: round4(coordinationHoursPerWeek),
      weeklyDelayPrice: weeklyDelayPrice === null ? null : round4(weeklyDelayPrice),
      currency,
      ourGive: text(item.ourGive, 300),
      theirGive: text(item.theirGive, 300),
      turnaroundDays,
      wipCap,
      escalationRule: text(item.escalationRule, 240),
      exchanges,
      createdOn: day(item.createdOn) || createdAt.slice(0, 10),
      createdAt,
      updatedAt: iso(item.updatedAt) || createdAt,
    });
  }
  return out;
}

export function normalizeInterfaceAudits(raw, state, now, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];

  for (const item of raw.slice(0, INTERFACE_AUDIT_CAP)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = text(item.id, 60);
    const pactId = text(item.pactId, 60);
    const frozenOn = day(item.frozenOn);
    const reviewOn = day(item.reviewOn);
    const horizonDays = Number.isInteger(item.horizonDays) ? item.horizonDays : Math.round(Number(item.horizonDays));
    const prob = finite(item.predictedComplianceProb, 0.05, 0.95);

    if (
      !id ||
      !pactId ||
      !frozenOn ||
      !reviewOn ||
      reviewOn <= frozenOn ||
      !Number.isInteger(horizonDays) ||
      horizonDays < 7 ||
      horizonDays > 180 ||
      prob === null ||
      seen.has(id)
    ) {
      warnings.push('Boundary audits: dropped an invalid, inverted or duplicate frozen pact audit.');
      continue;
    }

    const rawBase = item.baseline && typeof item.baseline === 'object' && !Array.isArray(item.baseline)
      ? item.baseline
      : {};
    const baseline = {
      rho: finite(rawBase.rho, 0, 50),
      effectiveArrival: finite(rawBase.effectiveArrival, 0, 100000),
      expectedWaitDays: finite(rawBase.expectedWaitDays, 0, 10000),
      externalityDays: finite(rawBase.externalityDays, 0, 100000),
      socialToPrivateRatio: finite(rawBase.socialToPrivateRatio, 1, 1000),
      departureCv2: finite(rawBase.departureCv2, 0, 100),
      ourComplianceRate: finite(rawBase.ourComplianceRate, 0, 1),
      theirComplianceRate: finite(rawBase.theirComplianceRate, 0, 1),
      bounceRate: finite(rawBase.bounceRate, 0, 1),
      exchangeCount: Math.max(0, Math.round(clampOrDefault(rawBase.exchangeCount, 0, 10000, 0))),
    };

    const targetRate = clampOrDefault(item.targetJointComplianceRate, 0.5, 0.99, 0.8);
    let status = item.status === 'graded' ? 'graded' : 'frozen';
    let grade = null;
    if (item.grade && typeof item.grade === 'object' && !Array.isArray(item.grade)) {
      const gradedOn = day(item.grade.gradedOn);
      const windowExchanges = finite(item.grade.windowExchanges, 3, 10000);
      const jointCleanCount = finite(item.grade.jointCleanCount, 0, 10000);
      const realizedRate = finite(item.grade.realizedRate, 0, 1);
      const brier = finite(item.grade.brier, 0, 1);
      if (
        gradedOn &&
        gradedOn >= reviewOn &&
        windowExchanges !== null &&
        jointCleanCount !== null &&
        jointCleanCount <= windowExchanges &&
        realizedRate !== null &&
        brier !== null &&
        typeof item.grade.metTarget === 'boolean'
      ) {
        grade = {
          gradedOn,
          windowExchanges: Math.round(windowExchanges),
          jointCleanCount: Math.round(jointCleanCount),
          realizedRate: round4(realizedRate),
          outcomeBinary: item.grade.metTarget ? 1 : 0,
          metTarget: item.grade.metTarget,
          brier: round4(brier),
        };
      } else {
        warnings.push(`Boundary audits: ${id} carried an invalid grade; repaired downward to frozen.`);
        status = 'frozen';
      }
    } else if (status === 'graded') {
      warnings.push(`Boundary audits: ${id} claimed status=graded without a grade; repaired downward to frozen.`);
      status = 'frozen';
    }

    seen.add(id);
    const createdAt = iso(item.createdAt) || `${frozenOn}T00:00:00.000Z`;
    out.push({
      id,
      pactId,
      status: grade ? 'graded' : status,
      frozenOn,
      reviewOn,
      horizonDays,
      targetJointComplianceRate: round4(targetRate),
      predictedComplianceProb: round4(prob),
      baseline,
      grade,
      createdAt,
      updatedAt: iso(item.updatedAt) || now || createdAt,
    });
  }
  return out;
}

export function normalizeInterfaceMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .filter((m) => typeof m === 'string' && m.length > 0)
        .map((m) => m.slice(0, 200)),
    ),
  ].slice(-INTERFACE_MARKER_CAP);
}
