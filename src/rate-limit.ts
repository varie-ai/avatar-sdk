/**
 * Client-side Rate Limiter
 *
 * Implements a token bucket algorithm to throttle API requests.
 * Prevents overwhelming the server and handles backoff gracefully.
 */

import { SDKError, SDKErrorCode } from './types';

/**
 * Rate limiter configuration
 */
export interface RateLimiterOptions {
  /** Maximum requests per second (default: 5) */
  requestsPerSecond?: number;
  /** Maximum burst size (default: 10) */
  maxBurst?: number;
  /** Whether to queue requests or reject immediately (default: true) */
  queueRequests?: boolean;
  /** Maximum queue size (default: 50) */
  maxQueueSize?: number;
}

/**
 * Token bucket rate limiter
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private readonly queueRequests: boolean;
  private readonly maxQueueSize: number;
  private queue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  private processing = false;

  constructor(options: RateLimiterOptions = {}) {
    const requestsPerSecond = options.requestsPerSecond ?? 5;
    this.maxTokens = options.maxBurst ?? Math.max(10, requestsPerSecond * 2);
    this.refillRate = requestsPerSecond / 1000; // tokens per millisecond
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.queueRequests = options.queueRequests ?? true;
    this.maxQueueSize = options.maxQueueSize ?? 50;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }

  /**
   * Process queued requests
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      this.refill();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        const item = this.queue.shift()!;
        item.resolve();
      } else {
        // Wait for token to become available
        const waitTime = Math.ceil((1 - this.tokens) / this.refillRate);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    this.processing = false;
  }

  /**
   * Acquire a token to make a request
   *
   * @returns Promise that resolves when request can proceed
   * @throws SDKError if rate limited and queuing is disabled
   */
  async acquire(): Promise<void> {
    this.refill();

    // If we have tokens, use one immediately
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // No tokens available
    if (!this.queueRequests) {
      throw new SDKError(
        SDKErrorCode.RATE_LIMITED,
        'Rate limit exceeded. Please wait before making more requests.'
      );
    }

    // Check queue size
    if (this.queue.length >= this.maxQueueSize) {
      throw new SDKError(
        SDKErrorCode.RATE_LIMITED,
        `Request queue full (${this.maxQueueSize} pending). Please wait.`
      );
    }

    // Queue the request
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Get current rate limiter status
   */
  getStatus(): { tokens: number; queueSize: number; maxTokens: number } {
    this.refill();
    return {
      tokens: Math.floor(this.tokens),
      queueSize: this.queue.length,
      maxTokens: this.maxTokens,
    };
  }

  /**
   * Reset the rate limiter (for testing)
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    // Reject all queued requests
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      item.reject(new SDKError(SDKErrorCode.RATE_LIMITED, 'Rate limiter reset'));
    }
  }
}

/**
 * Wrap a function with rate limiting
 */
export function withRateLimit<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  limiter: RateLimiter
): T {
  return (async (...args: Parameters<T>) => {
    await limiter.acquire();
    return fn(...args);
  }) as T;
}
