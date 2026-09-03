// General fitness questions, answered by a model — and nothing else.
//
// This is the FALLBACK behind `memberAssistant.ts`. The rule table answers first
// and owns every fact about this gym: prices, opening hours, your membership,
// your check-in code. Those come from the database and a model never touches
// them. Only questions the rules cannot answer reach here.
//
// That split is the whole safety argument. A model that could state a price
// would eventually state a wrong one — this project has already shipped a
// chatbot citing gyms, coaches and prices that do not exist. Here the model has
// no gym data to get wrong, because it is never given any.
//
// ---------------------------------------------------------------------------
// Why an Edge Function rather than calling the provider from the app
// ---------------------------------------------------------------------------
// The API key. Anything in either frontend bundle is public — the same reason
// the service-role key lives only in functions like this one. The key here is an
// Edge Function secret and never reaches a browser.
//
// It also gives one place to verify the caller is a real signed-in user, so the
// gym's quota cannot be burned by anyone who finds the URL.
//
// ---------------------------------------------------------------------------
// Provider-agnostic on purpose
// ---------------------------------------------------------------------------
// Configured by three secrets rather than hardcoded to one company, because
// free tiers change and this gym cannot afford to be rewritten when one does:
//
//   ASSISTANT_API_URL    an OpenAI-compatible /chat/completions endpoint
//   ASSISTANT_API_KEY    the key for it
//   ASSISTANT_MODEL      the model name
//
// Groq, OpenRouter, Together and a self-hosted Ollama all speak this shape, so
// switching provider is three secret changes and no code.
//
// If the secrets are absent the function returns 503 with `configured: false`,
// and the app silently keeps its existing fallback message. Not configuring
// this is a supported state, not a broken one.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Hard scope. Everything the model is and is not allowed to do. */
const SYSTEM_PROMPT = `You are the fitness assistant inside Core Fitness, a gym management app for a single gym in Mamburao, Occidental Mindoro, Philippines.

WHAT YOU ANSWER
Only general fitness, exercise, training and gym-related questions: technique and form, programme structure, sets and reps, warm-ups, recovery, soreness, training frequency, general nutrition principles for training, gym etiquette, and what equipment is typically for.

WHAT YOU MUST NEVER DO
1. Never state this gym's prices, membership tiers, opening hours, address, phone number, class schedule, trainer names, or policies. You do not have that information. The app answers those from its own database. If asked, say the app can show it — suggest checking Membership, Book a Session, or the front desk — and do not guess a value.
2. Never give medical advice, diagnose, or suggest treatment. If a question involves pain, injury, illness, medication, pregnancy, or a health condition, briefly advise stopping the movement if it hurts and speaking to a trainer, doctor or physiotherapist. Do not work around an injury with exercise substitutions.
3. Never give individual calorie targets, macro splits, weight-loss targets, or meal plans. General principles only.
4. Never discuss anything unrelated to fitness and the gym. If asked, say you only cover training and gym questions and stop.
5. Never claim to be a doctor, dietitian, or licensed professional, and never call yourself a person.

HOW YOU WRITE
Plain, warm, direct. Two short paragraphs at most, or a short bullet list. No headings. Assume the reader is a gym member, not a coach. Philippine context: pesos, Manila time, warm humid climate. If the honest answer is "ask a coach", say that — it is a real answer, not a failure.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const apiUrl = Deno.env.get("ASSISTANT_API_URL");
  const apiKey = Deno.env.get("ASSISTANT_API_KEY");
  const model = Deno.env.get("ASSISTANT_MODEL");

  // Not configured is a normal state: the app falls back to its own message.
  if (!apiUrl || !apiKey || !model) {
    return json({ configured: false, error: "Assistant model is not configured" }, 503);
  }

  try {
    // ── The caller must be a real signed-in user ────────────────────────────
    // Verified against Supabase's own auth endpoint rather than by decoding the
    // JWT here: decoding proves the shape, not that the token is valid.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const whoami = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: anonKey },
    });
    if (!whoami.ok) return json({ error: "Invalid session" }, 401);

    // ── Input ──────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) return json({ error: "question is required" }, 400);

    // A cap, not a rate limit. It stops one request being enormous; it does not
    // stop many requests. The provider's own quota is the backstop for that, and
    // the auth check above means it can only be spent by real members.
    if (question.length > 500) {
      return json({ error: "That question is too long — try asking it more briefly." }, 400);
    }

    // Up to three prior turns, so a follow-up like "and for legs?" makes sense.
    // Trimmed hard: this is a fallback, not a long conversation, and every extra
    // turn is tokens the gym pays for in quota.
    const history = Array.isArray(body?.history) ? body.history.slice(-6) : [];
    const priorTurns = history
      .filter((m: unknown): m is { role: string; content: string } =>
        !!m && typeof m === "object" &&
        typeof (m as { content?: unknown }).content === "string" &&
        ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "assistant"))
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 500) }));

    // ── Ask the model ──────────────────────────────────────────────────────
    // AbortSignal, because a hanging upstream would otherwise hold the member
    // staring at a typing indicator that never resolves.
    const upstream = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...priorTurns,
          { role: "user", content: question },
        ],
        temperature: 0.4,
        max_tokens: 320,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!upstream.ok) {
      // The upstream body can carry the key back in an error echo, and always
      // carries provider detail a member has no use for. Log the status, return
      // a sentence.
      console.error("assistant upstream failed", upstream.status);
      return json({ error: "The assistant is unavailable right now.", upstream: upstream.status }, 502);
    }

    const data = await upstream.json();
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
      console.error("assistant returned no content");
      return json({ error: "The assistant returned nothing usable." }, 502);
    }

    return json({ answer: answer.trim(), model, source: "model" }, 200);
  } catch (err) {
    // Includes the 20s timeout. Never surface the raw error: it can contain the
    // request we sent, which contains the Authorization header.
    console.error("assistant error", err instanceof Error ? err.name : "unknown");
    return json({ error: "The assistant is unavailable right now." }, 502);
  }
});
