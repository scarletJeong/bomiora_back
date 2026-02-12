const pool = require('../../../../../config/database');

class ProductOptionRepository {
  async findByProductId(productId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_shop_item_option WHERE it_id = ? AND io_use = 1',
      [productId]
    );
    return rows;
  }
}

module.exports = new ProductOptionRepository();
