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
      // null is reserved for "still loading". A failed load resolves this hook
      // to an empty array so consumers can distinguish failure/missing content
      // from a chunk that simply has not arrived yet. A remount retries because
      // the module cache itself remains null on failure.
      .catch(() => { if (on) setTracks([]); });
    return () => { on = false; };
  }, [tracks]);
  return tracks;
}


/**
 * Resolve one requested track without collapsing the loading state into
 * "missing". This keeps session fallbacks from skipping valid content while
 * the lazy listening chunk is still in flight.
 */
export function resolveListeningTrack(tracks, trackId) {
  if (tracks === null) return { status: 'loading', track: null };
  const track = Array.isArray(tracks) ? tracks.find((item) => item?.id === trackId) || null : null;
  return track ? { status: 'ready', track } : { status: 'missing', track: null };
}
