// useOfflineStatus - tracks online/offline state and notifies when queued actions exist
import { useEffect, useState, useRef, useCallback } from 'react';
import { getQueuedActionCount } from '../lib/offlineQueue.js';

export default function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasQueuedActions, setHasQueuedActions] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const lastKnownState = useRef(isOnline);
  
  // Listen for network status changes via service worker
  useEffect(() => {
    if (!navigator.serviceWorker) return;
    
    const handler = (event) => {
      if (event.data?.type === 'network-status') {
        const newState = event.data.online;
        setIsOnline(newState);
        
        // When coming back online, check for queued actions
        if (newState && lastKnownState.current === false) {
          checkQueuedActions();
        }
      }
    };
    
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);
  
  // Periodically check for queued actions
  useEffect(() => {
    const checkInterval = setInterval(checkQueuedActions, 5000); // Every 5 seconds
    return () => clearInterval(checkInterval);
  }, []);
  
  const checkQueuedActions = useCallback(async () => {
    try {
      const count = await getQueuedActionCount();
      setQueuedCount(count);
      setHasQueuedActions(count > 0);
    } catch (e) {
      console.warn('[offline] Could not check queue:', e);
    }
  }, []);
  
  // Register this client for push notifications
  const registerClient = useCallback(async () => {
    if (!navigator.serviceWorker?.controller) return;
    
    navigator.serviceWorker.controller.postMessage({ type: 'register-client' });
  }, []);
  
  // Manually trigger retry of queued actions
  const retryQueuedActions = useCallback(async () => {
    if (!navigator.serviceWorker?.controller) return;
    
    navigator.serviceWorker.controller.postMessage({ type: 'retry-queued-actions' });
  }, []);
  
  // Get cached data count
  const getCachedCount = useCallback(async () => {
    if (!navigator.serviceWorker?.controller) return 0;
    
    return new Promise((resolve) => {
      const handler = (event) => {
        if (event.data?.type === 'cache-count') {
          resolve(event.data.count || 0);
        }
      };
      
      navigator.serviceWorker.addEventListener('message', handler, { once: true });
      navigator.serviceWorker.controller.postMessage('cache-count');
      
      // Timeout after 2 seconds
      setTimeout(() => {
        navigator.serviceWorker.removeEventListener('message', handler);
        resolve(0);
      }, 2000);
    });
  }, []);
  
  return {
    isOnline,
    hasQueuedActions,
    queuedCount,
    getCachedCount,
    retryQueuedActions,
    registerClient,
    onConnect: () => lastKnownState.current === false,
    onDisconnect: () => lastKnownState.current === true,
  };
}
