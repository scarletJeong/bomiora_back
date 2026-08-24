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
      n.is_notice = 0 OR n.id IN (
        SELECT id FROM (
          SELECT id FROM bm_notice
           WHERE is_deleted = 0 AND is_notice = 1
           ORDER BY created_at DESC, id DESC
           LIMIT 3
        ) pinned
      )
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

    const [[countRows], [rows]] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total
           FROM bm_notice n
           ${whereSql}
           AND ${topNoticeGuard}`,
        countParams
      ),
      pool.query(
        `SELECT
            n.id,
            n.title,
            NULL AS content,
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
      ),
    ]);

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

  /** 상세용 — 공지 고정 가드 없이 created_at/id 기준 prev·next (빠름) */
  async findAdjacentByIdFast(id, current = null) {
    const cur = current || (await this.findById(id));
    if (!cur) return { prev: null, next: null };

    const createdAt = cur.created_at;
    const curId = Number(cur.id);
    const [[prevRows], [nextRows]] = await Promise.all([
      pool.query(
        `SELECT id, title FROM bm_notice
          WHERE is_deleted = 0
            AND (
              created_at > ?
              OR (created_at = ? AND id > ?)
            )
          ORDER BY created_at ASC, id ASC
          LIMIT 1`,
        [createdAt, createdAt, curId]
      ),
      pool.query(
        `SELECT id, title FROM bm_notice
          WHERE is_deleted = 0
            AND (
              created_at < ?
              OR (created_at = ? AND id < ?)
            )
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
        [createdAt, createdAt, curId]
      ),
    ]);
    return {
      prev: prevRows[0] || null,
      next: nextRows[0] || null,
    };
  }

  async findAdjacentById(id, current = null) {
    return this.findAdjacentByIdFast(id, current);
  }
}

module.exports = new AnnouncementRepository();
