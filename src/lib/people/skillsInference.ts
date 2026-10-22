// src/lib/people/skillsInference.ts
//
// Turns raw SkillEvidence rows into an EffectiveSkillLevel per person/skill:
// combines multiple pieces of evidence, applies confidence decay for staleness,
// and (conservatively, and always labelled `inferred: true`) propagates a
// little bit of confidence from a specialization to its base skill.
//
// HONESTY RULE: this module only ever reasons about skill evidence. It never
// looks at, derives, or stores anything about a person other than the skill
// evidence they or an endorser attached to their record. There is no field
// here that could act as a proxy for a protected attribute because there is
// no demographic, location, schooling, name, or social-graph input at all.

import {
  MIN_CONFIDENCE_FLOOR,
  SOURCE_BASE_CONFIDENCE,
  SOURCE_DECAY_HALF_LIFE_DAYS,
  equivalenceClass,
  getSkill,
  SEED_SKILLS,
} from "./skillsOntology";
import type { EffectiveSkillLevel, Skill, SkillEvidence } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function ageDays(recordedAt: string, now: Date): number {
  return Math.max(0, (now.getTime() - new Date(recordedAt).getTime()) / DAY_MS);
}

/** Exponential decay confidence for a single evidence row at time `now`. */
export function evidenceConfidence(evidence: SkillEvidence, now: Date): number {
  if (evidence.invalidated) return 0;
  const base = SOURCE_BASE_CONFIDENCE[evidence.source] ?? 0.3;
  const halfLife = SOURCE_DECAY_HALF_LIFE_DAYS[evidence.source] ?? 180;
  const decayed = base * Math.pow(0.5, ageDays(evidence.recordedAt, now) / halfLife);
  return Math.max(MIN_CONFIDENCE_FLOOR, decayed);
}

export function stalenessBucket(evidence: SkillEvidence[], skillId: string, now: Date): EffectiveSkillLevel["staleness"] {
  const relevant = evidence.filter((e) => e.skillId === skillId && !e.invalidated);
  if (relevant.length === 0) return "none";
  const freshest = Math.min(...relevant.map((e) => ageDays(e.recordedAt, now)));
  if (freshest <= 60) return "fresh";
  if (freshest <= 240) return "aging";
  return "stale";
}

/**
 * Effective level for ONE skill, direct evidence only (no specialization
 * propagation). Combines multiple evidence rows with confidence-weighted
 * averaging, biased toward the highest well-supported level rather than a
 * flat average (one stale "claimed" shouldn't drag down a recent
 * demonstrated-by-work-evidence entry).
 */
export function directEffectiveLevel(
  personId: string,
  skillId: string,
  evidence: SkillEvidence[],
  now: Date = new Date(),
): EffectiveSkillLevel {
  const rows = evidence.filter((e) => e.personId === personId && e.skillId === skillId && !e.invalidated);
  if (rows.length === 0) {
    return { skillId, level: 0, confidence: 0, evidenceCount: 0, staleness: "none", inferred: false, lastEvidenceAt: null };
  }
  const weighted = rows.map((r) => ({ level: r.level, w: evidenceConfidence(r, now), recordedAt: r.recordedAt }));
  const totalW = weighted.reduce((s, r) => s + r.w, 0);
  // Confidence-weighted average, then nudge toward the max level if it is
  // itself well supported (>= 0.5 confidence) — a single strong demonstrated
  // data point should count more than being averaged away by old claims.
  const weightedAvg = weighted.reduce((s, r) => s + r.level * r.w, 0) / totalW;
  const bestRow = weighted.reduce((a, b) => (b.level > a.level ? b : a));
  const level = bestRow.w >= 0.5 ? (weightedAvg + bestRow.level) / 2 : weightedAvg;
  const lastEvidenceAt = rows.map((r) => r.recordedAt).sort().slice(-1)[0] ?? null;

  return {
    skillId,
    level,
    confidence: Math.min(1, totalW / rows.length),
    evidenceCount: rows.length,
    staleness: stalenessBucket(evidence, skillId, now),
    inferred: false,
    lastEvidenceAt,
  };
}

/**
 * Full effective-level map for a person across the whole ontology: direct
 * evidence, plus (a) equivalence-class substitution (an equivalent skill's
 * evidence counts at a 0.9x confidence discount) and (b) conservative
 * specialization propagation — demonstrated depth in a specialization implies
 * *some* capability in the base skill, always one level lower and always
 * flagged `inferred: true` so UIs can show "inferred from X" rather than
 * presenting it as directly evidenced.
 */
export function effectiveLevelsForPerson(
  personId: string,
  evidence: SkillEvidence[],
  skills: Skill[] = SEED_SKILLS,
  now: Date = new Date(),
): Record<string, EffectiveSkillLevel> {
  const result: Record<string, EffectiveSkillLevel> = {};

  for (const skill of skills) {
    // direct + equivalence-class evidence
    const classIds = equivalenceClass(skill.id, skills);
    let best: EffectiveSkillLevel = { skillId: skill.id, level: 0, confidence: 0, evidenceCount: 0, staleness: "none", inferred: false, lastEvidenceAt: null };
    for (const classId of classIds) {
      const direct = directEffectiveLevel(personId, classId, evidence, now);
      const discount = classId === skill.id ? 1 : 0.9;
      const candidate: EffectiveSkillLevel = { ...direct, skillId: skill.id, level: direct.level * discount, confidence: direct.confidence * discount, inferred: classId !== skill.id };
      if (candidate.level > best.level) best = candidate;
    }
    result[skill.id] = best;
  }

  // specialization propagation: base += max(0, specializationLevel - 1) * 0.7 confidence discount,
  // only applied if it would raise the base skill's level, and only from
  // direct (not already-inferred) evidence to avoid compounding inference.
  for (const skill of skills) {
    for (const baseId of skill.specializes) {
      const specLevel = result[skill.id];
      const base = getSkill(baseId);
      if (!base || !specLevel || specLevel.evidenceCount === 0) continue;
      const inferredLevel = Math.max(0, specLevel.level - 1);
      const current = result[baseId];
      if (inferredLevel > (current?.level ?? 0)) {
        result[baseId] = {
          skillId: baseId,
          level: inferredLevel,
          confidence: specLevel.confidence * 0.7,
          evidenceCount: current?.evidenceCount ?? 0,
          staleness: specLevel.staleness,
          inferred: true,
          lastEvidenceAt: specLevel.lastEvidenceAt,
        };
      }
    }
  }

  return result;
}

export function roundedLevel(effective: EffectiveSkillLevel): number {
  return Math.round(effective.level * 10) / 10;
}
