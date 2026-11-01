/** Worker boundary for Response Studio. Never falls back to a heavy main-thread replay. */
function runRehearsal(payload, { workerFactory, timeoutMs = 45000 } = {}) {
  return new Promise((resolve) => {
    let worker = null;
    let blobUrl = null;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (worker) worker.terminate();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, error: 'Rehearsal exceeded 45 seconds. No live records were changed. Try a smaller operational workspace.' }), timeoutMs);
    try {
      if (workerFactory) worker = workerFactory();
      else if (typeof Worker === 'undefined') return finish({ ok: false, error: 'This browser does not support background workers. Rehearsal was refused rather than freezing the page.' });
      else if (typeof window !== 'undefined' && window.__LEADOS_STANDALONE__) {
        const source = document.getElementById('leados-standalone-app')?.textContent;
        if (!source) return finish({ ok: false, error: 'The offline worker bundle is missing. Rebuild the standalone file.' });
        blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        worker = new Worker(blobUrl);
      } else worker = new Worker(new URL('app/services/responseRehearsal.worker.js', document.baseURI), { type: 'module' });
      const requestId = `response-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      worker.onmessage = ({ data }) => { if (data?.requestId === requestId) finish(data.result || { ok: false, error: 'The worker returned no result. No live records changed.' }); };
      worker.onerror = () => finish({ ok: false, error: 'The rehearsal worker failed. No live records were changed.' });
      worker.postMessage({ requestId, ...payload });
    } catch {
      finish({ ok: false, error: 'The rehearsal worker could not start. No live records were changed.' });
    }
  });
}

export function runResponseRehearsal(state, draftId, input, now, options = {}) {
  return runRehearsal({ kind: 'response', state, draftId, input, now: now.toISOString() }, options);
}
export function runActionBundleRehearsal(state, bundleId, now, options = {}) {
  return runRehearsal({ kind: 'bundle', state, bundleId, now: now.toISOString() }, options);
}
