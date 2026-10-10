import { supabase } from '../supabaseClient';

/**
 * What a gym tells Core Fitness (0188): a rating, ideas, bug reports (support
 * tickets with a screenshot) and a testimonial for the website. Everything goes
 * through definer functions; the tables have no policy.
 */
export interface MyRating { stars: number; comment: string | null; created_at: string }
export interface Idea {
  id: string; title: string; body: string | null; status: 'open' | 'planned' | 'done' | 'not_now';
  platform_note: string | null; created_at: string; decided_at: string | null; author_name: string | null;
}
export interface Testimonial {
  id: string; quote: string; shown_name: string; shown_role: string | null;
  status: 'pending' | 'approved' | 'declined' | 'withdrawn'; created_at: string; decided_at: string | null;
}

const rpc = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};

export const myRating = async () => ((await rpc<MyRating[]>('my_platform_rating')) ?? [])[0] ?? null;
export const rateCoreFitness = (stars: number, comment: string) => rpc<void>('rate_core_fitness', { p_stars: stars, p_comment: comment || null });
export const myIdeas = () => rpc<Idea[]>('my_feature_requests');
export const sendIdea = (title: string, body: string) => rpc<string>('submit_feature_request', { p_title: title, p_body: body || null });
export const myTestimonials = () => rpc<Testimonial[]>('my_testimonials');
export const sendTestimonial = (quote: string, name: string, role: string) =>
  rpc<string>('submit_testimonial', { p_quote: quote, p_name: name, p_role: role || null });
export const withdrawTestimonial = (id: string) => rpc<void>('withdraw_testimonial', { p_id: id });

/** A bug: the screenshot goes to support/<gym>/…, then the ticket is opened with it. */
export async function reportBug(gymId: string, title: string, body: string, shot: File | null): Promise<string> {
  let path: string | null = null;
  if (shot) {
    const ext = (shot.name.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    path = `${gymId}/bug-${Date.now()}.${ext}`;
    const up = await supabase.storage.from('support').upload(path, shot, { contentType: shot.type || undefined });
    if (up.error) throw new Error(up.error.message);
  }
  return rpc<string>('report_bug', {
    p_title: title, p_body: body, p_screenshot: path,
    p_context: { route: window.location.pathname, build: import.meta.env.VITE_BUILD ?? null, user_agent: navigator.userAgent },
  });
}

/** Which tickets are bugs, and their screenshots (0188). Empty before 0188. */
export async function ticketExtras(ids: string[]): Promise<Map<string, { kind: string; screenshot: string | null }>> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await rpc<{ id: string; kind: string; screenshot: string | null }[]>('ticket_extras', { p_ids: ids });
    return new Map(rows.map((r) => [r.id, r]));
  } catch { return new Map(); }
}
export async function screenshotLink(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('support').createSignedUrl(path, 120);
  return data?.signedUrl ?? null;
}
