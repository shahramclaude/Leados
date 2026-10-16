// Hash deep-link router. FABRICATED for this demo, though it follows a
// pattern the real repo does use for real (verified): a bare
// `location.hash` + `hashchange` listener (js/ui.js, verified this session).
// The real app's actual verified routes are #/today, #/roster, #/insights,
// #/patterns, #/cadences, #/data, #/playbooks — NOT #/finance, #/intelligence,
// #/self, #/health, #/trace, #/explain, #/search, #/digest, #/review as the
// pt-E brief lists; none of those query-param forms (?domain=, ?finding=,
// ?focus=, ?tab=) were found in the real ui.js either. This router implements
// the brief's route list as new, labeled demo surface.

import { useEffect, useState } from "react";
import { withViewTransition } from "./utils";

export interface Route {
  path: string[]; // e.g. ["today"] or ["roster", "p-ana"]
  query: URLSearchParams;
  raw: string;
}

function parseHash(): Route {
  const raw = location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const path = pathPart ? pathPart.split("/").filter(Boolean) : [];
  const query = new URLSearchParams(queryPart || "");
  return { path, query, raw };
}

export function navigate(hash: string) {
  withViewTransition(() => {
    location.hash = hash;
  });
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash());
  useEffect(() => {
    if (!location.hash) location.hash = "#/today";
    const onChange = () => withViewTransition(() => setRoute(parseHash()));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function buildFindingLink(rule: string): string {
  return `#/today?finding=${rule}`;
}
export function buildPersonLink(id: string): string {
  return `#/roster/${id}`;
}
export function buildPlaybookLink(id: string, personId?: string): string {
  return personId ? `#/playbooks/${id}/${personId}` : `#/playbooks/${id}`;
}
export function buildTraceLink(eventId: string): string {
  return `#/trace/${eventId}`;
}
export function buildExplainLink(ruleId: string): string {
  return `#/explain/${ruleId}`;
}
export function buildDomainLink(domain: string): string {
  return `#/today?domain=${domain}`;
}
