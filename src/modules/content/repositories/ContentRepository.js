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

    // 홈/카드용 소량 목록: COUNT RTT 생략 (total ≈ 추정)
    const skipCount =
      safePage === 1 &&
      !useQuery &&
      !useCategory &&
      safeSize <= 8;

    const listSql = `
      SELECT
          id,
          CAST(category AS CHAR) AS category,
          CAST(title AS CHAR) AS title,
          CAST(thumbnail AS CHAR) AS thumbnail_url,
          LEFT(content, 200) AS content_html,
          is_notice,
          is_published,
          view_count,
          recommend_count,
          sort_order,
          CAST(writer_name AS CHAR) AS writer_name,
          created_at
       FROM bm_content
       ${whereSql}
       ORDER BY is_notice DESC, sort_order ASC, id DESC
       LIMIT ? OFFSET ?`;

    if (skipCount) {
      const [rows] = await pool.query(listSql, [...params, safeSize, offset]);
      const total =
        rows.length < safeSize ? rows.length : Math.max(rows.length, safeSize + 1);
      return {
        rows,
        total,
        page: safePage,
        size: safeSize,
        categories: [],
      };
    }

    const [[countRows], [rows]] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total FROM bm_content ${whereSql}`,
        params
      ),
      pool.query(listSql, [...params, safeSize, offset]),
    ]);

    return {
      rows,
      total: Number(countRows?.[0]?.total || 0),
      page: safePage,
      size: safeSize,
      categories: [],
    };
  }

  async findById(id) {
    const [rows] = await pool.query(
      `SELECT
          id,
          CAST(category AS CHAR) AS category,
          CAST(title AS CHAR) AS title,
          CAST(thumbnail AS CHAR) AS thumbnail_url,
          content AS content_html,
          is_notice,
          is_published,
          view_count,
          recommend_count,
          sort_order,
          CAST(writer_name AS CHAR) AS writer_name,
          CAST(created_by AS CHAR) AS created_by,
          created_at,
          CAST(updated_by AS CHAR) AS updated_by,
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

  async incrementRecommend(id) {
    await pool.query(
      `UPDATE bm_content
          SET recommend_count = recommend_count + 1
        WHERE id = ?
          AND is_deleted = 0`,
      [id]
    );
  }

  /**
   * 콘텐츠 추천 이력 — 회원(mb_id) + 문진 프로필(pf_no, 없으면 0)당 글당 1회
   * @returns {Promise<boolean>} true: 신규 반영(카운트 증가), false: 이미 추천함
   */
  async tryRecordRecommendAndIncrement(contentId, mbId, pfNo) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [ins] = await connection.query(
        `INSERT INTO bm_content_recommend_log (content_id, mb_id, pf_no)
         VALUES (?, ?, ?)`,
        [contentId, mbId, pfNo]
      );
      if (ins.affectedRows !== 1) {
        await connection.rollback();
        return false;
      }
      const [up] = await connection.query(
        `UPDATE bm_content
            SET recommend_count = recommend_count + 1
          WHERE id = ?
            AND is_deleted = 0`,
        [contentId]
      );
      if (up.affectedRows !== 1) {
        await connection.rollback();
        return false;
      }
      await connection.commit();
      return true;
    } catch (e) {
      await connection.rollback();
      if (e && (e.code === 'ER_DUP_ENTRY' || e.errno === 1062)) {
        return false;
      }
      throw e;
    } finally {
      connection.release();
    }
  }

  /**
   * 상세/목록 — 해당 회원·프로필이 이 글을 추천했는지
   */
  async hasUserRecommended(contentId, mbId, pfNo) {
    const [rows] = await pool.query(
      `SELECT 1 AS ok
         FROM bm_content_recommend_log
        WHERE content_id = ?
          AND mb_id = ?
          AND pf_no = ?
        LIMIT 1`,
      [contentId, mbId, pfNo]
    );
    return rows.length > 0;
  }

  /** pf_no > 0 일 때 해당 회원 소유 문진인지 */
  async isProfileOwnedByMember(pfNo, mbId) {
    if (!pfNo || pfNo <= 0) return true;
    const [rows] = await pool.query(
      `SELECT 1 AS ok
         FROM bomiora_member_health_profiles
        WHERE pf_no = ?
          AND mb_id = ?
        LIMIT 1`,
      [pfNo, mbId]
    );
    return rows.length > 0;
  }

  /**
   * 이전/다음 글 — 현재 행을 JOIN 해 id만으로 조회 (상세 findById와 병렬 가능).
   * 목록과 동일 정렬(is_notice DESC, sort_order ASC, id DESC).
   */
  async findAdjacentById(id) {
    const curId = Number(id);
    const [[prevRows], [nextRows]] = await Promise.all([
      pool.query(
        `SELECT p.id, CAST(p.title AS CHAR) AS title
           FROM bm_content p
           INNER JOIN bm_content c ON c.id = ?
          WHERE p.is_deleted = 0
            AND p.is_published = 1
            AND (
              TRIM(IFNULL(c.category, '')) = ''
              OR TRIM(IFNULL(c.category, '')) = '전체'
              OR REPLACE(p.category, ' ', '') = REPLACE(c.category, ' ', '')
            )
            AND (
              p.is_notice > c.is_notice
              OR (p.is_notice = c.is_notice AND p.sort_order < c.sort_order)
              OR (p.is_notice = c.is_notice AND p.sort_order = c.sort_order AND p.id > c.id)
            )
          ORDER BY p.is_notice ASC, p.sort_order DESC, p.id ASC
          LIMIT 1`,
        [curId]
      ),
      pool.query(
        `SELECT p.id, CAST(p.title AS CHAR) AS title
           FROM bm_content p
           INNER JOIN bm_content c ON c.id = ?
          WHERE p.is_deleted = 0
            AND p.is_published = 1
            AND (
              TRIM(IFNULL(c.category, '')) = ''
              OR TRIM(IFNULL(c.category, '')) = '전체'
              OR REPLACE(p.category, ' ', '') = REPLACE(c.category, ' ', '')
            )
            AND (
              p.is_notice < c.is_notice
              OR (p.is_notice = c.is_notice AND p.sort_order > c.sort_order)
              OR (p.is_notice = c.is_notice AND p.sort_order = c.sort_order AND p.id < c.id)
            )
          ORDER BY p.is_notice DESC, p.sort_order ASC, p.id DESC
          LIMIT 1`,
        [curId]
      ),
    ]);

    return {
      prev: prevRows[0] || null,
      next: nextRows[0] || null,
    };
  }
}

module.exports = new ContentRepository();

