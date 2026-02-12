const pool = require('../../../../config/database');

class HealthProfileCartRepository {
  async insert(payload) {
    const [result] = await pool.query(
      `INSERT INTO bomiora_shop_health_profiles_cart (
        mb_id, it_id, od_id, inf_code,
        answer_1, answer_2, answer_3, answer_4, answer_5, answer_6, answer_7, answer_8, answer_9, answer_10, answer_11, answer_12,
        answer_13, answer_13_period, answer_13_dosage, answer_13_medicine, answer_7_1, answer_13_sideeffect,
        hp_status, hp_doc_name, hp_rsvt_date, hp_rsvt_stime, hp_rsvt_etime, hp_rsvt_name, hp_rsvt_tel,
        hp_wdatetime, hp_mdatetime, hp_ip, hp_memo, hp_output, hp_1, hp_2, hp_3, hp_4, hp_5, hp_6, hp_7, hp_8, hp_9, hp_10
      ) VALUES (
        ?, ?, ?, '',
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        NOW(), NOW(), ?, ?, 'Y', '', '', '', '', '', '', '', 'first', 'prescription', 'ongoing'
      )`,
      [
        payload.mb_id, payload.it_id || '', payload.od_id,
        payload.answer1 || null, payload.answer2 || null, payload.answer3 || null, payload.answer4 || null, payload.answer5 || null, payload.answer6 || null, payload.answer7 || null, payload.answer8 || null, payload.answer9 || null, payload.answer10 || null, payload.answer11 || null, payload.answer12 || null,
        payload.answer13 || null, payload.answer13Period || null, payload.answer13Dosage || null, payload.answer13Medicine || null, payload.answer71 || null, payload.answer13Sideeffect || null,
        '쇼핑', payload.doctorName || '', payload.reservationDate || null, payload.reservationTime || '', payload.reservationEndTime || '', payload.reservationName || '', payload.reservationTel || '',
        payload.hp_ip || '127.0.0.1', payload.hpMemo || ''
      ]
    );
    return result.insertId;
  }

  async findRecentByMbIdAndItIdAndStatus(mbId, itId, status) {
    const [rows] = await pool.query(
      `SELECT * FROM bomiora_shop_health_profiles_cart
       WHERE mb_id = ? AND it_id = ? AND hp_status = ?
       ORDER BY hp_wdatetime DESC`,
      [mbId, itId, status]
    );
    return rows;
  }

  async updateOdId(hpNo, odId) {
    const [result] = await pool.query(
      'UPDATE bomiora_shop_health_profiles_cart SET od_id = ?, hp_mdatetime = NOW() WHERE hp_no = ?',
      [odId, hpNo]
    );
    return result.affectedRows > 0;
  }
}

module.exports = new HealthProfileCartRepository();
