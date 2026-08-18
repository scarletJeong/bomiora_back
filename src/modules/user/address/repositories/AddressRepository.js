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
      `SELECT ad_id, mb_id, ad_subject, ad_default, ad_name, ad_tel, ad_hp,
              ad_zip1, ad_zip2, ad_addr1, ad_addr2, ad_addr3, ad_jibeon, ad_memo
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

  async create(data) {
    const [result] = await pool.query(
      `INSERT INTO bomiora_shop_order_address
      (mb_id, ad_subject, ad_default, ad_name, ad_tel, ad_hp, ad_zip1, ad_zip2, ad_addr1, ad_addr2, ad_addr3, ad_jibeon, ad_memo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.mb_id, data.ad_subject, data.ad_default, data.ad_name, data.ad_tel, data.ad_hp,
        data.ad_zip1, data.ad_zip2, data.ad_addr1, data.ad_addr2, data.ad_addr3, data.ad_jibeon,
        data.ad_memo ?? '',
      ]
    );
    return this.findByIdAndMbId(result.insertId, data.mb_id);
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
