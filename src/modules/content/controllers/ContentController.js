const contentRepository = require('../repositories/ContentRepository');

class ContentController {
  normalizeText(value) {
    if (value == null) return null;
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    if (
      typeof value === 'object' &&
      value.type === 'Buffer' &&
      Array.isArray(value.data)
    ) {
      return Buffer.from(value.data).toString('utf8');
    }
    return String(value);
  }

  toMap(row) {
    const contentHtml = this.normalizeText(row.content_html) || '';
    const summary = this.buildSummary(contentHtml);
    return {
      id: row.id,
      category: this.normalizeText(row.category),
      title: this.normalizeText(row.title),
      summary,
      thumbnail_url: this.normalizeText(row.thumbnail_url),
      content_html: contentHtml,
      is_notice: Number(row.is_notice || 0) === 1,
      is_published: Number(row.is_published || 0) === 1,
      published_at: row.published_at ? String(row.published_at) : null,
      view_count: Number(row.view_count || 0),
      recommend_count:
        row.recommend_count == null || row.recommend_count === ''
          ? 0
          : Number(row.recommend_count) || 0,
      sort_order: Number(row.sort_order || 0),
      writer_name: this.normalizeText(row.writer_name),
      created_by: this.normalizeText(row.created_by),
      created_at: row.created_at ? String(row.created_at) : null,
      updated_by: this.normalizeText(row.updated_by),
      updated_at: row.updated_at ? String(row.updated_at) : null,
    };
  }

  buildSummary(contentHtml) {
    const plain = String(contentHtml || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!plain) return '';
    return plain.length > 120 ? `${plain.slice(0, 120)}...` : plain;
  }

  async getList(req, res) {
    try {
      const page = Number(req.query.page || 1);
      const size = Number(req.query.size || 20);
      const query = req.query.query || '';
      const category = req.query.category || '전체';

      const result = await contentRepository.findList({
        page,
        size,
        query,
        category,
      });

      return res.json({
        success: true,
        data: result.rows.map((row) => this.toMap(row)),
        categories: ['전체', ...result.categories],
        pagination: {
          total: result.total,
          page: result.page,
          size: result.size,
          totalPages:
            result.size > 0 ? Math.ceil(result.total / result.size) : 0,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `콘텐츠 목록 조회 실패: ${error.message}`,
      });
    }
  }

  parsePfNo(value) {
    if (value === undefined || value === null || value === '') return 0;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }

  async postRecommend(req, res) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: '유효한 콘텐츠 ID가 아닙니다.',
        });
      }
      const mbId = String(req.body?.mb_id ?? '').trim();
      if (!mbId) {
        return res.status(400).json({
          success: false,
          message: '로그인 후 추천할 수 있습니다.',
        });
      }
      const pfNo = this.parsePfNo(req.body?.pf_no);
      const row = await contentRepository.findById(id);
      if (!row) {
        return res.status(404).json({
          success: false,
          message: '콘텐츠를 찾을 수 없습니다.',
        });
      }
      if (pfNo > 0) {
        const ok = await contentRepository.isProfileOwnedByMember(pfNo, mbId);
        if (!ok) {
          return res.status(403).json({
            success: false,
            message: '문진(프로필) 정보가 올바르지 않습니다.',
          });
        }
      }
      const inserted = await contentRepository.tryRecordRecommendAndIncrement(
        id,
        mbId,
        pfNo
      );
      const updated = await contentRepository.findById(id);
      const count = Number(updated?.recommend_count ?? row.recommend_count ?? 0);
      if (!inserted) {
        return res.json({
          success: false,
          recommend_count: count,
          already_recommended: true,
          message: '이미 추천한 글입니다.',
        });
      }
      return res.json({
        success: true,
        recommend_count: count,
        message: '추천해 주셔서 감사합니다.',
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `추천 처리 실패: ${error.message}`,
      });
    }
  }

  async getDetail(req, res) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res
          .status(400)
          .json({ success: false, message: '유효한 콘텐츠 ID가 아닙니다.' });
      }

      const row = await contentRepository.findById(id);
      if (!row) {
        return res
          .status(404)
          .json({ success: false, message: '콘텐츠를 찾을 수 없습니다.' });
      }

      await contentRepository.increaseHit(id);
      const updated = await contentRepository.findById(id);
      const adjacent = await contentRepository.findAdjacentById(id);

      const mbIdQ = String(req.query.mb_id || '').trim();
      const pfNoQ = this.parsePfNo(req.query.pf_no);
      let userRecommended;
      if (mbIdQ) {
        userRecommended = await contentRepository.hasUserRecommended(
          id,
          mbIdQ,
          pfNoQ
        );
      }

      const baseData = this.toMap(updated || row);
      if (mbIdQ) {
        baseData.user_recommended = userRecommended;
      }

      return res.json({
        success: true,
        data: baseData,
        prev: adjacent.prev
          ? {
              id: adjacent.prev.id,
              title: this.normalizeText(adjacent.prev.title),
            }
          : null,
        next: adjacent.next
          ? {
              id: adjacent.next.id,
              title: this.normalizeText(adjacent.next.title),
            }
          : null,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `콘텐츠 상세 조회 실패: ${error.message}`,
      });
    }
  }
}

module.exports = new ContentController();

