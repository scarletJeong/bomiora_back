const crypto = require('crypto');
const pool = require('../../../../config/database');

/** cp_target 에 들어 있는 ca_id / it_id 목록 (/, |, 쉼표, 공백 구분) */
function parseTargetIds(raw) {
  if (raw == null || raw === '') return [];
  const s = String(raw).trim();
  if (!s) return [];
  return s
    .split(/[/|,\s]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .map((x) => parseInt(x, 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

class CouponRepository {
  async findByUserId(userId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_shop_coupon WHERE mb_id = ? ORDER BY cp_end DESC, cp_no DESC',
      [userId]
    );
    return rows;
  }

  /** 사용 처리: 주문에 연결(od_id) 또는 bomiora_shop_coupon_log에 기록(영카트 방식, cp_id+mb_id) */
  _usedByCouponSql(alias = 'c') {
    return `(
      (${alias}.od_id IS NOT NULL AND ${alias}.od_id > 0)
      OR EXISTS (
        SELECT 1 FROM bomiora_shop_coupon_log l
        WHERE l.mb_id = ${alias}.mb_id AND l.cp_id = ${alias}.cp_id
      )
    )`;
  }

  async findAvailableCoupons(userId) {
    const [rows] = await pool.query(
      `SELECT c.* FROM bomiora_shop_coupon c
       WHERE c.mb_id = ?
         AND c.cp_start <= CURDATE()
         AND c.cp_end >= CURDATE()
         AND NOT ${this._usedByCouponSql('c')}
       ORDER BY c.cp_end ASC, c.cp_no DESC`,
      [userId]
    );
    return rows;
  }

  async findUsedCoupons(userId) {
    // "사용한 쿠폰"의 기준은 coupon_log(bomiora_shop_coupon_log)이며,
    // 사용시간은 log.cl_datetime 이다. 쿠폰 테이블(bomiora_shop_coupon)은 메타 정보 제공용.
    const [rows] = await pool.query(
      `SELECT
         c.cp_no,
         CAST(c.cp_id AS CHAR) AS cp_id,
         c.cp_subject,
         c.cp_method,
         c.cp_target,
         c.mb_id,
         c.cz_id,
         c.cp_start,
         c.cp_end,
         c.cp_price,
         c.cp_type,
         c.cp_trunc,
         c.cp_minimum,
         c.cp_maximum,
         lg.max_od_id AS od_id,
         c.cp_datetime,
         DATE_FORMAT(lg.max_cl_datetime, '%Y-%m-%d %H:%i:%s') AS cl_datetime
       FROM bomiora_shop_coupon c
       JOIN (
         SELECT mb_id, cp_id,
                MAX(cl_datetime) AS max_cl_datetime,
                MAX(od_id) AS max_od_id
         FROM bomiora_shop_coupon_log
         WHERE mb_id = ?
         GROUP BY mb_id, cp_id
       ) lg
         ON lg.mb_id = c.mb_id AND lg.cp_id = c.cp_id
       WHERE c.mb_id = ?
       ORDER BY lg.max_cl_datetime DESC, c.cp_no DESC`,
      [userId, userId]
    );
    return rows;
  }

  async findExpiredCoupons(userId) {
    const [rows] = await pool.query(
      `SELECT c.* FROM bomiora_shop_coupon c
       WHERE c.mb_id = ?
         AND c.cp_end < CURDATE()
         AND NOT ${this._usedByCouponSql('c')}
       ORDER BY c.cp_end DESC, c.cp_no DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * 보미오라 cp_method: 0=제품(it_id), 1=카테고리(ca_id), 2=주문금액, 3=배송비
   */
  buildAppliedProductLine(c, catMap, itemMap) {
    const m = Number(c.cp_method);
    const ids = parseTargetIds(c.cp_target);
    if (m === 0) {
      const names = ids.map((id) => itemMap[id]).filter(Boolean);
      const body = names.length ? names.join(', ') : String(c.cp_target || '').trim() || '지정 상품';
      return `적용상품: ${body} 상품할인`;
    }
    if (m === 1) {
      const names = ids.map((id) => catMap[id]).filter(Boolean);
      const body = names.length ? names.join(', ') : String(c.cp_target || '').trim() || '지정 카테고리';
      return `적용상품: ${body} 상품할인`;
    }
    if (m === 2) {
      return '적용상품: 주문 금액 할인';
    }
    if (m === 3) {
      return '적용상품: 배송비 할인';
    }
    const tail = String(c.cp_target || '').trim();
    if (tail) return `적용상품: ${tail}`;
    return '적용상품: 상세는 결제 시 확인';
  }

  /** 쿠폰 행에 _applied_product 문자열 부착 (API 응답용) */
  async attachAppliedProductLabels(rows) {
    if (!rows || !rows.length) return rows;
    const caIdSet = new Set();
    const itIdSet = new Set();
    for (const r of rows) {
      const m = Number(r.cp_method);
      const ids = parseTargetIds(r.cp_target);
      if (m === 0) ids.forEach((id) => itIdSet.add(id));
      if (m === 1) ids.forEach((id) => caIdSet.add(id));
    }
    const caIds = [...caIdSet];
    const itIds = [...itIdSet];
    const catMap = {};
    const itemMap = {};
    if (caIds.length) {
      const [cats] = await pool.query(
        `SELECT ca_id, ca_name FROM bomiora_shop_category WHERE ca_id IN (${caIds.map(() => '?').join(',')})`,
        caIds
      );
      cats.forEach((row) => {
        catMap[row.ca_id] = row.ca_name;
      });
    }
    if (itIds.length) {
      const [items] = await pool.query(
        `SELECT it_id, it_name FROM bomiora_shop_item_new WHERE it_id IN (${itIds.map(() => '?').join(',')})`,
        itIds
      );
      items.forEach((row) => {
        itemMap[row.it_id] = row.it_name;
      });
    }
    for (const r of rows) {
      r._applied_product = this.buildAppliedProductLine(r, catMap, itemMap);
    }
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
