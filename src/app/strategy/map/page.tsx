import { listEvidenceRefs, listKeyResults, listObjectiveLinks, listObjectives } from "@/lib/strategy/objectives";
import { listInitiatives } from "@/lib/strategy/initiatives";
import { computeKeyResultProgress, computeObjectiveScore } from "@/lib/strategy/okrsEngine";
import { HEALTH_COLORS } from "@/lib/strategy/strategyModels";
import type { ObjectiveNode } from "@/lib/strategy/strategyModels";

export const dynamic = "force-dynamic";

function buildChildrenMap(objectives: ObjectiveNode[]) {
  const map = new Map<string | null, ObjectiveNode[]>();
  for (const o of objectives) {
    const key = o.parentId;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(o);
  }
  return map;
}

export default async function StrategyMapPage() {
  const [objectives, , keyResults, initiatives] = await Promise.all([
    listObjectives(),
    listObjectiveLinks(),
    listKeyResults(),
    listInitiatives(),
  ]);
  const evidence = await listEvidenceRefs();
  const childrenMap = buildChildrenMap(objectives);
  const roots = childrenMap.get(null) ?? [];

  function renderNode(o: ObjectiveNode, depth: number) {
    const score = computeObjectiveScore(o.id, o.stretch, keyResults, evidence);
    const colors = HEALTH_COLORS[score.health];
    const krs = keyResults.filter((k) => k.objectiveId === o.id);
    const initCount = initiatives.filter((i) => i.objectiveId === o.id).length;
    const children = childrenMap.get(o.id) ?? [];

    return (
      <div key={o.id} id={o.id} style={{ marginLeft: depth * 24 }} className="mb-3">
        <div className={`rounded-xl border border-slate-200 ${colors.bg} p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${colors.dot}`} />
                <h3 className="font-semibold text-slate-900">{o.title}</h3>
                {o.stretch && (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                    stretch
                  </span>
                )}
                {o.isNorthStarAligned && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    north star
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {o.level} · {o.timeframe} · owner {o.ownerName} · {initCount} initiative{initCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className={`text-right text-sm font-semibold ${colors.text}`}>
              {Math.round(score.score * 100)}%{" "}
              <span className="font-normal text-slate-500">
                ({score.health.replace("_", " ")}
                {o.stretch ? `, calibrated ${Math.round(score.calibratedDisplayScore * 100)}%` : ""})
              </span>
            </div>
          </div>

          {krs.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-slate-200/60 pt-3">
              {krs.map((kr) => {
                const p = computeKeyResultProgress(kr, evidence);
                return (
                  <li key={kr.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-slate-700">{kr.title}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-500">{Math.round(p.progress * 100)}%</span>
                      {p.source === "asserted" ? (
                        <span
                          title={`Hand-asserted, confidence=${p.confidenceClass}`}
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                        >
                          asserted · {p.confidenceClass}
                        </span>
                      ) : (
                        <a
                          href={`#evidence-${p.latestEvidenceId}`}
                          title={`Evidence ${p.latestEvidenceId} observed ${p.latestEvidenceObservedAt}`}
                          className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:underline"
                        >
                          evidence-backed
                        </a>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {children.length > 0 && <div className="mt-2">{children.map((c) => renderNode(c, depth + 1))}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Strategy Map</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Cause-effect chain from objectives to outcomes. Color = health band (stretch objectives are calibrated so
          70% of target counts as healthy; committed objectives need 90%). Every KR progress figure links to its
          evidence, or is explicitly marked "asserted" with a confidence class.
        </p>
      </div>
      {objectives.length === 0 ? (
        <p className="text-slate-500">No objectives yet. Seed demo data from the overview page.</p>
      ) : (
        <div>{roots.map((r) => renderNode(r, 0))}</div>
      )}
    </div>
  );
}
