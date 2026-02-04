/**
 * Varie Avatar SDK Type Definitions
 */

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Public model availability status
 */
export type PublicModelStatus = 'full_ready' | 'base_ready' | 'failed' | null;

/**
 * Public model download information
 */
export interface PublicModel {
  /** Model availability status */
  status: PublicModelStatus;
  /** Base model URL (~3-5 MB, faster load) */
  baseUrl?: string;
  /** Full model URL (~6-10 MB, more detail) */
  fullUrl?: string;
}

/**
 * Character information from public API
 */
export interface Character {
  /** Unique character identifier */
  id: string;
  /** Character display name */
  name: string;
  /** Short character description */
  tagline: string;
  /** Array of character-voice quotes */
  quotes: string[];
  /** Character genre (fantasy, sci-fi, etc.) */
  genre: string;
  /** Character pronouns (he/him, she/her, etc.) */
  pronouns: string;
  /** Array of personality traits */
  personalityTags: string[];
  /** Character avatar/thumbnail image URL */
  avatarUrl: string;
  /** Character backstory */
  story: string;
  /** Model download information */
  publicModel: PublicModel;
}

/**
 * Pagination information
 */
export interface Pagination {
  /** Number of results returned */
  limit: number;
  /** Whether more results are available */
  hasMore: boolean;
  /** Cursor for next page (pass to next request) */
  nextCursor?: string;
}

/**
 * Response from discover endpoint
 */
export interface DiscoverResponse {
  /** Array of characters */
  characters: Character[];
  /** Pagination information */
  pagination: Pagination;
}

// ============================================================================
// SDK Options
// ============================================================================

/**
 * SDK initialization options
 */
export interface SDKOptions {
  /** API base URL (default: https://varie.ai/api) */
  baseUrl?: string;
  /** Enable IndexedDB caching (default: true) */
  cacheEnabled?: boolean;
  /** Max API requests per second (default: 5) */
  rateLimitPerSecond?: number;
  /** Cache TTL for character list in ms (default: 1 hour) */
  discoverCacheTTL?: number;
  /** Cache TTL for individual characters in ms (default: 1 week) */
  characterCacheTTL?: number;
}

/**
 * Options for discover() method
 */
export interface DiscoverOptions {
  /** Max results (1-50, default: 20) */
  limit?: number;
  /** Pagination cursor from previous response */
  cursor?: string;
  /** Filter by genre */
  genre?: string;
  /** Filter by origin language */
  language?: string;
  /** Skip cache and fetch fresh data */
  skipCache?: boolean;
}

/**
 * Model type to download
 */
export type ModelType = 'full' | 'base';

/**
 * Options for downloadModel() method
 */
export interface DownloadModelOptions {
  /** Model type: 'full' (default) or 'base' */
  type?: ModelType;
  /** Use cached model if available (default: true) */
  cache?: boolean;
  /** Progress callback */
  onProgress?: (progress: DownloadProgress) => void;
}

/**
 * Download progress information
 */
export interface DownloadProgress {
  /** Bytes downloaded so far */
  loaded: number;
  /** Total bytes (may be 0 if unknown) */
  total: number;
  /** Progress percentage (0-100, or -1 if unknown) */
  percent: number;
}

// ============================================================================
// Unpacked Model
// ============================================================================

/**
 * Unpacked model files ready for Spine runtime
 */
export interface UnpackedModel {
  /** Character ID this model belongs to */
  characterId: string;
  /** Model type (full or base) */
  type: ModelType;
  /** Unpacked files */
  files: ModelFiles;
  /** Size in bytes */
  size: number;
  /** Timestamp when cached */
  cachedAt?: number;
}

/**
 * Individual files extracted from .varie bundle
 */
export interface ModelFiles {
  /** Skeleton JSON data (parsed) */
  skeleton: unknown;
  /** Atlas text content */
  atlas: string;
  /** Texture image as Blob */
  texture: Blob;
  /** Raw file map (filename -> ArrayBuffer) for advanced use */
  raw: Map<string, ArrayBuffer>;
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cached character list entry
 */
export interface CachedDiscoverEntry {
  /** Cache key (includes query params) */
  key: string;
  /** Response data */
  data: DiscoverResponse;
  /** Timestamp when cached */
  cachedAt: number;
  /** TTL in milliseconds */
  ttl: number;
}

/**
 * Cached character entry
 */
export interface CachedCharacterEntry {
  /** Character ID */
  id: string;
  /** Character data */
  data: Character;
  /** Timestamp when cached */
  cachedAt: number;
  /** TTL in milliseconds */
  ttl: number;
}

/**
 * Cached model entry (stored in IndexedDB)
 */
export interface CachedModelEntry {
  /** Cache key: `{characterId}:{type}` */
  key: string;
  /** Character ID */
  characterId: string;
  /** Model type */
  type: ModelType;
  /** Unpacked model data */
  model: UnpackedModel;
  /** Timestamp when cached */
  cachedAt: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * SDK error codes
 */
export enum SDKErrorCode {
  /** Network request failed */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** API returned an error response */
  API_ERROR = 'API_ERROR',
  /** Character not found */
  NOT_FOUND = 'NOT_FOUND',
  /** Model not available for this character */
  MODEL_NOT_AVAILABLE = 'MODEL_NOT_AVAILABLE',
  /** Invalid bundle format */
  INVALID_BUNDLE = 'INVALID_BUNDLE',
  /** Cache operation failed */
  CACHE_ERROR = 'CACHE_ERROR',
  /** Rate limit exceeded (client-side) */
  RATE_LIMITED = 'RATE_LIMITED',
}

/**
 * SDK error with additional context
 */
export class SDKError extends Error {
  constructor(
    public readonly code: SDKErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'SDKError';
  }
}
