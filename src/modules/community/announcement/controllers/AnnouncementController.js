const announcementRepository = require('../repositories/AnnouncementRepository');
const imageProxyController = require('../../../common/imageProxy/controllers/ImageProxyController');
const { TtlCache } = require('../../../../utils/ttlCache');
const { registerPublicCache } = require('../../../internal/cache/publicCacheRegistry');

const announcementListCache = new TtlCache(300_000);
const announcementDetailCache = new TtlCache(180_000);
registerPublicCache('announcement', announcementListCache);
registerPublicCache('announcement', announcementDetailCache);

class AnnouncementController {
  async listPayload(page, size, query = '') {
    const cacheKey = `list:${page}:${size}:${String(query).trim()}`;
    const payload = await announcementListCache.getOrSetStale(cacheKey, async () => {
      const result = await announcementRepository.findList({ page, size, query });
      return {
        success: true,
        data: result.rows.map((row) => this.toMap(row)),
        pagination: {
          total: result.total,
          page: result.page,
          size: result.size,
          totalPages: result.size > 0 ? Math.ceil(result.total / result.size) : 0,
        },
      };
    });
    this.primeDetailCaches(payload.data);
    return payload;
  }

  primeDetailCaches(items) {
    if (!Array.isArray(items)) return;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item?.id) continue;
      announcementDetailCache.set(`detail:${item.id}`, {
        success: true,
        data: item,
        prev: i > 0
          ? { id: items[i - 1].id, title: items[i - 1].title }
          : null,
        next: i + 1 < items.length
          ? { id: items[i + 1].id, title: items[i + 1].title }
          : null,
      });
    }
  }

  announcementImageUrl(raw) {
    const value = String(raw || '').trim().replace(/^\/+/, '');
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    const path = value.toLowerCase().startsWith('data/')
      ? value
      : `data/${value}`;
    return `https://bomiora0.mycafe24.com/${path}`;
  }

  async warmPublicCaches() {
    const payload = await this.listPayload(1, 10, '');
    for (const item of payload.data || []) {
      const url = this.announcementImageUrl(item.image_path);
      if (url) imageProxyController.warmThumb(url, 1200).catch(() => {});
    }
  }

  normalizeText(value) {
    if (value == null) return null;
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    if (typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
      return Buffer.from(value.data).toString('utf8');
    }
    return String(value);
  }

  toMap(row) {
    return {
      id: row.id,
      title: this.normalizeText(row.title),
      content: this.normalizeText(row.content),
      view_count: Number(row.view_count || 0),
      is_notice: Number(row.is_notice || 0) === 1,
      writer_name: this.normalizeText(row.writer_name),
      created_at: row.created_at ? String(row.created_at) : null,
      created_by: this.normalizeText(row.created_by),
      updated_at: row.updated_at ? String(row.updated_at) : null,
      updated_by: this.normalizeText(row.updated_by),
      image_path: this.normalizeText(row.image_path),
    };
  }

  async getList(req, res) {
    try {
      const page = Number(req.query.page || 1);
      const size = Number(req.query.size || 10);
      const query = req.query.query || '';
      const payload = await this.listPayload(page, size, query);

      res.set('Cache-Control', 'public, max-age=30');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `공지사항 목록 조회 실패: ${error.message}`,
      });
    }
  }

  async getDetail(req, res) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ success: false, message: '유효한 공지 ID가 아닙니다.' });
      }

      const payload = await announcementDetailCache.getOrSetStale(`detail:${id}`, async () => {
        const row = await announcementRepository.findById(id);
        if (!row) {
          return { success: false, status: 404, message: '공지사항을 찾을 수 없습니다.' };
        }
        const adjacent = await announcementRepository.findAdjacentByIdFast(id, row);
        return {
          success: true,
          data: this.toMap(row),
          prev: adjacent.prev
            ? { id: adjacent.prev.id, title: this.normalizeText(adjacent.prev.title) }
            : null,
          next: adjacent.next
            ? { id: adjacent.next.id, title: this.normalizeText(adjacent.next.title) }
            : null,
        };
      });

      if (payload.status === 404 || payload.success === false) {
        return res.status(404).json({
          success: false,
          message: payload.message || '공지사항을 찾을 수 없습니다.',
        });
      }

      announcementRepository.increaseHit(id).catch(() => {});
      const data = {
        ...payload.data,
        view_count: Number(payload.data?.view_count || 0) + 1,
      };
      res.set('Cache-Control', 'public, max-age=60');
      return res.json({ ...payload, data });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `공지사항 상세 조회 실패: ${error.message}`,
      });
    }
  }
}

module.exports = new AnnouncementController();
