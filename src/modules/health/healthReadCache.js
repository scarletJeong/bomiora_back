const { TtlCache } = require('../../utils/ttlCache');

/** 건강 대시보드 조회 캐시 (기록 추가는 최대 TTL만큼 늦게 반영) */
const healthReadCache = new TtlCache(20_000);

function healthCacheKey(kind, mbId, extra = '') {
  return `${kind}:${String(mbId || '').trim()}:${extra}`;
}

function getHealthCached(kind, mbId, loader, extra = '') {
  return healthReadCache.getOrSet(healthCacheKey(kind, mbId, extra), loader);
}

module.exports = {
  healthReadCache,
  getHealthCached,
};
