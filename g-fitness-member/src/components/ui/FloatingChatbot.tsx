import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listPlans } from '../../lib/api/membershipPlans';
import type { MembershipPlanRow } from '../../types/db';
import { MessageSquare, X, Send, Bot, User, Sparkles } from 'lucide-react';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

const getBotResponse = (msg: string, plans: MembershipPlanRow[]): string => {
  const m = msg.toLowerCase();
  if (m.includes('hour') || m.includes('open') || m.includes('close'))
    return 'Our gym is open 5:00 AM – 10:00 PM Monday to Sunday.';
  if (m.includes('price') || m.includes('cost') || m.includes('membership') || m.includes('fee'))
    return plans.length === 0
      ? 'I could not load the current plans. Ask at the front desk, or open Membership from your profile.'
      : ['Current plans:']
          .concat(
            plans.map(
              (p) =>
                `• ${p.name}: ₱${Number(p.price).toLocaleString()} — ` +
                (p.duration_days == null ? 'no expiry' : `${p.duration_days} days`)
            )
          )
          .join('\n');
  if (m.includes('trainer') || m.includes('coach'))
    // Which plans include PT is decided by `plan_entitlements` (migration 0017),
    // not by a plan's name. Naming one here would go stale the moment the gym
    // renames a tier or changes what it includes.
    return 'Personal training depends on your plan. Open Book a Session — it shows what yours includes, and the front desk can explain your options.';
  if (m.includes('amenities') || m.includes('facilities'))
    return 'Free weights, cardio, locker rooms, showers, group classes, and personal training.';
  if (m.includes('qr') || m.includes('check in'))
    return 'Your QR code is on the Home page. Show it to staff for quick check-in.';
  if (m.includes('book') || m.includes('class') || m.includes('schedule'))
    return 'Go to Book a Class to schedule a session — pick your class type, trainer, day, and time.';
  if (m.includes('hello') || m.includes('hi') || m.includes('hey'))
    return 'Hello! How can I help you with your fitness journey today?';
  if (m.includes('thank'))
    return "You're welcome! Keep crushing those fitness goals.";
  return 'I can help with operating hours, pricing, trainers, facilities, QR check-in and class booking. What would you like to know?';
};

/**
 * Mobile floating chatbot.
 * Positioned bottom-right, 56px violet circle.
 * Opens a constrained 300×450 popup overlay with close X (top-right).
 */
export default function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: "Hi! I'm your Core Fitness assistant. How can I help today?", sender: 'bot', timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Real plans, loaded once. A failed load leaves the list empty and the
  // pricing reply says so rather than inventing figures.
  const [plans, setPlans] = useState<MembershipPlanRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    listPlans()
      .then((rows) => { if (!cancelled) setPlans(rows.filter((p) => p.is_active)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), text: input, sender: 'user', timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    const q = input;
    setInput('');
    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        text: getBotResponse(q, plans),
        sender: 'bot',
        timestamp: new Date(),
      }]);
      setIsTyping(false);
    }, 700 + Math.random() * 500);
  };

  return (
    <>
      {/* Floating button — bottom-right, sits above bottom nav */}
      <div className="absolute bottom-20 right-3 z-[210]">
        <AnimatePresence>
          {!isOpen && (
            <motion.button
              initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => setIsOpen(true)}
              className="relative flex items-center justify-center rounded-full shadow-lg"
              style={{ width: 48, height: 48, background: 'var(--color-primary)' }}
              title="AI Assistant"
            >
              <MessageSquare size={20} className="text-white" />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                style={{ background: 'var(--color-secondary)' }}>
                <Sparkles size={9} className="text-black" />
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Popup overlay — fills phone-overlay area, centered */}
      <AnimatePresence>
        {isOpen && (
          <div className="absolute inset-0 z-[220] pointer-events-auto flex items-center justify-center px-3">
            {/* dim backdrop */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60" onClick={() => setIsOpen(false)} />

            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0,  scale: 1 }}
              exit={{    opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="relative w-full max-w-[340px] h-[450px] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              {/* Header */}
              <div className="px-4 py-3 flex items-center justify-between flex-shrink-0"
                style={{ background: 'var(--color-primary)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                    <Bot size={16} className="text-white" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">AI Assistant</p>
                    <p className="text-white/70 text-xs flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" /> Online
                    </p>
                  </div>
                </div>
                <button onClick={() => setIsOpen(false)} aria-label="Close" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  <X size={18} />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex gap-2 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: msg.sender === 'user' ? 'var(--color-secondary)' : 'var(--color-primary)' }}>
                      {msg.sender === 'user'
                        ? <User size={12} className="text-black" />
                        : <Bot size={12} className="text-white" />}
                    </div>
                    <div
                      className="max-w-[78%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-line"
                      style={{
                        background: msg.sender === 'user' ? 'var(--color-secondary)' : 'var(--color-surface-raised)',
                        color: msg.sender === 'user' ? '#000' : 'var(--color-text-secondary)',
                        border: msg.sender === 'bot' ? '1px solid var(--color-border)' : 'none',
                        borderRadius: msg.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      }}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
                      <Bot size={12} className="text-white" />
                    </div>
                    <div className="px-3 py-2 rounded-xl" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
                      <div className="flex gap-1">
                        {[0, 150, 300].map((d) => (
                          <div key={d} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {/* Input */}
              <div className="p-2.5 flex-shrink-0" style={{ borderTop: '1px solid var(--color-border)' }}>
                <div className="flex gap-2">
                  <input value={input} onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Type a message…"
                    className="field-input flex-1 px-3 py-2 rounded-xl text-xs text-white placeholder-gray-500"
                    style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', height: 36 }} />
                  <button onClick={handleSend} disabled={!input.trim()}
                    className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-40"
                    style={{ background: 'var(--color-secondary)' }}
                    aria-label="Send">
                    <Send size={14} className="text-black" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
