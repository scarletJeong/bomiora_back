const crypto = require('crypto');
const pool = require('../../../../config/database');
const { addDaysToYmdDateString } = require('../../../../utils/healthDateTime');
const { TtlCache } = require('../../../../utils/ttlCache');

const couponBundleCache = new TtlCache(60_000);

const COUPON_LIST_COLUMNS = `
  c.cp_no,
  CAST(c.cp_id AS CHAR) AS cp_id,
  CAST(c.cp_subject AS CHAR) AS cp_subject,
  c.cp_method,
  CAST(c.cp_target AS CHAR) AS cp_target,
  CAST(c.mb_id AS CHAR) AS mb_id,
  c.cz_id,
  DATE_FORMAT(c.cp_start, '%Y-%m-%d') AS cp_start,
  DATE_FORMAT(c.cp_end, '%Y-%m-%d') AS cp_end,
  c.cp_price,
  c.cp_type,
  c.cp_trunc,
  c.cp_minimum,
  c.cp_maximum,
  c.od_id,
  DATE_FORMAT(c.cp_datetime, '%Y-%m-%d %H:%i:%s') AS cp_datetime
`;

const COUPON_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789';

class HelpCouponError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HelpCouponError';
  }
}

/** PHP cut_str() — UTF-8 문자 단위 절단 */
function cutStr(str, len, suffix = '…') {
  if (str == null || str === '') return '';
  const chars = [...String(str)];
  if (chars.length >= len) {
    return chars.slice(0, len).join('') + (chars.length > len ? suffix : '');
  }
  return chars.join('');
}

/** PHP get_coupon_id() — 16자 + XXXX-XXXX-XXXX-XXXX */
function generateCouponId() {
  let str = '';
  for (let i = 0; i < 16; i += 1) {
    str += COUPON_ID_CHARS[crypto.randomInt(0, COUPON_ID_CHARS.length)];
  }
  return str.replace(
    /([0-9A-Z]{4})([0-9A-Z]{4})([0-9A-Z]{4})([0-9A-Z]{4})/,
    '$1-$2-$3-$4'
  );
}

function kstTodayYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

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
  invalidateMemberCoupons(mbId) {
    const id = String(mbId || '').trim();
    if (id) couponBundleCache.store.delete(`bundle:${id}`);
  }

  _ymd(value) {
    if (value == null) return '';
    return String(value).trim().slice(0, 10);
  }

  _isUsedRow(c, usedMap) {
    if (Number(c.od_id || 0) > 0) return true;
    return usedMap.has(String(c.cp_id || ''));
  }

  /** 회원 쿠폰 + 사용 로그 1세트. 사용/만료/가능 API가 동시에 와도 DB는 1회만. */
  async getMemberCouponBundle(userId) {
    const id = String(userId || '').trim();
    if (!id) return { coupons: [], usedMap: new Map() };
    return couponBundleCache.getOrSet(`bundle:${id}`, () => this._loadMemberCouponBundle(id));
  }

  async _loadMemberCouponBundle(userId) {
    const [couponRows, logRows] = await Promise.all([
      pool.query(
        `SELECT ${COUPON_LIST_COLUMNS}
         FROM bomiora_shop_coupon c
         WHERE c.mb_id = ?
         ORDER BY c.cp_end DESC, c.cp_no DESC`,
        [userId]
      ),
      pool.query(
        `SELECT
           CAST(cp_id AS CHAR) AS cp_id,
           DATE_FORMAT(MAX(cl_datetime), '%Y-%m-%d %H:%i:%s') AS cl_datetime,
           MAX(od_id) AS od_id
         FROM bomiora_shop_coupon_log
         WHERE mb_id = ?
         GROUP BY cp_id`,
        [userId]
      ),
    ]);
    const coupons = couponRows[0] || [];
    const usedMap = new Map();
    for (const row of logRows[0] || []) {
      const cpId = String(row.cp_id || '').trim();
      if (cpId) usedMap.set(cpId, { cl_datetime: row.cl_datetime || null, od_id: row.od_id });
    }
    // 이름 조인 없이 라벨만 (추가 SELECT 제거 — 마이페이지 가용 쿠폰 병목)
    this.attachAppliedProductLabelsFast(coupons);
    return { coupons, usedMap };
  }

  /** DB 조회 없이 cp_method/target 기반 라벨 */
  attachAppliedProductLabelsFast(rows) {
    if (!rows || !rows.length) return rows;
    for (const r of rows) {
      r._applied_product = this.buildAppliedProductLine(r, {}, {});
    }
    return rows;
  }

  async findByUserId(userId) {
    const { coupons } = await this.getMemberCouponBundle(userId);
    return coupons;
  }

  async findAvailableCoupons(userId) {
    const { coupons, usedMap } = await this.getMemberCouponBundle(userId);
    const today = kstTodayYmd();
    return coupons
      .filter((c) => {
        if (this._isUsedRow(c, usedMap)) return false;
        const start = this._ymd(c.cp_start);
        const end = this._ymd(c.cp_end);
        return start && end && start <= today && end >= today;
      })
      .sort((a, b) => String(a.cp_end || '').localeCompare(String(b.cp_end || '')) || Number(b.cp_no || 0) - Number(a.cp_no || 0));
  }

  async findUsedCoupons(userId) {
    const { coupons, usedMap } = await this.getMemberCouponBundle(userId);
    return coupons
      .filter((c) => this._isUsedRow(c, usedMap))
      .map((c) => {
        const log = usedMap.get(String(c.cp_id || '')) || {};
        return {
          ...c,
          od_id: log.od_id || c.od_id,
          cl_datetime: log.cl_datetime || null,
        };
      })
      .sort((a, b) => String(b.cl_datetime || '').localeCompare(String(a.cl_datetime || '')));
  }

  async findExpiredCoupons(userId) {
    const { coupons, usedMap } = await this.getMemberCouponBundle(userId);
    const today = kstTodayYmd();
    return coupons.filter((c) => {
      if (this._isUsedRow(c, usedMap)) return false;
      const end = this._ymd(c.cp_end);
      return end && end < today;
    });
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
        `SELECT CAST(ca_id AS CHAR) AS ca_id, CAST(ca_name AS CHAR) AS ca_name
         FROM bomiora_shop_category WHERE ca_id IN (${caIds.map(() => '?').join(',')})`,
        caIds
      );
      cats.forEach((row) => {
        catMap[row.ca_id] = row.ca_name;
      });
    }
    if (itIds.length) {
      const [items] = await pool.query(
        `SELECT CAST(it_id AS CHAR) AS it_id, CAST(it_name AS CHAR) AS it_name
         FROM bomiora_shop_item_new WHERE it_id IN (${itIds.map(() => '?').join(',')})`,
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
    this.invalidateMemberCoupons(data.mb_id);
  }

  async _generateUniqueCouponId(conn, maxRetries = 8) {
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const cpId = generateCouponId();
      const [rows] = await conn.query(
        'SELECT COUNT(*) AS count FROM bomiora_shop_coupon WHERE cp_id = ?',
        [cpId]
      );
      if (Number(rows[0].count) === 0) return cpId;
    }
    throw new Error('쿠폰 ID 생성에 실패했습니다.');
  }

  /**
   * PHP shop/ajax.infcoupondownload.php 와 동일한 트랜잭션:
   * 리뷰 검증 → 중복 차단 → it_nocoupon → INSERT 쿠폰 → cz_download +1
   */
  async downloadHelpCoupon({ mbId, itId, isId }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [reviewRows] = await conn.query(
        `SELECT a.is_id, a.is_name, a.cz_download, c.it_id,
                COALESCE(c.it_name, c.it_subject) AS it_name
         FROM bomiora_shop_item_use a
         JOIN bomiora_shop_item_new c ON a.it_id = c.it_id
         WHERE c.it_id = ? AND a.is_id = ?
           AND a.is_rvkind = 'supporter' AND a.is_confirm = 1`,
        [itId, isId]
      );
      if (!reviewRows.length) {
        throw new HelpCouponError('제품 또는 리뷰가 존재하지 않습니다.');
      }
      const review = reviewRows[0];

      const [dupRows] = await conn.query(
        'SELECT COUNT(*) AS count FROM bomiora_shop_coupon WHERE mb_id = ? AND is_id = ?',
        [mbId, isId]
      );
      if (Number(dupRows[0].count) > 0) {
        throw new HelpCouponError('이미 다운로드하신 쿠폰입니다.');
      }

      const [itemRows] = await conn.query(
        `SELECT COUNT(*) AS count FROM bomiora_shop_item_new
         WHERE it_id = ? AND COALESCE(it_nocoupon, '0') = '0'`,
        [itId]
      );
      if (!Number(itemRows[0].count)) {
        throw new HelpCouponError('쿠폰이 적용되지 않는 제품 입니다.');
      }

      const cpId = await this._generateUniqueCouponId(conn);
      const cpStart = kstTodayYmd();
      const cpEnd = addDaysToYmdDateString(cpStart, 6);
      const cpSubject = `[도움쿠폰] ${review.is_name}님의 ${cutStr(review.it_name, 5)} 할인쿠폰 (5%)`;

      await conn.query(
        `INSERT INTO bomiora_shop_coupon
          (cp_id, cp_subject, cp_method, cp_target, mb_id, cz_id, cp_start, cp_end,
           cp_type, cp_price, cp_trunc, cp_minimum, cp_maximum, od_id, cp_datetime, mb_inf_id, is_id)
         VALUES (?, ?, 0, ?, ?, 0, ?, ?, 1, 5, 1, 5000, 5000, 0, NOW(), '', ?)`,
        [cpId, cpSubject, itId, mbId, cpStart, cpEnd, isId]
      );

      await conn.query(
        'UPDATE bomiora_shop_item_use SET cz_download = cz_download + 1 WHERE is_id = ?',
        [isId]
      );

      await conn.commit();
      this.invalidateMemberCoupons(mbId);

      return {
        cpId,
        downloadCount: Number(review.cz_download || 0) + 1
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
}

module.exports = new CouponRepository();
module.exports.HelpCouponError = HelpCouponError;
