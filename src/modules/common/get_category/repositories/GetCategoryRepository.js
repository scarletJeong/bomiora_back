const pool = require('../../../../config/database');

class GetCategoryRepository {
  async findByGroup(grp) {
    const [rows] = await pool.query(
      `SELECT
          id,
          grp,
          category_name,
          is_use,
          created_by,
          created_at,
          updated_by,
          updated_at
       FROM bm_category
       WHERE grp = ?
         AND is_use = 1
         AND is_deleted = 0
       ORDER BY id ASC`,
      [grp]
    );
    return rows;
  }
}

module.exports = new GetCategoryRepository();
