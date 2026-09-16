import { createHash } from "node:crypto";

// Bind the session to the current password without storing the password hash in it.
export function sessionVersion(passwordHash: string) {
  return createHash("sha256").update(passwordHash).digest("hex");
}
