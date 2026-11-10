"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GROUPS, PALETTE, type PaletteItem, type ShapeKind } from "./catalog";

export const DRAG_TYPE = "application/pypr-design";

function Glyph({ shape }: { shape: ShapeKind }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.5 };
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      {shape === "rectangle" && (
        <rect x="3" y="5" width="18" height="14" {...common} />
      )}
      {shape === "rounded" && (
        <rect x="3" y="5" width="18" height="14" rx="4" {...common} />
      )}
      {shape === "ellipse" && (
        <ellipse cx="12" cy="12" rx="9" ry="7" {...common} />
      )}
      {shape === "diamond" && (
        <polygon points="12,3 21,12 12,21 3,12" {...common} />
      )}
      {shape === "hexagon" && (
        <polygon points="7,4 17,4 22,12 17,20 7,20 2,12" {...common} />
      )}
      {shape === "cylinder" && (
        <path
          d="M4 7c0-2 16-2 16 0v10c0 2-16 2-16 0zM4 7c0 2 16 2 16 0"
          {...common}
        />
      )}
      {shape === "cloud" && (
        <path
          d="M7 18a4 4 0 010-8 5 5 0 019.5-1A4.5 4.5 0 0117 18z"
          {...common}
        />
      )}
      {shape === "note" && (
        <path d="M4 4h16v11l-5 5H4z M15 20v-5h5" {...common} />
      )}
      {shape === "group" && (
        <rect
          x="3"
          y="4"
          width="18"
          height="16"
          rx="3"
          strokeDasharray="3 2"
          {...common}
        />
      )}
    </svg>
  );
}

/** Click to drop an item in the middle of the canvas, or drag it to where it should go. */
export function Palette({ onAdd }: { onAdd: (item: PaletteItem) => void }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  return (
    <TooltipProvider delayDuration={350}>
      <aside
        className="flex w-52 shrink-0 flex-col overflow-y-auto border-r bg-card"
        aria-label="Shapes and components"
      >
        {GROUPS.map((g) => (
          <section key={g} className="border-b">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase hover:text-foreground"
              onClick={() => setClosed((c) => ({ ...c, [g]: !c[g] }))}
              aria-expanded={!closed[g]}
            >
              {g}
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  closed[g] && "-rotate-90",
                )}
              />
            </button>
            {!closed[g] && (
              <ul className="grid grid-cols-2 gap-1.5 px-2 pb-2.5">
                {PALETTE.filter((p) => p.group === g).map((p) => (
                  <li key={p.kind}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(DRAG_TYPE, p.kind);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={() => onAdd(p)}
                          aria-label={`Add ${p.label}`}
                          className="flex h-16 w-full cursor-grab flex-col items-center justify-center gap-1 rounded-lg border bg-background px-1 text-center text-[11px] leading-tight transition-colors hover:border-primary/60 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
                        >
                          {p.icon ? (
                            <p.icon
                              className="size-5"
                              style={{ color: p.accent }}
                            />
                          ) : (
                            <Glyph shape={p.shape} />
                          )}
                          <span className="line-clamp-2">{p.label}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="right"
                        sideOffset={10}
                        className="max-w-64 flex-col items-start gap-1 py-2 text-left"
                      >
                        <p className="text-sm font-semibold">{p.label}</p>
                        {p.info && (
                          <>
                            <p>{p.info.what}</p>
                            <p className="opacity-75">
                              <span className="font-semibold">Use it for:</span>{" "}
                              {p.info.use}
                            </p>
                          </>
                        )}
                        <p className="text-[10px] opacity-60">
                          Click to add, or drag onto the canvas
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </aside>
    </TooltipProvider>
  );
}
