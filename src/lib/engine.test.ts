import { project, LeadosEvent, Person } from './engine'
import assert from 'node:assert/strict'

const mkEvent = (overrides: Partial<LeadosEvent> & { data?: any }): LeadosEvent => ({
  id: 'test', type: 'test', domain: 'people',
  ts: new Date(), data: {}, ...overrides
})

const NO_PEOPLE: Person[] = []
void NO_PEOPLE

// T1: empty state returns empty findings
{
  const result = project([], [])
  assert.equal(result.findings.length, 0, 'T1 FAIL')
  console.log('T1 PASS: empty state → 0 findings')
}

// T2: pure — same input same output
{
  const events = [mkEvent({ type: 'metric', domain: 'finance',
    data: { key: 'runway_months', value: 3 } })]
  const r1 = JSON.stringify(project(events, []))
  const r2 = JSON.stringify(project(events, []))
  assert.equal(r1, r2, 'T2 FAIL')
  console.log('T2 PASS: project() is pure')
}

// T3: R1 fires with 3 skipped 1:1s
{
  const events = Array.from({ length: 3 }, (_, i) =>
    mkEvent({ type: 'oneonone', domain: 'people',
      data: { personId: 'p1', person: 'Alice', status: 'skipped' },
      ts: new Date(Date.now() - i * 86_400_000) })
  )
  const { findings } = project(events, [])
  assert(findings.some(f => f.rule === 'R1'), 'T3 FAIL')
  console.log('T3 PASS: R1 fires with 3 skipped 1:1s')
}

// T4: R1 does NOT fire with 2 skipped
{
  const events = Array.from({ length: 2 }, (_, i) =>
    mkEvent({ type: 'oneonone', domain: 'people',
      data: { personId: 'p1', person: 'Alice', status: 'skipped' },
      ts: new Date(Date.now() - i * 86_400_000) })
  )
  const { findings } = project(events, [])
  assert(!findings.some(f => f.rule === 'R1'), 'T4 FAIL')
  console.log('T4 PASS: R1 does not fire with only 2 skipped')
}

// T5: R3 fires when runway < 6
{
  const events = [mkEvent({ type: 'metric', domain: 'finance',
    data: { key: 'runway_months', value: 3.5 } })]
  const { findings } = project(events, [])
  assert(findings.some(f => f.rule === 'R3'), 'T5 FAIL')
  console.log('T5 PASS: R3 fires when runway < 6 months')
}

// T6: does not throw on malformed data
{
  const events = [mkEvent({ data: null as any })]
  assert.doesNotThrow(() => project(events, []), 'T6 FAIL')
  console.log('T6 PASS: no throw on malformed data')
}

console.log('\nAll engine tests passed.')
