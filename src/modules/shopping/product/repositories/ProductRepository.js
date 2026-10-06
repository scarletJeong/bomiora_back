const pool = require('../../../../config/database');

/** 홈 신상품/베스트/MD — 카드에 쓰는 작은 컬럼만 (LONGTEXT·설명 제외) */
const HOME_CARD_COLUMNS = `
  CAST(it_id AS CHAR) AS it_id,
  CAST(it_name AS CHAR) AS it_name,
  CAST(LEFT(IFNULL(it_basic, ''), 120) AS CHAR) AS it_basic,
  CAST(it_subject AS CHAR) AS it_subject,
  it_price, it_cust_price,
  CAST(ca_id AS CHAR) AS ca_id,
  CAST(it_kind AS CHAR) AS it_kind,
  it_type3, it_type4, it_stock_qty,
  it_use_avg, it_use_cnt,
  CAST(it_flutter_image_url AS CHAR) AS it_flutter_image_url,
  CAST(it_img1 AS CHAR) AS it_img1,
  it_sc_type, it_sc_price, it_sc_minimum
`;

/** JOIN 시 상품 컬럼만 alias. `AS it_id` 별칭은 그대로 둔다. */
function qualifyHomeCardColumns(alias) {
  return HOME_CARD_COLUMNS.replace(
    /\b(it_id|it_name|it_basic|it_subject|it_price|it_cust_price|ca_id|it_kind|it_type3|it_type4|it_stock_qty|it_use_avg|it_use_cnt|it_flutter_image_url|it_img1|it_sc_type|it_sc_price|it_sc_minimum)\b/g,
    (name, _g, offset, src) => {
      const before = src.slice(Math.max(0, offset - 6), offset);
      if (/AS\s+$/i.test(before)) return name;
      return `${alias}.${name}`;
    }
  );
}

/** 목록/카드용 — LONGTEXT·여분 이미지·옵션 메타 제외 */
const LIST_COLUMNS = `
  CAST(it_id AS CHAR) AS it_id,
  CAST(it_name AS CHAR) AS it_name,
  CAST(LEFT(IFNULL(it_basic, ''), 120) AS CHAR) AS it_basic,
  CAST(it_subject AS CHAR) AS it_subject,
  it_price, it_cust_price,
  CAST(ca_id AS CHAR) AS ca_id,
  CAST(it_kind AS CHAR) AS it_kind,
  it_type3, it_type4, it_stock_qty,
  it_use_avg, it_use_cnt,
  CAST(it_flutter_image_url AS CHAR) AS it_flutter_image_url,
  CAST(it_img1 AS CHAR) AS it_img1,
  it_sc_type, it_sc_price, it_sc_minimum
`;

/** 상세용 — 본문 HTML은 필요 필드만, 이미지 1~5만 */
/** 목록·검색·홈·추천에서만 사용. 상세·옵션·연결상품·장바구니는 이 조건을 붙이지 않는다. */
const LIST_VISIBLE_SQL = "IFNULL(it_nolist, 0) = 0";

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
    let where = `ca_id = ? AND it_use = '1' AND ${LIST_VISIBLE_SQL}`;
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
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const [rows] = await pool.query(
      `SELECT ${HOME_CARD_COLUMNS} FROM bomiora_shop_item_new
       WHERE it_type4 = '1' AND it_use = '1' AND ${LIST_VISIBLE_SQL}
       ORDER BY it_order ASC, it_id DESC
       LIMIT ${safeLimit}`
    );
    return rows;
  }

  async findNewProducts(limit) {
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const displayed = await this.findDisplayedProducts('new', safeLimit, {
      excludeShake: false,
    });
    if (displayed != null) return displayed;

    const [rows] = await pool.query(
      `SELECT ${HOME_CARD_COLUMNS} FROM bomiora_shop_item_new
       WHERE it_type3 = '1' AND it_use = '1' AND ${LIST_VISIBLE_SQL}
       ORDER BY it_order ASC, it_id DESC
       LIMIT ${safeLimit}`
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
      `SELECT c.ca_id, c.ca_name, c.ca_order
         FROM bomiora_shop_category c
         INNER JOIN (
           SELECT DISTINCT LEFT(ca_id, 2) AS ca2
             FROM bomiora_shop_item_new
            WHERE it_kind = ? AND it_use = '1' AND ${LIST_VISIBLE_SQL}
              AND ca_id IS NOT NULL AND TRIM(ca_id) <> ''
         ) x ON x.ca2 = c.ca_id
        WHERE c.ca_use = '1'
          AND c.ca_menu_show = '1'
          AND CHAR_LENGTH(c.ca_id) = 2
        ORDER BY c.ca_order, c.ca_id`,
      [kind]
    );
    return rows;
  }

  /**
   * 홈 신상품/MD Pick.
   * bomiora_shop_item_display 에 use_yn=1 행이 있으면 그 순서만 쓴다.
   * 섹션에 등록이 하나도 없을 때만 null 을 반환해 기존 it_type 조회로 넘긴다.
   * 신상품은 ca_id=a0(쉐이크)을 포함하고, MD Pick만 제외한다.
   */
  async findDisplayedProducts(section, safeLimit, options = {}) {
    const excludeShake = options.excludeShake !== false;
    const [registered] = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM bomiora_shop_item_display
        WHERE section = ? AND use_yn = 1`,
      [section]
    );
    const count = Number(registered[0]?.cnt || 0);
    if (count <= 0) return null;

    const columns = qualifyHomeCardColumns('i');
    const shakeSql = excludeShake ? "AND i.ca_id <> 'a0'" : '';
    const [rows] = await pool.query(
      `SELECT ${columns}
         FROM bomiora_shop_item_display d
         INNER JOIN bomiora_shop_item_new i ON i.it_id = d.it_id
        WHERE d.section = ?
          AND d.use_yn = 1
          AND i.it_use = '1'
          AND IFNULL(i.it_nolist, 0) = 0
          ${shakeSql}
        ORDER BY d.sort_order ASC, d.id ASC
        LIMIT ${safeLimit}`,
      [section]
    );
    return rows;
  }

  /**
   * MD pick — 디스플레이 section=md_pick.
   * 등록이 없을 때만 it_type5 = 1 로 대체.
   * @param {number} limit
   * @param {string|null} productKind 대체 조회에만 쓰는 it_kind
   */
  async findMdPickProducts(limit, productKind = null) {
    const hasKind = productKind != null && String(productKind).trim() !== '';
    const params = [];
    const safeLimit = Math.min(Math.max(Number(limit) || 4, 1), 50);
    const displayed = await this.findDisplayedProducts('md_pick', safeLimit, {
      excludeShake: true,
    });
    if (displayed != null) return displayed;

    let where = `it_use = '1' AND ${LIST_VISIBLE_SQL} AND it_type5 = '1' AND (it_mb_inf = '' OR it_mb_inf IS NULL)`;
    if (hasKind) {
      where += ' AND it_kind = ?';
      params.push(productKind);
    }

    const [rows] = await pool.query(
      `SELECT ${HOME_CARD_COLUMNS} FROM bomiora_shop_item_new
       WHERE ${where}
       ORDER BY it_order ASC, it_id DESC
       LIMIT ${safeLimit}`,
      params
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
      it_use = '1'
      AND ${LIST_VISIBLE_SQL}
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
