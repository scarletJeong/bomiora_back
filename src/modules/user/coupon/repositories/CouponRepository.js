const crypto = require('crypto');
const pool = require('../../../../config/database');

class CouponRepository {
  async findByUserId(userId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_shop_coupon WHERE mb_id = ? ORDER BY cp_end DESC, cp_no DESC',
      [userId]
    );
    return rows;
  }

  async findAvailableCoupons(userId) {
    const [rows] = await pool.query(
      `SELECT * FROM bomiora_shop_coupon
       WHERE mb_id = ?
         AND cp_start <= CURDATE()
         AND cp_end >= CURDATE()
         AND (od_id IS NULL OR od_id = 0)
       ORDER BY cp_end ASC, cp_no DESC`,
      [userId]
    );
    return rows;
  }

  async findUsedCoupons(userId) {
    const [rows] = await pool.query(
      `SELECT * FROM bomiora_shop_coupon
       WHERE mb_id = ? AND od_id IS NOT NULL AND od_id > 0
       ORDER BY cp_datetime DESC, cp_no DESC`,
      [userId]
    );
    return rows;
  }

  async findExpiredCoupons(userId) {
    const [rows] = await pool.query(
      `SELECT * FROM bomiora_shop_coupon
       WHERE mb_id = ?
         AND cp_end < CURDATE()
         AND (od_id IS NULL OR od_id = 0)
       ORDER BY cp_end DESC, cp_no DESC`,
      [userId]
    );
    return rows;
  }

  async findByCouponId(couponId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_shop_coupon WHERE cp_id = ? LIMIT 1',
      [couponId]
    );
    return rows.length ? rows[0] : null;
  }

  async findByCouponIdAndUserId(couponId, userId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_shop_coupon WHERE cp_id = ? AND mb_id = ? LIMIT 1',
      [couponId, userId]
    );
    return rows.length ? rows[0] : null;
  }

  async existsByUserIdAndReviewId(userId, reviewId) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bomiora_shop_coupon WHERE mb_id = ? AND is_id = ?',
      [userId, reviewId]
    );
    return rows[0].count > 0;
  }

  async create(data) {
    await pool.query(
      `INSERT INTO bomiora_shop_coupon
      (cp_id, cp_subject, cp_method, cp_target, mb_id, cz_id, cp_start, cp_end, cp_price, cp_type, cp_trunc,
       cp_minimum, cp_maximum, od_id, cp_datetime, mb_inf_id, is_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.cp_id, data.cp_subject, data.cp_method, data.cp_target, data.mb_id, data.cz_id,
        data.cp_start, data.cp_end, data.cp_price, data.cp_type, data.cp_trunc,
        data.cp_minimum, data.cp_maximum, data.od_id, data.cp_datetime, data.mb_inf_id, data.is_id
      ]
    );
  }

  async createHelpCoupon({ mbId, itId, reviewId, reviewerName, productName }) {
    const cpId = `HELP_${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
    const shortName = productName ? (productName.length > 10 ? `${productName.substring(0, 10)}...` : productName) : '제품';
    const cpSubject = `[도움쿠폰] ${reviewerName || '익명'}님의 ${shortName} 할인쿠폰 (5%)`;

    await this.create({
      cp_id: cpId,
      cp_subject: cpSubject,
      cp_method: 0,
      cp_target: itId,
      mb_id: mbId,
      cz_id: 0,
      cp_start: new Date(),
      cp_end: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      cp_price: 5,
      cp_type: 1,
      cp_trunc: 1,
      cp_minimum: 5000,
      cp_maximum: 5000,
      od_id: 0,
      cp_datetime: new Date(),
      mb_inf_id: '',
      is_id: reviewId
    });

    return cpId;
  }
}

module.exports = new CouponRepository();
