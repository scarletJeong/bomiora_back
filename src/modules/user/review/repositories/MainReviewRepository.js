const pool = require('../../../../config/database');

const SELECT_MAIN_REVIEW = `
  SELECT r.mr_no, r.it_id, r.mb_id, r.inf_id,
         r.mr_score1, r.mr_score2, r.mr_score3, r.mr_score4,
         r.mr_title, r.mr_content, r.mr_summary, r.mr_link, r.mr_datetime,
         r.mr_confirm, r.mr_order_num,
         r.mr_img1, r.mr_img2, r.mr_img3, r.mr_img4, r.mr_img5,
         r.mr_img6, r.mr_img7, r.mr_img8, r.mr_img9, r.mr_img10,
         si.it_img1, si.it_img2, si.it_img3, si.it_img4, si.it_img5,
         inf.mb_nick AS inf_nick, inf.mb_name AS inf_name
  FROM bomiora_main_review r
  LEFT JOIN bomiora_shop_item_new si ON si.it_id = r.it_id
  LEFT JOIN bomiora_member inf ON inf.mb_id = r.inf_id
  WHERE r.mr_confirm = 1
`;

const ORDER_CLAUSE = 'ORDER BY r.mr_datetime DESC, r.mr_no DESC';

class MainReviewRepository {
  async findPublished(limit) {
    const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 50);
    const [rows] = await pool.query(
      `${SELECT_MAIN_REVIEW}
       ${ORDER_CLAUSE}
       LIMIT ?`,
      [safeLimit]
    );
    return rows;
  }

  async countPublished() {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM bomiora_main_review
       WHERE mr_confirm = 1`
    );
    return Number(rows[0]?.cnt || 0);
  }

  /**
   * @param {{ page?: number, size?: number }} opts page는 0부터
   */
  async findPublishedPage({ page = 0, size = 5 } = {}) {
    const safeSize = Math.min(Math.max(Number(size) || 5, 1), 50);
    const safePage = Math.max(Number(page) || 0, 0);
    const offset = safePage * safeSize;
    const [rows] = await pool.query(
      `${SELECT_MAIN_REVIEW}
       ${ORDER_CLAUSE}
       LIMIT ? OFFSET ?`,
      [safeSize, offset]
    );
    return rows;
  }

  /** 정렬 기준상 몇 번째인지 (0-based). 없으면 -1 */
  async findPublishedIndex(mrNo) {
    const target = Number(mrNo);
    if (!Number.isFinite(target) || target < 1) return -1;
    const [rows] = await pool.query(
      `SELECT mr_no
       FROM bomiora_main_review
       WHERE mr_confirm = 1
       ORDER BY mr_datetime DESC, mr_no DESC`
    );
    return rows.findIndex((r) => Number(r.mr_no) === target);
  }

  async getPublishedStats() {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt,
              AVG(mr_score1) AS avg1,
              AVG(mr_score2) AS avg2,
              AVG(mr_score3) AS avg3,
              AVG(mr_score4) AS avg4,
              AVG((mr_score1 + mr_score2 + mr_score3 + mr_score4) / 4) AS avgAll
       FROM bomiora_main_review
       WHERE mr_confirm = 1`
    );
    return rows[0] || {
      cnt: 0,
      avg1: 0,
      avg2: 0,
      avg3: 0,
      avg4: 0,
      avgAll: 0
    };
  }
}

module.exports = new MainReviewRepository();
