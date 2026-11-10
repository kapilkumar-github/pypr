/**
 * Runs `check` now and again whenever the page changes, until it returns a value or the time is up. The observer
 * and timer are always removed, on success, timeout or abort, so nothing keeps watching the page afterwards.
 */
export function waitFor<T>(check: () => T | null | undefined | false, ms: number, signal?: AbortSignal): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false
    let obs: MutationObserver | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let poll: ReturnType<typeof setInterval> | undefined
    const finish = (v: T | null) => {
      if (done) return
      done = true
      obs?.disconnect()
      clearTimeout(timer)
      clearInterval(poll)
      signal?.removeEventListener("abort", onAbort)
      resolve(v)
    }
    const run = () => {
      const v = check()
      if (v) finish(v)
    }
    const onAbort = () => finish(null)
    signal?.addEventListener("abort", onAbort)
    if (signal?.aborted) return finish(null)
    const v = check()
    if (v) return finish(v)
    obs = new MutationObserver(run)
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
    poll = setInterval(run, 400)
    timer = setTimeout(() => finish(null), ms)
  })
}
