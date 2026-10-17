import { useState } from "react";
import type { AppState, LeadEvent } from "../lib/types";
import { Card, SectionTitle, Badge, EmptyState } from "./ui";
import { fmtDate, fmtMoney } from "../lib/format";
import { cn } from "../utils/cn";

const TABS = [
  { key: "stakeholder.mapped", label: "Stakeholders" },
  { key: "ecosystem.map", label: "Ecosystem" },
  { key: "ma.target.logged", label: "M&A targets" },
  { key: "reg.jurisdiction", label: "Regulatory" },
  { key: "org.design.scenario", label: "Org design" },
  { key: "tech.disruption", label: "Technology" },
  { key: "intel.signal", label: "Intel signals" },
];

export function RegistersView({ state }: { state: AppState }) {
  const [tab, setTab] = useState(TABS[0].key);
  const items = state.events.filter((e) => e.type === tab).sort((a, b) => (a.ts > b.ts ? -1 : 1));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Strategic registers</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          Structured views over the manually-logged pt-O intelligence types — stakeholder map, ecosystem map, M&A
          pipeline, regulatory watch list, org design scenarios, technology disruption watch, and raw intel signals.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-900/40 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition",
              tab === t.key ? "bg-violet-600 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <SectionTitle>{TABS.find((t) => t.key === tab)?.label}</SectionTitle>
        {items.length === 0 ? (
          <EmptyState>No {tab} events logged yet. Add one from "Log intel".</EmptyState>
        ) : (
          <RegisterTable type={tab} items={items} />
        )}
      </Card>
    </div>
  );
}

function RegisterTable({ type, items }: { type: string; items: LeadEvent[] }) {
  switch (type) {
    case "stakeholder.mapped":
      return (
        <Grid>
          {items.map((e) => (
            <Row key={e.id} ts={e.ts}>
              <div className="font-medium text-zinc-100">{e.data.name}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-400">
                <Badge>{e.data.type}</Badge>
                <span>influence {e.data.influence ?? "—"}/5</span>
                <span>alignment {e.data.alignment ?? "—"}/5</span>
              </div>
            </Row>
          ))}
        </Grid>
      );
    case "ecosystem.map":
      return (
        <Grid>
          {items.map((e) => (
            <Row key={e.id} ts={e.ts}>
              <div className="font-medium text-zinc-100">{e.data.name}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-400">
                <Badge>{e.data.role}</Badge>
                <Badge tone={e.data.strength === "strong" ? "emerald" : e.data.strength === "weak" ? "red" : "amber"}>{e.data.strength}</Badge>
                <Badge tone={e.data.trend === "growing" ? "emerald" : e.data.trend === "declining" ? "red" : "zinc"}>{e.data.trend}</Badge>
              </div>
            </Row>
          ))}
        </Grid>
      );
    case "ma.target.logged":
      return (
        <Grid>
          {items.map((e) => (
            <Row key={e.id} ts={e.ts}>
              <div className="flex items-center justify-between">
                <div className="font-medium text-zinc-100">{e.data.name}</div>
                <Badge tone={e.data.status === "active" ? "emerald" : e.data.status === "terminated" ? "red" : "zinc"}>{e.data.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-zinc-400">{e.data.rationale}</p>
              <div className="mt-1 text-xs text-zinc-500">est. value: {fmtMoney(e.data.estimatedValue)}</div>
              {Array.isArray(e.data.risks) && e.data.risks.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {e.data.risks.map((r: string, i: number) => (
                    <Badge key={i} tone="red">
                      {r}
                    </Badge>
                  ))}
                </div>
              )}
            </Row>
          ))}
        </Grid>
      );
    case "reg.jurisdiction":
      return (
        <Grid>
          {items.map((e) => (
            <Row key={e.id} ts={e.ts}>
              <div className="flex items-center justify-between">
                <div className="font-medium text-zinc-100">{e.data.name}</div>
                <Badge>watch {e.data.watchLevel ?? "—"}/5</Badge>
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                {e.data.region} · {e.data.type}
              </div>
              {Array.isArray(e.data.relevantFrameworks) && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {e.data.relevantFrameworks.map((f: string, i: number) => (
                    <Badge key={i}>{f}</Badge>
                  ))}
                </div>
              )}
            </Row>
          ))}
        </Grid>
      );
    case "org.design.scenario":
      return (
        <Grid>
          {items.map((e) => (
            <Row key={e.id} ts={e.ts}>
              <div className="font-medium text-zinc-100">{e.data.name}</div>
              <p className="mt-1 text-xs text-zinc-400">current: {e.data.currentStructure}</p>
              <p className="text-xs text-zinc-400">proposed: {e.data.proposedStructure}</p>
              <p className="mt-1 text-xs text-zinc-500">hypothesis: {e.data.hypothesis}</p>
            </Row>
          ))}
        </Grid>
      );
    case "tech.disruption":
      return (
        <Grid>
          {items.map((e) => (
            <Row key={e.id} ts={e.ts}>
              <div className="flex items-center justify-between">
                <div className="font-medium text-zinc-100">{e.data.technology}</div>
                <Badge tone={e.data.threatOrOpportunity === "threat" ? "red" : e.data.threatOrOpportunity === "opportunity" ? "emerald" : "amber"}>
                  {e.data.threatOrOpportunity}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-400">
                <Badge>{e.data.maturityLevel}</Badge>
                <span>relevance {e.data.relevanceToUs ?? "—"}/5</span>
                <span>{e.data.timeHorizon_months ?? "—"} mo horizon</span>
              </div>
            </Row>
          ))}
        </Grid>
      );
    case "intel.signal":
      return (
        <Grid>
          {items.map((e) => (
            <Row key={e.id} ts={e.ts}>
              <div className="flex items-center justify-between">
                <Badge tone="sky">{e.data.type}</Badge>
                <span className="text-xs text-zinc-500">reliability {e.data.reliability ?? "—"}/5</span>
              </div>
              <p className="mt-1 text-sm text-zinc-300">{e.data.content}</p>
              <p className="mt-1 text-xs text-zinc-500">source: {e.data.source || "—"}</p>
            </Row>
          ))}
        </Grid>
      );
    default:
      return null;
  }
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>;
}

function Row({ children, ts }: { children: React.ReactNode; ts: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 p-3">
      {children}
      <div className="mt-2 text-[10px] uppercase tracking-wide text-zinc-600">{fmtDate(ts)}</div>
    </div>
  );
}
