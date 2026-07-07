const pool = require('../../../../config/database');

class EventRepository {
  async findActiveEvents() {
    const [rows] = await pool.query(
      `SELECT
          id,
          title,
          content,
          writer_name,
          image_path,
          begin_time,
          end_time,
          is_use,
          view_count,
          created_by,
          created_at,
          updated_by,
          updated_at
        FROM bm_event
        WHERE begin_time <= NOW()
          AND end_time >= NOW()
        ORDER BY created_at DESC, id DESC`
    );
    return rows;
  }

  async findEndedEvents() {
    const [rows] = await pool.query(
      `SELECT
          id,
          title,
          content,
          writer_name,
          image_path,
          begin_time,
          end_time,
          is_use,
          view_count,
          created_by,
          created_at,
          updated_by,
          updated_at
        FROM bm_event
        WHERE end_time < NOW()
        ORDER BY end_time DESC, id DESC`
    );
    return rows;
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
          is_use,
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
