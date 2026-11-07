// Shared by invite-account, create-member, reset-login and sign-in-username (0236).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Readable down a phone line and on a slip: no 0/O or 1/l/I. crypto, never Math.random. */
export function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

/** The same form as 0236's profiles_username_form check. */
export const USERNAME_RE = /^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$/;
const RESERVED = new Set(["admin", "administrator", "root", "support", "help", "desk", "frontdesk", "front.desk", "owner",
  "staff", "coach", "trainer", "member", "corefitness", "core.fitness", "system", "null", "undefined"]);

export const tidyUsername = (u: unknown) => String(u ?? "").trim().toLowerCase();

/** A desk-made account with no email signs in by username; Auth still needs an address. `.invalid` never receives mail. */
export const standInEmail = (username: string) => `${username}@no-email.invalid`;
export const isStandIn = (email: string | null | undefined) => /@no-email\.invalid$/i.test(String(email ?? "").trim());

/** Why this username cannot be used, in words — or null. The service-role client reads every profile. */
export async function usernameProblem(admin: SupabaseClient, u: string, forUser?: string): Promise<string | null> {
  if (u.length < 3) return "A username is at least 3 characters.";
  if (u.length > 20) return "A username is at most 20 characters.";
  if (!USERNAME_RE.test(u)) return "Use letters, numbers, dots or underscores, starting and ending with a letter or number.";
  if (RESERVED.has(u)) return "That username is kept for the gym. Choose another.";
  const { data } = await admin.from("profiles").select("id").eq("username", u).maybeSingle();
  if (data && data.id !== forUser) return "That username is taken. Choose another.";
  return null;
}
