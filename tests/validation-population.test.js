// Population-layer tests: bulk import/packet/status tooling.
//
// The invariant under test everywhere: zero-state honesty. Empty datasets
// stay empty, bad rows are refused with clear errors, and the status report
// prints '—' rather than inventing a number.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  aggregateExports,
  csvToRows,
  emptyDataset,
  loadDataset,
  mergeDataset,
  parseCorpusRows,
  parseComprehensionRows,
  parseExaminerRows,
  parsePlacementRows,
  parsePronunciationRows,
  parseProgressionRows,
  parseRealExamRows,
  rowsToCsv,
  writeJsonAtomic,
} from '../scripts/lib/validation-io.mjs';
import { applyMarksheet, buildPacket } from '../scripts/validation-packet.mjs';
import { statusReport } from '../scripts/validation-status.mjs';

const run = promisify(execFile);
// Same, but tolerates a non-zero exit (used where exit 1 is the honest result).
const runAllowFail = async (...args) => {
  try { return await run(...args); } catch (e) { return e; }
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;

async function tmpWorkspace() {
  return mkdtemp(path.join(tmpdir(), 'lestudio-validation-'));
}

const BASE_AT = '2026-01-15T10:30:00Z';

// Schema-factory-valid fixtures (source labelled so they can never masquerade
// as real data if a copy ever leaks somewhere).
function placementFixtures(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `fix-pv-${i}`,
    knownLevel: 'B1',
    placedLevel: i % 4 === 0 ? 'B2' : 'B1',
    theta: 0.2,
    se: 0.45,
    itemsAsked: 14,
    rater: 'Fixture Rater',
    source: 'test-fixture',
    at: new Date(Date.parse(BASE_AT) + i * 60000).toISOString(),
  }));
}

describe('csv parser', () => {
  it('round-trips quoted fields, embedded commas/quotes and CRLF', () => {
    const rows = [
      { id: 'r1', prompt: 'Décris ta maison, s’il te plaît', note: 'she said "bonjour" twice' },
      { id: 'r2', prompt: 'line\nbreak', note: 'a,b' },
    ];
    const csv = rowsToCsv(rows);
    assert.ok(csv.includes('\r\n'), 'writer emits CRLF');
    const parsed = csvToRows(csv);
    assert.deepEqual(parsed, rows);
  });

  it('parses CRLF and LF input with quoted embedded newlines', () => {
    const csv = 'id,val\r\na,"x,y"\nb,"multi\r\nline"\n';
    const parsed = csvToRows(csv);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].val, 'x,y');
    assert.equal(parsed[1].val, 'multi\r\nline');
  });
});

describe('parse*Rows schema bridges', () => {
  it('placement accepts factory-valid rows and rejects bad ones with clear errors', () => {
    const good = parsePlacementRows(placementFixtures(2));
    assert.equal(good.errors.length, 0);
    assert.equal(good.valid.length, 2);
    assert.equal(good.valid[0].exact != null, true, 'factory derived fields present');

    const bad = parsePlacementRows([
      { knownLevel: '', placedLevel: 'B1', theta: 1, se: 1, itemsAsked: 5 },
      { placedLevel: 'B1', theta: 'nope', se: 1, itemsAsked: 5 },
      { knownLevel: 'B1', placedLevel: 'B1', theta: 0.2, se: 99, itemsAsked: 5 },
      { knownLevel: 'ZZ', placedLevel: 'B1', theta: 0.2, se: 1, itemsAsked: 5 },
      null,
    ]);
    assert.equal(bad.valid.length, 0);
    assert.equal(bad.errors.length, 5);
    assert.match(bad.errors[0].error, /knownLevel/);
    assert.match(bad.errors[3].error, /schema/);
  });

  it('corpus accepts valid entries; mode/prompt/response are required', () => {
    const good = parseCorpusRows([{
      id: 'c1', mode: 'writing', prompt: 'Décris ta ville', response: 'Ma ville est belle.',
      aiScore: 70, humanScore: 66, rater: 'R1', at: BASE_AT,
    }]);
    assert.equal(good.valid.length, 1);
    assert.equal(good.valid[0].paired, true);

    const bad = parseCorpusRows([{ mode: 'telepathy', prompt: '', response: '' }]);
    assert.equal(bad.valid.length, 0);
    assert.match(bad.errors[0].error, /missing required field\(s\): (mode|prompt|response)/);
    const badMode = parseCorpusRows([{ mode: 'song', prompt: 'p', response: 'r' }]);
    assert.match(badMode.errors[0].error, /rejected by corpus schema/);
  });

  it('comprehension requires skill plus an item reference', () => {
    const good = parseComprehensionRows([{
      id: 'k1', skill: 'listening', itemId: 'track-9', aiScore: 80, humanScore: 75,
      rater: 'R1', source: 'teacher', at: BASE_AT,
    }]);
    assert.equal(good.valid.length, 1);
    const bad = parseComprehensionRows([{ skill: 'smelling', aiScore: 50 }]);
    assert.match(bad.errors[0].error, /itemId\/itemTitle|skill/);
  });

  it('pronunciation validates through makeBenchmarkSample (humanMean 1–5)', () => {
    const good = parsePronunciationRows([{
      id: 'b1', target: 'Je voudrais un café', transcript: 'Je voudrai un café',
      humanMean: 4, raters: 'L1;L2;L3', at: BASE_AT,
    }]);
    assert.equal(good.valid.length, 1);
    assert.deepEqual(good.valid[0].raters, ['L1', 'L2', 'L3']);
    const bad = parsePronunciationRows([{ target: 'Bonjour', transcript: 'Bonjour', humanMean: 9 }]);
    assert.match(bad.errors[0].error, /pronunciation schema/);
  });

  it('examiner and real-exam rows mirror the storage admission rules', () => {
    assert.equal(parseExaminerRows([{ appPercent: 60, examinerPercent: 63, at: BASE_AT }]).valid.length, 1);
    const bad = parseExaminerRows([{ appPercent: 'high', examinerPercent: 63 }]);
    assert.match(bad.errors[0].error, /examiner schema/);
    const exam = parseRealExamRows([{ predictedGrade: '7', actualGrade: '6', at: BASE_AT }]);
    assert.equal(exam.valid.length, 1);
    assert.match(parseRealExamRows([{ predictedGrade: '7' }]).errors[0].error, /actualGrade/);
  });

  it('progression accepts dotted unseen columns and refuses non-increasing levels', () => {
    const good = parseProgressionRows([{
      id: 'g1', from: 'A2', to: 'B1', 'unseen.reading': '72', 'unseen.listening': '65', transfer: 'true', at: BASE_AT,
    }]);
    assert.equal(good.valid.length, 1);
    assert.equal(good.valid[0].unseen.reading, 72);
    const flat = parseProgressionRows([{
      id: 'g2', from: 'B2', to: 'B1', 'unseen.reading': 90, at: BASE_AT,
    }]);
    assert.equal(flat.valid.length, 0, 'to must be above from');
  });
});

describe('mergeDataset dedupe + rater independence', () => {
  it('refuses exact duplicate rows but keeps distinct ones', () => {
    const rows = placementFixtures(2).map((r, i) => ({ ...r, id: `dup-${i}` }));
    const first = mergeDataset(emptyDataset(), { placementValidations: rows });
    assert.equal(first.added.length, 2);
    const second = mergeDataset(first.dataset, { placementValidations: rows.map((r) => ({ ...r })) });
    assert.equal(second.added.length, 0, 'exact duplicates refused');
    assert.equal(second.duplicates.length, 2);
    assert.equal(second.dataset.placementValidations.length, 2);
  });

  it('counts same-key different-content as conflict and keeps the incumbent', () => {
    const row = placementFixtures(1)[0];
    const first = mergeDataset(emptyDataset(), { placementValidations: [row] });
    // Same natural key (levels/theta/se/rater/minute) but altered metadata.
    const changed = mergeDataset(first.dataset, { placementValidations: [{ ...row, source: 'a-different-source' }] });
    assert.equal(changed.conflicts.length, 1);
    assert.equal(changed.dataset.placementValidations[0].source, row.source, 'incumbent wins');
  });

  it('rejects a second mark whose rater equals the first rater (same row)', () => {
    const res = mergeDataset(emptyDataset(), {
      corpus: [{
        id: 'cm1', mode: 'speaking', prompt: 'Au marché', response: 'Je voudrais des pommes',
        aiScore: 64, humanScore: 70, rater: 'Rater A', humanScore2: 71, rater2: 'Rater A', at: BASE_AT,
      }],
    });
    assert.equal(res.dataset.corpus.length, 0, 'row never enters the dataset');
    assert.equal(res.errors.length, 1);
    assert.match(res.errors[0].error, /rater independence/i);
  });

  it('rejects a second mark matching an existing entry’s first rater (cross-row)', () => {
    const base = {
      mode: 'writing', prompt: 'Ma maison', response: 'grande et lumineuse',
      aiScore: 55, at: BASE_AT,
    };
    const seeded = mergeDataset(emptyDataset(), {
      corpus: [{ id: 'first', ...base, humanScore: 60, rater: 'Prof. Roux' }],
    });
    const second = mergeDataset(seeded.dataset, {
      corpus: [{ id: 'second', ...base, humanScore: 58, rater: 'Someone Else', humanScore2: 61, rater2: 'prof. roux' }],
    });
    assert.equal(second.dataset.corpus.some((e) => e.id === 'second'), false);
    assert.match(second.errors[0].error, /already supplied the first mark/);

    // A genuinely independent second rater merges fine.
    const ok = mergeDataset(seeded.dataset, {
      comprehension: [{
        skill: 'reading', itemId: 'text-1', humanScore: 80, humanScore2: 82, rater: 'A', rater2: 'B', at: BASE_AT,
      }],
    });
    assert.equal(ok.errors.length, 0);
    assert.equal(ok.dataset.comprehensionValidations.length, 1);
  });
});

describe('atomic writes', () => {
  it('writes atomically and leaves no temp files behind', async () => {
    const dir = await tmpWorkspace();
    const target = path.join(dir, 'ds.json');
    await writeJsonAtomic(target, { hello: 'le studio' });
    assert.equal(JSON.parse(await readFile(target, 'utf8')).hello, 'le studio');
    const leftover = (await readdir(dir)).filter((f) => f.includes('.tmp'));
    assert.deepEqual(leftover, []);
  });

  it('on failure no .tmp file is left anywhere', async () => {
    const dir = await tmpWorkspace();
    const circular = {};
    circular.self = circular;
    await assert.rejects(() => writeJsonAtomic(path.join(dir, 'ds.json'), circular));
    const leftover = (await readdir(dir)).filter((f) => f.includes('.tmp'));
    assert.deepEqual(leftover, [], 'failed serialisation must not leave temp files');

    await writeFile(path.join(dir, 'blocker'), 'not a directory');
    await assert.rejects(() => writeJsonAtomic(path.join(dir, 'blocker', 'ds.json'), {}), /ENOTDIR|EEXIST|EPERM/);
    const inBlocker = (await readdir(dir)).filter((f) => f.includes('.tmp'));
    assert.deepEqual(inBlocker, []);
  });
});

describe('packet workflow anonymisation + round trip', () => {
  it('packets contain item content only — no learner identifiers or raters leak', async () => {
    const dataset = {
      corpus: [
        { id: 'e1', mode: 'speaking', prompt: 'Au marché', response: 'Je voudrais des pommes', aiScore: 64, learnerId: 'learner-42', rater: null },
        { id: 'e2', mode: 'speaking', prompt: 'À la gare', response: 'Un billet pour Lyon', aiScore: 58 },
        { id: 'e3', mode: 'writing', prompt: 'Ma rue', response: 'Il y a une boulangerie', aiScore: 71, humanScore: 68, rater: 'Prof. Secret' },
      ],
    };
    const { packet, error } = buildPacket(dataset, { track: 'speaking', n: 10, raters: 2 });
    assert.ok(!error);
    assert.equal(packet.items.length, 2); // e3 already has its first mark
    const json = JSON.stringify(packet);
    assert.ok(!json.includes('learnerId'), 'no learnerId field may be emitted');
    assert.ok(!json.includes('learner-42'));
    assert.ok(!json.includes('Prof. Secret'));
    for (const item of packet.items) {
      assert.deepEqual(Object.keys(item).sort(), ['itemId', 'prompt', 'transcript'].sort());
    }
  });

  it('--make → --merge round trip attributes marks and enforces independence', async () => {
    const dir = await tmpWorkspace();
    const datasetPath = path.join(dir, 'validation-dataset.json');
    await writeJsonAtomic(datasetPath, {
      corpus: [{ id: 'pkt-item', mode: 'speaking', prompt: 'Au café', response: 'Un café, s’il vous plaît', aiScore: 60 }],
    });

    const packetProc = await run(NODE, [
      'scripts/validation-packet.mjs', '--make', '--track', 'speaking', '--n', '5', '--raters', '2',
      '--out', path.join(dir, 'batch.json'), '--dataset', datasetPath,
    ], { cwd: ROOT });
    assert.match(packetProc.stdout, /1 item\(s\) sampled/);

    const packet = JSON.parse(await readFile(path.join(dir, 'batch.json'), 'utf8'));
    const marksheet = { batchId: packet.batchId, track: packet.track, marks: [{ itemId: 'pkt-item', score: '77' }] };
    const marksheetPath = path.join(dir, 'batch.raterA.json');
    await writeFile(marksheetPath, JSON.stringify(marksheet));

    await run(NODE, ['scripts/validation-packet.mjs', '--merge', marksheetPath, '--rater', 'raterA', '--into', datasetPath], { cwd: ROOT });
    let ds = await loadDataset(datasetPath);
    assert.equal(ds.corpus[0].humanScore, 77);
    assert.equal(ds.corpus[0].rater, 'raterA');

    // Same rater again → refused (and the CLI exits 1: nothing applied).
    await writeFile(marksheetPath, JSON.stringify({ ...marksheet, marks: [{ itemId: 'pkt-item', score: 79 }] }));
    const refused = await runAllowFail(NODE, ['scripts/validation-packet.mjs', '--merge', marksheetPath, '--rater', 'raterA', '--into', datasetPath], { cwd: ROOT });
    assert.match(refused.stdout, /1 refused/);
    await writeFile(marksheetPath, JSON.stringify({ ...marksheet, marks: [{ itemId: 'pkt-item', score: 81 }] }));
    await run(NODE, ['scripts/validation-packet.mjs', '--merge', marksheetPath, '--rater', 'raterB', '--into', datasetPath], { cwd: ROOT });
    ds = await loadDataset(datasetPath);
    assert.equal(ds.corpus[0].doubleMarked, true);
    assert.equal(ds.corpus[0].consensus, '79');
  });

  it('applyMarksheet refuses unknown items and out-of-range scores without guessing', () => {
    const ds = { corpus: [{ id: 'x1', mode: 'writing', prompt: 'p', response: 'r' }] };
    const res = applyMarksheet(ds, { marks: [{ itemId: 'ghost', score: 50 }, { itemId: 'x1', score: 250 }] }, 'raterZ');
    assert.equal(res.updated, 0);
    assert.equal(res.errors.length, 2);
  });
});

describe('status reporting honesty', () => {
  it('empty dataset: zero counts, no-data statuses, — metrics, exit 0', async () => {
    const dir = await tmpWorkspace();
    const dsPath = path.join(dir, 'empty.json');
    await writeJsonAtomic(dsPath, emptyDataset());
    const { stdout } = await run(NODE, ['scripts/validation-status.mjs', '--dataset', dsPath], { cwd: ROOT });
    assert.match(stdout, /placement\s+0\s+20\s+20\s+no-data\s+—/);
    assert.match(stdout, /\bfsrs\b\s+0\s+50\s+200\s+no-data\s+—/);
    const dashCells = stdout.split('\n').filter((l) => l.includes('—')).length;
    assert.ok(dashCells >= 9, 'every track reports — when there is no data');
  });

  it('computes real numbers once a floor-meeting fixture is supplied', async () => {
    const dir = await tmpWorkspace();
    const dsPath = path.join(dir, 'fixture.json');
    const ds = emptyDataset();
    ds.placementValidations = parsePlacementRows(placementFixtures(24)).valid;
    await writeJsonAtomic(dsPath, ds);

    const { stdout } = await run(NODE, ['scripts/validation-status.mjs', '--dataset', dsPath], { cwd: ROOT });
    assert.match(stdout, /placement\s+24\s+20\s+20\s+validated\s+exact \d+% · ±1 \d+%/);
    assert.match(stdout, /progression\s+0\s+15\s+15\s+no-data\s+—/, 'other tracks stay honest while empty');

    const jsonOut = await run(NODE, ['scripts/validation-status.mjs', '--dataset', dsPath, '--json'], { cwd: ROOT });
    const report = JSON.parse(jsonOut.stdout);
    const placementRow = report.rows.find((r) => r.track === 'placement');
    assert.equal(placementRow.n, 24);
    assert.equal(placementRow.status, 'validated');
    assert.match(placementRow.headline, /exact \d+%/);
    assert.notEqual(placementRow.headline, '—');
  });

  it('statusReport on an in-memory empty object stays no-data across all tracks', () => {
    const rows = statusReport({});
    assert.equal(rows.length, 9);
    for (const row of rows) {
      assert.equal(row.n, 0);
      assert.equal(row.status, 'no-data');
      assert.ok(row.headline.split('·').every((part) => part.includes('—')), `no number claimed for ${row.track}`);
    }
  });
});

describe('aggregateExports over account.exportProgress backups', () => {
  it('merges backup stores, counts conflicts, skips malformed payloads', () => {
    const backup = {
      app: 'le-studio', version: 2, exportedAt: '2026-02-01T09:00:00Z',
      data: {
        'fp.placementValidations.v1': JSON.stringify(placementFixtures(3)),
        'fp.writingSpeakingCorpus.v1': JSON.stringify([{
          id: 'bk-c1', mode: 'writing', prompt: 'Mon quartier', response: 'Calme.', aiScore: 62,
        }]),
        'fp.groqKey': '"secret"', // must never be mapped into the dataset
      },
    };
    const res = aggregateExports([backup, backup, { app: 'other-app', data: {} }]);
    assert.equal(res.stats.backups, 2, 'both Le Studio payloads are processed');
    assert.equal(res.stats.skipped, 1);
    assert.equal(res.dataset.placementValidations.length, 3, 'identical backups dedupe to one dataset');
    assert.equal(res.dataset.corpus.length, 1);
    const serialised = JSON.stringify(res.dataset);
    assert.ok(!serialised.includes('secret'), 'API-key stores must never reach the research dataset');
    assert.match(res.errors[0].error, /not a Le Studio exportProgress payload/);
  });
});
