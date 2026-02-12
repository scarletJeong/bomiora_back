const pool = require('../../../../config/database');

class PointRepository {
  async findLatestMbPointByUserId(userId) {
    const [rows] = await pool.query(
      'SELECT po_mb_point FROM bomiora_point WHERE mb_id = ? ORDER BY po_datetime DESC, po_id DESC LIMIT 1',
      [userId]
    );
    return rows.length ? rows[0].po_mb_point : null;
  }

  async findHistoryByUserId(userId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_point WHERE mb_id = ? ORDER BY po_datetime DESC, po_id DESC',
      [userId]
    );
    return rows;
  }
}

module.exports = new PointRepository();
