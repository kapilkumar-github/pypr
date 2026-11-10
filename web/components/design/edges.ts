import { MarkerType, type Edge } from "@xyflow/react"

export type Arrow = "none" | "end" | "both"
export type Line = "smoothstep" | "straight" | "default"

/** The few things a learner can set on an edge, kept in React Flow's own fields so saved boards stay plain. */
export type EdgeStyle = { label: string; dashed: boolean; animated: boolean; arrow: Arrow; color: string; line: Line }

export const DEFAULT_EDGE: Partial<Edge> = { type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } }

export function edgeInfo(e: Edge): EdgeStyle {
  const style = (e.style ?? {}) as { stroke?: string; strokeDasharray?: string }
  return {
    label: typeof e.label === "string" ? e.label : "",
    dashed: !!style.strokeDasharray,
    animated: !!e.animated,
    arrow: e.markerEnd && e.markerStart ? "both" : e.markerEnd ? "end" : "none",
    color: style.stroke ?? "",
    line: (e.type as Line) ?? "default",
  }
}

export function applyEdge(e: Edge, patch: Partial<EdgeStyle>): Edge {
  const s = { ...edgeInfo(e), ...patch }
  const marker = (on: boolean) => (on ? { type: MarkerType.ArrowClosed, color: s.color || undefined } : undefined)
  return {
    ...e,
    type: s.line,
    label: s.label || undefined,
    animated: s.animated,
    style: { ...(s.color ? { stroke: s.color } : {}), ...(s.dashed ? { strokeDasharray: "6 4" } : {}) },
    markerEnd: marker(s.arrow !== "none"),
    markerStart: marker(s.arrow === "both"),
  }
}
