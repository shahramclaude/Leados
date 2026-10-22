// LEADOS Part 14 — unit test: backpressure policy + topic scoping.
// Exercises StreamConnection directly (no network, no DB) with a fake sink
// so the drop/lag-notice/never-drop-approval behavior is deterministic.
import "dotenv/config";
import { __internal, encodeFrame } from "../../src/lib/streamHub";
import type { StoredFrame } from "../../src/lib/eventStore";

const { StreamConnection } = __internal as unknown as {
  StreamConnection: new (id: string, topics: string[], sink: FakeSink) => {
    deliverLive(frame: StoredFrame): void;
    stats: { delivered: number; dropped: number };
  };
};

class FakeSink {
  written: string[] = [];
  backedUp = false;
  closed = false;
  write(chunk: string) {
    this.written.push(chunk);
  }
  isBackedUp() {
    return this.backedUp;
  }
  isClosed() {
    return this.closed;
  }
}

function frame(id: number, topic: string, type: string): StoredFrame {
  return { id: String(id), orgId: "org1", topic, type: type as StoredFrame["type"], payload: { n: id }, dedupeKey: null, createdAt: new Date().toISOString() };
}

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`PASS: ${msg}`);
  }
}

function main() {
  // --- Scoping: role-invisible frames never delivered ---
  const sinkA = new FakeSink();
  const connA = new StreamConnection("connA", ["org1:role:manager"], sinkA);
  connA.deliverLive(frame(1, "org1:role:analyst", "finding")); // not in scope
  assert(sinkA.written.length === 0, "scoping: frame for a different topic is never written to the sink");
  connA.deliverLive(frame(2, "org1:role:manager", "finding"));
  assert(sinkA.written.length === 1, "scoping: frame for the subscribed topic is delivered");

  // --- Backpressure: non-critical frames dropped + lag notice, approvals never dropped ---
  const sinkB = new FakeSink();
  const connB = new StreamConnection("connB", ["org1:role:manager"], sinkB);
  sinkB.backedUp = true;
  for (let i = 0; i < 10; i++) {
    connB.deliverLive(frame(i, "org1:role:manager", "finding"));
  }
  assert(sinkB.written.length === 0, "backpressure: all 10 non-critical frames dropped while backed up (no writes yet)");
  assert(connB.stats.dropped === 10, `backpressure: dropped counter is 10 (got ${connB.stats.dropped})`);

  // An approval arrives while still backed up -> must be delivered anyway.
  connB.deliverLive(frame(10, "org1:role:manager", "approval"));
  assert(sinkB.written.length >= 1, "backpressure: approval frame is written even while backed up");
  const lastTwo = sinkB.written.slice(-2).join("");
  assert(lastTwo.includes("lag_notice"), "backpressure: a lag_notice frame precedes the recovered approval delivery");
  assert(sinkB.written.join("").includes("event: approval"), "backpressure: approval frame encoded with event: approval");

  // Recovery: once not backed up, subsequent non-critical frames flow again
  // without additional lag notices.
  sinkB.backedUp = false;
  const before = sinkB.written.length;
  connB.deliverLive(frame(11, "org1:role:manager", "finding"));
  assert(sinkB.written.length === before + 1, "backpressure: exactly one frame written after recovery (no duplicate lag notice)");

  // --- Sanity: encodeFrame produces monotonically usable SSE framing ---
  const encoded = encodeFrame(frame(42, "org1:role:manager", "run_progress"));
  assert(encoded.startsWith("id: 42\n"), "encodeFrame: id field present and first");
  assert(encoded.includes("event: run_progress"), "encodeFrame: event field present");

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll backpressure + scoping unit assertions passed.");
}

main();
