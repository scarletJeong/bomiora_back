const pool = require('../../../../config/database');

class HealthProfileRepository {
  async findByMbId(mbId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_member_health_profiles WHERE mb_id = ? LIMIT 1',
      [mbId]
    );
    return rows.length ? rows[0] : null;
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
       answer_10, answer_11, answer_12, answer_13, answer_13_period, answer_13_dosage, answer_13_medicine, answer_7_1, answer_13_sideeffect, pf_ip, pf_memo, pf_wdatetime, pf_mdatetime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        fields.mb_id, fields.answer_1, fields.answer_2, fields.answer_3, fields.answer_4, fields.answer_5, fields.answer_6, fields.answer_7, fields.answer_8,
        fields.answer_9, fields.answer_10, fields.answer_11, fields.answer_12, fields.answer_13, fields.answer_13_period, fields.answer_13_dosage,
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
       answer_10 = ?, answer_11 = ?, answer_12 = ?, answer_13 = ?, answer_13_period = ?, answer_13_dosage = ?, answer_13_medicine = ?,
       answer_7_1 = ?, answer_13_sideeffect = ?, pf_memo = ?, pf_mdatetime = NOW()
       WHERE pf_no = ? AND mb_id = ?`,
      [
        fields.answer_1, fields.answer_2, fields.answer_3, fields.answer_4, fields.answer_5, fields.answer_6, fields.answer_7, fields.answer_8, fields.answer_9,
        fields.answer_10, fields.answer_11, fields.answer_12, fields.answer_13, fields.answer_13_period, fields.answer_13_dosage, fields.answer_13_medicine,
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
