'use client';

import { useEffect, useRef } from 'react';

const dots = (opacity: number) =>
  `radial-gradient(circle, color-mix(in oklab, var(--color-ink) ${String(opacity)}%, transparent) 1px, transparent 1px)`;

const spotlight = 'radial-gradient(circle 120px at var(--x) var(--y), black 0%, transparent 100%)';

/** Dot grid that brightens slightly around the pointer. */
export function DotBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Update CSS variables directly so pointer moves don't re-render React.
    const onMove = (event: PointerEvent) => {
      el.style.setProperty('--x', `${String(event.clientX)}px`);
      el.style.setProperty('--y', `${String(event.clientY)}px`);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 [--x:-1000px] [--y:-1000px]"
    >
      <div
        className="absolute inset-0"
        style={{ backgroundImage: dots(18), backgroundSize: '32px 32px' }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: dots(40),
          backgroundSize: '32px 32px',
          maskImage: spotlight,
          WebkitMaskImage: spotlight,
        }}
      />
    </div>
  );
}
