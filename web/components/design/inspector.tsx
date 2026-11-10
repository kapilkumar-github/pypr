"use client"

import { useState } from "react"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { COLORS, SHAPES, type NodeData } from "./catalog"
import type { Arrow, EdgeStyle, Line } from "./edges"

function Swatches({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {COLORS.map((c) => (
        <button
          key={c || "default"}
          type="button"
          onClick={() => onChange(c)}
          aria-label={c || "Default"}
          aria-pressed={value === c}
          title={c || "Default"}
          className={cn("size-6 rounded-full border-2", value === c ? "border-foreground" : "border-transparent ring-1 ring-border")}
          style={{ background: c || "linear-gradient(135deg, var(--card) 50%, var(--muted-foreground) 50%)" }}
        />
      ))}
    </div>
  )
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; name: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-md border p-0.5 text-xs">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)} className={cn("flex-1 rounded px-2 py-1 font-medium", value === o.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          {o.name}
        </button>
      ))}
    </div>
  )
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{title}</p>
      {children}
    </div>
  )
}

export function NodeInspector({ data, count, onChange }: { data: NodeData; count: number; onChange: (patch: Partial<NodeData>) => void }) {
  const group = data.shape === "group"
  const [tab, setTab] = useState<"style" | "role">("role")
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">{count > 1 ? `${count} items selected` : "Item"}</p>
      {count === 1 && (
        <div role="tablist" aria-label="Item details" className="flex rounded-md border p-0.5 text-xs">
          {([["role", "Role"], ["style", "Style"]] as const).map(([id, name]) => (
            <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("flex-1 rounded px-2 py-1 font-medium", tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {name}
            </button>
          ))}
        </div>
      )}
      {count === 1 && tab === "role" ? (
        <div className="space-y-4">
          <Row title="Name">
            <Input value={data.label} onChange={(e) => onChange({ label: e.target.value })} maxLength={80} aria-label="Name" />
          </Row>
          <Row title="What it does">
            <Textarea
              value={data.role ?? ""}
              onChange={(e) => onChange({ role: e.target.value || undefined })}
              maxLength={500}
              rows={6}
              placeholder="Its job in this design: what it stores or serves, who calls it, and why it is here."
              aria-label="What it does"
            />
          </Row>
          <p className="text-xs text-muted-foreground">The interviewer reads this when it evaluates your design, so say what the component is for, not just what it is.</p>
        </div>
      ) : (
        <StyleFields data={data} group={group} onChange={onChange} />
      )}
    </div>
  )
}

function StyleFields({ data, group, onChange }: { data: NodeData; group: boolean; onChange: (patch: Partial<NodeData>) => void }) {
  return (
    <div className="space-y-4">
      {!group && (
        <Row title="Shape">
          <select aria-label="Shape" value={data.shape ?? ""} onChange={(e) => onChange({ shape: (e.target.value || undefined) as NodeData["shape"] })} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">Default</option>
            {SHAPES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Row>
      )}
      <Row title="Color">
        <Swatches label="Fill color" value={data.fill ?? ""} onChange={(c) => onChange({ fill: c || undefined, stroke: undefined })} />
      </Row>
      <Row title="Text size">
        <Seg label="Text size" value={String(data.fontSize ?? 13)} options={[{ id: "11", name: "S" }, { id: "13", name: "M" }, { id: "16", name: "L" }, { id: "20", name: "XL" }]} onChange={(v) => onChange({ fontSize: Number(v) })} />
      </Row>
      <p className="text-xs text-muted-foreground">Double-click an item to edit its text. Drag a dot on its edge to draw an arrow.</p>
    </div>
  )
}

export function EdgeInspector({ info, count, onChange }: { info: EdgeStyle; count: number; onChange: (patch: Partial<EdgeStyle>) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">{count > 1 ? `${count} arrows selected` : "Arrow"}</p>
      {count === 1 && (
        <Row title="Label">
          <Input value={info.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="HTTPS, gRPC, async…" aria-label="Arrow label" />
        </Row>
      )}
      <Row title="Line">
        <Seg<Line> label="Line" value={info.line} options={[{ id: "smoothstep", name: "Steps" }, { id: "default", name: "Curve" }, { id: "straight", name: "Straight" }]} onChange={(line) => onChange({ line })} />
      </Row>
      <Row title="Arrowheads">
        <Seg<Arrow> label="Arrowheads" value={info.arrow} options={[{ id: "none", name: "None" }, { id: "end", name: "One way" }, { id: "both", name: "Both" }]} onChange={(arrow) => onChange({ arrow })} />
      </Row>
      <Row title="Style">
        <Seg<"solid" | "dashed" | "flow"> label="Style" value={info.animated ? "flow" : info.dashed ? "dashed" : "solid"} options={[{ id: "solid", name: "Solid" }, { id: "dashed", name: "Dashed" }, { id: "flow", name: "Animated" }]} onChange={(v) => onChange({ dashed: v === "dashed", animated: v === "flow" })} />
      </Row>
      <Row title="Color">
        <Swatches label="Arrow color" value={info.color} onChange={(color) => onChange({ color })} />
      </Row>
    </div>
  )
}
