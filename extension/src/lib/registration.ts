import type { Settings, SiteConfig } from "./schema"
import { originPatterns } from "./urlpattern"

export const REG_ID = "pypr-auto"

export interface Plan {
  /** Match patterns to register, or null to remove the registration. */
  matches: string[] | null
}

/**
 * Which origins the automatic content script covers: those of enabled sites that have a page pattern, the user has
 * granted access to, and only while the launcher setting is on. Everything else is unregistered, so revoking access
 * or disabling a site or the setting takes effect at the next sync.
 */
export function planRegistration(configs: SiteConfig[], granted: (pattern: string) => boolean, settings: Settings): Plan {
  if (!settings.autoLauncher) return { matches: null }
  const wanted = new Set(configs.filter((c) => c.enabled && c.patterns.length > 0).flatMap((c) => c.hosts.flatMap(originPatterns)))
  const matches = [...wanted].filter(granted).sort()
  return { matches: matches.length ? matches : null }
}
