const pool = require('../../../../config/database');

class AnnouncementRepository {
  _buildWhereClause({ useKeyword = false }) {
    if (useKeyword) {
      return 'WHERE n.is_deleted = 0 AND (n.title LIKE ? OR n.content LIKE ?)';
    }
    return 'WHERE n.is_deleted = 0';
  }

  _topNoticeGuardSql() {
    return `(
      n.is_notice = 0 OR (
        SELECT COUNT(*)
        FROM bm_notice nn
        WHERE nn.is_deleted = 0
          AND nn.is_notice = 1
          AND (
            nn.created_at > n.created_at OR
            (nn.created_at = n.created_at AND nn.id >= n.id)
          )
      ) <= 3
    )`;
  }

  async findList({ page = 1, size = 10, query = '' }) {
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeSize = Number.isFinite(size) && size > 0 ? size : 10;
    const offset = (safePage - 1) * safeSize;
    const keyword = `%${String(query || '').trim()}%`;
    const useKeyword = String(query || '').trim().length > 0;

    const whereSql = this._buildWhereClause({ useKeyword });
    const topNoticeGuard = this._topNoticeGuardSql();

    const countParams = useKeyword ? [keyword, keyword] : [];
    const listParams = useKeyword
      ? [keyword, keyword, safeSize, offset]
      : [safeSize, offset];

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM bm_notice n
         ${whereSql}
         AND ${topNoticeGuard}`,
      countParams
    );

    const [rows] = await pool.query(
      `SELECT
          n.id,
          n.title,
          n.content,
          n.view_count,
          n.is_notice,
          n.writer_name,
          n.created_at,
          n.created_by,
          n.updated_at,
          n.updated_by,
          n.image_path
        FROM bm_notice n
        ${whereSql}
        AND ${topNoticeGuard}
        ORDER BY n.is_notice DESC, n.created_at DESC, n.id DESC
        LIMIT ? OFFSET ?`,
      listParams
    );

    return {
      total: Number(countRows?.[0]?.total || 0),
      page: safePage,
      size: safeSize,
      rows,
    };
  }

  async findById(id) {
    const [rows] = await pool.query(
      `SELECT
          id,
          title,
          content,
          view_count,
          is_notice,
          writer_name,
          created_at,
          created_by,
          updated_at,
          updated_by,
          image_path
        FROM bm_notice
        WHERE id = ? AND is_deleted = 0
        LIMIT 1`,
      [id]
    );
    return rows.length ? rows[0] : null;
  }

  async increaseHit(id) {
    await pool.query(
      'UPDATE bm_notice SET view_count = view_count + 1 WHERE id = ? AND is_deleted = 0',
      [id]
    );
  }

  async findAdjacentById(id) {
    const [rows] = await pool.query(
      `SELECT n.id, n.title
       FROM bm_notice n
       WHERE n.is_deleted = 0
         AND ${this._topNoticeGuardSql()}
       ORDER BY n.is_notice DESC, n.created_at DESC, n.id DESC`
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

module.exports = new AnnouncementRepository();
