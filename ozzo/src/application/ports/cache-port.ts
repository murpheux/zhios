export interface CachePort {
  /** Returns null on miss or when the cache backend is unavailable. */
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}
