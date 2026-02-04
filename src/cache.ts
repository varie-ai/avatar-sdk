/**
 * Caching Layer
 *
 * Provides IndexedDB caching for browser environments with
 * in-memory fallback for Node.js or when IndexedDB is unavailable.
 *
 * Stores:
 * - Character discover responses (short TTL)
 * - Individual character details (medium TTL)
 * - Downloaded model bundles (long TTL, largest storage)
 */

import {
  SDKError,
  SDKErrorCode,
  type CachedDiscoverEntry,
  type CachedCharacterEntry,
  type CachedModelEntry,
  type DiscoverResponse,
  type Character,
  type UnpackedModel,
  type ModelType,
} from './types';

const DB_NAME = 'varie-avatar-sdk';
const DB_VERSION = 1;

// Store names
const STORE_DISCOVER = 'discover';
const STORE_CHARACTERS = 'characters';
const STORE_MODELS = 'models';

/**
 * Check if IndexedDB is available
 */
function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Cache manager interface
 */
export interface CacheManager {
  // Discover cache
  getDiscover(key: string): Promise<DiscoverResponse | null>;
  setDiscover(key: string, data: DiscoverResponse, ttl: number): Promise<void>;

  // Character cache
  getCharacter(id: string): Promise<Character | null>;
  setCharacter(id: string, data: Character, ttl: number): Promise<void>;

  // Model cache
  getModel(characterId: string, type: ModelType): Promise<UnpackedModel | null>;
  setModel(characterId: string, type: ModelType, model: UnpackedModel): Promise<void>;

  // Maintenance
  clear(): Promise<void>;
  getStats(): Promise<CacheStats>;
}

export interface CacheStats {
  discoverEntries: number;
  characterEntries: number;
  modelEntries: number;
  totalSizeBytes: number;
}

// ============================================================================
// IndexedDB Cache Implementation
// ============================================================================

class IndexedDBCache implements CacheManager {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new SDKError(SDKErrorCode.CACHE_ERROR, 'Failed to open IndexedDB', request.error));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create stores if they don't exist
        if (!db.objectStoreNames.contains(STORE_DISCOVER)) {
          db.createObjectStore(STORE_DISCOVER, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_CHARACTERS)) {
          db.createObjectStore(STORE_CHARACTERS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_MODELS)) {
          db.createObjectStore(STORE_MODELS, { keyPath: 'key' });
        }
      };
    });

    return this.dbPromise;
  }

  private isExpired(cachedAt: number, ttl: number): boolean {
    return Date.now() - cachedAt > ttl;
  }

  // Discover cache
  async getDiscover(key: string): Promise<DiscoverResponse | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DISCOVER, 'readonly');
      const store = tx.objectStore(STORE_DISCOVER);
      const request = store.get(key);

      request.onerror = () => reject(new SDKError(SDKErrorCode.CACHE_ERROR, 'Cache read failed'));
      request.onsuccess = () => {
        const entry = request.result as CachedDiscoverEntry | undefined;
        if (!entry || this.isExpired(entry.cachedAt, entry.ttl)) {
          resolve(null);
        } else {
          resolve(entry.data);
        }
      };
    });
  }

  async setDiscover(key: string, data: DiscoverResponse, ttl: number): Promise<void> {
    const db = await this.getDB();
    const entry: CachedDiscoverEntry = {
      key,
      data,
      cachedAt: Date.now(),
      ttl,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DISCOVER, 'readwrite');
      const store = tx.objectStore(STORE_DISCOVER);
      const request = store.put(entry);

      request.onerror = () => reject(new SDKError(SDKErrorCode.CACHE_ERROR, 'Cache write failed'));
      request.onsuccess = () => resolve();
    });
  }

  // Character cache
  async getCharacter(id: string): Promise<Character | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CHARACTERS, 'readonly');
      const store = tx.objectStore(STORE_CHARACTERS);
      const request = store.get(id);

      request.onerror = () => reject(new SDKError(SDKErrorCode.CACHE_ERROR, 'Cache read failed'));
      request.onsuccess = () => {
        const entry = request.result as CachedCharacterEntry | undefined;
        if (!entry || this.isExpired(entry.cachedAt, entry.ttl)) {
          resolve(null);
        } else {
          resolve(entry.data);
        }
      };
    });
  }

  async setCharacter(id: string, data: Character, ttl: number): Promise<void> {
    const db = await this.getDB();
    const entry: CachedCharacterEntry = {
      id,
      data,
      cachedAt: Date.now(),
      ttl,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CHARACTERS, 'readwrite');
      const store = tx.objectStore(STORE_CHARACTERS);
      const request = store.put(entry);

      request.onerror = () => reject(new SDKError(SDKErrorCode.CACHE_ERROR, 'Cache write failed'));
      request.onsuccess = () => resolve();
    });
  }

  // Model cache
  async getModel(characterId: string, type: ModelType): Promise<UnpackedModel | null> {
    const db = await this.getDB();
    const key = `${characterId}:${type}`;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MODELS, 'readonly');
      const store = tx.objectStore(STORE_MODELS);
      const request = store.get(key);

      request.onerror = () => reject(new SDKError(SDKErrorCode.CACHE_ERROR, 'Cache read failed'));
      request.onsuccess = () => {
        const entry = request.result as CachedModelEntry | undefined;
        // Models don't expire (they're immutable), but check if entry exists
        if (!entry) {
          resolve(null);
        } else {
          resolve(entry.model);
        }
      };
    });
  }

  async setModel(characterId: string, type: ModelType, model: UnpackedModel): Promise<void> {
    const db = await this.getDB();
    const key = `${characterId}:${type}`;
    const entry: CachedModelEntry = {
      key,
      characterId,
      type,
      model,
      cachedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MODELS, 'readwrite');
      const store = tx.objectStore(STORE_MODELS);
      const request = store.put(entry);

      request.onerror = () => reject(new SDKError(SDKErrorCode.CACHE_ERROR, 'Cache write failed'));
      request.onsuccess = () => resolve();
    });
  }

  // Maintenance
  async clear(): Promise<void> {
    const db = await this.getDB();

    const stores = [STORE_DISCOVER, STORE_CHARACTERS, STORE_MODELS];
    const promises = stores.map(
      (storeName) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          const request = store.clear();

          request.onerror = () => reject(new SDKError(SDKErrorCode.CACHE_ERROR, 'Cache clear failed'));
          request.onsuccess = () => resolve();
        })
    );

    await Promise.all(promises);
  }

  async getStats(): Promise<CacheStats> {
    const db = await this.getDB();

    const countStore = (storeName: string): Promise<number> =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.count();

        request.onerror = () => reject(new SDKError(SDKErrorCode.CACHE_ERROR, 'Cache count failed'));
        request.onsuccess = () => resolve(request.result);
      });

    const [discoverEntries, characterEntries, modelEntries] = await Promise.all([
      countStore(STORE_DISCOVER),
      countStore(STORE_CHARACTERS),
      countStore(STORE_MODELS),
    ]);

    // Estimate size (rough approximation)
    // TODO: More accurate size calculation
    const totalSizeBytes = modelEntries * 5 * 1024 * 1024; // ~5MB per model

    return {
      discoverEntries,
      characterEntries,
      modelEntries,
      totalSizeBytes,
    };
  }
}

// ============================================================================
// In-Memory Cache Implementation (fallback)
// ============================================================================

class InMemoryCache implements CacheManager {
  private discover = new Map<string, CachedDiscoverEntry>();
  private characters = new Map<string, CachedCharacterEntry>();
  private models = new Map<string, CachedModelEntry>();

  private isExpired(cachedAt: number, ttl: number): boolean {
    return Date.now() - cachedAt > ttl;
  }

  async getDiscover(key: string): Promise<DiscoverResponse | null> {
    const entry = this.discover.get(key);
    if (!entry || this.isExpired(entry.cachedAt, entry.ttl)) {
      this.discover.delete(key);
      return null;
    }
    return entry.data;
  }

  async setDiscover(key: string, data: DiscoverResponse, ttl: number): Promise<void> {
    this.discover.set(key, { key, data, cachedAt: Date.now(), ttl });
  }

  async getCharacter(id: string): Promise<Character | null> {
    const entry = this.characters.get(id);
    if (!entry || this.isExpired(entry.cachedAt, entry.ttl)) {
      this.characters.delete(id);
      return null;
    }
    return entry.data;
  }

  async setCharacter(id: string, data: Character, ttl: number): Promise<void> {
    this.characters.set(id, { id, data, cachedAt: Date.now(), ttl });
  }

  async getModel(characterId: string, type: ModelType): Promise<UnpackedModel | null> {
    const key = `${characterId}:${type}`;
    const entry = this.models.get(key);
    return entry?.model ?? null;
  }

  async setModel(characterId: string, type: ModelType, model: UnpackedModel): Promise<void> {
    const key = `${characterId}:${type}`;
    this.models.set(key, { key, characterId, type, model, cachedAt: Date.now() });
  }

  async clear(): Promise<void> {
    this.discover.clear();
    this.characters.clear();
    this.models.clear();
  }

  async getStats(): Promise<CacheStats> {
    let totalSizeBytes = 0;
    for (const entry of this.models.values()) {
      totalSizeBytes += entry.model.size;
    }

    return {
      discoverEntries: this.discover.size,
      characterEntries: this.characters.size,
      modelEntries: this.models.size,
      totalSizeBytes,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create appropriate cache manager based on environment
 */
export function createCacheManager(): CacheManager {
  if (isIndexedDBAvailable()) {
    return new IndexedDBCache();
  }
  return new InMemoryCache();
}

/**
 * Create in-memory cache (for testing or explicit use)
 */
export function createInMemoryCache(): CacheManager {
  return new InMemoryCache();
}
