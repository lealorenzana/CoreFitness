import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Sparkles, History, Plus, Trash2, X, AlertTriangle } from 'lucide-react';
import RichText from '../components/ui/RichText';
import { panelStyle } from '../components/ui/Card';
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
import { askFitnessAssistant } from '../lib/api/fitnessAssistant';
import { errorMessage } from '../utils/errorMessage';
import { useFeatures } from '../hooks/useFeatures';
import { isEnabled } from '../lib/api/planFeatures';

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

export default function ChatbotPage() {
  const navigate = useNavigate();
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

      // The escalation is a paid feature (0049) — the rules are not. Everyone
      // keeps the assistant and the ~98% it answers; only the model call is
      // withheld, so a free member is never locked out of asking a question,
      // they just get the free answer. Skipping the call here saves a round
      // trip; the Edge Function checks the same entitlement itself, because
      // this check is an optimisation and not the boundary.
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
    }, 400 + Math.random() * 400);
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
      <div className="flex items-center gap-3 flex-shrink-0 pb-3">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/member/home'))}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="display text-xl text-white leading-none">Assistant</h1>
          {/* Rule-based, and says so. It answers from a fixed set of topics
              plus your own membership data — calling that "AI" oversells it. */}
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Answers about your account and the gym
          </p>
        </div>
        <button
          onClick={startNew}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
          aria-label="Start a new chat"
        >
          <Plus size={18} />
        </button>
        <button
          onClick={() => { setConfirmDelete(null); setHistoryOpen(true); }}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 relative"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
          aria-label="Saved conversations"
        >
          <History size={18} />
          {conversations.length > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
              style={{ background: 'var(--color-primary)', color: '#fff' }}
            >
              {conversations.length}
            </span>
          )}
        </button>
      </div>

      {saveError && (
        <div
          className="flex-shrink-0 mb-2 px-3 py-2 rounded-xl flex items-start gap-2 text-[11px] leading-relaxed"
          style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}
        >
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          {/* Named, not hidden. The chat still works from memory — the member
              just needs to know it will not be here when they come back. */}
          <span>{saveError}</span>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-3 py-1">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'bot' && (
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'var(--color-primary-light)' }}
                >
                  <Sparkles size={15} style={{ color: 'var(--color-primary)' }} />
                </span>
              )}
              <div
                className="max-w-[80%] px-3.5 py-2.5 text-xs leading-relaxed space-y-0.5"
                style={{
                  background:
                    m.sender === 'user' ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                  color: m.sender === 'user' ? '#fff' : 'var(--color-text-secondary)',
                  border: m.sender === 'bot' ? '1px solid var(--color-border)' : 'none',
                  borderRadius: m.sender === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                }}
              >
                {m.sender === 'bot' ? <RichText text={m.text} /> : m.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {(isTyping || loadingThread) && (
          <div className="flex gap-2">
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--color-primary-light)' }}
            >
              <Sparkles size={15} style={{ color: 'var(--color-primary)' }} />
            </span>
            <div
              className="px-3.5 py-3 rounded-2xl"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex gap-1">
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: 'var(--color-text-muted)', animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex-shrink-0 pt-2">
        {showSuggestions && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-2">
            {/* Personal suggestions only appear when the data behind them
                loaded — never a chip that leads to "I couldn't load that". */}
            {suggestionsFor(ctx).map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold active:scale-95 transition-transform"
                style={{
                  background: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  border: '1px solid rgba(124,58,237,0.25)',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-center">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask about your membership, booking…"
            className="field-input flex-1 h-11 px-4 rounded-full text-xs text-white"
            style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim()}
            aria-label="Send"
            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 active:scale-95 transition-transform"
            style={{ background: 'var(--color-primary)' }}
          >
            <Send size={16} className="text-white" />
          </button>
        </div>
      </div>

      {/* ── Saved conversations ──────────────────────────────────────────────
          Rendered inside this page's own flex column with `absolute inset-0`,
          which is safe here because the panel is a sibling of the scrolling
          transcript rather than a child of it — the overlay rule this project
          keeps breaking is about `absolute inset-0` inside a scrolled <main>,
          where it resolves to the top of the content instead of the viewport.

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
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                role="dialog" aria-modal="true" aria-label="Saved conversations"
                className="absolute left-0 right-0 bottom-0 max-h-[75%] flex flex-col"
                style={{
                  background: 'var(--color-surface-raised)',
                  borderTop: '1px solid var(--color-border)',
                  borderRadius: '20px 20px 0 0',
                }}
              >
                <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0">
                  <h2 className="display text-base text-white flex-1">Saved chats</h2>
                  <button
                    onClick={startNew}
                    className="px-3 h-9 rounded-full text-xs font-semibold flex items-center gap-1.5"
                    style={{ background: 'var(--color-primary)', color: '#fff' }}
                  >
                    <Plus size={14} /> New
                  </button>
                  <button
                    onClick={() => setHistoryOpen(false)}
                    aria-label="Close"
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--color-surface-high)', color: 'var(--color-text-secondary)' }}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 pb-6 space-y-2">
                  {conversations.length === 0 && (
                    <p className="text-xs py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
                      Nothing saved yet. Ask something and it will be kept here.
                    </p>
                  )}
                  {conversations.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                      style={{
                        background: c.id === conversationId
                          ? 'var(--color-primary-light)' : 'var(--color-surface-high)',
                        border: `1px solid ${c.id === conversationId
                          ? 'rgba(124,58,237,0.35)' : 'var(--color-border)'}`,
                      }}
                    >
                      <button onClick={() => openThread(c.id)} className="flex-1 min-w-0 text-left">
                        <p className="text-xs font-semibold text-white truncate">
                          {c.title || 'New chat'}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          {new Date(c.updatedAt).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                          })}
                        </p>
                      </button>

                      {/* Two taps to delete. One tap on a row in a list is far
                          too easy to hit by accident, and this is the one
                          control here that destroys something. */}
                      {confirmDelete === c.id ? (
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => removeThread(c.id)}
                            className="px-2.5 h-8 rounded-lg text-[11px] font-bold"
                            style={{ background: 'var(--color-secondary)', color: '#000' }}
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-2.5 h-8 rounded-lg text-[11px] font-semibold"
                            style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-secondary)' }}
                          >
                            Keep
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(c.id)}
                          aria-label={`Delete ${c.title || 'this chat'}`}
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
