/**
 * Structural causal model evaluation engine: deterministic structural
 * functions, noise sampling, forward simulation (used to generate synthetic
 * ground-truth datasets for `npm run eval:causal`), and the
 * abduction-action-prediction counterfactual algorithm (Pearl, 2009,
 * *Causality*, ch.7).
 */

import { loadModel, topologicalOrder, type Graph } from "./dag";
import type {
  NoiseSpec,
  StructuralAssignment,
  StructuralCausalModel,
  StructuralFunctionSpec,
} from "./types";
import { gaussian, type Rng } from "./rng";

export type Assignment = Record<string, number>;

export interface LoadedModel {
  scm: StructuralCausalModel;
  graph: Graph;
  order: string[];
  assignmentByVar: Map<string, StructuralAssignment>;
}

/** Validates acyclicity and indexes the model for repeated evaluation. */
export function loadSCM(scm: StructuralCausalModel): LoadedModel {
  const graph = loadModel(scm); // throws CyclicGraphError naming the cycle
  const order = topologicalOrder(graph);
  const assignmentByVar = new Map(scm.assignments.map((a) => [a.variable, a]));
  for (const v of scm.variables) {
    if (!assignmentByVar.has(v.id) && v.kind !== "latent") {
      // Exogenous observed variable: treated as a pure-noise root node.
    }
  }
  return { scm, graph, order, assignmentByVar };
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function deterministicPart(
  fn: StructuralFunctionSpec,
  parentValues: Assignment
): number {
  const linear =
    fn.intercept +
    Object.entries(fn.coefficients).reduce(
      (sum, [p, coef]) => sum + coef * (parentValues[p] ?? 0),
      0
    );
  if (fn.type === "linear") return linear;
  return sigmoid(linear); // logistic: deterministic part is a probability
}

/** Per-parent additive contribution, used by the "why" explanation. */
export function parentContributions(
  fn: StructuralFunctionSpec,
  parentValues: Assignment
): { parent: string; contribution: number }[] {
  return Object.entries(fn.coefficients).map(([p, coef]) => ({
    parent: p,
    contribution: coef * (parentValues[p] ?? 0),
  }));
}

export function sampleNoise(noise: NoiseSpec, rng: Rng): number {
  if (noise.type === "normal") return gaussian(rng, noise.mean, noise.sd);
  return rng(); // bernoulli: store the raw uniform draw `u`; realized value
  // derives from u < p at assignment-evaluation time, which keeps the
  // counterfactual engine's abduction step well-defined (see below).
}

/**
 * Forward-simulate N samples from the SCM in topological order. Root
 * (no-parent, non-latent) variables are drawn directly from their noise
 * distribution. `interventions` fixes `do(X = v)` for the listed variables,
 * cutting their incoming edges for the whole run (used to generate
 * known-ground-truth synthetic datasets for the eval harness).
 */
export function simulate(
  model: LoadedModel,
  n: number,
  rng: Rng,
  interventions: Assignment = {}
): Assignment[] {
  const rows: Assignment[] = [];
  for (let i = 0; i < n; i++) {
    const row: Assignment = {};
    for (const varId of model.order) {
      if (Object.prototype.hasOwnProperty.call(interventions, varId)) {
        row[varId] = interventions[varId];
        continue;
      }
      const assignment = model.assignmentByVar.get(varId);
      if (!assignment) {
        // Exogenous root: default standard normal unless explicitly modelled.
        row[varId] = gaussian(rng, 0, 1);
        continue;
      }
      const det = deterministicPart(assignment.fn, row);
      if (assignment.fn.type === "linear") {
        row[varId] = det + sampleNoise(assignment.noise, rng);
      } else {
        const u = sampleNoise(assignment.noise, rng);
        row[varId] = u < det ? 1 : 0;
      }
    }
    rows.push(row);
  }
  return rows;
}

export interface CounterfactualStep {
  variable: string;
  parents: string[];
  contributions: { parent: string; contribution: number }[];
  intercept: number;
  noiseContribution: number;
  before: number;
  after: number;
}

export interface CounterfactualTrace {
  path: string[]; // DAG topological path of variables recomputed
  steps: CounterfactualStep[];
  before: Record<string, number>;
  after: Record<string, number>;
}

/**
 * Abduction-action-prediction counterfactual: given one fully-observed
 * entity record, infer the exogenous noise implied by the structural
 * equations (abduction), fix the intervened variables (action, cutting
 * their incoming edges), then recompute every descendant downstream of the
 * intervention in topological order (prediction). Returns a full trace so
 * the UI can render the real DAG path, not a canned sentence.
 */
export function counterfactual(
  model: LoadedModel,
  observed: Assignment,
  interventions: Assignment
): CounterfactualTrace {
  // --- Abduction: infer noise per structural variable from the observed row.
  const noiseByVar = new Map<string, number>();
  for (const varId of model.order) {
    const assignment = model.assignmentByVar.get(varId);
    if (!assignment) continue;
    const det = deterministicPart(assignment.fn, observed);
    if (assignment.fn.type === "linear") {
      noiseByVar.set(varId, observed[varId] - det);
    } else {
      // Approximate inversion for binary structural variables: place the
      // latent uniform draw `u` on the correct side of the decision
      // threshold `det`, at the midpoint of the feasible interval. This is
      // a documented approximation (exact u is not identifiable from a
      // single binary observation) and only affects downstream binary
      // counterfactual nodes, never the ATE pipeline.
      const u = observed[varId] === 1 ? det / 2 : (det + 1) / 2;
      noiseByVar.set(varId, u);
    }
  }

  // --- Action + Prediction: walk topological order; anything downstream of
  // an intervened variable is recomputed with the *new* parent values but
  // the entity's *original* noise, which is exactly what makes this a
  // counterfactual about this entity rather than a population estimate.
  const after: Assignment = { ...observed };
  const touched = new Set<string>(Object.keys(interventions));
  const steps: CounterfactualStep[] = [];
  const path: string[] = [];

  for (const varId of model.order) {
    if (Object.prototype.hasOwnProperty.call(interventions, varId)) {
      after[varId] = interventions[varId];
      path.push(varId);
      continue;
    }
    const assignment = model.assignmentByVar.get(varId);
    if (!assignment) continue;
    const parentsChanged = assignment.parents.some((p) => touched.has(p));
    if (!parentsChanged) continue;

    const det = deterministicPart(assignment.fn, after);
    const noise = noiseByVar.get(varId) ?? 0;
    let newValue: number;
    if (assignment.fn.type === "linear") {
      newValue = det + noise;
    } else {
      newValue = noise < det ? 1 : 0;
    }

    steps.push({
      variable: varId,
      parents: assignment.parents,
      contributions: parentContributions(assignment.fn, after),
      intercept: assignment.fn.intercept,
      noiseContribution: assignment.fn.type === "linear" ? noise : 0,
      before: observed[varId],
      after: newValue,
    });

    after[varId] = newValue;
    touched.add(varId);
    path.push(varId);
  }

  return { path, steps, before: observed, after };
}

/** Decompose one observed node's value into parent contributions ("why"). */
export function whyExplanation(
  model: LoadedModel,
  observed: Assignment,
  variable: string
): CounterfactualStep | null {
  const assignment = model.assignmentByVar.get(variable);
  if (!assignment) return null;
  const det = deterministicPart(assignment.fn, observed);
  const noise =
    assignment.fn.type === "linear" ? observed[variable] - det : 0;
  return {
    variable,
    parents: assignment.parents,
    contributions: parentContributions(assignment.fn, observed),
    intercept: assignment.fn.intercept,
    noiseContribution: noise,
    before: observed[variable],
    after: observed[variable],
  };
}
