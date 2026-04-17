const pool = require('../../../config/database');

class ContentRepository {
  async findList({ page = 1, size = 20, query = '', category = '전체' }) {
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeSize = Number.isFinite(size) && size > 0 ? size : 20;
    const offset = (safePage - 1) * safeSize;

    const keyword = `%${String(query || '').trim()}%`;
    const normalizedCategory = String(category || '').trim();
    const useQuery = String(query || '').trim().length > 0;
    const useCategory =
      normalizedCategory.length > 0 && normalizedCategory !== '전체';

    const whereParts = ['is_deleted = 0', 'is_published = 1'];
    const params = [];

    if (useCategory) {
      whereParts.push("REPLACE(category, ' ', '') = REPLACE(?, ' ', '')");
      params.push(normalizedCategory);
    }

    if (useQuery) {
      whereParts.push('(title LIKE ? OR content LIKE ?)');
      params.push(keyword, keyword);
    }

    const whereSql = `WHERE ${whereParts.join(' AND ')}`;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM bm_content
         ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT
          id,
          category,
          title,
          thumbnail AS thumbnail_url,
          content AS content_html,
          is_notice,
          is_published,
          view_count,
          sort_order,
          writer_name,
          created_by,
          created_at,
          updated_by,
          updated_at,
          NULL AS published_at
       FROM bm_content
       ${whereSql}
       ORDER BY is_notice DESC, sort_order ASC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, safeSize, offset]
    );

    const [categoryRows] = await pool.query(
      `SELECT category_name
       FROM bm_category
       WHERE grp = 'content'
         AND is_use = 1
         AND is_deleted = 0
       ORDER BY id ASC`
    );

    return {
      rows,
      total: Number(countRows?.[0]?.total || 0),
      page: safePage,
      size: safeSize,
      categories: categoryRows
        .map((r) => (r?.category_name == null ? '' : String(r.category_name).trim()))
        .filter((s) => s.length > 0),
    };
  }

  async findById(id) {
    const [rows] = await pool.query(
      `SELECT
          id,
          category,
          title,
          thumbnail AS thumbnail_url,
          content AS content_html,
          is_notice,
          is_published,
          view_count,
          sort_order,
          writer_name,
          created_by,
          created_at,
          updated_by,
          updated_at,
          NULL AS published_at
       FROM bm_content
       WHERE id = ?
         AND is_deleted = 0
         AND is_published = 1
       LIMIT 1`,
      [id]
    );
    return rows.length ? rows[0] : null;
  }

  async increaseHit(id) {
    await pool.query(
      `UPDATE bm_content
          SET view_count = view_count + 1
        WHERE id = ?
          AND is_deleted = 0`,
      [id]
    );
  }

  async findAdjacentById(id) {
    const [rows] = await pool.query(
      `SELECT id, title
       FROM bm_content
       WHERE is_deleted = 0
         AND is_published = 1
       ORDER BY is_notice DESC, sort_order ASC, id DESC`
    );

    const index = rows.findIndex((r) => Number(r.id) === Number(id));
    if (index < 0) {
      return { prev: null, next: null };
    }

    const prev = index > 0 ? rows[index - 1] : null;
    const next = index < rows.length - 1 ? rows[index + 1] : null;
    return { prev, next };
  }
}

module.exports = new ContentRepository();

