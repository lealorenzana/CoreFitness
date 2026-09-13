/**
 * A Philippine mobile number, grouped so a person can read it back.
 *
 * The app stores E.164 (`+639171112222`) because that is what the database and
 * every notification provider want. A member checking their own profile was
 * shown those thirteen digits unbroken, which is the one place the storage
 * format helps nobody — you cannot check a number you cannot read.
 *
 * Display only. Nothing here touches what is stored, sent, or compared, and an
 * input that does not match the expected shape is returned untouched rather
 * than reformatted into something that looks right and is not.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const value = raw.trim();

  // +63 917 111 2222
  const e164 = /^\+63(\d{3})(\d{3})(\d{4})$/.exec(value.replace(/\s/g, ''));
  if (e164) return `+63 ${e164[1]} ${e164[2]} ${e164[3]}`;

  // 0917 111 2222 — how most people here would write it down.
  const local = /^0(\d{3})(\d{3})(\d{4})$/.exec(value.replace(/\s/g, ''));
  if (local) return `0${local[1]} ${local[2]} ${local[3]}`;

  return value;
}
