const pool = require('../../../../config/database');

/** 활성 배너 조회 (`bm_banner`) */
class BannerRepository {
  async findActiveList({ placement = 'main', targetKind = null } = {}) {
    const safePlacement = String(placement || 'main').trim().toLowerCase();
    const params = [safePlacement];
    let targetSql = '';

    if (safePlacement === 'list') {
      const kind = String(targetKind || 'prescription').trim().toLowerCase();
      const resolved =
        kind === 'general' || kind === 'prescription' ? kind : 'prescription';
      targetSql = ` AND target_kind IN ('all', ?)`;
      params.push(resolved);
    }

    const [rows] = await pool.query(
      `SELECT
          id,
          title,
          link_url,
          pc_image,
          mo_image,
          placement,
          target_kind,
          sort_order
        FROM bm_banner
        WHERE is_deleted = 0
          AND is_use = 1
          AND begin_time <= NOW()
          AND end_time >= NOW()
          AND placement = ?
          ${targetSql}
        ORDER BY sort_order ASC, id ASC`,
      params
    );
    return rows;
  }
}

module.exports = new BannerRepository();
