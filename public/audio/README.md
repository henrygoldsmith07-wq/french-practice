# Verified authentic audio workflow

The app does **not** treat an arbitrary file placed in this folder as authentic
native-speech evidence. An authentic recording must carry provenance metadata
(source, licence/consent basis) and pass `authenticAudio.validateAsset`.

## Pack workflow (preferred)

Build a licensed pack with the CLI, then import it in-app (Dev Panel →
Audio pack) — every asset must carry license + consent basis + source URL
or it is refused:

```
node scripts/audio-pack.mjs resolve --archive <archive.org-item-id> --out draft.json
# fill in region/register tags, confirm license…
node scripts/audio-pack.mjs validate --file draft.json
node scripts/audio-pack.mjs status        # see the S1–S8 ladder coverage
```

Progression: S1 slow supported speech → S2 normal clear speech → S3 natural
native → S4 speaker variation → S5 accent variation → S6 spontaneous → S7
noise/interruptions → S8 explicitly tagged realistic conversation. A stage
unlocks after 5 attempts at ≥80% (`fp.listeningProgression.v1`).

## Local files

Local audio files can be used by a validated pack, but the filename itself is
never provenance. Put the file in the deployment, then reference that path from
a pack entry that also supplies its genuine `sourceUrl`, `license` and
`consentBasis`.

The repository currently ships no native-recording files in this directory.
The two La Fontaine texts remain useful TTS listening material, but are not
labelled or scored as authentic recording comprehension.
