import { readFile } from "node:fs/promises"
import path from "node:path"

// Development only: hands out the extension ZIPs built by `pnpm zip` and `pnpm zip:sideload` in ../extension.
const FILES: Record<string, string> = {
  store: ".output/pypr-extension-0.1.0-chrome.zip",
  sideload: ".output-sideload/pypr-extension-0.1.0-chrome.zip",
}

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 })
  const { kind } = await ctx.params
  const rel = FILES[kind]
  if (!rel) return new Response("Not found", { status: 404 })
  try {
    const body = await readFile(path.join(process.cwd(), "..", "extension", rel))
    return new Response(body, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="pypr-extension-${kind}.zip"` } })
  } catch {
    return new Response("Build it first: pnpm zip / pnpm zip:sideload in extension/.", { status: 404 })
  }
}
