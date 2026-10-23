/**
 * Minimal perspective-projection math for the custom canvas-based spatial
 * renderer. See docs/part49-spatial-analytics.md §Phase 3(a) for why we did
 * NOT pull in three.js / @react-three/fiber: a full WebGL scene graph costs
 * ~140-180KB gzip on its own before any application code, which would blow
 * the 150KB budget for the entire spatial layer. Our scenes only need
 * points, lines and simple extrusions — a ~2KB hand-rolled projection module
 * rendered on a single <canvas> 2D context covers every scene in this part
 * at a fraction of the bundle cost, with full control over accessibility
 * (we own the hit-testing and focus order, not a scene graph library).
 */
import type { Vec3 } from "@/types/spatial";

export interface Camera {
  /** Orbit angles, radians. */
  yaw: number;
  pitch: number;
  /** Distance from the orbit target. */
  distance: number;
  target: Vec3;
  /** Perspective focal length (bigger = less distortion). */
  focalLength: number;
}

export const DEFAULT_CAMERA: Camera = {
  yaw: Math.PI / 4,
  pitch: Math.PI / 6,
  distance: 420,
  target: { x: 0, y: 0, z: 0 },
  focalLength: 480,
};

export interface Projected {
  x: number;
  y: number;
  /** Camera-space depth (distance along view axis); used for z-sort and the depth encoding only. */
  depth: number;
  /** Perspective scale factor (1 = at target distance). Used ONLY for the decorative size-falloff cue. */
  scale: number;
}

function rotateYaw(p: Vec3, yaw: number): Vec3 {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return { x: p.x * cos - p.z * sin, y: p.y, z: p.x * sin + p.z * cos };
}

function rotatePitch(p: Vec3, pitch: number): Vec3 {
  const cos = Math.cos(pitch);
  const sin = Math.sin(pitch);
  return { x: p.x, y: p.y * cos - p.z * sin, z: p.y * sin + p.z * cos };
}

/** Projects a world-space point into screen-space pixel offsets from the canvas center. */
export function project(point: Vec3, camera: Camera): Projected {
  const rel: Vec3 = { x: point.x - camera.target.x, y: point.y - camera.target.y, z: point.z - camera.target.z };
  const yawed = rotateYaw(rel, camera.yaw);
  const pitched = rotatePitch(yawed, camera.pitch);
  const camZ = pitched.z + camera.distance;
  const safeZ = Math.max(camZ, 1);
  const scale = camera.focalLength / safeZ;
  return {
    x: pitched.x * scale,
    y: -pitched.y * scale,
    depth: camZ,
    scale,
  };
}

export function orbit(camera: Camera, dYaw: number, dPitch: number): Camera {
  const maxPitch = Math.PI / 2 - 0.05;
  return {
    ...camera,
    yaw: camera.yaw + dYaw,
    pitch: Math.max(-maxPitch, Math.min(maxPitch, camera.pitch + dPitch)),
  };
}

export function zoom(camera: Camera, factor: number): Camera {
  const minDist = 60;
  const maxDist = 2000;
  return { ...camera, distance: Math.max(minDist, Math.min(maxDist, camera.distance * factor)) };
}

/** Fibonacci-sphere layout — used for the synthetic 10k-element performance benchmark
 * (deterministic, O(n), no iterative simulation needed). */
export function fibonacciSphere(count: number, radius: number): Vec3[] {
  const points: Vec3[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    points.push({ x: Math.cos(theta) * r * radius, y: y * radius, z: Math.sin(theta) * r * radius });
  }
  return points;
}
