import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { listPlans } from '../../lib/api/membershipPlans';
import { getGymSettings } from '../../lib/api/settings';
import RichText from './RichText';
import { answerFor, EMPTY_CONTEXT, toGymFacts, type AssistantContext } from '../../data/memberAssistant';
import { X, Send, Bot } from 'lucide-react';

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
    ]).then(([plans, gym]) => {
      if (!cancelled) setCtx((c) => ({ ...c, plans, gym: toGymFacts(gym) }));
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
    }, 700 + Math.random() * 500);
  };

  // Render into the phone-screen container so it covers the full viewport
  const portalTarget = document.getElementById('phone-screen');

  const content = (
    <AnimatePresence>
      {isOpen && (
        <div
          className="absolute inset-0 z-[220] pointer-events-auto flex items-stretch justify-stretch"
          style={{ background: 'transparent' }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
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
              background: 'var(--color-surface)',
              // Still unfolds from the corner the bubble parks in, so the
              // link between what you tapped and what opened survives going
              // full-bleed.
              transformOrigin: 'bottom right',
            }}
          >
            {/* Header */}
            <div
              className="px-4 py-3 flex items-center justify-between flex-shrink-0"
              style={{ background: 'var(--color-primary)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.15)' }}>
                  <Bot size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">AI Assistant</p>
                  <p className="text-white/60 text-xs flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--color-secondary)' }} />
                    Online
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.9)' }}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Messages.
                Laid out like a real messenger thread rather than a form log:
                a centred time separator above the first message, the bot's
                avatar tucked beside its bubble, and no avatar at all on your
                own side — which is what makes a thread read as a conversation
                with someone rather than two columns of boxes. */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
              <p
                className="text-center text-xs uppercase tracking-wider py-1"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {messages[0]?.timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                {' · '}
                {messages[0]?.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </p>

              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2 items-end ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                  {/* Only the bot gets a face. Messenger doesn't show yours
                      next to your own messages, and neither should this. */}
                  {msg.sender === 'bot' ? (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--color-primary-light)' }}
                    >
                      <Bot size={13} style={{ color: 'var(--color-primary)' }} />
                    </div>
                  ) : (
                    <span className="w-1 flex-shrink-0" />
                  )}
                  <div
                    className="max-w-[78%] px-3 py-2.5 text-xs leading-relaxed space-y-0.5"
                    style={{
                      // Violet for your own messages, the way Messenger uses
                      // its brand blue — amber stays the app's action colour.
                      background: msg.sender === 'user' ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                      color: msg.sender === 'user' ? '#fff' : 'var(--color-text-secondary)',
                      border: msg.sender === 'bot' ? '1px solid var(--color-border)' : 'none',
                      // Messenger's shape: fully round except the one corner
                      // nearest its sender, which acts as the tail.
                      borderRadius: msg.sender === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    }}
                  >
                    {msg.sender === 'bot' ? <RichText text={msg.text} /> : msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--color-primary-light)' }}>
                    <Bot size={13} style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <div className="px-3 py-2.5 rounded-2xl"
                    style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                    <div className="flex gap-1">
                      {[0, 150, 300].map(d => (
                        <div key={d} className="w-1.5 h-1.5 rounded-full animate-bounce"
                          style={{ background: 'var(--color-text-muted)', animationDelay: `${d}ms` }} />
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
                    className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                    style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid rgba(124,58,237,0.25)' }}>
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--color-border)' }}>
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Ask me anything…"
                  className="field-input flex-1 px-4 py-2.5 rounded-full text-xs text-white placeholder-gray-500"
                  style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40 transition-colors"
                  style={{ background: 'var(--color-secondary)' }}
                  aria-label="Send"
                >
                  <Send size={15} className="text-black" />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  // Portal into the phone-screen container for proper absolute positioning
  if (portalTarget) {
    return createPortal(content, portalTarget);
  }
  return content;
}
