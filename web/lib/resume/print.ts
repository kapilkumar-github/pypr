import { MARGINS, type ResumeSettings } from "./types"

/** The @page rule for the resume's paper size and margins. Shared by browser print and the server PDF page. */
export function pageRule(settings: ResumeSettings) {
  const margin = 12 * (MARGINS.find((m) => m.id === settings.margins)?.factor ?? 1)
  return `@page { size: ${settings.paperSize === "letter" ? "letter" : "A4"} portrait; margin: ${margin.toFixed(1)}mm; }`
}

/** Opens the browser print dialog for the resume; the print stylesheet hides everything but the paper. */
export function printResume({ fileName, settings }: { fileName: string; settings: ResumeSettings }) {
  const style = document.createElement("style")
  style.textContent = pageRule(settings)
  document.head.appendChild(style)

  const originalTitle = document.title
  document.title = fileName // browsers use it as the default PDF file name

  const restore = () => {
    document.title = originalTitle
    style.remove()
    window.removeEventListener("afterprint", restore)
  }
  window.addEventListener("afterprint", restore)
  window.print()
}
