import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Bot } from 'lucide-react';
import { panelStyle } from '../../components/ui/Card';
import RichText from '../../components/ui/RichText';
import { TRAINER_CHATBOT_RESPONSES } from '../../data/trainerChatbot';

/**
 * The trainer's assistant.
 *
 * Three things were wrong with this screen.
 *
 * **It didn't fill the phone.** The root was `h-full` inside a wrapper with no
 * height of its own, so it collapsed to its content: the composer sat halfway
 * up the screen with several hundred pixels of bare background beneath it. The
 * wrapper in TrainerLayout is now a `min-h-full` flex column and this page is
 * `flex-1`, so the message list takes the slack and the composer sits on the
 * dock where a composer belongs.
 *
 * **It rendered markdown as literal asterisks.** Every entry in
 * `TRAINER_CHATBOT_RESPONSES` opens with a `**Heading:**`, and the bubble
 * printed the stars. `renderRich` below handles the two marks the data actually
 * uses — `**bold**` and `•` bullets — rather than pulling in a markdown parser
 * for a file we control.
 *
 * **It called itself AI.** It is a keyword lookup over a fixed table of
 * answers: no model, no inference, and it cannot answer anything outside the
 * list. Naming it "AI Training Assistant" and having it open with "I'm your AI
 * training assistant" oversells it to the one person who will notice fastest —
 * the trainer using it every day. It now says what it is, and the empty-input
 * fallback offers the topics it genuinely covers.
 */

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

const GREETING =
  "I'm the training assistant. I answer from a set of prepared guides on member management, workout planning, scheduling, bookings and feedback. Ask me about any of those, or tap a question below.";

const QUICK_ASKS = [
  'How do I create a workout plan?',
  'Availability',
  'Member progress',
  'Booking management',
];

export default function TrainerChatbot() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: GREETING, sender: 'bot', timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

  const getBotResponse = (userMessage: string): string => {
    const lower = userMessage.toLowerCase();
    for (const [key, response] of Object.entries(TRAINER_CHATBOT_RESPONSES)) {
      if (lower.includes(key)) return response;
    }
    // Names the topics it can actually answer instead of "I didn't understand",
    // which leaves the trainer guessing at the vocabulary.
    return "I don't have an answer for that one. I can help with:\n\n• Members and assignments\n• Workout plans and exercises\n• Schedule and availability\n• Classes and bookings\n• Feedback, evaluations and recommendations\n\nTry one of those words.";
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), text: trimmed, sender: 'user', timestamp: new Date() },
    ]);
    setInput('');
    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: getBotResponse(trimmed),
          sender: 'bot',
          timestamp: new Date(),
        },
      ]);
      setIsTyping(false);
    }, 500 + Math.random() * 500);
  };

  return (
    // flex-1 against TrainerLayout's min-h-full column. min-h-0 is what lets
    // the message list scroll instead of stretching the whole page.
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-3 flex-shrink-0 pb-3">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/trainer/home'))}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ ...panelStyle, color: 'var(--color-text-secondary)' }}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="display text-xl text-white leading-none">Assistant</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Prepared coaching answers — not a live AI
          </p>
        </div>
      </div>

      {/* Messages */}
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
                  <Bot size={15} style={{ color: 'var(--color-primary)' }} />
                </span>
              )}
              <div
                className="max-w-[80%] px-3.5 py-2.5 text-xs leading-relaxed space-y-0.5"
                style={{
                  background:
                    m.sender === 'user' ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                  color: m.sender === 'user' ? '#fff' : 'var(--color-text-secondary)',
                  border: m.sender === 'bot' ? '1px solid var(--color-border)' : 'none',
                  borderRadius:
                    m.sender === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
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
              <Bot size={15} style={{ color: 'var(--color-primary)' }} />
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

      {/* Composer. Tapping a suggestion sends it rather than filling the box —
          one tap to an answer instead of two. */}
      <div className="flex-shrink-0 pt-2">
        {messages.length <= 1 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-2">
            {QUICK_ASKS.map((q) => (
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
            placeholder="Ask about members, plans, bookings…"
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
