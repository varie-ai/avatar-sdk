/**
 * Tests for rate limiter
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter, withRateLimit } from '../src/rate-limit';
import { SDKError, SDKErrorCode } from '../src/types';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('basic functionality', () => {
    it('allows requests when tokens available', async () => {
      const limiter = new RateLimiter({ requestsPerSecond: 5 });

      // Should not throw - has tokens
      await expect(limiter.acquire()).resolves.toBeUndefined();
    });

    it('consumes tokens on acquire', async () => {
      const limiter = new RateLimiter({ requestsPerSecond: 5, maxBurst: 3 });

      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();

      const status = limiter.getStatus();
      expect(status.tokens).toBe(0);
    });

    it('refills tokens over time', async () => {
      const limiter = new RateLimiter({ requestsPerSecond: 10, maxBurst: 10 });

      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await limiter.acquire();
      }

      expect(limiter.getStatus().tokens).toBe(0);

      // Advance time by 500ms (should add 5 tokens at 10/sec)
      vi.advanceTimersByTime(500);

      const status = limiter.getStatus();
      expect(status.tokens).toBe(5);
    });

    it('caps tokens at maxBurst', async () => {
      const limiter = new RateLimiter({ requestsPerSecond: 10, maxBurst: 5 });

      // Advance time significantly
      vi.advanceTimersByTime(10000);

      const status = limiter.getStatus();
      expect(status.tokens).toBe(5); // Capped at maxBurst
    });
  });

  describe('queueing', () => {
    it('queues requests when no tokens available', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 1,
        maxBurst: 1,
        queueRequests: true,
      });

      // Consume the only token
      await limiter.acquire();

      // This should queue
      const acquirePromise = limiter.acquire();

      expect(limiter.getStatus().queueSize).toBe(1);

      // Advance time to refill
      vi.advanceTimersByTime(1000);

      await expect(acquirePromise).resolves.toBeUndefined();
      expect(limiter.getStatus().queueSize).toBe(0);
    });

    it('respects maxQueueSize', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 1,
        maxBurst: 1,
        queueRequests: true,
        maxQueueSize: 2,
      });

      // Consume token
      await limiter.acquire();

      // Queue 2 requests (at max) - catch rejections from reset
      const p1 = limiter.acquire().catch(() => {}); // Ignore rejection
      const p2 = limiter.acquire().catch(() => {}); // Ignore rejection

      // Third should reject (queue full)
      await expect(limiter.acquire()).rejects.toThrow(SDKError);

      // Reset to clean up pending promises
      limiter.reset();
      await Promise.all([p1, p2]);
    });
  });

  describe('non-queuing mode', () => {
    it('throws immediately when no tokens and queueing disabled', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 1,
        maxBurst: 1,
        queueRequests: false,
      });

      // Consume token
      await limiter.acquire();

      // Should throw immediately
      await expect(limiter.acquire()).rejects.toThrow(SDKError);

      try {
        await limiter.acquire();
      } catch (e) {
        expect(e).toBeInstanceOf(SDKError);
        expect((e as SDKError).code).toBe(SDKErrorCode.RATE_LIMITED);
      }
    });
  });

  describe('getStatus', () => {
    it('returns current state', () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 5,
        maxBurst: 10,
      });

      const status = limiter.getStatus();
      expect(status.tokens).toBe(10);
      expect(status.maxTokens).toBe(10);
      expect(status.queueSize).toBe(0);
    });
  });

  describe('reset', () => {
    it('restores tokens to max', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 5,
        maxBurst: 5,
      });

      // Consume all tokens
      for (let i = 0; i < 5; i++) {
        await limiter.acquire();
      }
      expect(limiter.getStatus().tokens).toBe(0);

      limiter.reset();
      expect(limiter.getStatus().tokens).toBe(5);
    });

    it('rejects queued requests on reset', async () => {
      const limiter = new RateLimiter({
        requestsPerSecond: 1,
        maxBurst: 1,
        queueRequests: true,
      });

      await limiter.acquire();
      const queuedPromise = limiter.acquire();

      limiter.reset();

      await expect(queuedPromise).rejects.toThrow(SDKError);
    });
  });
});

describe('withRateLimit', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('wraps function with rate limiting', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 10 });
    const mockFn = vi.fn().mockResolvedValue('result');

    const wrapped = withRateLimit(mockFn, limiter);
    const result = await wrapped('arg1', 'arg2');

    expect(result).toBe('result');
    expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
  });
});
