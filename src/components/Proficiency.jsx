import { useEffect, useMemo, useRef, useState } from 'react';
import { getSrs, getGrammarProgress, getSessions, getMetrics, getSettings } from '../lib/storage';
import { LEVELS, coverageReport, profileFor, promotionGate } from '../lib/cefr';
import { DIMENSIONS, nextFocus, proficiency } from '../lib/proficiency';
import { assistanceFading, retentionCalibration } from '../lib/learningAdaptation';
import { GRAMMAR_TOPICS } from '../lib/grammar';
import { vocabCountByCefr } from '../lib/vocab';
import {
  startPlacement, selectItem, answerItem, placementResultFrom,
} from '../lib/placement';
import {
  startListeningStage, selectListeningItem, confirmPlayback, canAnswerListeningItem,
  markListeningUnavailable, answerListeningItem, listeningStageResult,
  perSkillEstimates, practiceRecommendations, PLAYBACK_GATE_MS,
} from '../lib/placementListening';
import { stopSpeaking, ttsSupported } from '../lib/tts';
import { saveLastPlacement } from '../lib/storage';
import { Target, Check, ChevronRight } from './icons';

// The proficiency screen: one score, five components, and an honest account of
// how much evidence sits behind it. Everything shown here is derived from
// things the learner actually did — XP and streaks are deliberately absent,
// because attendance is not proficiency.

export default function Proficiency({ onXp }) {
  const [placing, setPlacing] = useState(false);
  const [level, setLevel] = useState(() => getSettings().level || 'A1');

  // Evidence re-reads when the level changes; `placing` would wrongly reset
  // `evidence` (and the score below) on every placement open/close.
  const evidence = useMemo(() => ({
    level,
    srs: safe(getSrs, {}),
    topicScores: safe(getGrammarProgress, {}),
    sessions: safe(getSessions, []),
    metrics: safe(getMetrics, []),
  }), [level]);

  const result = useMemo(() => proficiency(evidence), [evidence]);
  const profile = profileFor(level);
  const gate = useMemo(() => promotionGate(level, {
    vocabKnown: result.parts.vocabulary.known || 0,
    grammarMastered: result.parts.grammar.mastered || 0,
    speakingAvg: result.parts.speaking.score || 0,
    checkpointsPassed: countCheckpoints(evidence.sessions),
  }), [level, result, evidence.sessions]);

  const successStreak = evidence.sessions.slice(-3).every((session) => Number(session?.report?.average_scores?.overall) >= 80) ? 3 : 0;
  const assist = assistanceFading({ level, confidence: result.confidence, successStreak });
  const retention = useMemo(() => retentionCalibration(evidence.srs), [evidence.srs]);
  const coverage = useMemo(
    () => coverageReport({ grammarTopics: GRAMMAR_TOPICS, vocabByLevel: vocabCountByCefr() }),
    [],
  );

  if (placing) {
    return <PlacementTest seedLevel={level} onDone={(r) => { setLevel(r.level); setPlacing(false); onXp?.(20); }} onCancel={() => setPlacing(false)} />;
  }

  return (
    <div className="h-full overflow-y-auto nice-scroll px-[22px] py-6">
      <div className="max-w-[820px] mx-auto space-y-4">
        <header className="text-center space-y-1">
          <Target className="w-7 h-7 mx-auto text-ink2" />
          <h2 className="text-xl font-bold">Proficiency</h2>
          <p className="text-sm text-ink2">{profile.label} · {profile.blurb}</p>
        </header>

        <section className="bg-surface border border-line rounded-2xl p-4 text-center">
          <p className="text-5xl font-bold tabular-nums">{result.score === null ? '—' : result.score}</p>
          <p className="text-sm font-semibold mt-1">{result.band || 'No score yet'}</p>
          <p className="text-xs text-ink2 mt-2">
            {result.score === null
              ? result.note
              : `Confidence ${Math.round(result.confidence * 100)}% — ${result.confidence < 0.5 ? 'thin evidence, treat as provisional' : 'enough evidence to be meaningful'}.`}
          </p>
          <p className="text-xs text-ink2 mt-2">{nextFocus(result)}</p>
        </section>

        <section className="bg-surface border border-line rounded-2xl p-4 space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Components</h3>
          {DIMENSIONS.map((d) => {
            const part = result.parts[d.id];
            return (
              <div key={d.id} className="space-y-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold">{d.label}</span>
                  <span className={part.score === null ? 'text-ink2 text-xs' : 'tabular-nums'}>
                    {part.score === null ? 'no evidence yet' : `${part.score}%`}
                  </span>
                </div>
                <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                  <div className="h-full bg-ink rounded-full transition-all" style={{ width: `${part.score ?? 0}%` }} />
                </div>
                <p className="text-[11px] text-ink2">{d.blurb}</p>
              </div>
            );
          })}
        </section>

        <section className="bg-surface border border-line rounded-2xl p-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Moving to {gate.to}</h3>
            <span className="text-xs text-ink2">{Math.round(gate.progress * 100)}%</span>
          </div>
          {gate.ready ? (
            <p className="text-sm font-semibold"><Check className="w-4 h-4 inline mr-1" />Every gate met — sit the placement test to move up.</p>
          ) : (
            <ul className="space-y-1">
              {gate.missing.map((m) => (
                <li key={m.id} className="text-sm flex justify-between gap-3">
                  <span>{m.label}</span>
                  <span className="text-ink2 tabular-nums whitespace-nowrap">{m.have} / {m.need}</span>
                </li>
              ))}
            </ul>
          )}
          <button onClick={() => setPlacing(true)} className="w-full mt-2 bg-ink text-bg font-bold rounded-[14px] px-5 py-2.5 text-sm">
            Take the placement test
          </button>
        </section>

        <section className="bg-surface border border-line rounded-2xl p-4 space-y-1.5">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">How much help you get</h3>
          <p className="text-xs text-ink2">Scaffolding fades as you improve — this is what is on at {level}.</p>
          <Row label="Captions" value={assist.captions} />
          <Row label="Translations" value={assist.translation} />
          <Row label="Sentence starters" value={assist.starters === 0 ? 'none' : `${assist.starters}`} />
          <Row label="Corrections" value={assist.correctionTiming} />
          <Row label="Partner simplifies" value={assist.simplifyPartner ? 'yes' : 'no'} />
        </section>

        <section className="bg-surface border border-line rounded-2xl p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Retention calibration</h3>
            <span className="text-[11px] text-ink3 tabular-nums">{retention.n} reviews</span>
          </div>
          {retention.ready ? (
            <>
              <p className="text-xs text-ink2">The scheduler predicts {Math.round(retention.predicted * 100)}% recall; observed recall is {Math.round(retention.actual * 100)}% ({retention.bias >= 0 ? '+' : ''}{Math.round(retention.bias * 100)} points).</p>
              <div className="space-y-1">
                {retention.curve.map((row) => (
                  <div key={`${row.from}-${row.to}`} className="flex items-center gap-2 text-[11px]">
                    <span className="w-16 text-ink3 tabular-nums">{Math.round(row.from * 100)}–{Math.round(row.to * 100)}%</span>
                    <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden"><div className="h-full bg-ink" style={{ width: `${row.actual * 100}%` }} /></div>
                    <span className="w-12 text-right text-ink2 tabular-nums">{Math.round(row.actual * 100)}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-ink2">Keep reviewing: calibration stays provisional until {retention.needed} more prediction/outcome pairs are recorded.</p>
          )}
        </section>

        <section className="bg-surface border border-line rounded-2xl p-4 space-y-1.5">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">What the app teaches</h3>
          <p className="text-xs text-ink2">Syllabus coverage — {coverage.grammarCoverage}% of the grammar inventory is written.</p>
          {coverage.rows.map((r) => (
            <div key={r.level} className="flex items-baseline justify-between text-sm">
              <span className="font-semibold">{r.level}</span>
              <span className="text-ink2 text-xs tabular-nums">
                {r.grammarCovered}/{r.grammarWanted} grammar · {r.words} banded words
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

const Row = ({ label, value }) => (
  <div className="flex justify-between text-sm">
    <span>{label}</span>
    <span className="text-ink2">{value}</span>
  </div>
);

// ------------------------------------------------------------- placement ----

// Shuffled display order per item id — the authored banks park most answers
// at index 0; the engines still score canonical indices via this map.
function shuffledOrder(mapRef, item) {
  if (!mapRef.current.has(item.id)) {
    const ord = item.options.map((_, i) => i);
    for (let i = ord.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ord[i], ord[j]] = [ord[j], ord[i]];
    }
    mapRef.current.set(item.id, ord);
  }
  return mapRef.current.get(item.id);
}

function PlacementTest({ seedLevel, onDone, onCancel }) {
  const [state, setState] = useState(() => startPlacement({ seedLevel }));
  const [listening, setListening] = useState(null); // null = listening stage not started
  // Shuffled display order per item id — the bank parks most answers at
  // index 0; the engine still scores canonical indices via this map.
  const orderRef = useRef(new Map());
  const orderFor = (it) => shuffledOrder(orderRef, it);
  const item = state.done ? null : selectItem(state);
  const shown = item ? orderFor(item) : [];
  const result = state.done ? placementResultFrom(state) : null;

  // ── Stage 2: the listening stage runs after the adaptive receptive test ──
  if (result && !listening) {
    return (
      <ListeningStageIntro
        receptive={result}
        onStart={() => setListening(startListeningStage({ seedTheta: result.theta }))}
        onSkip={() => setListening(startListeningStage({ seedTheta: result.theta, bank: [] }))}
      />
    );
  }
  if (listening && !listening.done) {
    return (
      <ListeningStage
        state={listening}
        setState={setListening}
        onDone={(final) => {
          const skills = perSkillEstimates({ receptive: result, listening: listeningStageResult(final) });
          const recs = practiceRecommendations({ skills, listening: listeningStageResult(final) });
          onDone({ ...result, skills, skillNeeds: recs.skillNeeds, directives: recs.directives });
        }}
        onCancel={onCancel}
      />
    );
  }
  if (result && listening?.done) {
    const listenRes = listeningStageResult(listening);
    const skills = perSkillEstimates({ receptive: result, listening: listenRes });
    const recs = practiceRecommendations({ skills, listening: listenRes });
    return <PlacementResult result={result} skills={skills} skillNeeds={recs.skillNeeds} directives={recs.directives} listenRes={listenRes} onDone={onDone} />;
  }

  if (!item) {
    return <div className="p-6 text-sm text-ink2">No more questions available.</div>;
  }

  const progress = state.asked.length / state.config.maxItems;

  return (
    <div className="h-full overflow-y-auto nice-scroll px-[22px] py-6">
      <div className="max-w-[600px] mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Placement test</h2>
          <button onClick={onCancel} className="text-xs text-ink2 underline hover:text-ink">Cancel</button>
        </div>
        <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
          <div className="h-full bg-ink rounded-full transition-all" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
        <p className="text-xs text-ink2">
          Question {state.asked.length + 1} · the test adapts — harder when you're right, easier when you're not.
        </p>

        <section className="bg-surface border border-line rounded-2xl p-4 space-y-3">
          <p className="text-base font-semibold">{item.q}</p>
          <div className="space-y-2">
            {shown.map((originalIdx) => (
              <button
                key={originalIdx}
                onClick={() => setState(answerItem(state, item, originalIdx))}
                className="w-full text-left border border-line rounded-xl px-3 py-2.5 text-sm hover:border-ink transition"
              >
                {item.options[originalIdx]}
                <ChevronRight className="w-4 h-4 inline float-right opacity-40" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Stage 2 intro: consent + honest TTS expectation ─────────────────────
function ListeningStageIntro({ receptive, onStart, onSkip }) {
  return (
    <div className="h-full overflow-y-auto nice-scroll px-[22px] py-6">
      <div className="max-w-[600px] mx-auto space-y-4 text-center">
        <h2 className="text-xl font-bold">Listening check</h2>
        <p className="text-sm text-ink2">
          Your written work placed at <strong>{receptive.level}</strong> ({receptive.range}).
          Now the part most tests fake: <strong>you'll hear short clips</strong> — no transcript
          until you answer. If audio can't play, items are recorded unmeasured, never wrong.
        </p>
        <p className="text-xs text-ink2">Measured: numbers · time · negatives · detail · gist · inference · intention.</p>
        <button onClick={onStart} className="w-full bg-ink text-bg font-bold rounded-[14px] px-5 py-3 text-sm">Start listening</button>
        <button onClick={onSkip} className="text-xs text-ink2 underline hover:text-ink">Skip — measure listening later</button>
      </div>
    </div>
  );
}

// ── Stage 2 runner: audio-gated items, transcript hidden until answered ──
function ListeningStage({ state, setState, onDone, onCancel }) {
  // Per-component shuffle map (options order only — scoring stays canonical).
  const orderRef = useRef(new Map());
  const playTimerRef = useRef(null);
  const [played, setPlayed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [playFailed, setPlayFailed] = useState(false);

  const item = selectListeningItem(state);
  const finishedRef = useRef(false);

  // Bank exhausted (or the stage marked itself done): hand the final state
  // back ONCE, from an effect — never from render.
  useEffect(() => {
    if (item || finishedRef.current) return;
    finishedRef.current = true;
    onDone(state);
  }, [item, state, onDone]);

  // Reset the per-item playback state when the item changes.
  useEffect(() => {
    setPlayed(false);
    setPlayFailed(false);
    setStarting(false);
    const timer = playTimerRef.current;
    return () => {
      if (timer) clearTimeout(timer);
      stopSpeaking();
    };
  }, [item?.id]);

  useEffect(() => () => stopSpeaking(), []);

  // Audio never confirmed within the gate: record the item as UNAVAILABLE
  // (never wrong) so the selector moves on and the report says "unmeasured".
  // Runs before any early return — hooks cannot be conditional.
  useEffect(() => {
    if (playFailed && !played && item?.id) {
      setState((s) => markListeningUnavailable(s, item.id));
    }
  }, [playFailed, played, item?.id, setState]);

  if (!item) {
    // Bank exhausted (or all unavailable): the effect above has handed the
    // final state back; render nothing.
    return null;
  }

  const play = () => {
    if (starting || played || playFailed) return;
    if (!ttsSupported()) { setPlayFailed(true); return; }
    try {
      const u = new SpeechSynthesisUtterance(item.audio);
      u.lang = 'fr-FR';
      u.rate = 0.9;
      let settled = false;
      const settle = (fn) => {
        if (settled) return;
        settled = true;
        if (playTimerRef.current) clearTimeout(playTimerRef.current);
        playTimerRef.current = null;
        setStarting(false);
        fn();
      };
      u.onstart = () => settle(() => {
        setPlayed(true);
        setState((s) => confirmPlayback(s, item.id));
      });
      u.onerror = () => settle(() => setPlayFailed(true));
      setStarting(true);
      playTimerRef.current = setTimeout(() => settle(() => setPlayFailed(true)), PLAYBACK_GATE_MS);
    } catch {
      setPlayFailed(true);
    }
  };

  const unavailable = playFailed && !played;
  const shown = item ? shuffledOrder(orderRef, item) : [];
  const answeredIds = new Set(state.responses.map((r) => r.id));
  const currentAnswered = answeredIds.has(item?.id);

  return (
    <div className="h-full overflow-y-auto nice-scroll px-[22px] py-6">
      <div className="max-w-[600px] mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Listening check</h2>
          <button onClick={onCancel} className="text-xs text-ink2 underline hover:text-ink">Cancel</button>
        </div>
        <p className="text-xs text-ink2">
          Clip {state.asked.length + 1} · listen, then choose — the script stays hidden until you answer.
        </p>
        <section className="bg-surface border border-line rounded-2xl p-4 space-y-3">
          <div className="grid place-items-center py-2">
            <button
              onClick={play}
              disabled={starting || played || playFailed}
              className="btn btn-primary min-h-14 px-6 rounded-2xl text-sm"
            >
              {starting ? 'Starting…' : played ? 'Replay' : 'Play clip'}
            </button>
          </div>
          {played && <p className="text-center text-[11px] text-ink3">You can replay once more if needed.</p>}
          {unavailable && (
            <p className="text-center text-[11px] text-amber-700">
              Audio couldn't play — this item is recorded as unmeasured, never wrong.
            </p>
          )}
          <div className="space-y-2">
            {shown.map((originalIdx) => (
              <button
                key={originalIdx}
                disabled={!canAnswerListeningItem(state, item.id) || currentAnswered}
                onClick={() => setState((s) => answerListeningItem(s, item.id, originalIdx))}
                className="w-full text-left border border-line rounded-xl px-3 py-2.5 text-sm hover:border-ink transition disabled:opacity-60"
              >
                {item.options[originalIdx]}
              </button>
            ))
            }
          </div>
          {currentAnswered && (
            <div className="text-center">
              <button
                onClick={() => {
                  if (finishedRef.current) return;
                  finishedRef.current = true;
                  onDone(state);
                }}
                className="w-full bg-ink text-bg font-bold rounded-[14px] px-5 py-3 text-sm"
              >
                Finish listening check
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Stage 3 result: per-skill estimates + what changes in practice ───────
function PlacementResult({ result, skills, skillNeeds, directives, listenRes, onDone }) {
  const skillLabels = {
    grammar: 'Grammar (recognition)', vocab: 'Vocabulary', reading: 'Reading',
    listening: 'Listening (heard audio)',
  };
  return (
    <div className="h-full overflow-y-auto nice-scroll px-[22px] py-6">
      <div className="max-w-[600px] mx-auto space-y-4 text-center">
        <h2 className="text-xl font-bold">Placement result</h2>
        <p className="text-5xl font-bold">{result.level}</p>
        <p className="text-sm text-ink2">
          Most likely {result.range}, from {result.itemsAsked} written questions ({result.correct} correct)
          {listenRes?.answered ? ` and ${listenRes.answered} heard clips (${listenRes.correct} correct)` : ''}.
        </p>
        <p className="text-xs text-ink2">
          Confidence {Math.round(result.confidence * 100)}% — a short test can't place you more precisely than
          about half a band; the range is the honest answer.
        </p>
        <div className="bg-surface border border-line rounded-2xl p-4 text-left space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink3">By skill</p>
          {Object.entries(skills).map(([skill, est]) => (
            <p key={skill} className="text-sm text-ink2">
              {skillLabels[skill] || skill}:{' '}
              <strong className="text-ink">{est.level || '—'}</strong>
              {est.range && est.range !== est.level ? ` (${est.range})` : ''}
              {est.evidence === 'audio-unavailable' && ' · audio unavailable, not measured'}
            </p>
          ))}
        </div>
        {directives.length > 0 && (
          <div className="bg-surface2 border border-line rounded-2xl p-4 text-left space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink3">What changes in your sessions</p>
            {directives.map((d) => (
              <p key={d.id} className="text-xs text-ink2"><strong className="text-ink">{d.why}</strong> {d.detail}</p>
            ))
            }
          </div>
        )}
        <button
          onClick={() => {
            try { saveLastPlacement({ ...result, skills, skillNeeds, directives }); } catch { /* never blocks */ }
            onDone({ ...result, skills, skillNeeds, directives });
          }}
          className="w-full bg-ink text-bg font-bold rounded-[14px] px-5 py-3 text-sm"
        >
          Set my level to {result.level}
        </button>
      </div>
    </div>
  );
}

// Storage helpers are defensive: this screen must render on a fresh install
// where none of these keys exist yet.
function safe(fn, fallback) {
  try {
    const v = fn?.();
    return v === undefined || v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

function countCheckpoints(sessions) {
  return (sessions || []).filter((s) => s.checkpoint && (s.score ?? s.overall ?? 0) >= 70).length;
}

export { LEVELS };
