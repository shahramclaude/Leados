// Minimal findings engine — ORIGINAL to this build, disclosed-fabricated.
// Needed so `counterfactual()` (Part 1 of the pasted pt-Q spec) has something
// concrete to count as "active findings" when replaying historical state.
// This is NOT a port of anything found in github.com/wbweve/Leados — no
// equivalent rule engine was verified there this session (see AI-SESSION-LOG.md).
import type { Projection } from './types';
import { days } from './stats';

export interface Finding {
  id: string;
  personId: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
}

export function run(P: Projection, today: string): { findings: Finding[] } {
  const findings: Finding[] = [];
  P.directs.concat(P.skips).forEach((person) => {
    const last = P.oneononeLast[person.id];
    const gap = last ? days(last.ts, today) : 999;
    if (gap > person.cadenceDays * 1.5) {
      findings.push({ id: `f_cadence_${person.id}`, personId: person.id, label: `${person.name}: 1:1 overdue (${Math.round(gap)}d)`, severity: gap > person.cadenceDays * 2.5 ? 'high' : 'medium' });
    }
    const pulses = (P.pulsesByPerson[person.id] || []).filter((p) => days(p.ts, today) <= 30);
    if (pulses.length) {
      const meanMood = pulses.reduce((a, b) => a + b.mood, 0) / pulses.length;
      if (meanMood < 4.5) {
        findings.push({ id: `f_mood_${person.id}`, personId: person.id, label: `${person.name}: low engagement pulse (${meanMood.toFixed(1)}/10)`, severity: meanMood < 3.5 ? 'high' : 'medium' });
      }
    }
  });
  return { findings };
}
