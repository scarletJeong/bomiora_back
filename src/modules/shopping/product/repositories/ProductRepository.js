const pool = require('../../../../config/database');

/** 목록/카드용 — LONGTEXT·여분 이미지 제외 */
const LIST_COLUMNS = `
  CAST(it_id AS CHAR) AS it_id,
  CAST(it_name AS CHAR) AS it_name,
  CAST(LEFT(IFNULL(it_basic, ''), 200) AS CHAR) AS it_basic,
  CAST(it_subject AS CHAR) AS it_subject,
  it_price, it_cust_price,
  CAST(ca_id AS CHAR) AS ca_id,
  CAST(it_kind AS CHAR) AS it_kind,
  it_type3, it_type4, it_type5, it_stock_qty,
  it_use_avg, it_use_cnt,
  CAST(it_flutter_image_url AS CHAR) AS it_flutter_image_url,
  CAST(it_img1 AS CHAR) AS it_img1,
  it_sc_type, it_sc_price, it_sc_minimum,
  CAST(it_depopt1_subject AS CHAR) AS it_depopt1_subject,
  CAST(it_depopt1_label AS CHAR) AS it_depopt1_label,
  CAST(it_depopt2_subject AS CHAR) AS it_depopt2_subject,
  CAST(it_depopt2_label AS CHAR) AS it_depopt2_label,
  CAST(LEFT(IFNULL(it_supply_items, ''), 400) AS CHAR) AS it_supply_items,
  it_order
`;

/** 상세용 — 본문 HTML은 필요 필드만, 이미지 1~5만 */
const DETAIL_COLUMNS = `
  CAST(it_id AS CHAR) AS it_id,
  CAST(it_name AS CHAR) AS it_name,
  CAST(it_basic AS CHAR) AS it_basic,
  CAST(it_subject AS CHAR) AS it_subject,
  it_explan,
  CAST(LEFT(IFNULL(it_precautions, ''), 8000) AS CHAR) AS it_precautions,
  CAST(LEFT(IFNULL(it_baesong_content, ''), 8000) AS CHAR) AS it_baesong_content,
  CAST(LEFT(IFNULL(it_shipping_process, ''), 8000) AS CHAR) AS it_shipping_process,
  CAST(LEFT(IFNULL(it_change_content, ''), 8000) AS CHAR) AS it_change_content,
  CAST(it_prescription AS CHAR) AS it_prescription,
  CAST(it_takeway AS CHAR) AS it_takeway,
  CAST(it_package AS CHAR) AS it_package,
  CAST(it_maker AS CHAR) AS it_maker,
  CAST(it_origin AS CHAR) AS it_origin,
  CAST(it_brand AS CHAR) AS it_brand,
  CAST(it_model AS CHAR) AS it_model,
  CAST(it_option_subject AS CHAR) AS it_option_subject,
  CAST(it_supply_subject AS CHAR) AS it_supply_subject,
  CAST(it_supply_items AS CHAR) AS it_supply_items,
  CAST(it_depopt1_subject AS CHAR) AS it_depopt1_subject,
  CAST(it_depopt1_label AS CHAR) AS it_depopt1_label,
  CAST(it_depopt2_subject AS CHAR) AS it_depopt2_subject,
  CAST(it_depopt2_label AS CHAR) AS it_depopt2_label,
  CAST(it_weight AS CHAR) AS it_weight,
  it_point, it_point_type,
  CAST(it_mb_inf AS CHAR) AS it_mb_inf,
  it_price, it_cust_price, it_stock_qty, it_use_avg, it_use_cnt,
  it_type3, it_type4,
  CAST(ca_id AS CHAR) AS ca_id,
  CAST(it_kind AS CHAR) AS it_kind,
  it_sc_type, it_sc_price, it_sc_minimum,
  CAST(it_flutter_image_url AS CHAR) AS it_flutter_image_url,
  CAST(it_img1 AS CHAR) AS it_img1,
  CAST(it_img2 AS CHAR) AS it_img2,
  CAST(it_img3 AS CHAR) AS it_img3,
  CAST(it_img4 AS CHAR) AS it_img4,
  CAST(it_img5 AS CHAR) AS it_img5
`;

class ProductRepository {
  async findByCategory(categoryId, productKind, page, pageSize) {
    const offset = (page - 1) * pageSize;
    const hasKind = productKind != null && String(productKind).trim() !== '';

    const params = [categoryId];
    let where = 'ca_id = ? AND it_use = 1';
    if (hasKind) {
      where += ' AND it_kind = ?';
      params.push(productKind);
    }

    const [rows] = await pool.query(
      `SELECT ${LIST_COLUMNS} FROM bomiora_shop_item_new
       WHERE ${where}
       ORDER BY it_order ASC, it_id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), Number(offset)]
    );
    return rows;
  }

  async findById(productId) {
    try {
      const [rows] = await pool.query(
        `SELECT ${DETAIL_COLUMNS} FROM bomiora_shop_item_new WHERE it_id = ? LIMIT 1`,
        [productId]
      );
      return rows.length ? rows[0] : null;
    } catch (err) {
      if (err && (err.errno === 1054 || err.code === 'ER_BAD_FIELD_ERROR')) {
        const [rows] = await pool.query(
          'SELECT * FROM bomiora_shop_item_new WHERE it_id = ? LIMIT 1',
          [productId]
        );
        return rows.length ? rows[0] : null;
      }
      throw err;
    }
  }

  /** it_id 목록으로 상품 조회 (연결상품 등) */
  async findByIds(productIds) {
    const ids = (productIds || [])
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT * FROM bomiora_shop_item_new
       WHERE it_id IN (${placeholders}) AND it_use = 1`,
      ids
    );
    // 요청 순서 유지
    const byId = new Map(
      rows.map((r) => [String(r.it_id != null ? r.it_id : '').trim(), r])
    );
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  /** 연결상품 목록용 — 카드에 필요한 컬럼만 */
  async findSupplySummariesByIds(productIds) {
    const ids = (productIds || [])
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT
          it_id, it_name, it_basic, it_subject, it_price, it_cust_price,
          ca_id, it_kind, it_stock_qty, it_flutter_image_url,
          it_img1, it_img2, it_img3, it_option_subject, it_mb_inf,
          it_supply_items
         FROM bomiora_shop_item_new
        WHERE it_id IN (${placeholders}) AND it_use = 1`,
      ids
    );
    const byId = new Map(
      rows.map((r) => [String(r.it_id != null ? r.it_id : '').trim(), r])
    );
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  /** 연결상품 id CSV만 조회 */
  async findSupplyItemIds(productId) {
    const [rows] = await pool.query(
      `SELECT it_id, it_supply_items
         FROM bomiora_shop_item_new
        WHERE it_id = ? AND it_use = 1
        LIMIT 1`,
      [productId]
    );
    return rows.length ? rows[0] : null;
  }

  async findBestProducts(limit) {
    const [rows] = await pool.query(
      `SELECT ${LIST_COLUMNS} FROM bomiora_shop_item_new
       WHERE it_type4 = 1 AND it_use = 1
       ORDER BY it_order ASC, it_id DESC
       LIMIT ?`,
      [Number(limit)]
    );
    return rows;
  }

  async findNewProducts(limit) {
    const [rows] = await pool.query(
      `SELECT ${LIST_COLUMNS} FROM bomiora_shop_item_new
       WHERE it_type3 = 1 AND it_use = 1
       ORDER BY it_order ASC, it_id DESC
       LIMIT ?`,
      [Number(limit)]
    );
    return rows;
  }

  /**
   * 웹 get_categories_with_products($it_kind) — 판매 중 상품이 있는 1단계 카테고리
   * @param {string} productKind prescription | general
   */
  async findCategoriesWithProducts(productKind) {
    const kind = String(productKind || '').trim();
    if (!kind) return [];

    const [rows] = await pool.query(
      `SELECT DISTINCT c.ca_id, c.ca_name, c.ca_order
         FROM bomiora_shop_category c
         INNER JOIN bomiora_shop_item_new i ON (
           i.ca_id LIKE CONCAT(c.ca_id, '%')
           OR i.ca_id2 LIKE CONCAT(c.ca_id, '%')
           OR i.ca_id3 LIKE CONCAT(c.ca_id, '%')
         )
        WHERE c.ca_use = '1'
          AND c.ca_menu_show = '1'
          AND i.it_kind = ?
          AND i.it_use = '1'
          AND CHAR_LENGTH(c.ca_id) = 2
        ORDER BY c.ca_order, c.ca_id`,
      [kind]
    );
    return rows;
  }

  /**
   * MD pick (웹 get_new_product) — it_type5 = 1
   * @param {number} limit
   * @param {string|null} productKind it_kind 필터 (예: general)
   */
  async findMdPickProducts(limit, productKind = null) {
    const hasKind = productKind != null && String(productKind).trim() !== '';
    const params = [];
    let where = `it_use = 1 AND it_type5 = 1 AND (it_mb_inf = '' OR it_mb_inf IS NULL)`;
    if (hasKind) {
      where += ' AND it_kind = ?';
      params.push(productKind);
    }

    const [rows] = await pool.query(
      `SELECT ${LIST_COLUMNS} FROM bomiora_shop_item_new
       WHERE ${where}
       ORDER BY it_order ASC, it_id DESC
       LIMIT ?`,
      [...params, Number(limit)]
    );
    return rows;
  }

  /**
   * 키워드 검색 (상품명/요약/설명/본문 일부)
   * - it_kind: 'prescription' | 'general' 등
   * - limit: 최대 반환 개수
   */
  async searchByKeyword(query, productKind, limit = 20) {
    const q = String(query || '').trim();
    if (!q) return [];

    const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.floor(Number(limit))) : 20;
    const keyword = `%${q}%`;

    const hasKind = productKind != null && String(productKind).trim() !== '';
    // 요구사항: it_name, it_basic 기준 검색
    const params = [keyword, keyword];
    // NOTE: 일부 DB 스키마에서는 it_explain 컬럼이 없고 it_explan만 존재합니다.
    // 존재하지 않는 컬럼을 COALESCE에 넣어도 SQL 에러가 나므로 it_explan만 사용합니다.
    let where = `
      it_use = 1
      AND (
        it_name LIKE ?
        OR it_basic LIKE ?
      )
    `;
    if (hasKind) {
      where += ' AND it_kind = ?';
      params.push(productKind);
    }

    const [rows] = await pool.query(
      `SELECT ${LIST_COLUMNS}
         FROM bomiora_shop_item_new
        WHERE ${where}
        ORDER BY it_order ASC, it_id DESC
        LIMIT ?`,
      [...params, safeLimit]
    );
    return rows;
  }
}

module.exports = new ProductRepository();
