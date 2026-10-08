const {
  invalidatePublicCaches,
  listPublicScopes,
} = require('../publicCacheRegistry');

function ensurePublicCachesLoaded() {
  require('../../../home/banner/controllers/BannerController');
  require('../../../community/announcement/controllers/AnnouncementController');
  require('../../../shopping/product/controllers/ProductController');
  require('../../../shopping/event/controllers/EventController');
  require('../../../content/controllers/ContentController');
  require('../../../common/get_category/controllers/GetCategoryController');
  require('../../../user/review/controllers/ReviewController');
  require('../../../common/shopdefault/controllers/ShopDefaultController');
  require('../../../config/controllers/ConfigController');
  require('../../../search/controllers/SearchController');
}

function readSecret(req) {
  const header = (req.headers['x-internal-secret'] || '').toString().trim();
  const body = (req.body?.secret || '').toString().trim();
  return header || body;
}

class InternalCacheController {
  /**
   * POST /api/internal/cache/invalidate
   * body: { scope: 'banner' | 'announcement' | 'product' | 'event' | 'content'
   *              | 'category' | 'review' | 'shop' | 'config' | 'search'
   *              | 'home' | 'all' }
   * 또는 { scopes: ['banner', 'product'] }
   */
  async invalidate(req, res) {
    try {
      const expected = (process.env.INTERNAL_NOTIFY_SECRET || '').trim();
      if (!expected) {
        return res.status(503).json({
          success: false,
          message: 'INTERNAL_NOTIFY_SECRET이 설정되지 않았습니다.',
        });
      }

      const secret = readSecret(req);
      if (!secret || secret !== expected) {
        return res.status(403).json({ success: false, message: '인증 실패' });
      }

      ensurePublicCachesLoaded();

      const raw = req.body?.scopes ?? req.body?.scope;
      if (raw == null || (typeof raw === 'string' && !raw.trim()) || (Array.isArray(raw) && raw.length === 0)) {
        return res.status(400).json({
          success: false,
          message: 'scope가 필요합니다.',
          allowed: [...listPublicScopes(), 'home', 'all'],
        });
      }

      const { cleared, unknown } = invalidatePublicCaches(raw);
      if (cleared.length === 0) {
        return res.status(400).json({
          success: false,
          message: '지울 수 있는 scope가 없습니다.',
          unknown,
          allowed: [...listPublicScopes(), 'home', 'all'],
        });
      }

      return res.json({
        success: true,
        cleared,
        unknown,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `캐시 삭제 실패: ${error.message}`,
      });
    }
  }
}

module.exports = new InternalCacheController();
