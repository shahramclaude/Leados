import { t, type Locale, type MessageParams } from "@/lib/i18n";
import type { EngineRecordRow } from "@/lib/repo/engineRecords";

// Maps an engine record's stable `templateKey` to the i18n message keys used
// to render it. Engine output is NEVER stored as baked English prose — only
// `templateKey` + `params` are persisted, so the identical row renders
// correctly in every supported locale.
const TEMPLATE_KEY_MAP: Record<string, { title: string; body: string; plain: string }> = {
  "briefing.weekly": {
    title: "engine.briefing.weekly.title",
    body: "engine.briefing.weekly.body",
    plain: "engine.briefing.weekly.plain",
  },
  "finding.metric": {
    title: "engine.finding.metric.title",
    body: "engine.finding.metric.body",
    plain: "engine.finding.metric.plain",
  },
  "playbook.action": {
    title: "engine.playbook.action.title",
    body: "engine.playbook.action.body",
    plain: "engine.playbook.action.plain",
  },
};

export type RenderedRecord = { title: string; body: string };

export function renderEngineRecord(
  record: Pick<EngineRecordRow, "templateKey" | "params">,
  locale: Locale,
  plainLanguage: boolean,
): RenderedRecord {
  const keys = TEMPLATE_KEY_MAP[record.templateKey];
  if (!keys) {
    return { title: record.templateKey, body: "" };
  }
  const params = withDerivedTrendLabel(record.params, locale);
  const title = t(locale, keys.title, params);
  const body = t(locale, plainLanguage ? keys.plain : keys.body, params);
  return { title, body };
}

// `trendDirection` is stored as a raw "up"/"down"/"flat" code and localized
// at render time via trend.* keys, so the catalog — not the engine — owns
// the wording in each language.
function withDerivedTrendLabel(params: Record<string, string | number>, locale: Locale): MessageParams {
  const code = params.trendDirection;
  if (typeof code !== "string") return params;
  const label = t(locale, `trend.${code}`);
  return { ...params, trendDirection: label };
}

export const ENGINE_TEMPLATE_KEYS = Object.keys(TEMPLATE_KEY_MAP);
