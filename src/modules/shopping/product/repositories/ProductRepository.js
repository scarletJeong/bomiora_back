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
