import type { Arrangement } from "./schema"

export const MAX_FIELD_TEXT = 100_000

export function collapse(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f​-‍﻿]/g, "").replace(/\s+/g, " ").trim()
}

const SKIP = new Set(["script", "style", "noscript", "template", "iframe", "object", "embed", "svg", "canvas", "link", "meta", "head", "button", "input", "select", "textarea", "form"])
const PARA = new Set(["p", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "table"])
const BLOCK = new Set(["p", "div", "section", "article", "header", "footer", "main", "aside", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "table", "tr", "br", "hr", "dl", "dt", "dd"])

function hidden(el: Element): boolean {
  if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return true
  const style = (el as HTMLElement).style
  return !!style && (style.display === "none" || style.visibility === "hidden")
}

/**
 * Reads an element as plain text with its structure kept: paragraphs, line breaks and list bullets.
 * Page markup is never inserted anywhere. Scripts, styles, forms and hidden parts are skipped, and the result is
 * capped, so a hostile or huge page can't flood the form.
 */
export function structuredText(root: Element, max = MAX_FIELD_TEXT): string {
  let out = ""
  // Paragraph-like blocks are set apart by a blank line; list items and plain containers by a line break.
  const nl = (blank: boolean) => {
    if (!out) return
    const want = blank ? "\n\n" : "\n"
    if (!out.endsWith(want)) out += out.endsWith("\n") ? "\n" : want
  }
  const walk = (node: Node, depth: number) => {
    if (out.length > max) return
    if (node.nodeType === 3) {
      const t = (node.nodeValue ?? "").replace(/\s+/g, " ")
      out += out.endsWith("\n") || out === "" ? t.trimStart() : t
      return
    }
    if (node.nodeType !== 1 || depth > 60) return
    const el = node as Element
    const tag = el.localName
    if (SKIP.has(tag) || hidden(el)) return
    if (tag === "br") {
      out += "\n"
      return
    }
    const block = BLOCK.has(tag)
    const blank = PARA.has(tag)
    if (block) nl(blank)
    if (tag === "li") out += (el.parentElement?.localName === "ol" ? `${[...el.parentElement.children].indexOf(el) + 1}. ` : "• ")
    for (const c of el.childNodes) walk(c, depth + 1)
    if (block) nl(blank)
  }
  walk(root, 0)
  return out.replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max)
}

/** HTML string (from structured data) to plain text, without ever attaching it to a live document. */
export function htmlToText(html: string): string {
  if (!/[<&]/.test(html)) return html.trim().slice(0, MAX_FIELD_TEXT)
  const doc = new DOMParser().parseFromString(html.slice(0, MAX_FIELD_TEXT * 3), "text/html")
  return structuredText(doc.body)
}

export function parseArrangement(text: string): Arrangement {
  const t = text.toLowerCase()
  const hits = new Set<Arrangement>()
  if (/\b(remote|work from home|wfh|telecommut\w*|distributed|anywhere)\b/.test(t)) hits.add("remote")
  if (/\bhybrid\b/.test(t)) hits.add("hybrid")
  if (/\b(on[- ]?site|in[- ]?person|office[- ]based)\b/.test(t)) hits.add("onsite")
  return hits.size === 1 ? [...hits][0]! : "unknown"
}

const EMPLOYMENT: [RegExp, string][] = [
  [/\bfull[- ]?time\b/i, "Full-time"],
  [/\bpart[- ]?time\b/i, "Part-time"],
  [/\bcontract(or)?\b/i, "Contract"],
  [/\btemporary\b|\btemp\b/i, "Temporary"],
  [/\bintern(ship)?\b/i, "Internship"],
  [/\bfreelance\b/i, "Freelance"],
  [/\bpermanent\b/i, "Permanent"],
]

/** Normalizes explicit employment-type wording ("FULL_TIME", "Full time"). Unknown wording is kept as written. */
export function normalizeEmployment(text: string): string {
  const t = text.replace(/_/g, " ")
  const found = EMPLOYMENT.filter(([re]) => re.test(t)).map(([, label]) => label)
  return found.length === 1 ? found[0]! : collapse(text).slice(0, 100)
}

export interface Salary {
  min?: number
  max?: number
  currency: string
  period: "" | "year" | "month" | "week" | "day" | "hour"
}

const SYMBOL_CURRENCY: Record<string, string> = { "€": "EUR", "£": "GBP", "₹": "INR", "¥": "JPY", "₩": "KRW", "₽": "RUB", "₺": "TRY", "₫": "VND", "zł": "PLN" }
const CODES = new Set(["USD", "EUR", "GBP", "CAD", "AUD", "NZD", "CHF", "INR", "SGD", "JPY", "SEK", "NOK", "DKK", "PLN", "BRL", "MXN", "ZAR", "AED", "HKD", "ILS", "CZK", "KRW"])

/**
 * Reads explicit salary numbers from text such as "USD 80,000 - 100,000 per year" or "£45k–£55k". The currency is
 * only set when the text names it (a code or an unambiguous symbol, never a bare "$"). Returns null when no number
 * is clearly a pay figure.
 */
export function parseSalary(text: string): Salary | null {
  const t = text.replace(/–|—|−/g, "-")
  let currency = ""
  const code = /\b([A-Z]{3})\b/.exec(t)
  if (code && CODES.has(code[1]!)) currency = code[1]!
  else for (const [sym, c] of Object.entries(SYMBOL_CURRENCY)) if (t.includes(sym)) currency = c
  const nums = [...t.matchAll(/(\d{1,3}(?:[,\s]\d{3})+|\d+(?:\.\d+)?)\s*(k)?\b/gi)].map((m) => {
    const n = parseFloat(m[1]!.replace(/[,\s]/g, ""))
    return m[2] ? n * 1000 : n
  }).filter((n) => n > 0 && n < 1e10)
  if (nums.length === 0) return null
  const period = /\/\s*(yr|year)|per\s+year|annual|\ba\s*year\b|\bp\.?a\.?\b/i.test(t) ? "year"
    : /\/\s*(mo|month)|per\s+month|monthly/i.test(t) ? "month"
    : /\/\s*(wk|week)|per\s+week|weekly/i.test(t) ? "week"
    : /\/\s*day|per\s+day|daily/i.test(t) ? "day"
    : /\/\s*(hr|hour)|per\s+hour|hourly|\ban\s+hour\b/i.test(t) ? "hour" : ""
  // Without a currency or a period the digits could be anything ("5 years of experience").
  if (!currency && !period && !/[$£€₹¥]/.test(t)) return null
  const range = nums.slice(0, 2)
  const [a, b] = range
  return { min: Math.min(a!, b ?? a!), max: Math.max(a!, b ?? a!), currency, period }
}
