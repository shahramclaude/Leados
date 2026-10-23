// 120 — A small, real bounded-reachability checker for finite-state process
// specifications. This is intentionally a scoped, honest implementation: it
// performs explicit-state breadth-first exploration over a declared
// transition graph and checks ONE invariant class — "no reachable state
// matches a forbidden pattern" (e.g. double-spend, deadlock). It is bounded
// by maxBoundedStates and returns 'inconclusive-bound' rather than a false
// 'verified' when the bound is hit before exploration completes.

export interface CheckResult {
  verdict: "verified" | "violated" | "inconclusive-bound";
  statesExplored: number;
  counterexample: string[] | null;
}

export function parseStates(statesList: string): string[] {
  return statesList
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseTransitions(transitions: string): Array<[string, string]> {
  return transitions
    .split(";")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const [from, to] = t.split(">").map((s) => s.trim());
      return [from, to] as [string, string];
    })
    .filter(([from, to]) => Boolean(from) && Boolean(to));
}

export function parseForbiddenPatterns(invariants: string): string[] {
  return invariants
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Breadth-first exploration from the first declared state, bounded by
 * maxBoundedStates. Returns a replayable counterexample path when a
 * forbidden state is reached.
 */
export function checkProcessSpec(input: {
  statesList: string;
  transitions: string;
  invariants: string;
  maxBoundedStates: number;
}): CheckResult {
  const states = parseStates(input.statesList);
  const edges = parseTransitions(input.transitions);
  const forbidden = parseForbiddenPatterns(input.invariants);

  if (states.length === 0) {
    return { verdict: "inconclusive-bound", statesExplored: 0, counterexample: null };
  }

  const adjacency = new Map<string, string[]>();
  for (const [from, to] of edges) {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from)!.push(to);
  }

  const start = states[0];
  const visited = new Set<string>([start]);
  const parent = new Map<string, string>();
  const queue: string[] = [start];
  let explored = 0;
  let violatingState: string | null = null;

  const matchesForbidden = (state: string) => forbidden.some((pattern) => state.toLowerCase().includes(pattern));

  if (matchesForbidden(start)) {
    violatingState = start;
  }

  while (queue.length > 0 && !violatingState) {
    if (explored >= input.maxBoundedStates) {
      return { verdict: "inconclusive-bound", statesExplored: explored, counterexample: null };
    }
    const current = queue.shift()!;
    explored += 1;
    const neighbors = adjacency.get(current) ?? [];
    for (const next of neighbors) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, current);
      if (matchesForbidden(next)) {
        violatingState = next;
        break;
      }
      queue.push(next);
    }
  }

  if (violatingState) {
    const path: string[] = [violatingState];
    let cursor: string = violatingState;
    while (parent.has(cursor)) {
      const prev = parent.get(cursor) as string;
      path.unshift(prev);
      cursor = prev;
    }
    return { verdict: "violated", statesExplored: explored, counterexample: path };
  }

  return { verdict: "verified", statesExplored: explored, counterexample: null };
}
