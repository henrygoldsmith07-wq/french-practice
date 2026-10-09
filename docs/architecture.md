# Architecture

Engineering detail for Le Studio. The [README](../README.md) is the
learner-facing page; this file is for people changing the code.

## Shape

A single-page React 18 + Vite + Tailwind 4 PWA. Local-first: the browser is the
primary store, and every server component is optional.

```
src/
  App.jsx                 screen composition, one overlay reducer, domain wiring
  hooks/                  useStudioBoot, useSessionLifecycle, useRewards,
                          usePwaInstall, useOverlayNav, useTodayDeps
  lib/
    capabilities.js       authoritative language-capability matrix
    storageCore.js        the ONLY sanctioned localStorage layer
    storage.js            compat facade re-exporting the domain stores
    stores/               domain stores (settings, learnerError, study, …)
    learnerErrors.js      the weakness model (evidence-weighted)
    learningEvidence.js   the learner-facing recovery loop
    mistakeGraph.js       structural conversation mistakes + retest ladder
    phonemeProfile.js     pronunciation attempts by sound
    fsrs.js               spaced-repetition scheduling
    exams/                board specs, task banks, timed simulator, marking
    evidenceUncertainty.js 95% Wilson intervals for every proportion
  components/             screens and hubs; heavy screens lazy-loaded
api/                      optional Google OAuth + sync routes
server/                   optional authenticated AI relay
scripts/                  budget gate, content lint, public-URL/header sync
e2e/                      Playwright specs
tests/                    node:test suites
```

## The two learner models (and why there are two)

**`learnerErrors`** is the weakness model: a mistake classifies into
category + key, becomes an active weakness, and is prioritised by recurrence,
cross-mode misses, recency, severity, delayed-recall failure and assistance
dependence.

**`learningEvidence`** is the *learner-facing effectiveness loop*:
baseline → intervention → unseen transfer → delayed retest. It is deliberately
separate from XP and from the opt-in research study, because it answers a
different question: *did this weakness actually get better?*

Their evidence rules are load-bearing and must never be weakened:

- One immediate correct answer never implies mastery.
- Assisted success counts for less than independent success and can never
  advance the independence tally.
- Re-submitting one encounter is deduplicated and cannot inflate evidence.
- A `null` follow-up stays `null`; missing evidence stays missing rather than
  being filled with an assumed failure or success.
- A "delayed" retest only counts when it really was delayed (`delayHours` past
  the 20-hour floor). `learningCycleStatus` enforces this via
  `isDelayedEvidence` — a same-session retest tagged `delayed` must never
  demonstrate mastery.
- Evidence decays with age: a transfer from a year ago correctly stops counting.

These are pinned by `tests/domain-shapes.test.js`.

## Type checking — what `npm run type-check` actually does

`checkJs` is **false** in `tsconfig.json`, so tsc does not check the
JavaScript. Turning it on across the domain model produces ~230 errors that are
almost entirely implicit-`any` noise on callbacks, not real bugs.

Rather than claim type coverage that doesn't exist, the contract is enforced by
**executed tests** instead:

- `tests/domain-shapes.test.js` runs the real modules against realistic learner
  state and pins the shapes, types and evidence rules the app depends on.
- `tests/security-headers.test.js` pins the HTTP policy contract.

`npm run type-check` still runs tsc over the TypeScript files (the relay's
`.ts` types). If you annotate the domain model and enable `checkJs` on it, fix
the resulting errors first — do not suppress them.

## AI relay

`server/relay.js` proxies chat and audio calls to the provider. It is the only
place a provider key ever exists.

- **Authentication.** Two tiers. Signed-in callers present a JWT from the
  operator's own issuer (`AUTH_ISSUER`/`AUTH_AUDIENCE` + HS256, RS256 or JWKS).
  First-time visitors use a **trial token minted by the relay itself**
  (`server/relay-trial.js`), so no learner key and no sign-in is needed to reach
  a first session.
- **Tier separation.** Trial requests are charged against a separate, smaller
  daily quota (`RELAY_TRIAL_DAILY_LIMIT`, default 30) keyed on an opaque device
  subject. Rotating device ids cannot spend the signed-in allowance.
- **Fail closed.** Trials are off unless `RELAY_TRIAL_SECRET` is set to at least
  32 characters, and can be disabled with `RELAY_TRIAL_ENABLED=false`. A trial
  token can never escalate to a signed-in identity (tier and scope are checked).
- **Abuse controls.** Per-device and per-tier rate limits, request/response size
  caps, input/output token caps, a model allowlist (`MODEL_LIMITS`), audio and
  image byte caps, origin allowlisting (no wildcards), and structured logging
  that never contains transcripts.
- **Kill switch.** Unset `RELAY_TRIAL_SECRET` (or set the flag) and the free
  path is off; the relay otherwise behaves exactly as before.

The client side (`src/lib/relay.js`) requests a trial token once, caches it
until shortly before expiry, and attaches it automatically when no other
identity is configured.

## Security headers

Defined once in `scripts/lib/security-headers.mjs` and consumed by **both**
`vercel.json` (production) and `vite.config.js` (dev/preview), so the Playwright
suite exercises the real policy.

- CSP: `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`
  (via `frame-src`/`X-Frame-Options`), `connect-src` allowlisting only the app
  origin, the provider used by bring-your-own-key mode, and archive.org audio.
  `blob:`/`data:` are allowed for `media-src`/`worker-src` because MediaRecorder
  and the WAV re-encode need them — a stricter policy silently breaks mic
  capture.
- `script-src 'unsafe-inline'` is a scoped exception for the pre-paint theme
  bootstrap in `index.html`; without it the first paint flashes the wrong theme.
- `Permissions-Policy: microphone=(self)` so an embedding frame can never
  capture audio. Camera and geolocation are disabled.
- HSTS, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Content-Type-Options: nosniff`, COOP.

`tests/security-headers.test.js` fails if the two definitions drift apart.

## Public URLs

The canonical/OG/Twitter tags, `robots.txt`, `sitemap.xml` and `llms.txt` must
all name the same deployment. `scripts/lib/site-url.mjs` is the single source of
truth (`SITE_URL`, defaulting to the project's production host and overridable
by the build environment); `scripts/sync-public-urls.mjs` rewrites and verifies
all four, and is wired into `npm run check` and `npm run build`.

This replaced a real bug: `index.html` pointed at a deployment that no longer
exists, so crawlers indexed a dead host and every shared link previewed as a 404.

## Storage

`storageCore.js` is the sanctioned physical layer: a canonical `fp.*` key map,
per-learner (household) namespacing, lazy claim migration and quota pruning.
Product components never touch browser storage directly —
`tests/storage-boundary.test.js` pins that.

Domain stores (`stores/*.js`) own their keys, shapes and caps. `storage.js`
remains a facade re-exporting the historical surface; the legacy
`FULL_ONLY_FEATURES` API in `languages.js` is derived from the capability
matrix, not authoritative.

Migrations must be idempotent, tested on realistic legacy data, and never lose
learner state.

## Capability matrix

`src/lib/capabilities.js` is the ONE authoritative list of which languages
actually have which content. Every surface — Today, Home, Learn, Skills, Search,
onboarding, deep links, session planning, prefetching — asks it. For Beta
languages, French-authored surfaces are hidden rather than half-working.

## Performance budgets

Enforced post-build by `scripts/check-performance.mjs`:

| Budget | Limit |
|---|---|
| First-load JS (entry + static chunks) | 450 kB |
| Per-chunk ceiling | 600 kB |
| Total JS | 1800 kB |
| Today additional JS | 100 kB |
| Speak additional JS | 650 kB |
| Review additional JS | 300 kB |
| Learn additional JS | 625 kB |
| Progress additional JS | 700 kB |

Heavy content ships as per-language lazy chunks and must never enter the boot
graph. Boot prefetching is signal-based (`src/lib/prefetch.js`): connection
quality and the active language decide what warms up.

## Exams

`src/lib/exams/` holds board specs (`boards.js`), task banks (`tasks.js`), the
timed simulator (`simulator.js`) and grade handling (`boundaries.js`).

Every task carries `provenance: 'generated'` and `official: false`, plus a spec
version and a `verifyAt` note pointing at the board's own page. Marking leads
with time shortfall. `gradeEstimate` **refuses** to invent a grade: without
learner-entered boundaries it returns no grade and explains why.

## Validation

Validation tracks (placement, progression, corpus, comprehension, pronunciation,
examiner agreement, real exam results, assistance, FSRS) report **only real,
dated human marks**. Empty tracks read "no-data" — nothing is invented, and no
seed data is ever generated. Every proportion carries a 95% Wilson interval
(`src/lib/evidenceUncertainty.js`). Live status: `npm run validation:status`.

## CI

- **Per-push** (`.github/workflows/french-practice.yml`): secret guard, public
  URL/header sync, content lint, eslint, unit tests, type-check, build, size
  budget, and Playwright E2E on Chromium + mobile Chromium.
- **Daily cross-browser** (`.github/workflows/cross-browser.yml`): Firefox +
  WebKit over the engine-specific paths (MediaRecorder, mic permissions,
  service worker/PWA, offline, Today, language switching).

## E2E: the port-5173 trap (read this before trusting an E2E run)

`playwright.config.js` sets `reuseExistingServer: !process.env.CI`. Locally that
means **if anything is already listening on port 5173, Playwright will happily
run the entire suite against it** — without building or starting Le Studio.

This actually happened: an unrelated Vite app ("Arise — Training, levelled up.")
was occupying 5173, and a full run reported 13 failures that looked exactly like
"pre-existing selector drift". They were not. The tests were never touching Le
Studio, and `git stash` comparisons could not reveal it because the same wrong
server answered in both cases.

Diagnose it in one line before believing any local E2E result:

```bash
curl -s http://127.0.0.1:5173/ | grep -o '<title>[^<]*</title>'
```

Anything other than Le Studio's title means you are testing someone else's app.
Free the port, then re-run. The suite passes cleanly: **0 failed** on Chromium
(recent runs: 51–52 passing; the exact count moves with the suite, so read the
runner's summary rather than this number).

The stashed-baseline comparison is still worth doing for genuine regressions —
but only once you have confirmed the run was actually against Le Studio.
