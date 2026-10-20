import { resumeContentSchema, type ResumeContent } from '@pypr/resume-core';

export interface GroupedIssues {
  count: number;
  /** By basics field. */
  basics: Map<string, string>;
  /** By section id, then "title" or "<entryId>.<field>". */
  sections: Map<string, Map<string, string>>;
  /** Anything else (title, limits). */
  general: string[];
}

/** Validation problems in the content, placed where the editor shows them. */
export function groupIssues(content: ResumeContent): GroupedIssues {
  const result: GroupedIssues = { count: 0, basics: new Map(), sections: new Map(), general: [] };
  const parsed = resumeContentSchema.safeParse(content);
  if (parsed.success) return result;

  for (const issue of parsed.error.issues) {
    result.count += 1;
    const [root, a, b, c, d, field] = issue.path;
    if (root === 'basics' && typeof a === 'string') {
      result.basics.set(a, issue.message);
      continue;
    }
    if (root === 'sections' && typeof a === 'number') {
      const section = content.sections[a];
      if (section) {
        const map = result.sections.get(section.id) ?? new Map<string, string>();
        result.sections.set(section.id, map);
        const entry = typeof c === 'number' ? section.entries[c] : undefined;
        if (b === 'entries' && entry && d === 'data' && typeof field === 'string') {
          map.set(`${entry.id}.${field}`, issue.message);
          continue;
        }
        if (b === 'title') {
          map.set('title', issue.message);
          continue;
        }
      }
    }
    result.general.push(issue.message);
  }
  return result;
}
