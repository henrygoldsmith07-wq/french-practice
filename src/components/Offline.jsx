// Offline - enhanced offline status display with retry controls
import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, RefreshCw, Download, Clock, WifiOff, Wifi } from './icons';
import useOfflineStatus from '../hooks/useOfflineStatus';

export default function Offline({ open, onClose }) {
  const {
    isOnline,
    hasQueuedActions,
    queuedCount,
    getCachedCount,
    retryQueuedActions,
    registerClient,
  } = useOfflineStatus();
  
  const [cachedItems, setCachedItems] = useState(0);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (open) {
      registerClient();
      loadCachedCount();
    }
  }, [open]);
  
  const loadCachedCount = async () => {
    setLoading(true);
    try {
      const count = await getCachedCount();
      setCachedItems(count);
    } catch (e) {
      console.warn('[offline] Could not get cache count:', e);
    } finally {
      setLoading(false);
    }
  };
  
  const handleRetryActions = async () => {
    await retryQueuedActions();
    // Reload after retry
    setTimeout(loadCachedCount, 500);
  };
  
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="Offline mode">
      <div className="mx-auto min-h-full max-w-lg px-4 py-4">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <h2 className="flex-1 text-lg font-bold text-ink">
            {isOnline ? 'Online Status' : 'Offline Mode'}
          </h2>
          <button onClick={onClose} aria-label="Close offline panel" className="grid h-9 w-9 place-items-center rounded-full text-ink2 hover:bg-surface2 hover:text-ink">
            <span className="sr-only">Close</span>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.5 4.5L4.5 13.5M4.5 4.5L13.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Network status card */}
        <div className={`rounded-xl border p-6 mb-4 ${isOnline ? 'bg-surface2 border-green200' : 'bg-yellow50 border-yellow200'}`}>
          <div className="flex items-start gap-4">
            <div className={`shrink-0 w-12 h-12 grid place-items-center rounded-xl ${isOnline ? 'bg-green100' : 'bg-yellow100'}`}>
              {isOnline ? (
                <Wifi size={24} className="text-green600" />
              ) : (
                <WifiOff size={24} className="text-yellow600" />
              )}
            </div>
            <div className="flex-1">
              <h3 className={`text-base font-semibold mb-1 ${isOnline ? 'text-green700' : 'text-yellow700'}`}>
                {isOnline ? 'You are online' : 'You are offline'}
              </h3>
              <p className="text-sm text-inherit/80">
                {isOnline 
                  ? 'Network connection restored. All features available.'
                  : 'Practice mode works offline. New progress will sync when back online.'}
              </p>
            </div>
          </div>
        </div>

        {/* Cached content card */}
        <div className="rounded-xl bg-surface2 border border-line p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Download className="text-ink" size={20} />
              <h3 className="font-semibold text-ink">Cached Content</h3>
            </div>
            {loading ? (
              <RefreshCw className="animate-spin text-ink3" size={16} />
            ) : (
              <span className="text-xs font-mono text-ink3">{cachedItems} items</span>
            )}
          </div>
          <p className="text-xs text-ink3">
            The app caches practice sessions, vocabulary cards, and learning materials for offline access.
          </p>
        </div>

        {/* Queued actions card */}
        {hasQueuedActions && (
          <div className="rounded-xl bg-yellow50 border border-yellow200 p-6 mb-4">
            <div className="flex items-start gap-4">
              <AlertCircle className="text-yellow600 shrink-0 mt-1" size={20} />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow800 mb-1">
                  {queuedCount} action{queuedCount > 1 ? 's' : ''} waiting to sync
                </h3>
                <p className="text-xs text-yellow700 mb-3">
                  Your progress has been saved locally and will automatically sync when you reconnect.
                </p>
                <button
                  onClick={handleRetryActions}
                  className="btn btn-secondary min-h-9 px-3 rounded-lg text-xs flex items-center gap-2"
                >
                  <RefreshCw size={14} />
                  Retry Sync Now
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Offline capabilities */}
        <div className="rounded-xl bg-surface border border-line p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="text-green500" size={20} />
            <h3 className="font-semibold text-ink">What works offline</h3>
          </div>
          <ul className="space-y-2 text-xs text-ink3">
            <li className="flex items-start gap-2">
              <span className="text-green500 mr-1">•</span>
              Review vocabulary flashcards from cached packs
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green500 mr-1">•</span>
              Practice pronunciation with existing sentences
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green500 mr-1">•</span>
              Access your learning notebook entries
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green500 mr-1">•</span>
              Complete memory game reviews
            </li>
          </ul>
          <div className="mt-4 pt-4 border-t border-line">
            <p className="text-[10px] text-ink3">
              Note: AI conversation requires network. New content downloads need internet.
            </p>
          </div>
        </div>

        {/* Auto-sync indicator */}
        {isOnline && queuedCount === 0 && (
          <div className="mt-4 rounded-xl bg-green50 border border-green200 p-4 text-center">
            <CheckCircle className="mx-auto text-green500 mb-2" size={16} />
            <p className="text-xs text-green700">Everything synced! You're up to date.</p>
          </div>
        )}

        {/* Manual refresh button */}
        {!isOnline && (
          <div className="mt-4 text-center">
            <button
              onClick={() => window.location.reload()}
              className="btn btn-secondary min-h-9 px-4 rounded-lg text-xs"
            >
              Refresh Page
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
