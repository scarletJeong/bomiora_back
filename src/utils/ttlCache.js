/**
 * 초단기 인메모리 캐시 (메인 홈 등 반복 조회용)
 * 동일 key 동시 miss 시 loader 1회만 실행 (stampede 방지)
 */
class TtlCache {
  constructor(defaultTtlMs = 30_000) {
    this.defaultTtlMs = defaultTtlMs;
    this.store = new Map();
    this.inFlight = new Map();
    this.generation = 0;
  }

  get(key) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
    return value;
  }

  async getOrSet(key, loader, ttlMs = this.defaultTtlMs) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const generation = this.generation;
    const promise = (async () => {
      try {
        const value = await loader();
        if (generation !== this.generation) return value;
        return this.set(key, value, ttlMs);
      } finally {
        if (this.inFlight.get(key) === promise) {
          this.inFlight.delete(key);
        }
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  remove(key) {
    this.store.delete(key);
    this.inFlight.delete(key);
  }

  clear() {
    this.generation += 1;
    this.store.clear();
    this.inFlight.clear();
  }
}

module.exports = { TtlCache };
