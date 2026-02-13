const pool = require('../../../../config/database');

class AddressRepository {
  async findByMbId(mbId) {
    const [rows] = await pool.query(
      `SELECT a.*
       FROM bomiora_shop_order_address a
       INNER JOIN (
        SELECT ad_subject, MAX(ad_id) AS max_id
        FROM bomiora_shop_order_address
        WHERE mb_id = ?
        GROUP BY ad_subject
       ) b ON a.ad_subject = b.ad_subject AND a.ad_id = b.max_id
       WHERE a.mb_id = ?
       ORDER BY a.ad_default DESC, a.ad_id DESC`,
      [mbId, mbId]
    );
    return rows;
  }

  async findByIdAndMbId(id, mbId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_shop_order_address WHERE ad_id = ? AND mb_id = ?',
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
      (mb_id, ad_subject, ad_default, ad_name, ad_tel, ad_hp, ad_zip1, ad_zip2, ad_addr1, ad_addr2, ad_addr3, ad_jibeon)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.mb_id, data.ad_subject, data.ad_default, data.ad_name, data.ad_tel, data.ad_hp,
        data.ad_zip1, data.ad_zip2, data.ad_addr1, data.ad_addr2, data.ad_addr3, data.ad_jibeon
      ]
    );
    return this.findByIdAndMbId(result.insertId, data.mb_id);
  }

  async update(id, mbId, data) {
    await pool.query(
      `UPDATE bomiora_shop_order_address
       SET ad_subject = ?, ad_default = ?, ad_name = ?, ad_tel = ?, ad_hp = ?, ad_zip1 = ?, ad_zip2 = ?,
           ad_addr1 = ?, ad_addr2 = ?, ad_addr3 = ?, ad_jibeon = ?
       WHERE ad_id = ? AND mb_id = ?`,
      [
        data.ad_subject, data.ad_default, data.ad_name, data.ad_tel, data.ad_hp, data.ad_zip1, data.ad_zip2,
        data.ad_addr1, data.ad_addr2, data.ad_addr3, data.ad_jibeon, id, mbId
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
