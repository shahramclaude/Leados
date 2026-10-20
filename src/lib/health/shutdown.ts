// Process-wide graceful shutdown flag. Set by src/instrumentation.ts when
// the process receives SIGTERM/SIGINT (e.g. `docker stop`, a rolling
// deploy, or Kubernetes pod termination). The composite health check and
// the maintenance middleware both read this so:
//   - orchestration layers (Docker healthcheck, load balancer) see the
//     instance turn "warn" and stop routing new traffic to it, and
//   - any route that starts background work can check `isShuttingDown()`
//     before kicking off something new.
let shuttingDown = false;

export function markShuttingDown() {
  shuttingDown = true;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}
