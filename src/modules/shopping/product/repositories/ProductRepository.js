const pool = require('../../../../config/database');

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
      `SELECT * FROM bomiora_shop_item_new
       WHERE ${where}
       ORDER BY it_id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), Number(offset)]
    );
    return rows;
  }

  async findById(productId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_shop_item_new WHERE it_id = ? LIMIT 1',
      [productId]
    );
    return rows.length ? rows[0] : null;
  }

  async findBestProducts(limit) {
    const [rows] = await pool.query(
      `SELECT * FROM bomiora_shop_item_new
       WHERE it_type4 = 1 AND it_use = 1
       ORDER BY it_time DESC
       LIMIT ?`,
      [Number(limit)]
    );
    return rows;
  }

  async findNewProducts(limit) {
    const [rows] = await pool.query(
      `SELECT * FROM bomiora_shop_item_new
       WHERE it_type3 = 1 AND it_use = 1
       ORDER BY it_time DESC
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
      `SELECT * FROM bomiora_shop_item_new
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
      `SELECT *
         FROM bomiora_shop_item_new
        WHERE ${where}
        ORDER BY it_id DESC
        LIMIT ?`,
      [...params, safeLimit]
    );
    return rows;
  }
}

module.exports = new ProductRepository();
