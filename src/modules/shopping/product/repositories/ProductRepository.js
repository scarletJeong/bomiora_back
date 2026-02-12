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
}

module.exports = new ProductRepository();
