import { rehearseResponse } from './responseRehearsal.js';
import { rehearseActionBundle } from './actionBundleRehearsal.js';

/** The standalone build reuses its own inline bundle as a Blob worker, so the
 * heavy three-branch replay never blocks the UI and no second copy is shipped. */
export function installResponseWorker(scope = globalThis) {
  if (typeof scope.window !== 'undefined' || typeof scope.postMessage !== 'function') return false;
  scope.onmessage = ({ data }) => {
    try {
      const result = data.kind === 'bundle'
        ? rehearseActionBundle(data.state, data.bundleId, { now: new Date(data.now) })
        : rehearseResponse(data.state, data.draftId, data.input, { now: new Date(data.now) });
      scope.postMessage({ requestId: data.requestId, result });
    } catch {
      scope.postMessage({ requestId: data.requestId, result: { ok: false, error: 'Rehearsal failed in the worker. No live records were changed.' } });
    }
  };
  return true;
}

installResponseWorker();
