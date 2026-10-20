import { classicTemplate } from './classic/classic.js';
import type { ResumeTemplate } from './contract.js';

/** All templates, in the order the picker shows them. */
export const TEMPLATES: readonly ResumeTemplate[] = [classicTemplate];

export const TEMPLATE_IDS: readonly string[] = TEMPLATES.map((t) => t.id);
export const DEFAULT_TEMPLATE_ID = 'classic';

export function isTemplateId(id: string): boolean {
  return TEMPLATE_IDS.includes(id);
}

/** The template, or the default one for ids that no longer exist. */
export function getTemplate(id: string): ResumeTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? classicTemplate;
}
