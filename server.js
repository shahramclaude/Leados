// Custom Node server wrapping Next.js so we can implement a real graceful
// shutdown: stop accepting new connections, mark the app "draining" (which
// flips /api/health to failing so a load balancer/readiness probe stops
// routing traffic), then poll /api/_internal/drain-status until in-flight
// agent runs, queue jobs being processed, and open stream connections have
// all cleared (or a timeout elapses), before exiting.
//
// This is the single canonical entrypoint used in both `npm start` and the
// production Docker image (see Dockerfile / docker-compose.production.yml).
const { createServer } = require("node:http");
const { parse } = require("node:url");
const next = require("next");
const { Client } = require("pg");

const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";
const DRAIN_TIMEOUT_MS = Number(process.env.SHUTDOWN_DRAIN_TIMEOUT_MS || 30_000);
const DRAIN_POLL_INTERVAL_MS = 2_000;

function log(level, msg, fields) {
  const line = { timestamp: new Date().toISOString(), level, service: "server", msg, ...fields };
  process.stdout.write(JSON.stringify(line) + "\n");
}

async function setDrainingFlag(value) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query(
      `insert into system_settings (key, value, updated_at)
       values ('draining', $1::jsonb, now())
       on conflict (key) do update set value = $1::jsonb, updated_at = now()`,
      [JSON.stringify(value)]
    );
  } finally {
    await client.end().catch(() => {});
  }
}

async function pollDrainStatus(baseUrl) {
  const res = await fetch(`${baseUrl}/api/_internal/drain-status`);
  if (!res.ok) throw new Error(`drain-status HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  await new Promise((resolve) => server.listen(port, hostname, resolve));
  log("info", "server.listening", { port, hostname, dev });

  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log("info", "shutdown.start", { signal });

    try {
      await setDrainingFlag(true);
      log("info", "shutdown.draining_flag_set", {});
    } catch (err) {
      log("warn", "shutdown.draining_flag_failed", { error: String(err) });
    }

    // Stop accepting new connections; existing keep-alive sockets may linger,
    // Node waits for in-flight requests on them to finish before the close
    // callback fires.
    const closed = new Promise((resolve) => server.close(() => resolve(undefined)));

    const baseUrl = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + DRAIN_TIMEOUT_MS;
    let drained = false;
    while (Date.now() < deadline) {
      try {
        const status = await pollDrainStatus(baseUrl);
        log("info", "shutdown.drain_poll", status);
        if (status.drained) {
          drained = true;
          break;
        }
      } catch (err) {
        log("warn", "shutdown.drain_poll_failed", { error: String(err) });
        break;
      }
      await new Promise((r) => setTimeout(r, DRAIN_POLL_INTERVAL_MS));
    }

    log(drained ? "info" : "warn", "shutdown.drain_complete", { drained, timedOut: !drained });

    try {
      await setDrainingFlag(false);
    } catch {
      // best effort — process is exiting regardless
    }

    await Promise.race([closed, new Promise((r) => setTimeout(r, 5_000))]);
    log("info", "shutdown.exit", { drained });
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  log("error", "server.fatal", { error: String(err) });
  process.exit(1);
});
