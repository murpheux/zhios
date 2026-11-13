export const DEFAULT_CACHE_TTL_SECONDS = 300;

export const userCacheKey = (userId: string): string => `ozzo:user:${userId}`;
export const walletCacheKey = (userId: string): string => `ozzo:wallet:${userId}`;
