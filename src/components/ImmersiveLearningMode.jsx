/**
 * ImmersiveLearningMode - Context-aware vocabulary acquisition with visual anchors
 * Scenarios tagged to real-world images for deeper memory encoding
 */
export default function ImmersiveLearningMode({ open, onClose }) {
  const [activeScenario, setActiveScenario] = useState(null);
  const [sessionMode, setSessionMode] = useState('discover'); // discover | practice | quiz
  const [progress, setProgress] = useState(0);
  const [selectedImage, setSelectedImage] = useState(null);
  const [scoringResult, setScoringResult] = useState(null);
  const [streakCount, setStreakCount] = useState(0);

  const [immersionCards, setImmersionCards] = useState([
    {
      id: 'IMG001',
      title: 'Café Ordering',
      description: 'Master the complete café experience',
      difficulty: 'beginner',
      vocabCount: 24,
      completed: false,
      scenarioId: 'CAF-001',
      tags: ['food', 'social', 'travel'],
      imageUrls: [
        '/scenes/cafe-counter.jpg',
        '/scenes/barista-preparing.jpg',
        '/scenes/coffee-drink.jpg',
      ],
      learnings: [
        { word: 'un café', phonetic: '/kafe/', phrase: 'Je voudrais un café, s\'il vous plaît.', context: 'Ordering' },
        { word: 'un croissant', phonetic: '/kʁwasɑ̃/', phrase: 'Un croissant aussi, merci.', context: 'Food item' },
        { word: 'l\'addition', phonetic: '/ladisjɔ̃/', phrase: L'L\'addition, s\'il vous plaît.', context: 'Payment' },
        { word: 'payer', phonetic: '/paje/', phrase: 'Je peux payer par carte?', context: 'Payment method' }
      ]
    },
    {
      id: 'IMG002',
      title: 'Market Shopping',
      description: 'Navigate French markets like a local',
      difficulty: 'intermediate',
      vocabCount: 38,
      completed: false,
      scenarioId: 'MKT-001',
      tags: ['shopping', 'food', 'numbers'],
      imageUrls: [
        '/scenes/market-stall.jpg',
        '/scenes/fresh-produce.jpg',
        '/scenes/cheese-section.jpg',
      ],
      learnings: [
        { word: 'combien ça coûte?', phonetic: '/kɔbjɛ̃ sa kut/', phrase: 'Combien ça coûte le kilo?', context: 'Price inquiry' },
        { word: 'c\'est cher', phonetic: '/sɛ ʃɛr/', phrase: 'C\'est un peu cher!', context: 'Negotiation' },
        { word: 'une livre', phonetic: '/y livʁ/', phrase: 'Je prends une livre de pommes.', context: 'Weight measurement' },
      ]
    },
    {
      id: 'IMG003',
      title: 'Train Station',
      description: 'Confidently handle travel logistics',
      difficulty: 'advanced',
      vocabCount: 45,
      completed: false,
      scenarioId: 'TRN-001',
      tags: ['travel', 'navigation', 'emergency'],
      imageUrls: [
        '/scenes/train-station-hall.jpg',
        '/scenes/ticket-machine.jpg',
        '/scenes/platform-board.jpg',
      ],
      learnings: [
        { word: 'un aller-simple', phonetic: '/y n ale sɛpl/', phrase: 'Je voudrais un aller-simple pour Lyon.', context: 'Ticket type' },
        { word: 'le quai', phonetic: '/lə kai/', phrase: 'De quel quai part le train?', context: 'Platform question' },
        { word: 'retard', phonetic: '/ʁtaʁ/', phrase: 'Le train est en retard.', context: 'Delay information' },
      ]
    },
  ]);

  const selectedCard = useMemo(() => 
    immersionCards.find(c => c.id === activeScenario), 
    [immersionCards, activeScenario]
  );

  useEffect(() => {
    if (!open) return;
    
    // Simulate progress tracking
    const timer = setTimeout(() => {
      setProgress(Math.min(100, progress + 15));
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [open]);

  const startDiscovery = (cardId) => {
    const card = immersionCards.find(c => c.id === cardId);
    setActiveScenario(card);
    setSessionMode('discover');
    setSelectedImage(card.imageUrls[0]);
    setProgress(0);
    setStreakCount(0);
  };

  const completeDiscovery = () => {
    setSessionMode('practice');
  };

  const submitPracticeAnswer = (answer) => {
    const correct = answer === 'correct'; // Simplified for demo
    setScoringResult(correct ? { success: true, xp: 25 } : { success: false, xp: 0 });
    
    setTimeout(() => {
      setScoringResult(null);
      setProgress(prev => Math.min(100, prev + 20));
      setStreakCount(prev => correct ? prev + 1 : 0);
      
      if (progress >= 100) {
        setSessionMode('completed');
      } else {
        setSessionMode('quiz');
      }
    }, 1500);
  };

  const exitMode = () => {
    setActiveScenario(null);
    setSessionMode('discover');
    setProgress(0);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-line bg-surface">
        <h2 className="text-lg font-bold text-ink">🖼️ Immersive Learning</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-semibold">
            <Flame size={16} />
            {streakCount} streak
          </div>
          <button onClick={onClose} aria-label="Close immersive learning" className="rounded-lg p-2 text-ink2 hover:bg-surface2">
            ✕
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {activeScenario && (
        <div className="bg-surface p-3 border-b border-line">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-ink2">Progress</span>
            <span className="text-sm font-semibold text-ink">{progress}%</span>
          </div>
          <div className="h-2 bg-surface3 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-accent to-purple-600 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {!activeScenario ? (
          // Discovery View - Card Grid
          <div className="p-6">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-ink mb-2">Discover Real-World Contexts</h3>
              <p className="text-ink2">Select an immersive scene to explore authentic vocabulary in context</p>
            </div>

            <div className="grid gap-6">
              {immersionCards.map((card) => (
                <ImmerseCard
                  key={card.id}
                  card={card}
                  onStart={() => startDiscovery(card.id)}
                />
              ))}
            </div>

            {/* Benefits Section */}
            <div className="mt-8 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl p-6 border border-line">
              <h4 className="font-semibold text-ink mb-3">Why Immersive Learning Works:</h4>
              <ul className="space-y-2 text-sm text-ink2">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-1">✓</span>
                  <strong>Visual anchoring:</strong> Images create stronger memory pathways than words alone
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-1">✓</span>
                  <strong>Situational context:</strong> Learn phrases you'll actually use in real scenarios
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-1">✓</span>
                  <strong>Scaffolded complexity:</strong> Start simple, build confidence through layers
                </li>
              </ul>
            </div>
          </div>
        ) : (
          // Active Session Views
          <>
            {sessionMode === 'discover' && selectedCard && (
              <ImmersiveDiscoveryView
                card={selectedCard}
                selectedImage={selectedImage}
                onSelectImage={setSelectedImage}
                onComplete={completeDiscovery}
                onExit={exitMode}
              />
            )}

            {sessionMode === 'practice' && (
              <PracticeQuizView
                card={selectedCard}
                onSubmit={submitPracticeAnswer}
                onNext={() => {
                  setSessionMode('quiz');
                  setProgress(prev => Math.min(100, prev + 30));
                }}
              />
            )}

            {sessionMode === 'quiz' && scoringResult === null && (
              <ReviewQuizView
                card={selectedCard}
                scoreResult={scoringResult}
                onSubmit={submitPracticeAnswer}
                onRetakeAll={() => {
                  setProgress(0);
                  setSessionMode('practice');
                }}
                onContinue={exitMode}
              />
            )}

            {sessionMode === 'completed' && (
              <CompletionView
                card={selectedCard}
                finalXP={Math.round(progress / 100 * 100)}
                onDone={exitMode}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Helper Components

function ImmerseCard({ card, onStart }) {
  return (
    <div 
      onClick={onStart}
      className="bg-surface rounded-xl overflow-hidden border border-line hover:border-accent/50 transition-all cursor-pointer group"
    >
      <div className="aspect-video bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 relative">
        {/* Simulated image placeholder */}
        <div className="absolute inset-0 flex items-center justify-center text-white">
          <span className="text-6xl opacity-50">🎨</span>
        </div>
        
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button className="bg-white/90 text-ink px-6 py-3 rounded-lg font-semibold hover:bg-white transition-colors">
            Explore Scene
          </button>
        </div>
        
        <div className="absolute top-3 left-3">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            card.difficulty === 'beginner' ? 'bg-emerald-500/90 text-white' :
            card.difficulty === 'intermediate' ? 'bg-blue-500/90 text-white' :
            'bg-purple-500/90 text-white'
          }`}>
            {card.difficulty.charAt(0).toUpperCase() + card.difficulty.slice(1)}
          </span>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-semibold text-ink text-lg">{card.title}</h4>
          <span className="text-sm text-ink3">{card.vocabCount} words</span>
        </div>
        
        <p className="text-sm text-ink2 mb-3">{card.description}</p>
        
        <div className="flex items-center gap-2 mb-3">
          {card.tags.slice(0, 3).map((tag, idx) => (
            <span key={idx} className="text-xs px-2 py-1 rounded-md bg-surface2 text-ink3 capitalize">
              {tag}
            </span>
          ))}
        </div>

        {!card.completed && (
          <div className="flex items-center justify-between pt-3 border-t border-line">
            <button 
              onClick={(e) => { e.stopPropagation(); onStart(); }}
              className="text-accent font-semibold text-sm hover:text-accent/80"
            >
              Start Learning →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ImmersiveDiscoveryView({ card, selectedImage, onSelectImage, onComplete, onExit }) {
  return (
    <div className="h-full flex flex-col">
      {/* Image Display */}
      <div className="relative aspect-video bg-gradient-to-br from-blue-500 to-purple-600">
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-8xl opacity-30">🌍</span>
        </div>

        {/* Image gallery thumbnails */}
        <div className="absolute bottom-4 left-4 right-4 flex gap-2 overflow-x-auto pb-2">
          {card.imageUrls.map((img, idx) => (
            <button
              key={idx}
              onClick={() => onSelectImage(img)}
              className={`flex-shrink-0 w-20 h-14 rounded-lg border-2 transition-all ${
                selectedImage === img ? 'border-white' : 'border-white/30 opacity-60 hover:opacity-100'
              }`}
            />
          ))}
        </div>

        {/* Close button */}
        <button onClick={onExit} className="absolute top-4 right-4 w-10 h-10 grid place-items-center rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors">
          ✕
        </button>
      </div>

      {/* Vocabulary Cards */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-ink">Key Vocabulary</h3>
          <button
            onClick={onComplete}
            className="bg-accent text-onaccent px-5 py-2.5 rounded-lg font-semibold hover:bg-accent/90 transition-colors"
          >
            Continue to Practice →
          </button>
        </div>

        <div className="space-y-4">
          {card.learnings.map((item, idx) => (
            <VocabCard key={idx} vocabItem={item} index={idx + 1} />
          ))}
        </div>

        {/* Pronunciation Tips */}
        <div className="mt-8 bg-surface2 rounded-xl p-5 border border-line">
          <h4 className="font-semibold text-ink mb-3 flex items-center gap-2">
            🎤 Pronunciation Guide
          </h4>
          <ul className="space-y-2 text-sm text-ink2">
            <li>• Listen carefully to each phonetic transcription</li>
            <li>• Repeat phrases aloud slowly at first</li>
            <li>• Record yourself and compare to native audio</li>
            <li>• Focus on nasal sounds (an, en, in, on, un)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function VocabCard({ vocabItem, index }) {
  return (
    <div className="bg-surface rounded-xl p-5 border border-line hover:border-accent/30 transition-colors">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-accent to-purple-600 text-white flex items-center justify-center font-bold text-sm">
          {index}
        </div>
        
        <div className="flex-1">
          <h5 className="font-semibold text-ink text-lg mb-1">{vocabItem.word}</h5>
          
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm text-ink3 font-mono bg-surface2 px-2 py-1 rounded">
              {vocabItem.phonetic}
            </span>
            <button className="text-accent hover:text-accent/80 transition-colors" aria-label="Play pronunciation">
              🔊
            </button>
          </div>

          <div className="bg-surface2 rounded-lg p-3 mb-2">
            <p className="text-ink font-medium">{vocabItem.phrase}</p>
          </div>

          <p className="text-sm text-ink3 italic">"{vocabItem.context}"</p>
        </div>
      </div>
    </div>
  );
}

function PracticeQuizView({ card, onSubmit, onNext }) {
  const [selectedAnswer, setSelectedAnswer] = useState(null);

  const questions = [
    {
      id: 1,
      prompt: "How do you say 'I would like' in French?",
      options: [
        { text: "Je voudrais", correct: true, feedback: "Perfect! Used for polite requests" },
        { text: "J'aime", correct: false, feedback: "This means 'I like' - good but not quite right" },
        { text: "Je veux", correct: false, feedback: "Too direct - lacks politeness" },
      ],
    },
    {
      id: 2,
      prompt: "What's the correct article for 'café'?",
      options: [
        { text: "la café", correct: false, feedback: "Caft is masculine, not feminine" },
        { text: "un café", correct: true, feedback: "Excellent! Masculine singular" },
        { text: "le café", correct: false, feedback: "Grammatically possible, but 'un' is more natural when ordering" },
      ],
    },
  ];

  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-ink">Test Your Understanding</h3>
        <span className="text-sm text-ink3">Question {selectedAnswer ? '2' : '1'} of 2</span>
      </div>

      <div className="flex-1 space-y-6">
        {questions.map((q, idx) => (
          <div key={q.id} className="bg-surface rounded-xl p-6 border border-line">
            <h4 className="font-semibold text-ink mb-4">{q.prompt}</h4>
            
            <div className="space-y-3">
              {q.options.map((option, optIdx) => (
                <button
                  key={optIdx}
                  onClick={() => {
                    setSelectedAnswer(option.correct ? 'correct' : 'incorrect');
                    onSubmit(option.correct);
                  }}
                  disabled={!!selectedAnswer}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                    selectedAnswer === 'correct' && option.correct
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700'
                      : selectedAnswer === 'incorrect' && !option.correct
                      ? 'border-red-500 bg-red-500/10 text-red-700'
                      : 'border-line hover:border-accent/50'
                  }`}
                >
                  {option.text}
                </button>
              ))}
            </div>

            {selectedAnswer && (
              <div className={`mt-4 p-3 rounded-lg ${
                selectedAnswer === 'correct' ? 'bg-emerald-500/10' : 'bg-red-500/10'
              }`}>
                <p className="text-sm text-ink2">{q.options.find(o => o.text === (selectedAnswer === 'correct' ? q.options[0].text : q.options[2].text))?.feedback || 'Good effort!'}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedAnswer && (
        <div className="mt-6">
          <button
            onClick={onNext}
            className="w-full bg-accent text-onaccent py-3.5 rounded-xl font-semibold hover:bg-accent/90 transition-colors"
          >
            Continue Learning
          </button>
        </div>
      )}
    </div>
  );
}

function ReviewQuizView({ card, scoreResult, onSubmit, onRetakeAll, onContinue }) {
  return (
    <div className="h-full flex flex-col p-6">
      <div className="text-center mb-6">
        <div className="w-20 h-20 mx-auto rounded-full bg-accent/10 text-accent flex items-center justify-center text-3xl mb-3">
          ✓
        </div>
        <h3 className="text-2xl font-bold text-ink mb-2">Great Progress!</h3>
        <p className="text-ink2">You've mastered {card.learnings.length} essential phrases</p>
      </div>

      <div className="flex-1 space-y-4">
        {/* Achievement Summary */}
        <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-xl p-5 border border-emerald-500/30">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">🏆</span>
            <div>
              <p className="font-semibold text-ink">Scene Master Badge Unlocked!</p>
              <p className="text-sm text-ink2">Keep building your vocabulary collection</p>
            </div>
          </div>
        </div>

        {/* Quick Review Cards */}
        <div className="bg-surface rounded-xl p-5 border border-line">
          <h4 className="font-semibold text-ink mb-4">Quick Review</h4>
          <div className="space-y-3">
            {card.learnings.slice(0, 3).map((item, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-surface2">
                <p className="font-medium text-ink">{item.word}</p>
                <p className="text-sm text-ink3 italic">{item.phrase}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onRetakeAll}
          className="flex-1 bg-surface2 text-ink py-3 rounded-xl font-semibold hover:bg-surface3 transition-colors"
        >
          Retake All
        </button>
        <button
          onClick={onContinue}
          className="flex-1 bg-accent text-onaccent py-3 rounded-xl font-semibold hover:bg-accent/90 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function CompletionView({ card, finalXP, onDone }) {
  return (
    <div className="h-full flex flex-col p-6">
      <div className="text-center py-8">
        <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-4xl mb-4 animate-bounce">
          🎉
        </div>
        
        <h2 className="text-3xl font-black text-ink mb-2">Lesson Complete!</h2>
        <p className="text-lg text-ink2 mb-6">You've mastered "{card.title}"</p>
        
        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 px-6 py-4 rounded-2xl border border-amber-500/30 mb-8">
          <Bolt size={24} className="text-amber-500" />
          <span className="text-4xl font-black text-amber-500">{finalXP}</span>
          <span className="text-ink3">XP earned</span>
        </div>

        <div className="bg-surface rounded-xl p-5 mb-6">
          <h4 className="font-semibold text-ink mb-3">What You Learned:</h4>
          <ul className="space-y-2 text-sm text-ink2">
            {card.learnings.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">✓</span>
                <span><strong>{item.word}</strong> - {item.phrase}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onDone}
          className="flex-1 bg-surface2 text-ink py-3 rounded-xl font-semibold hover:bg-surface3 transition-colors"
        >
          Back to Hub
        </button>
        <button
          onClick={onDone}
          className="flex-1 bg-accent text-onaccent py-3 rounded-xl font-semibold hover:bg-accent/90 transition-colors"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// Need these icons imported elsewhere
import { Flame, Bolt } from './components/icons';
