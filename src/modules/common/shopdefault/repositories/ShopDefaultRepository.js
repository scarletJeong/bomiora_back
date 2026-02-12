const pool = require('../../../../config/database');

class ShopDefaultRepository {
  async findFirst() {
    const [rows] = await pool.query('SELECT * FROM bomiora_shop_default LIMIT 1');
    return rows.length ? rows[0] : null;
  }
}

module.exports = new ShopDefaultRepository();
