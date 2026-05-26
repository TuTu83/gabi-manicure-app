import Taro from '@tarojs/taro';

export const storageKeys = {
  app: 'gm.app',
} as const;

type RateLimitState = { windowStart: number; count: number };

export function safeGetStorage<T>(key: string): T | null {
  try {
    const value = Taro.getStorageSync(key);
    if (!value) return null;
    return value as T;
  } catch (error) {
    console.error('[Storage] falha ao ler', error);
    return null;
  }
}

export function safeSetStorage<T>(key: string, value: T): void {
  try {
    Taro.setStorageSync(key, value);
  } catch (error) {
    console.error('[Storage] falha ao salvar', error);
  }
}

export function safeRemoveStorage(key: string): void {
  try {
    Taro.removeStorageSync(key);
  } catch (error) {
    console.error('[Storage] falha ao remover', error);
  }
}

export function consumeRateLimit(params: {
  key: string;
  max: number;
  windowMs: number;
}): { allowed: boolean; retryAfterMs: number; remaining: number } {
  const now = Date.now();
  const windowMs = Math.max(1000, Number(params.windowMs) || 1000);
  const max = Math.max(1, Number(params.max) || 1);
  const storageKey = `gm.rateLimit.${params.key}`;

  const current = safeGetStorage<RateLimitState>(storageKey) || { windowStart: now, count: 0 };
  const fresh = now - current.windowStart >= windowMs;
  const next: RateLimitState = fresh ? { windowStart: now, count: 0 } : current;

  if (next.count >= max) {
    const retryAfterMs = Math.max(0, windowMs - (now - next.windowStart));
    return { allowed: false, retryAfterMs, remaining: 0 };
  }

  next.count += 1;
  safeSetStorage(storageKey, next);
  return { allowed: true, retryAfterMs: 0, remaining: Math.max(0, max - next.count) };
}
