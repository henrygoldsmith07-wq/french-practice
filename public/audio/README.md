# Real native audio — drop-in folder

The "Authentic audio" listening tracks play real recorded MP3s from this
folder. The app works without them (it falls back to TTS with a notice),
but recorded native speech is far better ear training.

## Pack workflow (preferred)

Build a licensed pack with the CLI, then import it in-app (Dev Panel →
Audio pack) — every asset must carry license + consent basis + source URL
or it is refused:

```
node scripts/audio-pack.mjs resolve --archive <archive.org-item-id> --out draft.json
# fill in region/register tags, confirm license…
node scripts/audio-pack.mjs validate --file draft.json
node scripts/audio-pack.mjs status        # see the S1–S7 ladder coverage
```

Progression: S1 slow TTS → S2 normal TTS → S3 clear native → S4 natural →
S5 accent variation → S6 spontaneous → S7 noise/interruptions. A stage
unlocks after 5 attempts at ≥80% (`fp.listeningProgression.v1`).

## Manual drop-in (still supported)

| File | Content |
|---|---|
| `corbeau.mp3` | La Fontaine — *Le Corbeau et le Renard* (~1 min) |
| `cigale.mp3` | La Fontaine — *La Cigale et la Fourmi* (~1 min) |

LibriVox recordings of La Fontaine's *Fables* are public domain:
<https://librivox.org> (search "Fables de La Fontaine"). Download the chapter
MP3s for *Le Corbeau et le Renard* (Book I, fable 2) and *La Cigale et la
Fourmi* (Book I, fable 1), rename, drop here, redeploy.

Any other public-domain French audio can be added the same way: add a track
with an `audioSrc` in `src/lib/listening.js` pointing at a file here.

> Note: these files are not committed because the build environment used to
> assemble the app has no network access to librivox.org/archive.org. The
> player detects a missing file and falls back to TTS, so shipping without
> them is safe.
