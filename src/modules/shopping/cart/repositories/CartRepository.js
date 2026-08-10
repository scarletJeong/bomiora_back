const pool = require('../../../../config/database');

class CartRepository {
  async findProductById(itId) {
    const [rows] = await pool.query('SELECT * FROM bomiora_shop_item_new WHERE it_id = ? LIMIT 1', [itId]);
    return rows.length ? rows[0] : null;
  }

  async findByMbIdAndStatus(mbId, ctStatus) {
    const [rows] = await pool.query(
      `SELECT
         c.*,
         COALESCE(NULLIF(TRIM(CAST(c.it_subject AS CHAR)), ''), p.it_subject) AS resolved_it_subject,
         p.it_brand AS product_it_brand,
         p.it_maker AS product_it_maker,
         p.ca_id AS product_ca_id,
         p.it_kind AS product_it_kind,
         p.it_supply_items AS product_it_supply_items
       FROM bomiora_shop_cart c
       LEFT JOIN bomiora_shop_item_new p ON p.it_id = c.it_id
       WHERE c.mb_id = ? AND c.ct_status = ?
       ORDER BY c.ct_time DESC`,
      [mbId, ctStatus]
    );
    return rows;
  }

  async findByMbIdAndStatusAsc(mbId, ctStatus) {
    const [rows] = await pool.query(
      `SELECT
         c.*,
         COALESCE(NULLIF(TRIM(CAST(c.it_subject AS CHAR)), ''), p.it_subject) AS resolved_it_subject,
         p.it_brand AS product_it_brand,
         p.it_maker AS product_it_maker,
         p.ca_id AS product_ca_id,
         p.it_kind AS product_it_kind,
         p.it_supply_items AS product_it_supply_items
       FROM bomiora_shop_cart c
       LEFT JOIN bomiora_shop_item_new p ON p.it_id = c.it_id
       WHERE c.mb_id = ? AND c.ct_status = ?
       ORDER BY c.ct_time ASC`,
      [mbId, ctStatus]
    );
    return rows;
  }

  async findById(ctId) {
    const [rows] = await pool.query('SELECT * FROM bomiora_shop_cart WHERE ct_id = ? LIMIT 1', [ctId]);
    return rows.length ? rows[0] : null;
  }

  /**
   * 동일 라인: mb + it_id + option + parent + status
   * (본품 parent='', 추가상품 parent=부모it_id)
   */
  async findSameItemOption(mbId, itId, ioId, ctStatus, parent = '') {
    const parentNorm = String(parent || '').trim();
    const [rows] = await pool.query(
      `SELECT * FROM bomiora_shop_cart
       WHERE mb_id = ? AND it_id = ?
       AND ((? = '' AND (io_id IS NULL OR io_id = '')) OR io_id = ?)
       AND ct_status = ?
       AND TRIM(IFNULL(parent, '')) = ?
       LIMIT 1`,
      [mbId, itId, ioId, ioId, ctStatus, parentNorm]
    );
    return rows.length ? rows[0] : null;
  }

  /** 본품 후보 (parent 비어 있음) */
  async findParentCandidates(mbId, ctStatus) {
    const [rows] = await pool.query(
      `SELECT
         c.ct_id, c.it_id, c.ct_kind, c.od_id, c.parent,
         p.it_supply_items
       FROM bomiora_shop_cart c
       LEFT JOIN bomiora_shop_item_new p ON p.it_id = c.it_id
       WHERE c.mb_id = ? AND c.ct_status = ?
         AND TRIM(IFNULL(c.parent, '')) = ''`,
      [mbId, ctStatus]
    );
    return rows;
  }

  async insertCart(payload) {
    const [result] = await pool.query(
      `INSERT INTO bomiora_shop_cart (
        od_id, mb_id, it_id, it_name, it_subject, it_sc_type, it_sc_method, it_sc_price, it_sc_minimum, it_sc_qty,
        ct_status, ct_history, ct_price, ct_point, cp_price, ct_point_use, ct_stock_use, ct_option, ct_qty, ct_notax,
        io_id, io_type, io_price, ct_time, ct_ip, ct_send_cost, ct_direct, ct_select, inf_code, ct_output, ct_kind,
        parent, ct_mb_inf, ct_inf_price, ct_select_time, ct_settlement_status
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, NOW(), ?
      )`,
      [
        payload.od_id, payload.mb_id, payload.it_id, payload.it_name, payload.it_subject, payload.it_sc_type, payload.it_sc_method, payload.it_sc_price, payload.it_sc_minimum, payload.it_sc_qty,
        payload.ct_status, payload.ct_history, payload.ct_price, payload.ct_point, payload.cp_price, payload.ct_point_use, payload.ct_stock_use, payload.ct_option, payload.ct_qty, payload.ct_notax,
        payload.io_id, payload.io_type, payload.io_price, payload.ct_ip, payload.ct_send_cost, payload.ct_direct, payload.ct_select, payload.inf_code, payload.ct_output, payload.ct_kind,
        payload.parent || '', payload.ct_mb_inf, payload.ct_inf_price, payload.ct_settlement_status
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

  /** 본품 it_id를 parent로 가진 추가상품 삭제 (+ legacy supply_add|) */
  async deleteSupplyChildren(mbId, parentItId, ctStatus = '쇼핑') {
    const pid = String(parentItId || '').trim();
    if (!pid) return 0;
    const legacyKind = `supply_add|${pid}`;
    const [result] = await pool.query(
      `DELETE FROM bomiora_shop_cart
       WHERE mb_id = ? AND ct_status = ?
         AND (TRIM(IFNULL(parent, '')) = ? OR ct_kind = ?)`,
      [mbId, ctStatus, pid, legacyKind]
    );
    return result.affectedRows;
  }

  /**
   * 장바구니 선택 상태(ct_select) 동기화
   */
  async syncSelection({ mbId, ctStatus, ctKind, selectedCtIds = [] }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      let where = 'mb_id = ? AND ct_status = ?';
      const baseParams = [mbId, ctStatus];
      if (ctKind) {
        if (ctKind === 'prescription' || ctKind === 'general') {
          // 해당 kind 본품 + parent가 있는 추가상품 + legacy supply_add|
          where +=
            ` AND (ct_kind = ? OR TRIM(IFNULL(parent, '')) <> '' OR ct_kind LIKE ?)`;
          baseParams.push(ctKind, 'supply_add|%');
        } else {
          where += ' AND ct_kind = ?';
          baseParams.push(ctKind);
        }
      }

      await connection.query(
        `UPDATE bomiora_shop_cart
         SET ct_select = 0, ct_select_time = '0000-00-00 00:00:00'
         WHERE ${where}`,
        baseParams
      );

      const ids = (selectedCtIds || [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);
      if (ids.length) {
        const placeholders = ids.map(() => '?').join(', ');
        await connection.query(
          `UPDATE bomiora_shop_cart
           SET ct_select = 1, ct_select_time = NOW()
           WHERE ${where} AND ct_id IN (${placeholders})`,
          [...baseParams, ...ids]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = new CartRepository();
