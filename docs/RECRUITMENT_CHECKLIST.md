# Evidence Study — real-device recruitment checklist

Run this **before recruiting participants**. Headless Playwright (fake mic
device + mock AI) proves the study *wiring* — recording → transcription →
evaluation → evidence → storage → export → import → pool — but it does NOT
prove microphone capture, TTS audio, or model quality on real hardware.
Anything below that fails must be fixed and turned into a regression test
before recruitment.

## Devices

| # | Platform | Browser | Checks | Result |
|---|----------|---------|--------|--------|
| 1 | Windows 11 | Chrome | mic allow; record a speaking check item; playback of listening check via speakers; TTS French voice present | ☐ |
| 2 | Windows 11 | Edge | same as above | ☐ |
| 3 | Android | Chrome | mic permission dialog (allow AND deny paths); speaking item completes either way; offline transition | ☐ |
| 4 | iPhone (latest iOS Safari) | | mic; TTS; PWA install; reload mid-session restores active session; speaking denial → `unavailable`, never wrong | ☐ |
| 5 | macOS Safari (desktop) | | mic; TTS; offline transition | ☐ |

## Microphone behaviours

- [ ] Permission **denied** → speaking item ends `unavailable` with reason; check still finishes; no XP pressure.
- [ ] Permission **allowed** → recording starts, waveform shows, stop → transcript → objective result appears within ~10 s (mock: immediate; real AI: bounded by the 15 s timeout fallback).
- [ ] **Bluetooth headphones**: audio routes to BT; TTS audible; stop-tap reachable.
- [ ] Unplug headset **mid-recording** → item falls to `unavailable`/`unscored`; app stays usable.
- [ ] Backgrounding the tab (mobile) mid-session → return restores Today step or active session.

## TTS / audio

- [ ] Listening check: options unlock only after Play; `fr-FR` voice exists; no voice → item `unavailable`.
- [ ] Offline: TTS still works where the platform provides voices; failures don't crash the check.

## Network / AI

- [ ] Airplane mode mid-session → Today completes via capability fallback (authored drill/SRS/review).
- [ ] AI timeout during speaking → `unscored` with reason `evaluation-timeout`; never fabricated.
- [ ] Slow 3G: the 15 s evaluation fallback and 10 s mic-silent fallback fire; UI never wedges.

## Study lifecycle on-device

- [ ] Consent screen appears only in Analytics → Evidence study; Join creates the participant record; Not now creates nothing.
- [ ] Withdraw & delete removes study data; practice (XP, reviews, mistakes) untouched.
- [ ] Export study bundle downloads JSON; import on a second device pools without touching local stores.
- [ ] Household switch: each member's SRS, mistake graph, study state and outcomes are isolated.

## Regression rule

Every failure found here becomes a `tests/` or `e2e/` case where practical
(schema/consent/gating cases are already unit/E2E covered; hardware-only
paths get a checklist item + code comment).
