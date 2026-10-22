import Link from "next/link";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import { getDecision } from "@/lib/decision/decisionEngine";
import { evidenceGapWarnings } from "@/lib/decision/decisionIntelligence";
import { listPreMortems, isMajorDecision } from "@/lib/decision/premortem";
import { listDQScores } from "@/lib/decision/decisionQualityStore";
import { autoSuggestDQ } from "@/lib/decision/decisionQuality";
import { listOrgs, listUsersForOrg } from "@/lib/decision/orgs";
import { db } from "@/db";
import { decisionDissent, decisionCorrections } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { DecisionsNav, Pill, Card } from "../components";
import {
  frameDecisionAction,
  addDissentAction,
  commitDecisionAction,
  reviewDecisionAction,
  addCorrectionAction,
  scoreDecisionAction,
  createPremortemAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function DecisionRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ org?: string }>;
}) {
  await ensureDecisionInvariants();
  const { id } = await params;
  const sp = await searchParams;

  const decision = await getDecision(id);
  if (!decision) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p>Decision not found.</p>
      </main>
    );
  }

  const orgId = sp.org ?? decision.orgId;
  const [orgs, users, dissentRows, corrections, preMortems, dqHistory] = await Promise.all([
    listOrgs(),
    listUsersForOrg(decision.orgId),
    db.select().from(decisionDissent).where(eq(decisionDissent.decisionId, id)).orderBy(desc(decisionDissent.createdAt)),
    db.select().from(decisionCorrections).where(eq(decisionCorrections.decisionId, id)).orderBy(desc(decisionCorrections.createdAt)),
    listPreMortems(id),
    listDQScores(id),
  ]);

  const warnings = evidenceGapWarnings(decision);
  const autoDq = autoSuggestDQ(decision);
  const major = isMajorDecision(decision.decisionType, decision.impact);
  const isFrozen = Boolean(decision.committedAt);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <DecisionsNav orgId={orgId} orgs={orgs} active="desk" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">{decision.question}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill tone={decision.decisionType === "type1" ? "red" : "blue"}>
              {decision.decisionType === "type1" ? "Type 1 · irreversible" : "Type 2 · reversible"}
            </Pill>
            <Pill>{decision.decisionClass}</Pill>
            <Pill tone={isFrozen ? "green" : "amber"}>{decision.status.replace("_", " ")}</Pill>
            {isFrozen && <Pill tone="slate">🔒 frozen at commit</Pill>}
            {major && <Pill tone="red">major decision — pre-mortem expected</Pill>}
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}

      {/* FRAME / EVIDENCE */}
      {!isFrozen && (
        <Card className="mt-6">
          <h2 className="text-lg font-semibold">Frame the decision</h2>
          <p className="mt-1 text-sm text-slate-600">
            Capture options, evidence (with intervals), and a reversibility plan. Entering evidence for an
            option moves the decision to <code>evidence_gathered</code>.
          </p>
          <form action={frameDecisionAction} className="mt-4 space-y-4">
            <input type="hidden" name="decisionId" value={decision.id} />
            <input type="hidden" name="orgId" value={orgId} />
            <div>
              <label className="block text-sm font-medium text-slate-700">Options considered (one per line)</label>
              <textarea
                name="optionsConsidered"
                rows={3}
                defaultValue={decision.optionsConsidered.join("\n")}
                placeholder={"Keep API, invest in it\nSunset API, migrate customers\nDo nothing"}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
              />
            </div>
            {decision.optionsConsidered.map((opt) => (
              <div key={opt} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-medium">{opt}</p>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  <input
                    name={`rationale__${opt}`}
                    placeholder="rationale"
                    className="col-span-2 rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                  <input name={`low__${opt}`} type="number" step="any" placeholder="interval low" className="rounded border border-slate-300 px-2 py-1 text-sm" />
                  <input name={`high__${opt}`} type="number" step="any" placeholder="interval high" className="rounded border border-slate-300 px-2 py-1 text-sm" />
                  <select name={`confidence__${opt}`} className="col-span-4 rounded border border-slate-300 px-2 py-1 text-sm">
                    <option value="">confidence class...</option>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </div>
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-slate-700">Reversibility plan</label>
              <textarea
                name="reversibilityPlan"
                rows={2}
                defaultValue={decision.reversibilityPlan ?? ""}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Trigger conditions (reality-based review) — one per line: <code>signal op value</code>
              </label>
              <textarea
                name="triggerConditions"
                rows={2}
                placeholder={"support_tickets_per_week gt 50\nchurn_rate gte 0.1"}
                defaultValue={decision.triggerConditions.map((t) => `${t.signal} ${t.op} ${t.value}`).join("\n")}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
              />
            </div>
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Save frame / evidence
            </button>
          </form>
        </Card>
      )}

      {/* OPTIONS / EVIDENCE READ-ONLY (frozen) */}
      {decision.optionsConsidered.length > 0 && (
        <Card className="mt-6">
          <h2 className="text-lg font-semibold">Options considered</h2>
          <ul className="mt-3 space-y-3">
            {decision.optionsConsidered.map((opt) => {
              const ev = decision.optionEvidence[opt];
              const isChosen = decision.chosen === opt;
              return (
                <li key={opt} className={`rounded-lg border p-3 ${isChosen ? "border-emerald-400 bg-emerald-50" : "border-slate-200"}`}>
                  <p className="font-medium">
                    {opt} {isChosen && <Pill tone="green">chosen</Pill>}
                  </p>
                  {ev ? (
                    <div className="mt-1 text-sm text-slate-600">
                      <p>{ev.rationale}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {ev.interval ? `interval: ${ev.interval.low}–${ev.interval.high}` : "no interval"} ·
                        {" "}
                        {ev.confidence ?? "no confidence class"}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-amber-700">no evidence recorded</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* DISSENT — never hidden */}
      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Dissent</h2>
        <p className="mt-1 text-sm text-slate-600">
          Dissent is never hidden behind the chosen option. Entries recorded after commit are shown as "late"
          addenda — they do not rewrite the frozen record.
        </p>
        <ul className="mt-3 space-y-3">
          {dissentRows.length === 0 && <li className="text-sm text-slate-500">No dissent recorded.</li>}
          {dissentRows.map((d) => (
            <li key={d.id} className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-medium">
                {d.whoName} {d.isLate && <Pill tone="amber">late dissent</Pill>}
              </p>
              <p className="mt-1 text-sm text-slate-700">{d.theCase}</p>
              {d.response ? (
                <p className="mt-1 text-sm text-slate-500">Response: {d.response}</p>
              ) : (
                <p className="mt-1 text-sm text-red-600">No response recorded yet.</p>
              )}
            </li>
          ))}
        </ul>
        <form action={addDissentAction} className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input type="hidden" name="decisionId" value={decision.id} />
          <input type="hidden" name="orgId" value={orgId} />
          <input name="whoName" placeholder="Who" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="response" placeholder="Decider's response (optional)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <textarea
            name="theCase"
            placeholder="The dissenting case"
            required
            className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="sm:col-span-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200">
            Record dissent
          </button>
        </form>
      </Card>

      {/* PRE-MORTEM */}
      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Pre-mortem</h2>
        <p className="mt-1 text-sm text-slate-600">"Assume this decision failed. Why?" — surfaced again at review.</p>
        <ul className="mt-3 space-y-3">
          {preMortems.length === 0 && <li className="text-sm text-slate-500">No pre-mortem captured yet{major ? " — recommended for this major decision." : "."}</li>}
          {preMortems.map((pm) => (
            <li key={pm.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-medium">Reasons it could fail:</p>
              <ul className="ml-4 list-disc">
                {(pm.reasons as string[]).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              {(pm.mitigations as string[]).length > 0 && (
                <>
                  <p className="mt-2 font-medium">Mitigations:</p>
                  <ul className="ml-4 list-disc">
                    {(pm.mitigations as string[]).map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </>
              )}
            </li>
          ))}
        </ul>
        <form action={createPremortemAction} className="mt-4 space-y-2">
          <input type="hidden" name="decisionId" value={decision.id} />
          <input type="hidden" name="orgId" value={orgId} />
          <textarea name="reasons" rows={3} placeholder={"One reason per line"} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <textarea name="mitigations" rows={2} placeholder={"One mitigation per line (optional)"} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200">
            Add pre-mortem
          </button>
        </form>
      </Card>

      {/* COMMIT */}
      {!isFrozen && (
        <Card className="mt-6 border-2 border-slate-900">
          <h2 className="text-lg font-semibold">Commit (freezes the record)</h2>
          <p className="mt-1 text-sm text-slate-600">
            Once committed, the question, options, evidence, choice, rationale, dissent snapshot, expectations,
            and decision rights are frozen — no edits, only correction events.
          </p>
          <form action={commitDecisionAction} className="mt-4 space-y-3">
            <input type="hidden" name="decisionId" value={decision.id} />
            <input type="hidden" name="orgId" value={orgId} />
            <div>
              <label className="block text-sm font-medium text-slate-700">Chosen option</label>
              <input name="chosen" required list="options-list" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              <datalist id="options-list">
                {decision.optionsConsidered.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Choice rationale</label>
              <textarea name="choiceRationale" required rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Expected outcome</label>
              <textarea name="expectedOutcome" required rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input name="intervalLow" type="number" step="any" placeholder="interval low" className="rounded-lg border border-slate-300 px-3 py-2" />
              <input name="intervalHigh" type="number" step="any" placeholder="interval high" className="rounded-lg border border-slate-300 px-3 py-2" />
              <select name="confidenceClass" required className="rounded-lg border border-slate-300 px-3 py-2">
                <option value="">confidence...</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Review at</label>
                <input name="reviewAt" type="date" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Decided by</label>
                <select name="decidedBy" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value="">select...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {u.role}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Trigger conditions (optional, one per line)</label>
              <textarea
                name="triggerConditions"
                rows={2}
                placeholder={"support_tickets_per_week gt 50"}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
              />
            </div>
            <button type="submit" className="rounded-lg bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-800">
              Commit decision (freeze)
            </button>
          </form>
        </Card>
      )}

      {/* FROZEN RECORD VIEW */}
      {isFrozen && (
        <Card className="mt-6">
          <h2 className="text-lg font-semibold">Frozen record</h2>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Chosen</dt>
              <dd className="font-medium">{decision.chosen}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Decided by</dt>
              <dd className="font-medium">{decision.decidedBy}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Choice rationale</dt>
              <dd>{decision.choiceRationale}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Expected outcome</dt>
              <dd>
                {decision.expected?.outcome} ({decision.expected?.confidenceClass} confidence
                {decision.expected?.interval ? `, interval ${decision.expected.interval.low}–${decision.expected.interval.high}` : ""})
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Review at</dt>
              <dd>{decision.expected?.reviewAt?.slice(0, 10)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Decision rights at commit</dt>
              <dd>
                decider: {decision.decisionRights?.role ?? "unconfigured"} · consulted:{" "}
                {decision.decisionRights?.consulted.join(", ") || "none"} · informed:{" "}
                {decision.decisionRights?.informed.join(", ") || "none"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Reversibility plan</dt>
              <dd>{decision.reversibilityPlan || "none recorded"}</dd>
            </div>
          </dl>

          {decision.status === "decided" && (
            <form action={reviewDecisionAction} className="mt-5">
              <input type="hidden" name="decisionId" value={decision.id} />
              <input type="hidden" name="orgId" value={orgId} />
              <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                Mark reviewed
              </button>
            </form>
          )}
        </Card>
      )}

      {/* CORRECTIONS */}
      {isFrozen && (
        <Card className="mt-6">
          <h2 className="text-lg font-semibold">Corrections (append-only addenda)</h2>
          <p className="mt-1 text-sm text-slate-600">
            The frozen record above never changes. Corrections are new, timestamped events — never retrofitted rationale.
          </p>
          <ul className="mt-3 space-y-2">
            {corrections.length === 0 && <li className="text-sm text-slate-500">No corrections recorded.</li>}
            {corrections.map((c) => (
              <li key={c.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <Pill>{c.correctionType}</Pill>{" "}
                <span className="text-slate-500">{new Date(c.createdAt).toLocaleString()}</span>
                <p className="mt-1">{c.note}</p>
              </li>
            ))}
          </ul>
          <form action={addCorrectionAction} className="mt-4 space-y-2">
            <input type="hidden" name="decisionId" value={decision.id} />
            <input type="hidden" name="orgId" value={orgId} />
            <input name="correctionType" placeholder="correctionType (e.g. clarification, outcome_note)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <textarea name="note" required rows={2} placeholder="Correction note" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200">
              Add correction event
            </button>
          </form>
        </Card>
      )}

      {/* DQ SCORING */}
      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Decision-quality scorecard (diagnostic)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Scores the process, not the person. Auto-suggested floor below is derived from structural signals only
          (never prose length), to resist "write a beautiful record, decide badly" gaming.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm sm:grid-cols-6">
          {(Object.keys(autoDq) as (keyof typeof autoDq)[]).map((dim) => (
            <div key={dim} className="rounded-lg bg-slate-50 p-2 text-center">
              <p className="text-xs uppercase text-slate-500">{dim}</p>
              <p className="text-lg font-semibold">{autoDq[dim]}</p>
            </div>
          ))}
        </div>

        {dqHistory.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-slate-700">Scoring history</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {dqHistory.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5">
                  <span>
                    {s.scoredBy} — DQ {s.dq}/12 (auto {s.autoDq}/12){" "}
                    {s.gamingRisk && <Pill tone="red">gaming risk flagged</Pill>}
                  </span>
                  <span className="text-xs text-slate-400">{new Date(s.createdAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form action={scoreDecisionAction} className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <input type="hidden" name="decisionId" value={decision.id} />
          <input type="hidden" name="orgId" value={orgId} />
          {(["frame", "options", "evidence", "expectations", "reversibility", "review"] as const).map((dim) => (
            <div key={dim}>
              <label className="block text-xs uppercase text-slate-500">{dim}</label>
              <select name={dim} defaultValue={autoDq[dim]} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm">
                <option value={0}>0</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </div>
          ))}
          <input name="scoredBy" placeholder="Your name" required className="col-span-3 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-3" />
          <input name="notes" placeholder="Notes (required if overriding auto-score upward)" className="col-span-3 rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-3" />
          <button type="submit" className="col-span-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Submit score
          </button>
        </form>
      </Card>
    </main>
  );
}
