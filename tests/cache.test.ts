/**
 * Tests for cache manager (in-memory implementation)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createInMemoryCache, type CacheManager } from '../src/cache';
import type { DiscoverResponse, Character, UnpackedModel } from '../src/types';

describe('InMemoryCache', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = createInMemoryCache();
    vi.useFakeTimers();
  });

  describe('discover cache', () => {
    const mockDiscoverResponse: DiscoverResponse = {
      characters: [
        {
          id: 'test_char_1',
          name: 'Test Character',
          tagline: 'A test character',
          quotes: ['Quote 1'],
          genre: 'fantasy',
          pronouns: 'they/them',
          personalityTags: ['test'],
          avatarUrl: 'https://example.com/avatar.png',
          story: 'Test story',
          publicModel: {
            status: 'full_ready',
            baseUrl: 'https://example.com/base.varie',
            fullUrl: 'https://example.com/full.varie',
          },
        },
      ],
      pagination: {
        limit: 20,
        hasMore: false,
      },
    };

    it('stores and retrieves discover response', async () => {
      await cache.setDiscover('key1', mockDiscoverResponse, 60000);
      const result = await cache.getDiscover('key1');

      expect(result).toEqual(mockDiscoverResponse);
    });

    it('returns null for missing key', async () => {
      const result = await cache.getDiscover('nonexistent');
      expect(result).toBeNull();
    });

    it('respects TTL - returns null after expiry', async () => {
      await cache.setDiscover('key1', mockDiscoverResponse, 1000); // 1 second TTL

      // Still valid
      const result1 = await cache.getDiscover('key1');
      expect(result1).toEqual(mockDiscoverResponse);

      // Advance past TTL
      vi.advanceTimersByTime(1500);

      const result2 = await cache.getDiscover('key1');
      expect(result2).toBeNull();
    });

    it('overwrites existing entry', async () => {
      const response1 = { ...mockDiscoverResponse, characters: [] };
      const response2 = mockDiscoverResponse;

      await cache.setDiscover('key1', response1, 60000);
      await cache.setDiscover('key1', response2, 60000);

      const result = await cache.getDiscover('key1');
      expect(result).toEqual(response2);
    });
  });

  describe('character cache', () => {
    const mockCharacter: Character = {
      id: 'test_char_1',
      name: 'Test Character',
      tagline: 'A test character',
      quotes: ['Quote 1', 'Quote 2'],
      genre: 'fantasy',
      pronouns: 'she/her',
      personalityTags: ['brave', 'kind'],
      avatarUrl: 'https://example.com/avatar.png',
      story: 'A long story about the character',
      publicModel: {
        status: 'full_ready',
        baseUrl: 'https://example.com/base.varie',
        fullUrl: 'https://example.com/full.varie',
      },
    };

    it('stores and retrieves character', async () => {
      await cache.setCharacter('test_char_1', mockCharacter, 60000);
      const result = await cache.getCharacter('test_char_1');

      expect(result).toEqual(mockCharacter);
    });

    it('returns null for missing character', async () => {
      const result = await cache.getCharacter('nonexistent');
      expect(result).toBeNull();
    });

    it('respects TTL', async () => {
      await cache.setCharacter('test_char_1', mockCharacter, 1000);

      vi.advanceTimersByTime(1500);

      const result = await cache.getCharacter('test_char_1');
      expect(result).toBeNull();
    });
  });

  describe('model cache', () => {
    const mockModel: UnpackedModel = {
      characterId: 'test_char_1',
      type: 'full',
      files: {
        skeleton: { bones: [] },
        atlas: 'atlas content',
        texture: new Blob(['png data'], { type: 'image/png' }),
        raw: new Map(),
      },
      size: 1024 * 1024, // 1MB
      cachedAt: Date.now(),
    };

    it('stores and retrieves model', async () => {
      await cache.setModel('test_char_1', 'full', mockModel);
      const result = await cache.getModel('test_char_1', 'full');

      expect(result).toEqual(mockModel);
    });

    it('returns null for missing model', async () => {
      const result = await cache.getModel('nonexistent', 'full');
      expect(result).toBeNull();
    });

    it('stores base and full models separately', async () => {
      const baseModel = { ...mockModel, type: 'base' as const };
      const fullModel = mockModel;

      await cache.setModel('test_char_1', 'base', baseModel);
      await cache.setModel('test_char_1', 'full', fullModel);

      const baseResult = await cache.getModel('test_char_1', 'base');
      const fullResult = await cache.getModel('test_char_1', 'full');

      expect(baseResult?.type).toBe('base');
      expect(fullResult?.type).toBe('full');
    });

    it('models do not expire (no TTL)', async () => {
      await cache.setModel('test_char_1', 'full', mockModel);

      // Advance time significantly
      vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 24 hours

      const result = await cache.getModel('test_char_1', 'full');
      expect(result).toEqual(mockModel);
    });
  });

  describe('clear', () => {
    it('clears all cached data', async () => {
      const mockCharacter: Character = {
        id: 'test',
        name: 'Test',
        tagline: 'Test',
        quotes: [],
        genre: 'test',
        pronouns: 'they/them',
        personalityTags: [],
        avatarUrl: '',
        story: '',
        publicModel: { status: null },
      };

      const mockModel: UnpackedModel = {
        characterId: 'test',
        type: 'full',
        files: {
          skeleton: {},
          atlas: '',
          texture: new Blob(),
          raw: new Map(),
        },
        size: 100,
      };

      await cache.setDiscover('key1', { characters: [], pagination: { limit: 20, hasMore: false } }, 60000);
      await cache.setCharacter('test', mockCharacter, 60000);
      await cache.setModel('test', 'full', mockModel);

      await cache.clear();

      expect(await cache.getDiscover('key1')).toBeNull();
      expect(await cache.getCharacter('test')).toBeNull();
      expect(await cache.getModel('test', 'full')).toBeNull();
    });
  });

  describe('getStats', () => {
    it('returns correct counts', async () => {
      const mockCharacter: Character = {
        id: 'test',
        name: 'Test',
        tagline: '',
        quotes: [],
        genre: '',
        pronouns: '',
        personalityTags: [],
        avatarUrl: '',
        story: '',
        publicModel: { status: null },
      };

      const mockModel: UnpackedModel = {
        characterId: 'test',
        type: 'full',
        files: {
          skeleton: {},
          atlas: '',
          texture: new Blob(),
          raw: new Map(),
        },
        size: 1024 * 1024, // 1MB
      };

      await cache.setDiscover('key1', { characters: [], pagination: { limit: 20, hasMore: false } }, 60000);
      await cache.setDiscover('key2', { characters: [], pagination: { limit: 20, hasMore: false } }, 60000);
      await cache.setCharacter('char1', mockCharacter, 60000);
      await cache.setModel('char1', 'full', mockModel);
      await cache.setModel('char1', 'base', { ...mockModel, type: 'base', size: 512 * 1024 });

      const stats = await cache.getStats();

      expect(stats.discoverEntries).toBe(2);
      expect(stats.characterEntries).toBe(1);
      expect(stats.modelEntries).toBe(2);
      expect(stats.totalSizeBytes).toBe(1024 * 1024 + 512 * 1024);
    });

    it('returns zeros for empty cache', async () => {
      const stats = await cache.getStats();

      expect(stats.discoverEntries).toBe(0);
      expect(stats.characterEntries).toBe(0);
      expect(stats.modelEntries).toBe(0);
      expect(stats.totalSizeBytes).toBe(0);
    });
  });
});
