import { hexColorSchema } from '@pypr/resume-core';
import { z } from 'zod';

/**
 * The app's own look, per account (decision D28): theme and accent of the Pypr interface.
 * Independent of every resume's design settings (accent, font, density), which live on the
 * resume. Null means the user never chose, so the browser's current choice or the default
 * applies.
 */
export const APP_THEMES = ['dark', 'light', 'system'] as const;
export type AppTheme = (typeof APP_THEMES)[number];

export const DEFAULT_APP_THEME: AppTheme = 'system';
export const DEFAULT_APP_ACCENT = '#B7FF3C';

/** GET and PATCH /api/me/appearance responses. */
export const appearanceSchema = z.object({
  theme: z.enum(APP_THEMES).nullable(),
  accentColor: z.string().nullable(),
});
export type Appearance = z.infer<typeof appearanceSchema>;

/** PATCH /api/me/appearance: only the fields being changed; the other one is kept. */
export const updateAppearanceRequestSchema = z
  .strictObject({
    theme: z.enum(APP_THEMES).optional(),
    accentColor: hexColorSchema.optional(),
  })
  .refine((body) => body.theme !== undefined || body.accentColor !== undefined, {
    message: 'Send theme, accentColor or both',
  });
export type UpdateAppearanceRequest = z.infer<typeof updateAppearanceRequestSchema>;
