// Side-effecting import that registers every built-in capability. Every API
// route and script that touches the kernel imports this first, so the
// registry is always populated before `requireCapability` is ever called —
// but note this only ever ADDS capabilities; it never changes what a given
// capability name resolves to (see registry.ts).
import { ensureBuiltinCapabilitiesRegistered } from "./capabilities";

ensureBuiltinCapabilitiesRegistered();

export { ensureBuiltinCapabilitiesRegistered };
