/**
 * Varie Avatar SDK Client
 *
 * Main SDK class for discovering, downloading, and loading Varie AI avatars.
 */

import {
  SDKError,
  SDKErrorCode,
  type SDKOptions,
  type DiscoverOptions,
  type DiscoverResponse,
  type Character,
  type DownloadModelOptions,
  type DownloadProgress,
  type UnpackedModel,
  type ModelType,
} from './types';
import { type CacheManager, createCacheManager, createInMemoryCache } from './cache';
import { RateLimiter } from './rate-limit';
import { unpackModel, isVarieBundle } from './unpack';

// Default configuration
const DEFAULT_BASE_URL = 'https://varie.ai/api';
const DEFAULT_DISCOVER_TTL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_CHARACTER_TTL = 60 * 60 * 1000; // 1 hour
const DEFAULT_RATE_LIMIT = 5; // requests per second

/**
 * Varie Avatar SDK
 *
 * @example
 * ```typescript
 * const sdk = new VarieAvatarSDK();
 *
 * // Discover characters
 * const { characters } = await sdk.discover({ genre: 'fantasy' });
 *
 * // Get specific character
 * const character = await sdk.getCharacter('soren_cb3333dd3e3f');
 *
 * // Download model
 * const model = await sdk.downloadModel(character.id, { type: 'full' });
 * ```
 */
export class VarieAvatarSDK {
  private readonly baseUrl: string;
  private readonly cache: CacheManager;
  private readonly cacheEnabled: boolean;
  private readonly rateLimiter: RateLimiter;
  private readonly discoverTTL: number;
  private readonly characterTTL: number;

  constructor(options: SDKOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.cacheEnabled = options.cacheEnabled ?? true;
    this.discoverTTL = options.discoverCacheTTL ?? DEFAULT_DISCOVER_TTL;
    this.characterTTL = options.characterCacheTTL ?? DEFAULT_CHARACTER_TTL;

    // Initialize cache
    if (this.cacheEnabled) {
      this.cache = createCacheManager();
    } else {
      this.cache = createInMemoryCache(); // Still use in-memory for session
    }

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter({
      requestsPerSecond: options.rateLimitPerSecond ?? DEFAULT_RATE_LIMIT,
    });
  }

  /**
   * Discover available characters
   *
   * @param options - Discovery options (limit, cursor, genre, language)
   * @returns List of characters with pagination info
   */
  async discover(options: DiscoverOptions = {}): Promise<DiscoverResponse> {
    const { limit = 20, cursor, genre, language, skipCache = false } = options;

    // Build cache key from query params
    const cacheKey = this.buildCacheKey('discover', { limit, cursor, genre, language });

    // Check cache first
    if (this.cacheEnabled && !skipCache) {
      const cached = await this.cache.getDiscover(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Build URL
    const url = new URL(`${this.baseUrl}/character-create/public/discover`);
    url.searchParams.set('limit', String(limit));
    if (cursor) url.searchParams.set('cursor', cursor);
    if (genre) url.searchParams.set('genre', genre);
    if (language) url.searchParams.set('language', language);

    // Make request with rate limiting
    await this.rateLimiter.acquire();
    const response = await this.fetch(url.toString());

    if (!response.ok) {
      throw new SDKError(
        SDKErrorCode.API_ERROR,
        `API error: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as DiscoverResponse;

    // Cache the response
    if (this.cacheEnabled) {
      await this.cache.setDiscover(cacheKey, data, this.discoverTTL);
    }

    return data;
  }

  /**
   * Get character details by ID
   *
   * @param id - Character ID
   * @param skipCache - Skip cache and fetch fresh data
   * @returns Character details
   */
  async getCharacter(id: string, skipCache = false): Promise<Character> {
    if (!id) {
      throw new SDKError(SDKErrorCode.NOT_FOUND, 'Character ID is required');
    }

    // Check cache first
    if (this.cacheEnabled && !skipCache) {
      const cached = await this.cache.getCharacter(id);
      if (cached) {
        return cached;
      }
    }

    // Make request
    const url = `${this.baseUrl}/character-create/public/characters/${encodeURIComponent(id)}`;

    await this.rateLimiter.acquire();
    const response = await this.fetch(url);

    if (response.status === 404) {
      const error = await response.json().catch(() => ({}));
      throw new SDKError(
        SDKErrorCode.NOT_FOUND,
        (error as { error?: string }).error || `Character not found: ${id}`
      );
    }

    if (!response.ok) {
      throw new SDKError(
        SDKErrorCode.API_ERROR,
        `API error: ${response.status} ${response.statusText}`
      );
    }

    const character = (await response.json()) as Character;

    // Cache the response
    if (this.cacheEnabled) {
      await this.cache.setCharacter(id, character, this.characterTTL);
    }

    return character;
  }

  /**
   * Download and unpack a character model
   *
   * @param characterId - Character ID to download model for
   * @param options - Download options (type, cache, onProgress)
   * @returns Unpacked model ready for Spine runtime
   */
  async downloadModel(
    characterId: string,
    options: DownloadModelOptions = {}
  ): Promise<UnpackedModel> {
    const { type = 'full', cache = true, onProgress } = options;

    // Check cache first
    if (cache && this.cacheEnabled) {
      const cached = await this.cache.getModel(characterId, type);
      if (cached) {
        return cached;
      }
    }

    // Get character details to find model URL
    const character = await this.getCharacter(characterId);

    // Determine model URL
    const modelUrl = this.getModelUrl(character, type);
    if (!modelUrl) {
      throw new SDKError(
        SDKErrorCode.MODEL_NOT_AVAILABLE,
        `Model type '${type}' not available for character '${characterId}'`
      );
    }

    // Download the bundle
    await this.rateLimiter.acquire();
    const bundleData = await this.downloadBundle(modelUrl, onProgress);

    // Verify it's a valid bundle
    if (!isVarieBundle(bundleData)) {
      throw new SDKError(
        SDKErrorCode.INVALID_BUNDLE,
        'Downloaded file is not a valid .varie bundle'
      );
    }

    // Unpack the model
    const model = unpackModel(bundleData, characterId, type);

    // Cache the unpacked model
    if (cache && this.cacheEnabled) {
      await this.cache.setModel(characterId, type, model);
    }

    return model;
  }

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Get rate limiter status
   */
  getRateLimitStatus() {
    return this.rateLimiter.getStatus();
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Build cache key from parameters
   */
  private buildCacheKey(prefix: string, params: Record<string, unknown>): string {
    const parts = [prefix];
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        parts.push(`${key}=${value}`);
      }
    }
    return parts.join(':');
  }

  /**
   * Get model URL from character based on type preference
   */
  private getModelUrl(character: Character, preferredType: ModelType): string | null {
    const { publicModel } = character;

    if (!publicModel) return null;

    if (preferredType === 'full') {
      // Prefer full, fall back to base
      return publicModel.fullUrl || publicModel.baseUrl || null;
    } else {
      // Prefer base, fall back to full
      return publicModel.baseUrl || publicModel.fullUrl || null;
    }
  }

  /**
   * Download bundle with progress reporting
   */
  private async downloadBundle(
    url: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<ArrayBuffer> {
    const response = await this.fetch(url);

    if (!response.ok) {
      throw new SDKError(
        SDKErrorCode.NETWORK_ERROR,
        `Failed to download model: ${response.status} ${response.statusText}`
      );
    }

    // If no progress callback or no content-length, just get arrayBuffer
    const contentLength = response.headers.get('content-length');
    if (!onProgress || !contentLength) {
      return response.arrayBuffer();
    }

    // Stream download with progress
    const total = parseInt(contentLength, 10);
    const reader = response.body?.getReader();

    if (!reader) {
      return response.arrayBuffer();
    }

    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      chunks.push(value);
      loaded += value.length;

      onProgress({
        loaded,
        total,
        percent: total > 0 ? Math.round((loaded / total) * 100) : -1,
      });
    }

    // Combine chunks
    const result = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer;
  }

  /**
   * Fetch wrapper for easier testing/mocking
   */
  private async fetch(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      throw new SDKError(
        SDKErrorCode.NETWORK_ERROR,
        `Network request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }
}
