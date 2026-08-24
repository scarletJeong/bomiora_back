const pool = require('../../../../config/database');

class HealthProfileRepository {
  async findByMbId(mbId) {
    const [rows] = await pool.query(
      `SELECT pf_no,
              CAST(mb_id AS CHAR) AS mb_id,
              CAST(answer_1 AS CHAR) AS answer_1,
              CAST(answer_2 AS CHAR) AS answer_2,
              CAST(answer_3 AS CHAR) AS answer_3,
              CAST(answer_4 AS CHAR) AS answer_4,
              CAST(answer_5 AS CHAR) AS answer_5,
              CAST(answer_6 AS CHAR) AS answer_6,
              CAST(answer_7 AS CHAR) AS answer_7,
              CAST(answer_8 AS CHAR) AS answer_8,
              CAST(answer_9 AS CHAR) AS answer_9,
              CAST(answer_10 AS CHAR) AS answer_10,
              CAST(answer_10_2 AS CHAR) AS answer_10_2,
              CAST(answer_11 AS CHAR) AS answer_11,
              CAST(answer_12 AS CHAR) AS answer_12,
              CAST(answer_13 AS CHAR) AS answer_13,
              CAST(answer_13_period AS CHAR) AS answer_13_period,
              CAST(answer_13_dosage AS CHAR) AS answer_13_dosage,
              CAST(answer_13_medicine AS CHAR) AS answer_13_medicine,
              CAST(answer_7_1 AS CHAR) AS answer_7_1,
              CAST(answer_13_sideeffect AS CHAR) AS answer_13_sideeffect,
              pf_wdatetime, pf_mdatetime,
              CAST(pf_ip AS CHAR) AS pf_ip,
              CAST(pf_memo AS CHAR) AS pf_memo
         FROM bomiora_member_health_profiles
        WHERE mb_id = ?
        LIMIT 1`,
      [mbId]
    );
    return rows.length ? rows[0] : null;
  }

  /** 콘텐츠 추천용 — pf_no 만 */
  async findPfNoByMbId(mbId) {
    const [rows] = await pool.query(
      'SELECT pf_no FROM bomiora_member_health_profiles WHERE mb_id = ? LIMIT 1',
      [mbId]
    );
    return rows.length ? Number(rows[0].pf_no) || 0 : 0;
  }

  async findByPfNoAndMbId(pfNo, mbId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_member_health_profiles WHERE pf_no = ? AND mb_id = ? LIMIT 1',
      [pfNo, mbId]
    );
    return rows.length ? rows[0] : null;
  }

  async existsByMbId(mbId) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bomiora_member_health_profiles WHERE mb_id = ?',
      [mbId]
    );
    return rows[0].count > 0;
  }

  async create(fields) {
    const [result] = await pool.query(
      `INSERT INTO bomiora_member_health_profiles
      (mb_id, answer_1, answer_2, answer_3, answer_4, answer_5, answer_6, answer_7, answer_8, answer_9,
       answer_10, answer_10_2, answer_11, answer_12, answer_13, answer_13_period, answer_13_dosage, answer_13_medicine, answer_7_1, answer_13_sideeffect, pf_ip, pf_memo, pf_wdatetime, pf_mdatetime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        fields.mb_id, fields.answer_1, fields.answer_2, fields.answer_3, fields.answer_4, fields.answer_5, fields.answer_6, fields.answer_7, fields.answer_8,
        fields.answer_9, fields.answer_10, fields.answer_10_2 ?? null, fields.answer_11, fields.answer_12, fields.answer_13, fields.answer_13_period, fields.answer_13_dosage,
        fields.answer_13_medicine, fields.answer_7_1, fields.answer_13_sideeffect, fields.pf_ip, fields.pf_memo
      ]
    );
    const [rows] = await pool.query('SELECT * FROM bomiora_member_health_profiles WHERE pf_no = ?', [result.insertId]);
    return rows[0];
  }

  async update(pfNo, mbId, fields) {
    await pool.query(
      `UPDATE bomiora_member_health_profiles SET
       answer_1 = ?, answer_2 = ?, answer_3 = ?, answer_4 = ?, answer_5 = ?, answer_6 = ?, answer_7 = ?, answer_8 = ?, answer_9 = ?,
       answer_10 = ?, answer_10_2 = ?, answer_11 = ?, answer_12 = ?, answer_13 = ?, answer_13_period = ?, answer_13_dosage = ?, answer_13_medicine = ?,
       answer_7_1 = ?, answer_13_sideeffect = ?, pf_memo = ?, pf_mdatetime = NOW()
       WHERE pf_no = ? AND mb_id = ?`,
      [
        fields.answer_1, fields.answer_2, fields.answer_3, fields.answer_4, fields.answer_5, fields.answer_6, fields.answer_7, fields.answer_8, fields.answer_9,
        fields.answer_10, fields.answer_10_2 ?? null, fields.answer_11, fields.answer_12, fields.answer_13, fields.answer_13_period, fields.answer_13_dosage, fields.answer_13_medicine,
        fields.answer_7_1, fields.answer_13_sideeffect, fields.pf_memo, pfNo, mbId
      ]
    );
    return this.findByPfNoAndMbId(pfNo, mbId);
  }

  async delete(pfNo, mbId) {
    const [result] = await pool.query(
      'DELETE FROM bomiora_member_health_profiles WHERE pf_no = ? AND mb_id = ?',
      [pfNo, mbId]
    );
    return result.affectedRows > 0;
  }
}

module.exports = new HealthProfileRepository();
