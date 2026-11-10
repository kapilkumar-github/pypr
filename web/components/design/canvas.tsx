"use client"

import "@xyflow/react/dist/style.css"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import {
  addEdge,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  getNodesBounds,
  getViewportForBounds,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type OnBeforeDelete,
} from "@xyflow/react"
import { toPng } from "html-to-image"
import { ArrowLeft, ClipboardList, Copy, Download, Grid3x3, Maximize, Redo2, Sparkles, StickyNote, Trash2, Undo2, Upload } from "lucide-react"
import { toast } from "sonner"

import { FormAlert } from "@/components/common/form-alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/api/client"
import { useBoard, useEvaluate, useSaveBoard, type Board, type BoardDoc, type BoardNote } from "@/lib/api/design"
import { newId as uniqueId } from "@/lib/resume/ids"
import { cn } from "@/lib/utils"
import { itemOf, type NodeData, type PaletteItem } from "./catalog"
import { applyEdge, DEFAULT_EDGE, edgeInfo, type EdgeStyle } from "./edges"
import { EdgeInspector, NodeInspector } from "./inspector"
import { nodeTypes, RememberContext, type DesignNode } from "./nodes"
import { DRAG_TYPE, Palette } from "./palette"
import { Discussion } from "./discussion"
import { defaultNotes, ESTIMATE_ID, FloatingNotes, NFR_ID } from "./notes"
import { promptByKey, referenceText, requirementText } from "./prompts"

const GRID: [number, number] = [16, 16]
const MAX_HISTORY = 100
// crypto.randomUUID is missing outside secure contexts (a LAN or Tailscale address), so use the shared helper.
const newId = () => uniqueId().slice(0, 8)

type Snap = { nodes: DesignNode[]; edges: Edge[] }

export function DesignCanvas({ workspaceId, boardId }: { workspaceId: string; boardId: string }) {
  const board = useBoard(workspaceId, boardId)
  if (board.isPending) return <Skeleton className="m-6 h-[80svh] rounded-xl" aria-label="Loading board" />
  if (board.isError) return <div className="mx-auto max-w-xl p-6"><FormAlert message={errorMessage(board.error) ?? "Couldn't load this board."} /></div>
  return (
    <ReactFlowProvider>
      <Editor workspaceId={workspaceId} board={board.data} />
    </ReactFlowProvider>
  )
}

/** Only what a board needs to be rebuilt; selection, measurements and drag state stay out of the saved document. */
function serialize(nodes: DesignNode[], edges: Edge[], viewport: BoardDoc["viewport"], checklist: Record<string, boolean>, notes: BoardNote[]): BoardDoc {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data, width: n.width ?? n.measured?.width, height: n.height ?? n.measured?.height, zIndex: n.zIndex })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, type: e.type, label: e.label, animated: e.animated, style: e.style, markerEnd: e.markerEnd, markerStart: e.markerStart })),
    viewport,
    checklist,
    notes,
  }
}

/** The first spot at or right of `from` (then on rows below) that doesn't sit on another item, so clicking the palette doesn't pile items up. */
function freeSpot(nodes: DesignNode[], from: { x: number; y: number }, item: PaletteItem) {
  const box = (n: DesignNode) => ({ x: n.position.x, y: n.position.y, w: n.width ?? n.measured?.width ?? 150, h: n.height ?? n.measured?.height ?? 80 })
  const taken = nodes.filter((n) => n.data.shape !== "group" && n.data.kind !== "group").map(box)
  const hit = (x: number, y: number) => taken.some((b) => x < b.x + b.w + 16 && x + item.w + 16 > b.x && y < b.y + b.h + 16 && y + item.h + 16 > b.y)
  for (let row = 0; row < 6; row++) {
    for (const col of [0, 1, -1, 2, -2, 3, -3, 4]) {
      const x = from.x + col * (item.w + 32)
      const y = from.y + row * (item.h + 32)
      if (!hit(x, y)) return { x, y }
    }
  }
  return from
}

function download(name: string, href: string) {
  const a = document.createElement("a")
  a.href = href
  a.download = name
  a.click()
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))

function Editor({ workspaceId, board }: { workspaceId: string; board: Board }) {
  const rf = useReactFlow<DesignNode, Edge>()
  const { resolvedTheme } = useTheme()
  const save = useSaveBoard(workspaceId, board.id)
  const evaluate = useEvaluate(workspaceId, board.id)
  const prompt = promptByKey(board.promptKey)
  const wrap = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState<DesignNode>((board.doc.nodes ?? []) as DesignNode[])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>((board.doc.edges ?? []) as Edge[])
  const [title, setTitle] = useState(board.title)
  const [checklist, setChecklist] = useState<Record<string, boolean>>(board.doc.checklist ?? {})
  // Boards made before notes existed get the two starter notes. Once the learner has closed them all, the list stays empty.
  const [notes, setNotes] = useState<BoardNote[]>(() => board.doc.notes ?? defaultNotes())
  const [snap, setSnap] = useState(true)
  const [explaining, setExplaining] = useState(false)
  const [explanation, setExplanation] = useState("")
  // Fit an older board without a saved view once, when it opens. Never again: that would zoom while the learner adds items.
  const [fitOnOpen] = useState(() => !board.doc.viewport && (board.doc.nodes?.length ?? 0) > 0)
  // The tab the learner picked; cleared whenever the selection changes so the inspector shows up on its own.
  const [picked, setPicked] = useState<"design" | "prompt" | "discuss" | null>(null)
  const [pickedFor, setPickedFor] = useState("")
  const [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error">("saved")

  // History: snapshots from before each change.
  const latest = useRef<Snap>({ nodes, edges })
  const past = useRef<Snap[]>([])
  const future = useRef<Snap[]>([])
  const lastKey = useRef({ key: "", at: 0 })
  const [depth, setDepth] = useState({ undo: 0, redo: 0 })
  useEffect(() => {
    latest.current = { nodes, edges }
  }, [nodes, edges])
  const sync = () => setDepth({ undo: past.current.length, redo: future.current.length })
  const remember = useCallback(() => {
    past.current.push(structuredClone(latest.current))
    if (past.current.length > MAX_HISTORY) past.current.shift()
    future.current = []
    sync()
  }, [])
  /** Typing in the inspector would otherwise make one undo step per keystroke. */
  const rememberFor = (key: string) => {
    const now = Date.now()
    if (lastKey.current.key !== key || now - lastKey.current.at > 1000) remember()
    lastKey.current = { key, at: now }
  }
  const restore = (s: Snap) => {
    setNodes(s.nodes)
    setEdges(s.edges)
  }
  const undo = () => {
    const s = past.current.pop()
    if (!s) return
    future.current.push(structuredClone(latest.current))
    restore(s)
    sync()
  }
  const redo = () => {
    const s = future.current.pop()
    if (!s) return
    past.current.push(structuredClone(latest.current))
    restore(s)
    sync()
  }

  // Autosave a moment after the last change.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setStatus("dirty")
    const t = setTimeout(() => {
      setStatus("saving")
      save.mutate(
        { title: title.trim() || "Untitled board", doc: serialize(nodes, edges, rf.getViewport(), checklist, notes) },
        { onSuccess: () => setStatus("saved"), onError: () => setStatus("error") },
      )
    }, 1500)
    return () => clearTimeout(t)
    // `save` and `rf` are stable enough; the timer restarts only when the board itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, title, checklist, notes])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (status !== "saved") e.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [status])

  const selectedNodes = nodes.filter((n) => n.selected)
  const selectedEdges = edges.filter((e) => e.selected)
  const selectionKey = [...selectedNodes, ...selectedEdges].map((x) => x.id).join(",")
  if (pickedFor !== selectionKey) {
    setPickedFor(selectionKey)
    setPicked(null)
  }
  const panel = picked ?? (selectionKey || !prompt ? "design" : "prompt")
  const ask = prompt ? { requirement: requirementText(prompt), reference: referenceText(prompt) } : { requirement: title, reference: "" }

  const addItem = useCallback(
    (item: PaletteItem, at?: { x: number; y: number }) => {
      remember()
      const box = wrap.current?.getBoundingClientRect()
      const centre = rf.screenToFlowPosition({ x: (box?.left ?? 0) + (box?.width ?? 600) / 2, y: (box?.top ?? 0) + (box?.height ?? 400) / 2 })
      const p = at ?? freeSpot(latest.current.nodes, { x: centre.x - item.w / 2, y: centre.y - item.h / 2 }, item)
      const group = item.shape === "group"
      const node: DesignNode = {
        id: newId(),
        type: "shape",
        position: { x: Math.round(p.x), y: Math.round(p.y) },
        width: item.w,
        height: item.h,
        zIndex: group ? -1 : undefined,
        data: { kind: item.kind, label: item.group === "Shapes" && !["note", "group"].includes(item.kind) ? "" : item.label },
        selected: true,
      }
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node])
    },
    [remember, rf, setNodes],
  )

  const onDrop = (e: React.DragEvent) => {
    const kind = e.dataTransfer.getData(DRAG_TYPE)
    const item = itemOf(kind)
    if (!item) return
    e.preventDefault()
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addItem(item, { x: p.x - item.w / 2, y: p.y - item.h / 2 })
  }

  const onConnect = useCallback(
    (c: Connection) => {
      remember()
      setEdges((es) => addEdge({ ...DEFAULT_EDGE, ...c, id: newId() }, es))
    },
    [remember, setEdges],
  )
  const onBeforeDelete: OnBeforeDelete<DesignNode, Edge> = useCallback(async () => {
    remember()
    return true
  }, [remember])

  // Copy, paste and duplicate.
  const clip = useRef<Snap | null>(null)
  const copy = () => {
    const ns = latest.current.nodes.filter((n) => n.selected)
    if (ns.length === 0) return false
    const ids = new Set(ns.map((n) => n.id))
    clip.current = structuredClone({ nodes: ns, edges: latest.current.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) })
    return true
  }
  const paste = () => {
    if (!clip.current) return
    remember()
    const ids = new Map(clip.current.nodes.map((n) => [n.id, newId()]))
    const ns = clip.current.nodes.map((n) => ({ ...n, id: ids.get(n.id)!, position: { x: n.position.x + 32, y: n.position.y + 32 }, selected: true }))
    const es = clip.current.edges.map((e) => ({ ...e, id: newId(), source: ids.get(e.source)!, target: ids.get(e.target)!, selected: false }))
    setNodes((cur) => [...cur.map((n) => ({ ...n, selected: false })), ...ns])
    setEdges((cur) => [...cur, ...es])
    clip.current = { nodes: structuredClone(ns).map((n) => ({ ...n, selected: false })), edges: es }
  }
  const duplicate = () => {
    if (copy()) paste()
  }
  const removeSelected = () => {
    if (selectedNodes.length + selectedEdges.length === 0) return
    remember()
    const ids = new Set(selectedNodes.map((n) => n.id))
    setNodes((ns) => ns.filter((n) => !ids.has(n.id)))
    setEdges((es) => es.filter((e) => !e.selected && !ids.has(e.source) && !ids.has(e.target)))
  }

  const keys = useRef({ undo, redo, copy, paste, duplicate })
  useEffect(() => {
    keys.current = { undo, redo, copy, paste, duplicate }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || !(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      const a = keys.current
      if (k === "c") {
        a.copy()
        return
      }
      const act = k === "z" ? (e.shiftKey ? a.redo : a.undo) : k === "y" ? a.redo : k === "v" ? a.paste : k === "d" ? a.duplicate : null
      if (!act) return
      e.preventDefault()
      act()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Inspector edits apply to every selected item.
  const patchNodes = (patch: Partial<NodeData>) => {
    rememberFor("node:" + Object.keys(patch).join())
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, data: { ...n.data, ...patch } } : n)))
  }
  const patchEdges = (patch: Partial<EdgeStyle>) => {
    rememberFor("edge:" + Object.keys(patch).join())
    setEdges((es) => es.map((e) => (e.selected ? applyEdge(e, patch) : e)))
  }

  const exportPng = async () => {
    const all = rf.getNodes()
    const viewport = wrap.current?.querySelector<HTMLElement>(".react-flow__viewport")
    if (all.length === 0 || !viewport) return toast.message("Add something to the board first.")
    try {
      const bounds = getNodesBounds(all)
      const w = Math.max(400, Math.round(bounds.width) + 160)
      const h = Math.max(300, Math.round(bounds.height) + 160)
      const vp = getViewportForBounds(bounds, w, h, 0.1, 2, 0.05)
      const url = await toPng(viewport, {
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        width: w,
        height: h,
        pixelRatio: 2,
        style: { width: `${w}px`, height: `${h}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
      })
      download(`${title || "board"}.png`, url)
    } catch {
      toast.error("Couldn't export the image.")
    }
  }
  const exportJson = () => {
    const body = JSON.stringify({ title, doc: serialize(nodes, edges, rf.getViewport(), checklist, notes) }, null, 2)
    download(`${title || "board"}.json`, URL.createObjectURL(new Blob([body], { type: "application/json" })))
  }
  const importJson = async (file: File | undefined) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as { doc?: BoardDoc } & BoardDoc
      const doc = parsed.doc ?? parsed
      if (!Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) throw new Error("not a board")
      remember()
      setNodes(doc.nodes as DesignNode[])
      setEdges(doc.edges as Edge[])
      if (Array.isArray(doc.notes)) setNotes(doc.notes)
      window.setTimeout(() => void rf.fitView({ padding: 0.2 }), 50)
    } catch {
      toast.error("That file isn't a board export.")
    }
    if (fileInput.current) fileInput.current.value = ""
  }

  /** Open the named starter note (adding it back if it was deleted), or add a blank one. */
  const showNote = (id?: string) => {
    const known = id ? defaultNotes().find((n) => n.id === id) : undefined
    setNotes((ns) => {
      if (known) return ns.some((n) => n.id === known.id) ? ns.map((n) => (n.id === known.id ? { ...n, open: true } : n)) : [...ns, known]
      const at = 24 + (ns.length % 6) * 28
      return [...ns, { id: newId(), title: "Note", text: "", x: at, y: at, w: 260, h: 160, open: true }]
    })
  }

  // The interviewer reads the saved board, so save the latest edits first.
  const runEvaluation = async () => {
    try {
      await save.mutateAsync({ title: title.trim() || "Untitled board", doc: serialize(nodes, edges, rf.getViewport(), checklist, notes) })
      setStatus("saved")
      await evaluate.mutateAsync({ ...ask, explanation: explanation.trim() })
      setExplaining(false)
      setExplanation("")
      setPicked("discuss")
    } catch (e) {
      toast.error(errorMessage(e) ?? "Couldn't evaluate the design.")
    }
  }

  const hasSelection = selectedNodes.length + selectedEdges.length > 0
  const firstEdge = selectedEdges[0]

  return (
    <RememberContext.Provider value={remember}>
      <div className="flex h-svh flex-col bg-background">
        <header className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
          <Button variant="ghost" size="sm" asChild className="shrink-0 text-muted-foreground">
            <Link href={`/workspaces/${workspaceId}/design`}>
              <ArrowLeft data-icon="inline-start" /> Boards
            </Link>
          </Button>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label="Board title" className="h-8 w-56 font-semibold" />
          <span className={cn("text-xs", status === "error" ? "text-destructive" : "text-muted-foreground")} role="status">
            {status === "saved" ? "Saved" : status === "error" ? "Couldn't save. Will retry on your next change." : "Saving…"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={undo} disabled={depth.undo === 0} aria-label="Undo" title="Undo (Ctrl/Cmd + Z)"><Undo2 /></Button>
            <Button variant="ghost" size="icon-sm" onClick={redo} disabled={depth.redo === 0} aria-label="Redo" title="Redo (Ctrl/Cmd + Shift + Z)"><Redo2 /></Button>
            <Button variant="ghost" size="icon-sm" onClick={duplicate} disabled={!hasSelection} aria-label="Duplicate" title="Duplicate (Ctrl/Cmd + D)"><Copy /></Button>
            <Button variant="ghost" size="icon-sm" onClick={removeSelected} disabled={!hasSelection} aria-label="Delete" title="Delete (Backspace)"><Trash2 /></Button>
            <Button variant={snap ? "secondary" : "ghost"} size="icon-sm" onClick={() => setSnap((v) => !v)} aria-pressed={snap} aria-label="Snap to grid" title="Snap to grid"><Grid3x3 /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => void rf.fitView({ padding: 0.2, duration: 200 })} aria-label="Fit to screen" title="Fit to screen"><Maximize /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm"><StickyNote data-icon="inline-start" /> Notes</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => showNote(NFR_ID)}>Non-functional requirements</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => showNote(ESTIMATE_ID)}>Back-of-envelope estimation</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => showNote()}>Blank note</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}><Upload data-icon="inline-start" /> Import</Button>
            <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => void importJson(e.target.files?.[0])} />
            <Button variant="ghost" size="sm" onClick={exportJson}><Download data-icon="inline-start" /> JSON</Button>
            <Button variant="outline" size="sm" onClick={() => void exportPng()}><Download data-icon="inline-start" /> PNG</Button>
            <Button size="sm" onClick={() => setExplaining(true)} disabled={evaluate.isPending}><Sparkles data-icon="inline-start" /> Evaluate</Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <Palette onAdd={(item) => addItem(item)} />
          <div ref={wrap} className="relative min-w-0 flex-1" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move" }} onDrop={onDrop}>
            <ReactFlow<DesignNode, Edge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDragStart={remember}
              onBeforeDelete={onBeforeDelete}
              defaultEdgeOptions={DEFAULT_EDGE}
              connectionMode={ConnectionMode.Loose}
              snapToGrid={snap}
              snapGrid={GRID}
              defaultViewport={board.doc.viewport}
              fitView={fitOnOpen}
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.1}
              maxZoom={2.5}
              colorMode={resolvedTheme === "dark" ? "dark" : "light"}
              selectionOnDrag
              panOnDrag={[1, 2]}
              panActivationKeyCode="Space"
              multiSelectionKeyCode={["Meta", "Control", "Shift"]}
              deleteKeyCode={["Backspace", "Delete"]}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={GRID[0]} size={1.2} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable className="!hidden md:!block" />
            </ReactFlow>
            <FloatingNotes notes={notes} onChange={setNotes} />
            {nodes.length === 0 && (
              <p className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground">
                Drag a component from the left, or click one to add it. Drag from the dots on an item to draw arrows.
              </p>
            )}
          </div>

          <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l bg-card lg:flex" aria-label="Properties">
            <div className="flex gap-0.5 border-b px-3 pt-2" role="tablist">
              {([...(prompt ? (["prompt"] as const) : []), "design", "discuss"] as const).map((t) => (
                <button key={t} role="tab" aria-selected={panel === t} onClick={() => setPicked(t)} className={cn("border-b-2 px-2.5 py-1.5 text-sm font-medium", panel === t ? "border-primary" : "border-transparent text-muted-foreground")}>
                  {t === "prompt" ? "Requirement" : t === "design" ? "Selection" : "Discussion"}
                </button>
              ))}
            </div>
            <div className={cn("p-4", panel === "discuss" && "flex min-h-0 flex-1 flex-col")}>
              {panel === "discuss" ? (
                <Discussion workspaceId={workspaceId} boardId={board.id} ask={ask} evaluating={evaluate.isPending} />
              ) : prompt && panel === "prompt" ? (
                <PromptPanel prompt={prompt} checklist={checklist} onToggle={(item) => setChecklist((c) => ({ ...c, [item]: !c[item] }))} />
              ) : selectedNodes.length > 0 ? (
                <NodeInspector data={selectedNodes[0]!.data} count={selectedNodes.length} onChange={patchNodes} />
              ) : firstEdge ? (
                <EdgeInspector info={edgeInfo(firstEdge)} count={selectedEdges.length} onChange={patchEdges} />
              ) : (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2 font-semibold text-foreground"><ClipboardList className="size-4" /> Tips</p>
                  <ul className="list-disc space-y-1.5 pl-5">
                    <li>Click an item or arrow to style it.</li>
                    <li>Double-click an item to type in it.</li>
                    <li>Drag on empty space to select several. Hold Space and drag to move the canvas.</li>
                    <li>Use Group to box related parts, like a region or a VPC.</li>
                    <li>Ctrl/Cmd + Z undoes, Ctrl/Cmd + D duplicates.</li>
                  </ul>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
      <Dialog open={explaining} onOpenChange={(o) => !evaluate.isPending && setExplaining(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Evaluate my design</DialogTitle>
            <DialogDescription>
              The interviewer reads your diagram and notes and checks them against the question, then asks follow-up questions. You can also describe the whole design in your own words.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            maxLength={4000}
            rows={8}
            placeholder="Optional: walk through the design. How does a request flow, where is data stored, what happens when a component fails?"
            aria-label="Describe your design"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setExplaining(false)} disabled={evaluate.isPending}>Cancel</Button>
            <Button onClick={() => void runEvaluation()} disabled={evaluate.isPending}>{evaluate.isPending ? "Evaluating…" : "Evaluate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RememberContext.Provider>
  )
}

function PromptPanel({ prompt, checklist, onToggle }: { prompt: NonNullable<ReturnType<typeof promptByKey>>; checklist: Record<string, boolean>; onToggle: (item: string) => void }) {
  const done = prompt.checklist.filter((c) => checklist[c]).length
  const list = (title: string, items: string[]) => (
    <div>
      <p className="mb-1 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{title}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">{items.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  )
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold">{prompt.title}</h2>
        <p className="text-sm text-muted-foreground">{prompt.summary}</p>
      </div>
      {list("Functional requirements", prompt.functional)}
      <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
        Non-functional requirements and the estimates are yours to write. Use the Notes on the canvas: state the targets, then work out the numbers.
      </p>
      <div>
        <p className="mb-1 flex items-center justify-between text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
          Cover these <span>{done}/{prompt.checklist.length}</span>
        </p>
        <ul className="space-y-1.5">
          {prompt.checklist.map((c) => (
            <li key={c}>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={!!checklist[c]} onChange={() => onToggle(c)} />
                <span className={cn(checklist[c] && "text-muted-foreground line-through")}>{c}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
