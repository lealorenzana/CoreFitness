import { assertWrote } from './mutate';
import { supabase } from '../supabaseClient';

/**
 * A trainer's certificates (migration 0054).
 *
 * The bucket is **private**, unlike `avatars`. A certificate carries a legal
 * name and usually a licence number, so every read goes through a short-lived
 * signed URL rather than a public one — a leaked public URL would expose an
 * employee's identity document permanently.
 *
 * Nothing here can set `status`. The trigger in 0054 rejects it, because a
 * trainer who could mark their own document verified would make the record
 * worth less than the free-text field it exists to improve.
 */

export type CredentialStatus = 'pending' | 'verified' | 'rejected';

export interface Credential {
  id: string;
  title: string;
  filePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  status: CredentialStatus;
  uploadedAt: string;
  reviewNote: string | null;
}

const BUCKET = 'credentials';
/** Long enough to open the file, short enough that a copied link goes stale. */
const SIGNED_URL_SECONDS = 300;

interface Row {
  id: string; title: string; file_path: string; mime_type: string | null;
  size_bytes: number | null; status: string; uploaded_at: string; review_note: string | null;
}

const toCredential = (r: Row): Credential => ({
  id: r.id,
  title: r.title,
  filePath: r.file_path,
  mimeType: r.mime_type,
  sizeBytes: r.size_bytes,
  status: r.status as CredentialStatus,
  uploadedAt: r.uploaded_at,
  reviewNote: r.review_note,
});

export async function listMyCredentials(trainerId: string): Promise<Credential[]> {
  const { data, error } = await supabase
    .from('trainer_credentials')
    .select('id, title, file_path, mime_type, size_bytes, status, uploaded_at, review_note')
    .eq('trainer_id', trainerId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toCredential);
}

/**
 * Upload, then record.
 *
 * In that order, and the row is written second on purpose: a row pointing at a
 * file that failed to upload is a broken record the admin cannot open. A file
 * with no row is invisible and harmless, and the storage policies mean only its
 * owner and the admin could ever reach it anyway.
 */
export async function uploadCredential(
  trainerId: string, title: string, file: File
): Promise<Credential> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf';
  // Random filename, not the original: a document called
  // "juan-dela-cruz-nasm-2019.pdf" leaks its contents from the path alone.
  const path = `${trainerId}/${crypto.randomUUID()}.${ext}`;

  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (up.error) throw up.error;

  const { data, error } = await supabase
    .from('trainer_credentials')
    .insert({
      trainer_id: trainerId,
      title: title.trim(),
      file_path: path,
      mime_type: file.type,
      size_bytes: file.size,
    })
    .select('id, title, file_path, mime_type, size_bytes, status, uploaded_at, review_note')
    .single();

  if (error) {
    // Do not leave an orphan behind if the row failed — the file would sit in
    // storage with nothing referencing it and nobody able to tidy it up.
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return toCredential(data as Row);
}

/** A short-lived URL. Returns null rather than throwing — the row still renders. */
export async function credentialUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_SECONDS);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Withdraw a document. Removes the file too, so nothing is left behind. */
export async function deleteCredential(id: string, filePath: string): Promise<void> {
  const { data, error } = await supabase
    .from('trainer_credentials').delete().eq('id', id)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'That credential could not be removed — it may not be yours to delete.');
  await supabase.storage.from(BUCKET).remove([filePath]);
}
