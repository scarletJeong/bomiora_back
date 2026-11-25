const pool = require('../../../../config/database');
const { visibleTitleSql, likeContainsPattern, likeEscapeSql } = require('../../../../utils/visibleSearchSql');

class AnnouncementRepository {
  _buildWhereClause({ useKeyword = false }) {
    if (useKeyword) {
      return `WHERE n.is_deleted = 0 AND (n.title LIKE ? ${likeEscapeSql} OR n.content LIKE ? ${likeEscapeSql})`;
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
    const keyword = likeContainsPattern(query);
    const useKeyword = String(query || '').trim().length > 0;
    const whereSql = this._buildWhereClause({ useKeyword });
    const whereParams = useKeyword ? [keyword, keyword] : [];

    const [countResult, listResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total FROM bm_notice n ${whereSql}`,
        whereParams
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
          ORDER BY n.is_notice DESC, n.created_at DESC, n.id DESC
          LIMIT ? OFFSET ?`,
        [...whereParams, safeSize, offset]
      ),
    ]);

    return {
      total: Number(countResult[0]?.[0]?.total || 0),
      page: safePage,
      size: safeSize,
      rows: listResult[0],
    };
  }

  async searchByTitle(query, limit = 20, offset = 0) {
    const keyword = likeContainsPattern(query);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20;
    const safeOffset = Number.isFinite(Number(offset)) ? Math.max(0, Math.floor(Number(offset))) : 0;
    const [[countRows], [rows]] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total
           FROM bm_notice n
          WHERE n.is_deleted = 0 AND ${visibleTitleSql('n.title')} LIKE ? ${likeEscapeSql}`,
        [keyword]
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
          WHERE n.is_deleted = 0 AND ${visibleTitleSql('n.title')} LIKE ? ${likeEscapeSql}
          ORDER BY n.is_notice DESC, n.created_at DESC, n.id DESC
          LIMIT ? OFFSET ?`,
        [keyword, safeLimit, safeOffset]
      ),
    ]);
    return {
      rows,
      total: Number(countRows?.[0]?.total || 0),
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

  _noticeFlag(value) {
    if (Buffer.isBuffer(value)) return value.length && value[0] ? 1 : 0;
    return Number(value) === 1 ? 1 : 0;
  }

  /**
   * 목록과 같은 순서(고정공지 우선, 작성일 최신, id)에서 바로 위·아래 글.
   * 한 페이지 안의 이웃이 아니다.
   */
  async findAdjacentByIdFast(id, current = null) {
    const cur = current || (await this.findById(id));
    if (!cur) return { prev: null, next: null };

    const createdAt = cur.created_at;
    const curId = Number(cur.id);
    const notice = this._noticeFlag(cur.is_notice);
    const [[prevRows], [nextRows]] = await Promise.all([
      pool.query(
        `SELECT id, title FROM bm_notice
          WHERE is_deleted = 0
            AND (
              IFNULL(is_notice, 0) > ?
              OR (
                IFNULL(is_notice, 0) = ?
                AND (
                  created_at > ?
                  OR (created_at = ? AND id > ?)
                )
              )
            )
          ORDER BY IFNULL(is_notice, 0) ASC, created_at ASC, id ASC
          LIMIT 1`,
        [notice, notice, createdAt, createdAt, curId]
      ),
      pool.query(
        `SELECT id, title FROM bm_notice
          WHERE is_deleted = 0
            AND (
              IFNULL(is_notice, 0) < ?
              OR (
                IFNULL(is_notice, 0) = ?
                AND (
                  created_at < ?
                  OR (created_at = ? AND id < ?)
                )
              )
            )
          ORDER BY IFNULL(is_notice, 0) DESC, created_at DESC, id DESC
          LIMIT 1`,
        [notice, notice, createdAt, createdAt, curId]
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
