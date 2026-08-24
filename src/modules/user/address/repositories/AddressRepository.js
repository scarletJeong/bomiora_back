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
    // 기본배송지 여부와 무관하게 등록순(최신 ad_id 우선) 유지. 배송지명 중복 허용.
    const [rows] = await pool.query(
      `SELECT ad_id,
              CAST(mb_id AS CHAR) AS mb_id,
              CAST(ad_subject AS CHAR) AS ad_subject,
              ad_default,
              CAST(ad_name AS CHAR) AS ad_name,
              CAST(ad_tel AS CHAR) AS ad_tel,
              CAST(ad_hp AS CHAR) AS ad_hp,
              CAST(ad_zip1 AS CHAR) AS ad_zip1,
              CAST(ad_zip2 AS CHAR) AS ad_zip2,
              CAST(ad_addr1 AS CHAR) AS ad_addr1,
              CAST(ad_addr2 AS CHAR) AS ad_addr2,
              CAST(ad_addr3 AS CHAR) AS ad_addr3,
              CAST(ad_jibeon AS CHAR) AS ad_jibeon,
              CAST(ad_memo AS CHAR) AS ad_memo
       FROM bomiora_shop_order_address
       WHERE mb_id = ?
       ORDER BY ad_id DESC`,
      [mbId]
    );
    return rows;
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
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      let adDefault = Number(data.ad_default || 0);
      if (forceFirstDefault === true) {
        adDefault = 1;
      } else if (forceFirstDefault === false) {
        // 이미 배송지 있음 — 요청값 유지
      } else {
        const [existing] = await connection.query(
          'SELECT 1 AS ok FROM bomiora_shop_order_address WHERE mb_id = ? LIMIT 1',
          [data.mb_id]
        );
        if (!existing.length) adDefault = 1;
      }

      if (adDefault === 1) {
        await connection.query(
          'UPDATE bomiora_shop_order_address SET ad_default = 0 WHERE mb_id = ? AND ad_default = 1',
          [data.mb_id]
        );
      }

      const [result] = await connection.query(
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

      await connection.commit();
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
    } catch (error) {
      try {
        await connection.rollback();
      } catch (_) {}
      throw error;
    } finally {
      connection.release();
    }
  }

  async create(data) {
    return this.createFast(data);
  }

  async update(id, mbId, data) {
    await pool.query(
      `UPDATE bomiora_shop_order_address
       SET ad_subject = ?, ad_default = ?, ad_name = ?, ad_tel = ?, ad_hp = ?, ad_zip1 = ?, ad_zip2 = ?,
           ad_addr1 = ?, ad_addr2 = ?, ad_addr3 = ?, ad_jibeon = ?, ad_memo = ?
       WHERE ad_id = ? AND mb_id = ?`,
      [
        data.ad_subject, data.ad_default, data.ad_name, data.ad_tel, data.ad_hp, data.ad_zip1, data.ad_zip2,
        data.ad_addr1, data.ad_addr2, data.ad_addr3, data.ad_jibeon, data.ad_memo ?? '', id, mbId
      ]
    );
    return this.findByIdAndMbId(id, mbId);
  }

  async delete(id, mbId) {
    const [result] = await pool.query(
      'DELETE FROM bomiora_shop_order_address WHERE ad_id = ? AND mb_id = ?',
      [id, mbId]
    );
    return result.affectedRows > 0;
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
