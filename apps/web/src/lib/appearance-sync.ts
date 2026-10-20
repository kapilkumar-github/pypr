import {
  DEFAULT_APP_ACCENT,
  DEFAULT_APP_THEME,
  appearanceSchema,
  type Appearance,
  type AppTheme,
  type UpdateAppearanceRequest,
} from '@pypr/validation';
import { apiGet, apiRequest } from './api';
import { readAppAccent, setAppAccent } from './app-accent';
import { readThemePreference, setThemePreference } from './theme-store';

/**
 * Keeps the app's theme and accent in step between this browser and the account (decision
 * D28). The browser copy paints the first frame; the account makes it follow the user.
 */

interface Values {
  theme: AppTheme;
  accentColor: string;
}

const SYNCED_KEY = 'pypr-appearance-synced';

export interface Reconciled {
  /** Values to apply in this browser (from the account). */
  apply: Partial<Values>;
  /** Values to save to the account (chosen here while signed out, or never saved). */
  push: UpdateAppearanceRequest;
  /** What both sides hold afterwards. */
  synced: Values;
}

/**
 * For each setting: the account's value wins, unless this browser changed it since the last
 * sync (e.g. the theme toggle on a public page) or the account never had one. Then the browser's
 * value is saved to the account, so an existing choice is never lost.
 */
export function reconcileAppearance(
  server: Appearance,
  local: Values,
  lastSynced: Partial<Values> | null,
): Reconciled {
  const apply: Partial<Values> = {};
  const push: { theme?: AppTheme; accentColor?: string } = {};
  const synced = { ...local };
  const defaults: Values = { theme: DEFAULT_APP_THEME, accentColor: DEFAULT_APP_ACCENT };

  for (const key of ['theme', 'accentColor'] as const) {
    const remote = server[key];
    const changedHere = lastSynced?.[key] !== undefined && lastSynced[key] !== local[key];
    if (remote === null) {
      if (local[key] !== defaults[key]) Object.assign(push, { [key]: local[key] });
    } else if (changedHere) {
      if (remote !== local[key]) Object.assign(push, { [key]: local[key] });
    } else if (remote !== local[key]) {
      Object.assign(apply, { [key]: remote });
      Object.assign(synced, { [key]: remote });
    }
  }
  return { apply, push, synced };
}

function readSynced(): Partial<Values> | null {
  try {
    return JSON.parse(localStorage.getItem(SYNCED_KEY) ?? 'null') as Partial<Values> | null;
  } catch {
    return null;
  }
}

function writeSynced(values: Values): void {
  try {
    localStorage.setItem(SYNCED_KEY, JSON.stringify(values));
  } catch {
    // Storage blocked: the next sign-in simply syncs again.
  }
}

function readLocal(): Values {
  return { theme: readThemePreference(), accentColor: readAppAccent() };
}

function applyLocal(values: Partial<Values>): void {
  if (values.theme) setThemePreference(values.theme);
  if (values.accentColor) setAppAccent(values.accentColor);
}

/** After sign-in: bring this browser and the account into line. Failures are silent. */
export async function syncAppearance(): Promise<void> {
  try {
    const server = await apiGet('/api/me/appearance', appearanceSchema);
    const { apply, push, synced } = reconcileAppearance(server, readLocal(), readSynced());
    applyLocal(apply);
    if (Object.keys(push).length > 0) {
      await apiRequest('/api/me/appearance', { method: 'PATCH', body: push });
    }
    writeSynced(synced);
  } catch {
    // Offline or signed out: the browser's copy keeps working; the next load tries again.
  }
}

/**
 * A change from Settings: applied at once in this browser, then saved to the account. Throws
 * when saving fails (the change still applies here and is saved at the next sync).
 */
export async function saveAppearance(patch: Partial<Values>): Promise<void> {
  applyLocal(patch);
  await apiRequest('/api/me/appearance', { method: 'PATCH', body: patch });
  // Settings not in the patch keep their last synced value, so a pending change still syncs.
  writeSynced({ ...readLocal(), ...readSynced(), ...patch });
}
