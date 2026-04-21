const pool = require('../../../../config/database');

class KcpPayRepository {
  async getCartItemsByIds(mbId, cartIds) {
    if (!cartIds.length) return [];
    const placeholders = cartIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT *
       FROM bomiora_shop_cart
       WHERE mb_id = ?
         AND ct_id IN (${placeholders})
         AND ct_output = 'Y'`,
      [mbId, ...cartIds]
    );
    return rows;
  }

  async getDistinctItemCountByCartIds(mbId, cartIds) {
    if (!cartIds.length) return 0;
    const placeholders = cartIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT COUNT(DISTINCT it_id) AS cnt
       FROM bomiora_shop_cart
       WHERE mb_id = ?
         AND ct_id IN (${placeholders})
         AND ct_output = 'Y'`,
      [mbId, ...cartIds]
    );
    return Number(rows[0]?.cnt || 0);
  }

  async createPaidOrder(payload) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [existingRows] = await connection.query(
        `SELECT od_id
         FROM bomiora_shop_order
         WHERE od_id = ?
         LIMIT 1`,
        [payload.orderId]
      );
      if (Array.isArray(existingRows) && existingRows.length > 0) {
        await connection.commit();
        return { success: true, duplicated: true };
      }

      const taxMny = Math.round(payload.totalAmount / 1.1);
      const vatMny = payload.totalAmount - taxMny;
      const now = new Date();
      const isVirtualAccount = payload.settleCase === '가상계좌';
      const odStatus = isVirtualAccount ? '주문' : '입금';
      const odReceiptPrice = isVirtualAccount ? 0 : payload.totalAmount;
      const odMisu = Math.max(0, payload.totalAmount - odReceiptPrice);
      const odReceiptTime = isVirtualAccount
        ? '0000-00-00 00:00:00'
        : (payload.appTime || now);
      const cartStatus = odStatus;

      await connection.query(
        `INSERT INTO bomiora_shop_order (
          od_id, mb_id, od_pwd, od_name, od_email, od_tel, od_hp,
          od_zip1, od_zip2, od_addr1, od_addr2, od_addr3, od_addr_jibeon,
          od_b_name, od_b_tel, od_b_hp, od_b_zip1, od_b_zip2, od_b_addr1, od_b_addr2, od_b_addr3, od_b_addr_jibeon,
          od_deposit_name, od_memo, od_cart_count, od_cart_price, od_send_cost, od_send_coupon, od_send_cost2, od_send_cost3,
          od_cart_coupon, od_coupon, od_receipt_price, od_receipt_point, od_bank_account, od_receipt_time, od_misu,
          od_pg, od_tno, od_app_no, od_escrow, od_tax_flag, od_tax_mny, od_vat_mny, od_free_mny,
          od_status, od_shop_memo, od_hope_date, od_time, od_ip, od_settle_case, od_other_pay_type, od_test
        ) VALUES (
          ?, ?, '', ?, ?, ?, ?,
          ?, ?, ?, ?, ?, '',
          ?, ?, ?, ?, ?, ?, ?, ?, '',
          ?, ?, ?, ?, ?, ?, 0, 0,
          ?, ?, ?, ?, ?, ?, ?,
          'kcp', ?, ?, ?, 0, ?, ?, 0,
          ?, '', '', ?, ?, ?, ?, 0
        )`,
        [
          payload.orderId,
          payload.mbId,
          payload.ordererName,
          payload.ordererEmail,
          payload.ordererTel,
          payload.ordererHp,
          payload.receiverZip1,
          payload.receiverZip2,
          payload.receiverAddr1,
          payload.receiverAddr2,
          payload.receiverAddr3,
          payload.receiverName,
          payload.receiverTel,
          payload.receiverHp,
          payload.receiverZip1,
          payload.receiverZip2,
          payload.receiverAddr1,
          payload.receiverAddr2,
          payload.receiverAddr3,
          payload.depositName,
          payload.memo,
          payload.cartCount,
          payload.cartPrice,
          payload.sendCost,
          payload.sendCoupon,
          payload.cartCoupon,
          payload.orderCoupon,
          odReceiptPrice,
          payload.usedPoint,
          payload.bankAccount,
          odReceiptTime,
          odMisu,
          payload.tno,
          payload.appNo,
          payload.escrow ? 1 : 0,
          taxMny,
          vatMny,
          odStatus,
          now,
          payload.ipAddress,
          payload.settleCase,
          payload.otherPayType || '',
        ]
      );

      const placeholders = payload.cartIds.map(() => '?').join(', ');
      await connection.query(
        `UPDATE bomiora_shop_cart
         SET od_id = ?, ct_status = ?, ct_select = 1, ct_settlement_status = 'Y'
         WHERE mb_id = ?
           AND ct_id IN (${placeholders})`,
        [payload.orderId, cartStatus, payload.mbId, ...payload.cartIds]
      );

      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async markVirtualAccountDeposit({ orderId, tno, amount, txTime }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        `SELECT od_id, od_status, od_misu
         FROM bomiora_shop_order
         WHERE od_id = ?
         LIMIT 1`,
        [orderId]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        await connection.rollback();
        return { success: false, message: '주문을 찾을 수 없습니다.' };
      }

      const current = rows[0];
      const currentMisu = Number(current.od_misu || 0);
      const paidAmount = Number(amount || 0);
      const nextMisu = Math.max(0, currentMisu - paidAmount);
      const nextStatus = nextMisu === 0 ? '입금' : current.od_status;
      const receiptTime = this.parseTxTime(txTime) || new Date();

      await connection.query(
        `UPDATE bomiora_shop_order
         SET od_receipt_price = od_receipt_price + ?,
             od_receipt_time = ?,
             od_misu = ?,
             od_status = ?,
             od_tno = CASE WHEN od_tno IS NULL OR od_tno = '' OR od_tno LIKE 'PENDING-%' THEN ? ELSE od_tno END
         WHERE od_id = ?`,
        [paidAmount, receiptTime, nextMisu, nextStatus, String(tno || ''), orderId]
      );

      if (nextMisu === 0) {
        await connection.query(
          `UPDATE bomiora_shop_cart
           SET ct_status = '입금'
           WHERE od_id = ?`,
          [orderId]
        );
      }

      await connection.commit();
      return { success: true, status: nextStatus, misu: nextMisu };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  parseTxTime(raw) {
    const value = String(raw || '').trim();
    if (!/^\d{14}$/.test(value)) return null;
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}`;
  }
}

module.exports = new KcpPayRepository();
