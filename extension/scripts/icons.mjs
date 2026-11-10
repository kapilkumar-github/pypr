// Renders public/icon/{16,32,48,128}.png from an inline SVG with headless Chrome (no image libraries needed).
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const chrome = process.env.CHROME_PATH
if (!chrome) throw new Error("Set CHROME_PATH to a Chrome or Chromium binary.")
mkdirSync("public/icon", { recursive: true })
for (const size of [16, 32, 48, 128]) {
  const page = join(tmpdir(), `pypr-icon-${size}.html`)
  writeFileSync(page, `<!doctype html><body style="margin:0;background:transparent"><svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#4f46e5"/><path d="M8 18V6h5a3.5 3.5 0 0 1 0 7H8" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></body>`)
  execFileSync(chrome, ["--headless=new", "--no-sandbox", "--hide-scrollbars", "--default-background-color=00000000", `--window-size=${size},${size}`, `--screenshot=public/icon/${size}.png`, `file://${page}`], { stdio: "ignore" })
}
