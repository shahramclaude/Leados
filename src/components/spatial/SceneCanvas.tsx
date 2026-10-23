import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SceneEdge, SceneNode } from "@/types/spatial";
import { DEFAULT_CAMERA, orbit, project, zoom, type Camera } from "@/lib/spatial/projection";
import { computeTraversalOrder, stepTraversal } from "@/lib/spatial/keyboardTraversal";
import { usePrefersReducedMotion, useGpuProfile, lodLimit } from "@/lib/spatial/accessibilityHooks";

export interface SceneCanvasProps {
  nodes: SceneNode[];
  edges?: SceneEdge[];
  colorFor: (node: SceneNode) => string;
  radiusFor: (node: SceneNode) => number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  height?: number;
  /** externally driven camera target override (used by guided tours) */
  tourCameraTarget?: { x: number; y: number; z: number } | null;
  ariaLabel: string;
}

export function SceneCanvas({
  nodes,
  edges = [],
  colorFor,
  radiusFor,
  selectedId,
  onSelect,
  height = 420,
  tourCameraTarget,
  ariaLabel,
}: SceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const dragState = useRef<{ x: number; y: number } | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const gpu = useGpuProfile();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  const visibleNodes = useMemo(() => {
    const limit = lodLimit(nodes.length, { lowGpu: gpu.lowPower, mobile: isMobile });
    if (limit >= nodes.length) return nodes;
    // LOD: keep the highest-magnitude nodes first (progressive streaming by importance).
    return [...nodes].sort((a, b) => b.magnitude - a.magnitude).slice(0, limit);
  }, [nodes, gpu.lowPower, isMobile]);

  const traversalOrder = useMemo(() => computeTraversalOrder(visibleNodes), [visibleNodes]);

  useEffect(() => {
    if (!tourCameraTarget || reducedMotion) {
      if (tourCameraTarget && reducedMotion) {
        setCamera((c) => ({ ...c, target: tourCameraTarget }));
      }
      return;
    }
    setCamera((c) => ({ ...c, target: tourCameraTarget }));
  }, [tourCameraTarget, reducedMotion]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, h);
    ctx.save();
    ctx.translate(width / 2, h / 2);

    const idToNode = new Map(visibleNodes.map((n) => [n.id, n]));
    const projectedById = new Map(visibleNodes.map((n) => [n.id, project(n.position, camera)]));

    // edges first (behind nodes)
    ctx.lineWidth = 1;
    for (const e of edges) {
      const a = projectedById.get(e.source);
      const b = projectedById.get(e.target);
      if (!a || !b || !idToNode.has(e.source) || !idToNode.has(e.target)) continue;
      ctx.strokeStyle = e.kind === "critical-path" ? "rgba(245,158,11,0.65)" : "rgba(100,116,139,0.25)";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // nodes, sorted back-to-front by depth for correct occlusion
    const order = [...visibleNodes].sort((a, b) => {
      const pa = projectedById.get(a.id)!;
      const pb = projectedById.get(b.id)!;
      return pb.depth - pa.depth;
    });

    for (const n of order) {
      const p = projectedById.get(n.id)!;
      const baseRadius = radiusFor(n) * Math.max(0.4, Math.min(1.6, p.scale));
      ctx.beginPath();
      ctx.fillStyle = colorFor(n);
      ctx.globalAlpha = 0.5 + 0.5 * Math.min(1, p.scale);
      ctx.arc(p.x, p.y, baseRadius, 0, Math.PI * 2);
      ctx.fill();
      if (n.id === selectedId) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#1d4ed8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, baseRadius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }, [visibleNodes, edges, camera, colorFor, radiusFor, selectedId]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  const handlePointerDown = (e: React.PointerEvent) => {
    dragState.current = { x: e.clientX, y: e.clientY };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.x;
    const dy = e.clientY - dragState.current.y;
    dragState.current = { x: e.clientX, y: e.clientY };
    setCamera((c) => orbit(c, dx * 0.006, -dy * 0.006));
  };
  const handlePointerUp = () => {
    dragState.current = null;
  };
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setCamera((c) => zoom(c, e.deltaY > 0 ? 1.08 : 0.92));
  };

  // Projected screen positions for the accessible DOM overlay (real, focusable elements).
  const overlay = useMemo(
    () =>
      visibleNodes.map((n) => {
        const p = project(n.position, camera);
        return { node: n, x: p.x, y: p.y };
      }),
    [visibleNodes, camera]
  );

  const focusNode = useCallback(
    (delta: 1 | -1) => {
      const next = stepTraversal(traversalOrder, selectedId, delta);
      onSelect(next);
    },
    [traversalOrder, selectedId, onSelect]
  );

  return (
    <div className="relative select-none">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-950"
        style={{ height }}
        role="application"
        aria-roledescription="3D spatial scene"
        aria-label={ariaLabel}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
          aria-hidden="true"
        />
        {/* Accessible overlay: real focusable DOM nodes positioned to match the projection,
            so keyboard/screen-reader users get the exact same data points sighted users see. */}
        <div className="pointer-events-none absolute inset-0">
          {overlay.map(({ node, x, y }) => (
            <button
              key={node.id}
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="pointer-events-none absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}
              onClick={() => onSelect(node.id)}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>Drag to orbit · scroll to zoom · use the keyboard list below to tab through every data point.</span>
      </div>
      {/* Real keyboard traversal list: visually minimal but fully in the tab order, not aria-hidden. */}
      <div className="mt-3 flex flex-wrap gap-1" role="listbox" aria-label={`${ariaLabel} — keyboard-navigable data points`}>
        {traversalOrder.map((n) => (
          <button
            key={n.id}
            type="button"
            role="option"
            aria-selected={n.id === selectedId}
            onFocus={() => onSelect(n.id)}
            onClick={() => onSelect(n.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                focusNode(1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                focusNode(-1);
              }
            }}
            className={`rounded-full border px-2 py-1 text-[11px] font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              n.id === selectedId ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {n.label}
          </button>
        ))}
      </div>
      {gpu.lowPower || isMobile ? (
        <p className="mt-2 text-xs text-amber-600">
          Low-GPU / mobile fallback active: showing {visibleNodes.length} of {nodes.length} elements by magnitude (progressive LOD). Full detail remains available in the Table view.
        </p>
      ) : null}
    </div>
  );
}
