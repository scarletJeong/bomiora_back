const pool = require('../../../../config/database');

class ShopDefaultRepository {
  async findFirst() {
    const [rows] = await pool.query('SELECT * FROM bomiora_shop_default LIMIT 1');
    return rows.length ? rows[0] : null;
  }

  async findCompanyInfo() {
    const [rows] = await pool.query(
      `SELECT de_admin_company_name, de_admin_company_owner, de_admin_company_saupja_no,
              de_admin_tongsin_no, de_admin_company_tel, de_admin_company_fax,
              de_admin_company_addr, de_admin_info_email
       FROM bomiora_shop_default LIMIT 1`
    );
    return rows.length ? rows[0] : null;
  }
}

module.exports = new ShopDefaultRepository();
