const crypto = require('crypto');
const pool = require('../../../../config/database');
const { addDaysToYmdDateString, formatSqlDateOnlyForApi } = require('../../../../utils/healthDateTime');
const { TtlCache } = require('../../../../utils/ttlCache');

const couponBundleCache = new TtlCache(180_000);

const COUPON_LIST_COLUMNS = `
  c.cp_no,
  c.cp_id,
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
  c.od_id,
  c.cp_datetime
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
    .filter((x) => x.length > 0);
}

class CouponRepository {
  invalidateMemberCoupons(mbId) {
    const id = String(mbId || '').trim();
    if (id) couponBundleCache.store.delete(`bundle:${id}`);
  }

  _ymd(value) {
    return formatSqlDateOnlyForApi(value) || '';
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
           cp_id,
           MAX(cl_datetime) AS cl_datetime,
           MAX(od_id) AS od_id
         FROM bomiora_shop_coupon_log
         WHERE mb_id = ?
         GROUP BY cp_id`,
        [userId]
      ),
    ]);
    const coupons = couponRows[0] || [];
    for (const c of coupons) {
      c.cp_start = this._ymd(c.cp_start);
      c.cp_end = this._ymd(c.cp_end);
    }
    const usedMap = new Map();
    for (const row of logRows[0] || []) {
      const cpId = String(row.cp_id || '').trim();
      if (cpId) usedMap.set(cpId, { cl_datetime: row.cl_datetime || null, od_id: row.od_id });
    }
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
      const names = ids.map((id) => itemMap[String(id)]).filter(Boolean);
      const body = names.length ? names.join(', ') : '지정 상품';
      return `적용상품: ${body}`;
    }
    if (m === 1) {
      const names = ids.map((id) => catMap[String(id)]).filter(Boolean);
      const body = names.length
        ? names.map((name) => `${name} 상품 전체`).join(', ')
        : '지정 카테고리 상품 전체';
      return `적용상품: ${body}`;
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
        catMap[String(row.ca_id)] = String(row.ca_name || '').trim();
      });
    }
    if (itIds.length) {
      const [items] = await pool.query(
        `SELECT CAST(it_id AS CHAR) AS it_id, CAST(it_name AS CHAR) AS it_name
         FROM bomiora_shop_item_new WHERE it_id IN (${itIds.map(() => '?').join(',')})`,
        itIds
      );
      items.forEach((row) => {
        itemMap[String(row.it_id)] = String(row.it_name || '').trim();
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

  async countAvailableCoupons(userId) {
    const list = await this.findAvailableCoupons(userId);
    return list.length;
  }

  /**
   * 도움쿠폰 발급 — 성공 경로는 INSERT…SELECT 1회.
   * cz_download 증가는 응답 후 비동기.
   */
  async downloadHelpCoupon({ mbId, itId, isId }) {
    const cpStart = kstTodayYmd();
    const cpEnd = addDaysToYmdDateString(cpStart, 6);
    const insertSql = `
      INSERT INTO bomiora_shop_coupon
        (cp_id, cp_subject, cp_method, cp_target, mb_id, cz_id, cp_start, cp_end,
         cp_type, cp_price, cp_trunc, cp_minimum, cp_maximum, od_id, cp_datetime, mb_inf_id, is_id)
      SELECT
        ?,
        CONCAT(
          '[도움쿠폰] ', a.is_name, '님의 ',
          CASE
            WHEN CHAR_LENGTH(COALESCE(c.it_name, c.it_subject, '')) > 5
              THEN CONCAT(LEFT(COALESCE(c.it_name, c.it_subject, ''), 5), '…')
            ELSE COALESCE(c.it_name, c.it_subject, '')
          END,
          ' 할인쿠폰 (5%)'
        ),
        0, c.it_id, ?, 0, ?, ?, 1, 5, 1, 5000, 5000, 0, NOW(), '', a.is_id
      FROM bomiora_shop_item_use a
      INNER JOIN bomiora_shop_item_new c ON a.it_id = c.it_id
      WHERE c.it_id = ? AND a.is_id = ?
        AND a.is_rvkind = 'supporter' AND a.is_confirm = 1
        AND COALESCE(c.it_nocoupon, '0') = '0'
        AND NOT EXISTS (
          SELECT 1 FROM bomiora_shop_coupon x
           WHERE x.mb_id = ? AND x.is_id = ?
        )`;

    let cpId = '';
    let inserted = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      cpId = generateCouponId();
      try {
        const [result] = await pool.execute(insertSql, [
          cpId,
          mbId,
          cpStart,
          cpEnd,
          itId,
          isId,
          mbId,
          isId,
        ]);
        inserted = Number(result?.affectedRows || 0) > 0;
        break;
      } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY' && attempt === 0) {
          continue;
        }
        throw error;
      }
    }

    if (!inserted) {
      await this._throwHelpCouponFailReason({ mbId, itId, isId });
    }

    pool
      .execute(
        'UPDATE bomiora_shop_item_use SET cz_download = cz_download + 1 WHERE is_id = ?',
        [isId]
      )
      .catch(() => {});
    this.invalidateMemberCoupons(mbId);

    return { cpId, downloadCount: null };
  }

  async _throwHelpCouponFailReason({ mbId, itId, isId }) {
    const [rows] = await pool.execute(
      `SELECT
          a.is_id,
          a.is_rvkind,
          a.is_confirm,
          COALESCE(c.it_nocoupon, '0') AS it_nocoupon,
          (SELECT COUNT(*) FROM bomiora_shop_coupon x
            WHERE x.mb_id = ? AND x.is_id = ?) AS already
         FROM bomiora_shop_item_use a
         LEFT JOIN bomiora_shop_item_new c ON a.it_id = c.it_id
        WHERE a.is_id = ? AND a.it_id = ?
        LIMIT 1`,
      [mbId, isId, isId, itId]
    );
    if (!rows.length) {
      throw new HelpCouponError('제품 또는 리뷰가 존재하지 않습니다.');
    }
    const row = rows[0];
    if (Number(row.already || 0) > 0) {
      throw new HelpCouponError('이미 다운로드하신 쿠폰입니다.');
    }
    if (String(row.is_rvkind || '') !== 'supporter' || Number(row.is_confirm) !== 1) {
      throw new HelpCouponError('제품 또는 리뷰가 존재하지 않습니다.');
    }
    if (String(row.it_nocoupon || '0') !== '0') {
      throw new HelpCouponError('쿠폰이 적용되지 않는 제품 입니다.');
    }
    throw new HelpCouponError('쿠폰 발급에 실패했습니다.');
  }

  parseCheckoutCoupons(body = {}) {
    const fromList = Array.isArray(body.coupons) ? body.coupons : [];
    const fromIds = Array.isArray(body.cp_ids)
      ? body.cp_ids
      : Array.isArray(body.cpIds)
        ? body.cpIds
        : [];
    const map = new Map();
    for (const row of fromList) {
      const cpId = String(row?.cp_id || row?.cpId || '').trim();
      if (!cpId) continue;
      const discount = Math.max(0, Number(row?.discount ?? row?.cp_price ?? 0) || 0);
      map.set(cpId, { cp_id: cpId, discount });
    }
    for (const raw of fromIds) {
      const cpId = String(raw || '').trim();
      if (!cpId || map.has(cpId)) continue;
      map.set(cpId, { cp_id: cpId, discount: 0 });
    }
    return [...map.values()];
  }

  _asText(value) {
    if (value == null) return '';
    if (Buffer.isBuffer(value)) return value.toString('utf8').replace(/\0/g, '').trim();
    return String(value).replace(/\0/g, '').trim();
  }

  _isInfluencerCart(cart) {
    return this._asText(cart?.ct_mb_inf).length > 0;
  }

  _cartCategoryIds(cart) {
    return [
      cart?.product_ca_id ?? cart?.ca_id,
      cart?.product_ca_id2 ?? cart?.ca_id2,
      cart?.product_ca_id3 ?? cart?.ca_id3,
    ]
      .map((v) => this._asText(v).toLowerCase())
      .filter((v) => v.length > 0);
  }

  _matchesCategoryTarget(cart, target) {
    const t = this._asText(target).toLowerCase();
    if (!t) return true;
    return this._cartCategoryIds(cart).includes(t);
  }

  /**
   * 영카트형 할인: cp_type=1 이면 비율(+trunc), 아니면 정액. cp_maximum 상한.
   */
  computeCouponDiscount(couponRow, baseAmount) {
    const base = Math.max(0, Number(baseAmount || 0) || 0);
    if (base <= 0) return 0;
    const price = Math.max(0, Number(couponRow.cp_price || 0) || 0);
    const type = Number(couponRow.cp_type || 0);
    const trunc = Math.max(1, Number(couponRow.cp_trunc || 0) || 1);
    const maximum = Math.max(0, Number(couponRow.cp_maximum || 0) || 0);
    let discount = 0;
    if (type === 1) {
      discount = Math.floor((base * (price / 100)) / trunc) * trunc;
    } else {
      discount = price;
    }
    if (maximum > 0 && discount > maximum) discount = maximum;
    if (discount > base) discount = base;
    return discount < 0 ? 0 : discount;
  }

  /**
   * @param {object} context
   * @param {Array} context.carts 장바구니(+product_ca_id*)
   * @param {(cart)=>number} context.lineAmountOf 라인 결제액
   * @param {number} [context.baseShipping=0] 기본 배송비(배송비 쿠폰용)
   */
  buildCheckoutCouponContext(context = {}) {
    const carts = Array.isArray(context.carts) ? context.carts : [];
    const lineAmountOf =
      typeof context.lineAmountOf === 'function'
        ? context.lineAmountOf
        : (c) => Math.max(0, Number(c?.ct_price || 0) || 0);
    const baseShipping = Math.max(0, Number(context.baseShipping || 0) || 0);

    const eligible = carts.filter((c) => !this._isInfluencerCart(c));
    const nonInfluencerAmount = eligible.reduce(
      (sum, c) => sum + Math.max(0, lineAmountOf(c) || 0),
      0
    );
    const shippingGoodsAmount = eligible.reduce((sum, c) => {
      const kind = this._asText(c.ct_kind).toLowerCase();
      if (kind && kind !== 'general' && kind !== 'prescription') return sum;
      return sum + Math.max(0, lineAmountOf(c) || 0);
    }, 0);

    return {
      carts,
      eligible,
      lineAmountOf,
      baseShipping,
      nonInfluencerAmount,
      shippingGoodsAmount,
      couponPointDisabled: nonInfluencerAmount <= 0,
    };
  }

  baseAmountForCoupon(couponRow, ctx) {
    const method = Number(couponRow.cp_method || 0);
    const target = this._asText(couponRow.cp_target);
    if (method === 3) return ctx.baseShipping;
    if (ctx.couponPointDisabled) return 0;
    if (method === 0) {
      if (!target) return ctx.nonInfluencerAmount;
      return ctx.eligible
        .filter((c) => this._asText(c.it_id) === target)
        .reduce((sum, c) => sum + Math.max(0, ctx.lineAmountOf(c) || 0), 0);
    }
    if (method === 1) {
      if (!target) return ctx.nonInfluencerAmount;
      return ctx.eligible
        .filter((c) => this._matchesCategoryTarget(c, target))
        .reduce((sum, c) => sum + Math.max(0, ctx.lineAmountOf(c) || 0), 0);
    }
    // method 2 주문금액 등
    return ctx.nonInfluencerAmount;
  }

  assertCouponStacking(resolvedRows) {
    const methods = resolvedRows.map((r) => Number(r.cp_method || 0));
    const count = (m) => methods.filter((x) => x === m).length;
    if (count(3) > 1) throw new Error('배송비 쿠폰은 1장만 사용할 수 있습니다.');
    if (count(1) > 2) throw new Error('카테고리 쿠폰은 최대 2장까지 사용할 수 있습니다.');
    if (count(0) > 1) throw new Error('개별상품 쿠폰은 1장만 사용할 수 있습니다.');
    if (count(2) > 1) throw new Error('주문금액 쿠폰은 1장만 사용할 수 있습니다.');
    const hasProduct = count(0) > 0;
    const hasCategory = count(1) > 0;
    const hasOrder = count(2) > 0;
    if ([hasProduct, hasCategory, hasOrder].filter(Boolean).length > 1) {
      throw new Error('상품·카테고리·주문금액 쿠폰은 함께 사용할 수 없습니다.');
    }
  }

  /**
   * 체크아웃 쿠폰 최종 검증.
   * 소유/기간/사용여부 + 대상/최소금액/인플루언서 제외 + 서버 할인 재계산.
   * claimedDiscount 가 서버 합계와 다르면 거절한다(클라이언트 할인액 신뢰 금지).
   */
  async assertUsableCheckoutCoupons(mbId, checkoutCoupons, claimedDiscount, context = {}) {
    const list = Array.isArray(checkoutCoupons) ? checkoutCoupons : [];
    const claimed = Math.max(0, Number(claimedDiscount || 0) || 0);
    if (claimed > 0 && list.length === 0) {
      throw new Error('쿠폰 할인 금액이 있으나 쿠폰 ID가 없습니다.');
    }
    if (list.length === 0) return [];

    const ctx = this.buildCheckoutCouponContext(context);
    if (ctx.couponPointDisabled) {
      throw new Error('인플루언서 상품에는 쿠폰을 사용할 수 없습니다.');
    }

    const { coupons, usedMap } = await this.getMemberCouponBundle(mbId);
    const byId = new Map(coupons.map((c) => [String(c.cp_id || '').trim(), c]));
    const today = kstTodayYmd();
    const resolved = [];

    for (const item of list) {
      const cpId = String(item.cp_id || '').trim();
      const row = byId.get(cpId);
      if (!row) throw new Error('사용할 수 없는 쿠폰입니다.');
      if (String(row.mb_id || '').trim() !== String(mbId).trim()) {
        throw new Error('본인 쿠폰만 사용할 수 있습니다.');
      }
      if (this._isUsedRow(row, usedMap)) {
        throw new Error('이미 사용한 쿠폰입니다.');
      }
      const start = this._ymd(row.cp_start);
      const end = this._ymd(row.cp_end);
      if (!start || !end || start > today || end < today) {
        throw new Error('유효기간이 지난 쿠폰입니다.');
      }

      const method = Number(row.cp_method || 0);
      const minimum = Math.max(0, Number(row.cp_minimum || 0) || 0);

      if (method === 3) {
        if (ctx.baseShipping <= 0) {
          throw new Error('배송비가 없어 배송비 쿠폰을 사용할 수 없습니다.');
        }
        if (ctx.shippingGoodsAmount < minimum) {
          throw new Error('배송비 쿠폰 최소 주문금액에 미달합니다.');
        }
      } else {
        const base = this.baseAmountForCoupon(row, ctx);
        if (base <= 0) {
          throw new Error('쿠폰 적용 대상 상품이 없습니다.');
        }
        if (base < minimum) {
          throw new Error('쿠폰 최소 주문금액에 미달합니다.');
        }
      }

      const baseAmount = this.baseAmountForCoupon(row, ctx);
      const discount = this.computeCouponDiscount(row, baseAmount);
      if (discount <= 0) {
        throw new Error('쿠폰 할인 금액이 올바르지 않습니다.');
      }

      const clientDiscount = Math.max(0, Number(item.discount || 0) || 0);
      if (clientDiscount > 0 && clientDiscount !== discount) {
        const err = new Error(
          `쿠폰 할인 금액이 서버 계산과 다릅니다. (쿠폰 ${cpId}, 요청 ${clientDiscount} / 서버 ${discount})`
        );
        err.code = 'COUPON_DISCOUNT_MISMATCH';
        err.expected = { cp_id: cpId, discount };
        throw err;
      }

      resolved.push({
        cp_id: cpId,
        discount,
        cp_method: method,
      });
    }

    this.assertCouponStacking(resolved);

    // 상품 쿠폰 합은 비인플 상품액, 배송비 쿠폰은 기본 배송비를 넘지 않게
    let productSum = 0;
    let shippingSum = 0;
    for (const r of resolved) {
      if (Number(r.cp_method) === 3) shippingSum += r.discount;
      else productSum += r.discount;
    }
    if (productSum > ctx.nonInfluencerAmount) {
      throw new Error('상품 쿠폰 할인 금액이 주문 금액을 초과합니다.');
    }
    if (shippingSum > ctx.baseShipping) {
      throw new Error('배송비 쿠폰은 기본 배송비 안에서만 사용할 수 있습니다.');
    }

    const serverSum = productSum + shippingSum;
    if (claimed !== serverSum) {
      const err = new Error(
        `쿠폰 할인 금액이 일치하지 않습니다. (요청 ${claimed} / 서버 ${serverSum})`
      );
      err.code = 'COUPON_DISCOUNT_MISMATCH';
      err.expected = { coupon_discount: serverSum, coupons: resolved };
      throw err;
    }

    return resolved;
  }

  async consumeCouponsForOrder(connection, { mbId, odId, coupons }) {
    const list = Array.isArray(coupons) ? coupons : [];
    if (!list.length) return;
    const q = connection || pool;
    for (const c of list) {
      const cpId = String(c.cp_id || '').trim();
      if (!cpId) continue;
      const discount = Math.max(0, Number(c.discount || 0) || 0);
      await q.query(
        `INSERT INTO bomiora_shop_coupon_log (cp_id, mb_id, od_id, cp_price, cl_datetime)
         VALUES (?, ?, ?, ?, NOW())`,
        [cpId, mbId, odId, discount]
      );
      await q.query(
        `UPDATE bomiora_shop_coupon SET od_id = ? WHERE cp_id = ? AND mb_id = ?`,
        [odId, cpId, mbId]
      );
    }
    this.invalidateMemberCoupons(mbId);
  }
}

module.exports = new CouponRepository();
module.exports.HelpCouponError = HelpCouponError;
