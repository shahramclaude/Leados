#!/usr/bin/env node
// Validates that GET /api/metrics returns well-formed Prometheus text
// exposition format: every metric has a # HELP and # TYPE line, sample lines
// parse as `name{labels} value`, and there are no duplicate HELP/TYPE
// declarations. Used as a Phase 4 gate ("metrics registry parsed by a check
// script").
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";

const METRIC_LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(-?[0-9.eE+-]+|NaN|\+Inf|-Inf)$/;

async function main() {
  const res = await fetch(`${BASE_URL}/api/metrics`);
  if (!res.ok) {
    console.error(`FAIL: GET /api/metrics returned HTTP ${res.status}`);
    process.exit(1);
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/plain")) {
    console.error(`FAIL: unexpected content-type "${contentType}"`);
    process.exit(1);
  }

  const body = await res.text();
  const lines = body.split("\n").filter((l) => l.length > 0);

  const helpSeen = new Set();
  const typeSeen = new Set();
  const metricsWithSamples = new Set();
  let sampleCount = 0;
  const errors = [];

  for (const line of lines) {
    if (line.startsWith("# HELP ")) {
      const name = line.split(" ")[2];
      if (helpSeen.has(name)) errors.push(`duplicate HELP for ${name}`);
      helpSeen.add(name);
    } else if (line.startsWith("# TYPE ")) {
      const parts = line.split(" ");
      const name = parts[2];
      const type = parts[3];
      if (!["counter", "gauge", "histogram", "summary"].includes(type)) {
        errors.push(`unknown TYPE "${type}" for ${name}`);
      }
      if (typeSeen.has(name)) errors.push(`duplicate TYPE for ${name}`);
      typeSeen.add(name);
    } else if (line.startsWith("#")) {
      errors.push(`unrecognized comment line: ${line}`);
    } else {
      const match = METRIC_LINE.exec(line);
      if (!match) {
        errors.push(`unparseable sample line: ${line}`);
        continue;
      }
      sampleCount += 1;
      const baseName = match[1].replace(/_(bucket|sum|count)$/, "");
      metricsWithSamples.add(baseName);
    }
  }

  for (const name of metricsWithSamples) {
    if (!helpSeen.has(name)) errors.push(`metric "${name}" has samples but no # HELP line`);
    if (!typeSeen.has(name)) errors.push(`metric "${name}" has samples but no # TYPE line`);
  }

  console.log(`Parsed ${lines.length} lines, ${helpSeen.size} metrics declared, ${sampleCount} samples.`);

  if (errors.length > 0) {
    console.error("FAIL: exposition format errors:");
    for (const e of errors) console.error(` - ${e}`);
    process.exit(1);
  }

  console.log("PASS: /api/metrics exposition format is valid Prometheus text format.");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
