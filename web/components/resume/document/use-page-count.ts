"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Measures the resume's natural content height (template plus page padding, ignoring the
 * whole-page min-height) and returns the ref for the paper and the content height in px.
 * `ready` re-attaches once the paper is rendered.
 */
export function useContentHeight(ready: boolean) {
  const paperRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const el = paperRef.current
    const content = el?.firstElementChild
    if (!el || !content) return
    const measure = () => {
      const s = getComputedStyle(el)
      setHeight((content as HTMLElement).offsetHeight + parseFloat(s.paddingTop) + parseFloat(s.paddingBottom))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(content)
    measure()
    return () => ro.disconnect()
  }, [ready])

  return { paperRef, height }
}

export const pageCount = (contentHeight: number, pageHeight: number) => Math.max(1, Math.ceil((contentHeight - 1) / pageHeight))
