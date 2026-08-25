# Le Studio validation study — protocol

This document is the operating manual for populating the external-validation
stores with **genuine human data**. Nothing in this repository may synthesise
entries: every number the app publishes must trace back to a real learner, a
real teacher judgement, or a real exam result. The ships-empty tests enforce
this; so should you.

## Roles

- **Recruiter** — finds learners and raters (you, probably).
- **Rater** — a qualified human: French teacher, examiner, or competent
  native speaker. Records independent marks. One rater = one identity string,
  used consistently (`rater: "M. Leroy (LYC-2)"`).
- **Operator** — runs the CLI/app imports. Never edits scores by hand.

## Universal rules

1. **Consent**: learners agree their (anonymised) responses are used for
   research. Recordings additionally need a consent basis — the audio pack
   refuses assets without `license` + `consentBasis` + `sourceUrl`.
2. **Anonymity**: packets and bundles carry item content only — no names, no
   emails. Rater identities are strings the rater chose.
3. **Independence**: second marks must come from a *different* rater. The
   import layer refuses same-rater double marks.
4. **No back-filling scores**: a mark you did not observe does not exist.
   Missing marks stay missing until a rater supplies them.
5. **Every import is content-keyed**: identical rows are skipped, conflicting
   rows are reported. Re-running an import is always safe.

## Streams, targets and collection

Targets are the minimum n for a publishable metric (see VALIDATION.md).

### 1. Placement vs known level — target 100

One row per learner who has BOTH an app placement result and an independent
CEFR judgement (teacher estimate, or DELF/TCF/GCSE result).

`placement.csv` columns:

```
knownLevel,placedLevel,theta,se,itemsAsked,rater,source,at
B1,B1,0.2,0.45,12,M. Leroy (LYC-2),teacher,2026-09-14
```

- `theta`/`se`/`itemsAsked` come from the app: Settings → Developer panel →
  *Placement validation — teacher entry* shows the last test result; the
  learner's Dev Panel → *Use last test result* fills them.
- `source`: `teacher` or the exam name.

### 2. Progression / held-out transfer — target 100

After a learner's CEFR level rises in-app, give ONE unseen task per skill
(buildTransferCheck draws them), mark it without hints/translation.

`progression.csv` columns:

```
from,to,unseen.reading,unseen.listening,unseen.writing,unseen.speaking,unseen.grammar,unseen.vocabulary,at
A2,B1,72,68,55,61,70,74,2026-10-02
```

Empty column = that skill was not assessed. Scores are the teacher's 0–100.

### 3–4. Speaking & writing corpora — targets 300 / 100 double-marked

Learner responses collected in-app (Arena turns seed speaking; Writing
Studio seeds writing) and exported as bundles. Raters mark them.

`corpus.csv` columns:

```
id,mode,prompt,response,aiScore,humanScore,humanScore2,rater,rater2,criterion,at
```

- Leave `humanScore`/`humanScore2` empty when not yet marked — the app seeds
  the AI side automatically; raters add the human side.
- `criterion`: communication | accuracy | range | pronunciation | spontaneity
  | content | organisation | comprehension | grammar | vocabulary | cefr | exam.
- Double-marking: ~100 of each 300 need a second independent marker.
- Rater packets for this flow: `npm run validation:packet -- --make --track
  speaking --n 30 --raters 3 --out packets/speaking-1.json`, hand the JSON to
  the rater, then `--merge` the completed marksheet back.

### 5–6. Listening & reading comprehension — targets 200 each

One row per app attempt paired with an independent human mark of the SAME
item (teacher estimate of what the learner understood, or an exam component
score).

`comprehension.csv` columns:

```
skill,itemId,itemTitle,aiScore,humanScore,humanScore2,rater,rater2,source,cefr,at
listening,track:cafe-noon,Le café de midi,64,70,,Mme Roy,,teacher,B1,2026-09-20
```

`aiScore` is what the app's quiz scored. In-app entry: Settings → Developer
panel → *Comprehension validation — teacher entry*.

### 7. Pronunciation intelligibility — target 200

Recordings of real speakers (consenting adults), each rated by ~3 French
speakers on 1–5 intelligibility. Audio files go through the audio pack
(license + consent basis + source URL required).

`pronunciation.csv` columns:

```
target,transcript,humanMean,raters,sourceUrl,license,consentBasis,at
Les ponts de Paris,Les ponts de Paris,4.3,"L1;L2;L3",https://...,cc-by,cc-license-terms,2026-09-22
```

- `target` = the sentence the speaker was saying; `transcript` = what a
  listener actually heard (used for the phoneme error analysis).
- `humanMean` = mean of the listeners' 1–5 intelligibility judgements.

### 8. Examiner benchmark — target 100

App exam percentage vs a qualified examiner's percentage for the SAME
simulated paper.

`examiner.csv` columns:

```
appPercent,examinerPercent,boardId,tier,rater,at
71,68,wjec-gcse-3830,,M. Leroy (LYC-2),2026-10-05
```

### 9. Real exam outcomes — target 100

App-estimated grade vs the grade actually awarded on the real exam.

`real-exam.csv` columns:

```
predictedGrade,actualGrade,boardId,at
B,B,wjec-gcse-3800,2027-08-20
```

Only real sittings. Predicted grades from earlier app versions count.

### 10. Assistance / FSRS / retention

These populate themselves from genuine use (assistance log, review events).
No collection campaign — just learners using the app. Floors: assistance
n≥50, FSRS scoring n≥50, fitting n≥200.

## Operating the pipeline

```bash
# Where are we?
npm run validation:status

# Collect (spreadsheet per stream, columns above), then import:
npm run validation:import -- --track placement --file data/placement.csv

# Double-marking workflow for the corpora:
npm run validation:packet -- --make --track speaking --n 30 --raters 3 --out packets/sp-1.json
#   → rater marks offline → 
npm run validation:packet -- --merge packets/sp-1.raterA.json --rater raterA --into validation-dataset.json

# In-app alternatives: Dev Panel teacher-entry forms, and
# Analytics → Evidence study → Export/Import bundle.
```

## Publication gate

A stream's metric may be published only when `validation:status` reports
`validated` (n at/above its floor) AND the underlying entries carry rater
attribution. Until then the status line says `no-data` or `provisional` —
and that is the correct thing for it to say. The example metrics in early
planning notes (76% agreement, .82 correlation, …) are ASPIRATIONS to measure,
never numbers to type in.
