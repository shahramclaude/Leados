"use strict";
/**
 * mcCore.cjs — the ONE pure, dependency-free Monte Carlo chunk implementation.
 *
 * This file is intentionally plain CommonJS (no TypeScript, no imports) so it
 * can be loaded two ways with byte-identical behaviour:
 *   1. As a Node worker_threads entry point (true parallel execution), OR
 *   2. `require()`-d directly on the main thread as a synchronous fallback
 *      when worker_threads is unavailable/unsafe (e.g. during bundling).
 * Both paths call the exact same `runChunk` function, which is what
 * guarantees "identical seeds -> identical results" regardless of execution
 * strategy (see scripts/property-tests.ts).
 *
 * NOTE ON DUPLICATION: the PRNG algorithm here intentionally mirrors
 * src/lib/prng.ts (mulberry32 core). It cannot import that TS module from a
 * raw worker thread, so the algorithm is duplicated by necessity. A property
 * test cross-checks both implementations produce identical output streams
 * for the same seed to guard against drift.
 */

function hashStringToUint32(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function makeMulberry32(seedStr) {
  let state = (typeof seedStr === "number" ? seedStr >>> 0 : hashStringToUint32(String(seedStr))) >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Acklam's algorithm for the inverse standard normal CDF. Mirrors mathUtils.ts normalQuantile. */
function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.75440866190742];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q, z;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    z = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= phigh) {
    q = p - 0.5;
    const r = q * q;
    z = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    z = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  return z;
}

/**
 * Runs `pairCount` antithetic pairs for a linear-combination-of-normals
 * scenario, estimating E[max(T-budget,0)] (expected overrun) and
 * P(T>budget) (exceedance probability), both control-variate-adjusted using
 * T^2 (known analytic mean under Normal(muT, sigmaT)) as the control.
 *
 * scenario = { variables: [{ mean, sd, weight }], budget }
 * Returns partial results honestly if cancelled mid-run (n reflects pairs
 * actually completed).
 */
function runChunk(seedStr, pairCount, scenario, options) {
  const opts = options || {};
  const onProgress = opts.onProgress || null;
  const isCancelled = opts.isCancelled || null;
  const progressEvery = opts.progressEvery || Math.max(1, Math.floor(pairCount / 20));

  const variables = scenario.variables;
  const budget = scenario.budget;
  const muT = variables.reduce((acc, v) => acc + v.weight * v.mean, 0);
  const varT = variables.reduce((acc, v) => acc + (v.weight * v.sd) ** 2, 0);
  const eT2 = varT + muT * muT;

  const next = makeMulberry32(seedStr);

  const ybarOverrun = new Float64Array(pairCount);
  const ybarExceed = new Float64Array(pairCount);
  const cbar = new Float64Array(pairCount);

  let completed = 0;
  for (let j = 0; j < pairCount; j++) {
    if (isCancelled && isCancelled()) break;

    let T = 0;
    for (let k = 0; k < variables.length; k++) {
      const v = variables[k];
      const u = next();
      const z = normalQuantile(u);
      T += v.weight * (v.mean + v.sd * z);
    }
    const T2 = 2 * muT - T; // antithetic partner: exact because T is a linear combination of normals

    const overrun1 = Math.max(T - budget, 0);
    const overrun2 = Math.max(T2 - budget, 0);
    const exceed1 = T > budget ? 1 : 0;
    const exceed2 = T2 > budget ? 1 : 0;

    ybarOverrun[j] = (overrun1 + overrun2) / 2;
    ybarExceed[j] = (exceed1 + exceed2) / 2;
    cbar[j] = (T * T - eT2 + (T2 * T2 - eT2)) / 2;

    completed = j + 1;
    if (onProgress && completed % progressEvery === 0) {
      onProgress(completed, pairCount);
    }
  }

  function meanOf(arr, n) {
    let s = 0;
    for (let i = 0; i < n; i++) s += arr[i];
    return n > 0 ? s / n : 0;
  }
  function covOf(a, b, n, ma, mb) {
    let s = 0;
    for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
    return n > 1 ? s / (n - 1) : 0;
  }
  function varOf(a, n, ma) {
    return covOf(a, a, n, ma, ma);
  }

  const n = completed;
  const mCbar = meanOf(cbar, n);
  const varCbar = varOf(cbar, n, mCbar);

  const mOverrun = meanOf(ybarOverrun, n);
  const mExceed = meanOf(ybarExceed, n);
  const cOverrun = varCbar > 1e-9 ? covOf(ybarOverrun, cbar, n, mOverrun, mCbar) / varCbar : 0;
  const cExceed = varCbar > 1e-9 ? covOf(ybarExceed, cbar, n, mExceed, mCbar) / varCbar : 0;

  let sumOverrun = 0;
  let sumOverrunSq = 0;
  let sumExceed = 0;
  let sumExceedSq = 0;
  for (let i = 0; i < n; i++) {
    const oCorrected = ybarOverrun[i] - cOverrun * cbar[i];
    const eCorrected = ybarExceed[i] - cExceed * cbar[i];
    sumOverrun += oCorrected;
    sumOverrunSq += oCorrected * oCorrected;
    sumExceed += eCorrected;
    sumExceedSq += eCorrected * eCorrected;
  }

  return {
    n,
    sumOverrun,
    sumOverrunSq,
    sumExceed,
    sumExceedSq,
    muT,
    sigmaT: Math.sqrt(varT),
    cancelled: n < pairCount,
  };
}

module.exports = { runChunk, makeMulberry32, normalQuantile, hashStringToUint32 };

// --- Worker-thread entry mode -------------------------------------------
// When this file is loaded as a worker_threads entry point, `require.main`
// is NOT this module (workers don't set require.main), so we detect worker
// mode via the presence of `parentPort` instead.
try {
  const workerThreads = require("worker_threads");
  if (workerThreads.parentPort) {
    const parentPort = workerThreads.parentPort;
    let cancelled = false;
    parentPort.on("message", (msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "cancel") {
        cancelled = true;
        return;
      }
      if (msg.type === "run") {
        const { taskId, seed, pairCount, scenario } = msg;
        try {
          const result = runChunk(seed, pairCount, scenario, {
            isCancelled: () => cancelled,
            onProgress: (done, total) => {
              parentPort.postMessage({ type: "progress", taskId, done, total });
            },
          });
          parentPort.postMessage({ type: "done", taskId, result });
        } catch (err) {
          parentPort.postMessage({ type: "error", taskId, message: err && err.message ? err.message : String(err) });
        }
      }
    });
  }
} catch {
  // worker_threads not available in this runtime (e.g. edge) — fine, the
  // inline fallback path in workerPool.ts handles that case.
}
