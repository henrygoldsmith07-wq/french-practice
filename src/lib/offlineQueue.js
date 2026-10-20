// Offline queue utilities for managing actions when network is unavailable
// Queued actions are stored in IndexedDB for persistence across sessions

const DB_NAME = 'offline-queue-db';
const STORE_NAME = 'actions';
let dbInstance = null;

export function getDb() {
  if (dbInstance) return Promise.resolve(dbInstance);
  
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn('[offline] IndexedDB not supported');
      resolve(null);
      return;
    }
    
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onerror = () => {
      console.error('[offline] Failed to open database:', request.error);
      resolve(null);
    };
    
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

// Add action to queue
export async function addToQueue(actionData) {
  const db = await getDb();
  if (!db) return false;
  
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const action = {
      ...actionData,
      addedAt: Date.now(),
      retryCount: 0,
    };
    
    const request = store.add(action);
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

// Get all queued actions
export async function getQueuedActions() {
  const db = await getDb();
  if (!db) return [];
  
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

// Remove action from queue
export async function removeFromQueue(id) {
  const db = await getDb();
  if (!db) return false;
  
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

// Clear entire queue
export async function clearQueue() {
  const db = await getDb();
  if (!db) return false;
  
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

// Get queue count
export async function getQueuedActionCount() {
  const db = await getDb();
  if (!db) return 0;
  
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.count();
    
    request.onsuccess = () => resolve(request.result || 0);
    request.onerror = () => resolve(0);
  });
}

// Try to process queued actions
export async function processQueuedActions() {
  const actions = await getQueuedActions();
  const results = { successful: [], failed: [] };
  
  for (const action of actions) {
    try {
      // Simulate action processing - in production, this would POST to backend
      const success = await simulateActionExecution(action);
      
      if (success) {
        await removeFromQueue(action.id);
        results.successful.push(action);
      } else {
        action.retryCount = (action.retryCount || 0) + 1;
        if (action.retryCount >= 3) {
          // Mark as permanently failed
          results.failed.push({ ...action, aborted: true });
          await removeFromQueue(action.id);
        } else {
          // Keep in queue for retry
          results.failed.push(action);
        }
      }
    } catch (error) {
      action.retryCount = (action.retryCount || 0) + 1;
      if (action.retryCount >= 3) {
        results.failed.push({ ...action, error: error.message, aborted: true });
        await removeFromQueue(action.id);
      } else {
        results.failed.push(action);
      }
    }
  }
  
  return results;
}

// Mock action execution
async function simulateActionExecution(action) {
  // In production, this would be an actual API call
  // For now, simulate some delay and random success/failure
  return new Promise((resolve) => {
    setTimeout(() => {
      // 80% success rate for simulation
      resolve(Math.random() > 0.2);
    }, 100);
  });
}
