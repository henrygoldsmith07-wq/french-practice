/**
 * Authentic-audio pack tooling.
 *
 *   node scripts/audio-pack.mjs validate --file pack.json
 *   node scripts/audio-pack.mjs resolve --archive <archive.org-item-id> [--out pack.json]
 *   node scripts/audio-pack.mjs status
 *
 * validate : strict provenance check (license/consent/source/audioSrc).
 * resolve  : fetch an archive.org item's file list and emit ready-to-validate
 *            asset entries (mp3/m4b) — the ONLY network step, opt-in.
 * status   : seed catalog coverage across the S1–S7 progression ladder.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  AUTHENTIC_AUDIO_SEED,
} from '../src/lib/content/authenticAudioSeed.js';
import {
  mergeCatalogs,
  stageFor,
  STAGES,
  MAX_STAGE,
  progressionFrom,
} from '../src/lib/authenticAudio.js';

const args = process.argv.slice(2);
const cmd = args[0];
const get = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

async function resolveArchive(itemId) {
  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(itemId)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} from archive.org metadata`);
  const meta = await res.json();
  const files = (meta.files || []).filter((f) => /\.(mp3|m4b)$/i.test(f.name || ''));
  const license = /publicdomain|public domain/i.test(JSON.stringify(meta.metadata?.licenseurl || '') + String(meta.metadata?.rights || '')) || (meta.metadata?.licenseurl || '').includes('publicdomain')
    ? 'public-domain' : null;
  return files.map((f) => ({
    id: `${itemId}/${f.name}`.replace(/[^\w.-]+/g, '-').toLowerCase(),
    title: `${meta.metadata?.title || itemId} — ${f.name}`,
    kind: 'authentique',
    cefr: null,
    license,
    consentBasis: license === 'public-domain' ? 'public-domain-recording' : null,
    sourceUrl: `https://archive.org/details/${itemId}`,
    audioSrc: `https://archive.org/download/${itemId}/${encodeURIComponent(f.name)}`,
    speakers: String(meta.metadata?.creator || '').split(';').map((s) => s.trim()).filter(Boolean),
    format: f.name.toLowerCase().endsWith('.m4b') ? 'm4b' : 'mp3',
    lengthSeconds: f.length && !String(f.length).includes(':') ? Number(f.length) : null,
  }));
}

function printStatus() {
  const { assets, rejected } = mergeCatalogs(AUTHENTIC_AUDIO_SEED);
  console.log(`seed catalog: ${assets.length} valid asset(s), ${rejected.length} rejected`);
  const perStage = {};
  for (let s = 1; s <= MAX_STAGE; s++) perStage[s] = assets.filter((a) => (a.stage ?? stageFor(a)) === s).length;
  console.log('stage ladder (S1 slow TTS → S7 noise/interruptions):');
  for (let s = 1; s <= MAX_STAGE; s++) {
    console.log(`  S${s} ${STAGES[s].label.padEnd(45)} ${'█'.repeat(Math.min(perStage[s], 20)) || '·'} ${perStage[s]}`);
  }
  const regions = new Set(assets.flatMap((a) => (a.regions || (a.region ? [a.region] : []))));
  console.log(`regions covered: ${regions.size ? [...regions].join(', ') : 'none tagged yet'}`);
}

async function main() {
  if (cmd === 'validate') {
    const file = get('--file');
    if (!file) { console.error('--file required'); process.exit(1); }
    const pack = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    const list = Array.isArray(pack) ? pack : pack.assets || [];
    const { assets, rejected } = mergeCatalogs(list);
    console.log(`valid: ${assets.length}; rejected: ${rejected.length}`);
    for (const r of rejected) console.log('  ✖', r.id, '→', r.errors.join('; '));
    process.exit(rejected.length ? 1 : 0);
  }
  if (cmd === 'resolve') {
    const id = get('--archive');
    const out = get('--out', 'pack-draft.json');
    if (!id) { console.error('--archive <item-id> required'); process.exit(1); }
    const draft = await resolveArchive(id);
    fs.writeFileSync(path.resolve(out), JSON.stringify(draft, null, 2));
    console.log(`${draft.length} candidate asset(s) written to ${out}. Fill in region/register tags, confirm license, then run validate.`);
    return;
  }
  if (cmd === 'status') { printStatus(); return; }
  console.error('usage: audio-pack.mjs validate|resolve|status  (--file pack.json | --archive <id> | …)');
  process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
void progressionFrom;
