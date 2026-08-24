const announcementRepository = require('../repositories/AnnouncementRepository');
const { TtlCache } = require('../../../../utils/ttlCache');

const announcementListCache = new TtlCache(90_000);
const announcementDetailCache = new TtlCache(180_000);

class AnnouncementController {
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
      const cacheKey = `list:${page}:${size}:${String(query).trim()}`;

      const payload = await announcementListCache.getOrSet(cacheKey, async () => {
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

      const payload = await announcementDetailCache.getOrSet(`detail:${id}`, async () => {
        // 상세 본문 1쿼리만 — prev/next는 목록에서 이동 (Cafe24 RTT 절약)
        const row = await announcementRepository.findById(id);
        if (!row) {
          return { success: false, status: 404, message: '공지사항을 찾을 수 없습니다.' };
        }
        return {
          success: true,
          data: this.toMap(row),
          prev: null,
          next: null,
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
