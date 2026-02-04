/**
 * @varie-ai/avatar-sdk
 *
 * SDK for integrating Varie AI avatars into your applications.
 *
 * @example
 * ```typescript
 * import { VarieAvatarSDK } from '@varie-ai/avatar-sdk';
 *
 * const sdk = new VarieAvatarSDK();
 * const characters = await sdk.discover({ genre: 'fantasy' });
 * const model = await sdk.downloadModel(characters[0].id);
 * ```
 *
 * @packageDocumentation
 */

// Main client
export { VarieAvatarSDK } from './client';

// Types
export {
  // API response types
  type Character,
  type PublicModel,
  type PublicModelStatus,
  type DiscoverResponse,
  type Pagination,

  // SDK options
  type SDKOptions,
  type DiscoverOptions,
  type DownloadModelOptions,
  type DownloadProgress,
  type ModelType,

  // Model types
  type UnpackedModel,
  type ModelFiles,

  // Cache types
  type CachedDiscoverEntry,
  type CachedCharacterEntry,
  type CachedModelEntry,

  // Error types
  SDKError,
  SDKErrorCode,
} from './types';

// Utilities (advanced use)
export { unpackBundle, unpackModel, extractModelFiles, isVarieBundle } from './unpack';
export { RateLimiter, type RateLimiterOptions } from './rate-limit';
export {
  type CacheManager,
  type CacheStats,
  createCacheManager,
  createInMemoryCache,
} from './cache';
