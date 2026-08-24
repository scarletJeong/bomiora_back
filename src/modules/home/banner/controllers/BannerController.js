const bannerRepository = require('../repositories/BannerRepository');
const { TtlCache } = require('../../../../utils/ttlCache');

const bannerCache = new TtlCache(90_000);

class BannerController {
  toMap(row, platform) {
    const usePc = platform === 'pc';
    const imagePath = usePc ? row.pc_image : row.mo_image;
    const fallbackPath = usePc ? row.mo_image : row.pc_image;
    const image = String(imagePath || '').trim() || String(fallbackPath || '').trim();

    return {
      id: row.id,
      title: String(row.title || '').trim(),
      linkUrl: String(row.link_url || '').trim(),
      imageUrl: image,
      pcImage: String(row.pc_image || '').trim(),
      moImage: String(row.mo_image || '').trim(),
      placement: String(row.placement || 'main').trim(),
      targetKind: String(row.target_kind || 'all').trim(),
      sortOrder: Number(row.sort_order || 0),
    };
  }

  resolvePlacement(raw) {
    const value = String(raw || 'main').trim().toLowerCase();
    return value === 'list' ? 'list' : 'main';
  }

  resolveTargetKind(raw, placement) {
    if (placement !== 'list') return null;
    const value = String(raw || 'prescription').trim().toLowerCase();
    if (value === 'general' || value === 'prescription') return value;
    return 'prescription';
  }

  async getActiveList(req, res) {
    try {
      const platform = String(req.query.platform || 'mobile').toLowerCase() === 'pc'
        ? 'pc'
        : 'mobile';
      const placement = this.resolvePlacement(req.query.placement);
      const targetKind = this.resolveTargetKind(
        req.query.target_kind ?? req.query.targetKind,
        placement
      );

      const cacheKey = `banner:${platform}:${placement}:${targetKind || ''}`;
      const payload = await bannerCache.getOrSet(cacheKey, async () => {
        const rows = await bannerRepository.findActiveList({
          placement,
          targetKind,
        });
        const data = rows
          .map((row) => this.toMap(row, platform))
          .filter((row) => row.imageUrl.length > 0);
        return { success: true, data };
      });

      res.set('Cache-Control', 'public, max-age=30');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `배너 조회 실패: ${error.message}`,
      });
    }
  }
}

module.exports = new BannerController();
