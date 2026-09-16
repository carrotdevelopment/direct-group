import { z } from "zod";

// bcrypt only processes the first 72 bytes, including multi-byte UTF-8 characters.
export const passwordSchema = z.string().min(12).max(72).refine(
  value => new TextEncoder().encode(value).length <= 72,
  "La contraseña no puede superar 72 bytes UTF-8.",
);
