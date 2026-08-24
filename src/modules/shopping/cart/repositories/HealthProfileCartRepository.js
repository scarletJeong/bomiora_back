const pool = require('../../../../config/database');

class HealthProfileCartRepository {
  normalizeOdId(value) {
    return String(value ?? '')
      .replace(/[^0-9]/g, '')
      .trim();
  }

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

  /**
   * od_id + it_id 당 1행 — 있으면 갱신, 없으면 insert
   */
  async findByMbOdIt(mbId, odId, itId) {
    const od = this.normalizeOdId(odId);
    const itemId = String(itId || '').trim();
    if (!mbId || !od || !itemId) return null;

    const [rows] = await pool.query(
      `SELECT hp_no
         FROM bomiora_shop_health_profiles_cart
        WHERE mb_id = ?
          AND it_id = ?
          AND REPLACE(REPLACE(CAST(od_id AS CHAR), ',', ''), ' ', '') = ?
        ORDER BY hp_no DESC
        LIMIT 1`,
      [mbId, itemId, od]
    );
    return rows.length ? rows[0] : null;
  }

  async updateByHpNo(hpNo, payload) {
    const [result] = await pool.query(
      `UPDATE bomiora_shop_health_profiles_cart
          SET answer_1 = ?, answer_2 = ?, answer_3 = ?, answer_4 = ?, answer_5 = ?,
              answer_6 = ?, answer_7 = ?, answer_8 = ?, answer_9 = ?, answer_10 = ?,
              answer_11 = ?, answer_12 = ?, answer_13 = ?,
              answer_13_period = ?, answer_13_dosage = ?, answer_13_medicine = ?,
              answer_7_1 = ?, answer_13_sideeffect = ?,
              hp_doc_name = ?, hp_rsvt_date = ?, hp_rsvt_stime = ?, hp_rsvt_etime = ?,
              hp_rsvt_name = ?, hp_rsvt_tel = ?,
              hp_memo = ?, hp_ip = ?, hp_mdatetime = NOW()
        WHERE hp_no = ?`,
      [
        payload.answer1 || null,
        payload.answer2 || null,
        payload.answer3 || null,
        payload.answer4 || null,
        payload.answer5 || null,
        payload.answer6 || null,
        payload.answer7 || null,
        payload.answer8 || null,
        payload.answer9 || null,
        payload.answer10 || null,
        payload.answer11 || null,
        payload.answer12 || null,
        payload.answer13 || null,
        payload.answer13Period || null,
        payload.answer13Dosage || null,
        payload.answer13Medicine || null,
        payload.answer71 || null,
        payload.answer13Sideeffect || null,
        payload.doctorName || '',
        payload.reservationDate || null,
        payload.reservationTime || '',
        payload.reservationEndTime || '',
        payload.reservationName || '',
        payload.reservationTel || '',
        payload.hpMemo || '',
        payload.hp_ip || '127.0.0.1',
        hpNo,
      ]
    );
    return result.affectedRows > 0;
  }

  /** (mb_id, od_id, it_id) 유일 — 중복이면 최신 1건만 남기고 갱신 */
  async upsertByOdIdAndItId(payload) {
    const existing = await this.findByMbOdIt(
      payload.mb_id,
      payload.od_id,
      payload.it_id
    );
    if (existing?.hp_no) {
      await this.updateByHpNo(existing.hp_no, payload);
      await this.dedupeKeepHpNo(
        payload.mb_id,
        payload.od_id,
        payload.it_id,
        existing.hp_no
      );
      return existing.hp_no;
    }
    const hpNo = await this.insert(payload);
    await this.dedupeKeepHpNo(
      payload.mb_id,
      payload.od_id,
      payload.it_id,
      hpNo
    );
    return hpNo;
  }

  async dedupeKeepHpNo(mbId, odId, itId, keepHpNo) {
    const od = this.normalizeOdId(odId);
    const itemId = String(itId || '').trim();
    const keep = Number(keepHpNo);
    if (!mbId || !od || !itemId || !keep) return;

    await pool.query(
      `DELETE FROM bomiora_shop_health_profiles_cart
        WHERE mb_id = ?
          AND it_id = ?
          AND REPLACE(REPLACE(CAST(od_id AS CHAR), ',', ''), ' ', '') = ?
          AND hp_no <> ?`,
      [mbId, itemId, od, keep]
    );
  }

  /**
   * 주문 단위로 (it_id 당) 최신 hp_no 만 남김
   */
  async dedupeByOrder(mbId, odId) {
    const od = this.normalizeOdId(odId);
    if (!mbId || !od) return;

    await pool.query(
      `DELETE h FROM bomiora_shop_health_profiles_cart h
        INNER JOIN (
          SELECT it_id, MAX(hp_no) AS keep_no
            FROM bomiora_shop_health_profiles_cart
           WHERE mb_id = ?
             AND REPLACE(REPLACE(CAST(od_id AS CHAR), ',', ''), ' ', '') = ?
           GROUP BY it_id
          HAVING COUNT(*) > 1
        ) d ON d.it_id = h.it_id
       WHERE h.mb_id = ?
         AND REPLACE(REPLACE(CAST(h.od_id AS CHAR), ',', ''), ' ', '') = ?
         AND h.hp_no <> d.keep_no`,
      [mbId, od, mbId, od]
    );
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

  async findLatestByOrderAndItem({ mbId, odId, itId }) {
    if (!mbId || !itId || odId == null || odId === '') return null;

    const [rows] = await pool.query(
      `SELECT hp_doc_name, hp_rsvt_date, hp_rsvt_stime, hp_rsvt_etime
       FROM bomiora_shop_health_profiles_cart
       WHERE mb_id = ? AND REPLACE(od_id, ',', '') = ? AND it_id = ?
       ORDER BY hp_no DESC
       LIMIT 1`,
      [mbId, this.normalizeOdId(odId), itId]
    );
    return rows.length ? rows[0] : null;
  }

  /** 회원 장바구니 목록용: od_id+it_id 당 최신 예약 1건 */
  async findLatestMapByMbId(mbId) {
    const id = String(mbId || '').trim();
    if (!id) return new Map();
    const [rows] = await pool.query(
      `SELECT
         CAST(it_id AS CHAR) AS it_id,
         REPLACE(REPLACE(CAST(od_id AS CHAR), ',', ''), ' ', '') AS od_id,
         CAST(hp_doc_name AS CHAR) AS hp_doc_name,
         hp_rsvt_date,
         CAST(hp_rsvt_stime AS CHAR) AS hp_rsvt_stime,
         CAST(hp_rsvt_etime AS CHAR) AS hp_rsvt_etime
       FROM bomiora_shop_health_profiles_cart
       WHERE mb_id = ?
       ORDER BY hp_no DESC`,
      [id]
    );
    const map = new Map();
    for (const row of rows) {
      const key = `${row.od_id || ''}:${String(row.it_id || '').trim()}`;
      if (key !== ':' && !map.has(key)) map.set(key, row);
    }
    return map;
  }
}

module.exports = new HealthProfileCartRepository();
