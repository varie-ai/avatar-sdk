/**
 * Node.js Example - Varie Avatar SDK
 *
 * Run with: npx tsx examples/node/index.ts
 */

import { VarieAvatarSDK, SDKError, SDKErrorCode } from '../../src/index';

async function main() {
  console.log('Varie Avatar SDK - Node.js Example\n');

  const sdk = new VarieAvatarSDK({
    rateLimitPerSecond: 2, // Be gentle for demo
  });

  try {
    // 1. Discover characters
    console.log('1. Discovering characters...');
    const { characters, pagination } = await sdk.discover({
      limit: 5,
    });

    console.log(`   Found ${characters.length} characters (hasMore: ${pagination.hasMore})\n`);

    for (const char of characters) {
      console.log(`   - ${char.name}: ${char.tagline}`);
      console.log(`     Genre: ${char.genre}, Tags: ${char.personalityTags.join(', ')}`);
      console.log(`     Model: ${char.publicModel?.status ?? 'not available'}\n`);
    }

    // 2. Get specific character
    if (characters.length > 0) {
      const firstChar = characters[0];
      console.log(`2. Getting details for "${firstChar.name}"...`);

      const character = await sdk.getCharacter(firstChar.id);
      console.log(`   ID: ${character.id}`);
      console.log(`   Quote: "${character.quotes[0]}"`);
      console.log(`   Story: ${character.story.slice(0, 100)}...\n`);

      // 3. Download model (base for speed)
      if (character.publicModel?.baseUrl) {
        console.log('3. Downloading model (base)...');

        const model = await sdk.downloadModel(character.id, {
          type: 'base',
          cache: true,
          onProgress: (p) => {
            process.stdout.write(`\r   Progress: ${p.percent}%`);
          },
        });

        console.log('\n');
        console.log(`   Size: ${(model.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Files: ${Array.from(model.files.raw.keys()).join(', ')}`);
        console.log(`   Skeleton bones: ${(model.files.skeleton as any)?.bones?.length ?? 'unknown'}`);
      } else {
        console.log('3. Skipping download - no model available');
      }
    }

    // 4. Cache stats
    console.log('\n4. Cache statistics:');
    const stats = await sdk.getCacheStats();
    console.log(`   Discover entries: ${stats.discoverEntries}`);
    console.log(`   Character entries: ${stats.characterEntries}`);
    console.log(`   Model entries: ${stats.modelEntries}`);
    console.log(`   Total size: ${(stats.totalSizeBytes / 1024 / 1024).toFixed(2)} MB`);

    // 5. Rate limit status
    console.log('\n5. Rate limiter status:');
    const rateStatus = sdk.getRateLimitStatus();
    console.log(`   Tokens: ${rateStatus.tokens}/${rateStatus.maxTokens}`);
    console.log(`   Queue size: ${rateStatus.queueSize}`);

  } catch (error) {
    if (error instanceof SDKError) {
      console.error(`\nSDK Error [${error.code}]: ${error.message}`);
      if (error.code === SDKErrorCode.NOT_FOUND) {
        console.error('The character was not found.');
      }
    } else {
      console.error('\nUnexpected error:', error);
    }
    process.exit(1);
  }

  console.log('\nDone!');
}

main();
