import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PaperPlaneRight, Trash } from '@phosphor-icons/react';
import RichText from '../components/ui/RichText';
import { PageTitle } from '../components/ui/page';
import { Chip } from '../components/ui/noc';
import { getCurrentMemberId } from '../services/bookingService';
import { getMemberHome } from '../services/memberHomeService';
import { listPlans } from '../lib/api/membershipPlans';
import { getGymSettings } from '../lib/api/settings';
import { getCurrentPlan } from '../lib/api/workoutPlans';
import { getBalance } from '../lib/api/points';
import {
  answerFor, suggestionsFor, EMPTY_CONTEXT, toGymFacts, isRuleFallback, RULE_FALLBACK,
  type AssistantContext,
} from '../data/memberAssistant';
import {
  listConversations, listMessages, createConversation, appendMessage,
  deleteConversation, titleFrom, type Conversation,
} from '../lib/api/assistantChats';
import FeatureLock from '../components/ui/FeatureLock';
import { askCoach, getCoachStatus, setCoachConsent, saveCoachProfile, type CoachStatus, type CoachProfile } from '../lib/api/aiCoach';
import CoachConsent from '../components/CoachConsent';
import CoachSetup, { REFERRAL } from '../components/CoachSetup';
import ProposalCard from '../components/ProposalCard';
import CoachChanges from '../components/CoachChanges';
import { loadProposalNames, NO_NAMES, type ProposalNames, type ProposalStatus } from '../lib/api/aiProposals';
import type { ProposalFrame } from '../lib/api/aiCoach';
import { errorMessage } from '../utils/errorMessage';
import { useFeatures } from '../hooks/useFeatures';
import { isEnabled } from '../lib/api/planFeatures';
import { GLASS, SCRIM } from '../components/ui/glass';

/**
 * The member assistant.
 *
 * This route used to be a dead end. It rendered "The chatbot is now available
 * as a floating button at the **bottom-left** of every screen" — it is on the
 * bottom right — and then redirected to Home after 1.5 seconds. Settings →
 * Help → "Ask the in-app assistant" pointed straight at it, so the one
 * signposted route to help bounced you back where you started.
 *
 * It is now the assistant itself, and it knows who is asking: membership,
 * expiry, check-in code, next session and this month's visits come from the
 * same service Home uses. Everything personal is real or explicitly unknown —
 * a failed load says so rather than answering about a membership it cannot see.
 *
 * ## The conversation survives the app now (0046)
 *
 * It used to live in `useState` and nothing else, so reloading, switching tabs
 * or backgrounding the app threw the whole exchange away. Threads are rows now,
 * owned by the profile and readable only by it.
 *
 * Three things are deliberate about how that works:
 *
 *  - **The row is created on the first send, not on open.** Opening the
 *    assistant and changing your mind should not leave an empty thread in your
 *    history for you to tidy up later.
 *  - **The greeting is never stored.** It is generated from context each time,
 *    so improving its wording does not rewrite what past conversations look
 *    like, and a saved thread does not open with a stale "you have 3 days left".
 *  - **A save that fails says so.** The chat keeps working from memory, but the
 *    banner tells you it is not being kept — degrading silently would mean
 *    losing a conversation the member believed was saved.
 */

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  /** Who wrote a bot bubble. Only 'coach' text is ever sent back to the coach. */
  source?: 'rules' | 'coach';
}

const GREETING_ID = 'greeting';
// The coach is sent WELCOME_QUESTION, but the member never typed it: on screen and in
// the saved thread their row is the fixed note SETUP_DONE, and the thread has a fixed title.
const WELCOME_QUESTION = "I've finished setting up. Give me a short welcome and one first step.";
const SETUP_DONE = 'Setup finished';
const SETUP_TITLE = 'Coach setup';
// The coach's reply when it proposed a change and said nothing else (0145).
const PROPOSAL_ONLY = "Here's a suggestion — nothing changes until you tap Apply.";
type SendOptions = {
  rulesOnly?: boolean; note?: string;
  /** What the member's row says, when it is not what the coach is sent. */
  displayAs?: string;
  /** A fixed thread title instead of one made from the question. */
  title?: string;
  /** Skip the rules: this question is the coach's alone, so no keyword can answer it. */
  coachOnly?: boolean;
};

/**
 * The assistant is an entitlement (`ai_model`, 0049), so the route locks and
 * explains rather than disappearing: Today's "Ask the assistant" and the More sheet
 * link here, and a member without it lands on the reason instead of a blank
 * screen. (The floating chathead that used to open this is gone — Nocturne.)
 */
export default function ChatbotPage() {
  return (
    <FeatureLock feature="ai_model">
      <Assistant />
    </FeatureLock>
  );
}

function Assistant() {
  const [ctx, setCtx] = useState<AssistantContext>(EMPTY_CONTEXT);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // The model call is awaited, so `messages` inside that closure would be stale
  // by the time it resolves. The ref always reads current.
  const messagesRef = useRef<Message[]>([]);
  const { features } = useFeatures();
  const mayUseModel = isEnabled(features, 'ai_model');
  const [coach, setCoach] = useState<CoachStatus | null>(null);
  // `send` does its work inside a setTimeout closure, which would read a stale
  // `coach` right after consent. The ref is set in the same place as the state.
  const coachRef = useRef<CoachStatus | null>(null);
  const updateCoach = useCallback((next: CoachStatus | null | ((c: CoachStatus | null) => CoachStatus | null)) => {
    const value = typeof next === 'function' ? next(coachRef.current) : next;
    coachRef.current = value;
    setCoach(value);
  }, []);
  const [askConsent, setAskConsent] = useState(false);
  // The question waiting for the consent answer, if the sheet opened on a send.
  const pending = useRef<string | null>(null);
  // The guided setup (0144). Per visit only, so component state, never storage.
  const [setupSkipped, setSetupSkipped] = useState(false);
  const [redoSetup, setRedoSetup] = useState(false);
  const [setupFailed, setSetupFailed] = useState(false);
  // The coach's proposals (0145), under the reply they arrived with. Keyed by that
  // message's id and never part of `messages`, so they are never sent back as history.
  const [cards, setCards] = useState<Record<string, ProposalFrame[]>>({});
  // What was tapped this visit, by proposal id — one truth for the chat and the sheet.
  const [decided, setDecided] = useState<Record<string, ProposalStatus>>({});
  const [changesOpen, setChangesOpen] = useState(false);
  const [names, setNames] = useState<ProposalNames>(NO_NAMES);
  const memberIdRef = useRef<string | null>(null);
  const refreshNames = useCallback(() => {
    void loadProposalNames(memberIdRef.current).then(setNames);
  }, []);
  const onDecided = useCallback((id: string, next: ProposalStatus) => {
    setDecided((d) => ({ ...d, [id]: next }));
    // An applied or undone routine changes the names a card reads.
    refreshNames();
  }, [refreshNames]);
  // The changes sheet read the server: its statuses replace what was tapped here.
  const onProposalsLoaded = useCallback((rows: { id: string; status: ProposalStatus }[]) => {
    setDecided((d) => ({ ...d, ...Object.fromEntries(rows.map((p) => [p.id, p.status])) }));
  }, []);

  // ── Persistence ───────────────────────────────────────────────────────────
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  const greeting = useCallback(
    (c: AssistantContext): Message => ({
      id: GREETING_ID,
      sender: 'bot',
      source: 'rules',
      text: c.firstName
        ? `Hi ${c.firstName}. Ask me about your membership, your check-in code, booking a session, prices or opening hours.`
        : 'Ask me about your membership, your check-in code, booking a session, prices or opening hours.',
    }),
    []
  );

  const refreshList = useCallback(async () => {
    try {
      setConversations(await listConversations());
    } catch {
      // The list failing is not worth blocking the chat over — the thread the
      // member is in still saves. The drawer says so when it is opened.
      setConversations([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Personalise the greeting only once the data is in, so it never opens
      // with a name-shaped gap.
      const [home, plans, gym, saved, points] = await Promise.all([
        getCurrentMemberId()
          .then((id) => (id ? getMemberHome(id) : null))
          .catch(() => null),
        listPlans()
          .then((rows) => rows.filter((p) => p.is_active))
          .catch(() => []),
        // Hours, address and contact used to be hardcoded in the answers, so a
        // change at the desk never reached the member. A failure here leaves
        // `gym` null and those answers say the value is not on record.
        getGymSettings().catch(() => null),
        // The member's own plan (0047), so "what is my workout today" is
        // answered from their row rather than guessed. Needs the member id, so
        // it is resolved after it — a failure here just leaves `plan` null.
        getCurrentMemberId()
          .then((id) => (id ? getCurrentPlan(id) : null))
          .catch(() => null),
        // CORE Points (0051). Null on failure, and null for a plan that cannot
        // earn — the answer then explains the plan instead of showing a zero
        // that would read as "you have earned nothing".
        getCurrentMemberId()
          .then((id) => (id ? getBalance(id) : null))
          .catch(() => null),
      ]);
      if (cancelled) return;

      const next: AssistantContext = home
        ? {
            firstName: home.firstName,
            planName: home.planName,
            expiryDate: home.expiryDate,
            daysLeft: home.daysLeft,
            neverExpires: home.neverExpires,
            memberId: home.memberId,
            nextBooking: home.nextBooking
              ? {
                  title: home.nextBooking.title,
                  startsAt: home.nextBooking.startsAt ?? null,
                  subtitle: home.nextBooking.subtitle,
                }
              : null,
            checkInsThisMonth: home.checkInsThisMonth,
            plans,
            gym: toGymFacts(gym),
            plan: saved?.spec ?? null,
            access: home.access,
            points,
          }
        : { ...EMPTY_CONTEXT, plans, gym: toGymFacts(gym), plan: saved?.spec ?? null, points };

      setCtx(next);
      setMessages([greeting(next)]);
      memberIdRef.current = home?.memberId ?? await getCurrentMemberId().catch(() => null);
      if (!cancelled) refreshNames();
      refreshList();
      getCoachStatus().then((s) => { if (!cancelled) updateCoach(s); });
    })();
    return () => { cancelled = true; };
  }, [greeting, refreshList, updateCoach, refreshNames]);

  useEffect(() => {
    messagesRef.current = messages;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

  const stored = messages.filter((m) => m.id !== GREETING_ID);
  const setupOpen = !!coach?.allowed && coach.consent !== null && (
    redoSetup || (coach.onboarded === false && !setupSkipped && stored.length === 0));
  const showSuggestions = stored.length === 0 && !setupOpen;

  /**
   * Write both halves of the exchange.
   *
   * Sequential, not parallel: the two rows are ordered by `created_at`, and
   * firing them together can land the answer on the same millisecond as the
   * question, which reads back as the assistant replying before it was asked.
   */
  const persist = async (question: string, answer: string, source: 'rules' | 'coach', title?: string) => {
    let id = conversationId;
    if (!id) {
      id = await createConversation(title ?? titleFrom(question));
      setConversationId(id);
    }
    await appendMessage(id, 'user', question);
    await appendMessage(id, 'assistant', answer, source);
    await refreshList();
  };

  /**
   * `again` re-runs a question whose bubble is already on screen (the one that
   * opened the consent sheet): no second bubble is added, `rulesOnly` skips the
   * coach, and `note` is the banner to keep after the exchange is saved.
   */
  const send = (text: string, again?: SendOptions) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // What the member sees and what is saved as their row; the coach gets `trimmed`.
    const shown = again?.displayAs ?? trimmed;
    if (!again || again.displayAs) {
      setMessages((prev) => [...prev, { id: Date.now().toString(), text: shown, sender: 'user' }]);
      if (!again) setInput('');
    }
    setIsTyping(true);

    // The answer is computed synchronously — the delay is presentation, not
    // work. Keeping it means the reply does not appear before the question has
    // finished animating in.
    setTimeout(async () => {
      // Rules first, always. They own every fact about this gym — prices,
      // hours, your membership — so the model is never in a position to state
      // one. It only ever sees a question the table could not answer.
      let answer = again?.coachOnly ? RULE_FALLBACK : answerFor(trimmed, ctx);

      // Since 0059 the whole assistant is the paid feature, so this screen is
      // already behind `FeatureLock` and `mayUseModel` is true whenever it
      // renders. The check stays as a guard for the model call itself; the Edge
      // Function checks the same entitlement, because this is an optimisation
      // and not the boundary. (0049 had gated only the model — the comment that
      // said so outlived it.)
      // `coachRef`, not `coach`: this closure runs after a timeout, and right
      // after consent the state it captured is still the old one.
      const live = again?.rulesOnly ? null : coachRef.current;
      let source: 'rules' | 'coach' = 'rules';
      if (isRuleFallback(answer) && mayUseModel && live?.allowed) {
        if (live.consent === null) {
          // First time: ask before anything leaves the phone. The question is sent
          // once they answer (see onConsent).
          pending.current = trimmed;
          setAskConsent(true);
          setIsTyping(false);
          return;
        }
        // Only what the coach itself said, and the questions it answered: the rules'
        // answers carry personal data (plan, check-in code, points) that consent
        // never covered. The current question goes separately, so it is not here.
        const prior = messagesRef.current.filter((m) => m.id !== GREETING_ID);
        const history: { role: 'user' | 'assistant'; content: string }[] = [];
        prior.forEach((m, i) => {
          if (m.sender === 'bot' && m.source === 'coach' && m.text.trim() && prior[i - 1]?.sender === 'user') {
            history.push({ role: 'user', content: prior[i - 1].text }, { role: 'assistant', content: m.text });
          }
        });
        history.splice(0, Math.max(0, history.length - 10));
        const botId = `${Date.now()}c`;
        let streamed = '';
        let proposed = 0;
        setMessages((prev) => [...prev, { id: botId, text: '', sender: 'bot', source: 'coach' }]);
        setIsTyping(false);
        const result = await askCoach(trimmed, history, (chunk) => {
          streamed += chunk;
          setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, text: streamed } : m)));
        }, (proposal) => {
          proposed += 1;
          setCards((c) => ({ ...c, [botId]: [...(c[botId] ?? []), proposal] }));
        });
        if ((result.ok && streamed.trim()) || proposed > 0) {
          // A reply that proposed a change is the coach's, even with no text or a
          // stream that broke after the proposal: its card sits under this reply.
          answer = streamed.trim() ? streamed : PROPOSAL_ONLY;
          source = 'coach';
          if (!streamed.trim()) setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, text: answer } : m)));
        } else {
          // The rules' answer stands, with the coach's reason under it when it has one.
          answer = result.ok ? answer : `${answer}\n\n${result.message}`;
          setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, text: answer, source: 'rules' } : m)));
        }
        updateCoach((c) => (c ? { ...c, used_today: c.used_today + (source === 'coach' ? 1 : 0) } : c));
        try { await persist(shown, answer, source, again?.title); setSaveError(again?.note ?? null); }
        catch (err) { setSaveError(errorMessage(err, 'This conversation is not being saved.')); }
        return;
      }
      if (isRuleFallback(answer) && mayUseModel && live && !live.allowed
          && (live.reason === 'daily_limit' || live.reason === 'monthly_limit')) {
        answer = live.reason === 'daily_limit'
          ? `${answer}\n\nYou have used today's ${live.daily_limit} messages with the coach. It opens again tomorrow.`
          : `${answer}\n\nThe coach has reached this gym's limit for the month.`;
      }

      setMessages((prev) => [...prev, { id: `${Date.now()}b`, text: answer, sender: 'bot', source: 'rules' }]);
      setIsTyping(false);
      try {
        await persist(shown, answer, source, again?.title);
        setSaveError(again?.note ?? null);
      } catch (err) {
        setSaveError(errorMessage(err, 'This conversation is not being saved.'));
      }
    }, 600);
  };

  const onConsent = async (yes: boolean) => {
    setAskConsent(false);
    const q = pending.current; pending.current = null;
    let note: string | undefined;
    let saved = true;
    try { await setCoachConsent(yes); updateCoach((c) => (c ? { ...c, consent: yes } : c)); }
    catch (err) { saved = false; note = errorMessage(err, 'Your choice was not saved.'); }
    if (!saved) setSaveError(note ?? null);
    // Always answer the waiting question, on its existing bubble. If the choice
    // could not be saved, the rules answer it and the banner says why.
    if (q) send(q, saved ? {} : { rulesOnly: true, note });
  };

  const onSetupDone = async (p: CoachProfile) => {
    setSetupFailed(false);
    try {
      await saveCoachProfile(p);
    } catch (err) {
      // The answers stay in the setup; Try again resends them.
      setSetupFailed(true);
      setSaveError(errorMessage(err, 'Your setup was not saved.'));
      return;
    }
    setSaveError(null);
    updateCoach((c) => (c ? { ...c, onboarded: true } : c));
    setRedoSetup(false);
    setSetupSkipped(true);
    if (p.has_injury) {
      setMessages((prev) => [...prev, { id: `${Date.now()}r`, text: REFERRAL, sender: 'bot', source: 'rules' }]);
    }
    send(WELCOME_QUESTION, { displayAs: SETUP_DONE, title: SETUP_TITLE, coachOnly: true });
  };

  const startNew = () => {
    setConversationId(null);
    setMessages([greeting(ctx)]);
    setSaveError(null);
    setHistoryOpen(false);
  };

  const openThread = async (id: string) => {
    setHistoryOpen(false);
    setLoadingThread(true);
    try {
      const rows = await listMessages(id);
      setConversationId(id);
      // No greeting on a reopened thread: it would claim to have been said at
      // the top of a conversation that never contained it.
      setMessages(rows.map((r) => ({ id: r.id, text: r.body, sender: r.role === 'user' ? 'user' : 'bot', source: r.role === 'user' ? undefined : (r.source ?? 'rules') })));
      setSaveError(null);
    } catch (err) {
      setSaveError(errorMessage(err, 'Could not open that conversation.'));
    } finally {
      setLoadingThread(false);
    }
  };

  const removeThread = async (id: string) => {
    try {
      await deleteConversation(id);
      setConfirmDelete(null);
      if (id === conversationId) startNew();
      await refreshList();
    } catch (err) {
      setSaveError(errorMessage(err, 'Could not delete that conversation.'));
    }
  };

  return (
    // flex-1 against Layout's page column; min-h-0 is what lets the transcript
    // scroll rather than stretching the page and stranding the composer.
    <div className="flex-1 min-h-0 flex flex-col relative">
      <div className="flex-shrink-0" style={{ paddingBottom: 10 }}>
        {/* Rule-based first, and says so: it answers from a fixed set of topics
            plus your own membership data — calling that "AI" oversells it. */}
        <PageTitle back title="Assistant"
          subtitle={coach?.allowed ? 'Gym answers from the app · training help from the AI coach' : 'Answers about your account and the gym'} />
        <div className="flex flex-wrap items-center" style={{ columnGap: 18, rowGap: 0, marginTop: 10, fontSize: 13 }}>
          <button onClick={startNew} style={{ height: 32, color: 'var(--color-secondary)' }}>New chat</button>
          <button onClick={() => { setConfirmDelete(null); setHistoryOpen(true); }}
            style={{ height: 32, color: 'var(--color-primary-300)' }}>
            Saved chats{conversations.length > 0 ? ` · ${conversations.length}` : ''}
          </button>
          {coach?.allowed && coach.onboarded && !setupOpen && (
            <button onClick={() => { setSetupFailed(false); setRedoSetup(true); }}
              style={{ height: 32, color: 'var(--color-text-secondary)' }}>Redo my setup</button>
          )}
          {coach?.allowed && (
            <button onClick={() => setChangesOpen(true)}
              style={{ height: 32, color: 'var(--color-primary-300)' }}>Changes from the coach</button>
          )}
          {coach?.allowed && (
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{coach.used_today} of {coach.daily_limit} coach messages today</span>
          )}
        </div>
        <div className="rule" style={{ marginTop: 8 }} />
      </div>

      {saveError && (
        // Named, not hidden. The chat still works from memory — the member just
        // needs to know it will not be here when they come back.
        <p role="alert" className="flex-shrink-0" style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 8, color: 'var(--color-secondary)' }}>
          {saveError}
        </p>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide flex flex-col" style={{ gap: 12, padding: '4px 0' }}>
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'user' && m.text === SETUP_DONE ? (
                // Not something the member said: a small note that setup ended.
                <p className="w-full text-center" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{m.text}</p>
              ) : m.sender === 'bot' ? (
                // The assistant's side is text on the page with a violet rule —
                // a reply to read, not a second card. A proposal the coach made in
                // this reply sits under it as the one card: something to decide.
                <div className="w-full flex flex-col items-start" style={{ gap: 10 }}>
                  {m.text && (
                    <div className="max-w-[88%]" style={{
                      paddingLeft: 12, fontSize: 13.5, lineHeight: 1.6, color: 'var(--color-text-secondary)',
                      borderLeft: '2px solid var(--color-primary)',
                    }}>
                      <RichText text={m.text} />
                    </div>
                  )}
                  {(cards[m.id] ?? []).map((p) => (
                    <ProposalCard key={p.id} id={p.id} kind={p.kind} summary={p.summary} payload={p.payload}
                      status={decided[p.id] ?? 'pending'} names={names} onStatus={onDecided} />
                  ))}
                </div>
              ) : (
                <div className="max-w-[80%]" style={{
                  padding: '9px 13px', fontSize: 13.5, lineHeight: 1.5, color: 'var(--color-text-primary)',
                  background: 'color-mix(in srgb, var(--color-primary) 16%, var(--color-surface))',
                  border: '1px solid var(--color-primary-800)',
                  borderRadius: '14px 14px 4px 14px',
                }}>
                  {m.text}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {(isTyping || loadingThread) && (
          <div className="flex" aria-label="Answering" style={{ gap: 5, padding: '6px 0 6px 14px', borderLeft: '2px solid var(--color-primary)' }}>
            {[0, 150, 300].map((d) => (
              <span key={d} className="rounded-full animate-bounce"
                style={{ width: 6, height: 6, background: 'var(--color-text-muted)', animationDelay: `${d}ms` }} />
            ))}
          </div>
        )}
        {setupOpen && (
          <CoachSetup
            failed={setupFailed}
            onDone={(p) => void onSetupDone(p)}
            onSkip={() => { setSetupSkipped(true); setRedoSetup(false); setSetupFailed(false); setSaveError(null); }}
          />
        )}
        <div ref={endRef} />
      </div>

      <div className="flex-shrink-0" style={{ paddingTop: 10, paddingBottom: 12 }}>
        {showSuggestions && (
          // Personal suggestions only appear when the data behind them loaded —
          // never a chip that leads to "I couldn't load that".
          <div className="flex overflow-x-auto scrollbar-hide" style={{ gap: 8, paddingBottom: 10 }}>
            {suggestionsFor(ctx).map((q) => (
              <Chip key={q} label={q} onClick={() => send(q)} />
            ))}
          </div>
        )}

        <div className="flex items-center" style={{ gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            aria-label="Your question"
            placeholder="Ask about your membership, booking…"
            className="field-input flex-1"
          />
          {/* Amber: sending is the next thing to do. */}
          <button
            onClick={() => send(input)}
            disabled={!input.trim()}
            aria-label="Send"
            className="grid place-items-center flex-none disabled:opacity-40"
            style={{
              width: 46, height: 46, borderRadius: 'var(--radius-btn)',
              color: 'var(--color-secondary)', border: '1px solid var(--color-secondary)',
              background: 'color-mix(in srgb, var(--color-secondary) 8%, transparent)',
            }}
          >
            <PaperPlaneRight size={18} />
          </button>
        </div>
      </div>

      {/* ── Saved conversations ──────────────────────────────────────────────
          Inside this page's own flex column with `absolute inset-0`, which is
          safe here because the panel is a sibling of the scrolling transcript
          rather than a child of it.

          The wrapper is always mounted and owns the only pointer-events
          declaration: an AnimatePresence child that is exiting keeps its LAST
          props, so putting `pointerEvents` on the child leaves an invisible
          click-eating layer over the whole screen once it has been opened. */}
      <div
        className="absolute inset-0 z-30"
        style={{ pointerEvents: historyOpen ? 'auto' : 'none' }}
        aria-hidden={!historyOpen}
      >
        <AnimatePresence>
          {historyOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setHistoryOpen(false)}
                className="absolute inset-0"
                style={SCRIM}
              />
              <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                role="dialog" aria-modal="true" aria-label="Saved conversations"
                className="absolute left-0 right-0 bottom-0 max-h-[75%] flex flex-col"
                style={{
                  ...GLASS,
                  borderBottom: 'none',
                  borderRadius: '16px 16px 0 0',
                  margin: '0 calc(var(--gutter) * -1)',
                }}
              >
                <div className="flex items-center flex-shrink-0" style={{ gap: 16, padding: '16px var(--gutter) 10px' }}>
                  <h2 className="flex-1" style={{ fontSize: 'var(--text-title)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Saved chats
                  </h2>
                  <button onClick={startNew} style={{ fontSize: 13, height: 36, color: 'var(--color-secondary)' }}>New chat</button>
                  <button onClick={() => setHistoryOpen(false)} style={{ fontSize: 13, height: 36, color: 'var(--color-text-secondary)' }}>
                    Close
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide" style={{ padding: '0 var(--gutter) 24px' }}>
                  {conversations.length === 0 && (
                    <p className="text-center" style={{ fontSize: 13, padding: '24px 0', color: 'var(--color-text-muted)' }}>
                      Nothing saved yet. Ask something and it will be kept here.
                    </p>
                  )}
                  {conversations.map((c, i) => {
                    const current = c.id === conversationId;
                    return (
                      <div key={c.id}>
                        <div className="flex items-center" style={{ gap: 10, padding: '10px 0' }}>
                          <button onClick={() => openThread(c.id)} className="flex-1 min-w-0 text-left">
                            <span className="block truncate" style={{ fontSize: 14.5, color: current ? 'var(--color-primary-300)' : 'var(--color-text-primary)' }}>
                              {c.title || 'New chat'}
                            </span>
                            <span className="block" style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-muted)' }}>
                              {current ? 'Open now · ' : ''}
                              {new Date(c.updatedAt).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                              })}
                            </span>
                          </button>

                          {/* Two taps to delete. One tap on a row in a list is far
                              too easy to hit by accident, and this is the one
                              control here that destroys something. */}
                          {confirmDelete === c.id ? (
                            <div className="flex flex-shrink-0" style={{ gap: 14, fontSize: 13 }}>
                              <button onClick={() => removeThread(c.id)} style={{ height: 36, color: 'var(--color-secondary)' }}>
                                Delete
                              </button>
                              <button onClick={() => setConfirmDelete(null)} style={{ height: 36, color: 'var(--color-text-secondary)' }}>
                                Keep
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(c.id)}
                              aria-label={`Delete ${c.title || 'this chat'}`}
                              className="grid place-items-center flex-shrink-0"
                              style={{ width: 40, height: 40, color: 'var(--color-text-muted)' }}
                            >
                              <Trash size={16} />
                            </button>
                          )}
                        </div>
                        {i < conversations.length - 1 && <div className="hair" />}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
      <CoachChanges open={changesOpen} onClose={() => setChangesOpen(false)}
        names={names} decided={decided} onStatus={onDecided} onLoaded={onProposalsLoaded} />
      <CoachConsent open={askConsent} onChoose={(yes) => void onConsent(yes)} />
    </div>
  );
}
