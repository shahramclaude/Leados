/**
 * Small, dependency-free force-directed layout (Fruchterman–Reingold style)
 * for the ecosystem/dependency graph. O(n^2) repulsion is fine at the scene's
 * real scale (tens to low hundreds of nodes); the 10k-element performance
 * gate uses the fibonacci-sphere generator instead (projection/draw cost is
 * the actual bottleneck being measured, not layout — see docs §Phase 4).
 */
import type { SceneEdge, SceneNode } from "@/types/spatial";

export function layoutEcosystem3d(nodes: SceneNode[], edges: SceneEdge[], iterations = 160): SceneNode[] {
  const n = nodes.length;
  const radius = 160;
  const positions = nodes.map((_, i) => {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / n);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    return {
      x: radius * Math.sin(phi) * Math.cos(theta),
      y: radius * Math.sin(phi) * Math.sin(theta),
      z: radius * Math.cos(phi),
    };
  });

  const idIndex = new Map(nodes.map((node, i) => [node.id, i]));
  const k = 60; // ideal spring length
  const area = n * k * k;

  for (let iter = 0; iter < iterations; iter++) {
    const disp = positions.map(() => ({ x: 0, y: 0, z: 0 }));
    const temp = (1 - iter / iterations) * 8;

    // repulsion
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const dz = positions[i].z - positions[j].z;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz));
        const force = area / (dist * dist) / 40;
        const ux = dx / dist;
        const uy = dy / dist;
        const uz = dz / dist;
        disp[i].x += ux * force;
        disp[i].y += uy * force;
        disp[i].z += uz * force;
        disp[j].x -= ux * force;
        disp[j].y -= uy * force;
        disp[j].z -= uz * force;
      }
    }

    // attraction along edges
    for (const e of edges) {
      const i = idIndex.get(e.source);
      const j = idIndex.get(e.target);
      if (i === undefined || j === undefined) continue;
      const dx = positions[i].x - positions[j].x;
      const dy = positions[i].y - positions[j].y;
      const dz = positions[i].z - positions[j].z;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz));
      const force = (dist * dist) / k / 40;
      const ux = dx / dist;
      const uy = dy / dist;
      const uz = dz / dist;
      disp[i].x -= ux * force;
      disp[i].y -= uy * force;
      disp[i].z -= uz * force;
      disp[j].x += ux * force;
      disp[j].y += uy * force;
      disp[j].z += uz * force;
    }

    for (let i = 0; i < n; i++) {
      const dlen = Math.max(0.01, Math.sqrt(disp[i].x ** 2 + disp[i].y ** 2 + disp[i].z ** 2));
      const capped = Math.min(dlen, temp + 0.5);
      positions[i].x += (disp[i].x / dlen) * capped;
      positions[i].y += (disp[i].y / dlen) * capped;
      positions[i].z += (disp[i].z / dlen) * capped;
    }
  }

  return nodes.map((node, i) => ({ ...node, position: positions[i] }));
}
