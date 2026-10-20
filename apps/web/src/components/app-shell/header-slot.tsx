'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** The element in the shell header where a page can put its own controls. */
export const HeaderSlotContext = createContext<HTMLElement | null>(null);

/**
 * Renders page-specific controls (e.g. the editor's back link and save status) in the app
 * header, left of the account menu, so pages don't add a second header row.
 */
export function AppHeaderSlot({ children }: { children: ReactNode }) {
  const target = useContext(HeaderSlotContext);
  return target ? createPortal(children, target) : null;
}
