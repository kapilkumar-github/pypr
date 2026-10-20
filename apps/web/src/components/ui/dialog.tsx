'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Modal built on the native <dialog>: focus trapping, Escape to close and the inert
 * background come from the browser.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  /** Wider dialog for richer content (e.g. a review step). */
  wide?: boolean;
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose(); // backdrop click
      }}
      aria-labelledby="dialog-title"
      className={`m-auto ${wide ? 'w-[min(40rem,calc(100vw-2rem))]' : 'w-[min(28rem,calc(100vw-2rem))]'} rounded-xl border border-line bg-elevated p-0 text-ink shadow-2xl backdrop:bg-black/60`}
    >
      <div className="p-6">
        <h2 id="dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </dialog>
  );
}
