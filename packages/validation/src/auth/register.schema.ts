import { z } from "zod";

export const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z
    .email()
    .trim()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(4, "Password must be at least 4 characters"),
  timezone: z.string().trim().min(5).max(100),
});

export type RegisterInput = z.infer<typeof registerSchema>;
