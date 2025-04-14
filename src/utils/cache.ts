import { Redis } from '@upstash/redis';

/* eslint-disable import/no-anonymous-default-export */

/*
TLDR; " Expires " is seconds based. for example 60*60 would = 3600 (an hour)
*/

export const redis = Redis.fromEnv();

interface ICacheHandler {

  /**
   * Sets a value in the cache. If the value does not exist, it uses the fetcher function
   * to retrieve the value, stores it in the cache, and sets an expiration time.
   * @param key - The cache key.
   * @param fetcher - A function to fetch the value to be stored in the cache.
   * @param expires - The expiration time in seconds.
   * @returns The value that was set in the cache.
   */
  set: <T>(key: string, fetcher: () => T, expires: number) => Promise<T>;

  /**
   * Retrieves a value from the cache using the specified key.
   * @param key - The cache key.
   * @returns The cached value, or null if the key does not exist or has expired.
   */
  get: <T>(key: string) => Promise<T | null>;

  /**
   * Deletes a value from the cache using the specified key.
   * @param key - The cache key.
   * @returns A promise that resolves when the key is deleted.
   */
  del: (key: string) => Promise<void>;

  /**
   * Fetches a value from the cache. If the value does not exist, it uses the fetcher function
   * to retrieve the value, stores it in the cache, and sets an expiration time.
   * @param key - The cache key.
   * @param fetcher - A function to fetch the value if it is not in the cache.
   * @param expires - The expiration time in seconds.
   * @returns The cached or fetched value.
   */
  fetch: <T>(key: string, fetcher: () => T, expires: number) => Promise<T>;
}

/**
 * RedisCacheHandler is a class that implements the ICacheHandler interface for Redis.
 * It provides methods to fetch, set, get, and delete values in a Redis cache.
 */
class RedisCacheHandler implements ICacheHandler {
  private inMemoryCache: Map<string, { value: unknown; expiresAt: number }> = new Map();
  private maxInMemoryCacheItems: number;

  constructor(private redis?: Redis, maxInMemoryCacheItems: number = 100) {
    console.log('Redis cache handler initialized');
    console.log(this.redis);
    console.log('Max in-memory cache items:', maxInMemoryCacheItems);
    this.maxInMemoryCacheItems = maxInMemoryCacheItems;
  }

  /**
   * Fetches a value from the cache. If the value does not exist, it uses the fetcher function
   * to retrieve the value, stores it in the cache, and sets an expiration time.
   * @param key - The cache key.
   * @param fetcher - A function to fetch the value if it is not in the cache.
   * @param expires - The expiration time in seconds.
   * @returns The cached or fetched value.
   */
  fetch = async <T>(key: string, fetcher: () => T, expires: number): Promise<T> => {
    const existing = await this.get<T>(key);
    if (existing !== null) return existing;

    return this.set<T>(key, fetcher, expires);
  };

  set = async <T>(key: string, fetcher: () => T, expires: number): Promise<T> => {
    console.log(`SET: ${key}, EXP: ${expires}`);
    const value = await fetcher();

    if (value === null || value === undefined) return null as any;

    if (this.redis) {
      console.log('Setting value in Redis cache');
      await this.redis.set(key, JSON.stringify(value), { ex: expires });
    } else {
      const expiresAt = Date.now() + expires * 1000;

      // Enforce max in-memory cache size
      if (this.inMemoryCache.size >= this.maxInMemoryCacheItems) {
        const oldestKey = this.inMemoryCache.keys().next().value;
        if (oldestKey !== undefined) {
          this.inMemoryCache.delete(oldestKey);
        }
      }

      this.inMemoryCache.set(key, { value, expiresAt });
    }

    return value;
  };

  get = async <T>(key: string): Promise<T | null> => {
    console.log('GET: ' + key);

    if (this.redis) {
      const value = await this.redis.get(key);
      if (value === null || value === undefined) return null;
      return typeof value === 'string' ? (JSON.parse(value) as T) : null;
    } else {
      const entry = this.inMemoryCache.get(key);
      if (!entry || entry.expiresAt < Date.now()) {
        this.inMemoryCache.delete(key);
        return null;
      }
      return entry.value as T;
    }
  };

  del = async (key: string): Promise<void> => {
    console.log('DEL: ' + key);

    if (this.redis) {
      await this.redis.del(key);
    } else {
      this.inMemoryCache.delete(key);
    }
  };
}

const cache = new RedisCacheHandler(redis, 10);

export default cache;
