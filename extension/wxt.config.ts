import { defineConfig } from "wxt"
import tailwindcss from "@tailwindcss/vite"
import { readFileSync } from "node:fs"

const { key } = JSON.parse(readFileSync(new URL("./key.json", import.meta.url), "utf8")) as { key: string }

// Build-time endpoints. `wxt` (dev) talks to a local API; `wxt build` talks to production. Override with VITE_PYPR_API.
const api_ = (mode: string) => process.env.VITE_PYPR_API ?? (mode === "development" ? "http://localhost:8090" : "https://api.pypr.work")

export default defineConfig({
  srcDir: "src",
  outDir: process.env.WXT_OUT_DIR ?? ".output",
  modules: ["@wxt-dev/module-react"],
  vite: () => ({ plugins: [tailwindcss()], resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } } }),
  hooks: {
    // WXT copies a runtime content script's `matches` into host_permissions. This extension must hold no site access
    // at install (only the API origin); sites are granted one at a time through optional_host_permissions.
    "build:manifestGenerated": (wxt, manifest) => {
      const only = new URL(api_(wxt.config.mode)).origin + "/*"
      // PYPR_TEST_HOSTS builds a throwaway variant for browser tests, where a toolbar click can't be simulated.
      const test = process.env.PYPR_TEST_HOSTS ? ["http://localhost/*", "http://127.0.0.1/*"] : []
      manifest.host_permissions = (manifest.host_permissions ?? []).filter((p: string) => p === only || test.includes(p))
      for (const t of test) if (!manifest.host_permissions.includes(t)) manifest.host_permissions.push(t)
    },
  },
  manifest: ({ mode }) => ({
    name: "Pypr job capture",
    description: "Save jobs from any careers page to your Pypr job tracker. You show it where the details are; it remembers.",
    version: "0.1.0",
    key,
    permissions: ["activeTab", "scripting", "storage", "contextMenus", "identity"],
    // Only the Pypr API. Pages are reached through activeTab or a site the user enables.
    host_permissions: [`${new URL(api_(mode)).origin}/*`],
    // Declared so the user can be asked for one site at a time ("Enable on this site"). Nothing is granted at install.
    optional_host_permissions: ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
    action: { default_title: "Save this job to Pypr" },
    icons: { 16: "icon/16.png", 32: "icon/32.png", 48: "icon/48.png", 128: "icon/128.png" },
    minimum_chrome_version: "120",
  }),
})
