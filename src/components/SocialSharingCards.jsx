import { useMemo, useState } from 'react';
import { Share2, Download, CheckCircle, Target, Clock, TrendingUp } from './icons';
import {
  getSessions, getStreak, getSettings, getSrs, getGrammarProgress, getMetrics,
  getLearnerErrorSummary, getLearningEvidenceState,
} from '../lib/storage';
import { proficiency } from '../lib/proficiency';
import { hasCapabilityNow } from '../lib/languages';
import { getProgressCards, saveProgressCards } from '../lib/stores/progressCardStore.js';

/**
 * SocialSharingCards - progress cards the learner can keep and share.
 *
 * Every number on a card comes from the learner's own record. The card used
 * to be built from fixed figures (47 sessions, 72% accuracy, 23 weaknesses
 * fixed) behind a "Download Card" button that did nothing except say it
 * would have worked — so the thing a learner shares was a claim about their
 * own learning that was not true. Where there is no evidence yet the card
 * says so instead of inventing a number.
 *
 * Nothing personal goes on the card: no name, no account, no dates beyond
 * what the learner chose to include.
 */

const THEMES = [
  { id: 'primary', label: 'Studio', from: '#3b5bdb', to: '#1c3faa' },
  { id: 'success', label: 'Green', from: '#2f9e44', to: '#1b6e30' },
  { id: 'purple', label: 'Purple', from: '#7048e8', to: '#4c2fb0' },
  { id: 'amber', label: 'Amber', from: '#e8890c', to: '#b35c05' },
];

const QUOTES = [
  'Practice makes progress.',
  'Every mistake is a lesson.',
  'Consistency is key.',
  'Fluency takes time.',
];

const readCards = () => getProgressCards();
const writeCards = (cards) => saveProgressCards(cards);

/**
 * The learner's own numbers.
 *
 * `null` means "not enough evidence yet" — the card shows a dash rather than
 * a made-up figure, because a shared card is a claim about real learning.
 */
function realStats() {
  const sessions = getSessions();
  const summary = getLearnerErrorSummary();
  const streak = getStreak();
  const statedLevel = getSettings().level || 'A1';

  // Accuracy comes from the learner's own evidence events: every attempt the
  // app recorded, and whether it was right.
  let correct = 0;
  let attempts = 0;
  const evidence = hasCapabilityNow('learning-path') ? getLearningEvidenceState() : null;
  for (const cycle of (evidence && evidence.cycles) || []) {
    for (const field of ['baseline', 'interventions', 'transfers', 'delayed', 'recurrences']) {
      for (const e of cycle[field] || []) {
        attempts += 1;
        if (e.correct) correct += 1;
      }
    }
  }

  // The level comes from the same evidence the Progress tab uses, so the
  // card cannot claim a level the app itself does not.
  const result = proficiency({
    level: statedLevel,
    srs: getSrs() || {},
    topicScores: getGrammarProgress() || {},
    sessions,
    metrics: getMetrics() || [],
    learningEvidence: evidence || {},
  });

  return {
    sessionsCompleted: sessions.length,
    accuracy: attempts ? Math.round((correct / attempts) * 100) : null,
    accuracyAttempts: attempts,
    weaknessesFixed: summary.resolved,
    currentStreak: (streak && streak.count) || 0,
    level: result.workingLevel || statedLevel,
  };
}

const fmt = (value) => (value === null || value === undefined ? '—' : String(value));

export default function SocialSharingCards({ open, onClose }) {
  const [showCreator, setShowCreator] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState(['sessions', 'accuracy', 'weaknesses']);
  const [cards, setCards] = useState(() => readCards());

  if (!open) return null;

  const onBack = () => {
    setShowCreator(false);
    setCards(readCards());
  };

  return (
    <div className="fixed inset-0 z-[55] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="Share progress">
      <div className="mx-auto min-h-full max-w-4xl px-4 py-4">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <h2 className="flex-1 text-lg font-bold text-ink">Share Progress</h2>
          <button onClick={onClose} aria-label="Close share panel" className="grid h-9 w-9 place-items-center rounded-full text-ink2 hover:bg-surface2 hover:text-ink">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.5 4.5L4.5 13.5M4.5 4.5L13.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Left Panel - Card Creator */}
        {!showCreator ? (
          <div className="w-1/2 border-r border-line bg-surface p-6">
            <h2 className="text-xl font-bold text-ink mb-2">Share Your Progress</h2>
            <p className="text-sm text-ink2 mb-6">
              Create a progress card from your own record. No personal data is
              included — just the numbers you have actually earned.
            </p>

            {/* Privacy Badge */}
            <div className="mb-6 rounded-2xl border border-accent/20 bg-accent/5 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle size={20} className="text-onaccent mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-onaccent">Privacy first</h4>
                  <p className="mt-1 text-xs text-onaccent/80">
                    Your name and personal details are never included in shared cards.
                    Only anonymised learning metrics.
                  </p>
                </div>
              </div>
            </div>

            {/* Metrics Selection */}
            <h3 className="text-sm font-bold uppercase tracking-wider text-ink2 mb-3">Choose What to Share</h3>
            <div className="space-y-2 mb-6">
              <MetricToggle
                label="Sessions Completed"
                description="Total practice sessions"
                icon={Clock}
                metric="sessions"
                selected={selectedMetrics}
                onToggle={setSelectedMetrics}
              />
              <MetricToggle
                label="Accuracy Rate"
                description="Average correctness %"
                icon={Target}
                metric="accuracy"
                selected={selectedMetrics}
                onToggle={setSelectedMetrics}
              />
              <MetricToggle
                label="Weaknesses Fixed"
                description="Mistakes improved"
                icon={TrendingUp}
                metric="weaknesses"
                selected={selectedMetrics}
                onToggle={setSelectedMetrics}
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => setShowCreator(true)}
                className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-onaccent hover:bg-accent/90"
              >
                <Share2 size={16} className="inline mr-2" />
                Create Progress Card
              </button>
            </div>

            {/* Your cards */}
            {cards.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-ink2 mb-3">Your Cards</h3>
                <div className="space-y-3">
                  {cards.map((card) => (
                    <SavedCard key={card.id} card={card} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <CardCreator
            metrics={selectedMetrics}
            onBack={onBack}
            onSaved={(saved) => setCards([saved, ...readCards()])}
          />
        )}

        {/* Right Panel - What a card looks like */}
        <div className="w-1/2 bg-surface p-6 overflow-y-auto">
          <h2 className="text-xl font-bold text-ink mb-4">What a card shows</h2>
          <p className="text-sm text-ink2 mb-4">
            A card carries the three numbers you pick, the level you are working
            at, and a line you choose. Nothing else.
          </p>
          <div className="rounded-2xl border border-line bg-surface2 p-5">
            <h3 className="text-sm font-bold text-ink">Where the numbers come from</h3>
            <ul className="mt-2 space-y-1 text-xs text-ink2">
              <li>· Sessions — the sessions recorded on this device.</li>
              <li>· Accuracy — your recorded attempts and how many were right.</li>
              <li>· Weaknesses fixed — mistakes you have repaired and re-tested.</li>
              <li>· Level — the level the app works out from your evidence.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricToggle({ label, description, icon: Icon, metric, selected, onToggle }) {
  const isOn = selected.includes(metric);
  return (
    <button
      type="button"
      onClick={() => onToggle(isOn ? selected.filter((m) => m !== metric) : [...selected, metric])}
      aria-pressed={isOn}
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
        isOn ? 'border-accent bg-accent/10' : 'border-line bg-surface hover:bg-surface2'
      }`}
    >
      <span className={`grid h-9 w-9 place-items-center rounded-full ${isOn ? 'bg-accent text-onaccent' : 'bg-surface2 text-ink2'}`}>
        <Icon size={16} />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block text-xs text-ink2">{description}</span>
      </span>
      <span className={`grid h-5 w-5 place-items-center rounded-full border ${isOn ? 'border-accent bg-accent text-onaccent' : 'border-line'}`}>
        {isOn && <CheckCircle size={12} />}
      </span>
    </button>
  );
}

/**
 * Card creation interface
 */
function CardCreator({ metrics, onBack, onSaved }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState(THEMES[0]);
  const [quote, setQuote] = useState(QUOTES[0]);

  // Read the learner's record when the creator opens, not when the panel did:
  // the numbers on the card have to be the ones as they are now.
  const stats = useMemo(() => realStats(), []);

  const rows = [
    metrics.includes('sessions') && { label: 'Sessions completed', value: fmt(stats.sessionsCompleted) },
    metrics.includes('accuracy') && {
      label: 'Accuracy rate',
      value: stats.accuracy === null ? '—' : `${stats.accuracy}%`,
    },
    metrics.includes('weaknesses') && { label: 'Weaknesses fixed', value: fmt(stats.weaknessesFixed) },
  ].filter(Boolean);

  const handleDownload = async () => {
    setGenerating(true);
    setError(null);
    try {
      const card = {
        id: `card-${Date.now()}`,
        createdAt: new Date().toISOString(),
        themeId: theme.id,
        quote,
        rows,
        level: stats.level,
      };
      const canvas = await renderCardCanvas(card, stats);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('The card could not be drawn.');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `le-studio-progress-${card.id}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const saved = [card, ...readCards()];
      writeCards(saved);
      if (onSaved) onSaved(card);
    } catch (e) {
      setError(e.message || 'The card could not be downloaded.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      <header className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">Create Progress Card</h2>
        <button
          onClick={onBack}
          aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-full text-ink2 hover:bg-surface2 hover:text-ink"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13.5 4.5L4.5 13.5M4.5 4.5L13.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </header>

      <main className="flex-1 flex flex-col md:flex-row">
        {/* Card Preview */}
        <div className="flex-1 p-6 flex items-center justify-center bg-gradient-to-br from-surface via-white to-surface">
          <div
            className="w-full max-w-md rounded-3xl p-8 text-white shadow-2xl"
            style={{ backgroundImage: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="text-center">
                <h3 className="text-2xl font-bold">Le Studio</h3>
                <p className="text-sm opacity-90">Language Learning Journey</p>
              </div>
              <div className="rounded-full bg-white/20 p-3">
                <AwardIcon />
              </div>
            </div>

            {/* Main Stats */}
            <div className="space-y-4">
              {rows.length === 0 && (
                <p className="text-sm opacity-90">Pick at least one number to put on the card.</p>
              )}
              {rows.map((row) => (
                <StatRow key={row.label} label={row.label} value={row.value} />
              ))}
            </div>

            {/* Achievement Badge */}
            <div className="mt-6 rounded-2xl bg-white/20 p-4 text-center">
              <p className="text-xs uppercase tracking-wider opacity-90">Current Level</p>
              <p className="text-2xl font-bold">{stats.level}</p>
            </div>

            {/* Footer */}
            <div className="mt-6 pt-6 border-t border-white/20 text-center text-sm opacity-90">
              {quote}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="w-full md:w-80 border-l border-line bg-surface p-6 flex flex-col">
          <h3 className="text-sm font-bold uppercase tracking-wider text-ink2 mb-4">Customization</h3>

          <div className="space-y-4 mb-6">
            <div>
              <span className="block text-sm font-medium text-ink mb-2">Theme Color</span>
              <div className="flex gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t)}
                    aria-label={`${t.label} theme`}
                    aria-pressed={theme.id === t.id}
                    className={`h-8 w-8 rounded-full ${t.id === 'primary' ? 'bg-primary' : t.id === 'success' ? 'bg-success' : t.id === 'purple' ? 'bg-purple-500' : 'bg-amber-500'} ${theme.id === t.id ? 'ring-2 ring-ink ring-offset-2' : ''}`}
                  />
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="card-quote" className="block text-sm font-medium text-ink mb-2">Include Motivational Quote</label>
              <select
                id="card-quote"
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface2 px-3 py-2 text-sm text-ink"
              >
                {QUOTES.map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-red50 px-3 py-2 text-xs text-red800">{error}</p>
          )}

          <button
            onClick={handleDownload}
            disabled={generating || rows.length === 0}
            className="mt-auto rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {generating ? 'Drawing your card...' : 'Download Card'}
          </button>
        </div>
      </main>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between rounded-2xl p-4">
      <span className="opacity-90">{label}</span>
      <span className="text-3xl font-bold">{value}</span>
    </div>
  );
}

function SavedCard({ card }) {
  const theme = THEMES.find((t) => t.id === card.themeId) || THEMES[0];
  return (
    <div className="rounded-2xl p-4 text-white" style={{ backgroundImage: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}>
      <div className="flex items-center justify-between text-xs opacity-90">
        <span>Le Studio</span>
        <span>{new Date(card.createdAt).toLocaleDateString()}</span>
      </div>
      <div className="mt-2 space-y-1">
        {(card.rows || []).map((row) => (
          <div key={row.label} className="flex items-center justify-between text-sm">
            <span className="opacity-90">{row.label}</span>
            <span className="font-bold">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AwardIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="6" />
      <path d="M15 13c2.5 0.5 4.5 2.5 4.5 5.5V20H5.5v-1.5c0-3 2-5 4.5-5.5" />
    </svg>
  );
}

/**
 * Draw the card on a canvas so the download is a real image of the same
 * thing the preview shows. The preview is the React markup; this is the
 * same content drawn for the file the learner keeps.
 */
async function renderCardCanvas(card, stats) {
  const theme = THEMES.find((t) => t.id === card.themeId) || THEMES[0];
  const width = 900;
  const height = 1160;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the card.');

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, theme.from);
  gradient.addColorStop(1, theme.to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.fillText('Le Studio', width / 2, 120);
  ctx.font = '28px system-ui, sans-serif';
  ctx.globalAlpha = 0.9;
  ctx.fillText('Language Learning Journey', width / 2, 168);
  ctx.globalAlpha = 1;

  const rows = card.rows || [];
  let y = 300;
  ctx.textAlign = 'left';
  for (const row of rows) {
    ctx.globalAlpha = 0.22;
    roundRect(ctx, 80, y - 60, width - 160, 110, 24);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#ffffff';
    ctx.font = '30px system-ui, sans-serif';
    ctx.fillText(row.label, 120, y + 8);
    ctx.textAlign = 'right';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.fillText(row.value, width - 120, y + 12);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    y += 140;
  }

  // Level badge
  ctx.globalAlpha = 0.22;
  roundRect(ctx, 80, y + 10, width - 160, 130, 28);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '22px system-ui, sans-serif';
  ctx.globalAlpha = 0.9;
  ctx.fillText('CURRENT LEVEL', width / 2, y + 62);
  ctx.globalAlpha = 1;
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.fillText(stats.level || card.level || '—', width / 2, y + 112);

  // Quote
  ctx.font = 'italic 30px system-ui, sans-serif';
  ctx.globalAlpha = 0.9;
  ctx.fillText(`"${card.quote}"`, width / 2, height - 70);
  ctx.globalAlpha = 1;

  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
