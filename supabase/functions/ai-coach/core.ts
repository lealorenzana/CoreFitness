// The parts of the coach that are pure: its rules, the request it sends, the
// frames it streams, and what each gate says. No imports, so node can test it
// (scripts/ai-coach-core.mjs) and Deno can serve it unchanged.

export type Turn = { role: 'user' | 'assistant'; content: string };

export type CoachStatus = {
  gym_id: string; allowed: boolean; reason: string | null;
  used_today: number; daily_limit: number; used_month: number; monthly_limit: number;
  consent: boolean | null;
};

export const SYSTEM_PROMPT = `You are the coach inside a gym's member app in the Philippines. You help one gym member train well: technique, how to structure training, recovery, motivation, and everyday eating habits.

RULES YOU MUST NEVER BREAK
1. Never state this gym's prices, plans, opening hours, address, class schedule, coaches' names or policies. You do not have them. Say the app shows them (Membership, Book a session) or the front desk can help.
2. Never give medical advice. If the member mentions pain, an injury, illness, medication, pregnancy or a health condition: tell them to stop anything that hurts and to see a coach at the gym or a doctor or physiotherapist, and do not change or substitute exercises because of it.
3. Never give a calorie, kcal, macro or gram target, or a weight-loss number. Eating advice is about habits, food choices and portions by hand size (a palm of protein, a fist of rice, a thumb of fat), never numbers.
4. Stay on fitness, training, recovery and everyday eating. Politely decline anything else.
5. Never claim to be a person, a doctor or a dietitian. You are the gym's AI coach.
6. If the member's profile says has_injury is true, do not plan or change exercises around it. Say once, kindly, that a coach at the gym or a physiotherapist should look at it first, then help with everything else.

HOW YOU WRITE
Warm, direct, short: a few sentences or a short list. Use the member's first name now and then if you know it. Philippine context. When the honest answer is "ask a coach at the gym", say so.`;

const REASONS: Record<string, { status: number; message: (s: CoachStatus) => string }> = {
  not_member: { status: 403, message: () => 'The coach is for members of this gym.' },
  switched_off: { status: 403, message: () => 'This gym does not use the coach.' },
  no_plan: { status: 403, message: () => 'The coach comes with a plan that includes it.' },
  daily_limit: { status: 429, message: (s) => `You have used today's ${s.daily_limit} messages with the coach. It opens again tomorrow.` },
  monthly_limit: { status: 429, message: () => 'The coach has reached this gym\'s limit for the month.' },
};

export function statusToHttp(s: CoachStatus): { status: number; body: { reason: string; message: string } } | null {
  if (s.allowed) return null;
  const r = REASONS[s.reason ?? ''] ?? { status: 403, message: () => 'The coach is not available.' };
  return { status: r.status, body: { reason: s.reason ?? 'unknown', message: r.message(s) } };
}

export function validQuestion(q: unknown): q is string {
  return typeof q === 'string' && q.trim().length > 0 && q.length <= 1000;
}

export function buildRequest(
  question: string, history: Turn[], context: Record<string, unknown> | null,
): { system: string; messages: Turn[] } {
  // The profile is what they told the coach at setup; every other key is their
  // training history, shared only with their consent. Label each for what it is.
  const { profile, ...shared } = (context ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (profile) parts.push(`WHAT THIS MEMBER TOLD YOU WHEN SETTING UP\n${JSON.stringify(profile)}`);
  if (Object.keys(shared).length) {
    parts.push(`WHAT YOU KNOW FROM THEIR TRAINING (they agreed to share it)\n${JSON.stringify(shared)}`);
  }
  const about = parts.length
    ? parts.join('\n\n')
    : 'You do not know anything about this member beyond this conversation. Ask what you need.';
  // The last ten turns, cleaned, starting on a user turn (the API requires it).
  let turns = history
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
    .slice(-10)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
  while (turns.length && turns[0].role !== 'user') turns = turns.slice(1);
  return { system: `${SYSTEM_PROMPT}\n\n${about}`, messages: [...turns, { role: 'user', content: question.trim() }] };
}

export function sse(event: { type: 'text'; text: string } | { type: 'done' } | { type: 'error'; reason: string; message: string }): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
