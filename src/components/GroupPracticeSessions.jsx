import { useState, useEffect } from 'react';
/**
 * GroupPracticeSessions - Real-time collaborative learning sessions
 * Multi-user audio rooms with synchronized exercises and live AI feedback
 */
export default function GroupPracticeSessions({ open, onClose }) {
  const [activeTab, setActiveTab] = useState('live'); // live | scheduled | recordings
  const [currentSession, setCurrentSession] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [sessionStats, setSessionStats] = useState({
    duration: 0,
    totalXP: 0,
    participants: 0,
    averageScore: 0,
  });

  const [availableSessions, setAvailableSessions] = useState([
    {
      id: 'GRP-LIVE-001',
      title: 'French Café Conversation Circle 🇫🇷',
      description: 'Practice ordering food and small talk with other A2 learners',
      level: 'A2',
      language: 'French',
      hostName: 'Marie (Certified Tutor)',
      participantsCount: 4,
      maxParticipants: 8,
      status: 'active',
      startTime: 'Started 5 min ago',
      estimatedDuration: '30 min',
      tags: ['speaking', 'casual', 'beginner-friendly'],
      joinCode: 'CAFE2024',
      exerciseType: 'conversation',
      aiFeedbackEnabled: true,
    },
    {
      id: 'GRP-LIVE-002',
      title: 'Advanced French Debate Club ⚡',
      description: 'Discuss current events and practice persuasive speaking at B2+ level',
      level: 'C1',
      language: 'French',
      hostName: 'Jean-Paul (Language Coach)',
      participantsCount: 6,
      maxParticipants: 10,
      status: 'active',
      startTime: 'Started 12 min ago',
      estimatedDuration: '45 min',
      tags: ['advanced', 'debate', 'culture'],
      joinCode: 'DEBATE99',
      exerciseType: 'debate',
      aiFeedbackEnabled: true,
    },
  ]);

  const [scheduledSessions, setScheduledSessions] = useState([
    {
      id: 'SCH-001',
      title: 'German Morning Coffee Chat ☕',
      date: 'Today',
      time: '7:00 PM CET',
      level: 'A1-A2',
      language: 'German',
      hostName: 'Anna',
      spotsRemaining: 3,
      maxSpots: 6,
      tags: ['casual', 'vocabulary'],
    },
    {
      id: 'SCH-002',
      title: 'Business French for Professionals 💼',
      date: 'Tomorrow',
      time: '9:00 AM EST',
      level: 'B1+',
      language: 'French',
      hostName: 'Sophie (Business Coach)',
      spotsRemaining: 5,
      maxSpots: 8,
      tags: ['professional', 'formal'],
    },
  ]);

  const [recordings, setRecordings] = useState([
    {
      id: 'REC-001',
      title: 'Week 3 Travel French Review',
      date: 'Oct 18, 2024',
      duration: '28 min',
      participants: 5,
      averageScore: 84,
      keyLearnings: ['Making reservations', 'Asking directions', 'Handling delays'],
    },
  ]);

  useEffect(() => {
    if (!open) return;

    // Simulate participant data updates
    const interval = setInterval(() => {
      if (currentSession) {
        setSessionStats(prev => ({
          ...prev,
          duration: prev.duration + 1,
        }));
      }
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [open, currentSession]);

  const joinSession = async (sessionId) => {
    const session = availableSessions.find(s => s.id === sessionId);
    if (session && session.participantsCount < session.maxParticipants) {
      setCurrentSession(session);
      setParticipants([
        { id: 'YOU', name: 'You', isSelf: true, avatarId: 1, status: 'ready' },
        { id: 'PRT001', name: session.hostName, isHost: true, avatarId: 5, status: 'speaking' },
        { id: 'PRT002', name: 'Emma', avatarId: 3, status: 'listening' },
        { id: 'PRT003', name: 'Lucas', avatarId: 7, status: 'listening' },
      ]);
      
      // Start simulated exercise
      startExercise('warmup-intro');
    }
  };

  const startExercise = (type) => {
    const exercises = {
      'warmup-intro': {
        id: 'EX001',
        type: 'introduction',
        prompt: 'Introduce yourself and share why you\'re learning French',
        timeLimit: 60,
        scoreWeight: 1.0,
      },
      'scenario-practice': {
        id: 'EX002',
        type: 'roleplay',
        prompt: 'Order a meal at a Parisian café – be specific about your preferences',
        timeLimit: 120,
        scoreWeight: 1.2,
      },
      'freestyle-chat': {
        id: 'EX003',
        type: 'discussion',
        prompt: 'Share your weekend plans using future tense',
        timeLimit: 180,
        scoreWeight: 1.1,
      },
    };
    
    setSelectedExercise(exercises[type]);
  };

  const submitPracticeResponse = (responseText, confidenceScore) => {
    // Simulate AI analysis of spoken response
    const analysis = analyzeSpokenResponse(responseText, selectedExercise);
    
    // Award XP based on quality
    const xpEarned = Math.round(analysis.completionRate * selectedExercise.scoreWeight * 15);
    
    setSessionStats(prev => ({
      ...prev,
      totalXP: prev.totalXP + xpEarned,
      averageScore: (prev.averageScore * (participants.length - 1) + analysis.completionRate) / participants.length,
    }));

    setSelectedExercise(prev => ({
      ...prev,
      userAnalysis: analysis,
    }));

    return { xpEarned, analysis };
  };

  const analyzeSpokenResponse = (text, exercise) => {
    // Simplified analysis for demo - would use real AI backend
    const words = text.toLowerCase().split(/\s+/).length;
    const hasFrenchMarkers = /je\s+voudrais|bonjour|merci|s'il\s+vous\s+plaît/i.test(text);
    const complexityBonus = words > 20 ? 1.2 : words > 10 ? 1.0 : 0.8;
    
    return {
      completionRate: Math.min(100, (words / 15) * 80 * (hasFrenchMarkers ? 1.3 : 1.0)),
      clarityScore: Math.round(Math.random() * 20 + 75),
      fluencyScore: Math.round(Math.random() * 30 + 65),
      vocabularyRichness: words > 25 ? 'excellent' : words > 15 ? 'good' : 'basic',
      suggestions: hasFrenchMarkers 
        ? [] 
        : ['Try adding common French phrases like "s\'il vous plaît" or "merci"'],
    };
  };

  const leaveSession = () => {
    setCurrentSession(null);
    setParticipants([]);
    setSelectedExercise(null);
  };

  if (!open) return null;

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-line bg-surface">
        <h2 className="text-lg font-bold text-ink">🎙️ Group Practice Sessions</h2>
        <div className="flex items-center gap-2">
          <button onClick={onClose} aria-label="Close group sessions" className="rounded-lg p-2 text-ink2 hover:bg-surface2">
            ✕
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line bg-surface">
        <button
          onClick={() => setActiveTab('live')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'live' ? 'text-accent border-b-2 border-accent' : 'text-ink2 hover:text-ink'
          }`}
        >
          Live Now ({availableSessions.filter(s => s.status === 'active').length})
        </button>
        <button
          onClick={() => setActiveTab('scheduled')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'scheduled' ? 'text-accent border-b-2 border-accent' : 'text-ink2 hover:text-ink'
          }`}
        >
          Scheduled ({scheduledSessions.length})
        </button>
        <button
          onClick={() => setActiveTab('recordings')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'recordings' ? 'text-accent border-b-2 border-accent' : 'text-ink2 hover:text-ink'
          }`}
        >
          Recordings ({recordings.length})
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {!currentSession ? (
          <>
            {activeTab === 'live' && (
              <div className="p-6">
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-ink mb-2">Join Active Practice Rooms</h3>
                  <p className="text-ink2">Connect with fellow learners in real-time voice sessions</p>
                </div>

                <div className="grid gap-4 mb-6">
                  {availableSessions.map((session) => (
                    <LiveSessionCard
                      key={session.id}
                      session={session}
                      onJoin={() => joinSession(session.id)}
                      canJoin={session.participantsCount < session.maxParticipants}
                    />
                  ))}
                </div>

                {/* How It Works */}
                <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl p-6 border border-line">
                  <h4 className="font-semibold text-ink mb-4">How Group Practice Works:</h4>
                  <div className="space-y-3 text-sm text-ink2">
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-sm">1</span>
                      <div>
                        <strong>Join a room</strong> - Select an active session matching your level
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-sm">2</span>
                      <div>
                        <strong>Complete guided exercises</strong> - AI provides instant feedback on pronunciation and fluency
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-sm">3</span>
                      <div>
                        <strong>Earn rewards</strong> - Gain XP and insights from peer interactions
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'scheduled' && (
              <ScheduledSessionsView
                sessions={scheduledSessions}
                onRegister={(session) => alert(`Registered for ${session.title}!`)
}
              />
            )}

            {activeTab === 'recordings' && (
              <RecordingsView
                recordings={recordings}
                onPlay={(recording) => alert(`Playing ${recording.title}`)
}
              />
            )}
          </>
        ) : (
          // Active Session View
          <ActiveSessionView
            session={currentSession}
            participants={participants}
            exercise={selectedExercise}
            stats={sessionStats}
            onSubmitResponse={submitPracticeResponse}
            onLeave={leaveSession}
            onStartExercise={startExercise}
          />
        )}
      </div>
    </div>
  );
}

// Helper Components

function LiveSessionCard({ session, onJoin, canJoin }) {
  const levelColors = {
    A1: 'bg-emerald-500/10 text-emerald-600',
    A2: 'bg-green-500/10 text-green-600',
    B1: 'bg-blue-500/10 text-blue-600',
    B2: 'bg-cyan-500/10 text-cyan-600',
    C1: 'bg-purple-500/10 text-purple-600',
    C2: 'bg-pink-500/10 text-pink-600',
  };

  return (
    <div className="bg-surface rounded-xl p-5 border border-line hover:border-accent/50 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-semibold text-ink">{session.title}</h4>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500 text-white animate-pulse">
              LIVE
            </span>
          </div>
          
          <p className="text-sm text-ink2 mb-2">{session.description}</p>
          
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${levelColors[session.level]}`}>
              {session.level}
            </span>
            <span className="text-xs text-ink3">• {session.language}</span>
            <span className="text-xs text-ink3">• Host: {session.hostName}</span>
          </div>

          <div className="flex items-center gap-4 text-xs text-ink3">
            <span>👥 {session.participantsCount}/{session.maxParticipants} participants</span>
            <span>⏱️ Est. {session.estimatedDuration}</span>
            <span>🎯 {session.exerciseType}</span>
          </div>
        </div>
        
        <button
          onClick={onJoin}
          disabled={!canJoin}
          className={`ml-4 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
            canJoin
              ? 'bg-accent text-onaccent hover:bg-accent/90'
              : 'bg-surface3 text-ink3 cursor-not-allowed'
          }`}
        >
          {canJoin ? 'Join Now' : 'Full'}
        </button>
      </div>

      <div className="flex gap-2">
        {session.tags.map((tag, idx) => (
          <span key={idx} className="text-xs px-2 py-1 rounded-md bg-surface2 text-ink3 capitalize">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function ScheduledSessionsView({ sessions, onRegister }) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-ink mb-2">Upcoming Sessions</h3>
        <p className="text-ink2">Reserve your spot in advance</p>
      </div>

      <div className="space-y-4">
        {sessions.map((session) => (
          <ScheduledSessionCard
            key={session.id}
            session={session}
            onRegister={onRegister}
          />
        ))}
      </div>
    </div>
  );
}

function ScheduledSessionCard({ session, onRegister }) {
  return (
    <div className="bg-surface rounded-xl p-5 border border-line">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-semibold text-ink">{session.title}</h4>
            <span className="text-xs px-2 py-0.5 rounded-md bg-surface2 text-ink3">
              {session.date}
            </span>
          </div>
          
          <p className="text-sm text-ink3 mb-2">{session.time}</p>
          
          <div className="flex items-center gap-3 text-xs text-ink2 mb-3">
            <span>{session.level}</span>
            <span>{session.language}</span>
            <span>👥 {session.spotsRemaining}/</span>
          </div>
          
          <div className="flex gap-2 mb-3">
            {session.tags.map((tag, idx) => (
              <span key={idx} className="text-xs px-2 py-1 rounded-md bg-surface2 text-ink3 capitalize">
                {tag}
              </span>
            ))}
          </div>
        </div>
        
        <button
          onClick={() => onRegister(session)}
          className="ml-4 px-4 py-2 bg-accent text-onaccent rounded-lg font-semibold text-sm hover:bg-accent/90 transition-colors"
        >
          Reserve Spot
        </button>
      </div>
    </div>
  );
}

function RecordingsView({ recordings, onPlay }) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-ink mb-2">Past Session Recordings</h3>
        <p className="text-ink2">Review and learn from previous conversations</p>
      </div>

      <div className="space-y-4">
        {recordings.map((recording) => (
          <RecordingCard
            key={recording.id}
            recording={recording}
            onPlay={onPlay}
          />
        ))}
      </div>
    </div>
  );
}

function RecordingCard({ recording, onPlay }) {
  return (
    <div className="bg-surface rounded-xl p-5 border border-line">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-semibold text-ink mb-1">{recording.title}</h4>
          <p className="text-sm text-ink3">{recording.date} • {recording.duration}</p>
        </div>
        <button
          onClick={() => onPlay(recording)}
          className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center hover:bg-accent/20 transition-colors"
          aria-label="Play recording"
        >
          ▶️
        </button>
      </div>

      <div className="flex items-center gap-4 text-sm text-ink2 mb-3">
        <span>👥 {recording.participants} participants</span>
        <span>⭐ Avg score: {recording.averageScore}%</span>
      </div>

      <div className="bg-surface2 rounded-lg p-3">
        <p className="text-xs font-semibold text-ink mb-1">Key Learnings:</p>
        <ul className="text-xs text-ink2 space-y-0.5">
          {recording.keyLearnings.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5">•</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// mm:ss clock for the live-session timer (module scope: it has no state, so
// keeping it out of the component avoids a new function identity per render).
function formatMss(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function ActiveSessionView({ session, participants, exercise, stats, onSubmitResponse, onLeave, onStartExercise }) {
  const [userInput, setUserInput] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [exerciseProgress, setExerciseProgress] = useState(0);

  const handleSubmit = () => {
    if (!userInput.trim()) return;
    setIsSpeaking(true);
    setTimeout(() => {
      onSubmitResponse(userInput, 85);
      setIsSpeaking(false);
      setUserInput('');
      setExerciseProgress(prev => prev + 100);
      setTimeout(() => onStartExercise('freestyle-chat'), 1500);
    }, 2000);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Session Info Bar */}
      <div className="bg-gradient-to-r from-accent/10 to-purple-500/10 p-3 border-b border-line">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-ink text-sm">{session.title}</h4>
            <p className="text-xs text-ink3">With {session.hostName}</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-ink2">
            <span>⏱️ {formatMss(stats.duration)}</span>
            <span>📊 XP: {stats.totalXP}</span>
            <span>👥 {participants.length}/{session.maxParticipants}</span>
          </div>
        </div>
      </div>

      {/* Participants Grid */}
      <div className="p-4 border-b border-line bg-surface">
        <h5 className="text-xs font-semibold text-ink3 mb-3 uppercase tracking-wide">Participants</h5>
        <div className="grid grid-cols-4 gap-3">
          {participants.map((participant) => (
            <div
              key={participant.id}
              className="flex flex-col items-center"
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg mb-1 ${
                participant.isSelf ? 'border-2 border-accent' :
                participant.isHost ? 'border-2 border-yellow-500' : ''
              }`}>
                <img
                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${participant.avatarId}`}
                  alt={participant.name}
                  className="w-full h-full rounded-full"
                />
              </div>
              <span className="text-xs text-ink2 truncate w-full text-center">{participant.name.split(' ')[0]}</span>
              {participant.status === 'speaking' && (
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mt-1" />
              )}
            </div>
          ))}
          {/* Empty slots */}
          {Array.from({ length: Math.max(0, session.maxParticipants - participants.length) }).map((_, idx) => (
            <div key={`empty-${idx}`} className="flex flex-col items-center opacity-30">
              <div className="w-12 h-12 rounded-full bg-surface2 border-2 border-dashed border-line flex items-center justify-center">
                <span className="text-ink3 text-xl">+</span>
              </div>
              <span className="text-xs text-ink3">Empty</span>
            </div>
          ))}
        </div>
      </div>

      {/* Exercise Area */}
      <div className="flex-1 p-4 overflow-y-auto">
        {!exercise ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto rounded-full bg-surface2 flex items-center justify-center text-4xl mb-4">
              🎙️
            </div>
            <h3 className="text-lg font-bold text-ink mb-2">Ready to Practice!</h3>
            <p className="text-ink2 mb-6">Complete exercises to earn XP and improve your skills</p>
            
            <div className="space-y-3 max-w-sm mx-auto">
              <button
                onClick={() => onStartExercise('warmup-intro')}
                className="w-full bg-surface2 text-ink py-3 rounded-xl font-semibold hover:bg-surface3 transition-colors text-left px-4"
              >
                <strong>Introduction Round</strong>
                <p className="text-xs text-ink3 mt-1">Tell us about yourself (60 sec)</p>
              </button>
              <button
                onClick={() => onStartExercise('scenario-practice')}
                className="w-full bg-surface2 text-ink py-3 rounded-xl font-semibold hover:bg-surface3 transition-colors text-left px-4"
              >
                <strong>Scenario Practice</strong>
                <p className="text-xs text-ink3 mt-1">Role-play situations (120 sec)</p>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-surface rounded-xl p-6 border border-line mb-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-ink">
                {exercise.type === 'introduction' && '💬 Introduction Round'}
                {exercise.type === 'roleplay' && '🎭 Scenario Practice'}
                {exercise.type === 'discussion' && '💭 Freestyle Discussion'}
              </h4>
              <span className="text-sm text-ink3">{exercise.timeLimit}s remaining</span>
            </div>
            
            <p className="text-lg text-ink mb-6">{exercise.prompt}</p>
            
            {/* Audio Recording Interface */}
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <button
                  onClick={() => setIsSpeaking(!isSpeaking)}
                  disabled={isSpeaking}
                  className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                    isSpeaking
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'bg-accent text-onaccent hover:bg-accent/90'
                  }`}
                  aria-label={isSpeaking ? 'Stop recording' : 'Start speaking'}
                >
                  {isSpeaking ? (
                    <span className="text-2xl">⏹️</span>
                  ) : (
                    <span className="text-2xl">🎤</span>
                  )}
                </button>
              </div>
              
              {isSpeaking && (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-1 w-1 bg-ink2 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="h-1 w-1 bg-ink2 rounded-full animate-bounce" style={{ animationDelay: '100ms' }} />
                  <div className="h-1 w-1 bg-ink2 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                  <div className="h-1 w-1 bg-ink2 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  <p className="text-sm text-ink2">Listening...</p>
                </div>
              )}
            </div>
            
            {/* Submit Button */}
            {!isSpeaking && (
              <button
                onClick={handleSubmit}
                disabled={!userInput.trim()}
                className={`w-full mt-6 py-3 rounded-xl font-semibold transition-all ${
                  userInput.trim()
                    ? 'bg-accent text-onaccent hover:bg-accent/90'
                    : 'bg-surface3 text-ink3 cursor-not-allowed'
                }`}
              >
                Submit Response
              </button>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="p-4 border-t border-line bg-surface">
        <div className="flex gap-3">
          <button
            onClick={onLeave}
            className="flex-1 bg-surface2 text-ink py-3 rounded-xl font-semibold hover:bg-surface3 transition-colors"
          >
            Leave Session
          </button>
        </div>
      </div>
    </div>
  );
}

import { Bolt, Flame } from './icons';
