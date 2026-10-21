// App-facing entrypoint for the audit module — guarded so it can never be
// pulled into a client bundle by mistake. See src/lib/auditCore.ts for the
// actual implementation and why scripts/tests import that module directly
// instead of this one.
import "server-only";

export * from "@/lib/auditCore";
