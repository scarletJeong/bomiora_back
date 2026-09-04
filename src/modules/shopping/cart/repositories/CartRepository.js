const pool = require('../../../../config/database');

const CART_LIST_SELECT = `
         c.ct_id,
         CAST(c.od_id AS CHAR) AS od_id,
         CAST(c.mb_id AS CHAR) AS mb_id,
         CAST(c.it_id AS CHAR) AS it_id,
         CAST(c.it_name AS CHAR) AS it_name,
         CAST(c.it_subject AS CHAR) AS it_subject,
         c.it_sc_type, c.it_sc_method, c.it_sc_price, c.it_sc_minimum, c.it_sc_qty,
         CAST(c.ct_status AS CHAR) AS ct_status,
         c.ct_price, c.ct_qty, c.io_type, c.io_price, c.ct_select, c.ct_time,
         CAST(c.ct_option AS CHAR) AS ct_option,
         CAST(c.io_id AS CHAR) AS io_id,
         CAST(c.ct_kind AS CHAR) AS ct_kind,
         CAST(c.parent AS CHAR) AS parent,
         CAST(c.ct_mb_inf AS CHAR) AS ct_mb_inf,
         COALESCE(NULLIF(TRIM(CAST(c.it_subject AS CHAR)), ''), CAST(p.it_subject AS CHAR)) AS resolved_it_subject,
         CAST(p.it_brand AS CHAR) AS product_it_brand,
         CAST(p.it_maker AS CHAR) AS product_it_maker,
         CAST(p.ca_id AS CHAR) AS product_ca_id,
         CAST(p.it_kind AS CHAR) AS product_it_kind,
         CAST(LEFT(IFNULL(p.it_supply_items, ''), 500) AS CHAR) AS product_it_supply_items,
         CAST(p.it_flutter_image_url AS CHAR) AS it_flutter_image_url,
         CAST(p.it_img1 AS CHAR) AS it_img1,
         CAST(p.it_soldout AS CHAR) AS product_it_soldout,
         CAST(p.it_use AS CHAR) AS product_it_use
`;

class CartRepository {
  async findProductById(itId) {
    const [rows] = await pool.query(
      `SELECT it_id, it_name, it_subject, it_kind, it_brand, it_maker,
              it_img1, it_flutter_image_url, it_mb_inf, it_inf_price,
              it_sc_type, it_sc_method, it_sc_price, it_sc_minimum, it_sc_qty,
              it_price, it_point_type, it_point, it_supply_point,
              it_soldout, it_use
       FROM bomiora_shop_item_new WHERE it_id = ? LIMIT 1`,
      [itId]
    );
    return rows.length ? rows[0] : null;
  }

  async findByMbIdAndStatus(mbId, ctStatus) {
    const [rows] = await pool.query(
      `SELECT ${CART_LIST_SELECT}
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
      `SELECT ${CART_LIST_SELECT}
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

  async findByIds(ctIds = []) {
    const ids = [...new Set(
      (Array.isArray(ctIds) ? ctIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )];
    if (!ids.length) return [];

    const [rows] = await pool.query(
      `SELECT c.*, CAST(p.it_kind AS CHAR) AS product_it_kind
         FROM bomiora_shop_cart c
         LEFT JOIN bomiora_shop_item_new p ON p.it_id = c.it_id
        WHERE c.ct_id IN (?)`,
      [ids]
    );
    const byId = new Map(rows.map((row) => [Number(row.ct_id), row]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  async findProductsByIds(itIds = []) {
    const ids = [...new Set(
      (Array.isArray(itIds) ? itIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )];
    if (!ids.length) return new Map();

    const [rows] = await pool.query(
      `SELECT it_id, it_name, it_subject, it_kind, it_brand, it_maker,
              it_img1, it_flutter_image_url, it_mb_inf, it_inf_price,
              it_sc_type, it_sc_method, it_sc_price, it_sc_minimum, it_sc_qty,
              it_price, it_point_type, it_point, it_supply_point,
              it_soldout, it_use, it_stock_qty
       FROM bomiora_shop_item_new
       WHERE it_id IN (?)`,
      [ids]
    );
    const map = new Map();
    for (const row of rows) {
      map.set(String(row.it_id), row);
    }
    return map;
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

  async markReservedByIds(ctIds, mbId, odId, now = new Date()) {
    const ids = [...new Set(
      (Array.isArray(ctIds) ? ctIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )];
    if (!ids.length) return 0;
    const [result] = await pool.query(
      `UPDATE bomiora_shop_cart
          SET od_id = ?, ct_time = ?, ct_select = 1, ct_select_time = ?
        WHERE mb_id = ? AND ct_id IN (?)`,
      [odId, now, now, mbId, ids]
    );
    return result.affectedRows;
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

  async findCheckoutCarts(mbId, ctIds = []) {
    const ids = [...new Set(
      (Array.isArray(ctIds) ? ctIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )];
    if (!ids.length) return [];

    const [rows] = await pool.query(
      `SELECT
         c.ct_id,
         CAST(c.mb_id AS CHAR) AS mb_id,
         CAST(c.it_id AS CHAR) AS it_id,
         CAST(c.it_name AS CHAR) AS it_name,
         c.ct_qty, c.ct_price, c.io_type, c.io_price,
         CAST(c.io_id AS CHAR) AS io_id,
         CAST(c.parent AS CHAR) AS parent,
         CAST(c.ct_status AS CHAR) AS ct_status,
         p.it_price,
         CAST(p.it_soldout AS CHAR) AS it_soldout,
         CAST(p.it_use AS CHAR) AS it_use,
         p.it_stock_qty,
         CAST(p.it_name AS CHAR) AS product_name
       FROM bomiora_shop_cart c
       LEFT JOIN bomiora_shop_item_new p ON p.it_id = c.it_id
       WHERE c.mb_id = ? AND c.ct_id IN (?)`,
      [mbId, ids]
    );
    return rows;
  }

  async findOptionsByKeys(pairs = []) {
    const unique = [];
    const seen = new Set();
    for (const pair of pairs) {
      const itId = String(pair.itId || '').trim();
      const ioId = String(pair.ioId || '').trim();
      if (!itId || !ioId) continue;
      const key = `${itId}\t${ioId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push({ itId, ioId });
    }
    if (!unique.length) return new Map();

    const placeholders = unique.map(() => '(?, ?)').join(', ');
    const params = unique.flatMap((p) => [p.itId, p.ioId]);
    const [rows] = await pool.query(
      `SELECT
         CAST(it_id AS CHAR) AS it_id,
         CAST(io_id AS CHAR) AS io_id,
         io_type, io_price, io_stock_qty, io_use
       FROM bomiora_shop_item_option
       WHERE (it_id, io_id) IN (${placeholders})`,
      params
    );
    const map = new Map();
    for (const row of rows) {
      map.set(`${String(row.it_id).trim()}\t${String(row.io_id).trim()}`, row);
    }
    return map;
  }
}

module.exports = new CartRepository();
