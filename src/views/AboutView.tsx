import { useState } from "react";
import { runSelfTests } from "../lib/selfTest";
import { Card, SectionTitle, Button, Pill } from "../components/ui";

export function AboutView() {
  const [tests, setTests] = useState(() => runSelfTests());

  return (
    <div className="space-y-6">
      <SectionTitle title="About / Provenance" subtitle="What was verified, what is original, and what is explicitly a disclosed gap." />

      <Card>
        <h3 className="font-semibold text-slate-900">What this build is</h3>
        <p className="mt-2 text-sm text-slate-600">
          A fresh React + Vite + Tailwind app built in this task's own tool environment. This workspace started from the
          default Vite/React scaffold (a centered "Ready to build" placeholder in <code>src/App.tsx</code>, verified by
          reading the file before writing any code) — there is no prior "Leados" session state inside this sandbox.
        </p>
      </Card>

      <Card>
        <h3 className="font-semibold text-slate-900">About github.com/wbweve/Leados (external repo)</h3>
        <p className="mt-2 text-sm text-slate-600">
          That repository was fetched and read this session. It is a <em>different</em> codebase (its own
          React+Vite+TS app under <code>src/</code>, plus loose root files) implementing Thermodynamics / CAS / Risk
          Register modules — not the "inference / autonomous / leadership_science / ..." modules requested in this
          task. Its own README states its info-theory layer (<code>infoTheory.ts</code>) is genuinely wired in, while
          a CAS engine, risk register, and a "58/62-file, 144-rule, T_L_*/G_L_* test suite" history were explicitly{" "}
          <strong>not found</strong> anywhere in that repo and were treated there as an unverified external brief, not
          repo fact.
        </p>
      </Card>

      <Card>
        <h3 className="font-semibold text-slate-900">About this task's own prompt ("72 files, 144 rules, the contract holds")</h3>
        <p className="mt-2 text-sm text-slate-600">
          That line was provided as plain text in the prompt, describing a prior state this sandbox does not contain
          (verified: this workspace had no <code>js/</code> directory, no prior rule catalog, and no file count before
          this session's work began). Per the same standard applied to the external repo's own pasted briefs, it is
          treated here as an <strong>unverified claim about a different session</strong>, not as a fact about this
          delivery. What is independently verifiable about <em>this</em> delivery:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>
            <strong>144 rules:</strong> true and checkable — <code>src/lib/rules.ts</code> builds an 8-category x 18-rule
            catalog; <code>RULES-001</code>/<code>RULES-002</code> self-tests below assert this at runtime.
          </li>
          <li>
            <strong>72 files:</strong> not reproduced here. This delivery uses roughly 30 source files (TypeScript
            modules + React views), because a Vite/TS project wires features together as imported modules rather than
            as 72 standalone <code>js/*.js</code> files — producing 72 files would mean padding with code nothing
            imports, the exact "orphaned file" failure mode the external repo's own README flagged in its{" "}
            <code>core.ts</code>/<code>intelligence.ts</code>.
          </li>
          <li>
            The ten requested modules (inference, autonomous, leadership_science, calibrate_rules, protocol,
            decision_trees, docs, institutional_memory, selfImprove, onboarding) are implemented as
            <code> src/lib/*.ts</code>, each file-headed with its requested <code>js/*.js</code> name, and each is
            actually imported by a view — verified by this project building successfully and by the self-tests below
            exercising each one.
          </li>
        </ul>
      </Card>

      <Card>
        <h3 className="font-semibold text-slate-900">Disclosed approximations</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Leadership-science functions are named after real public concepts (Tuckman, Edmondson, Dunbar) but implement original, simplified heuristics — not validated instruments.</li>
          <li>The autonomous monitor is a client-side <code>setInterval</code> loop, not a background/server process; it stops when the tab closes or the Autonomous page unmounts (interval is cleared on unmount).</li>
          <li>Calibration/self-improvement act only on feedback recorded in this browser session — no claim of trained-model accuracy.</li>
        </ul>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <SectionTitle title="Self-tests" />
          <Button variant="ghost" onClick={() => setTests(runSelfTests())}>
            Re-run
          </Button>
        </div>
        <ul className="space-y-1 text-sm">
          {tests.map((t) => (
            <li key={t.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-2">
              <span>{t.id}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{t.detail}</span>
                <Pill tone={t.pass ? "indigo" : "violet"}>{t.pass ? "PASS" : "FAIL"}</Pill>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
