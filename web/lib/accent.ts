"use client"

import { useSyncExternalStore } from "react"

import { ACCENT_STORAGE_KEY as KEY } from "./accent-script"

// App accent color. Values must match the html[data-accent] blocks in app/globals.css.
export const ACCENTS = [
  { id: "indigo", name: "Indigo", swatch: "oklch(0.511 0.262 277)" },
  { id: "blue", name: "Blue", swatch: "oklch(0.546 0.245 263)" },
  { id: "violet", name: "Violet", swatch: "oklch(0.541 0.281 293)" },
  { id: "emerald", name: "Emerald", swatch: "oklch(0.596 0.145 163)" },
  { id: "teal", name: "Teal", swatch: "oklch(0.6 0.118 185)" },
  { id: "rose", name: "Rose", swatch: "oklch(0.586 0.253 17)" },
  { id: "amber", name: "Amber", swatch: "oklch(0.666 0.179 58)" },
] as const
export type AccentId = (typeof ACCENTS)[number]["id"]

const DEFAULT: AccentId = "indigo"

const listeners = new Set<() => void>()

function read(): AccentId {
  const v = document.documentElement.dataset.accent
  return ACCENTS.some((a) => a.id === v) ? (v as AccentId) : DEFAULT
}

export function setAccent(id: AccentId) {
  if (id === DEFAULT) delete document.documentElement.dataset.accent
  else document.documentElement.dataset.accent = id
  try {
    if (id === DEFAULT) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, id)
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  listeners.forEach((l) => l())
}

export function useAccent(): AccentId {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    read,
    () => DEFAULT,
  )
}
