const pool = require('../../../../config/database');

class OrderRepository {
  buildStatusFilter(status) {
    switch (status) {
      case 'payment':
        return {
          sql: "od_status IN ('주문', '입금') AND (od_cancel_price IS NULL OR od_cancel_price = 0) AND od_status NOT IN ('취소', '반품')",
          params: []
        };
      case 'cancel':
        return {
          sql: "od_status NOT IN ('주문', '입금', '준비', '배송', '완료')",
          params: []
        };
      case 'preparing':
        return {
          sql: "od_status IN ('준비') AND (od_cancel_price IS NULL OR od_cancel_price = 0) AND od_status NOT IN ('취소', '반품')",
          params: []
        };
      case 'delivering':
        return {
          sql: "od_status IN ('배송', '완료') AND (delivery_completed IS NULL OR delivery_completed != 1)",
          params: []
        };
      case 'finish':
        return {
          sql: 'delivery_completed = 1',
          params: []
        };
      default:
        return { sql: '1=1', params: [] };
    }
  }

  buildPeriodFilter(period) {
    if (!period || Number(period) <= 0) {
      return { sql: '1=1', params: [] };
    }
    return {
      sql: "NULLIF(od_time, '0000-00-00 00:00:00') >= DATE_SUB(NOW(), INTERVAL ? MONTH)",
      params: [Number(period)]
    };
  }

  async getOrders(mbId, period, status, page, size) {
    const statusFilter = this.buildStatusFilter(status);
    const periodFilter = this.buildPeriodFilter(period);
    const offset = Number(page) * Number(size);

    const whereSql = `mb_id = ? AND ${periodFilter.sql} AND ${statusFilter.sql}`;
    const whereParams = [mbId, ...periodFilter.params, ...statusFilter.params];

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM bomiora_shop_order WHERE ${whereSql}`,
      whereParams
    );
    const total = Number(countRows[0].total || 0);

    const [rows] = await pool.query(
      `SELECT od_id, mb_id, od_name, od_email, od_hp,
              od_addr1, od_addr2, od_addr3, od_status,
              od_cart_count, od_cart_price, od_send_cost, od_send_cost2,
              od_receipt_price, od_settle_case, od_delivery_company, od_invoice,
              NULLIF(od_time, '0000-00-00 00:00:00') AS od_time,
              NULLIF(od_invoice_time, '0000-00-00 00:00:00') AS od_invoice_time,
              delivery_completed, admin_completed,
              NULLIF(auto_confirm_at, '0000-00-00 00:00:00') AS auto_confirm_at
       FROM bomiora_shop_order
       WHERE ${whereSql}
       ORDER BY od_id DESC
       LIMIT ? OFFSET ?`,
      [...whereParams, Number(size), offset]
    );

    return { rows, total };
  }

  async getOrderDetail(odId, mbId) {
    const [rows] = await pool.query(
      `SELECT od_id, mb_id, od_name, od_email, od_tel, od_hp,
              od_zip1, od_zip2, od_addr1, od_addr2, od_addr3, od_addr_jibeon,
              od_b_name, od_b_tel, od_b_hp, od_b_zip1, od_b_zip2, od_b_addr1, od_b_addr2, od_b_addr3, od_b_addr_jibeon,
              od_memo, od_status, od_cart_count, od_cart_price, od_cart_coupon,
              od_send_cost, od_send_cost2, od_send_coupon, od_receipt_price, od_cancel_price, od_receipt_point, od_coupon, od_misu,
              od_settle_case, od_bank_account, od_delivery_company, od_invoice,
              od_pg, od_tno, od_test, od_other_pay_type,
              od_shop_memo, od_mod_history,
              NULLIF(od_time, '0000-00-00 00:00:00') AS od_time,
              NULLIF(od_invoice_time, '0000-00-00 00:00:00') AS od_invoice_time,
              NULLIF(od_receipt_time, '0000-00-00 00:00:00') AS od_receipt_time,
              delivery_completed, admin_completed,
              NULLIF(auto_confirm_at, '0000-00-00 00:00:00') AS auto_confirm_at
       FROM bomiora_shop_order
       WHERE od_id = ? AND mb_id = ?
       LIMIT 1`,
      [odId, mbId]
    );
    return rows.length ? rows[0] : null;
  }

  async findById(odId) {
    const [rows] = await pool.query('SELECT * FROM bomiora_shop_order WHERE od_id = ? LIMIT 1', [odId]);
    return rows.length ? rows[0] : null;
  }

  async updateOrder(odId, fields) {
    const sets = [];
    const values = [];
    Object.entries(fields).forEach(([key, value]) => {
      sets.push(`${key} = ?`);
      values.push(value);
    });
    if (!sets.length) return;
    values.push(odId);
    await pool.query(`UPDATE bomiora_shop_order SET ${sets.join(', ')} WHERE od_id = ?`, values);
  }

  async getItemImagesByItIds(itIds) {
    if (!itIds.length) return [];
    const placeholders = itIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT it_id, it_img1 FROM bomiora_shop_item_new WHERE it_id IN (${placeholders})`,
      itIds
    );
    return rows;
  }

  async getReservation(mbId, odId) {
    const [rows] = await pool.query(
      `SELECT hp_rsvt_date, hp_rsvt_stime
       FROM bomiora_shop_health_profiles_cart
       WHERE mb_id = ? AND od_id = ?
       ORDER BY hp_no DESC
       LIMIT 1`,
      [mbId, odId]
    );
    return rows.length ? rows[0] : null;
  }

  async getPrescriptionFlagsByOdIds(mbId, odIds) {
    if (!odIds.length) return {};
    const placeholders = odIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT od_id,
              MAX(CASE WHEN hp_9 = 'prescription' THEN 1 ELSE 0 END) AS is_prescription
       FROM bomiora_shop_health_profiles_cart
       WHERE mb_id = ? AND od_id IN (${placeholders})
       GROUP BY od_id`,
      [mbId, ...odIds]
    );
    const map = {};
    rows.forEach((row) => {
      map[String(row.od_id)] = Number(row.is_prescription || 0) === 1;
    });
    return map;
  }

  async isPrescriptionOrder(mbId, odId) {
    const [rows] = await pool.query(
      `SELECT 1
       FROM bomiora_shop_health_profiles_cart
       WHERE mb_id = ? AND od_id = ? AND hp_9 = 'prescription'
       LIMIT 1`,
      [mbId, odId]
    );
    return rows.length > 0;
  }

  async getAddressById(mbId, addressId) {
    const [rows] = await pool.query(
      `SELECT ad_id, ad_name, ad_tel, ad_hp, ad_zip1, ad_zip2, ad_addr1, ad_addr2, ad_addr3, ad_jibeon
       FROM bomiora_shop_order_address
       WHERE mb_id = ? AND ad_id = ?
       LIMIT 1`,
      [mbId, addressId]
    );
    return rows.length ? rows[0] : null;
  }

  async updateOrderAddress(odId, mbId, address) {
    const [result] = await pool.query(
      `UPDATE bomiora_shop_order
       SET od_name = ?, od_tel = ?, od_hp = ?, od_zip1 = ?, od_zip2 = ?,
           od_addr1 = ?, od_addr2 = ?, od_addr3 = ?, od_addr_jibeon = ?
       WHERE od_id = ? AND mb_id = ?`,
      [
        address.ad_name || '',
        address.ad_tel || '',
        address.ad_hp || '',
        address.ad_zip1 || '',
        address.ad_zip2 || '',
        address.ad_addr1 || '',
        address.ad_addr2 || '',
        address.ad_addr3 || '',
        address.ad_jibeon || '',
        odId,
        mbId
      ]
    );
    return result.affectedRows > 0;
  }

  async updateReservation(mbId, odId, date, time) {
    const [result] = await pool.query(
      `UPDATE bomiora_shop_health_profiles_cart
       SET hp_rsvt_date = ?, hp_rsvt_stime = ?, hp_mdatetime = NOW()
       WHERE mb_id = ? AND od_id = ?`,
      [date, time, mbId, odId]
    );
    return result.affectedRows > 0;
  }
}

module.exports = new OrderRepository();
