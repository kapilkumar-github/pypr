'use client';

import type { ResumeContent } from '@pypr/resume-core';
import { renderResumeHtml } from '@pypr/templates';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

/** Width of an A4 page at 96 dpi; the preview scales this to the available width. */
const PAGE_WIDTH_PX = 794;
/** The document draws 24px of grey above and below the page. */
const PAGE_GUTTER_PX = 48;

/**
 * Live preview: the exact HTML the PDF is printed from, in a sandboxed iframe (no scripts).
 * Re-rendered from deferred content so typing stays responsive.
 */
export function ResumePreview({ content }: { content: ResumeContent }) {
  const deferred = useDeferredValue(content);
  const html = useMemo(() => renderResumeHtml(deferred), [deferred]);
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1123 + PAGE_GUTTER_PX);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(1, entry.contentRect.width / PAGE_WIDTH_PX));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const measure = () => {
    const doc = frame.current?.contentDocument;
    if (doc) setHeight(doc.documentElement.scrollHeight);
  };

  return (
    <div ref={box} className="overflow-hidden rounded-xl border border-line bg-[#e4e4e7]">
      <div style={{ height: height * scale }}>
        <iframe
          ref={frame}
          title="Resume preview"
          // Same-origin lets us measure the height; with no allow-scripts nothing can run.
          sandbox="allow-same-origin"
          srcDoc={html}
          onLoad={measure}
          style={{
            width: PAGE_WIDTH_PX,
            height,
            transform: `scale(${String(scale)})`,
            transformOrigin: 'top left',
            border: 0,
            display: 'block',
          }}
        />
      </div>
    </div>
  );
}
