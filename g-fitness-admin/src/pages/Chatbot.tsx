import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import type { ChatMessage } from '../types';
import { CHATBOT_RESPONSES, FALLBACK_RESPONSE } from '../data/chatbot';
import { MessageSquare, Send, Bot, User, Clock, Sparkles } from 'lucide-react';

export default function Chatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'bot',
      message: 'Hello! Welcome to G-Fitness CORE. How can I help you today?',
      timestamp: new Date(),
      language: 'en'
    }
  ]);
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState<'en' | 'fil'>('en');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      message: input,
      timestamp: new Date(),
      language
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Find matching response
    setTimeout(() => {
      const matchedResponse = CHATBOT_RESPONSES.find(r => r.pattern.test(input));
      const botResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        message: matchedResponse ? matchedResponse.responses[language] : FALLBACK_RESPONSE[language],
        timestamp: new Date(),
        language
      };
      setMessages(prev => [...prev, botResponse]);
      setIsTyping(false);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center"
      >
        <div>
          <h1 className="text-3xl font-orbitron font-bold text-gradient flex items-center gap-3">
            <MessageSquare size={32} />
            AI Chatbot
          </h1>
          <p className="text-gray-400 mt-1">NLP Administrative Assistant • Bilingual Support</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={language === 'en' ? 'primary' : 'ghost'}
            onClick={() => setLanguage('en')}
            className="shadow-lg"
          >
            English
          </Button>
          <Button
            variant={language === 'fil' ? 'primary' : 'ghost'}
            onClick={() => setLanguage('fil')}
            className="shadow-lg"
          >
            Filipino
          </Button>
        </div>
      </motion.div>

      {/* Chat Interface */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="h-[650px] flex flex-col relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-start/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary/5 rounded-full blur-3xl"></div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 relative z-10 px-2">
            <AnimatePresence>
              {messages.map((msg, index) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.05 }}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex items-end gap-3 max-w-[75%] ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg flex-shrink-0 ${
                      msg.sender === 'user' 
                        ? 'bg-gradient-to-br from-primary-start to-primary-end' 
                        : 'bg-gradient-to-br from-secondary to-purple-600'
                    }`}>
                      {msg.sender === 'user' ? <User size={20} className="text-white" /> : <Bot size={20} className="text-white" />}
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={`p-4 rounded-2xl shadow-lg ${
                        msg.sender === 'user'
                          ? 'bg-gradient-to-br from-primary-start to-primary-end text-white rounded-br-none'
                          : 'bg-dark border border-dark-border text-white rounded-bl-none'
                      }`}
                    >
                      <p className="leading-relaxed">{msg.message}</p>
                      <p className="text-xs opacity-70 mt-2 flex items-center gap-1">
                        <Clock size={12} />
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Typing Indicator */}
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="flex items-end gap-3 max-w-[75%]">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-purple-600 flex items-center justify-center shadow-lg">
                    <Bot size={20} className="text-white" />
                  </div>
                  <div className="p-4 rounded-2xl rounded-bl-none bg-dark border border-dark-border">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="relative z-10 border-t border-dark-border pt-4">
            <div className="flex gap-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder={language === 'en' ? 'Type your message...' : 'Magsulat ng mensahe...'}
                className="flex-1"
              />
              <Button 
                onClick={handleSend}
                variant="primary"
                className="px-8 shadow-lg shadow-primary-start/30 flex items-center gap-2"
                disabled={!input.trim()}
              >
                <Send size={18} />
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center flex items-center justify-center gap-1">
              <Sparkles size={12} />
              {language === 'en' 
                ? 'AI-powered assistant with bilingual support' 
                : 'AI assistant na may suportang dalawang wika'}
            </p>
          </div>
        </Card>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card>
          <h3 className="text-white font-semibold mb-4">Quick Questions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { en: 'Show member count', fil: 'Ipakita ang bilang ng miyembro' },
              { en: 'Today\'s attendance', fil: 'Attendance ngayong araw' },
              { en: 'Revenue report', fil: 'Ulat ng kita' },
            ].map((q, idx) => (
              <button
                key={idx}
                onClick={() => setInput(q[language])}
                className="p-3 bg-dark border border-dark-border rounded-xl text-left text-sm text-gray-300 hover:border-primary-start hover:text-white transition-all duration-200"
              >
                {q[language]}
              </button>
            ))}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
