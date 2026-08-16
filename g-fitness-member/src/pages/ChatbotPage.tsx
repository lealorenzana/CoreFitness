import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Sparkles } from 'lucide-react';
import RichText from '../components/ui/RichText';
import { panelStyle } from '../components/ui/Card';
import { getCurrentMemberId } from '../services/bookingService';
import { getMemberHome } from '../services/memberHomeService';
import { listPlans } from '../lib/api/membershipPlans';
import {
  answerFor, suggestionsFor, EMPTY_CONTEXT, type AssistantContext,
} from '../data/memberAssistant';

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
 */

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
}

export default function ChatbotPage() {
  const navigate = useNavigate();
  const [ctx, setCtx] = useState<AssistantContext>(EMPTY_CONTEXT);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Personalise the greeting only once the data is in, so it never opens
      // with a name-shaped gap.
      const [home, plans] = await Promise.all([
        getCurrentMemberId()
          .then((id) => (id ? getMemberHome(id) : null))
          .catch(() => null),
        listPlans()
          .then((rows) => rows.filter((p) => p.is_active))
          .catch(() => []),
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
          }
        : { ...EMPTY_CONTEXT, plans };

      setCtx(next);
      setMessages([
        {
          id: 'greeting',
          text: next.firstName
            ? `Hi ${next.firstName}. Ask me about your membership, your check-in code, booking a session, prices or opening hours.`
            : 'Ask me about your membership, your check-in code, booking a session, prices or opening hours.',
          sender: 'bot',
        },
      ]);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { id: Date.now().toString(), text: trimmed, sender: 'user' }]);
    setInput('');
    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}b`, text: answerFor(trimmed, ctx), sender: 'bot' },
      ]);
      setIsTyping(false);
    }, 400 + Math.random() * 400);
  };

  const showSuggestions = messages.length <= 1;

  return (
    // flex-1 against Layout's page column; min-h-0 is what lets the transcript
    // scroll rather than stretching the page and stranding the composer.
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-3 flex-shrink-0 pb-3">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/member/home'))}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="display text-xl text-white leading-none">Assistant</h1>
          {/* Rule-based, and says so. It answers from a fixed set of topics
              plus your own membership data — calling that "AI" oversells it. */}
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Answers about your account and the gym
          </p>
        </div>
      </div>

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

        {isTyping && (
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
    </div>
  );
}
