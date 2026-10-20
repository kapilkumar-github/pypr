/** Small color helpers for accents (WCAG 2 contrast). Pure, no DOM. */

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white text, whichever reads better on `background`. */
export function readableTextOn(background: string, dark = '#090B10', light = '#FFFFFF'): string {
  return contrastRatio(background, dark) >= contrastRatio(background, light) ? dark : light;
}

/**
 * The accent, adjusted just enough to reach `ratio` against `background`: darkened on light
 * backgrounds (a neon accent on white paper), lightened on dark ones (a dark accent on the dark
 * workspace). The hue is kept; readable accents come back unchanged.
 */
export function ensureContrast(accent: string, background: string, ratio: number): string {
  if (contrastRatio(accent, background) >= ratio) return accent.toUpperCase();
  const rgb = hexToRgb(accent);
  const towardWhite = luminance(background) < 0.5;
  for (let t = 0.02; t <= 1; t += 0.02) {
    const candidate = rgbToHex(
      rgb.map((v) => (towardWhite ? v + (255 - v) * t : v * (1 - t))) as Rgb,
    );
    if (contrastRatio(candidate, background) >= ratio) return candidate;
  }
  return towardWhite ? '#FFFFFF' : '#000000';
}
