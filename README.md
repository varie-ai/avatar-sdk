# @varie-ai/avatar-sdk

SDK for integrating [Varie AI avatars](https://varie.ai/ai-avatars) into your applications.

## Features

- **Discover** - Browse available AI characters with filtering
- **Download** - Fetch and unpack Spine model bundles
- **Caching** - IndexedDB caching for models (browser) with in-memory fallback
- **Rate Limiting** - Client-side throttling to prevent API abuse
- **TypeScript** - Full type definitions included

## Installation

```bash
npm install @varie-ai/avatar-sdk
```

## Quick Start

```typescript
import { VarieAvatarSDK } from '@varie-ai/avatar-sdk';

const sdk = new VarieAvatarSDK();

// Discover available characters
const { characters } = await sdk.discover({
  genre: 'fantasy',
  limit: 10
});

console.log(characters.map(c => c.name));
// ['Soren', 'Luna', 'Kai', ...]

// Get specific character details
const character = await sdk.getCharacter('soren_cb3333dd3e3f');
console.log(character.tagline);
// "A mysterious wanderer with ancient secrets"

// Download and unpack the Spine model
const model = await sdk.downloadModel(character.id, {
  type: 'full',  // 'full' or 'base'
  cache: true,   // Uses IndexedDB
  onProgress: (p) => console.log(`${p.percent}%`)
});

// Use with Spine runtime
const { skeleton, atlas, texture } = model.files;
```

## API Reference

### `new VarieAvatarSDK(options?)`

Create a new SDK instance.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | `https://varie.ai/api` | API base URL |
| `cacheEnabled` | `boolean` | `true` | Enable IndexedDB caching |
| `rateLimitPerSecond` | `number` | `5` | Max requests per second |
| `discoverCacheTTL` | `number` | `3600000` | Cache TTL for discover (1 hour) |
| `characterCacheTTL` | `number` | `604800000` | Cache TTL for characters (1 week) |

### `sdk.discover(options?)`

List available characters.

| Option | Type | Description |
|--------|------|-------------|
| `limit` | `number` | Max results (1-50, default: 20) |
| `cursor` | `string` | Pagination cursor |
| `genre` | `string` | Filter by genre |
| `language` | `string` | Filter by language |

Returns: `Promise<DiscoverResponse>`

### `sdk.getCharacter(id, skipCache?)`

Get character details by ID.

Returns: `Promise<Character>`

### `sdk.downloadModel(characterId, options?)`

Download and unpack a character model.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | `'full' \| 'base'` | `'full'` | Model quality |
| `cache` | `boolean` | `true` | Cache the model |
| `onProgress` | `function` | - | Progress callback |

Returns: `Promise<UnpackedModel>`

### `sdk.clearCache()`

Clear all cached data.

### `sdk.getCacheStats()`

Get cache statistics.

### `sdk.getRateLimitStatus()`

Get current rate limiter status.

## Types

### `Character`

```typescript
interface Character {
  id: string;
  name: string;
  tagline: string;
  quotes: string[];
  genre: string;
  pronouns: string;
  personalityTags: string[];
  avatarUrl: string;
  story: string;
  publicModel: {
    status: 'full_ready' | 'base_ready' | 'failed' | null;
    baseUrl?: string;
    fullUrl?: string;
  };
}
```

### `UnpackedModel`

```typescript
interface UnpackedModel {
  characterId: string;
  type: 'full' | 'base';
  files: {
    skeleton: object;     // Parsed JSON
    atlas: string;        // Atlas text
    texture: Blob;        // PNG texture
    raw: Map<string, ArrayBuffer>;
  };
  size: number;
  cachedAt?: number;
}
```

### `SDKError`

```typescript
class SDKError extends Error {
  code: SDKErrorCode;
  cause?: unknown;
}

enum SDKErrorCode {
  NETWORK_ERROR,
  API_ERROR,
  NOT_FOUND,
  MODEL_NOT_AVAILABLE,
  INVALID_BUNDLE,
  CACHE_ERROR,
  RATE_LIMITED,
}
```

## Using with Spine Runtime

The SDK returns unpacked model files ready for any Spine runtime:

```typescript
// With spine-webgl
const model = await sdk.downloadModel(characterId);

// Create texture from blob
const textureUrl = URL.createObjectURL(model.files.texture);
const image = new Image();
image.src = textureUrl;
await new Promise(resolve => image.onload = resolve);

// Create atlas and skeleton
const atlas = new spine.TextureAtlas(model.files.atlas);
// ... set up texture on atlas pages

const skeletonJson = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas));
const skeletonData = skeletonJson.readSkeletonData(model.files.skeleton);

// Create skeleton instance
const skeleton = new spine.Skeleton(skeletonData);
```

### Eye Tracking (Gaze)

Varie characters support eye tracking via `look_left`, `look_right`, `look_up`, `look_down` animations:

```typescript
// Convert mouse position to -1 to 1 range
const gazeX = ((mouseX - canvasLeft) / canvasWidth) * 2 - 1;
const gazeY = -(((mouseY - canvasTop) / canvasHeight) * 2 - 1);

// Apply horizontal gaze
if (Math.abs(gazeX) > 0.1) {
  const animName = gazeX < 0 ? 'look_left' : 'look_right';
  const track = animationState.setAnimation(TRACK_GAZE, animName, false);
  track.alpha = Math.min(1.0, Math.abs(gazeX));
  track.trackTime = 0.3;
  track.timeScale = 0; // Hold at this frame
}
```

See `examples/browser/spine-render.html` for a complete working example with eye tracking, blink, and expressions.

## Browser Support

- Chrome 80+
- Firefox 78+
- Safari 14+
- Edge 80+

Requires `fetch`, `IndexedDB`, and `TextDecoder` APIs.

## Node.js Support

Works in Node.js 18+ with in-memory caching (IndexedDB not available).

## Local Development

### Running Examples

The API has CORS restrictions. For local browser testing, use **port 3000**:

```bash
# Clone and install
git clone https://github.com/varie-ai/avatar-sdk.git
cd avatar-sdk
npm install
npm run build

# Serve examples on port 3000 (required for CORS)
python3 -m http.server 3000

# Open in browser
# http://localhost:3000/examples/browser/           - Basic SDK usage
# http://localhost:3000/examples/browser/spine-render.html - Spine rendering with eye tracking
```

### Examples

| Example | Description |
|---------|-------------|
| `examples/browser/index.html` | Basic discover, select, download workflow |
| `examples/browser/spine-render.html` | Full Spine rendering with eye tracking, blink, expressions |
| `examples/node/index.ts` | Node.js CLI example |

## License

MIT

## Links

- [Documentation](https://varie.ai/developers)
- [GitHub](https://github.com/varie-ai/avatar-sdk)
- [AI Avatars Gallery](https://varie.ai/ai-avatars)
