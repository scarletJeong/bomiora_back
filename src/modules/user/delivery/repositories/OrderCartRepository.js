const pool = require('../../../../config/database');

class OrderCartRepository {
  async findByOdIdAndMbId(odId, mbId) {
    const [rows] = await pool.query(
      `SELECT c.ct_id, c.od_id, c.mb_id, c.it_id, c.it_name,
              c.ct_status, c.ct_qty, c.ct_price, c.io_price, c.io_id, c.io_type,
              c.ct_option, c.ct_kind, c.parent,
              i.it_kind AS it_kind,
              i.it_img1 AS it_img1,
              i.it_flutter_image_url AS it_flutter_image_url,
              COALESCE(
                NULLIF(TRIM(CAST(c.it_subject AS CHAR)), ''),
                i.it_subject
              ) AS it_subject,
              COALESCE(
                NULLIF(TRIM(CAST(i.it_name AS CHAR)), ''),
                NULLIF(TRIM(CAST(c.it_name AS CHAR)), ''),
                i.it_subject
              ) AS item_name
       FROM bomiora_shop_cart c
       LEFT JOIN bomiora_shop_item_new i ON i.it_id = c.it_id
       WHERE c.od_id = ? AND c.mb_id = ?
       ORDER BY c.ct_id ASC`,
      [odId, mbId]
    );
    return rows;
  }

  async findByOdIds(odIds) {
    if (!odIds.length) return [];
    const placeholders = odIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT c.ct_id, c.od_id, c.mb_id, c.it_id, c.it_name,
              c.ct_status, c.ct_qty, c.ct_price, c.io_price, c.io_id, c.io_type,
              c.ct_option, c.ct_kind, c.parent,
              i.it_kind AS it_kind,
              i.it_img1 AS it_img1,
              i.it_flutter_image_url AS it_flutter_image_url,
              COALESCE(
                NULLIF(TRIM(CAST(c.it_subject AS CHAR)), ''),
                i.it_subject
              ) AS it_subject,
              COALESCE(
                NULLIF(TRIM(CAST(i.it_name AS CHAR)), ''),
                NULLIF(TRIM(CAST(c.it_name AS CHAR)), ''),
                i.it_subject
              ) AS item_name
       FROM bomiora_shop_cart c
       LEFT JOIN bomiora_shop_item_new i ON i.it_id = c.it_id
       WHERE c.od_id IN (${placeholders})
       ORDER BY c.od_id DESC, c.ct_id ASC`,
      odIds
    );
    return rows;
  }
}

module.exports = new OrderCartRepository();
