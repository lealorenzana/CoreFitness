import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Bot, User, Sparkles } from 'lucide-react';
import { buildChatbotResponses, buildGreeting, FALLBACK_RESPONSE } from '../../data/chatbot';
import { loadChatbotContext, EMPTY_CONTEXT, type ChatbotContext } from '../../services/chatbotService';
import type { ChatMessage } from '../../types';

const PRIMARY        = 'var(--color-primary)';
const SECONDARY      = 'var(--color-secondary)';
const SURFACE        = 'var(--color-surface)';
const SURFACE_RAISED = 'var(--color-surface-raised)';
const BORDER         = 'var(--color-border)';
const TEXT_MUTED     = 'var(--color-text-muted)';

export default function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [language, setLanguage] = useState<'en' | 'fil'>('en');
  const endRef = useRef<HTMLDivElement>(null);

  /**
   * The assistant's answers come from the database, so it cannot speak until
   * they have loaded.
   *
   * `null` means "not loaded yet" and is deliberately distinct from
   * `EMPTY_CONTEXT` ("loaded, and there is nothing there"). Answering from an
   * unloaded context would report every section as unconfigured — the assistant
   * would tell an admin their gym has no plans and no trainers purely because a
   * fetch was still in flight.
   */
  const [ctx, setCtx] = useState<ChatbotContext | null>(null);

  useEffect(() => {
    if (!isOpen || ctx) return;
    loadChatbotContext().then(setCtx).catch(() => setCtx(EMPTY_CONTEXT));
  }, [isOpen, ctx]);

  const rules = useMemo(() => (ctx ? buildChatbotResponses(ctx) : []), [ctx]);

  // Re-rendered rather than stored, so switching language rewrites the opening
  // line too — it used to be a fixed English string in the initial state.
  const greeting = ctx ? buildGreeting(ctx)[language] : null;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping, greeting]);

  const handleSend = () => {
    if (!input.trim() || !ctx) return;
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      message: input,
      timestamp: new Date(),
      language,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setTimeout(() => {
      const matched = rules.find((r) => r.pattern.test(userMsg.message));
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        message: matched ? matched.responses[language] : FALLBACK_RESPONSE[language],
        timestamp: new Date(),
        language,
      };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 700 + Math.random() * 500);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[200]">
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="relative flex items-center justify-center rounded-full shadow-lg"
            style={{ width: 56, height: 56, background: PRIMARY }}
            title="Open AI Assistant"
          >
            <MessageSquare size={22} className="text-white" />
            <span
              className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-black"
              style={{ background: SECONDARY }}
            >
              <Sparkles size={10} />
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute bottom-0 right-0 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: 300, height: 450, background: SURFACE_RAISED, border: `1px solid ${BORDER}` }}
          >
            <div className="px-4 py-3 flex items-center justify-between flex-shrink-0" style={{ background: PRIMARY }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">AI Assistant</p>
                  <p className="text-white/70 text-xs flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: SECONDARY }} />
                    Online
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setLanguage((l) => (l === 'en' ? 'fil' : 'en'))}
                  className="text-[10px] text-white/80 px-2 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.15)' }}
                >
                  {language.toUpperCase()}
                </button>
                <button onClick={() => setIsOpen(false)} className="text-white/80">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-dark-border">
              {greeting === null ? (
                <p className="text-[11px] px-1 py-2" style={{ color: TEXT_MUTED }}>
                  Reading the gym's settings, plans, trainers and timetable…
                </p>
              ) : (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: PRIMARY }}>
                    <Bot size={12} className="text-white" />
                  </div>
                  <div
                    className="max-w-[78%] px-3 py-2 text-xs leading-relaxed whitespace-pre-line rounded-2xl text-white"
                    style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
                  >
                    {greeting}
                  </div>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: msg.sender === 'user' ? SECONDARY : PRIMARY }}
                  >
                    {msg.sender === 'user'
                      ? <User size={12} className="text-black" />
                      : <Bot size={12} className="text-white" />}
                  </div>
                  <div
                    className="max-w-[78%] px-3 py-2 text-xs leading-relaxed whitespace-pre-line rounded-2xl"
                    style={{
                      background: msg.sender === 'user' ? PRIMARY : SURFACE,
                      color: '#fff',
                      border: msg.sender === 'bot' ? `1px solid ${BORDER}` : 'none',
                    }}
                  >
                    {msg.message}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: PRIMARY }}>
                    <Bot size={12} className="text-white" />
                  </div>
                  <div className="px-3 py-2 rounded-2xl" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                    <div className="flex gap-1">
                      {[0, 150, 300].map((d) => (
                        <div
                          key={d}
                          className="w-1.5 h-1.5 rounded-full animate-bounce"
                          style={{ background: TEXT_MUTED, animationDelay: `${d}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="p-2.5 flex-shrink-0" style={{ borderTop: `1px solid ${BORDER}` }}>
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={ctx ? 'Type a message…' : 'Loading…'}
                  disabled={!ctx}
                  className="flex-1 px-3 text-xs rounded-full disabled:opacity-50"
                  style={{ height: 36, background: SURFACE, border: `1px solid ${BORDER}`, color: '#fff' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || !ctx}
                  className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40"
                  style={{ background: PRIMARY }}
                >
                  <Send size={14} className="text-white" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
