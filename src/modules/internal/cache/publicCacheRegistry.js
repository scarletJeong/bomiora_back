/** 관리자 저장 후 비울 공개 목록 캐시. 장바구니·주문·건강 기록은 넣지 않는다. */
const cachesByScope = new Map();

const SCOPE_ALIASES = {
  banners: 'banner',
  notice: 'announcement',
  notices: 'announcement',
  announcement: 'announcement',
  announcements: 'announcement',
  products: 'product',
  product: 'product',
  events: 'event',
  event: 'event',
  contents: 'content',
  content: 'content',
  categories: 'category',
  category: 'category',
  reviews: 'review',
  review: 'review',
  shop: 'shop',
  config: 'config',
  search: 'search',
  home: 'home',
  all: 'all',
};

/** 홈 화면에 올라오는 공개 목록 */
const HOME_SCOPES = [
  'banner',
  'announcement',
  'product',
  'event',
  'content',
  'category',
  'review',
];

function registerPublicCache(scope, cache) {
  const key = String(scope || '').trim().toLowerCase();
  if (!key || !cache || typeof cache.clear !== 'function') return;
  if (!cachesByScope.has(key)) cachesByScope.set(key, new Set());
  cachesByScope.get(key).add(cache);
}

function normalizeScope(raw) {
  const key = String(raw || '').trim().toLowerCase();
  return SCOPE_ALIASES[key] || key;
}

function listPublicScopes() {
  return [...cachesByScope.keys()].sort();
}

function invalidatePublicCaches(rawScopes) {
  const requested = (Array.isArray(rawScopes) ? rawScopes : [rawScopes])
    .map(normalizeScope)
    .filter(Boolean);

  const expanded = new Set();
  for (const scope of requested) {
    if (scope === 'all') {
      for (const name of cachesByScope.keys()) expanded.add(name);
    } else if (scope === 'home') {
      for (const name of HOME_SCOPES) expanded.add(name);
    } else {
      expanded.add(scope);
    }
  }

  const cleared = [];
  const unknown = [];
  for (const scope of expanded) {
    const caches = cachesByScope.get(scope);
    if (!caches || caches.size === 0) {
      unknown.push(scope);
      continue;
    }
    for (const cache of caches) cache.clear();
    cleared.push(scope);
  }

  return { cleared, unknown };
}

module.exports = {
  registerPublicCache,
  invalidatePublicCaches,
  listPublicScopes,
};
