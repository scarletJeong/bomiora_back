const pool = require('../../../../config/database');

class CartRepository {
  async findProductById(itId) {
    const [rows] = await pool.query('SELECT * FROM bomiora_shop_item_new WHERE it_id = ? LIMIT 1', [itId]);
    return rows.length ? rows[0] : null;
  }

  async findByMbIdAndStatus(mbId, ctStatus) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_shop_cart WHERE mb_id = ? AND ct_status = ? ORDER BY ct_time DESC',
      [mbId, ctStatus]
    );
    return rows;
  }

  async findById(ctId) {
    const [rows] = await pool.query('SELECT * FROM bomiora_shop_cart WHERE ct_id = ? LIMIT 1', [ctId]);
    return rows.length ? rows[0] : null;
  }

  async findSameItemOption(mbId, itId, ioId, ctStatus) {
    const [rows] = await pool.query(
      `SELECT * FROM bomiora_shop_cart
       WHERE mb_id = ? AND it_id = ?
       AND ((? = '' AND (io_id IS NULL OR io_id = '')) OR io_id = ?)
       AND ct_status = ?
       LIMIT 1`,
      [mbId, itId, ioId, ioId, ctStatus]
    );
    return rows.length ? rows[0] : null;
  }

  async insertCart(payload) {
    const [result] = await pool.query(
      `INSERT INTO bomiora_shop_cart (
        od_id, mb_id, it_id, it_name, it_subject, it_sc_type, it_sc_method, it_sc_price, it_sc_minimum, it_sc_qty,
        ct_status, ct_history, ct_price, ct_point, cp_price, ct_point_use, ct_stock_use, ct_option, ct_qty, ct_notax,
        io_id, io_type, io_price, ct_time, ct_ip, ct_send_cost, ct_direct, ct_select, inf_code, ct_output, ct_kind,
        ct_mb_inf, ct_inf_price, ct_select_time, ct_settlement_status
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?,
        ?, ?, NOW(), ?
      )`,
      [
        payload.od_id, payload.mb_id, payload.it_id, payload.it_name, payload.it_subject, payload.it_sc_type, payload.it_sc_method, payload.it_sc_price, payload.it_sc_minimum, payload.it_sc_qty,
        payload.ct_status, payload.ct_history, payload.ct_price, payload.ct_point, payload.cp_price, payload.ct_point_use, payload.ct_stock_use, payload.ct_option, payload.ct_qty, payload.ct_notax,
        payload.io_id, payload.io_type, payload.io_price, payload.ct_ip, payload.ct_send_cost, payload.ct_direct, payload.ct_select, payload.inf_code, payload.ct_output, payload.ct_kind,
        payload.ct_mb_inf, payload.ct_inf_price, payload.ct_settlement_status
      ]
    );
    return this.findById(result.insertId);
  }

  async updateCart(ctId, fields) {
    const keys = Object.keys(fields);
    if (!keys.length) return this.findById(ctId);
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => fields[k]);
    await pool.query(`UPDATE bomiora_shop_cart SET ${setClause} WHERE ct_id = ?`, [...values, ctId]);
    return this.findById(ctId);
  }

  async deleteById(ctId) {
    const [result] = await pool.query('DELETE FROM bomiora_shop_cart WHERE ct_id = ?', [ctId]);
    return result.affectedRows > 0;
  }
}

module.exports = new CartRepository();
