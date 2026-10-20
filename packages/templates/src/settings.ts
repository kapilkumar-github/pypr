import type { ResumeDensity, ResumeFont, ResumeSettings } from '@pypr/resume-core';
import { ensureContrast, isHexColor } from './color.js';

/**
 * Font choices as system font stacks: the preview and the PDF can't load web fonts (no network
 * by design), so each stack ends in fonts the PDF server has (Liberation, DejaVu).
 */
export const FONT_STACKS: Record<
  ResumeFont,
  { label: string; kind: 'sans' | 'serif'; stack: string }
> = {
  helvetica: {
    label: 'Helvetica / Arial',
    kind: 'sans',
    stack: '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif',
  },
  system: {
    label: 'System UI',
    kind: 'sans',
    stack:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Liberation Sans", sans-serif',
  },
  verdana: { label: 'Verdana', kind: 'sans', stack: 'Verdana, "DejaVu Sans", Geneva, sans-serif' },
  georgia: {
    label: 'Georgia',
    kind: 'serif',
    stack: 'Georgia, "DejaVu Serif", "Liberation Serif", serif',
  },
  palatino: {
    label: 'Palatino',
    kind: 'serif',
    stack:
      '"Palatino Linotype", Palatino, "Book Antiqua", "TeX Gyre Pagella", "Liberation Serif", serif',
  },
  times: {
    label: 'Times',
    kind: 'serif',
    stack: '"Times New Roman", Times, "Liberation Serif", serif',
  },
};

/** Line height and spacing per density. "normal" is the template's original rhythm. */
export const DENSITY_SCALE: Record<
  ResumeDensity,
  { label: string; lineHeight: number; space: number }
> = {
  compact: { label: 'Compact', lineHeight: 1.3, space: 0.7 },
  normal: { label: 'Normal', lineHeight: 1.45, space: 1 },
  spaced: { label: 'Spaced', lineHeight: 1.65, space: 1.35 },
};

const PAPER = '#FFFFFF';

/**
 * CSS custom properties for a resume's settings. Accent text is darkened to 4.5:1 on white
 * paper and accent lines to 3:1, so even a neon accent stays readable when printed.
 */
export function settingsCss(settings: ResumeSettings): string {
  const accent = isHexColor(settings.accentColor) ? settings.accentColor : '#B7FF3C';
  const density = DENSITY_SCALE[settings.density];
  return [
    `--resume-accent: ${accent}`,
    `--resume-accent-text: ${ensureContrast(accent, PAPER, 4.5)}`,
    `--resume-accent-line: ${ensureContrast(accent, PAPER, 3)}`,
    `--resume-font: ${FONT_STACKS[settings.font].stack}`,
    `--resume-line-height: ${String(density.lineHeight)}`,
    `--resume-space: ${String(density.space)}`,
  ].join('; ');
}
