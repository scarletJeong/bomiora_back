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
    const [rows] = await pool.query(
      `SELECT r.*,
              COALESCE(n.it_name, n.it_subject) AS it_name,
              n.it_kind AS it_kind
       FROM bomiora_shop_item_use r
       LEFT JOIN bomiora_shop_item_new n ON n.it_id = r.it_id
       WHERE r.is_id = ?`,
      [isId]
    );
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

  normalizeItId(v) {
    if (v == null) return null;
    if (Buffer.isBuffer(v)) {
      const s = v.toString('utf8').trim();
      return s || null;
    }
    if (typeof v === 'object' && v.type === 'Buffer' && Array.isArray(v.data)) {
      const s = Buffer.from(v.data).toString('utf8').trim();
      return s || null;
    }
    const s = String(v).trim();
    return s || null;
  }

  isUnknownColumnError(err, columnName) {
    if (!err) return false;
    const msg = String(err.message || '');
    const code = err.code === 'ER_BAD_FIELD_ERROR' || Number(err.errno) === 1054;
    return code && msg.includes(columnName);
  }

  /** it_review_link: 연동 상품 it_id를 쉼표·세미콜론·파이프·공백으로 구분한 값 */
  parseReviewLinkIds(raw) {
    if (raw == null) return [];
    const s = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
    const t = s.trim();
    if (!t) return [];
    return t.split(/[,;|\s]+/).map((x) => x.trim()).filter(Boolean);
  }

  async getProductForReview(itId) {
    try {
      const [rows] = await pool.query(
        `SELECT it_id, it_org_id, it_review_link FROM bomiora_shop_item_new WHERE it_id = ? LIMIT 1`,
        [itId]
      );
      return rows.length ? rows[0] : null;
    } catch (err) {
      if (this.isUnknownColumnError(err, 'it_review_link')) {
        const [rows] = await pool.query(
          `SELECT it_id, it_org_id FROM bomiora_shop_item_new WHERE it_id = ? LIMIT 1`,
          [itId]
        );
        return rows.length ? { ...rows[0], it_review_link: null } : null;
      }
      throw err;
    }
  }

  /**
   * 그누보드식: top 기준으로 한 리뷰 풀에 속하는 모든 상품 it_id
   * - it_id = top
   * - it_review_link 가 top 과 일치(단일/콤마 목록의 FIND_IN_SET)
   * - it_review_link 가 비어 있고 it_org_id = top 인 변형 상품
   */
  async collectShopItemIdsForReviewTop(topId) {
    const T = this.normalizeItId(topId);
    if (!T) return [];
    const [rows] = await pool.query(
      `SELECT it_id FROM bomiora_shop_item_new
       WHERE it_id = ?
          OR TRIM(COALESCE(it_review_link, '')) = ?
          OR (
            TRIM(COALESCE(it_review_link, '')) != ''
            AND FIND_IN_SET(
              ?,
              REPLACE(REPLACE(REPLACE(TRIM(COALESCE(it_review_link, '')), ';', ','), '|', ','), ' ', '')
            ) > 0
          )
          OR (
            TRIM(COALESCE(it_review_link, '')) = ''
            AND it_org_id IS NOT NULL
            AND it_org_id = ?
          )`,
      [T, T, T, T]
    );
    return [...new Set(rows.map((r) => this.normalizeItId(r.it_id)).filter(Boolean))];
  }

  _reviewPoolTopsFromProductRow(product, itId) {
    const linkIds = this.parseReviewLinkIds(product?.it_review_link)
      .map((p) => this.normalizeItId(p))
      .filter(Boolean);
    const orgNorm = this.normalizeItId(product?.it_org_id);
    const self = this.normalizeItId(product?.it_id) || this.normalizeItId(itId);
    if (linkIds.length) return [...new Set(linkIds)];
    return [orgNorm || self].filter(Boolean);
  }

  /**
   * 상품 상세에 노출할 리뷰의 it_id 목록 (PHP it_review_link / it_org_id 확장과 동일한 방향)
   */
  async getReviewSourceItIds(itId) {
    const product = await this.getProductForReview(itId);
    const orgNorm = this.normalizeItId(product?.it_org_id);
    const self = this.normalizeItId(product?.it_id) || this.normalizeItId(itId);
    const linkIds = this.parseReviewLinkIds(product?.it_review_link)
      .map((p) => this.normalizeItId(p))
      .filter(Boolean);
    const legacyMerged = [...new Set([orgNorm || self, ...linkIds].filter(Boolean))];

    const tops = this._reviewPoolTopsFromProductRow(product, itId);
    if (!tops.length) return legacyMerged;

    try {
      const pool = new Set();
      for (const top of tops) {
        const batch = await this.collectShopItemIdsForReviewTop(top);
        batch.forEach((id) => pool.add(id));
      }
      return pool.size ? [...pool] : legacyMerged;
    } catch (err) {
      if (this.isUnknownColumnError(err, 'it_review_link')) return legacyMerged;
      throw err;
    }
  }

  async findByProduct(itIds, rvkind, page, size) {
    const ids = (Array.isArray(itIds) ? itIds : [itIds])
      .map((id) => this.normalizeItId(id))
      .filter(Boolean);
    if (!ids.length) {
      return { rows: [], total: 0 };
    }

    const inPlaceholders = ids.map(() => '?').join(', ');
    const where = [`r.it_id IN (${inPlaceholders})`, 'r.is_confirm = 1'];
    const params = [...ids];
    if (rvkind) {
      where.push('r.is_rvkind = ?');
      params.push(rvkind);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS count FROM bomiora_shop_item_use r WHERE ${where.join(' AND ')}`,
      params
    );
    const total = countRows[0].count;

    const offset = page * size;
    const [rows] = await pool.query(
      `SELECT r.*,
              COALESCE(n.it_name, n.it_subject) AS it_name,
              n.it_kind AS it_kind
       FROM bomiora_shop_item_use r
       LEFT JOIN bomiora_shop_item_new n ON n.it_id = r.it_id
       WHERE ${where.join(' AND ')}
       ORDER BY r.is_id DESC
       LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );
    return { rows, total };
  }

  async findByMember(mbId, page, size) {
    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bomiora_shop_item_use WHERE mb_id = ?',
      [mbId]
    );
    const total = countRows[0].count;
    const offset = page * size;
    const [rows] = await pool.query(
      `SELECT r.*,
              COALESCE(n.it_name, n.it_subject) AS it_name,
              n.it_kind AS it_kind
       FROM bomiora_shop_item_use r
       LEFT JOIN bomiora_shop_item_new n ON n.it_id = r.it_id
       WHERE r.mb_id = ?
       ORDER BY r.is_id DESC
       LIMIT ? OFFSET ?`,
      [mbId, size, offset]
    );
    return { rows, total };
  }

  async findAll(rvkind, page, size) {
    const where = ['r.is_confirm = 1'];
    const params = [];
    if (rvkind) {
      where.push('r.is_rvkind = ?');
      params.push(rvkind);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS count FROM bomiora_shop_item_use r WHERE ${where.join(' AND ')}`,
      params
    );
    const total = countRows[0].count;
    const offset = page * size;
    const [rows] = await pool.query(
      `SELECT r.*,
              COALESCE(n.it_name, n.it_subject) AS it_name,
              n.it_kind AS it_kind
       FROM bomiora_shop_item_use r
       LEFT JOIN bomiora_shop_item_new n ON n.it_id = r.it_id
       WHERE ${where.join(' AND ')}
       ORDER BY r.is_id DESC
       LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );
    return { rows, total };
  }

  async getProductStats(itIds) {
    const ids = (Array.isArray(itIds) ? itIds : [itIds])
      .map((id) => this.normalizeItId(id))
      .filter(Boolean);
    if (!ids.length) {
      return { totalCount: 0, averageScore: 0 };
    }
    const ph = ids.map(() => '?').join(', ');
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS totalCount FROM bomiora_shop_item_use WHERE it_id IN (${ph}) AND is_confirm = 1`,
      ids
    );
    const [avgRows] = await pool.query(
      `SELECT AVG((COALESCE(is_score1,0) + COALESCE(is_score2,0) + COALESCE(is_score3,0) + COALESCE(is_score4,0))/4.0) AS averageScore
       FROM bomiora_shop_item_use WHERE it_id IN (${ph}) AND is_confirm = 1`,
      ids
    );
    return {
      totalCount: Number(countRows[0].totalCount || 0),
      averageScore: Number(avgRows[0].averageScore || 0)
    };
  }

  /**
   * bomiora_shop_item_new 한 행의 it_use_cnt / it_use_avg 를
   * getReviewSourceItIds(상품)와 동일한 기준(연동 상품 리뷰 포함)으로 갱신
   */
  async refreshItemReviewAggregates(shopItId) {
    const idNorm = this.normalizeItId(shopItId);
    if (!idNorm) return;
    const sourceIds = await this.getReviewSourceItIds(idNorm);
    const stats = await this.getProductStats(sourceIds);
    const cnt = stats.totalCount;
    const avg =
      stats.totalCount > 0 && Number.isFinite(stats.averageScore)
        ? Math.round(stats.averageScore * 100) / 100
        : null;
    await pool.query(
      'UPDATE bomiora_shop_item_new SET it_use_cnt = ?, it_use_avg = ? WHERE it_id = ?',
      [cnt, avg, shopItId]
    );
  }

  /** 리뷰의 it_id 가 바뀌었을 때 집계를 다시 써야 하는 상품 it_id 목록 */
  async collectShopItemIdsToRefreshForReviewItId(reviewItId) {
    const R = this.normalizeItId(reviewItId);
    if (!R) return [];
    const affected = new Set();
    const [direct] = await pool.query(
      'SELECT it_id FROM bomiora_shop_item_new WHERE it_id = ? OR it_org_id = ?',
      [R, R]
    );
    for (const row of direct) {
      const id = this.normalizeItId(row.it_id);
      if (id) affected.add(id);
    }
    let linkedRows = [];
    try {
      const [rows] = await pool.query(
        `SELECT it_id, it_review_link FROM bomiora_shop_item_new
         WHERE it_review_link IS NOT NULL AND TRIM(COALESCE(it_review_link, '')) != ''`
      );
      linkedRows = rows;
    } catch (err) {
      if (!this.isUnknownColumnError(err, 'it_review_link')) throw err;
    }
    for (const row of linkedRows) {
      const parts = this.parseReviewLinkIds(row.it_review_link).map((p) => this.normalizeItId(p));
      if (parts.includes(R)) {
        const id = this.normalizeItId(row.it_id);
        if (id) affected.add(id);
      }
    }
    return [...affected];
  }

  /** 특정 리뷰 it_id 에 속한 리뷰가 바뀌었을 때 영향 받는 모든 상품 행 집계 동기화 */
  async syncAggregatesForReviewItId(reviewItId) {
    const baseIds = await this.collectShopItemIdsToRefreshForReviewItId(reviewItId);
    const toRefresh = new Set(baseIds);
    const product = await this.getProductForReview(reviewItId);
    const tops = this._reviewPoolTopsFromProductRow(product, reviewItId);
    try {
      for (const top of tops) {
        const batch = await this.collectShopItemIdsForReviewTop(top);
        batch.forEach((id) => toRefresh.add(id));
      }
    } catch (err) {
      if (!this.isUnknownColumnError(err, 'it_review_link')) throw err;
    }
    await Promise.all([...toRefresh].map((id) => this.refreshItemReviewAggregates(id)));
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
