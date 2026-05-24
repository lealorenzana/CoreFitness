import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Bot, User } from 'lucide-react';
import { TRAINER_CHATBOT_RESPONSES } from '../../data/trainerChatbot';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

export default function TrainerChatbot() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hi! I'm your AI training assistant. I can help you with member management, workout planning, scheduling, and training tips. How can I assist you today?",
      sender: 'bot',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const getBotResponse = (userMessage: string): string => {
    const lowerMessage = userMessage.toLowerCase();

    // Check for matches in trainer chatbot responses
    for (const [key, response] of Object.entries(TRAINER_CHATBOT_RESPONSES)) {
      if (lowerMessage.includes(key)) {
        return response;
      }
    }

    // Default response
    return "I'm here to help! You can ask me about:\n\n• Managing your assigned members\n• Creating workout plans\n• Scheduling and availability\n• Training techniques and tips\n• Member progress tracking\n• Booking management\n\nWhat would you like to know?";
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: input,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Simulate bot typing delay
    setTimeout(() => {
      const botResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: getBotResponse(input),
        sender: 'bot',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botResponse]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickActions = [
    'How do I create a workout plan?',
    'Show my schedule',
    'Member progress tips',
    'Booking management',
  ];

  return (
    <div className="flex flex-col h-full -mx-4 -my-4">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-primary)' }}
          >
            <Bot size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-sm">AI Training Assistant</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Always here to help
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`flex gap-2 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.sender === 'bot' && (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--color-primary)' }}
                >
                  <Bot size={16} className="text-white" />
                </div>
              )}
              <div
                className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                  message.sender === 'user'
                    ? 'rounded-tr-sm'
                    : 'rounded-tl-sm'
                }`}
                style={{
                  background:
                    message.sender === 'user'
                      ? 'var(--color-primary)'
                      : 'var(--color-surface-raised)',
                  color: 'white',
                }}
              >
                <p className="text-sm whitespace-pre-line">{message.text}</p>
                <p
                  className="text-[10px] mt-1"
                  style={{
                    color:
                      message.sender === 'user'
                        ? 'rgba(255,255,255,0.7)'
                        : 'var(--color-text-muted)',
                  }}
                >
                  {message.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              {message.sender === 'user' && (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--color-secondary)' }}
                >
                  <User size={16} className="text-black" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing Indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'var(--color-primary)' }}
            >
              <Bot size={16} className="text-white" />
            </div>
            <div
              className="px-4 py-3 rounded-2xl rounded-tl-sm"
              style={{ background: 'var(--color-surface-raised)' }}
            >
              <div className="flex gap-1">
                <div
                  className="w-2 h-2 rounded-full animate-bounce"
                  style={{
                    background: 'var(--color-text-muted)',
                    animationDelay: '0ms',
                  }}
                />
                <div
                  className="w-2 h-2 rounded-full animate-bounce"
                  style={{
                    background: 'var(--color-text-muted)',
                    animationDelay: '150ms',
                  }}
                />
                <div
                  className="w-2 h-2 rounded-full animate-bounce"
                  style={{
                    background: 'var(--color-text-muted)',
                    animationDelay: '300ms',
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {messages.length <= 2 && (
        <div className="px-4 pb-2">
          <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
            Quick questions:
          </p>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action, index) => (
              <button
                key={index}
                onClick={() => {
                  setInput(action);
                  setTimeout(() => handleSend(), 100);
                }}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                style={{
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div
        className="px-4 py-3 border-t"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything..."
            rows={1}
            className="flex-1 px-4 py-2.5 rounded-2xl text-sm text-white resize-none focus:outline-none"
            style={{
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              maxHeight: '100px',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            <Send size={18} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
