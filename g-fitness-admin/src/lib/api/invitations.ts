import { supabase } from '../supabaseClient';

/**
 * Invitations — how a gym brings in the members it already has (0111).
 *
 * An invitation is a row, not an email. Nothing in this project sends mail, so
 * the gym hands out the link the way it already talks to its members: printed
 * at the desk, sent over Messenger, read down a phone. That is honest about
 * what the system does rather than implying an inbox somewhere.
 *
 * The token is a credential. `gym_invitations` has RLS on and **no permissive
 * policy at all**, so nothing here reads the table directly — every call below
 * is a SECURITY DEFINER function that checks the caller's role first.
 */

export type InviteRole = 'member' | 'trainer' | 'staff';
export type InviteState = 'waiting' | 'accepted' | 'revoked' | 'expired';

export interface Invitation {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: InviteRole;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  note: string | null;
  created_at: string;
  state: InviteState;
}

export interface NewInvite {
  email: string;
  role?: InviteRole;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  note?: string | null;
}

export async function listInvitations(includeDone = false): Promise<Invitation[]> {
  const { data, error } = await supabase.rpc('list_invitations', { p_include_done: includeDone });
  if (error) throw new Error(error.message);
  return (data as Invitation[]) ?? [];
}

export async function inviteToGym(i: NewInvite): Promise<{ id: string; token: string }> {
  const { data, error } = await supabase.rpc('invite_to_gym', {
    p_email: i.email.trim(),
    p_role: i.role ?? 'member',
    p_first: i.firstName?.trim() || null,
    p_last: i.lastName?.trim() || null,
    p_phone: i.phone?.trim() || null,
    p_note: i.note?.trim() || null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row as { id: string; token: string };
}

export async function revokeInvitation(id: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_invitation', { p_id: id });
  if (error) throw new Error(error.message);
}

/** The link a member opens. The member app reads the token and joins them. */
export const inviteLink = (token: string) =>
  `https://corefitness-gym.vercel.app/invite/${token}`;

// ---- bringing in a list ------------------------------------------------------------

export interface ParsedRow {
  line: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** Why this row cannot be used, or null when it is fine. */
  problem: string | null;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Read a pasted list into rows, without a CSV library.
 *
 * Deliberately forgiving about *shape* and strict about *content*: a gym's
 * existing list comes out of a spreadsheet, a notebook or a phone, and rejecting
 * the whole file because row 40 has a trailing comma would send them back to
 * Excel. Every row is reported with its line number and its own problem, so the
 * screen can show what will happen before anything is written.
 *
 * Accepts comma, tab or semicolon separators, quoted fields, an optional header
 * row, and columns in either `email, first, last, phone` order or just emails
 * one per line.
 */
export function parseList(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/);
  const rows: ParsedRow[] = [];
  const seen = new Set<string>();

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;

    // A header row: skip it rather than importing "email" as an address.
    if (i === 0 && /(^|[,;\t])\s*"?e-?mail"?\s*($|[,;\t])/i.test(line)) return;

    const cells = splitRow(line).map((c) => c.trim().replace(/^"|"$/g, '').trim());
    // The email is whichever cell looks like one — so a file that leads with a
    // name column works without anyone being told which order to use.
    const emailAt = cells.findIndex((c) => EMAIL.test(c));
    const email = (emailAt >= 0 ? cells[emailAt] : cells[0] ?? '').toLowerCase();
    const rest = cells.filter((_, n) => n !== emailAt);

    let problem: string | null = null;
    if (!email) problem = 'No email on this line';
    else if (!EMAIL.test(email)) problem = `"${email}" is not an email address`;
    else if (seen.has(email)) problem = 'The same email appears earlier in this list';
    if (email && !problem) seen.add(email);

    rows.push({
      line: i + 1,
      email,
      firstName: rest[0] ?? '',
      lastName: rest[1] ?? '',
      phone: rest.find((c) => /^[+0-9][0-9()\s-]{6,}$/.test(c)) ?? '',
      problem,
    });
  });

  return rows;
}

/** Splits on comma, tab or semicolon, leaving anything inside quotes alone. */
function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && (ch === ',' || ch === '\t' || ch === ';')) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export interface ImportResult {
  invited: { email: string; token: string }[];
  failed: { email: string; reason: string }[];
}

/**
 * Invite every usable row, one at a time.
 *
 * One at a time on purpose: each call is its own decision in the database, and
 * a list of two hundred where row 87 is already a member should invite the
 * other 199 rather than refusing the lot. Every failure is reported with the
 * database's own sentence, because "already belongs to this gym" is something
 * the person importing needs to read, not a number in a total.
 */
export async function importInvites(
  rows: ParsedRow[],
  role: InviteRole,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const usable = rows.filter((r) => !r.problem);
  const result: ImportResult = { invited: [], failed: [] };

  for (let i = 0; i < usable.length; i++) {
    const row = usable[i];
    try {
      const { token } = await inviteToGym({
        email: row.email, role,
        firstName: row.firstName || null,
        lastName: row.lastName || null,
        phone: row.phone || null,
      });
      result.invited.push({ email: row.email, token });
    } catch (e) {
      result.failed.push({ email: row.email, reason: e instanceof Error ? e.message : 'Refused' });
    }
    onProgress?.(i + 1, usable.length);
  }
  return result;
}
