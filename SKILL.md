---
name: avatar-sdk
description: Integrate animated Varie AI avatars into applications. Use when building apps that need character companions, animated mascots, or reactive avatars with Spine/WebGL rendering.
---

# Avatar SDK Integration

Add animated AI avatar companions to your application using the `@varie-ai/avatar-sdk`.

## When to Use This

- Building an Electron/desktop app that needs an animated companion
- Adding a mascot or avatar to a web application
- Creating interactive characters with expressions and animations
- Integrating Spine-based character rendering

## Installation

```bash
npm install @varie-ai/avatar-sdk
```

## Core API

### 1. Discover Available Characters

```typescript
import { discover } from '@varie-ai/avatar-sdk'

const result = await discover()
// result.characters: array of available characters
// result.pagination: { hasMore, nextCursor }

// Each character has:
// - id: unique identifier (e.g., "soren_cb3333dd3e3f")
// - name: display name
// - tagline: short description
// - genre: fantasy, modern, sci-fi, etc.
// - personalityTags: ["calm", "wise", "mysterious"]
// - publicModel.status: "full_ready" | "base_ready"
```

### 2. Get Character Details

```typescript
import { getCharacter } from '@varie-ai/avatar-sdk'

const character = await getCharacter('soren_cb3333dd3e3f')
// Returns full character info including model URLs
```

### 3. Download Model for Rendering

```typescript
import { downloadModel } from '@varie-ai/avatar-sdk'

const modelPath = await downloadModel('soren_cb3333dd3e3f', './models')
// Downloads and unpacks the .varie bundle
// Returns path to extracted model files:
// - skeleton.json (Spine skeleton)
// - atlas files
// - texture images
```

## Spine Rendering Integration

The downloaded models are Spine 4.x format. To render:

### Browser (PixiJS + Spine)

```typescript
import * as PIXI from 'pixi.js'
import { Spine } from '@esotericsoftware/spine-pixi-v8'

// Load the model
const spine = await Spine.from({
  skeleton: `${modelPath}/skeleton.json`,
  atlas: `${modelPath}/skeleton.atlas`
})

// Add to stage
app.stage.addChild(spine)

// Play animations
spine.state.setAnimation(0, 'idle', true)

// Expressions (mix on track 1)
spine.state.setAnimation(1, 'happy', false)
```

### Available Animations

Standard animations included in all characters:
- `idle` - Default loop
- `idle_var1`, `idle_var2` - Idle variations
- `happy`, `sad`, `surprised`, `thinking` - Expressions
- `talk_*` - Talking animations with lip sync

### Eye Tracking (Interactive)

Characters support eye tracking for interactive experiences:

```typescript
// Set look-at target (normalized -1 to 1)
const bone = spine.skeleton.findBone('eye_target')
if (bone) {
  bone.x = mouseX * 50  // Adjust range as needed
  bone.y = mouseY * 30
}
```

## Caching

The SDK automatically caches:
- Character listings (5 min TTL)
- Downloaded models (persisted to disk)

```typescript
import { createClient } from '@varie-ai/avatar-sdk'

const client = createClient({
  cacheDir: './avatar-cache',  // Custom cache location
  cacheTTL: 300000             // 5 minutes
})
```

## Example: Electron Companion App

```typescript
import { discover, downloadModel } from '@varie-ai/avatar-sdk'
import { app, BrowserWindow } from 'electron'

async function createCompanion() {
  // 1. Pick a character
  const { characters } = await discover()
  const character = characters.find(c => c.name === 'Beatriz')

  // 2. Download model
  const modelPath = await downloadModel(character.id, app.getPath('userData'))

  // 3. Create overlay window
  const win = new BrowserWindow({
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    // ... other config
  })

  // 4. Load renderer with Spine character
  win.loadFile('companion.html')
  win.webContents.send('load-character', modelPath)
}
```

## Reference

- **npm**: https://www.npmjs.com/package/@varie-ai/avatar-sdk
- **GitHub**: https://github.com/varie-ai/avatar-sdk
- **Character Gallery**: https://varie.ai/varie-mate/characters
- **Create Custom Character**: https://varie.ai/varie-mate

## Error Handling

```typescript
try {
  const model = await downloadModel(characterId, outputDir)
} catch (error) {
  if (error.code === 'CHARACTER_NOT_FOUND') {
    // Character doesn't exist or model not ready
  } else if (error.code === 'DOWNLOAD_FAILED') {
    // Network error - retry or use cached
  }
}
```
