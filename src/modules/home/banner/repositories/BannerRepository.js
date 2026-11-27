const pool = require('../../../../config/database');

/** 활성 배너 조회 (`bm_banner`) — 웹 `newproject_banner_fetch_active`와 동일 규칙 */
class BannerRepository {
  normalizePlacement(raw) {
    const value = String(raw || 'main').trim().toLowerCase();
    return value === 'list' ? 'list' : 'main';
  }

  normalizeTargetKind(raw) {
    const value = String(raw || 'prescription').trim().toLowerCase();
    if (value === 'general' || value === 'prescription' || value === 'all') {
      return value;
    }
    return 'prescription';
  }

  normalizeCaId(raw) {
    return String(raw || '').replace(/[^0-9a-zA-Z]/g, '');
  }

  async findActiveList({
    placement = 'main',
    targetKind = null,
    caId = '',
  } = {}) {
    const safePlacement = this.normalizePlacement(placement);
    const params = [safePlacement];
    let kindSql = '';

    if (safePlacement === 'list') {
      const kind = this.normalizeTargetKind(targetKind);
      const ca = this.normalizeCaId(caId);
      // 관리자 list_ca: G*/P* = 종류 전체, g:10 / p:10 = 특정 카테고리
      // target_kind: all | general | prescription | pick
      const parts = ["target_kind = ?", "target_kind = 'all'"];
      params.push(kind);

      if (kind === 'general' || kind === 'all') {
        parts.push("list_ca LIKE '%,G*,%'");
      }
      if (kind === 'prescription' || kind === 'all') {
        parts.push("list_ca LIKE '%,P*,%'");
      }
      if (ca) {
        if (kind === 'general' || kind === 'all') {
          parts.push('list_ca LIKE ?');
          params.push(`%,g:${ca},%`);
        }
        if (kind === 'prescription' || kind === 'all') {
          parts.push('list_ca LIKE ?');
          params.push(`%,p:${ca},%`);
        }
      }
      kindSql = ` AND (${parts.join(' OR ')})`;
    }

    try {
      const [rows] = await pool.query(
        `SELECT
            id,
            title,
            link_url,
            image_path,
            placement,
            target_kind,
            list_ca,
            sort_order
          FROM bm_banner
          WHERE is_deleted = '0'
            AND is_use = '1'
            AND begin_time <= NOW()
            AND end_time >= NOW()
            AND placement = ?
            ${kindSql}
          ORDER BY sort_order ASC, id ASC
          LIMIT 20`,
        params
      );
      return rows;
    } catch (err) {
      // list_ca 컬럼이 없는 구스키마 호환
      if (err && err.code === 'ER_BAD_FIELD_ERROR') {
        return this.findActiveListLegacy({
          placement: safePlacement,
          targetKind,
        });
      }
      throw err;
    }
  }

  async findActiveListLegacy({ placement = 'main', targetKind = null } = {}) {
    const safePlacement = this.normalizePlacement(placement);
    const params = [safePlacement];
    let targetSql = '';

    if (safePlacement === 'list') {
      const kind = this.normalizeTargetKind(targetKind);
      targetSql = ` AND target_kind IN ('all', ?)`;
      params.push(kind);
    }

    const [rows] = await pool.query(
      `SELECT
          id,
          title,
          link_url,
          image_path,
          placement,
          target_kind,
          sort_order
        FROM bm_banner
        WHERE is_deleted = '0'
          AND is_use = '1'
          AND begin_time <= NOW()
          AND end_time >= NOW()
          AND placement = ?
          ${targetSql}
        ORDER BY sort_order ASC, id ASC
        LIMIT 20`,
      params
    );
    return rows;
  }
}

module.exports = new BannerRepository();
