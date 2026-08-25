const { TtlCache } = require('../../utils/ttlCache');

/** 건강 대시보드 조회 캐시 (기록 추가는 최대 TTL만큼 늦게 반영) */
const healthReadCache = new TtlCache(60_000);

function healthCacheKey(kind, mbId, extra = '') {
  return `${kind}:${String(mbId || '').trim()}:${extra}`;
}

function getHealthCached(kind, mbId, loader, extra = '') {
  return healthReadCache.getOrSet(healthCacheKey(kind, mbId, extra), loader);
}

function invalidateHealthMember(mbId) {
  const id = String(mbId || '').trim();
  if (!id) return;
  for (const key of healthReadCache.store.keys()) {
    if (key.includes(`:${id}:`) || key.endsWith(`:${id}`)) {
      healthReadCache.store.delete(key);
    }
  }
}

module.exports = {
  healthReadCache,
  getHealthCached,
  invalidateHealthMember,
};
