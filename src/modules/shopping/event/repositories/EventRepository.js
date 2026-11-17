const pool = require('../../../../config/database');
const { visibleTitleSql, likeContainsPattern, likeEscapeSql } = require('../../../../utils/visibleSearchSql');

const EVENT_LIST_COLUMNS = `
  id,
  title,
  writer_name,
  image_path,
  begin_time,
  end_time,
  sort_order,
  view_count,
  created_by,
  created_at,
  updated_by,
  updated_at
`;

class EventRepository {
  async findActiveEvents({ limit = 10, offset = 0 } = {}) {
    return this._findByPeriod({
      where: 'begin_time <= NOW() AND end_time >= NOW()',
      limit,
      offset,
    });
  }

  async findEndedEvents({ limit = 10, offset = 0 } = {}) {
    return this._findByPeriod({
      where: 'end_time < NOW()',
      limit,
      offset,
    });
  }

  async _findByPeriod({ where, limit, offset }) {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(50, Math.floor(limit)) : 10;
    const safeOffset = Number.isFinite(Number(offset)) ? Math.max(0, Math.floor(Number(offset))) : 0;
    const [countResult, listResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total
           FROM bm_event
          WHERE ${where}`
      ),
      pool.query(
        `SELECT ${EVENT_LIST_COLUMNS}
           FROM bm_event
          WHERE ${where}
          ORDER BY sort_order ASC, id ASC
          LIMIT ? OFFSET ?`,
        [safeLimit, safeOffset]
      ),
    ]);
    const total = Number(countResult[0]?.[0]?.total || 0);
    return { rows: listResult[0], total };
  }

  async searchByTitle(query, limit = 20, offset = 0) {
    const keyword = likeContainsPattern(query);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20;
    const safeOffset = Number.isFinite(Number(offset)) ? Math.max(0, Math.floor(Number(offset))) : 0;
    // 종료·시작 전 이벤트는 상세로 들어가지 않으므로 검색에서도 뺀다.
    const where = `${visibleTitleSql('title')} LIKE ? ${likeEscapeSql}
         AND DATE(begin_time) <= CURDATE()
         AND DATE(end_time) >= CURDATE()`;
    const [[countRows], [rows]] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total
           FROM bm_event
          WHERE ${where}`,
        [keyword]
      ),
      pool.query(
        `SELECT ${EVENT_LIST_COLUMNS}
           FROM bm_event
          WHERE ${where}
          ORDER BY sort_order ASC, id DESC
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
          writer_name,
          image_path,
          begin_time,
          end_time,
          sort_order,
          view_count,
          created_by,
          created_at,
          updated_by,
          updated_at
        FROM bm_event
        WHERE id = ?
        LIMIT 1`,
      [id]
    );
    return rows.length ? rows[0] : null;
  }

  async increaseViewCount(id) {
    await pool.query(
      'UPDATE bm_event SET view_count = view_count + 1 WHERE id = ?',
      [id]
    );
  }
}

module.exports = new EventRepository();
