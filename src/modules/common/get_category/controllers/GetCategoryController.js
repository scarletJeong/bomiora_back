const getCategoryRepository = require('../repositories/GetCategoryRepository');

class GetCategoryController {
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
      grp: this.normalizeText(row.grp),
      category_name: this.normalizeText(row.category_name),
      is_use: Number(row.is_use || 0),
      created_by: this.normalizeText(row.created_by),
      created_at: row.created_at ? String(row.created_at) : null,
      updated_by: this.normalizeText(row.updated_by),
      updated_at: row.updated_at ? String(row.updated_at) : null,
    };
  }

  async getByGroup(req, res) {
    try {
      const grp = String(req.query.grp || '').trim();
      if (!grp) {
        return res.status(400).json({
          success: false,
          message: 'grp 파라미터가 필요합니다.',
        });
      }

      const rows = await getCategoryRepository.findByGroup(grp);
      return res.json({
        success: true,
        data: rows.map((row) => this.toMap(row)),
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `카테고리 목록 조회 실패: ${error.message}`,
      });
    }
  }
}

module.exports = new GetCategoryController();
