const pool = require('../../../../config/database');

class ReviewRepository {
  async existsByMbIdAndOdId(mbId, odId) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bomiora_shop_item_use WHERE mb_id = ? AND od_id = ?',
      [mbId, odId]
    );
    return rows[0].count > 0;
  }

  async create(fields) {
    const [result] = await pool.query(
      `INSERT INTO bomiora_shop_item_use
      (mb_id, od_id, it_id, is_name, is_time, is_confirm, is_score1, is_score2, is_score3, is_score4, is_rvkind, is_recommend, is_good,
       is_positive_review_text, is_negative_review_text, is_more_review_text,
       is_img1, is_img2, is_img3, is_img4, is_img5, is_img6, is_img7, is_img8, is_img9, is_img10,
       is_birthday, is_weight, is_height, is_pay_mthod, is_outage_num)
      VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fields.mb_id, fields.od_id, fields.it_id, fields.is_name, fields.is_confirm,
        fields.is_score1, fields.is_score2, fields.is_score3, fields.is_score4, fields.is_rvkind, fields.is_recommend, fields.is_good,
        fields.is_positive_review_text, fields.is_negative_review_text, fields.is_more_review_text,
        fields.is_img1, fields.is_img2, fields.is_img3, fields.is_img4, fields.is_img5, fields.is_img6, fields.is_img7, fields.is_img8, fields.is_img9, fields.is_img10,
        fields.is_birthday, fields.is_weight, fields.is_height, fields.is_pay_mthod, fields.is_outage_num
      ]
    );

    return this.findById(result.insertId);
  }

  async findById(isId) {
    const [rows] = await pool.query('SELECT * FROM bomiora_shop_item_use WHERE is_id = ?', [isId]);
    return rows.length ? rows[0] : null;
  }

  async deleteById(isId) {
    const [result] = await pool.query('DELETE FROM bomiora_shop_item_use WHERE is_id = ?', [isId]);
    return result.affectedRows > 0;
  }

  async updateById(isId, fields) {
    const pairs = [];
    const values = [];
    Object.entries(fields).forEach(([k, v]) => {
      pairs.push(`${k} = ?`);
      values.push(v);
    });
    if (!pairs.length) return this.findById(isId);
    values.push(isId);
    await pool.query(`UPDATE bomiora_shop_item_use SET ${pairs.join(', ')} WHERE is_id = ?`, values);
    return this.findById(isId);
  }

  async getProductForReview(itId) {
    const [rows] = await pool.query('SELECT it_id, it_org_id FROM bomiora_shop_item WHERE it_id = ? LIMIT 1', [itId]);
    return rows.length ? rows[0] : null;
  }

  async findByProduct(itId, rvkind, page, size) {
    const where = ['it_id = ?', 'is_confirm = 1'];
    const params = [itId];
    if (rvkind) {
      where.push('is_rvkind = ?');
      params.push(rvkind);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS count FROM bomiora_shop_item_use WHERE ${where.join(' AND ')}`,
      params
    );
    const total = countRows[0].count;

    const offset = page * size;
    const [rows] = await pool.query(
      `SELECT * FROM bomiora_shop_item_use WHERE ${where.join(' AND ')} ORDER BY is_id DESC LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );
    return { rows, total };
  }

  async findByMember(mbId, page, size) {
    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bomiora_shop_item_use WHERE mb_id = ? AND is_confirm = 1',
      [mbId]
    );
    const total = countRows[0].count;
    const offset = page * size;
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_shop_item_use WHERE mb_id = ? AND is_confirm = 1 ORDER BY is_id DESC LIMIT ? OFFSET ?',
      [mbId, size, offset]
    );
    return { rows, total };
  }

  async findAll(rvkind, page, size) {
    const where = ['is_confirm = 1'];
    const params = [];
    if (rvkind) {
      where.push('is_rvkind = ?');
      params.push(rvkind);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS count FROM bomiora_shop_item_use WHERE ${where.join(' AND ')}`,
      params
    );
    const total = countRows[0].count;
    const offset = page * size;
    const [rows] = await pool.query(
      `SELECT * FROM bomiora_shop_item_use WHERE ${where.join(' AND ')} ORDER BY is_id DESC LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );
    return { rows, total };
  }

  async getProductStats(itId) {
    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS totalCount FROM bomiora_shop_item_use WHERE it_id = ? AND is_confirm = 1',
      [itId]
    );
    const [avgRows] = await pool.query(
      `SELECT AVG((COALESCE(is_score1,0) + COALESCE(is_score2,0) + COALESCE(is_score3,0) + COALESCE(is_score4,0))/4.0) AS averageScore
       FROM bomiora_shop_item_use WHERE it_id = ? AND is_confirm = 1`,
      [itId]
    );
    return {
      totalCount: Number(countRows[0].totalCount || 0),
      averageScore: Number(avgRows[0].averageScore || 0)
    };
  }

  async hasHelpful(itId, reviewId, mbId) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bomiora_shop_item_use_good WHERE it_id = ? AND is_id = ? AND mb_id = ?',
      [itId, reviewId, mbId]
    );
    return rows[0].count > 0;
  }

  async addHelpful(itId, reviewId, mbId) {
    await pool.query(
      'INSERT INTO bomiora_shop_item_use_good (it_id, is_id, mb_id, bg_flag, bg_datetime) VALUES (?, ?, ?, ?, NOW())',
      [itId, reviewId, mbId, 'good']
    );
  }
}

module.exports = new ReviewRepository();
