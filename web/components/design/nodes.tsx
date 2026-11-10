"use client"

import { createContext, useContext, useState } from "react"
import { Handle, NodeResizer, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react"

import { cn } from "@/lib/utils"
import { itemOf, type NodeData, type ShapeKind } from "./catalog"

export type DesignNode = Node<NodeData, "shape">

/** The canvas gives nodes a way to save an undo step before they change themselves (resize, rename). */
export const RememberContext = createContext<() => void>(() => {})

const DEFAULT_STROKE = "color-mix(in oklab, var(--foreground) 50%, transparent)"
const mix = (color: string, pct: number) => `color-mix(in oklab, ${color} ${pct}%, var(--card))`

/** Outlines for the shapes that are not a plain box. Drawn in a 100 x 100 box and stretched to the node. */
const OUTLINES: Partial<Record<ShapeKind, React.ReactNode>> = {
  ellipse: <ellipse cx="50" cy="50" rx="49" ry="49" />,
  diamond: <polygon points="50,1 99,50 50,99 1,50" />,
  hexagon: <polygon points="24,1 76,1 99,50 76,99 24,99 1,50" />,
  cylinder: (
    <>
      <path d="M1 14 C1 -4 99 -4 99 14 L99 86 C99 104 1 104 1 86 Z" />
      <path d="M1 14 C1 32 99 32 99 14" fill="none" />
    </>
  ),
  cloud: <path d="M24 82 C3 82 -2 55 19 50 C14 22 46 12 56 28 C66 8 102 18 91 46 C108 58 97 82 76 82 Z" transform="translate(0 4) scale(0.96 1)" />,
}

function Outline({ shape, fill, stroke }: { shape: ShapeKind; fill: string; stroke: string }) {
  return (
    <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <g style={{ fill, stroke, strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" }} className="[&_*]:[vector-effect:non-scaling-stroke]">
        {OUTLINES[shape]}
      </g>
    </svg>
  )
}

const BOXED: ShapeKind[] = ["rectangle", "rounded", "note", "group"]

/** One node type for every shape and component. `data.kind` picks the icon, `data.shape` the outline. */
export function ShapeNode({ id, data, selected }: NodeProps<DesignNode>) {
  const { updateNodeData } = useReactFlow()
  const remember = useContext(RememberContext)
  const [editing, setEditing] = useState(false)
  const item = itemOf(data.kind)
  const shape: ShapeKind = data.shape ?? item?.shape ?? "rounded"
  const accent = item?.accent
  const group = shape === "group"
  const fill = data.fill ? mix(data.fill, 16) : group ? "transparent" : shape === "note" ? mix("#f59e0b", 22) : accent ? mix(accent, 14) : "var(--card)"
  const stroke = data.stroke || data.fill || accent || DEFAULT_STROKE
  const Icon = item?.icon
  const boxed = BOXED.includes(shape)

  const done = (value: string) => {
    setEditing(false)
    if (value !== data.label) {
      remember()
      updateNodeData(id, { label: value })
    }
  }

  return (
    <div className="group relative size-full" onDoubleClick={() => setEditing(true)}>
      <NodeResizer isVisible={selected} onResizeStart={remember} minWidth={group ? 120 : 60} minHeight={group ? 80 : 40} lineClassName="!border-primary" handleClassName="!size-2 !rounded-sm !border-primary !bg-background" />
      {boxed ? (
        <div
          className={cn("absolute inset-0 border-[1.5px]", shape === "rectangle" && "rounded-none", shape === "rounded" && "rounded-xl", shape === "note" && "rounded-sm shadow-sm", group && "rounded-2xl border-dashed")}
          style={{ background: fill, borderColor: stroke }}
        />
      ) : (
        <Outline shape={shape} fill={fill} stroke={stroke} />
      )}
      <div className={cn("absolute inset-0 flex min-w-0 items-center justify-center gap-1.5 p-2 text-center", group && "items-start justify-start", Icon && !group && "flex-col")} style={{ fontSize: data.fontSize ?? 13 }}>
        {Icon && !group && <Icon className="size-5 shrink-0" style={{ color: data.fill || accent }} />}
        {editing ? (
          <textarea
            autoFocus
            defaultValue={data.label}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => done(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false)
              if (e.key === "Enter" && !e.shiftKey) e.currentTarget.blur()
              e.stopPropagation()
            }}
            className="nodrag nopan w-full resize-none rounded border bg-background p-1 text-center outline-none focus:ring-2 focus:ring-ring"
            rows={2}
          />
        ) : (
          <span className={cn("max-w-full min-w-0 break-words whitespace-pre-wrap font-medium leading-tight", group && "text-muted-foreground")}>{data.label}</span>
        )}
      </div>
      {["top", "right", "bottom", "left"].map((side) => (
        <Handle
          key={side}
          id={side[0]}
          type="source"
          position={side as Position}
          className={cn("!size-2.5 !border-2 !border-background !bg-primary transition-opacity", selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
        />
      ))}
    </div>
  )
}

export const nodeTypes = { shape: ShapeNode }
