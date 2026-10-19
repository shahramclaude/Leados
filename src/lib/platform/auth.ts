// Stand-in viewer resolution for this build.
//
// LEADOS doesn't yet integrate a real SSO/IdP (that's a platform-layer
// concern tracked separately). Until it does, every people-data request
// must still declare *who is asking and in what capacity* so the privacy
// layer has something real to enforce against — so callers pass
// `x-viewer-id` and `x-viewer-role` headers (or, for the browser demo UI, a
// `viewerId`/`viewerRole` query string) and this module turns that into a
// typed Viewer. Swap this file's internals for real session/JWT parsing
// without touching any call site — every route depends on `resolveViewer`,
// not on headers directly.

import type { Viewer, ViewerRole } from "../domain/types";

const VALID_ROLES: ViewerRole[] = ["self", "manager", "hr", "exec", "peer"];

export function resolveViewer(request: Request): Viewer {
  const url = new URL(request.url);
  const headerId = request.headers.get("x-viewer-id");
  const headerRole = request.headers.get("x-viewer-role");
  const queryId = url.searchParams.get("viewerId");
  const queryRole = url.searchParams.get("viewerRole");

  const idRaw = headerId ?? queryId;
  const roleRaw = (headerRole ?? queryRole ?? "peer").toLowerCase();

  const id = idRaw ? Number(idRaw) : NaN;
  const role: ViewerRole = VALID_ROLES.includes(roleRaw as ViewerRole) ? (roleRaw as ViewerRole) : "peer";

  if (!Number.isFinite(id)) {
    // Unauthenticated callers are treated as the lowest-privilege role and
    // an id that can never match a real person, so `self` checks safely fail.
    return { id: -1, role: "peer" };
  }

  return { id, role };
}
