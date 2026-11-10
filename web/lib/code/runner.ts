// Runs learner code in the browser, inside sandboxed iframes (opaque origin: no cookies, no app access).
// JavaScript runs in a Web Worker started by /code/runtime.js; HTML runs in a nested sandboxed document.
// Every other language runs on the server (Judge0): see lib/api/code.ts.

export type Language = "javascript" | "html"
export type Files = Record<string, string>
export type CodeTest = { name: string; code: string; hidden?: boolean }
export type TestResult = { name: string; ok: boolean; error?: string }
export type LogLine = { level: "log" | "warn" | "error"; text: string }
export type RunResult = { logs: LogLine[]; tests: TestResult[]; error?: string }

const JS_LIMIT_MS = 5000
const HTML_LIMIT_MS = 5000

export async function runCode(language: Language, files: Files, tests: CodeTest[]): Promise<RunResult> {
  return language === "html" ? runHtml(files, tests) : runScript(files, tests)
}

/** The page the HTML preview shows (and, with tests, the page the tests run in). */
export function buildHtmlDoc(files: Files, tests?: CodeTest[]): string {
  const script = (code: string) => code.replace(/<\/(script)/gi, "<\\/$1")
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${files["style.css"] ?? ""}</style></head><body>${files["index.html"] ?? ""}<script>${script(files["script.js"] ?? "")}</script>${tests ? `<script>${script(htmlHarness(tests))}</script>` : ""}</body></html>`
}

function htmlHarness(tests: CodeTest[]): string {
  return `(() => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const tests = ${JSON.stringify(tests.map((t) => ({ name: t.name, code: t.code })))}
  const assert = (c, m) => { if (!c) throw new Error(m || "Assertion failed") }
  assert.ok = assert
  assert.equal = (a, b, m) => { if (a != b) throw new Error(m || "Expected " + JSON.stringify(b) + " but got " + JSON.stringify(a)) }
  assert.strictEqual = (a, b, m) => { if (!Object.is(a, b)) throw new Error(m || "Expected " + JSON.stringify(b) + " but got " + JSON.stringify(a)) }
  const $ = (s) => document.querySelector(s)
  const $$ = (s) => [...document.querySelectorAll(s)]
  const css = (el, prop) => getComputedStyle(typeof el === "string" ? document.querySelector(el) : el)[prop]
  const run = async () => {
    const out = []
    for (const t of tests) {
      try {
        await Promise.race([new AsyncFunction("assert", "$", "$$", "css", t.code)(assert, $, $$, css), new Promise((_, r) => setTimeout(() => r(new Error("Timed out")), 2000))])
        out.push({ name: t.name, ok: true })
      } catch (e) { out.push({ name: t.name, ok: false, error: String((e && e.message) || e) }) }
    }
    parent.postMessage({ pyprHtml: true, tests: out }, "*")
  }
  if (document.readyState === "complete") setTimeout(run, 50); else addEventListener("load", () => setTimeout(run, 50))
})()`
}

function mount(frame: HTMLIFrameElement): () => void {
  frame.setAttribute("sandbox", "allow-scripts") // never add allow-same-origin: it would give the code our cookies and API
  frame.setAttribute("aria-hidden", "true")
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden"
  document.body.appendChild(frame)
  return () => frame.remove()
}

let nextId = 1

async function runScript(files: Files, tests: CodeTest[]): Promise<RunResult> {
  const failAll = (error: string): RunResult => ({ logs: [], error, tests: tests.map((t) => ({ name: t.name, ok: false, error })) })
  const program = Object.values(files).join("\n")

  const frame = document.createElement("iframe")
  const unmount = mount(frame)
  const id = nextId++
  return new Promise<RunResult>((resolve) => {
    let done = false
    const finish = (r: RunResult) => {
      if (done) return
      done = true
      clearTimeout(timer)
      window.removeEventListener("message", onMessage)
      unmount()
      resolve(r)
    }
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow || !e.data || e.data.id !== id) return
      finish({ logs: e.data.logs ?? [], tests: e.data.tests ?? [], error: e.data.error })
    }
    // The runtime enforces its own limit; this one covers a sandbox that never loads.
    const timer = setTimeout(() => finish(failAll("The runner didn't respond.")), JS_LIMIT_MS + 3000)
    window.addEventListener("message", onMessage)
    frame.addEventListener("load", () => {
      frame.contentWindow?.postMessage({ id, program, tests: tests.map((t) => ({ name: t.name, code: t.code })), limitMs: JS_LIMIT_MS }, "*")
    })
    frame.src = "/code/sandbox.html"
  })
}

function runHtml(files: Files, tests: CodeTest[]): Promise<RunResult> {
  const frame = document.createElement("iframe")
  const unmount = mount(frame)
  return new Promise<RunResult>((resolve) => {
    let done = false
    const finish = (r: RunResult) => {
      if (done) return
      done = true
      clearTimeout(timer)
      window.removeEventListener("message", onMessage)
      unmount()
      resolve(r)
    }
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow || !e.data?.pyprHtml) return
      finish({ logs: [], tests: e.data.tests })
    }
    const timer = setTimeout(() => finish({ logs: [], error: "Timed out", tests: tests.map((t) => ({ name: t.name, ok: false, error: "Timed out" })) }), HTML_LIMIT_MS)
    window.addEventListener("message", onMessage)
    frame.srcdoc = buildHtmlDoc(files, tests)
  })
}
