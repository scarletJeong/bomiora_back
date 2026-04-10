const pool = require('../../../../config/database');

class MainReviewRepository {
  async findPublished(limit) {
    const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 50);
    const [rows] = await pool.query(
      `SELECT mr_no, it_id, mb_id, inf_id,
              mr_score1, mr_score2, mr_score3, mr_score4,
              mr_title, mr_content, mr_summary, mr_link, mr_datetime,
              mr_confirm, mr_order_num,
              mr_img1, mr_img2, mr_img3, mr_img4, mr_img5,
              mr_img6, mr_img7, mr_img8, mr_img9, mr_img10
       FROM bomiora_main_review
       WHERE mr_confirm = 1
       ORDER BY COALESCE(mr_order_num, 999999) ASC, mr_datetime DESC
       LIMIT ?`,
      [safeLimit]
    );
    return rows;
  }
}

module.exports = new MainReviewRepository();
