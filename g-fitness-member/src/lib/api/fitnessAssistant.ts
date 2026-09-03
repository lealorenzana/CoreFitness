import { supabase } from '../supabaseClient';

/**
 * The model fallback behind the rule table.
 *
 * Called **only** when `answerFor()` returns its fallback — the rules answer
 * everything factual about this gym first, so the model is never in a position
 * to state a price, an opening hour or a membership status. It sees a fitness
 * question and nothing else.
 *
 * ## Every failure returns null, on purpose
 *
 * Not configured, offline, rate-limited, timed out, gibberish upstream — all of
 * it collapses to `null`, and the caller shows the fallback message the app had
 * before this existed. There is no error state to design, no way for this to
 * make the assistant worse than it was, and no way for a panel demo to break
 * because a free tier was busy. The model is an upgrade when it is there and
 * absent when it is not.
 */

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Longer than this and the member is owed the fallback rather than a spinner. */
const CLIENT_TIMEOUT_MS = 22_000;

export async function askFitnessAssistant(
  question: string,
  history: AssistantTurn[] = []
): Promise<string | null> {
  try {
    // `functions.invoke` attaches the caller's access token, which the function
    // verifies — this is not an open endpoint.
    const invocation = supabase.functions.invoke<{ answer?: string; error?: string }>(
      'fitness-assistant',
      { body: { question, history: history.slice(-6) } }
    );

    // The Edge Function has its own 20s abort, but a request that never reaches
    // it would hang here instead. Whichever resolves first wins; the loser is
    // harmless because nothing is written either way.
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), CLIENT_TIMEOUT_MS));
    const result = await Promise.race([invocation, timeout]);
    if (!result) return null;

    const { data, error } = result;
    // A non-2xx (503 not configured, 502 upstream down) arrives here as `error`.
    // None of them are worth showing: the caller has a better message already.
    if (error) return null;

    const answer = data?.answer;
    return typeof answer === 'string' && answer.trim() ? answer.trim() : null;
  } catch {
    return null;
  }
}
