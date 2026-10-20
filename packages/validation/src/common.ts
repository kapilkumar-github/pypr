import { z } from 'zod';

/** Email as entered by a user: trimmed, lowercased, max 320 chars (RFC 5321 limit). */
export const emailSchema = z.string().trim().toLowerCase().max(320).pipe(z.email());

export type Email = z.infer<typeof emailSchema>;
