"use client"

import { useEffect } from "react"

/** Marks the page ready for the PDF renderer once web fonts are loaded and layout has settled. */
export function PdfReady() {
  useEffect(() => {
    let frame = 0
    void document.fonts.ready.then(() => {
      frame = requestAnimationFrame(() => {
        document.documentElement.dataset.pdfReady = ""
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [])
  return null
}
