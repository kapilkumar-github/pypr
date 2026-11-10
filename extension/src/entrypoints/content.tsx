import { createRoot, type Root } from "react-dom/client"
import { App } from "@/ui/App"
import { bus } from "@/ui/bus"
import { startCapture } from "@/content/capture"
import { TabMessageSchema } from "@/lib/messages"
// Inlined into the shadow root, so no stylesheet has to be exposed to the page.
import css from "@/ui/style.css?inline"

declare global {
  interface Window {
    __pyprLoaded?: boolean
  }
}

// Injected by the toolbar click or the right-click menu (activeTab), or automatically on sites the user enabled.
// `registration: "runtime"` keeps this out of the manifest, so it declares no host access of its own.
export default defineContentScript({
  matches: ["https://*/*"],
  registration: "runtime",
  async main(ctx) {
    // One launcher and panel per document, however many times this is injected or the page navigates.
    if (window.__pyprLoaded) return
    window.__pyprLoaded = true

    const stopCapture = startCapture()
    const onMessage = (raw: unknown, sender: chrome.runtime.MessageSender, reply: (r: unknown) => void) => {
      if (sender.id !== chrome.runtime.id || sender.tab) return false
      const m = TabMessageSchema.safeParse(raw)
      if (!m.success) return false
      if (m.data.type === "ping") reply({ ok: true })
      else {
        bus.emit(m.data)
        reply({ ok: true })
      }
      return false
    }
    chrome.runtime.onMessage.addListener(onMessage)

    const ui = await createShadowRootUi<Root>(ctx, {
      name: "pypr-extension-root",
      position: "overlay",
      anchor: "body",
      css,
      isolateEvents: ["keydown", "keyup", "keypress"],
      onMount(container) {
        const root = createRoot(container)
        root.render(<App />)
        return root
      },
      onRemove(root) {
        root?.unmount()
      },
    })
    ui.mount()

    ctx.onInvalidated(() => {
      chrome.runtime.onMessage.removeListener(onMessage)
      stopCapture()
      ui.remove()
      window.__pyprLoaded = false
    })
  },
})
