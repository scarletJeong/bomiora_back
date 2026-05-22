const searchRepository = require('../repositories/SearchRepository');
const productController = require('../../shopping/product/controllers/ProductController');
const contentController = require('../../content/controllers/ContentController');

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

      const [rxRows, storeRows, contentResult] = await Promise.all([
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
      ]);

      // 검색 응답은 payload 최소화
      const rxItemsSlim = rxRows.map((r) => productController.toProductSearchDto(r));
      const storeItemsSlim = storeRows.map((r) => productController.toProductSearchDto(r));
      const contentItems = contentResult.rows.map((r) => contentController.toMap(r));

      return res.json({
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
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `검색 실패: ${error.message}`,
      });
    }
  }
}

module.exports = new SearchController();

