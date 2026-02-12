const pool = require('../../../../config/database');

class EventRepository {
  async findActiveEvents() {
    const [rows] = await pool.query(
      `SELECT * FROM bomiora_write_event
       WHERE ca_name = '진행중인 이벤트'
       ORDER BY wr_num DESC`
    );
    return rows;
  }

  async findEndedEvents() {
    const [rows] = await pool.query(
      `SELECT * FROM bomiora_write_event
       WHERE ca_name IS NULL OR ca_name != '진행중인 이벤트'
       ORDER BY wr_num ASC`
    );
    return rows;
  }

  async findByWrId(wrId) {
    const [rows] = await pool.query('SELECT * FROM bomiora_write_event WHERE wr_id = ? LIMIT 1', [wrId]);
    return rows.length ? rows[0] : null;
  }

  async increaseHit(wrId, current) {
    await pool.query('UPDATE bomiora_write_event SET wr_hit = ? WHERE wr_id = ?', [Number(current || 0) + 1, wrId]);
  }
}

module.exports = new EventRepository();
