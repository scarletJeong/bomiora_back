const pool = require('../../../../config/database');

class FaqRepository {
  async findList({ page = 1, size = 20, query = '', category = '전체' }) {
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeSize = Number.isFinite(size) && size > 0 ? size : 20;
    const offset = (safePage - 1) * safeSize;

    const keyword = `%${String(query || '').trim()}%`;
    const normalizedCategory = String(category || '').trim();
    const useQuery = String(query || '').trim().length > 0;
    const useCategory =
      normalizedCategory.isNotEmpty && normalizedCategory !== '전체';

    const whereParts = ['is_deleted = 0'];
    const params = [];
    if (useCategory) {
      whereParts.push('category = ?');
      params.push(normalizedCategory);
    }
    if (useQuery) {
      whereParts.push('(question LIKE ? OR answer LIKE ?)');
      params.push(keyword, keyword);
    }
    const whereSql = `WHERE ${whereParts.join(' AND ')}`;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM bm_faq
         ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT
          id,
          category,
          question,
          answer,
          view_count,
          writer_name,
          created_by,
          created_at,
          updated_by,
          updated_at
       FROM bm_faq
       ${whereSql}
       ORDER BY sort_order ASC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, safeSize, offset]
    );

    const [categoryRows] = await pool.query(
      `SELECT DISTINCT category
         FROM bm_faq
         WHERE is_deleted = 0
         ORDER BY category ASC`
    );

    return {
      rows,
      total: Number(countRows?.[0]?.total || 0),
      page: safePage,
      size: safeSize,
      categories: categoryRows
        .map((r) => (r?.category == null ? '' : String(r.category).trim()))
        .filter((s) => s.isNotEmpty),
    };
  }

  async findById(id) {
    const [rows] = await pool.query(
      `SELECT
          id,
          category,
          question,
          answer,
          view_count,
          writer_name,
          created_by,
          created_at,
          updated_by,
          updated_at
       FROM bm_faq
       WHERE id = ? AND is_deleted = 0
       LIMIT 1`,
      [id]
    );
    return rows.length ? rows[0] : null;
  }

  async increaseHit(id) {
    await pool.query(
      `UPDATE bm_faq
          SET view_count = view_count + 1
        WHERE id = ? AND is_deleted = 0`,
      [id]
    );
  }
}

module.exports = new FaqRepository();
