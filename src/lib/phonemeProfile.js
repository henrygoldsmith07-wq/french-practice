// Phoneme confusion profile — per phoneme weakness, confidence, and minimal-pair queue.
// Profiles are PER LANGUAGE: English speakers trip different sounds in French
// (uvular r, y/u, nasals) than in German (ich/ach, ü, final devoicing) or
// Spanish (tap/trill r, b/v). The active content language picks the catalogue,
// the tips, the minimal pairs and the persisted stats bucket.

import { recordPronunciationGap } from './storage.js';
import { contentLang } from './content/active.js';
import { read, write, KEYS } from './storageCore.js';

export const PHONEMES = [
  { id: 'r', label: 'r (uvular ʁ)', tip: 'Gargle lightly — back of the throat, not the English r.' },
  { id: 'u-ou', label: 'u / ou (y vs u)', tip: 'u = lips tight like whistling; ou = relaxed like “oo”.' },
  { id: 'nasal-an', label: 'nasal an/en (ɑ̃)', tip: 'Air through nose + mouth — “vent” without closing the n.' },
  { id: 'nasal-on', label: 'nasal on (ɔ̃)', tip: 'Round lips — “bon” with nose.' },
  { id: 'nasal-in', label: 'nasal in/un (ɛ̃/œ̃)', tip: 'Smile slightly — “vin” is one vowel, not “van”.' },
  { id: 'liaison', label: 'liaison', tip: 'Link the consonant: les‿amis [lez‿ami].' },
  { id: 'gn', label: 'gn (ɲ)', tip: 'Like “ny” in canyon — “agneau”.' },
  { id: 'j', label: 'j (ʒ)', tip: 'Soft, like “measure” — jamais.' },
];

// German profile: the contrasts English speakers actually miss. The acoustic
// families (rhythm, intonation, voicing, frication) come from the shared
// analyser; ich/ach and front-rounded vowels live in the spectral bands it
// already measures, so these map onto the same attempt pipeline.
export const PHONEMES_DE = [
  { id: 'de-ich-ach', label: 'ich-Laut / ach-Laut', tip: 'ich = soft [ç] like “huge”; ach = throaty [x] like “loch”.' },
  { id: 'de-u-u', label: 'ü / u', tip: 'ü = say “ee” with rounded lips; u = a deep “oo”.' },
  { id: 'de-o-o', label: 'ö / o', tip: 'ö = say “ay” with rounded lips; o stays pure, never a diphthong.' },
  { id: 'de-devoicing', label: 'final devoicing', tip: 'Final b/d/g harden to p/t/k — “Tag” ends like “tak”.' },
  { id: 'de-stress', label: 'word stress', tip: 'Stress the FIRST syllable of most native words — VER-sprechen, not ver-SPRECHEN.' },
];

// Spanish profile: five pure vowels, the r contrasts, and the b/v reality.
export const PHONEMES_ES = [
  { id: 'es-r', label: 'tap r / trill rr', tip: 'Single tap like a quick “tt” in “butter”; rr = several taps in a row.' },
  { id: 'es-bv', label: 'b / v realization', tip: 'b and v sound the same — soft between vowels, like a gentle “b”.' },
  { id: 'es-vowels', label: 'five-vowel clarity', tip: 'a e i o u are pure and short — never glide them like English “ay” or “oh”.' },
  { id: 'es-ll', label: 'll / y', tip: 'Usually like “y” in “yes”; in much of Argentina a “zh” sound.' },
  { id: 'es-timing', label: 'syllable timing', tip: 'Give every syllable near-equal weight — machine-gun rhythm, not English stress lumps.' },
];

const PROFILES = { fr: PHONEMES, de: PHONEMES_DE, es: PHONEMES_ES };

/** The phoneme catalogue for the active content language. */
export function phonemesFor(lang = contentLang()) {
  return PROFILES[lang] || PHONEMES;
}

function profileBucket(lang = contentLang()) {
  return lang;
}

function readRaw(){
  try { return read(KEYS.phonemeProfile, {}) || {}; } catch { return {}; }
}
function writeRaw(v){ try { write(KEYS.phonemeProfile, v); } catch { /* unavailable */ } }

// Legacy (pre-household, French-only) flat shape: { [phonemeId]: stats }.
// Adopted per language on first touch so no attempts are lost.
function adoptLegacy(profile) {
  if (profile && typeof profile === 'object' && !profile.byLang) {
    return { byLang: { fr: profile } };
  }
  return profile;
}

// Stats for one language. Handles both shapes: the legacy flat French-only
// profile `{ [phonemeId]: stats }` and the current per-language `{ byLang: { fr: … } }`.
export function getPhonemeProfile(lang = contentLang()) {
  const p = readRaw();
  if (p && typeof p === 'object' && p.byLang && typeof p.byLang === 'object') {
    return p.byLang[lang] || {};
  }
  return lang === 'fr' ? (p || {}) : {}; // legacy flat shape is French-only
}

export function recordPhonemeAttempt(phonemeId, { correct, confidence=0.7, label=phonemeId, trackGap=true }={}){
  if(!phonemeId) return null;
  const profile = adoptLegacy(readRaw());
  if (!profile.byLang || typeof profile.byLang !== 'object') profile.byLang = {};
  const lang = profileBucket();
  const bucket = profile.byLang[lang] || (profile.byLang[lang] = {});
  const cur = bucket[phonemeId] || { attempts: 0, correct: 0, misses: 0, avgConf: 0.5, lastAt: null };
  cur.attempts += 1;
  if(correct) cur.correct += 1; else cur.misses += 1;
  cur.avgConf = Math.round((cur.avgConf*0.7 + confidence*0.3)*100)/100;
  cur.lastAt = new Date().toISOString();
  cur.weak = (cur.misses / Math.max(1, cur.attempts)) >= 0.33 || (cur.attempts>=3 && cur.avgConf < 0.6);
  bucket[phonemeId] = cur;
  writeRaw(profile);
  if (trackGap) {
    recordPronunciationGap(phonemeId, {
      label,
      score: correct ? Math.round(Math.max(0, Math.min(1, confidence)) * 100) : 0,
      source: 'phoneme-profile',
      context: { confidence, attempts: cur.attempts, misses: cur.misses, lang: contentLang() },
    });
  }
  return cur;
}

export function weakestPhonemes(limit=3, lang = contentLang()){
  const cat = PROFILES[lang] || PHONEMES;
  const stats = getPhonemeProfile(lang) || {};
  return cat.map(ph=> ({ ...ph, stats: stats[ph.id] || { attempts:0, weak: false } }))
    .filter(x=> x.stats.attempts>0)
    .sort((a,b)=> (b.stats.misses/(b.stats.attempts||1)) - (a.stats.misses/(a.stats.attempts||1)))
    .slice(0, limit);
}

const MINIMAL_PAIRS = {
  'u-ou': [['tu','tout'], ['rue','roue'], ['dessus','dessous']],
  'nasal-an': [['vent','vin'], ['temps','teint'], ['lent','lin']],
  'r': [['roux','loo'], ['rue','loup']],
  'nasal-on': [['bon','beau'], ['pont','peau']],
  'de-ich-ach': [['ich','nicht'], ['nicht','Nacht'], ['milch','Macht']],
  'de-u-u': [['Brüder','Bruder'], ['müssen','Muss'], ['Türe','Turm']],
  'de-o-o': [['schön','Sohn'], ['Köpfe','Kops'], ['höhle','Hall']],
  'de-devoicing': [['Tag','tak (as said)'], ['Rad','Rat'], ['bald','Ballett (contrast)']],
  'de-stress': [['fahren','fahren (FA-hren)'], ['Bahn','Bahnhof (BAHN-hof)']],
  'es-r': [['caro','carro'], ['pero','perro'], ['caro','corro']],
  'es-bv': [['vaca','baca'], ['basta','vaso'], ['tubo','tuvo']],
  'es-vowels': [['mesa','mesa (pure e)'], ['como','como (pure o)'], ['tú','too (no glide)']],
  'es-ll': [['llave','yate'], ['llama','yama'], ['yo','joya']],
  'es-timing': [['mañana','ma-ña-na'], ['profesor','pro-fe-sor']],
  // Legacy French defaults kept for the generic fallback path.
  'pain-pin': [['pain','pin']],
  'beau-bon': [['beau','bon']],
};

export function nextMinimalPair(weakId, lang = contentLang()){
  const own = MINIMAL_PAIRS[weakId];
  if (own && own.length) return own[Math.floor(Math.random()*own.length)];
  // Unknown id (e.g. a shared acoustic component on a language that has no
  // authored pair for it): fall back to that language's first phoneme pair.
  const cat = PROFILES[lang] || PHONEMES;
  const fallback = cat.length ? MINIMAL_PAIRS[cat[0].id] : null;
  if (fallback && fallback.length) return fallback[Math.floor(Math.random()*fallback.length)];
  return null;
}

// Calibrated confidence for speech scoring (simple isotonic-ish)
export function calibratedConfidence(raw){
  // raw 0..1 → calibrated (slightly conservative in mid range)
  if(raw < 0.4) return raw * 0.85;
  if(raw < 0.7) return 0.34 + (raw-0.4)*0.85;
  return Math.min(0.97, raw*0.98);
}

export function accentToleranceScore(expected, heard){
  // Allow common accent-tolerant equivalences before penalising (very light)
  const norm = s=> s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'');
  if(norm(expected)===norm(heard)) return 0.92; // accent-only diff
  return null; // fall through to strict scorer
}
