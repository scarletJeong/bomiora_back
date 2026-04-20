const pool = require('../../../../config/database');

class MainReviewRepository {
  async findPublished(limit) {
    const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 50);
    const [rows] = await pool.query(
      `SELECT r.mr_no, r.it_id, r.mb_id, r.inf_id,
              r.mr_score1, r.mr_score2, r.mr_score3, r.mr_score4,
              r.mr_title, r.mr_content, r.mr_summary, r.mr_link, r.mr_datetime,
              r.mr_confirm, r.mr_order_num,
              r.mr_img1, r.mr_img2, r.mr_img3, r.mr_img4, r.mr_img5,
              r.mr_img6, r.mr_img7, r.mr_img8, r.mr_img9, r.mr_img10,
              si.it_img1, si.it_img2, si.it_img3, si.it_img4, si.it_img5
       FROM bomiora_main_review r
       LEFT JOIN bomiora_shop_item_new si ON si.it_id = r.it_id
       WHERE r.mr_confirm = 1
       ORDER BY COALESCE(r.mr_order_num, 999999) ASC, r.mr_datetime DESC
       LIMIT ?`,
      [safeLimit]
    );
    return rows;
  }
}

module.exports = new MainReviewRepository();
