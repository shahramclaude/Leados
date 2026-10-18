// LEADOS.events + LEADOS.engine (minimal, original). The pasted Part 2/3
// spec calls LEADOS.events.project(...) and LEADOS.engine.run(...)/._days(...)
// as if they already exist from an earlier "Part 1" — no such modules were
// found in the real wbweve/Leados repo, so these are original, disclosed
// implementations built only deep enough to make Part 2 + Part 3 work.
import type { AppState, Finding, Projection } from './types';

export const events = {
  project(state: AppState): Projection {
    return { state, people: state.people.filter((p) => !p.archived) };
  },
};

export const engine = {
  _days(ts: string, today: number): number {
    return Math.floor((today - +new Date(ts)) / 864e5);
  },

  run(P: Projection, today: number): { findings: Finding[] } {
    const findings: Finding[] = [];
    const ev = P.state.events;
    const attrition90 = ev.filter((e) => e.type === 'hr.attrition.logged' && this._days(e.ts, today) <= 90 && this._days(e.ts, today) >= 0);
    if (attrition90.length >= 2) {
      findings.push({ id: 'f-attr-pace', title: 'Elevated attrition pace (2+ departures in 90d)', sev: 4, category: 'people' });
    } else if (attrition90.length === 1) {
      findings.push({ id: 'f-attr-one', title: 'One departure logged in trailing 90d', sev: 2, category: 'people' });
    }

    const moods = ev.filter((e) => e.type === 'pulse.mood.logged' && this._days(e.ts, today) <= 30 && this._days(e.ts, today) >= 0);
    if (moods.length) {
      const avg = moods.reduce((a, m) => a + (m.data.score || 0), 0) / moods.length;
      if (avg < 5) findings.push({ id: 'f-mood-low', title: `Team pulse mood averaging ${avg.toFixed(1)}/10 (below healthy threshold)`, sev: 3, category: 'people' });
    }

    const won = ev.filter((e) => e.type === 'sales.deal.won' && this._days(e.ts, today) <= 180 && this._days(e.ts, today) >= 0).length;
    const lost = ev.filter((e) => e.type === 'sales.deal.lost' && this._days(e.ts, today) <= 180 && this._days(e.ts, today) >= 0).length;
    if (won + lost >= 3) {
      const wr = won / (won + lost);
      if (wr < 0.35) findings.push({ id: 'f-winrate-low', title: `Win rate at ${Math.round(wr * 100)}% (below sustainable threshold)`, sev: 4, category: 'revenue' });
    }

    const kpi = (metric: string) => {
      const rows = ev.filter((e) => e.type === 'fin.kpi.logged' && e.data.metric === metric && this._days(e.ts, today) >= 0)
        .sort((a, b) => this._days(a.ts, today) - this._days(b.ts, today));
      return rows[0]?.data.value ?? null;
    };
    const cash = kpi('cash_balance');
    const burn = kpi('monthly_burn');
    if (cash != null && burn > 0) {
      const runway = cash / burn;
      if (runway < 6) findings.push({ id: 'f-runway-critical', title: `Runway at ${runway.toFixed(1)} months (critical)`, sev: 5, category: 'finance' });
      else if (runway < 10) findings.push({ id: 'f-runway-tight', title: `Runway at ${runway.toFixed(1)} months (tight)`, sev: 3, category: 'finance' });
    }
    const margin = kpi('gross_margin_pct');
    if (margin != null && margin < 55) {
      findings.push({ id: 'f-margin-soft', title: `Gross margin at ${margin}% (below target)`, sev: 3, category: 'finance' });
    }
    const revVsTarget = kpi('revenue_vs_target');
    if (revVsTarget != null && revVsTarget <= -10) {
      findings.push({ id: 'f-rev-miss', title: `Revenue tracking ${revVsTarget}% vs target`, sev: 4, category: 'revenue' });
    }

    findings.sort((a, b) => b.sev - a.sev);
    return { findings };
  },
};
