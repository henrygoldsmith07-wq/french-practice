// Listening-library loader: the track library (mini-podcasts, dialogues, news,
// scenes, authentic audio) is a lazy chunk that must not ride the entry graph.
// The Today session resolves tracks dynamically; the player resolves the live
// track from the same module-level cache.
//
// Only a RESOLVED library is cached — a failed import is never remembered, so
// a transient network error can be retried (retry/next open re-attempts).
import { useEffect, useState } from 'react';

let _tracks = null;

export function loadListeningTracks() {
  if (_tracks) return Promise.resolve(_tracks);
  return import('./listening').then((m) => {
    _tracks = m.allListeningTracks();
    return _tracks;
  });
}

export function listeningTracksLoaded() { return Boolean(_tracks); }

/** Test/diagnostic reset: forget the cached library (failed loads were never cached). */
export function resetListeningTracks() { _tracks = null; }

/** React binding: the cached library, or null while the chunk loads. */
export function useListeningTracks() {
  const [tracks, setTracks] = useState(_tracks);
  useEffect(() => {
    if (tracks) return undefined;
    let on = true;
    loadListeningTracks()
      .then((t) => { if (on) setTracks(t); })
      .catch(() => { /* stays null; consumers fall through to the next segment */ });
    return () => { on = false; };
  }, [tracks]);
  return tracks;
}
