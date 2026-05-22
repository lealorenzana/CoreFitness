import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bot, User } from 'lucide-react';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

const getBotResponse = (msg: string): string => {
  const m = msg.toLowerCase();
  if (m.includes('hour') || m.includes('open') || m.includes('close'))
    return 'Our gym is open 5:00 AM – 10:00 PM Monday to Sunday.';
  if (m.includes('price') || m.includes('cost') || m.includes('membership') || m.includes('fee'))
    return 'We offer:\n• Basic: ₱800/month\n• Standard: ₱1,500/month\n• Premium: ₱2,500/month';
  if (m.includes('trainer') || m.includes('coach'))
    return 'Personal trainers are available with our Premium plan. Book a session from the Book a Class page.';
  if (m.includes('amenities') || m.includes('facilities'))
    return 'Free weights, cardio, locker rooms, showers, group classes, and personal training (Premium).';
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
        text: getBotResponse(q),
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
          className="absolute inset-0 z-[220] pointer-events-auto flex items-end justify-center pb-16 px-3"
          style={{ background: 'transparent' }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Chat panel — slides up from bottom */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="relative w-full max-w-[340px] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              height: '70%',
              maxHeight: 480,
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
                  <p className="text-white/60 text-[11px] flex items-center gap-1">
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

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-hide">
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: msg.sender === 'user' ? 'var(--color-secondary)' : 'var(--color-primary-light)' }}
                  >
                    {msg.sender === 'user'
                      ? <User size={13} className="text-black" />
                      : <Bot size={13} style={{ color: 'var(--color-primary)' }} />}
                  </div>
                  <div
                    className="max-w-[78%] px-3 py-2.5 text-xs leading-relaxed whitespace-pre-line"
                    style={{
                      background: msg.sender === 'user' ? 'var(--color-secondary)' : 'var(--color-surface-raised)',
                      color: msg.sender === 'user' ? '#000' : 'var(--color-text-secondary)',
                      border: msg.sender === 'bot' ? '1px solid var(--color-border)' : 'none',
                      borderRadius: msg.sender === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    }}
                  >
                    {msg.text}
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
                    className="px-3 py-1.5 rounded-full text-[10px] font-semibold transition-colors"
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
                  className="flex-1 px-4 py-2.5 rounded-full text-xs text-white placeholder-gray-500 focus:outline-none"
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
