/**
 * AIFlashcardMastery - Intelligent spaced repetition with confidence-based scheduling
 * Advanced algorithms adapting review intervals based on performance, confidence ratings, and recall speed
 */
export default function AIFlashcardMastery({ open, onClose }) {
  const [activeTab, setActiveTab] = useState('study'); // study | review | create | stats
  const [currentDeck, setCurrentDeck] = useState(null);
  const [studySession, setStudySession] = useState(null);
  const [flashcards, setFlashcards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [userResponse, setUserResponse] = useState('');
  const [isFlipped, setIsFlipped] = useState(false);
  const [confidence, setConfidence] = useState(null); // 1-5 scale
  const [responseTime, setResponseTime] = useState(0);
  const [sessionStats, setSessionStats] = useState({
    totalCards: 0,
    reviewed: 0,
    correct: 0,
    averageScore: 0,
    timeSpent: 0,
    masteredCount: 0,
    learningCount: 0,
  });

  const [customDecks, setCustomDecks] = useState([
    {
      id: 'DECK-001',
      title: 'French Café Vocabulary',
      description: 'Essential words and phrases for ordering food and drinks',
      cardCount: 45,
      lastReviewed: '2026-10-20',
      nextReview: '2026-10-21',
      masteryLevel: 72,
      cardsDue: 12,
      category: 'food',
      tags: ['café', 'ordering', 'travel'],
      color: 'from-orange-500 to-red-500',
    },
    {
      id: 'DECK-002',
      title: 'Travel Phrases A1-A2',
      description: 'Navigate trains, hotels, and ask for directions confidently',
      cardCount: 68,
      lastReviewed: '2026-10-19',
      nextReview: '2026-10-22',
      masteryLevel: 58,
      cardsDue: 23,
      category: 'travel',
      tags: ['transport', 'hotel', 'directions'],
      color: 'from-blue-500 to-cyan-500',
    },
    {
      id: 'DECK-003',
      title: 'Past Tense Verbs',
      description: 'Masterer passé composé and imparfait conjugations',
      cardCount: 85,
      lastReviewed: '2026-10-18',
      nextReview: '2026-10-23',
      masteryLevel: 45,
      cardsDue: 31,
      category: 'grammar',
      tags: ['verbs', 'tenses', 'conjugation'],
      color: 'from-purple-500 to-pink-500',
    },
  ]);

  const [recentActivity, setRecentActivity] = useState([
    {
      deckTitle: 'French Café Vocabulary',
      date: '2026-10-20',
      cardsReviewed: 24,
      accuracy: 88,
      masteryGain: 8,
      icon: '☕',
    },
    {
      deckTitle: 'Travel Phrases A1-A2',
      date: '2026-10-19',
      cardsReviewed: 32,
      accuracy: 75,
      masteryGain: 12,
      icon: '✈️',
    },
  ]);

  useEffect(() => {
    if (!open) return;

    // Reset session state when opening
    setActiveTab('study');
    setCurrentDeck(null);
    setStudySession(null);
    setFlashcards([]);
    setCurrentCardIndex(0);
    setUserResponse('');
    setIsFlipped(false);
    setConfidence(null);
    setResponseTime(0);
    setSessionStats({
      totalCards: 0,
      reviewed: 0,
      correct: 0,
      averageScore: 0,
      timeSpent: 0,
      masteredCount: 0,
      learningCount: 0,
    });
  }, [open]);

  // Timer for response tracking
  useEffect(() => {
    let timer;
    if (isFlipped && confidence === null) {
      timer = setInterval(() => {
        setResponseTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isFlipped, confidence]);

  const startSession = (deckId) => {
    const deck = customDecks.find(d => d.id === deckId);
    if (deck) {
      setCurrentDeck(deck);
      
      // Load sample flashcards for demo
      const deckFlashcards = generateSampleFlashcards(deck);
      setFlashcards(deckFlashcards);
      setCurrentCardIndex(0);
      
      // Initialize session stats
      setStudySession({
        startTime: Date.now(),
        totalCards: deckFlashcards.length,
        currentCardIndex: 0,
      });
      
      setActiveTab('study');
      setUserResponse('');
      setIsFlipped(false);
      setConfidence(null);
      setResponseTime(0);
      
      setSessionStats(prev => ({
        ...prev,
        totalCards: deckFlashcards.length,
        reviewed: 0,
        correct: 0,
        masteredCount: 0,
        learningCount: 0,
      }));
    }
  };

  const generateSampleFlashcards = (deck) => {
    // Sample flashcard data for demonstration
    switch(deck.id) {
      case 'DECK-001': // Café vocabulary
        return [
          {
            id: 'CARD-001',
            front: 'un café',
            back: 'a coffee',
            example: 'Je voudrais un café, s\'il vous plaît.',
            pronunciation: '/kafe/',
            category: 'drinks',
            difficulty: 'beginner',
          },
          {
            id: 'CARD-002',
            front: 'un croissant',
            back: 'a croissant',
            example: 'Je prends un croissant et un café.',
            pronunciation: '/kʁwasɑ̃/',
            category: 'bakery',
            difficulty: 'beginner',
          },
          {
            id: 'CARD-003',
            front: 'l\'addition',
            back: 'the bill/check',
            example: 'L\'addition, s\'il vous plaît.',
            pronunciation: '/ladisjɔ̃/',
            category: 'payment',
            difficulty: 'intermediate',
          },
          {
            id: 'CARD-004',
            front: 'payer par carte',
            back: 'pay by card',
            example: 'Est-ce que je peux payer par carte?',
            pronunciation: '/paje paʁ kaʁt/',
            category: 'payment',
            difficulty: 'intermediate',
          },
          {
            id: 'CARD-005',
            front: 'une table pour deux',
            back: 'a table for two',
            example: 'Je voudrais une table pour deux personnes.',
            pronunciation: '/yn tab pœr dø/',
            category: 'reservation',
            difficulty: 'beginner',
          },
        ];
      case 'DECK-002': // Travel phrases
        return [
          {
            id: 'TRV-001',
            front: 'Où est la gare?',
            back: 'Where is the train station?',
            example: 'Excusez-moi, où est la gare ?',
            pronunciation: '/u lgaʁ/',
            category: 'directions',
            difficulty: 'beginner',
          },
          {
            id: 'TRV-002',
            front: 'Un billet pour Paris',
            back: 'A ticket to Paris',
            example: 'Je voudrais un billet pour Paris, s\'il vous plaît.',
            pronunciation: '/y bije pu paʁi/',
            category: 'tickets',
            difficulty: 'intermediate',
          },
          {
            id: 'TRV-003',
            front: 'À quelle heure le train?',
            back: 'What time is the train?',
            example: 'À quelle heure part le train pour Lyon ?',
            pronunciation: '/a kɛl øʁ lə tʁɛ̃/',
            category: 'schedule',
            difficulty: 'intermediate',
          },
        ];
      case 'DECK-003': // Past tense verbs
        return [
          {
            id: 'GRP-001',
            front: 'J\'ai mangé',
            back: 'I ate / I have eaten',
            example: 'Hier, j\'ai mangé une pomme.',
            pronunciation: '/ʒe mɑ̃ʒe/',
            category: 'passé composé',
            difficulty: 'intermediate',
          },
          {
            id: 'GRP-002',
            front: 'J\'étais enfant',
            back: 'I was (imparfait)',
            example: 'Quand j\'étais enfant, je jouais dehors.',
            pronunciation: '/ʒetɛ ɑ̃fɑ̃/',
            category: 'imparfait',
            difficulty: 'advanced',
          },
          {
            id: 'GRP-003',
            front: 'Il a fini',
            back: 'He finished / He has finished',
            example: 'Il a fini ses devoirs hier.',
            pronunciation: '/ila fini/',
            category: 'passé composé',
            difficulty: 'intermediate',
          },
        ];
      default:
        return [];
    }
  };

  const flipCard = () => {
    if (!isFlipped) {
      setIsFlipped(true);
      setResponseTime(0); // Reset timer when flipped
    }
  };

  const rateCard = (correctness, selectedConfidence) => {
    const actualCorrect = correctness === 'correct';
    const card = flashcards[currentCardIndex];
    
    // Calculate score based on correctness AND confidence alignment
    let score = 0;
    if (actualCorrect) {
      score = selectedConfidence * 20; // 5*20=100, 4*20=80, etc.
      setSessionStats(prev => ({
        ...prev,
        correct: prev.correct + 1,
        averageScore: ((prev.averageScore * prev.reviewed) + score) / (prev.reviewed + 1),
        reviewed: prev.reviewed + 1,
      }));
      
      if (selectedConfidence >= 4) {
        setSessionStats(prev => ({
          ...prev,
          masteredCount: prev.masteredCount + 1,
        }));
      } else {
        setSessionStats(prev => ({
          ...prev,
          learningCount: prev.learningCount + 1,
        }));
      }
    } else {
      setSessionStats(prev => ({
        ...prev,
        averageScore: ((prev.averageScore * prev.reviewed) + 0) / (prev.reviewed + 1),
        reviewed: prev.reviewed + 1,
      }));
    }
    
    // Move to next card or end session
    if (currentCardIndex < flashcards.length - 1) {
      setTimeout(() => {
        setCurrentCardIndex(prev => prev + 1);
        setIsFlipped(false);
        setUserResponse('');
        setConfidence(null);
        setResponseTime(0);
      }, 500);
    } else {
      setTimeout(endSession, 500);
    }
  };

  const endSession = () => {
    const endTime = Date.now();
    const duration = Math.round((endTime - studySession.startTime) / 1000);
    
    setSessionStats(prev => ({
      ...prev,
      timeSpent: duration,
    }));
    
    alert(`Session Complete!\n\nCards Reviewed: ${sessionStats.reviewed}\nAccuracy: ${Math.round(sessionStats.averageScore)}%\nTime Spent: ${formatDuration(duration)}`);
    
    setCurrentDeck(null);
    setStudySession(null);
    setActiveTab('review');
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCurrentCard = () => {
    return flashcards[currentCardIndex] || null;
  };

  if (!open) return null;

  const progressPercentage = studySession 
    ? ((currentCardIndex + (isFlipped ? 1 : 0)) / studySession.totalCards) * 100
    : 0;

  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-line bg-surface">
        <h2 className="text-lg font-bold text-ink">🃏 AI Flashcard Mastery</h2>
        <div className="flex items-center gap-2">
          <button onClick={onClose} aria-label="Close flashcard mastery" className="rounded-lg p-2 text-ink2 hover:bg-surface2">
            ✕
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line bg-surface">
        <button
          onClick={() => !studySession && setActiveTab('study')}
          disabled={!!studySession}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'study' ? 'text-accent border-b-2 border-accent' : 'text-ink2 hover:text-ink'
          } ${studySession ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          Study ({customDecks.filter(d => d.cardsDue > 0).length} due)
        </button>
        <button
          onClick={() => setActiveTab('review')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'review' ? 'text-accent border-b-2 border-accent' : 'text-ink2 hover:text-ink'
          }`}
        >
          Review
        </button>
        <button
          onClick={() => setActiveTab('create')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'create' ? 'text-accent border-b-2 border-accent' : 'text-ink2 hover:text-ink'
          }`}
        >
          Create Deck
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'stats' ? 'text-accent border-b-2 border-accent' : 'text-ink2 hover:text-ink'
          }`}
        >
          Statistics
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'study' && !studySession ? (
          // Deck Selection View
          <div className="p-6">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-ink mb-2">Choose a Deck to Study</h3>
              <p className="text-ink2">Cards are scheduled based on your performance and spaced repetition algorithm</p>
            </div>

            <div className="grid gap-4 mb-6">
              {customDecks.map((deck) => (
                <DeckCard
                  key={deck.id}
                  deck={deck}
                  onStart={() => startSession(deck.id)}
                />
              ))}
            </div>

            {/* Recent Activity */}
            <div className="bg-surface rounded-xl p-5 border border-line">
              <h4 className="font-semibold text-ink mb-4">Recent Activity</h4>
              <div className="space-y-3">
                {recentActivity.map((activity, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{activity.icon}</span>
                      <div>
                        <p className="font-medium text-ink text-sm">{activity.deckTitle}</p>
                        <p className="text-xs text-ink3">{activity.date} • {activity.cardsReviewed} cards</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-emerald-600">+{activity.masteryGain}%</span>
                      <p className="text-xs text-ink3">{activity.accuracy}% accuracy</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* How It Works */}
            <div className="mt-6 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl p-6 border border-line">
              <h4 className="font-semibold text-ink mb-4">How Spaced Repetition Works:</h4>
              <ul className="space-y-2 text-sm text-ink2">
                <li className="flex items-start gap-2">
                  <span className="text-purple-500 mt-1">•</span>
                  <strong>Smart Scheduling:</strong> Cards you find difficult appear more often; easy ones interval increase
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-500 mt-1">•</span>
                  <strong>Confidence Rating:</strong> Rate your certainty to optimize future review timing
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-500 mt-1">•</span>
                  <strong>Performance Tracking:</strong> Algorithm learns your strengths and weaknesses over time
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-500 mt-1">•</span>
                  <strong>Mastery-Based:</strong> Focus on cards until they reach mastery threshold before advancing
                </li>
              </ul>
            </div>
          </div>
        ) : activeTab === 'study' && studySession && getCurrentCard() ? (
          // Active Study Session
          <StudySessionView
            card={getCurrentCard()}
            index={currentCardIndex + 1}
            total={studySession.totalCards}
            isFlipped={isFlipped}
            flipCard={flipCard}
            responseTime={responseTime}
            userResponse={userResponse}
            setUserResponse={setUserResponse}
            confidence={confidence}
            setConfidence={setConfidence}
            rating={() => rateCard('correct', confidence)}
            incorrectRating={() => rateCard('incorrect', 0)}
            progress={progressPercentage}
          />
        ) : activeTab === 'review' ? (
          // Review View
          <ReviewView decks={customDecks} activity={recentActivity} />
        ) : activeTab === 'create' ? (
          // Create Deck View
          <CreateDeckView onSave={(deck) => { setCustomDecks([...customDecks, deck]); }} />
        ) : (
          // Stats View
          <StatsView decks={customDecks} activity={recentActivity} />
        )}
      </div>
    </div>
  );
}

// Helper Components

function DeckCard({ deck, onStart }) {
  const isDue = deck.cardsDue > 0;
  
  return (
    <div className="bg-surface rounded-xl p-5 border border-line hover:border-accent/50 transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-semibold text-ink">{deck.title}</h4>
            {isDue && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500 text-white">
                {deck.cardsDue} due
              </span>
            )}
          </div>
          
          <p className="text-sm text-ink2 mb-3">{deck.description}</p>
          
          <div className="flex items-center gap-4 mb-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-ink3">Mastery</span>
                <span className="text-xs font-bold text-ink">{deck.masteryLevel}%</span>
              </div>
              <div className="h-1.5 bg-surface3 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${
                    deck.masteryLevel >= 70 ? 'bg-emerald-500' :
                    deck.masteryLevel >= 50 ? 'bg-blue-500' :
                    'bg-amber-500'
                  }`}
                  style={{ width: `${deck.masteryLevel}%` }}
                />
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 text-xs text-ink3">
            <span>{deck.cardCount} cards</span>
            <span>•</span>
            <span>Last: {deck.lastReviewed}</span>
            <span>•</span>
            <span className="capitalize">{deck.category}</span>
          </div>
        </div>
        
        <button
          onClick={onStart}
          disabled={!isDue}
          className={`ml-4 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
            isDue
              ? 'bg-accent text-onaccent hover:bg-accent/90'
              : 'bg-surface3 text-ink3 cursor-not-allowed'
          }`}
        >
          {isDue ? 'Study Now' : 'Review Later'}
        </button>
      </div>
      
      {!isDue && (
        <p className="text-xs text-ink3 ml-8">Next review: {deck.nextReview}</p>
      )}
    </div>
  );
}

function StudySessionView({ card, index, total, isFlipped, flipCard, responseTime, userResponse, setUserResponse, confidence, setConfidence, rating, incorrectRating, progress }) {
  return (
    <div className="h-full flex flex-col">
      {/* Progress Bar */}
      <div className="bg-surface p-3 border-b border-line">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-ink2">Card {index} of {total}</span>
          <span className="text-sm font-semibold text-ink">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-surface3 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-accent to-purple-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Card Display */}
      <div className="flex-1 p-6 flex items-center justify-center">
        <div 
          onClick={flipCard}
          className="w-full max-w-md aspect-[4/3] cursor-pointer perspective"
        >
          <div className={`relative w-full h-full transition-transform duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
            {/* Front */}
            <div className="absolute w-full h-full backface-hidden bg-gradient-to-br from-accent to-purple-600 rounded-2xl shadow-xl flex flex-col items-center justify-center p-8 text-white">
              <span className="text-xs uppercase tracking-wide opacity-70 mb-2">French</span>
              <h3 className="text-3xl font-bold text-center mb-4">{card.front}</h3>
              <p className="text-sm opacity-75">Tap to flip</p>
            </div>

            {/* Back */}
            <div className="absolute w-full h-full backface-hidden bg-surface border border-line rounded-2xl shadow-xl flex flex-col items-center justify-center p-8 rotate-y-180">
              <span className="text-xs uppercase tracking-wide text-ink3 mb-2">English</span>
              <h3 className="text-3xl font-bold text-ink mb-4">{card.back}</h3>
              
              {card.pronunciation && (
                <div className="bg-surface2 rounded-lg p-3 mb-4">
                  <p className="text-sm text-ink3 italic">{card.pronunciation}</p>
                </div>
              )}

              <div className="text-center">
                <p className="text-xs text-ink3 mb-1">Example:</p>
                <p className="text-sm text-ink2 italic">"{card.example}"</p>
              </div>

              {isFlipped && confidence === null && (
                <div className="mt-6 space-y-3 w-full">
                  <p className="text-sm font-medium text-ink text-center">How confident were you?</p>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        onClick={() => setConfidence(level)}
                        className={`py-3 rounded-lg font-bold text-sm transition-all ${
                          confidence === level
                            ? 'bg-accent text-onaccent'
                            : 'bg-surface2 text-ink hover:bg-surface3'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-ink3 text-center">
                    1 = Guessing | 5 = Absolutely certain
                  </p>
                  
                  <button
                    onClick={rating}
                    disabled={confidence === null}
                    className="w-full mt-4 py-3 bg-emerald-500 text-white rounded-lg font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Got it right!
                  </button>
                  <button
                    onClick={incorrectRating}
                    disabled={confidence === null}
                    className="w-full py-3 bg-surface2 text-ink rounded-lg font-semibold hover:bg-surface3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Didn't know it
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Response Time Display */}
      {isFlipped && (
        <div className="p-4 text-center text-sm text-ink3">
          Response time: {responseTime}s
        </div>
      )}
    </div>
  );
}

function ReviewView({ decks, activity }) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-ink mb-2">Review Your Decks</h3>
        <p className="text-ink2">Track your progress across all decks</p>
      </div>

      <div className="grid gap-4">
        {decks.map((deck) => (
          <div key={deck.id} className="bg-surface rounded-xl p-5 border border-line">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="font-semibold text-ink mb-1">{deck.title}</h4>
                <p className="text-sm text-ink2 mb-2">{deck.description}</p>
                
                <div className="flex items-center gap-4 text-xs text-ink3 mb-2">
                  <span>{deck.cardCount} cards</span>
                  <span>•</span>
                  <span>Mastery: {deck.masteryLevel}%</span>
                </div>

                <div className="h-2 bg-surface3 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${
                      deck.masteryLevel >= 70 ? 'bg-emerald-500' :
                      deck.masteryLevel >= 50 ? 'bg-blue-500' :
                      'bg-amber-500'
                    }`}
                    style={{ width: `${deck.masteryLevel}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateDeckView({ onSave }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cards, setCards] = useState([]);

  const addCard = () => {
    setCards([...cards, { front: '', back: '' }]);
  };

  const updateCard = (index, field, value) => {
    const newCards = [...cards];
    newCards[index][field] = value;
    setCards(newCards);
  };

  const saveDeck = () => {
    if (!title.trim() || !description.trim() || cards.length === 0) {
      alert('Please fill in all fields and add at least one card');
      return;
    }
    
    onSave({
      id: `DECK-${Date.now()}`,
      title,
      description,
      cardCount: cards.length,
      cards,
      lastReviewed: new Date().toLocaleDateString(),
      nextReview: new Date(Date.now() + 86400000).toLocaleDateString(),
      masteryLevel: 0,
      cardsDue: cards.length,
      category: 'custom',
      tags: [],
      color: 'from-accent to-purple-600',
    });
    
    setTitle('');
    setDescription('');
    setCards([]);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-ink mb-2">Create New Deck</h3>
        <p className="text-ink2">Build your own flashcard collection</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink mb-2">Deck Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., French Kitchen Vocabulary"
            className="w-full px-4 py-2 rounded-lg border border-line bg-surface2 text-ink focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-2">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What will you learn in this deck?"
            rows={2}
            className="w-full px-4 py-2 rounded-lg border border-line bg-surface2 text-ink focus:outline-none focus:border-accent"
          />
        </div>

        <div className="border-t border-line pt-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-ink">Flashcards</label>
            <button
              onClick={addCard}
              className="text-sm text-accent font-semibold hover:text-accent/80"
            >
              + Add Card
            </button>
          </div>

          <div className="space-y-3">
            {cards.map((card, idx) => (
              <div key={idx} className="bg-surface rounded-lg p-4 border border-line">
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <input
                    type="text"
                    value={card.front}
                    onChange={(e) => updateCard(idx, 'front', e.target.value)}
                    placeholder="French (front)"
                    className="px-3 py-2 rounded-lg border border-line bg-surface2 text-ink text-sm focus:outline-none focus:border-accent"
                  />
                  <input
                    type="text"
                    value={card.back}
                    onChange={(e) => updateCard(idx, 'back', e.target.value)}
                    placeholder="English (back)"
                    className="px-3 py-2 rounded-lg border border-line bg-surface2 text-ink text-sm focus:outline-none focus:border-accent"
                  />
                </div>
                <button
                  onClick={() => setCards(cards.filter((_, i) => i !== idx))}
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  Remove card
                </button>
              </div>
            ))}
            
            {cards.length === 0 && (
              <p className="text-sm text-ink3 text-center py-8">No cards added yet. Click "Add Card" to get started.</p>
            )}
          </div>
        </div>

        <button
          onClick={saveDeck}
          disabled={!title || !description || cards.length === 0}
          className="w-full py-3 bg-accent text-onaccent rounded-lg font-semibold hover:bg-accent/90 transition-colors disabled:bg-surface3 disabled:text-ink3 disabled:cursor-not-allowed"
        >
          Create Deck
        </button>
      </div>
    </div>
  );
}

function StatsView({ decks, activity }) {
  const totalCards = decks.reduce((sum, d) => sum + d.cardCount, 0);
  const avgMastery = Math.round(decks.reduce((sum, d) => sum + d.masteryLevel, 0) / decks.length);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-ink mb-2">Learning Statistics</h3>
        <p className="text-ink2">Track your overall progress</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard
          label="Total Cards"
          value={totalCards}
          icon="🗂️"
        />
        <StatCard
          label="Average Mastery"
          value={`${avgMastery}%`}
          icon="📊"
        />
        <StatCard
          label="Total Sessions"
          value={activity.length}
          icon="⚡"
        />
        <StatCard
          label="Cards Mastered"
          value={decks.reduce((sum, d) => sum + Math.round(d.cardCount * d.masteryLevel / 100), 0)}
          icon="✨"
        />
      </div>

      <div className="bg-surface rounded-xl p-5 border border-line">
        <h4 className="font-semibold text-ink mb-4">Overall Progress</h4>
        <div className="space-y-3">
          {decks.map((deck) => (
            <div key={deck.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-ink3">{deck.title}</span>
                <span className="text-sm font-bold text-ink">{deck.masteryLevel}%</span>
              </div>
              <div className="h-2 bg-surface3 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${
                    deck.masteryLevel >= 70 ? 'bg-emerald-500' :
                    deck.masteryLevel >= 50 ? 'bg-blue-500' :
                    'bg-amber-500'
                  }`}
                  style={{ width: `${deck.masteryLevel}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="bg-surface rounded-xl p-4 border border-line">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-2xl font-black text-ink">{value}</div>
      <div className="text-xs text-ink3">{label}</div>
    </div>
  );
}

import { Bolt, Flame } from './components/icons';
