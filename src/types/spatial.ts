/**
 * Spatial data contracts — Part 49.
 *
 * Every spatial scene MUST declare its SpatialEncoding[] before it renders.
 * The encoding validator (src/lib/spatial/encodingValidator.ts) lints these
 * at build-verification time (`npm run verify`) and at runtime (dev warning).
 *
 * Perceptual ranking extends Part 02's Cleveland–McGill ordering:
 *   position (common scale) > position (non-aligned scale) > length
 *   > direction > angle > area > volume/curvature > color (sequential)
 *   > color (categorical) > DEPTH (camera-distance cue)
 *
 * DEPTH IS THE WEAKEST CHANNEL. It is permitted ONLY for categorical /
 * ordinal grouping (e.g. "this plane is the baseline scenario set, that
 * plane is the alternates") and is FORBIDDEN for magnitude. The validator
 * enforces this mechanically — see encodingValidator.ts.
 */

export type EncodingDimension = "position3d" | "size" | "depth" | "color" | "motion";

export type ScaleType = "linear" | "log" | "ordinal" | "categorical" | "sqrt";

/** Whether the underlying data field is magnitude-like (quantitative, comparable by ratio/interval)
 * or purely categorical/nominal/ordinal grouping. This is what the validator checks against `dimension`.
 */
export type FieldKind = "magnitude" | "categorical" | "ordinal" | "identity";

export interface SpatialEncoding {
  /** The visual channel used to display this field. */
  dimension: EncodingDimension;
  /** The data field being encoded, e.g. "dependencyCount", "riskTier". */
  dataField: string;
  /** How the field's domain maps to the visual range. */
  scaleType: ScaleType;
  /** Nature of the underlying data — used by the validator to catch misuse. */
  fieldKind: FieldKind;
  /** Position in the Cleveland–McGill-extended accuracy ranking (0 = most accurate). */
  perceptualRanking: number;
  /** If true, this channel carries NO data (pure decoration) and must be labeled as such in the UI. */
  decorative?: boolean;
  /** Human-readable note shown in the Encoding Legend. */
  note?: string;
}

export const PERCEPTUAL_RANKING: Record<string, number> = {
  "position-common-scale": 0,
  "position-nonaligned-scale": 1,
  length: 2,
  direction: 3,
  angle: 4,
  area: 5,
  "volume-or-curvature": 6,
  "color-sequential": 7,
  "color-categorical": 8,
  depth: 9, // weakest — Part 49 extension beyond Part 02's 2D ranking
};

export type SceneKind = "ecosystem" | "scenario-landscape" | "org-structure";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Generic scene node usable across all three scene types for shared machinery
 * (projection, keyboard traversal, LOD, semantic-equivalent generation). */
export interface SceneNode {
  id: string;
  label: string;
  position: Vec3;
  /** Quantitative magnitude driving size/length encodings (never depth). */
  magnitude: number;
  /** Categorical grouping, safe to encode via color or depth-plane separation. */
  category: string;
  /** Arbitrary extra fields surfaced in the table view / description. */
  fields: Record<string, string | number>;
}

export interface SceneEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  kind?: string;
}

export interface SceneDescriptor {
  id: SceneKind;
  title: string;
  summary: string;
  /** Justification for why this structure needs a spatial (3D) treatment, or why 2D was kept primary. */
  spatialJustification: string;
  encodings: SpatialEncoding[];
  nodes: SceneNode[];
  edges?: SceneEdge[];
  /** Whether 3D is the primary view for this scene (false => 2D is primary, 3D optional/decorative). */
  threeDPrimary: boolean;
}

export interface TourStep {
  id: string;
  title: string;
  narration: string;
  /** Node ids to highlight/focus for this step. */
  focusNodeIds: string[];
  /** Camera target in scene-local coordinates (ignored for 2D-primary scenes; they pan/zoom instead). */
  cameraTarget: Vec3;
}

export interface SemanticEquivalent {
  sceneId: SceneKind;
  /** 2D chart specification (lightweight, framework-free so it can be asserted on in tests). */
  chart2d: {
    kind: "network" | "parallel-coordinates" | "icicle";
    description: string;
  };
  table: {
    columns: string[];
    rows: (string | number)[][];
  };
  /** Plain-language description meeting Part 02 "text alternative" rules: trend + extremes + count. */
  description: string;
}
