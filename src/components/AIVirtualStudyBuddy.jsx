import { useState, useEffect, useRef } from 'react';
import { getSettings, getXp, getStreak, getSessions } from '../lib/storage';
import { Send, Sparkles, Brain, CheckCircle, AlertCircle, Clock, Star, Heart, ThumbsUp, Lightbulb, User, Bot, Zap } from './icons';

export default function AIVirtualStudyBuddy({ open, onClose }) {
  const [conversation, setConversation] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [mood, setMood] = useState('motivated');
  const [sessionStats, setSessionStats] = useState({
    messagesCount: 0,
    topicsDiscussed: [],
    moodChanges: [],
    learningMoments: 0,
  });
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Initialize conversation context on open
  useEffect(() => {
    if (open) {
      initializeConversation();
    }
  }, [open]);

  // Scroll to bottom when new message arrives
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation]);

  const initializeConversation = () => {
    const greetings = [
      "Bonjour! Je suis ton assistant d'étude personnel 🇫🇷 Prêt à apprendre le français ensemble?",
      "Hello! Ready to practice French today? I'm here to help you improve your skills 💪",
      "Salut! How are you feeling today? Let's make the most of our study session! ✨",
    ];
    
    const settings = getSettings();
    const initialMessage = {
      id: Date.now(),
      sender: 'ai',
      text: greetings[Math.floor(Math.random() * greetings.length)],
      timestamp: new Date().toISOString(),
      metadata: { type: 'greeting' },
    };
    
    setConversation([initialMessage]);
    setSessionStats(prev => ({ ...prev, messagesCount: 1 }));
  };

  const generateAIResponse = (userMessage) => {
    const lowerText = userMessage.toLowerCase();
    
    // Context-aware response generation based on input patterns
    for (const pattern of activeConversationPatterns) {
      const regex = new RegExp(pattern.pattern, 'i');
      if (regex.test(lowerText)) {
        return {
          text: pattern.response,
          followUp: pattern.followUp,
          metadata: {
            type: pattern.type,
            sentiment: pattern.sentiment,
            suggestedQuestion: pattern.suggestedQuestion,
          },
        };
      }
    }
    
    // Default fallback responses
    const fallbackResponses = [
      {
        text: "C'est intéressant! Can you tell me more about that in French?",
        followUp: "Try describing it using past tense verbs.",
        metadata: { type: 'encouragement', sentiment: 'positive' },
      },
      {
        text: "Je comprends! That's a great point. Would you like to explore this topic further?",
        followUp: "Let's practice vocabulary related to this subject.",
        metadata: { type: 'engagement', sentiment: 'positive' },
      },
      {
        text: "Excellent effort! Your French is improving every day 🌟 What would you like to learn next?",
        followUp: "We could focus on grammar or expand your vocabulary.",
        metadata: { type: 'affirmation', sentiment: 'positive' },
      },
    ];
    
    return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    
    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: inputValue.trim(),
      timestamp: new Date().toISOString(),
      metadata: { type: 'input' },
    };
    
    setConversation(prev => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);
    
    // Simulate AI thinking time
    const thinkTime = Math.random() * 1500 + 1000;
    
    setTimeout(() => {
      setIsTyping(false);
      
      const aiResponse = generateAIResponse(inputValue);
      
      const responseMsg = {
        id: Date.now() + 1,
        sender: 'ai',
        text: aiResponse.text,
        timestamp: new Date().toISOString(),
        metadata: aiResponse.metadata,
      };
      
      setConversation(prev => [...prev, responseMsg]);
      
      // Update session stats
      setSessionStats(prev => ({
        ...prev,
        messagesCount: prev.messagesCount + 2,
        topicsDiscussed: [...new Set([...prev.topicsDiscussed, extractTopic(inputValue)])],
        learningMoments: prev.learningMoments + 1,
      }));
      
      // Track mood if detected
      if (aiResponse.metadata?.sentiment === 'positive') {
        updateMood('more_motivated');
      }
    }, thinkTime);
  };

  const extractTopic = (text) => {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('grammar')) return 'Grammar';
    if (lowerText.includes('vocabulary') || lowerText.includes('word')) return 'Vocabulary';
    if (lowerText.includes('pronunciation')) return 'Pronunciation';
    if (lowerText.includes('conversation') || lowerText.includes('speaking')) return 'Speaking';
    if (lowerText.includes('listening')) return 'Listening';
    if (lowerText.includes('culture')) return 'French Culture';
    return 'General';
  };

  const updateMood = (newMood) => {
    setMood(prev => {
      const updatedMood = 
        newMood === 'more_motivated' && prev !== 'tired' ? 'motivated' :
        newMood === 'confused' ? 'learning' :
        newMood === 'frustrated' ? 'challenged' :
        prev;
      
      setSessionStats(prev => ({
        ...prev,
        moodChanges: [...prev.moodChanges, { mood: updatedMood, timestamp: new Date().toISOString() }],
      }));
      
      return updatedMood;
    });
  };

  const quickReplies = [
    { label: 'Ask for help', value: "Je ne comprends pas. Pouvez-vous m'aider?", type: 'help' },
    { label: 'Practice verbs', value: "Let's practice French verb conjugations!", type: 'grammar' },
    { label: 'New vocabulary', value: "Give me 5 new words to learn today.", type: 'vocab' },
    { label: 'Have a conversation', value: "Bonjour! Comment allez-vous aujourd'hui?", type: 'chat' },
  ];

  const LearningTipCard = ({ tip }) => (
    <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-3">
      <div className="flex items-start gap-2">
        <Lightbulb size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-ink mb-1">Learning Tip</p>
          <p className="text-sm text-ink2">{tip}</p>
        </div>
      </div>
    </div>
  );

  const ConversationMessage = ({ msg }) => {
    const isUser = msg.sender === 'user';
    
    return (
      <div className={`flex items-start gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && (
          <div className="w-8 h-8 grid place-items-center bg-accent rounded-full flex-shrink-0">
            <Bot size={14} className="text-white" />
          </div>
        )}
        
        <div className={`max-w-[75%] ${isUser ? 'order-1' : ''}`}>
          <div className={`px-4 py-3 rounded-2xl ${
            isUser 
              ? 'bg-accent text-white rounded-br-none' 
              : 'bg-surface border border-line rounded-bl-none'
          }`}>
            <p className="text-sm leading-relaxed">{msg.text}</p>
            
            {/* Metadata display */}
            {msg.metadata?.type === 'encouragement' && (
              <div className="flex items-center gap-1 mt-2 pt-2 border-t border-line/20">
                <Star size={10} className="text-yellow-500" />
                <span className="text-xs opacity-75">Encouraging feedback</span>
              </div>
            )}
          </div>
          
          <p className="text-[10px] text-ink3 mt-1 px-1">
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        
        {isUser && (
          <div className="w-8 h-8 grid place-items-center bg-purple-500 rounded-full flex-shrink-0">
            <User size={14} className="text-white" />
          </div>
        )}
      </div>
    );
  };

  const CurrentStats = () => (
    <div className="grid grid-cols-4 gap-3 p-3 bg-surface border border-line rounded-xl">
      <div className="text-center">
        <p className="text-lg font-bold text-ink">{sessionStats.messagesCount}</p>
        <p className="text-[10px] text-ink3">Messages</p>
      </div>
      <div className="text-center">
        <p className="text-lg font-bold text-ink">{sessionStats.topicsDiscussed.length}</p>
        <p className="text-[10px] text-ink3">Topics</p>
      </div>
      <div className="text-center">
        <p className="text-lg font-bold text-ink">{sessionStats.learningMoments}</p>
        <p className="text-[10px] text-ink3">Insights</p>
      </div>
      <div className="text-center">
        <span className={`inline-block w-3 h-3 rounded-full ${
          mood === 'motivated' ? 'bg-emerald-500' :
          mood === 'learning' ? 'bg-blue-500' :
          mood === 'challenged' ? 'bg-orange-500' :
          'bg-purple-500'
        }`} />
        <p className="text-[10px] text-ink3 capitalize">{mood}</p>
      </div>
    </div>
  );

  const suggestionButtons = [
    { emoji: '📚', label: 'Learn grammar', action: () => setInputValue("Let's review some French grammar rules!") },
    { emoji: '🗣️', label: 'Practice speaking', action: () => setInputValue("Can we have a French conversation?") },
    { emoji: '✨', label: 'Get vocab', action: () => setInputValue("Teach me 5 useful French words") },
    { emoji: '💬', label: 'Chat casually', action: () => setInputValue("Bonjour! Parlons de la culture française.") },
  ];

  return (
    <div className="fixed inset-0 z-[70] bg-bg flex flex-col" role="dialog" aria-modal="true" aria-label="AI Study Buddy">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 grid place-items-center bg-accent rounded-full">
              <Bot size={20} className="text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-bg"></div>
          </div>
          
          <div>
            <h2 className="text-sm font-semibold text-ink">AI Study Buddy</h2>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-emerald-500">Online & Ready</span>
            </div>
          </div>
        </div>
        
        <button onClick={onClose} aria-label="Close buddy" className="p-1 hover:bg-surface2 rounded-lg transition-colors">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 8.586L15.536 3.05a1 1 0 111.414 1.414L11.414 10l5.536 5.536a1 1 0 01-1.414 1.414L10 11.414l-5.536 5.536a1 1 0 01-1.414-1.414L8.586 10 3.05 4.464a1 1 0 011.414-1.414L10 8.586z"/>
          </svg>
        </button>
      </div>

      {/* Quick Actions Bar */}
      <div className="px-4 py-2 border-b border-line bg-surface2 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          {suggestionButtons.map((btn, idx) => (
            <button
              key={idx}
              onClick={btn.action}
              className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-line rounded-full text-xs font-medium text-ink hover:border-accent transition-colors"
            >
              <span>{btn.emoji}</span>
              <span>{btn.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Session Stats */}
      <CurrentStats />

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto nice-scroll px-4 py-4 space-y-4">
        {conversation.map((msg, idx) => (
          <ConversationMessage key={msg.id} msg={msg} />
        ))}

        {isTyping && (
          <div className="flex items-center gap-2 text-ink3">
            <Bot size={18} className="text-accent" />
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-ink3 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-ink3 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-ink3 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              <span className="text-xs ml-1">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-line bg-surface px-4 py-3">
        <div className="max-w-md mx-auto">
          {/* Mood Tracker */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Heart size={14} className="text-red-500" />
              <select
                value={mood}
                onChange={(e) => updateMood(e.target.value)}
                className="text-xs bg-surface2 border border-line rounded px-2 py-1 text-ink focus:border-accent"
              >
                <option value="motivated">😊 Motivated</option>
                <option value="learning">🤔 Learning</option>
                <option value="challenged">😅 Challenged</option>
                <option value="relaxed">😎 Relaxed</option>
              </select>
            </div>
            <p className="text-[10px] text-ink3">
              {sessionStats.messagesCount} messages • {new Date().toLocaleDateString()}
            </p>
          </div>

          {/* Input Field */}
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Write in French (or mix languages)! Try: 'Bonjour, comment ça va?'..."
                rows={1}
                className="w-full bg-surface2 border border-line rounded-xl px-4 py-3 text-sm text-ink placeholder-ink3 focus:border-accent focus:outline-none resize-none max-h-32"
                style={{ minHeight: '48px' }}
              />
            </div>
            
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isTyping}
              className={`w-12 h-12 grid place-items-center rounded-xl transition-all ${
                inputValue.trim() && !isTyping
                  ? 'bg-accent text-white hover:bg-accent/80 shadow-lg shadow-accent/30'
                  : 'bg-surface3 text-ink3 cursor-not-allowed'
              }`}
            >
              <Send size={18} />
            </button>
          </div>
          
          <p className="text-[10px] text-ink3 mt-2 text-center">
            💡 Mix French and English - perfect for learners at all levels!
          </p>
        </div>
      </div>
    </div>
  );
}

// Active conversation patterns for AI responses
const activeConversationPatterns = [
  {
    pattern: /hello|hi|bonjour|salut/,
    response: "Bonjour! It's wonderful to see you studying today! 🌟 How can I help you practice French?",
    followUp: "What would you like to focus on today?",
    type: 'greeting',
    sentiment: 'positive',
    suggestedQuestion: 'Would you like to start with vocabulary or grammar?',
  },
  {
    pattern: /how are you|comment vas tu|ça va/,
    response: "Je vais très bien, merci! I'm here and ready to help you improve your French. And how are you feeling about your studies today?",
    followUp: "Is there anything specific you want to practice?",
    type: 'wellbeing',
    sentiment: 'positive',
    suggestedQuestion: 'How motivated do you feel right now?',
  },
  {
    pattern: /help|aide|m'aider|je ne comprends pas/,
    response: "Bien sûr! I'd love to help you! Could you tell me what you're struggling with? We can work through it together. 💪",
    followUp: "Let's break it down step by step.",
    type: 'assistance',
    sentiment: 'supportive',
    suggestedQuestion: 'Should we review some grammar rules or practice vocabulary?',
  },
  {
    pattern: /thank|merci|remercier/,
    response: "De rien! You're very welcome! Every moment you spend practicing brings you closer to fluency. Keep up the excellent work! 🎉",
    followUp: "Ready for another challenge?",
    type: 'gratitude',
    sentiment: 'positive',
    suggestedQuestion: 'Shall we continue with our current topic?',
  },
  {
    pattern: /(verb|conjugate|présent|passé)/,
    response: "Great choice! Verbs are essential for French communication. Which verb would you like to practice? We can work on present tense, passé composé, or future tense.",
    followUp: "Let's start with regular -er verbs if you're a beginner!",
    type: 'grammar_help',
    sentiment: 'educational',
    suggestedQuestion: 'Would you like an example sentence?',
  },
  {
    pattern: /(word|vocabulary|mots|lexique)/i,
    response: "Excellent! Building vocabulary is key to fluency. What topic interests you? Food, travel, family, work, or something else?",
    followUp: "I can give you 5-10 new words with examples.",
    type: 'vocabulary_request',
    sentiment: 'positive',
    suggestedQuestion: 'Which category should we explore?',
  },
];
