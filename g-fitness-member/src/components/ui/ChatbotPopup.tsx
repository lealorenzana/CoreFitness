import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { listPlans } from '../../lib/api/membershipPlans';
import { getGymSettings } from '../../lib/api/settings';
import { getCurrentPlan } from '../../lib/api/workoutPlans';
import { getCurrentMemberId } from '../../services/bookingService';
import { getMyFeatures } from '../../lib/api/planFeatures';
import { planAccess } from '../../utils/planAccess';
import { getCurrentMembership } from '../../lib/api/memberships';
import RichText from './RichText';
import { GLASS, SCRIM } from './glass';
import { answerFor, EMPTY_CONTEXT, toGymFacts, type AssistantContext } from '../../data/memberAssistant';
import { ClockCounterClockwise, PaperPlaneRight, Sparkle, X } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

/**
 * The popup shares its answers with the full-screen assistant now. It used to
 * carry its own copy of `getBotResponse`, one of three in the codebase, and
 * they had already drifted — two of them quoted a price list that exists
 * nowhere in the database.
 *
 * It stays deliberately shallow: no membership lookup here, because this opens
 * over whatever page you were reading and shouldn't fire off queries to do it.
 * `answerFor` degrades honestly on an empty context — personal questions say
 * they can't see your details and point at the full assistant.
 */

/**
 * The chat bubble's orb, small: the same turning violet → amber ring and frosted
 * core (`.ai-orb` in index.css), so the window and the bubble that opened it are
 * visibly one thing. Module scope, never declared inside the render body.
 */
function MiniOrb({ size }: { size: number }) {
  return (
    <span aria-hidden className="ai-orb relative grid place-items-center rounded-full flex-shrink-0" style={{ width: size, height: size }}>
      <span className="ai-orb__ring absolute inset-0 rounded-full" />
      <span className="ai-orb__core absolute rounded-full" style={{ inset: Math.max(1.5, size / 27) }} />
      <Sparkle size={Math.round(size * 0.42)} weight="fill" className="relative"
        style={{ color: '#e9e3ff', filter: 'drop-shadow(0 0 5px rgba(196, 181, 253, 0.85))' }} />
    </span>
  );
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

interface ChatbotPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatbotPopup({ isOpen, onClose }: ChatbotPopupProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: "Hi! I'm your Core Fitness assistant. How can I help today?", sender: 'bot', timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Real plans, loaded once. A failed load leaves the list empty and the
  // pricing reply says so rather than inventing figures.
  const [ctx, setCtx] = useState<AssistantContext>(EMPTY_CONTEXT);
  useEffect(() => {
    let cancelled = false;
    // Plans AND gym settings: the hours, address and contact answers read from
    // `gym_settings` now, so the popup has to load it as well or those answers
    // would report "not on record" on this surface only.
    Promise.all([
      listPlans().then((rows) => rows.filter((p) => p.is_active)).catch(() => []),
      getGymSettings().catch(() => null),
      // The member's saved training plan (0047), so "what is my workout today"
      // answers from their own row here too. A failure leaves it null and the
      // answer points at the builder rather than inventing a week.
      getCurrentMemberId()
        .then((id) => (id ? getCurrentPlan(id) : null))
        .catch(() => null),
      // What the plan includes (0017 + 0049), so "what does my membership
      // cover" is answered the same here as on the membership card. This popup
      // stays deliberately shallow, but this is two cheap reads and it is the
      // difference between an honest answer and half of one.
      Promise.all([
        getCurrentMemberId().then((id) => (id ? getCurrentMembership(id) : null)).catch(() => null),
        getMyFeatures().catch(() => []),
      ])
        .then(([m, f]) => planAccess(m?.membership_plans, f))
        .catch(() => null),
    ]).then(([plans, gym, saved, access]) => {
      if (!cancelled) {
        setCtx((c) => ({
          ...c, plans, gym: toGymFacts(gym), plan: saved?.spec ?? null, access,
        }));
      }
    });
    return () => { cancelled = true; };
  }, []);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), text: input, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    const q = input;
    setInput('');
    setIsTyping(true);
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: answerFor(q, ctx),
        sender: 'bot',
        timestamp: new Date(),
      }]);
      setIsTyping(false);
    }, 850);
  };

  // Render into the phone-screen container so it covers the full viewport
  const portalTarget = document.getElementById('phone-screen');

  const content = (
    // The always-mounted wrapper owns the only pointer-events declaration. An
    // exiting AnimatePresence child keeps its last props, so `pointer-events-auto`
    // on the child left an invisible layer eating taps after closing (CLAUDE.md).
    <div className="absolute inset-0 z-[220]" style={{ pointerEvents: isOpen ? 'auto' : 'none' }} aria-hidden={!isOpen}>
    <AnimatePresence>
      {isOpen && (
        <div
          className="absolute inset-0 flex items-stretch justify-stretch"
          style={{ background: 'transparent' }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0"
            style={SCRIM}
            onClick={onClose}
          />

          {/*
            Grows out of the chat head, the way a Messenger bubble does.

            It used to fade up from the bottom **centre** while the bubble sat
            in the bottom-right — so the thing you tapped and the thing that
            appeared had no relationship, and closing it dropped the window
            somewhere the bubble wasn't.

            The trick is `transformOrigin: bottom right` plus starting at a
            near-zero scale: every point of the panel converges on the corner
            the head occupies, so it reads as the bubble unfolding rather than
            a dialog arriving. `exit` reverses it exactly, and the head fades
            back in underneath as it collapses.
          */}
          <motion.div
            initial={{ opacity: 0, scale: 0.12, borderRadius: 999 }}
            animate={{ opacity: 1, scale: 1, borderRadius: 0 }}
            exit={{ opacity: 0, scale: 0.12, borderRadius: 999 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320, mass: 0.8 }}
            /* Full screen, like Messenger's thread — a chat is the task while
               it is open, not a widget floating over another one. The 340px
               panel left most of the phone unused and cramped the answers,
               which are multi-line lists. */
            className="relative w-full h-full shadow-2xl flex flex-col overflow-hidden"
            style={{
              ...GLASS,
              border: 'none',
              // Still unfolds from the corner the bubble parks in, so the
              // link between what you tapped and what opened survives going
              // full-bleed.
              transformOrigin: 'bottom right',
            }}
          >
            {/* Header — glass, like the orb that opened it, with the orb's
                violet → amber gradient drawn as a hairline underneath. The flat
                violet slab it replaced did not belong to the bubble at all. */}
            <div className="relative px-4 py-3 flex items-center justify-between flex-shrink-0"
              style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))', background: 'rgba(8, 8, 14, 0.35)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <MiniOrb size={38} />
                <div className="min-w-0">
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>AI Assistant</p>
                  <p className="flex items-center gap-1.5 whitespace-nowrap" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    <span className="inline-block rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: 'linear-gradient(135deg, #a78bfa, #f59e0b)' }} />
                    From the gym's own info
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Saved conversations and model answers live on the full screen;
                    the bubble is the quick way in, not a second, lesser copy. */}
                <button
                  onClick={() => { onClose(); navigate('/member/chatbot'); }}
                  className="h-9 px-3 rounded-full flex items-center gap-1.5 noc-press"
                  style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-primary-300)', border: '1px solid rgba(196, 181, 253, 0.28)', background: 'rgba(124, 58, 237, 0.12)' }}
                >
                  <ClockCounterClockwise size={15} /> Saved chats
                </button>
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-full grid place-items-center noc-press"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid rgba(233, 233, 237, 0.14)' }}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
              <span aria-hidden className="absolute left-0 right-0 bottom-0" style={{
                height: 1, background: 'linear-gradient(90deg, transparent, #7c3aed 25%, #c4b5fd 55%, #f59e0b 85%, transparent)', opacity: 0.7,
              }} />
            </div>

            {/* Messages — a messenger thread: a time separator, the assistant's
                orb beside its bubbles, nothing beside your own. */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-hide">
              <p className="text-center py-1" style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                {messages[0]?.timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                {' · '}
                {messages[0]?.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </p>

              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2 items-end ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                  {msg.sender === 'bot' ? <MiniOrb size={26} /> : <span className="w-1 flex-shrink-0" />}
                  <div
                    className="max-w-[78%] px-3.5 py-2.5 space-y-0.5"
                    style={msg.sender === 'user' ? {
                      fontSize: 13.5, lineHeight: 1.55, color: '#fff',
                      // Your own messages carry the orb's violet, deepening
                      // toward its core — amber stays the app's action colour.
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                      boxShadow: '0 6px 18px -8px rgba(124, 58, 237, 0.8)',
                      borderRadius: '18px 18px 4px 18px',
                    } : {
                      fontSize: 13.5, lineHeight: 1.55, color: 'var(--color-text-secondary)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(196, 181, 253, 0.16)',
                      borderRadius: '18px 18px 18px 4px',
                    }}
                  >
                    {msg.sender === 'bot' ? <RichText text={msg.text} /> : msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex gap-2 items-end">
                  <MiniOrb size={26} />
                  <div className="px-3.5 py-3" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(196, 181, 253, 0.16)', borderRadius: '18px 18px 18px 4px' }}>
                    <div className="flex gap-1">
                      {[0, 150, 300].map(d => (
                        <div key={d} className="w-1.5 h-1.5 rounded-full animate-bounce"
                          style={{ background: '#c4b5fd', animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Quick suggestions */}
            {messages.length <= 1 && (
              <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
                {['Hours', 'Pricing', 'Trainers', 'Book a class'].map(q => (
                  <button key={q} onClick={() => { setInput(q); }}
                    className="px-3 py-1.5 rounded-full noc-press"
                    style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-primary-300)', background: 'rgba(124, 58, 237, 0.12)', border: '1px solid rgba(196, 181, 253, 0.26)' }}>
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="p-3 flex-shrink-0" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))', borderTop: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(8, 8, 14, 0.35)' }}>
              <div className="flex gap-2 items-center">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Ask me anything…"
                  aria-label="Your question"
                  className="field-input flex-1"
                  style={{ borderRadius: 999, background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(196, 181, 253, 0.2)' }}
                />
                {/* The orb's ring, as the send button: the one control here that
                    does something, in the gradient that means "assistant". */}
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="grid place-items-center rounded-full flex-shrink-0 disabled:opacity-40 noc-press"
                  style={{
                    width: 46, height: 46,
                    background: 'conic-gradient(from 210deg, #7c3aed, #c4b5fd, #f59e0b, #7c3aed)',
                    boxShadow: '0 6px 18px -6px rgba(124, 58, 237, 0.75)',
                    color: '#fff',
                  }}
                  aria-label="Send"
                >
                  <PaperPlaneRight size={18} weight="fill" />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </div>
  );

  // Portal into the phone-screen container for proper absolute positioning
  if (portalTarget) {
    return createPortal(content, portalTarget);
  }
  return content;
}
