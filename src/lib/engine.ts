export interface LeadosEvent {
  id: string
  type: string
  domain: string
  ts: Date
  data: Record<string, unknown>
}

export interface Person {
  id: string
  name: string
  role: string | null
  reports_to: string | null
  cadence_days: number
  archived: boolean
}

export interface Finding {
  key: string
  rule: string
  domain: string
  sev: 1 | 2 | 3 | 4 | 5
  title: string
  detail: string
  personId?: string
  ref?: string
}

export interface DomainScore {
  domain: string
  label: string
  score: number
  count: number
}

export interface DecisionView {
  decisionId: string
  title: string
  owner: string
  ownerId: string
  openDays: number
  resolved: boolean
  stale: boolean      // open > 21d
  escalate: boolean   // open > 45d
}

export interface ProjectedState {
  findings: Finding[]
  domainScores: DomainScore[]
  decisions: DecisionView[]
  eventCount: number
  peopleCount: number
}

const DOMAIN_LABELS: Record<string, string> = {
  people: 'People', finance: 'Finance', sales: 'Sales',
  ops: 'Ops', strategy: 'Strategy', gov: 'Governance',
}

export function project(
  events: LeadosEvent[],
  people: Person[]
): ProjectedState {
  const findings: Finding[] = []

  // Normalize events so malformed/null data never throws downstream.
  const safeEvents = events.map(e => ({
    ...e,
    data: (e.data && typeof e.data === 'object' ? e.data : {}) as Record<string, unknown>,
  }))

  const add = (f: Omit<Finding, 'key'> & { ref?: string }) => {
    findings.push({ key: f.rule + ':' + (f.ref ?? f.rule), ...f })
  }

  // Helper: latest value for a metric key
  const latestMetric = (key: string): number | null => {
    const matches = safeEvents
      .filter(e => e.type === 'metric' && (e.data as any).key === key)
      .sort((a, b) => b.ts.getTime() - a.ts.getTime())
    return matches.length ? Number((matches[0].data as any).value) : null
  }

  // R1: ≥3 skipped 1:1s per person
  const skipped: Record<string, LeadosEvent[]> = {}
  safeEvents
    .filter(e => e.type === 'oneonone' && (e.data as any).status === 'skipped')
    .forEach(e => {
      const pid = (e.data as any).personId as string
      if (pid) (skipped[pid] ??= []).push(e)
    })
  Object.entries(skipped).forEach(([pid, evs]) => {
    if (evs.length >= 3) {
      const person = (evs[0].data as any).person ?? pid
      add({ rule: 'R1', domain: 'people', sev: 4, ref: pid, personId: pid,
            title: `1:1 cadence slipping — ${person}`,
            detail: `${evs.length} skipped 1:1s in the tracked window.` })
    }
  })

  // R2: ≥4 held 1:1s + no recognition per person
  const held: Record<string, LeadosEvent[]> = {}
  safeEvents
    .filter(e => e.type === 'oneonone' && (e.data as any).status === 'held')
    .forEach(e => {
      const pid = (e.data as any).personId as string
      if (pid) (held[pid] ??= []).push(e)
    })
  const recognized = new Set(
    safeEvents.filter(e => e.type === 'recognition').map(e => (e.data as any).personId as string)
  )
  Object.entries(held).forEach(([pid, evs]) => {
    if (evs.length >= 4 && !recognized.has(pid)) {
      const person = (evs[0].data as any).person ?? pid
      add({ rule: 'R2', domain: 'people', sev: 3, ref: pid, personId: pid,
            title: `Recognition gap — ${person}`,
            detail: `${evs.length} 1:1s held, no recognition logged.` })
    }
  })

  // R3: runway < 6 months
  const runway = latestMetric('runway_months')
  if (runway !== null && !Number.isNaN(runway) && runway < 6)
    add({ rule: 'R3', domain: 'finance', sev: 5, ref: 'runway',
          title: 'Runway under 6 months',
          detail: `Runway at ${runway} months.` })

  // R4: burn rate accelerating > 20%
  const burn = latestMetric('burn_rate_delta_pct')
  if (burn !== null && !Number.isNaN(burn) && burn > 20)
    add({ rule: 'R4', domain: 'finance', sev: 4, ref: 'burn',
          title: 'Burn rate accelerating',
          detail: `Burn up ${burn}% MoM.` })

  // R5: MRR growth negative
  const mrrGrowth = latestMetric('mrr_growth_pct')
  if (mrrGrowth !== null && !Number.isNaN(mrrGrowth) && mrrGrowth < 0)
    add({ rule: 'R5', domain: 'finance', sev: 3, ref: 'mrr',
          title: 'MRR declining',
          detail: `MRR growth at ${mrrGrowth}%.` })

  // R6: pipeline coverage < 3×
  const pipeline = latestMetric('pipeline_coverage_x')
  if (pipeline !== null && !Number.isNaN(pipeline) && pipeline < 3)
    add({ rule: 'R6', domain: 'sales', sev: 3, ref: 'pipeline',
          title: 'Pipeline coverage thin',
          detail: `Coverage at ${pipeline}× quota (target ≥3×).` })

  // R7: churn > 2%
  const churn = latestMetric('churn_pct')
  if (churn !== null && !Number.isNaN(churn) && churn > 2)
    add({ rule: 'R7', domain: 'sales', sev: 2, ref: 'churn',
          title: 'Churn above threshold',
          detail: `Churn at ${churn}%.` })

  // R8: deploy frequency dropped > 30%
  const deploy = latestMetric('deploy_freq_delta_pct')
  if (deploy !== null && !Number.isNaN(deploy) && deploy < -30)
    add({ rule: 'R8', domain: 'ops', sev: 3, ref: 'deploy',
          title: 'Deploy frequency dropped',
          detail: `Deploy freq down ${Math.abs(deploy)}%.` })

  // R9 + R10: goals
  safeEvents.filter(e => e.type === 'goal').forEach(g => {
    const d = g.data as any
    if (!d || !d.goalId) return
    const ageDays = (Date.now() - g.ts.getTime()) / 86_400_000
    if (!d.ownerAssigned && ageDays > 14)
      add({ rule: 'R9', domain: 'strategy', sev: 3, ref: d.goalId,
            title: `Goal unowned: ${d.title}`,
            detail: `No owner for ${Math.round(ageDays)} days.` })
    if (d.status === 'active' && ageDays > 90)
      add({ rule: 'R10', domain: 'strategy', sev: 2, ref: d.goalId,
            title: `Stale goal: ${d.title}`,
            detail: `Active for ${Math.round(ageDays)} days.` })
  })

  // R11 + R12: decisions
  const decisions: DecisionView[] = []
  safeEvents.filter(e => e.type === 'decision').forEach(e => {
    const d = e.data as any
    if (!d || !d.decisionId || !d.openedAt) return
    const openedAtMs = new Date(d.openedAt).getTime()
    if (Number.isNaN(openedAtMs)) return
    const openMs = (d.resolvedAt ? new Date(d.resolvedAt).getTime() : Date.now()) - openedAtMs
    const openDays = Math.round(openMs / 86_400_000)
    const resolved = !!d.resolvedAt
    const stale    = !resolved && openDays > 21
    const escalate = !resolved && openDays > 45
    decisions.push({ decisionId: d.decisionId, title: d.title,
                     owner: d.owner, ownerId: d.ownerId,
                     openDays, resolved, stale, escalate })
    if (escalate)
      add({ rule: 'R12', domain: 'gov', sev: 4, ref: d.decisionId, personId: d.ownerId,
            title: `Decision escalation: ${d.title}`,
            detail: `Open ${openDays}d, owner ${d.owner}.` })
    else if (stale)
      add({ rule: 'R11', domain: 'gov', sev: 2, ref: d.decisionId, personId: d.ownerId,
            title: `Stale decision: ${d.title}`,
            detail: `Open ${openDays}d, owner ${d.owner}.` })
  })

  // AMP1: compound — same person has R1 + R11/R12
  const r1People = new Set(findings.filter(f => f.rule === 'R1').map(f => f.personId!))
  findings.filter(f => f.rule === 'R11' || f.rule === 'R12').forEach(f => {
    if (f.personId && r1People.has(f.personId))
      add({ rule: 'AMP1', domain: 'gov', sev: 4, ref: f.personId, personId: f.personId,
            title: 'Burnout feedback-loop candidate',
            detail: 'Slipping 1:1 cadence (R1) + stale/escalated decision (R11/R12) — same person. Heuristic.' })
  })

  // Domain scores
  const domainScores: DomainScore[] = Object.entries(DOMAIN_LABELS).map(([domain, label]) => {
    const items = findings.filter(f => f.domain === domain)
    return { domain, label, score: items.reduce((s, f) => s + f.sev, 0), count: items.length }
  })

  return {
    findings: findings.sort((a, b) => b.sev - a.sev),
    domainScores,
    decisions,
    eventCount: events.length,
    peopleCount: people.filter(p => !p.archived).length,
  }
}
