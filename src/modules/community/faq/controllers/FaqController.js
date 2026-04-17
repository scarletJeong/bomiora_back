const faqRepository = require('../repositories/FaqRepository');

class FaqController {
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
      category: this.normalizeText(row.category),
      question: this.normalizeText(row.question),
      answer: this.normalizeText(row.answer),
      view_count: Number(row.view_count || 0),
      writer_name: this.normalizeText(row.writer_name),
      created_by: this.normalizeText(row.created_by),
      created_at: row.created_at ? String(row.created_at) : null,
      updated_by: this.normalizeText(row.updated_by),
      updated_at: row.updated_at ? String(row.updated_at) : null,
    };
  }

  async getList(req, res) {
    try {
      const page = Number(req.query.page || 1);
      const size = Number(req.query.size || 20);
      const query = req.query.query || '';
      const category = req.query.category || '전체';

      const result = await faqRepository.findList({ page, size, query, category });
      return res.json({
        success: true,
        data: result.rows.map((row) => this.toMap(row)),
        categories: ['전체', ...result.categories],
        pagination: {
          total: result.total,
          page: result.page,
          size: result.size,
          totalPages: result.size > 0 ? Math.ceil(result.total / result.size) : 0,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `FAQ 목록 조회 실패: ${error.message}`,
      });
    }
  }

  async getDetail(req, res) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ success: false, message: '유효한 FAQ ID가 아닙니다.' });
      }

      const row = await faqRepository.findById(id);
      if (!row) {
        return res.status(404).json({ success: false, message: 'FAQ를 찾을 수 없습니다.' });
      }

      await faqRepository.increaseHit(id);
      const updated = await faqRepository.findById(id);
      return res.json({ success: true, data: this.toMap(updated || row) });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `FAQ 상세 조회 실패: ${error.message}`,
      });
    }
  }
}

module.exports = new FaqController();
