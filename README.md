# Le Studio

**The French speaking coach that finds the mistakes you keep making — and proves you've fixed them.**

Built for GCSE and A-level candidates (WJEC, AQA, Edexcel), and for anyone who
wants to speak French better than they do today.

- **Live app:** https://le-studio-french.vercel.app
- Runs in your browser. No account needed to start. Works offline once loaded.

## What it does

You speak French. Le Studio tells you, in plain English, **exactly what you
keep getting wrong** — not a vague score out of 100 — and then shows you honest
proof of when you've fixed it.

A first session takes about three minutes: you pick a goal, say a few sentences
out loud, and get real feedback immediately. You don't need an API key, and you
don't need to sign in.

Today is a single composed session, not a mode picker. A typical plan:
listen to something, hold a short conversation, a **targeted repair** segment
built from the learner's own error model, the **check that repair owes** (see
§5), then a retrieval step. Segments are capability-aware (offline → authored
drills replace AI drills) and every segment explains itself: **what you're
practising, why it was chosen** (real evidence: recurring mistakes, due cards),
**what success requires**, and the current recovery state. Learners never see
internal ids, engine names or research vocabulary — copy is test-enforced
(`tests/segment-explain.test.js`).

### The core loop

1. **Speak.** Hold a real conversation with an AI partner that corrects your
   grammar, vocabulary and pronunciation as you go, naming the specific
   mistakes you repeat.
2. **See the pattern.** Every correction becomes a *weakness* in one shared
   error model, prioritised by how often it recurs, how many modes it appears
   in, and whether you needed help.
3. **Fix it.** Today's session is composed for you — the weakest thing gets
   targeted repair, then a fresh-context check, then a delayed retest.
4. **Prove it.** The **"Mistakes fixed" timeline** tracks each weakness from
   the moment it was first spotted, through repair, an unseen retest and a
   delayed re-check — and says plainly when something is still missing.

### Exam Speaking Mode

Timed speaking tasks shaped like the real WJEC, AQA and Edexcel papers —
role-play, photo-card and general-conversation — with a real clock, an examiner
persona, and marking against band descriptors that **leads with the time
shortfall**, because running out of time is the mistake that costs the most
marks.

These are **indicative practice papers, not official ones**. They carry
`official: false`, a spec version and a `verifyAt` date telling you where to
check the real thing. No grade is invented: the app shows a band, and only
converts it to a grade against boundaries you enter yourself.

An exam-date countdown reshapes what Today gives you, so the weeks before a
paper are spent on what that paper will actually ask.

## What it deliberately doesn't do

- **It never claims mastery from one correct answer.** A single good answer
  leaves a weakness "improving" at most. "Demonstrated" needs a held-out
  transfer *and* a genuinely delayed retest.
- **It never fills in missing evidence.** If a transfer or delayed retest hasn't
  happened, the timeline says so instead of guessing.
- **It shows uncertainty.** Small samples wear wide intervals rather than false
  precision.
- **Assisted success counts for less.** If you needed a hint, the evidence is
  weaker and says so.
- **No external results are claimed** that the dataset doesn't contain. Empty
  validation tracks read "no-data" — nothing is invented.

## Privacy

- **Local-first.** No account is required. Progress, review history and your
  weakness model stay in your browser by default.
- **The AI key never touches your browser** on the hosted app. Your first
  sessions run on a free trial quota; if you bring your own key it stays in this
  browser only, and is never exported.
- **Cloud sync is encrypted by default.** Saving to an account requires a
  passphrase; the server holds data it cannot read. **If you forget the
  passphrase that copy is gone** — there is no reset.
- **A sync code is a secret.** Treat an encrypted `LS1:` code like a password.
- **Mock Mode** makes the whole studio work with no AI at all, honestly labelled
  as such.

### The two links that are actually run

Transfer and delayed retest are only real if something administers them, so
`src/lib/followUp.js` turns each owed check into one concrete, offline task
bound to the weakness that owes it, and the session runs it as its own segment:

| The model owes | The learner is asked | Why it counts |
|---|---|---|
| a fresh-context check on an authored rule | different sentences for the same rule | the repair drill only ever shows the topic's `drills` lane, so `quiz` items are unseen — the rule, not the sentence, is being tested |
| a fresh-context check on a word | to use the word in a sentence of their own | graded for presence, for being a sentence rather than the bare word, and for not copying the studied line; it claims productive **use**, never grammar |
| a fresh-context check on listening | the comprehension quiz of a recording they have never scored | the verdict comes from what was understood, on unseen audio; the bar is full comprehension, because a listening weakness is exactly "the ear gives out on material it has not met" |
| a delayed retest | the same check, days later | the floor is real elapsed time, and the check is only offered once |

Three rules keep this honest: the due list has **one** owner
(`learningEvidence.dueLearningChecks`), so the session, Today's brief and
Progress can never disagree about what is owed; a success is called **delayed**
only on a clock-verified flag or an inference that clears `DELAYED_MIN_HOURS`
(20h), because crossing midnight can be ten minutes with the answer still on
screen; and a pass is called **transfer** only by a runner that actually
administered and graded fresh material, never on the strength of a mode name.
Revealing a transcript or replaying more than twice marks a listening pass as
**assisted**: a real success that deliberately withholds the demonstration.

**Where the loop still says nothing.** Pronunciation, speaking and reading
follow-ups return nothing today, each for its own reason: pronunciation is
spoken and its only honest scorer needs a microphone, so a promised check could
silently never run; speaking already has its own transfer step inside the
conversation loop, where the "use it somewhere new" challenge verifies novelty
before recording anything; reading has no item pool keyed to the weak skill.
`null` means no segment is scheduled and nothing is promised — the alternative
is repeating practice and calling it a check (`tests/follow-up.test.js`,
`tests/follow-up-evidence.test.js`, `tests/delayed-floor.test.js`,
`tests/authored-drill-rotation.test.js`).

The repair drill rotates too. An authored topic's `drills` lane is a small pool
(3–5 items), so the daily window shifts instead of showing the same questions in
the same order every session — blocked repetition is the one thing targeted
practice exists to avoid.

## 6. Supported languages and maturity

| Language | Maturity | What that means |
|---|---|---|
| 🇫🇷 French | **Full** | Everything: grammar topics, culture, exam boards, learning path |
| 🇩🇪 German | **Beta** | Core loop: Today, conversations, vocabulary, dictée, phrasebook, AI tutor |
| 🇪🇸 Spanish | **Beta** | Core loop, as above |

Language availability comes from ONE authoritative capability matrix
(`src/lib/capabilities.js`): each row (`conversation`, `dictation`,
`reading-library`, `essay-prompts`, `number-listening`, …) lists exactly the
languages whose content actually exists, and every surface — Today, Home,
Learn, Skills, Search, onboarding, deep links, session planning, prefetching —
asks that matrix. The legacy `FULL_ONLY_FEATURES` set (`src/lib/languages.js`)
is now a *derived compatibility API* (French-only feature ids read off the
matrix), not the source of truth. For Beta languages French-authored surfaces
are hidden — not half-working — with honest copy about what *is* available
(`tests/maturity-gating.test.js`, `tests/submode-capabilities.test.js`, and
behavioural coverage in `e2e/beta-languages`/`e2e/beta-submodes` specs).

## 7. Exam support (French)

Timed speaking/writing/listening/reading papers for **WJEC GCSE & A-level**,
**AQA GCSE** and **Edexcel GCSE**, with supervised preparation, real clocks,
band-descriptor marking that leads with time shortfall, and honest grade
handling (indicative band + learner-entered real boundaries). Results feed the
examiner-benchmark validation track.

## 8. AI / privacy architecture

- **Local-first by default.** No account is required. Practice state, SRS,
  learner models and settings remain in browser storage unless the learner
  explicitly exports or syncs them.
- **Bring your own key.** The provider key lives in `localStorage`
  (`fp.groqKey`) via the settings store; it is never exported, and a build-time
  guard (`npm run check:secrets`) fails the build if a provider secret is ever
  exposed through a `VITE_*` variable.
- **Optional relay** for shared hosting: `VITE_GROQ_RELAY_URL` routes AI calls
  through an authenticated server that holds the key (`server/relay.js`).
- **Mock mode** makes the whole studio workable with no key at all.
- **Optional Google account + cloud snapshot.** When `DATABASE_URL`,
  `AUTH_SECRET` and Google OAuth credentials are configured, `/api/auth/*` and
  `/api/sync` can store one portable sync-code snapshot per account. Pushes use
  server-side optimistic concurrency so a stale device cannot silently replace
  a newer snapshot. A passphrase encrypts the snapshot client-side with AES-GCM;
  without a passphrase the snapshot is portable but not end-to-end encrypted.
  Snapshot creation does not mark a backup as successful until the server has
  acknowledged the write; network failures, malformed responses, conflicts and
  oversized snapshots leave local learner state intact.
- **Pulse sharing is opt-in and transcript-free**; turning it off deletes the
  mirror immediately. The evidence study writes only anonymised, local data and
  never enrols without explicit consent.

## 9. Offline / PWA behaviour

Installable PWA with a service worker (network-first, cache-fallback) that
runtime-caches app surfaces and content as they are loaded. Content libraries
are per-language lazy modules/assets, including the French scenario JSON asset.
Previously loaded practice content, SRS, drills and TTS audio work offline;
first-use lazy assets, live AI conversation/marking and uncached remote authentic
audio may need the network. Progress moves
between devices via JSON export/import or an `LS1:` sync code (household
namespacing preserved). Deployments may optionally store that same snapshot
behind Google sign-in; cloud failure never disables local practice. The OS
badge/reminders use the shared live due count (`src/hooks/useStudioBoot.js`).

## 10. Validation and evidence status

Validation tracks (placement, progression, writing/speaking corpus,
comprehension, pronunciation, examiner agreement, real exam results, assistance,
FSRS) report **only real, dated human marks**. Empty tracks read "no-data" —
nothing is invented. Every proportion now carries a **95% Wilson interval**
(`src/lib/evidenceUncertainty.js`), so small samples wear wide intervals rather
than false precision; tracks below their documented floor are "provisional".
Method note: `METHOD_NOTE` in `src/lib/validationStatusReport.js`; live status
via `npm run validation:status`. XP/streaks/activity are reported separately
from proficiency and never mixed into agreement figures. **No external results
are claimed beyond what the dataset contains.**

## 11. Development and testing

```bash
npm install
npm run dev      # local dev server
npm run check    # secret guard, public-URL + header sync, content lint, eslint, tests
npm run build    # guard → build → service worker → size budget
npm run e2e      # Playwright end-to-end
```

The domain contracts (weakness model, evidence rules, security headers) are
enforced by executed tests in `tests/domain-shapes.test.js` and
`tests/security-headers.test.js` — see
[docs/architecture.md](docs/architecture.md#type-checking--what-npm-run-type-check-actually-does)
for why that is the contract rather than `checkJs`.

- **Per-push CI** (`.github/workflows/french-practice.yml`): secret guard, public
  URL/header sync, content lint, eslint, tests, type-check, build, size budget,
  and Playwright E2E on Chromium + mobile Chromium.
- **Daily cross-browser CI** (`.github/workflows/cross-browser.yml`): Firefox +
  WebKit over the engine-specific paths (MediaRecorder, mic permissions,
  service worker/PWA, offline, Today, language switching).

Playwright's Chromium suite passes with **0 failures** (recent runs: 51–52
passing; the exact count moves with the suite, so read the runner's summary).
Locally, first confirm port 5173 is not already serving a *different* app — see
[docs/architecture.md](docs/architecture.md#e2e-the-port-5173-trap-read-this-before-trusting-an-e2e-run).

```
src/
  App.jsx                 screen composition + domain wiring: tabs, one
                          overlay reducer, session/activity callbacks,
                          onboarding/settings fan-out
  hooks/                  useStudioBoot (warm-up, reminder, badge, clock),
                          useSessionLifecycle (persist/restore, language
                          switch), useRewards (XP/coins/celebrations),
                          usePwaInstall, useOverlayNav, useScenarios,
                          useAppearance, useTodayDeps
  lib/
    capabilities.js       authoritative language-capability matrix
    storageCore.js        physical layer: key map, learner (household) routing
    storage.js            compat facade over the domain stores
    stores/               domain stores: settings, learnerError, study,
                          seen-lists, research (light/heavy split)
    learnerErrors.js      pure recovery-loop model (evidence-weighted)
    followUp.js           what the loop owes → the concrete check that
                          discharges it (unseen items / new-sentence use)
    fsrs.js mistakeGraph.js segmentExplain.js content/ ...
  components/             screens + hubs (heavy/detail screens lazy-loaded;
                          lightweight navigation hubs stay in the entry graph)
                          FollowUpCheck.jsx runs the owed transfer/delayed
                          check and records its real outcome
api/
  auth/                   optional Google OAuth/session routes
  sync.js                 optional account snapshot API with conflict checks
  _lib/                   Postgres/session/Google integration
database/migrations/      optional account/sync schema
server/                   optional authenticated AI relay + quota enforcement,
                          plus the free no-key trial path (relay-trial.js)
e2e/                      Playwright specs
scripts/                  budget gate, content lint, validation tooling,
                          public-URL and security-header sync, E2E server guard
```

## Documentation

- **[docs/architecture.md](docs/architecture.md)** — how it's built: the
  capability matrix, storage boundaries, the error and evidence models, the
  relay and quota design, performance budgets, CI.
- **[VALIDATION.md](VALIDATION.md)** — the validation tracks, what each one
  measures, and the rule that empty tracks stay empty.
- **[docs/study-protocol.md](docs/study-protocol.md)** — the opt-in evidence
  study (consent required; transcript-free).

## Licence

This repository is **source-available, not open source**: reading, studying
and running it locally for your own study is fine, but no open-source licence
is granted. See [SOURCE_AVAILABILITY.md](SOURCE_AVAILABILITY.md) for the full
terms. If you want to reuse Le Studio beyond that, contact the repository
owner.
