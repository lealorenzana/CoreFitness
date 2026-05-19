import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Sparkles } from 'lucide-react';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

export default function ChatbotPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hi! I\'m your Core Fitness assistant. How can I help you today?',
      sender: 'bot',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const quickQuestions = [
    'What are your operating hours?',
    'How much is the membership?',
    'Do you have personal trainers?',
    'What amenities do you offer?',
  ];

  const getBotResponse = (userMessage: string): string => {
    const lowerMessage = userMessage.toLowerCase();

    // Operating hours
    if (lowerMessage.includes('hour') || lowerMessage.includes('open') || lowerMessage.includes('close')) {
      return 'Our gym is open from 5:00 AM to 10:00 PM, Monday to Sunday. We\'re here to help you achieve your fitness goals anytime!';
    }

    // Membership pricing
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('membership') || lowerMessage.includes('fee')) {
      return 'We offer three membership plans:\n\n💙 Basic: ₱800/month\n💚 Standard: ₱1,500/month\n⭐ Premium: ₱2,500/month\n\nDaily rate is also available at ₱50. Would you like to know more about any specific plan?';
    }

    // Trainers
    if (lowerMessage.includes('trainer') || lowerMessage.includes('coach') || lowerMessage.includes('instructor')) {
      return 'Yes! We have certified personal trainers available with our Premium membership plan. They can help you with personalized workout programs and nutrition guidance.';
    }

    // Amenities
    if (lowerMessage.includes('amenities') || lowerMessage.includes('facilities') || lowerMessage.includes('equipment')) {
      return 'Our facilities include:\n\n✅ Free Weights\n✅ Cardio Equipment\n✅ Locker Rooms\n✅ Shower Facilities\n✅ Group Classes\n✅ Personal Training (Premium)\n\nEverything you need for a complete workout!';
    }

    // Location
    if (lowerMessage.includes('location') || lowerMessage.includes('address') || lowerMessage.includes('where')) {
      return 'We\'re located in Mamburao, Occidental Mindoro. You can find us easily - just check the gym details in the app!';
    }

    // QR Code
    if (lowerMessage.includes('qr') || lowerMessage.includes('check in') || lowerMessage.includes('entry')) {
      return 'Your QR code is available on your Home page. Just show it to our staff when you arrive, and they\'ll scan it for quick check-in!';
    }

    // Payment
    if (lowerMessage.includes('payment') || lowerMessage.includes('pay') || lowerMessage.includes('billing')) {
      return 'You can pay your membership at the gym reception. We accept cash and various payment methods. Your membership status is always visible in your profile.';
    }

    // Classes
    if (lowerMessage.includes('class') || lowerMessage.includes('schedule') || lowerMessage.includes('session')) {
      return 'We offer various group classes including HIIT, Yoga, Zumba, and more! Check the Workouts section in your app for the full schedule and available classes.';
    }

    // Greeting
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
      return 'Hello! How can I assist you with your fitness journey today?';
    }

    // Thank you
    if (lowerMessage.includes('thank') || lowerMessage.includes('thanks')) {
      return 'You\'re welcome! Feel free to ask if you have any other questions. Keep crushing those fitness goals! 💪';
    }

    // Default response
    return 'I\'m here to help! You can ask me about:\n\n• Operating hours\n• Membership plans and pricing\n• Personal trainers\n• Facilities and amenities\n• Location\n• QR code check-in\n• Payment methods\n• Group classes\n\nWhat would you like to know?';
  };

  const handleSend = () => {
    if (!inputText.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    // Simulate bot typing and response
    setTimeout(() => {
      const botResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: getBotResponse(inputText),
        sender: 'bot',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botResponse]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1000);
  };

  const handleQuickQuestion = (question: string) => {
    setInputText(question);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-start to-primary-end flex items-center justify-center">
            <Bot size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-orbitron font-bold text-gradient">AI Assistant</h1>
            <p className="text-gray-400 text-sm flex items-center gap-1">
              <Sparkles size={12} />
              Always here to help
            </p>
          </div>
        </div>
      </motion.div>

      {/* Quick Questions */}
      {messages.length <= 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-4"
        >
          <p className="text-gray-400 text-xs mb-2">Quick questions:</p>
          <div className="flex flex-wrap gap-2">
            {quickQuestions.map((question, index) => (
              <button
                key={index}
                onClick={() => handleQuickQuestion(question)}
                className="px-3 py-2 bg-dark-lighter border border-dark-border rounded-lg text-xs text-gray-300 hover:border-primary-start transition-all"
              >
                {question}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 scrollbar-hide">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`flex gap-3 ${message.sender === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.sender === 'bot'
                    ? 'bg-gradient-to-br from-primary-start to-primary-end'
                    : 'bg-gradient-to-br from-secondary to-purple-600'
                }`}
              >
                {message.sender === 'bot' ? (
                  <Bot size={16} className="text-white" />
                ) : (
                  <User size={16} className="text-white" />
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={`flex-1 max-w-[80%] ${
                  message.sender === 'user' ? 'items-end' : 'items-start'
                } flex flex-col`}
              >
                <div
                  className={`px-4 py-3 rounded-2xl ${
                    message.sender === 'bot'
                      ? 'bg-dark-lighter border border-dark-border'
                      : 'bg-gradient-to-r from-primary-start to-primary-end'
                  }`}
                >
                  <p
                    className={`text-sm whitespace-pre-line ${
                      message.sender === 'bot' ? 'text-gray-200' : 'text-white'
                    }`}
                  >
                    {message.text}
                  </p>
                </div>
                <span className="text-xs text-gray-500 mt-1 px-2">
                  {message.timestamp.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing Indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-start to-primary-end flex items-center justify-center">
              <Bot size={16} className="text-white" />
            </div>
            <div className="bg-dark-lighter border border-dark-border px-4 py-3 rounded-2xl">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-dark-lighter border-2 border-dark-border rounded-2xl p-3 flex items-center gap-3">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type your message..."
          className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none text-sm"
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim()}
          className="w-10 h-10 rounded-xl bg-gradient-to-r from-primary-start to-primary-end flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-primary-start/30 transition-all"
        >
          <Send size={18} className="text-white" />
        </button>
      </div>
    </div>
  );
}
