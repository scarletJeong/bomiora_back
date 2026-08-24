const searchRepository = require('../repositories/SearchRepository');
const productController = require('../../shopping/product/controllers/ProductController');
const contentController = require('../../content/controllers/ContentController');
const { TtlCache } = require('../../../utils/ttlCache');

const searchCache = new TtlCache(45_000);

class SearchController {
  _asPositiveInt(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.floor(n);
  }

  _normalizeQuery(raw) {
    return String(raw ?? '').trim();
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

      const prescriptionLimit = this._asPositiveInt(req.query.rxLimit, 20);
      const storeLimit = this._asPositiveInt(req.query.storeLimit, 20);
      const contentLimit = this._asPositiveInt(req.query.contentLimit, 20);
      const cacheKey = `q:${query}:${prescriptionLimit}:${storeLimit}:${contentLimit}`;

      const payload = await searchCache.getOrSet(cacheKey, async () => {
        const [rxRows, storeRows, contentResult, shopDefault] = await Promise.all([
          searchRepository.searchProducts({
            query,
            itKind: 'prescription',
            limit: prescriptionLimit,
          }),
          searchRepository.searchProducts({
            query,
            itKind: 'general',
            limit: storeLimit,
          }),
          searchRepository.searchContents({
            query,
            limit: contentLimit,
          }),
          productController.getShopDefaultCached(),
        ]);

        const rxItemsSlim = rxRows.map((r) =>
          productController.toProductSearchDto(r, shopDefault)
        );
        const storeItemsSlim = storeRows.map((r) =>
          productController.toProductSearchDto(r, shopDefault)
        );
        const contentItems = contentResult.rows.map((r) => contentController.toMap(r));

        return {
          success: true,
          query,
          results: {
            prescription: {
              count: rxItemsSlim.length,
              items: rxItemsSlim,
            },
            store: {
              count: storeItemsSlim.length,
              items: storeItemsSlim,
            },
            content: {
              count: contentItems.length,
              items: contentItems,
              pagination: {
                total: contentResult.total,
                page: contentResult.page,
                size: contentResult.size,
                totalPages:
                  contentResult.size > 0
                    ? Math.ceil(contentResult.total / contentResult.size)
                    : 0,
              },
            },
          },
          totalCount: rxItemsSlim.length + storeItemsSlim.length + contentItems.length,
        };
      });

      res.set('Cache-Control', 'public, max-age=30');
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
