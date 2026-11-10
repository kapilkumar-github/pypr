// Runs learner JavaScript. Loaded by sandbox.html, which the app embeds in <iframe sandbox="allow-scripts">
// (no allow-same-origin): this page has an opaque origin with no cookies and no access to the app.
// Each run starts a Worker, so a hung program is killed by terminating the worker.
//
// Request  (parent -> here): { id, program, tests: [{ name, code }], limitMs? }
// Response (here -> parent): { id, logs: [{ level, text }], tests: [{ name, ok, error? }], error? }

function workerMain() {
  const MAX_LOGS = 500
  const MAX_LINE = 2000
  const PER_TEST_MS = 2000

  const show = (v) => {
    if (typeof v === "string") return v
    if (typeof v === "function") return "[Function" + (v.name ? ": " + v.name : "") + "]"
    if (typeof v === "bigint") return v + "n"
    if (v instanceof Error) return v.stack || String(v)
    try {
      const seen = new WeakSet()
      return JSON.stringify(
        v,
        (k, x) => {
          if (typeof x === "bigint") return x + "n"
          if (x instanceof Map) return { Map: [...x] }
          if (x instanceof Set) return { Set: [...x] }
          if (typeof x === "object" && x !== null) {
            if (seen.has(x)) return "[Circular]"
            seen.add(x)
          }
          return x
        },
        undefined,
      ) ?? String(v)
    } catch {
      return String(v)
    }
  }
  const format = (...args) => {
    if (typeof args[0] === "string" && /%[sdifjoO%]/.test(args[0])) {
      let i = 1
      const out = args[0].replace(/%([sdifjoO%])/g, (m, c) => {
        if (c === "%") return "%"
        if (i >= args.length) return m
        const a = args[i++]
        return c === "d" || c === "i" ? String(parseInt(a, 10)) : c === "f" ? String(parseFloat(a)) : c === "s" ? (typeof a === "string" ? a : show(a)) : show(a)
      })
      return [out, ...args.slice(i).map(show)].join(" ")
    }
    return args.map(show).join(" ")
  }

  // console
  let logCount = 0
  const emit = (level, args) => {
    if (logCount++ >= MAX_LOGS) return
    let text = format(...args)
    if (text.length > MAX_LINE) text = text.slice(0, MAX_LINE) + "…"
    postMessage({ type: "log", level, text })
  }
  self.console = {
    log: (...a) => emit("log", a),
    info: (...a) => emit("log", a),
    debug: (...a) => emit("log", a),
    warn: (...a) => emit("warn", a),
    error: (...a) => emit("error", a),
    table: (...a) => emit("log", a),
    assert: (c, ...a) => { if (!c) emit("error", ["Assertion failed:", ...a]) },
    time() {}, timeEnd() {}, group() {}, groupEnd() {}, dir: (...a) => emit("log", a),
  }

  // Locked down: no network, no nested workers, no storage.
  for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "Worker", "SharedWorker", "indexedDB", "caches", "BroadcastChannel"]) {
    try { Object.defineProperty(self, name, { value: undefined, configurable: true }) } catch { /* ignore */ }
  }

  // ---- assert (a small Node-style version; the tests use it)
  const deepEqual = (a, b, strict) => {
    if (strict ? Object.is(a, b) : a == b || (a !== a && b !== b)) return true
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
    if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
    if (a instanceof RegExp && b instanceof RegExp) return String(a) === String(b)
    if (a instanceof Map && b instanceof Map) {
      if (a.size !== b.size) return false
      for (const [k, v] of a) if (!b.has(k) || !deepEqual(v, b.get(k), strict)) return false
      return true
    }
    if (a instanceof Set && b instanceof Set) {
      if (a.size !== b.size) return false
      for (const v of a) if (!b.has(v)) return false
      return true
    }
    if (Array.isArray(a) !== Array.isArray(b)) return false
    const ka = Object.keys(a), kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k], strict))
  }

  class AssertionError extends Error {
    constructor(message, actual, expected) {
      super(message)
      this.name = "AssertionError"
      this.code = "ERR_ASSERTION"
      this.actual = actual
      this.expected = expected
    }
  }
  const fail = (message, def, actual, expected) => {
    if (message instanceof Error) throw message
    throw new AssertionError(message ?? def, actual, expected)
  }
  const matches = (err, expected) => {
    if (expected === undefined) return true
    if (typeof expected === "function") return expected.prototype !== undefined && err instanceof expected ? true : expected.prototype === undefined ? expected(err) === true : false
    if (expected instanceof RegExp) return expected.test(String(err && err.message !== undefined ? err.message : err))
    if (typeof expected === "object") return Object.keys(expected).every((k) => (expected[k] instanceof RegExp ? expected[k].test(String(err[k])) : deepEqual(err[k], expected[k], true)))
    return true
  }
  const assert = (v, m) => { if (!v) fail(m, "The expression evaluated to a falsy value: " + show(v), v, true) }
  Object.assign(assert, {
    ok: assert,
    equal: (a, b, m) => { if (!(a == b || (a !== a && b !== b))) fail(m, show(a) + " == " + show(b), a, b) },
    notEqual: (a, b, m) => { if (a == b) fail(m, show(a) + " != " + show(b), a, b) },
    strictEqual: (a, b, m) => { if (!Object.is(a, b)) fail(m, "Expected " + show(b) + " but got " + show(a), a, b) },
    notStrictEqual: (a, b, m) => { if (Object.is(a, b)) fail(m, "Expected values to differ, both are " + show(a), a, b) },
    deepEqual: (a, b, m) => { if (!deepEqual(a, b, false)) fail(m, "Expected " + show(b) + " but got " + show(a), a, b) },
    deepStrictEqual: (a, b, m) => { if (!deepEqual(a, b, true)) fail(m, "Expected " + show(b) + " but got " + show(a), a, b) },
    notDeepStrictEqual: (a, b, m) => { if (deepEqual(a, b, true)) fail(m, "Expected values to differ, both are " + show(a), a, b) },
    throws(fn, expected, m) {
      try { fn() } catch (e) {
        if (!matches(e, expected)) throw e
        return
      }
      fail(typeof expected === "string" ? expected : m, "Missing expected exception.")
    },
    doesNotThrow(fn, m) { try { fn() } catch (e) { fail(m, "Got unwanted exception: " + (e && e.message)) } },
    async rejects(p, expected, m) {
      try { await (typeof p === "function" ? p() : p) } catch (e) {
        if (!matches(e, expected)) throw e
        return
      }
      fail(typeof expected === "string" ? expected : m, "Missing expected rejection.")
    },
    async doesNotReject(p, m) { try { await (typeof p === "function" ? p() : p) } catch (e) { fail(m, "Got unwanted rejection: " + (e && e.message)) } },
    match: (s, re, m) => { if (!re.test(s)) fail(m, show(s) + " does not match " + re, s, re) },
    fail: (m) => fail(m, "Failed"),
    AssertionError,
  })
  assert.strict = assert

  self.assert = assert

  const describe = (e) => (e && e.message !== undefined ? String(e.message) : String(e))
  const runOne = (fn) =>
    Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, rej) => setTimeout(() => rej(new Error("Timed out after " + PER_TEST_MS / 1000 + "s (a promise never settled or the code is too slow)")), PER_TEST_MS)),
    ])

  self.onmessage = async (ev) => {
    const { program, tests } = ev.data
    try {
      try { new Function(program) } catch (e) { postMessage({ type: "fatal", error: "Syntax error: " + describe(e) }); return }
      const list = tests.map((t) => "[" + JSON.stringify(t.name) + ", async () => {\n" + t.code + "\n}]").join(",\n")
      const src = program + "\n;__register([\n" + list + "\n]);"
      let registered
      self.__register = (r) => { registered = r }
      try { (0, eval)(src) } catch (e) { postMessage({ type: "fatal", error: (e && e.name ? e.name + ": " : "") + describe(e) }); return }
      if (!registered) { postMessage({ type: "fatal", error: "The program stopped before the tests could run." }); return }
      for (let i = 0; i < registered.length; i++) {
        try { await runOne(registered[i][1]); postMessage({ type: "test", index: i, ok: true }) } catch (e) { postMessage({ type: "test", index: i, ok: false, error: describe(e) }) }
      }
    } catch (e) {
      postMessage({ type: "fatal", error: describe(e) })
    }
    postMessage({ type: "done" })
  }
}

// ---- controller (runs in the sandboxed page)
const workerSource = "(" + workerMain.toString() + ")()"

window.addEventListener("message", (event) => {
  const req = event.data
  if (!req || typeof req.id !== "number" || typeof req.program !== "string" || !Array.isArray(req.tests)) return
  const reply = (body) => event.source && event.source.postMessage({ id: req.id, ...body }, "*")
  const logs = []
  const results = req.tests.map((t) => ({ name: t.name, ok: false, error: "Did not run" }))
  let finished = false
  let worker
  const finish = (error) => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    try { worker.terminate() } catch { /* ignore */ }
    reply({ logs, tests: results, error })
  }
  const timer = setTimeout(
    () => {
      for (const r of results) if (r.error === "Did not run") r.error = "Timed out: the code took too long (is there an infinite loop?)"
      finish("Timed out after " + (req.limitMs || 5000) / 1000 + "s")
    },
    req.limitMs || 5000,
  )
  try {
    worker = new Worker(URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" })))
  } catch (e) {
    return finish("Couldn't start the runner: " + (e && e.message))
  }
  worker.onmessage = (m) => {
    const d = m.data
    if (d.type === "log") logs.push({ level: d.level, text: d.text })
    else if (d.type === "test") results[d.index] = { name: results[d.index].name, ok: d.ok, error: d.error }
    else if (d.type === "fatal") {
      for (const r of results) r.error = d.error
      finish(d.error)
    } else if (d.type === "done") finish()
  }
  worker.onerror = (e) => finish("Runner error: " + e.message)
  worker.postMessage({ program: req.program, tests: req.tests })
})
