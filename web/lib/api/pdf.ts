import { ApiError } from "./client"

/** Asks the API to render a PDF (headless Chrome) and saves it as `<fileName>.pdf`. */
export async function downloadPdf(path: string, fileName: string) {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, // CSRF guard requires JSON on mutations
    body: "{}",
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => null))?.error
    throw new ApiError(res.status, err?.code ?? "unknown", err?.message ?? "Couldn't create the PDF.")
  }
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement("a")
  a.href = url
  a.download = `${fileName.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Resume"}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
