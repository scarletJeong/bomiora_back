const pool = require('../../../../config/database');

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
  async findActiveEvents() {
    const [rows] = await pool.query(
      `SELECT ${EVENT_LIST_COLUMNS}
        FROM bm_event
        WHERE begin_time <= NOW()
          AND end_time >= NOW()
        ORDER BY sort_order ASC, id ASC
        LIMIT 20`
    );
    return rows;
  }

  async findEndedEvents() {
    const [rows] = await pool.query(
      `SELECT ${EVENT_LIST_COLUMNS}
        FROM bm_event
        WHERE end_time < NOW()
        ORDER BY sort_order ASC, id ASC
        LIMIT 50`
    );
    return rows;
  }

  async searchByTitle(query, limit = 20, offset = 0) {
    const keyword = `%${String(query || '').trim()}%`;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20;
    const safeOffset = Number.isFinite(Number(offset)) ? Math.max(0, Math.floor(Number(offset))) : 0;
    const [[countRows], [rows]] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total
           FROM bm_event
          WHERE title LIKE ?`,
        [keyword]
      ),
      pool.query(
        `SELECT ${EVENT_LIST_COLUMNS}
           FROM bm_event
          WHERE title LIKE ?
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
