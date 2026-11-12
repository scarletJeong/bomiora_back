const searchRepository = require('../repositories/SearchRepository');
const productController = require('../../shopping/product/controllers/ProductController');
const contentController = require('../../content/controllers/ContentController');
const eventController = require('../../shopping/event/controllers/EventController');
const announcementController = require('../../community/announcement/controllers/AnnouncementController');
const { TtlCache } = require('../../../utils/ttlCache');
const { registerPublicCache } = require('../../internal/cache/publicCacheRegistry');

const searchCache = new TtlCache(45_000);
registerPublicCache('search', searchCache);

class SearchController {
  _asPositiveInt(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.floor(n);
  }

  _normalizeQuery(raw) {
    return String(raw ?? '').trim();
  }

  _asOffset(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  }

  async search(req, res) {
    try {
      const query = this._normalizeQuery(req.query.q ?? req.query.query);
      if (!query) {
        return res.status(400).json({
          success: false,
          message: 'query(q) 파라미터가 필요합니다.',
        });
      }

      const sections = ['prescription', 'store', 'event', 'announcement', 'content'];
      const requestedSection = String(req.query.section || '').trim();
      const section = sections.includes(requestedSection) ? requestedSection : '';
      const pageLimit = this._asPositiveInt(req.query.limit, 20);
      const offset = section ? this._asOffset(req.query.offset) : 0;
      const cacheKey = `q:${query}:${section}:${pageLimit}:${offset}`;
      const fresh = String(req.query.fresh || '') === '1';

      const loadPayload = async () => {
        const run = (name) => !section || section === name;
        const sectionOffset = (name) => (section === name ? offset : 0);
        const emptyPack = { rows: [], hasMore: false, total: 0, page: 1, size: pageLimit };
        const [rxPack, storePack, contentPack, eventPack, announcementPack, shopDefault] = await Promise.all([
          run('prescription')
            ? searchRepository.searchProducts({
              query,
              itKind: 'prescription',
              limit: pageLimit,
              offset: sectionOffset('prescription'),
            })
            : emptyPack,
          run('store')
            ? searchRepository.searchProducts({
              query,
              itKind: 'general',
              limit: pageLimit,
              offset: sectionOffset('store'),
            })
            : emptyPack,
          run('content')
            ? searchRepository.searchContents({
              query,
              limit: pageLimit,
              offset: sectionOffset('content'),
            })
            : emptyPack,
          run('event')
            ? searchRepository.searchEvents({
              query,
              limit: pageLimit,
              offset: sectionOffset('event'),
            })
            : emptyPack,
          run('announcement')
            ? searchRepository.searchAnnouncements({
              query,
              limit: pageLimit,
              offset: sectionOffset('announcement'),
            })
            : emptyPack,
          run('prescription') || run('store')
            ? productController.getShopDefaultCached()
            : null,
        ]);

        const rxItemsSlim = rxPack.rows.map((r) =>
          productController.toProductSearchDto(r, shopDefault)
        );
        const storeItemsSlim = storePack.rows.map((r) =>
          productController.toProductSearchDto(r, shopDefault)
        );
        const contentItems = contentPack.rows.map((r) => {
          const item = contentController.toMap(r);
          item.content_html = '';
          return item;
        });
        const eventItems = eventPack.rows.map((r) => eventController.toMap(r));
        const announcementItems = announcementPack.rows.map((r) =>
          announcementController.toMap(r)
        );

        return {
          success: true,
          query,
          results: {
            prescription: {
              count: rxPack.total || 0,
              total: rxPack.total || 0,
              hasMore: rxPack.hasMore === true,
              items: rxItemsSlim,
            },
            store: {
              count: storePack.total || 0,
              total: storePack.total || 0,
              hasMore: storePack.hasMore === true,
              items: storeItemsSlim,
            },
            event: {
              count: eventPack.total || 0,
              total: eventPack.total || 0,
              hasMore: eventPack.hasMore === true,
              items: eventItems,
            },
            announcement: {
              count: announcementPack.total || 0,
              total: announcementPack.total || 0,
              hasMore: announcementPack.hasMore === true,
              items: announcementItems,
            },
            content: {
              count: contentPack.total || 0,
              total: contentPack.total || 0,
              hasMore: contentPack.hasMore === true,
              items: contentItems,
              pagination: {
                total: contentPack.total || 0,
                page: contentPack.page || 1,
                size: contentPack.size || pageLimit,
                totalPages:
                  (contentPack.size || 0) > 0
                    ? Math.ceil((contentPack.total || 0) / contentPack.size)
                    : 0,
              },
            },
          },
          totalCount:
            (rxPack.total || 0) +
            (storePack.total || 0) +
            (contentPack.total || 0) +
            (eventPack.total || 0) +
            (announcementPack.total || 0),
        };
      };

      const payload = fresh
        ? searchCache.set(cacheKey, await loadPayload())
        : await searchCache.getOrSet(cacheKey, loadPayload);

      res.set('Cache-Control', fresh ? 'no-store' : 'public, max-age=30');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `검색 실패: ${error.message}`,
      });
    }
  }
}

module.exports = new SearchController();
