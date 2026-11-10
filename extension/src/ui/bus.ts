import type { TabMessage } from "@/lib/messages"

/** Messages from the background arrive before React mounts (the toolbar click injects, then sends). Keep them until the app listens. */
type Handler = (m: TabMessage) => void
let handler: Handler | null = null
const queue: TabMessage[] = []

export const bus = {
  emit(m: TabMessage) {
    if (handler) handler(m)
    else queue.push(m)
  },
  subscribe(h: Handler): () => void {
    handler = h
    for (const m of queue.splice(0)) h(m)
    return () => { if (handler === h) handler = null }
  },
}
