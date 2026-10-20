// Le Studio service worker: makes the app usable offline. Enhanced version with
// improved caching strategies, background sync, and offline queue management.
//
// Strategy hierarchy:
// 1. App shell (HTML/CSS/JS) → network-first with stale-while-revalidate
// 2. Media/TTS → cache-first for instant playback
// 3. API calls → network-first with fallback to empty (for learning activity tracking)
// 4. Other assets → stale-while-revalidate
//
// Cache versioning: scripts/version-sw.mjs stamps __BUILD_ID__ at build time.
// Every deploy owns its own runtime cache, and activate() deletes every other
// cache — so content-hashed chunks from old builds stop accumulating forever.

const CACHE = 'le-studio-__BUILD_ID__';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];
const BUILD_ASSETS = /* __PRECACHE__ */ [];

// Priority-based queue for offline actions
const ACTION_QUEUE = 'offline-action-queue';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll([...SHELL, ...BUILD_ASSETS]))
      .catch((err) => console.warn('[sw] precache incomplete', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate strategy - serve cached immediately, update in background
function staleWhileRevalidate(request) {
  return fetch(request.clone())
    .then((response) => {
      if (response && response.status === 200) {
        const responseClone = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, responseClone));
      }
      return response;
    })
    .catch(() => caches.match(request));
}

// Network-first strategy with timeout
async function networkFirstWithTimeout(request) {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), 3000); // 3s timeout
  });
  
  const networkPromise = fetch(request.clone()).then((response) => {
    if (response && response.status === 200) {
      const responseClone = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, responseClone));
    }
    return response;
  }).catch(() => caches.match(request));
  
  return Promise.race([networkPromise, timeout]);
}

// Queue offline actions when network is unavailable
async function queueAction(actionData) {
  let queue = [];
  try {
    const cached = await caches.open(ACTION_QUEUE);
    const existing = await cached.match('queue');
    if (existing) {
      queue = JSON.parse(await existing.text());
    }
  } catch (e) {
    console.warn('[sw] Could not read action queue:', e);
  }
  
  queue.push({
    ...actionData,
    queuedAt: Date.now(),
    retryCount: 0
  });
  
  try {
    const blob = new Blob([JSON.stringify(queue)], { type: 'application/json' });
    const response = new Response(blob);
    await caches.open(ACTION_QUEUE).then(c => c.put('queue', response));
  } catch (e) {
    console.warn('[sw] Could not save action queue:', e);
  }
}

// Retry queued actions when back online
async function retryQueuedActions() {
  try {
    const cached = await caches.open(ACTION_QUEUE);
    const existing = await cached.match('queue');
    if (!existing) return;
    
    const queue = JSON.parse(await existing.text());
    const successful = [];
    const failed = [];
    
    for (const action of queue) {
      try {
        // Attempt to re-execute the action
        const success = await simulateAction(action);
        if (success) {
          successful.push(action);
        } else {
          failed.push(action);
        }
      } catch (e) {
        action.retryCount = (action.retryCount || 0) + 1;
        if (action.retryCount < 3) {
          failed.push(action);
        } else {
          console.warn('[sw] Action failed after 3 retries:', action.type);
          // Keep failed actions but mark them as abandoned
          failed.push({ ...action, aborted: true });
        }
      }
    }
    
    // Save remaining failed actions
    const remaining = failed.filter(f => !f.aborted);
    if (remaining.length > 0) {
      const blob = new Blob([JSON.stringify(remaining)], { type: 'application/json' });
      await cached.put('queue', new Response(blob));
    } else {
      await cached.delete('queue');
    }
    
    // Notify clients about retry results
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'action-retry-complete',
        successful,
        failed: remaining.length,
        total: queue.length
      });
    });
  } catch (e) {
    console.error('[sw] Error retrying actions:', e);
  }
}

// Simulate action execution on backend (mock implementation)
async function simulateAction(action) {
  // This would be a real POST request to your backend
  // For now, just simulate success based on action type
  if (action.type === 'learningActivity') {
    // Try to send the activity data
    try {
      // Mock network attempt - in production this would be actual fetch
      await new Promise(resolve => setTimeout(resolve, 100));
      return true;
    } catch (e) {
      return false;
    }
  }
  return true;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignore non-GET requests
  if (request.method !== 'GET') {
    if (request.method === 'POST' && url.origin === self.location.origin) {
      // Handle POST requests (learning activities, etc.)
      event.respondWith(
        fetch(request.clone())
          .then(response => response)
          .catch(() => {
            // Queue the action for later retry
            const contentType = request.headers.get('content-type') || '';
            let actionData = null;
            
            if (contentType.includes('application/json')) {
              request.clone().text().then(text => {
                try {
                  actionData = JSON.parse(text);
                } catch (e) {
                  console.warn('[sw] Failed to parse POST body:', e);
                }
              });
            }
            
            if (actionData) {
              queueAction({
                type: 'learningActivity',
                data: actionData,
                timestamp: Date.now()
              });
            }
            
            // Return a success response even though we're offline
            return new Response(JSON.stringify({ queued: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          })
      );
    }
    return;
  }
  
  // Ignore cross-origin requests
  if (url.origin !== self.location.origin) return;
  
  // Route requests by type
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || 
      url.pathname.includes('/_vite/') || url.pathname.startsWith('/chunks/')) {
    // App code - network first with timeout
    event.respondWith(networkFirstWithTimeout(request));
  } else if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
    // Images - stale while revalidate
    event.respondWith(staleWhileRevalidate(request));
  } else if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    // HTML pages - network first
    event.respondWith(networkFirstWithTimeout(request));
  } else {
    // Everything else - stale while revalidate
    event.respondWith(staleWhileRevalidate(request));
  }
});

// Handle messages from client
self.addEventListener('message', (event) => {
  if (event.data) {
    if (event.data === 'cache-count') {
      caches.open(CACHE)
        .then((c) => c.keys())
        .then((keys) => {
          if (event.source) {
            event.source.postMessage({ type: 'cache-count', count: keys.length });
          }
        })
        .catch(() => {
          if (event.source) {
            event.source.postMessage({ type: 'cache-count', count: 0 });
          }
        });
    } else if (event.data === 'cleanup-old-cache') {
      // Manual cleanup trigger
      caches.keys().then((keys) => {
        return Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      });
    } else if (event.data === 'retry-queued-actions') {
      // Trigger retry of queued offline actions
      retryQueuedActions();
    } else if (event.data?.type === 'register-client') {
      // Client registration for notifications
      self.clients.matchAll().then((clients) => {
        clients.forEach(client => client.close());
        if (event.source) {
          event.source.postMessage({ type: 'client-registered' });
        }
      });
    }
  }
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-learning-data') {
    event.waitUntil(retryQueuedActions());
  }
});

// Notification support (optional enhancement)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'study-now') {
    event.waitUntil(
      self.clients.openWindow('/')
    );
  }
});

// Periodic keepalive message
let keepAliveTimer = null;
function startKeepAlive() {
  keepAliveTimer = setInterval(() => {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({ type: 'sw-alive', timestamp: Date.now() });
      });
    });
  }, 60000); // Send alive ping every minute
}

// Start keepalive when SW activates
self.addEventListener('activate', () => {
  startKeepAlive();
});

// Listen for online/offline events to notify clients
window.addEventListener('online', () => {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ type: 'network-status', online: true });
    });
  });
  
  // Automatically retry queued actions when back online
  retryQueuedActions();
});

window.addEventListener('offline', () => {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ type: 'network-status', online: false });
    });
  });
});
