import { DEFAULT_SECTION_TITLES } from './defaults.js';
import { isWebUrl, resumeContentSchema, type ResumeContent } from './schema.js';

/**
 * Version of the stored resume content shape. Bump it whenever the content shape changes in a
 * way old data doesn't fit, and add an upgrade step from the previous version.
 */
export const RESUME_SCHEMA_VERSION = 3;

/** Turns content stored at version `n` into version `n + 1`. */
export type ResumeUpgrade = (content: unknown) => unknown;

/**
 * Version 1 -> 2: standard sections became unique. Duplicates are merged into the first one
 * (its id, title and visibility), keeping every entry in order, so nothing is lost.
 * Year-only dates were also allowed from version 2; that needs no data change.
 */
export function mergeDuplicateStandardSections(content: unknown): unknown {
  if (typeof content !== 'object' || content === null) return content;
  const sections = (content as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return content;

  type LooseSection = { type?: unknown; entries?: unknown };
  const firstByType = new Map<unknown, LooseSection>();
  const merged: LooseSection[] = [];
  for (const raw of sections as LooseSection[]) {
    const first = raw.type !== 'custom' ? firstByType.get(raw.type) : undefined;
    if (first && Array.isArray(first.entries) && Array.isArray(raw.entries)) {
      first.entries = [...(first.entries as unknown[]), ...(raw.entries as unknown[])];
      continue;
    }
    const copy = {
      ...raw,
      entries: Array.isArray(raw.entries) ? [...(raw.entries as unknown[])] : raw.entries,
    };
    if (raw.type !== 'custom') firstByType.set(raw.type, copy);
    merged.push(copy);
  }
  return { ...content, sections: merged };
}

const LEGACY_LINKS = [
  ['website', 'Website'],
  ['linkedin', 'LinkedIn'],
  ['github', 'GitHub'],
] as const;

// Web Crypto is built into browsers and Node 19+ (see operations.ts).
const webCrypto = (globalThis as unknown as { crypto: { randomUUID: () => string } }).crypto;

/**
 * Version 2 -> 3: the fixed Website, LinkedIn and GitHub fields became entries of a
 * "Websites & Profiles" section, placed first so they stay near the contact details. A value
 * that isn't a web address is kept as the entry's label (with no URL) for the user to fix,
 * never dropped. Without any of those values nothing is added.
 */
export function moveLegacyLinks(
  content: unknown,
  newId: () => string = () => webCrypto.randomUUID(),
): unknown {
  if (typeof content !== 'object' || content === null) return content;
  const { basics, sections } = content as { basics?: unknown; sections?: unknown };
  if (typeof basics !== 'object' || basics === null || !Array.isArray(sections)) return content;

  const { website, linkedin, github, ...rest } = basics as Record<string, unknown>;
  const legacy: Record<(typeof LEGACY_LINKS)[number][0], unknown> = { website, linkedin, github };
  const entries: { id: string; visible: boolean; data: { label: string; url: string } }[] = [];
  for (const [key, label] of LEGACY_LINKS) {
    const raw = legacy[key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) continue;
    const data = isWebUrl(value) ? { label, url: value } : { label: value.slice(0, 120), url: '' };
    entries.push({ id: newId(), visible: true, data });
  }
  if (entries.length === 0) return { ...content, basics: rest };
  const links = {
    id: newId(),
    type: 'links',
    title: DEFAULT_SECTION_TITLES.links,
    visible: true,
    entries,
  };
  return { ...content, basics: rest, sections: [links, ...(sections as unknown[])] };
}

/** Upgrade steps keyed by the version they upgrade from. */
export const RESUME_UPGRADES: Readonly<Record<number, ResumeUpgrade>> = {
  1: mergeDuplicateStandardSections,
  2: (content) => moveLegacyLinks(content),
};

export class ResumeVersionError extends Error {
  override readonly name = 'ResumeVersionError';
}

/**
 * Brings stored content up to the current version and validates it. Content newer than this
 * code (written by a later deploy) is refused rather than guessed at.
 */
export function upgradeResumeContent(
  content: unknown,
  fromVersion: number,
  options: { upgrades?: Readonly<Record<number, ResumeUpgrade>>; toVersion?: number } = {},
): ResumeContent {
  const upgrades = options.upgrades ?? RESUME_UPGRADES;
  const target = options.toVersion ?? RESUME_SCHEMA_VERSION;
  if (!Number.isInteger(fromVersion) || fromVersion < 1) {
    throw new ResumeVersionError(`Invalid resume schema version ${String(fromVersion)}`);
  }
  if (fromVersion > target) {
    throw new ResumeVersionError(
      `Resume schema version ${String(fromVersion)} is newer than supported (${String(target)})`,
    );
  }
  let current = content;
  for (let version = fromVersion; version < target; version += 1) {
    const step = upgrades[version];
    if (!step) {
      throw new ResumeVersionError(`No upgrade from resume schema version ${String(version)}`);
    }
    current = step(current);
  }
  return resumeContentSchema.parse(current);
}
