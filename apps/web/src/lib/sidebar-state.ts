import { useSyncExternalStore } from 'react';

// Whether the desktop sidebar is collapsed: a per-browser convenience in localStorage.

const KEY = 'pypr-sidebar-collapsed';
const EVENT = 'pypr:sidebar-change';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function setSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, collapsed ? '1' : '0');
  } catch {
    // Storage blocked: the change still applies until reload.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
