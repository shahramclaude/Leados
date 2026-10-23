/**
 * Keyboard traversal order through spatial data points. Pure function so it
 * can be tested without a DOM. The rule: traversal order must be a stable,
 * total ordering over every node (reading-order-like), independent of 3D
 * camera state — keyboard users must reach every data point regardless of
 * current orbit/zoom.
 */
import type { SceneNode } from "@/types/spatial";

/** Orders nodes for Tab/Arrow traversal: category (stable groups) then
 * descending magnitude (most important first within a group), tie-broken by id. */
export function computeTraversalOrder(nodes: SceneNode[]): SceneNode[] {
  return [...nodes].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (b.magnitude !== a.magnitude) return b.magnitude - a.magnitude;
    return a.id.localeCompare(b.id);
  });
}

/** Given the current traversal order and a focused id, returns the next/prev id. */
export function stepTraversal(order: SceneNode[], currentId: string | null, delta: 1 | -1): string | null {
  if (order.length === 0) return null;
  if (currentId === null) return order[0].id;
  const idx = order.findIndex((n) => n.id === currentId);
  if (idx === -1) return order[0].id;
  const next = (idx + delta + order.length) % order.length;
  return order[next].id;
}
