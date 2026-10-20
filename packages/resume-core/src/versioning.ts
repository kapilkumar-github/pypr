import { resumeContentSchema, type ResumeContent } from './schema.js';

/**
 * Version of the stored resume content shape. Bump it whenever the content shape changes in a
 * way old data doesn't fit, and add an upgrade step from the previous version.
 */
export const RESUME_SCHEMA_VERSION = 2;

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

/** Upgrade steps keyed by the version they upgrade from. */
export const RESUME_UPGRADES: Readonly<Record<number, ResumeUpgrade>> = {
  1: mergeDuplicateStandardSections,
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
