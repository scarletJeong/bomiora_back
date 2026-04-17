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

      return res.json({
        success: true,
        data: this.toMap(updated || row),
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

