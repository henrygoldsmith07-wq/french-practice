/**
 * StudyGroups - Collaborative learning with peers
 * Real-time group sessions, accountability partners, and challenge competitions
 */
export default function StudyGroups({ open, onClose }) {
  const [activeTab, setActiveTab] = useState('groups'); // groups | partners | challenges
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const [joinedGroups, setJoinedGroups] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([
    {
      id: 'GRP001',
      name: 'French Beginners Hub 🇫🇷',
      description: 'A welcoming space for A1-A2 learners to practice together',
      level: 'Beginner',
      membersCount: 47,
      activeMembers: 12,
      language: 'French',
      schedule: 'Daily at 7 PM CET',
      tags: ['beginner', 'speaking', 'casual'],
      createdAt: '2 weeks ago',
      isAdmin: false,
    },
    {
      id: 'GRP002',
      name: 'Advanced French Conversation ⚡',
      description: 'Deep discussions on culture, politics, and literature in French',
      level: 'Advanced',
      membersCount: 23,
      activeMembers: 8,
      language: 'French',
      schedule: 'Mon/Wed/Fri at 9 AM EST',
      tags: ['advanced', 'discussion', 'culture'],
      createdAt: '1 month ago',
      isAdmin: true,
    },
    {
      id: 'GRP003',
      name: 'German Practice Circle 🥨',
      description: 'Mutual help with German vocabulary and grammar exercises',
      level: 'Intermediate',
      membersCount: 35,
      activeMembers: 15,
      language: 'German',
      schedule: 'Tue/Thu at 6 PM GMT',
      tags: ['intermediate', 'vocabulary', 'grammar'],
      createdAt: '3 weeks ago',
      isAdmin: false,
    },
  ]);

  const [studyPartners, setStudyPartners] = useState([
    {
      id: 'PRT001',
      name: 'Maria',
      level: 'A2',
      languages: ['Spanish', 'Learning French'],
      availability: 'Evenings (CET)',
      goals: ['Conversation practice', 'Grammar clarification'],
      matchScore: 92,
      joinedAt: '1 week ago',
      avatarId: 3,
    },
    {
      id: 'PRT002',
      name: 'Chen Wei',
      level: 'B1',
      languages: ['Chinese', 'Learning French & German'],
      availability: 'Mornings (CST)',
      goals: ['Accent improvement', 'Cultural insights'],
      matchScore: 87,
      joinedAt: '3 days ago',
      avatarId: 7,
    },
  ]);

  const [challenges, setChallenges] = useState([
    {
      id: 'CHL001',
      title: 'Week 1 Streak Builder 🔥',
      description: 'Complete 7 consecutive days of practice with a group',
      type: 'streak',
      targetDays: 7,
      participants: 342,
      completionRate: 68,
      rewardXP: 500,
      endsIn: '3 days',
      status: 'active',
    },
    {
      id: 'CHL002',
      title: 'Vocabulary Challenge 💪',
      description: 'Learn 100 new words as a group collective total',
      type: 'vocabulary',
      targetWords: 100,
      participants: 156,
      progress: 73,
      rewardXP: 300,
      endsIn: '5 days',
      status: 'active',
    },
    {
      id: 'CHL003',
      title: 'Speaking Confidence 🎤',
      description: 'Record 5 pronunciation practices shared in group',
      type: 'practice',
      targetSessions: 5,
      participants: 89,
      progress: 12,
      rewardXP: 400,
      endsIn: '7 days',
      status: 'upcoming',
    },
  ]);

  const userStats = useMemo(() => ({
    groupsJoined: 2,
    totalPracticeHours: 12.5,
    challengesCompleted: 3,
    streakDays: 5,
  }), []);

  const createGroup = (formData) => {
    const newGroup = {
      id: `GRP${String(Date.now()).slice(-6)}`,
      ...formData,
      membersCount: 1,
      activeMembers: 0,
      isAdmin: true,
      createdAt: 'Just now',
    };
    
    setAvailableGroups([...availableGroups, newGroup]);
    setShowCreateModal(false);
  };

  const joinGroup = (groupId) => {
    const group = availableGroups.find(g => g.id === groupId);
    if (group && !joinedGroups.find(jg => jg.id === groupId)) {
      setJoinedGroups([...joinedGroups, group]);
      setAvailableGroups(availableGroups.filter(g => g.id !== groupId));
    }
  };

  const leaveGroup = (groupId) => {
    const group = joinedGroups.find(jg => jg.id === groupId);
    if (group) {
      setJoinedGroups(joinedGroups.filter(jg => jg.id !== groupId));
      setAvailableGroups([...availableGroups, group]);
    }
  };

  const acceptChallenge = (challengeId) => {
    console.log(`Accepting challenge ${challengeId}`);
    // Would integrate with real-time backend later
  };

  const startSession = (groupId) => {
    console.log(`Starting session in group ${groupId}`);
    // Placeholder for future WebRTC integration
  };

  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-line bg-surface">
        <h2 className="text-lg font-bold text-ink">👥 Study Groups</h2>
        <div className="flex items-center gap-2">
          <button onClick={onClose} aria-label="Close study groups" className="rounded-lg p-2 text-ink2 hover:bg-surface2">
            ✕
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line bg-surface">
        <button
          onClick={() => setActiveTab('groups')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'groups' ? 'text-accent border-b-2 border-accent' : 'text-ink2 hover:text-ink'
          }`}
        >
          Groups ({availableGroups.length + joinedGroups.length})
        </button>
        <button
          onClick={() => setActiveTab('partners')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'partners' ? 'text-accent border-b-2 border-accent' : 'text-ink2 hover:text-ink'
          }`}
        >
          Partners ({studyPartners.length})
        </button>
        <button
          onClick={() => setActiveTab('challenges')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'challenges' ? 'text-accent border-b-2 border-accent' : 'text-ink2 hover:text-ink'
          }`}
        >
          Challenges ({challenges.length})
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'groups' && (
          <div className="p-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard label="Groups Joined" value={userStats.groupsJoined} icon="👥" />
              <StatCard label="Practice Hours" value={`${userStats.totalPracticeHours}`} icon="⏱️" />
              <StatCard label="Challenges Done" value={userStats.challengesCompleted} icon="✅" />
              <StatCard label="Current Streak" value={`${userStats.streakDays} days`} icon="🔥" />
            </div>

            {/* Create Group Button */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full mb-6 bg-gradient-to-r from-accent to-purple-600 text-white py-4 rounded-xl font-semibold hover:opacity-90 transition-opacity"
            >
              + Create New Study Group
            </button>

            {/* Available Groups Section */}
            <section className="mb-8">
              <h3 className="text-lg font-semibold text-ink mb-4">Discover Groups</h3>
              <div className="space-y-4">
                {availableGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    onJoin={() => joinGroup(group.id)}
                    onStart={() => startSession(group.id)}
                  />
                ))}
              </div>
            </section>

            {/* Joined Groups Section */}
            <section>
              <h3 className="text-lg font-semibold text-ink mb-4">Your Groups</h3>
              <div className="space-y-4">
                {joinedGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    onLeave={() => leaveGroup(group.id)}
                    onStart={() => startSession(group.id)}
                    showLeave
                  />
                ))}
                {joinedGroups.length === 0 && (
                  <EmptyState message="You haven't joined any groups yet. Discover groups above!" />
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'partners' && (
          <div className="p-6">
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 mb-6 text-white">
              <h3 className="text-lg font-semibold mb-2">Find Your Perfect Study Partner</h3>
              <p className="text-sm opacity-90">Match with learners at your level who share similar goals</p>
            </div>

            <div className="space-y-4">
              {studyPartners.map((partner) => (
                <PartnerCard
                  key={partner.id}
                  partner={partner}
                  onConnect={() => alert(`Sent connection request to ${partner.name}!`)}
                />
              ))}
            </div>

            <button className="mt-6 w-full bg-surface2 text-ink py-3 rounded-xl font-semibold hover:bg-surface3 transition-colors">
              Browse More Partners
            </button>
          </div>
        )}

        {activeTab === 'challenges' && (
          <div className="p-6">
            <div className="grid gap-4">
              {challenges.map((challenge) => (
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  onAccept={() => acceptChallenge(challenge.id)}
                  showProgress
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateModal && (
        <CreateGroupModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={createGroup}
        />
      )}
    </div>
  );
}

// Helper Components

function StatCard({ label, value, icon }) {
  return (
    <div className="bg-surface p-4 rounded-xl border border-line">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink2">{label}</p>
          <p className="text-2xl font-bold text-ink mt-1">{value}</p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}

function GroupCard({ group, onJoin, onStart, onLeave, showLeave = false }) {
  const levelColors = {
    Beginner: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    Intermediate: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    Advanced: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  };

  return (
    <div className="bg-surface rounded-xl p-5 border border-line hover:border-accent/30 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-semibold text-ink">{group.name}</h4>
            {group.isAdmin && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">Host</span>
            )}
          </div>
          <p className="text-sm text-ink2 mb-2">{group.description}</p>
          
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${levelColors[group.level] || levelColors.Beginner}`}>
              {group.level}
            </span>
            <span className="text-xs text-ink3">• {group.language}</span>
          </div>

          <div className="flex items-center gap-4 text-xs text-ink3">
            <span>👥 {group.membersCount} members</span>
            <span>🔴 {group.activeMembers} online</span>
            <span>📅 {group.schedule}</span>
          </div>
        </div>
        
        <div className="ml-4 flex flex-col gap-2">
          {!showLeave && (
            <button onClick={onJoin} className="bg-accent text-onaccent px-4 py-2 rounded-lg text-sm font-semibold hover:bg-accent/90 transition-colors">
              Join
            </button>
          )}
          {(showLeave || group.isAdmin) && (
            <div className="flex gap-2">
              {!showLeave && onLeave && (
                <button onClick={onLeave} className="border border-line text-ink px-3 py-2 rounded-lg text-sm font-medium hover:bg-surface2 transition-colors">
                  Leave
                </button>
              )}
              <button onClick={onStart} className="bg-surface2 text-ink px-3 py-2 rounded-lg text-sm font-medium hover:bg-surface3 transition-colors">
                Start
              </button>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex gap-2">
        {group.tags.map((tag, idx) => (
          <span key={idx} className="text-xs px-2 py-1 rounded-md bg-surface2 text-ink3 capitalize">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function PartnerCard({ partner, onConnect }) {
  return (
    <div className="bg-surface rounded-xl p-5 border border-line">
      <div className="flex items-start gap-4">
        <img
          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${partner.avatarId}`}
          alt={partner.name}
          className="w-16 h-16 rounded-full"
        />
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-ink">{partner.name}</h4>
            <span className="text-sm text-ink3">Match: {partner.matchScore}%</span>
          </div>
          
          <p className="text-sm text-ink2 mb-2">
            {partner.languages.join(' • ')}
          </p>
          
          <div className="space-y-1 text-sm text-ink3">
            <p>📍 {partner.availability}</p>
            <p>🎯 {partner.goals.join(' • ')}</p>
          </div>
          
          <button onClick={onConnect} className="mt-4 w-full bg-accent text-onaccent py-2 rounded-lg font-semibold hover:bg-accent/90 transition-colors">
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}

function ChallengeCard({ challenge, onAccept, showProgress = false }) {
  const statusColors = {
    active: 'from-emerald-500 to-green-600',
    upcoming: 'from-blue-500 to-cyan-600',
  };

  const typeIcons = {
    streak: '🔥',
    vocabulary: '📚',
    practice: '🎤',
  };

  return (
    <div className="bg-surface rounded-xl overflow-hidden border border-line">
      <div className={`bg-gradient-to-r ${statusColors[challenge.status]} p-4 text-white`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{typeIcons[challenge.type]}</span>
            <div>
              <h4 className="font-semibold">{challenge.title}</h4>
              <p className="text-sm opacity-90">{challenge.description}</p>
            </div>
          </div>
          <span className="text-sm font-medium">
            Ends in {challenge.endsIn}
          </span>
        </div>
      </div>
      
      {showProgress && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-ink2">Participants</span>
            <span className="text-sm font-semibold text-ink">{challenge.participants}</span>
          </div>
          
          {challenge.progress !== undefined && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-ink2">Progress</span>
              <span className="text-sm font-semibold text-ink">
                {Math.round(challenge.progress / challenge.targetWords * 100)}%
              </span>
            </div>
          )}
          
          {challenge.completionRate !== undefined && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-ink2">Completion Rate</span>
              <span className="text-sm font-semibold text-ink">{challenge.completionRate}%</span>
            </div>
          )}
          
          <div className="bg-surface2 rounded-full h-2 mb-3">
            <div
              className="bg-accent h-2 rounded-full transition-all"
              style={{ width: `${challenge.completionRate || (challenge.progress / challenge.targetWords * 100)}%` }}
            />
          </div>
          
          <button
            onClick={onAccept}
            disabled={challenge.status !== 'active'}
            className={`w-full py-2 rounded-lg font-semibold transition-colors ${
              challenge.status === 'active'
                ? 'bg-accent text-onaccent hover:bg-accent/90'
                : 'bg-surface3 text-ink3 cursor-not-allowed'
            }`}
          >
            {challenge.status === 'active' ? 'Accept Challenge' : 'Opens Soon'}
          </button>
        </div>
      )}
    </div>
  );
}

function CreateGroupModal({ onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    level: 'Beginner',
    language: 'French',
    schedule: '',
    tags: [],
  });

  const handleTagToggle = (tag) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag]
    }));
  };

  const submit = () => {
    if (!formData.name.trim() || !formData.description.trim() || !formData.schedule.trim()) {
      alert('Please fill in all required fields');
      return;
    }
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-[65] bg-bg/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md border border-line">
        <div className="p-5 border-b border-line">
          <h3 className="text-lg font-semibold text-ink">Create Study Group</h3>
          <p className="text-sm text-ink2 mt-1">Set up a new learning community</p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">Group Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., French Beginners Hub"
              className="w-full px-4 py-2 rounded-lg border border-line bg-surface2 text-ink focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">Description *</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe what your group is about..."
              rows={3}
              className="w-full px-4 py-2 rounded-lg border border-line bg-surface2 text-ink focus:outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-2">Level</label>
              <select
                value={formData.level}
                onChange={(e) => setFormData(prev => ({ ...prev, level: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-line bg-surface2 text-ink focus:outline-none focus:border-accent"
              >
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-2">Language</label>
              <select
                value={formData.language}
                onChange={(e) => setFormData(prev => ({ ...prev, language: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-line bg-surface2 text-ink focus:outline-none focus:border-accent"
              >
                <option>French</option>
                <option>German</option>
                <option>Spanish</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">Meeting Schedule *</label>
            <input
              type="text"
              value={formData.schedule}
              onChange={(e) => setFormData(prev => ({ ...prev, schedule: e.target.value }))}
              placeholder="e.g., Daily at 7 PM CET"
              className="w-full px-4 py-2 rounded-lg border border-line bg-surface2 text-ink focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">Tags</label>
            <div className="flex flex-wrap gap-2">
              {['beginner', 'intermediate', 'advanced', 'speaking', 'grammar', 'vocabulary', 'casual', 'structured'].map(tag => (
                <button
                  key={tag}
                  onClick={() => handleTagToggle(tag)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    formData.tags.includes(tag)
                      ? 'bg-accent text-onaccent'
                      : 'bg-surface2 text-ink3 hover:bg-surface3'
                  }`}
                >
                  {tag.charAt(0).toUpperCase() + tag.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-line flex gap-3">
          <button onClick={onClose} className="flex-1 bg-surface2 text-ink py-2 rounded-lg font-semibold hover:bg-surface3 transition-colors">
            Cancel
          </button>
          <button onClick={submit} className="flex-1 bg-accent text-onaccent py-2 rounded-lg font-semibold hover:bg-accent/90 transition-colors">
            Create Group
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="text-center py-12 bg-surface rounded-xl border border-line border-dashed">
      <p className="text-ink2">{message}</p>
    </div>
  );
}
