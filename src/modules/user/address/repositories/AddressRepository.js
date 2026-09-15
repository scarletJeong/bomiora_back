const pool = require('../../../../config/database');

class AddressRepository {
  async countByMbId(mbId) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM bomiora_shop_order_address WHERE mb_id = ?',
      [mbId]
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  async findByMbId(mbId) {
    const [rows] = await pool.query(
      `SELECT ad_id, mb_id, ad_subject, ad_default, ad_name, ad_tel, ad_hp,
              ad_zip1, ad_zip2, ad_addr1, ad_addr2, ad_addr3, ad_jibeon, ad_memo
       FROM bomiora_shop_order_address
       WHERE mb_id = ?
       ORDER BY ad_id DESC`,
      [mbId]
    );
    return rows;
  }

  async ensureDefault(mbId) {
    const [rows] = await pool.query(
      'SELECT ad_id FROM bomiora_shop_order_address WHERE mb_id = ? AND ad_default = 1 LIMIT 1',
      [mbId]
    );
    if (rows.length) return;
    await pool.query(
      `UPDATE bomiora_shop_order_address
          SET ad_default = 1
        WHERE mb_id = ?
        ORDER BY ad_id DESC
        LIMIT 1`,
      [mbId]
    );
  }

  async findByIdAndMbId(id, mbId) {
    const [rows] = await pool.query(
      `SELECT ad_id, mb_id, ad_subject, ad_default, ad_name, ad_tel, ad_hp,
              ad_zip1, ad_zip2, ad_addr1, ad_addr2, ad_addr3, ad_jibeon, ad_memo
       FROM bomiora_shop_order_address
       WHERE ad_id = ? AND mb_id = ?`,
      [id, mbId]
    );
    return rows.length ? rows[0] : null;
  }

  async clearDefaultByMbId(mbId) {
    await pool.query(
      'UPDATE bomiora_shop_order_address SET ad_default = 0 WHERE mb_id = ?',
      [mbId]
    );
  }

  /**
   * 배송지 등록 — COUNT/재조회 RTT 제거.
   * 같은 커넥션에서 EXISTS(+기본해제)+INSERT 후 insertId로 응답 구성.
   */
  async createFast(data, { forceFirstDefault = null } = {}) {
    let adDefault = Number(data.ad_default || 0);
    if (forceFirstDefault === true) {
      adDefault = 1;
    } else if (forceFirstDefault !== false) {
      const [existing] = await pool.query(
        'SELECT 1 AS ok FROM bomiora_shop_order_address WHERE mb_id = ? LIMIT 1',
        [data.mb_id]
      );
      if (!existing.length) adDefault = 1;
    }
    if (adDefault !== 1) adDefault = 0;

    if (adDefault === 1) {
      await pool.query(
        'UPDATE bomiora_shop_order_address SET ad_default = 0 WHERE mb_id = ? AND ad_default = 1',
        [data.mb_id]
      );
    }

    const [result] = await pool.query(
      `INSERT INTO bomiora_shop_order_address
      (mb_id, ad_subject, ad_default, ad_name, ad_tel, ad_hp, ad_zip1, ad_zip2, ad_addr1, ad_addr2, ad_addr3, ad_jibeon, ad_memo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.mb_id,
        data.ad_subject,
        adDefault,
        data.ad_name,
        data.ad_tel,
        data.ad_hp,
        data.ad_zip1,
        data.ad_zip2,
        data.ad_addr1,
        data.ad_addr2,
        data.ad_addr3,
        data.ad_jibeon,
        data.ad_memo ?? '',
      ]
    );

    return {
      ad_id: result.insertId,
      mb_id: data.mb_id,
      ad_subject: data.ad_subject,
      ad_default: adDefault,
      ad_name: data.ad_name,
      ad_tel: data.ad_tel,
      ad_hp: data.ad_hp,
      ad_zip1: data.ad_zip1,
      ad_zip2: data.ad_zip2,
      ad_addr1: data.ad_addr1,
      ad_addr2: data.ad_addr2,
      ad_addr3: data.ad_addr3,
      ad_jibeon: data.ad_jibeon,
      ad_memo: data.ad_memo ?? '',
    };
  }

  async create(data) {
    return this.createFast(data);
  }

  async update(id, mbId, data) {
    const wantDefault = Number(data.ad_default || 0) === 1;
    const [result] = await pool.query(
      `UPDATE bomiora_shop_order_address
          SET ad_subject = IF(ad_id = ?, ?, ad_subject),
              ad_name    = IF(ad_id = ?, ?, ad_name),
              ad_tel     = IF(ad_id = ?, ?, ad_tel),
              ad_hp      = IF(ad_id = ?, ?, ad_hp),
              ad_zip1    = IF(ad_id = ?, ?, ad_zip1),
              ad_zip2    = IF(ad_id = ?, ?, ad_zip2),
              ad_addr1   = IF(ad_id = ?, ?, ad_addr1),
              ad_addr2   = IF(ad_id = ?, ?, ad_addr2),
              ad_addr3   = IF(ad_id = ?, ?, ad_addr3),
              ad_jibeon  = IF(ad_id = ?, ?, ad_jibeon),
              ad_memo    = IF(ad_id = ?, ?, ad_memo),
              ad_default = IF(ad_id = ?, ?, IF(? = 1, 0, ad_default))
        WHERE mb_id = ?`,
      [
        id, data.ad_subject,
        id, data.ad_name,
        id, data.ad_tel,
        id, data.ad_hp,
        id, data.ad_zip1,
        id, data.ad_zip2,
        id, data.ad_addr1,
        id, data.ad_addr2,
        id, data.ad_addr3,
        id, data.ad_jibeon,
        id, data.ad_memo ?? '',
        id, wantDefault ? 1 : 0, wantDefault ? 1 : 0,
        mbId,
      ]
    );
    if (!result.affectedRows) return null;
    if (!wantDefault) {
      await this.ensureDefault(mbId);
    }
    return {
      ad_id: id,
      mb_id: mbId,
      ad_subject: data.ad_subject,
      ad_default: wantDefault ? 1 : 0,
      ad_name: data.ad_name,
      ad_tel: data.ad_tel,
      ad_hp: data.ad_hp,
      ad_zip1: data.ad_zip1,
      ad_zip2: data.ad_zip2,
      ad_addr1: data.ad_addr1,
      ad_addr2: data.ad_addr2,
      ad_addr3: data.ad_addr3,
      ad_jibeon: data.ad_jibeon,
      ad_memo: data.ad_memo ?? '',
    };
  }

  /**
   * 기본배송지는 삭제하지 않음.
   * 조건(기본이 아님)과 DELETE를 한 쿼리에서 처리 — 조회 후 삭제 순서 유지, RTT는 1회.
   */
  async delete(id, mbId) {
    const [result] = await pool.query(
      `DELETE FROM bomiora_shop_order_address
        WHERE ad_id = ? AND mb_id = ? AND IFNULL(ad_default, 0) <> 1`,
      [id, mbId]
    );
    if (result.affectedRows > 0) {
      return { ok: true };
    }
    const [cur] = await pool.query(
      'SELECT ad_default FROM bomiora_shop_order_address WHERE ad_id = ? AND mb_id = ? LIMIT 1',
      [id, mbId]
    );
    if (cur.length && Number(cur[0].ad_default || 0) === 1) {
      return { ok: false, code: 'DEFAULT' };
    }
    return { ok: false, code: 'NOT_FOUND' };
  }

  async setDefault(id, mbId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [targetRows] = await connection.query(
        'SELECT ad_id FROM bomiora_shop_order_address WHERE ad_id = ? AND mb_id = ?',
        [id, mbId]
      );
      if (!targetRows.length) {
        await connection.rollback();
        return null;
      }

      await connection.query(
        'UPDATE bomiora_shop_order_address SET ad_default = 0 WHERE mb_id = ?',
        [mbId]
      );
      await connection.query(
        'UPDATE bomiora_shop_order_address SET ad_default = 1 WHERE ad_id = ? AND mb_id = ?',
        [id, mbId]
      );

      await connection.commit();
      return this.findByIdAndMbId(id, mbId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = new AddressRepository();
