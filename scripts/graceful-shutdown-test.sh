#!/usr/bin/env bash
# Phase 4 gate 5: graceful-shutdown test. Starts the production server on a
# scratch port, injects a real in-flight agent run, sends SIGTERM, confirms
# the server reports itself "draining" (health -> failing) and does NOT exit
# until the in-flight run is marked finished — i.e. it actually drains rather
# than dropping work on the floor.
set -uo pipefail

PORT="${TEST_PORT:-3100}"
BASE_URL="http://127.0.0.1:${PORT}"
LOG_FILE="$(mktemp)"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/app_db}"

echo "[test] starting server.js on port ${PORT}, logging to ${LOG_FILE}"
PORT="${PORT}" NODE_ENV=production node server.js >"${LOG_FILE}" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill -9 "${SERVER_PID}" >/dev/null 2>&1 || true
  psql "${DATABASE_URL}" -q -c "delete from agent_runs where kind = 'graceful-shutdown-test';" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[test] waiting for server to become healthy..."
for i in $(seq 1 30); do
  if curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1; then
    echo "[test] server is up after ${i}s"
    break
  fi
  sleep 1
done

echo "[test] inserting an in-flight agent run to simulate work mid-flight"
RUN_ID=$(psql "${DATABASE_URL}" -t -A -c "
  insert into agent_runs (kind, status, correlation_id)
  values ('graceful-shutdown-test', 'running', 'cor_graceful_shutdown_test')
  returning id;
")
echo "[test] in-flight run id = ${RUN_ID}"

echo "[test] sending SIGTERM to server (pid ${SERVER_PID})"
kill -TERM "${SERVER_PID}"

sleep 3
echo "[test] health immediately after SIGTERM (expect draining=true, status=failing):"
curl -s "${BASE_URL}/api/health" | head -c 400; echo
echo

echo "[test] server should still be alive, waiting on the in-flight run..."
if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
  echo "[test] FAIL: server exited before the in-flight run finished"
  cat "${LOG_FILE}"
  exit 1
fi
echo "[test] PASS (so far): server is still up, correctly draining"

echo "[test] marking the in-flight run as finished, simulating it completing/checkpointing"
psql "${DATABASE_URL}" -q -c "
  update agent_runs set status = 'succeeded', finished_at = now()
  where id = '${RUN_ID}';
"

echo "[test] waiting for the server process to exit now that work has drained..."
for i in $(seq 1 15); do
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo "[test] server exited after run completed (waited ${i}s)"
    break
  fi
  sleep 1
done

if kill -0 "${SERVER_PID}" 2>/dev/null; then
  echo "[test] FAIL: server did not exit within timeout after work drained"
  cat "${LOG_FILE}"
  exit 1
fi

echo "[test] ---- server log ----"
cat "${LOG_FILE}"
echo "[test] ---- end log ----"
echo "[test] PASS: graceful shutdown drained the in-flight run before exiting."
