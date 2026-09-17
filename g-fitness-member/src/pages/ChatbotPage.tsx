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
  answerFor, suggestionsFor, EMPTY_CONTEXT, toGymFacts, isRuleFallback,
  type AssistantContext,
} from '../data/memberAssistant';
import {
  listConversations, listMessages, createConversation, appendMessage,
  deleteConversation, titleFrom, type Conversation,
} from '../lib/api/assistantChats';
import FeatureLock from '../components/ui/FeatureLock';
import { askFitnessAssistant } from '../lib/api/fitnessAssistant';
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
}

const GREETING_ID = 'greeting';

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
      refreshList();
    })();
    return () => { cancelled = true; };
  }, [greeting, refreshList]);

  useEffect(() => {
    messagesRef.current = messages;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

  const stored = messages.filter((m) => m.id !== GREETING_ID);
  const showSuggestions = stored.length === 0;

  /**
   * Write both halves of the exchange.
   *
   * Sequential, not parallel: the two rows are ordered by `created_at`, and
   * firing them together can land the answer on the same millisecond as the
   * question, which reads back as the assistant replying before it was asked.
   */
  const persist = async (question: string, answer: string) => {
    let id = conversationId;
    if (!id) {
      id = await createConversation(titleFrom(question));
      setConversationId(id);
    }
    await appendMessage(id, 'user', question);
    await appendMessage(id, 'assistant', answer);
    await refreshList();
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { id: Date.now().toString(), text: trimmed, sender: 'user' }]);
    setInput('');
    setIsTyping(true);

    // The answer is computed synchronously — the delay is presentation, not
    // work. Keeping it means the reply does not appear before the question has
    // finished animating in.
    setTimeout(async () => {
      // Rules first, always. They own every fact about this gym — prices,
      // hours, your membership — so the model is never in a position to state
      // one. It only ever sees a question the table could not answer.
      let answer = answerFor(trimmed, ctx);

      // Since 0059 the whole assistant is the paid feature, so this screen is
      // already behind `FeatureLock` and `mayUseModel` is true whenever it
      // renders. The check stays as a guard for the model call itself; the Edge
      // Function checks the same entitlement, because this is an optimisation
      // and not the boundary. (0049 had gated only the model — the comment that
      // said so outlived it.)
      if (isRuleFallback(answer) && mayUseModel) {
        // The last few turns, so "and for legs?" still makes sense. The typing
        // indicator deliberately stays up across this: the member is waiting on
        // a real request, and hiding it would look like the app had stopped.
        const history = messagesRef.current
          .filter((m) => m.id !== GREETING_ID)
          .slice(-6)
          .map((m) => ({ role: m.sender === 'user' ? ('user' as const) : ('assistant' as const), content: m.text }));
        const fromModel = await askFitnessAssistant(trimmed, history);
        // null covers not-configured, offline, rate-limited and timed out. In
        // every one of them the member gets the message they got before this
        // existed, which is why adding this cannot make the assistant worse.
        if (fromModel) answer = fromModel;
      }

      setMessages((prev) => [...prev, { id: `${Date.now()}b`, text: answer, sender: 'bot' }]);
      setIsTyping(false);
      try {
        await persist(trimmed, answer);
        setSaveError(null);
      } catch (err) {
        setSaveError(errorMessage(err, 'This conversation is not being saved.'));
      }
    }, 600);
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
      setMessages(rows.map((r) => ({ id: r.id, text: r.body, sender: r.role === 'user' ? 'user' : 'bot' })));
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
        <PageTitle back title="Assistant" subtitle="Answers about your account and the gym" />
        <div className="flex items-center" style={{ gap: 18, marginTop: 10, fontSize: 13 }}>
          <button onClick={startNew} style={{ height: 32, color: 'var(--color-secondary)' }}>New chat</button>
          <button onClick={() => { setConfirmDelete(null); setHistoryOpen(true); }}
            style={{ height: 32, color: 'var(--color-primary-300)' }}>
            Saved chats{conversations.length > 0 ? ` · ${conversations.length}` : ''}
          </button>
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
              {m.sender === 'bot' ? (
                // The assistant's side is text on the page with a violet rule —
                // a reply to read, not a second card.
                <div className="max-w-[88%]" style={{
                  paddingLeft: 12, fontSize: 13.5, lineHeight: 1.6, color: 'var(--color-text-secondary)',
                  borderLeft: '2px solid var(--color-primary)',
                }}>
                  <RichText text={m.text} />
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
    </div>
  );
}
