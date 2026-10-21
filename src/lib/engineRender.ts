import { IntlMessageFormat } from "intl-messageformat";
import enMessages from "../../messages/en-US.json";
import daMessages from "../../messages/da-DK.json";
import type { AppLocale } from "@/i18n/locales";

const CATALOGS: Record<AppLocale, Record<string, unknown>> = {
  "en-US": enMessages,
  "da-DK": daMessages,
};

function lookup(catalog: Record<string, unknown>, dottedKey: string): string | undefined {
  const parts = dottedKey.split(".");
  let cursor: unknown = catalog;
  for (const part of parts) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === "string" ? cursor : undefined;
}

/**
 * Renders engine-generated content (briefings/findings/playbooks/narratives)
 * from a `templateKey` + `params` pair stored in the database into the
 * requested locale. This is the "LLM layer takes a locale parameter and
 * answers in-language" contract from Part 08: engines never store baked
 * English prose — they store a template key and structured params, and
 * *this* function (or its client-side `useTranslations` equivalent) is the
 * only place that turns it into user-facing text, in whichever locale the
 * viewer has selected — independent of which locale the engine ran in.
 */
export function renderEngineMessage(locale: AppLocale, templateKey: string, params: Record<string, unknown>): string {
  const catalog = CATALOGS[locale] ?? CATALOGS["en-US"];
  const message = lookup(catalog, templateKey) ?? lookup(CATALOGS["en-US"], templateKey);
  if (!message) return templateKey;
  try {
    return new IntlMessageFormat(message, locale).format(params) as string;
  } catch {
    return message;
  }
}
