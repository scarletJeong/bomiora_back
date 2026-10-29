const pool = require('../../../../config/database');

const reviewSourceIdCache = new Map();
const REVIEW_SOURCE_TTL_MS = 60 * 1000;

/**
 * 상품 전체 만족도(0.1~5, 0.1 단위). TINYINT 이면 3.1→3 으로 잘림 → sql/review_total_score_decimal.sql 실행.
 */

/** bomiora_shop_item_use r LEFT JOIN bomiora_shop_item_new n 시 상품 메타·썸네일 */
/** 상품 쪽 썸네일. 목록에 is_img BLOB 은 넣지 않는다. */
const JOIN_SHOP_ITEM_NEW_SELECT = `
              n.it_subject AS it_subject,
              COALESCE(n.it_name, n.it_subject) AS it_name,
              n.it_kind AS it_kind,
              n.it_flutter_image_url AS it_flutter_image_url,
              n.it_img1 AS it_img1,
              n.it_img2 AS it_img2,
              n.it_img3 AS it_img3`;

const PRODUCT_REVIEW_LIST_COLUMNS = `
           r.is_id,
           CAST(r.it_id AS CHAR) AS it_id,
           CAST(r.mb_id AS CHAR) AS mb_id,
           CAST(r.is_name AS CHAR) AS is_name,
           CAST(mem.mb_name AS CHAR) AS member_name,
              CAST(mem.mb_nick AS CHAR) AS member_nick,
           r.is_time,
           r.is_confirm,
           r.is_score1, r.is_score2, r.is_score3, r.is_score4, r.total_is_score,
           CAST(r.is_rvkind AS CHAR) AS is_rvkind,
           r.is_recommend, r.is_good, r.cz_download,
           CAST(LEFT(IFNULL(r.is_positive_review_text, ''), 800) AS CHAR) AS is_positive_review_text,
           CAST(LEFT(IFNULL(r.is_negative_review_text, ''), 800) AS CHAR) AS is_negative_review_text,
           CAST(LEFT(IFNULL(r.is_more_review_text, ''), 400) AS CHAR) AS is_more_review_text,
           CAST(r.is_img1 AS CHAR) AS is_img1,
           CAST(r.is_img2 AS CHAR) AS is_img2,
           CAST(r.is_img3 AS CHAR) AS is_img3,
           CAST(r.od_id AS CHAR) AS od_id`;

class ReviewRepository {
  async existsByMbIdAndOdId(mbId, odId) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM bomiora_shop_item_use WHERE mb_id = ? AND od_id = ?',
      [mbId, odId]
    );
    return rows[0].count > 0;
  }

  /** 주문+상품 단위 중복 (한 주문에 여러 상품 리뷰 허용) */
  async existsByMbIdOdIdItId(mbId, odId, itId) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM bomiora_shop_item_use
       WHERE mb_id = ? AND od_id = ? AND it_id = ?`,
      [mbId, odId, itId]
    );
    return Number(rows[0].count || 0) > 0;
  }

  /** 해당 주문에서 이미 작성한 리뷰 본문 */
  async findReviewsByMbIdAndOdId(mbId, odId) {
    const [rows] = await pool.query(
      `SELECT
         r.is_id,
         r.it_id,
         r.mb_id,
         r.is_name,
         CAST(mem.mb_name AS CHAR) AS member_name,
         CAST(mem.mb_nick AS CHAR) AS member_nick,
         r.is_time,
         r.is_confirm,
         r.is_score1, r.is_score2, r.is_score3, r.is_score4, r.total_is_score,
         r.is_rvkind,
         r.is_recommend, r.is_good, r.cz_download,
         r.is_positive_review_text,
         r.is_negative_review_text,
         r.is_more_review_text,
         r.is_img1, r.is_img2, r.is_img3,
         r.is_outage_num,
         CAST(r.od_id AS CHAR) AS od_id,
         n.it_subject,
         COALESCE(n.it_name, n.it_subject) AS it_name,
         n.it_kind,
         n.it_flutter_image_url,
         LEFT(IFNULL(n.it_img1, ''), 255) AS shop_it_img1,
         LEFT(IFNULL(n.it_img1, ''), 255) AS it_img1
       FROM bomiora_shop_item_use r
       LEFT JOIN bomiora_member mem ON mem.mb_id = r.mb_id
       LEFT JOIN bomiora_shop_item_new n ON n.it_id = r.it_id
       WHERE r.mb_id = ? AND r.od_id = ?
       ORDER BY r.is_id ASC`,
      [mbId, odId]
    );
    return rows;
  }

  /** 해당 주문에서 이미 리뷰 작성한 it_id 목록 */
  async findReviewedItIdsByOdId(mbId, odId) {
    const [rows] = await pool.query(
      `SELECT DISTINCT it_id
       FROM bomiora_shop_item_use
       WHERE mb_id = ? AND od_id = ?`,
      [mbId, odId]
    );
    return rows
      .map((r) => this.normalizeItId(r.it_id))
      .filter(Boolean);
  }

  /**
   * 여러 주문의 작성 완료 it_id 맵
   * @returns {Record<string, string[]>}
   */
  async findReviewedItIdsByOdIds(mbId, odIds) {
    const ids = (Array.isArray(odIds) ? odIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    const map = {};
    ids.forEach((id) => {
      map[id] = [];
    });
    if (!ids.length) return map;

    const ph = ids.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT CAST(od_id AS CHAR) AS od_id, CAST(it_id AS CHAR) AS it_id
       FROM bomiora_shop_item_use
       WHERE mb_id = ? AND od_id IN (${ph})`,
      [mbId, ...ids]
    );
    rows.forEach((row) => {
      const odId = row.od_id != null ? String(row.od_id).trim() : '';
      const itId = this.normalizeItId(row.it_id);
      if (!odId || !itId) return;
      if (!map[odId]) map[odId] = [];
      if (!map[odId].includes(itId)) map[odId].push(itId);
    });
    return map;
  }

  async findMemberDisplayName(mbId) {
    const id = String(mbId || '').trim();
    if (!id) return '';
    const [rows] = await pool.query(
      `SELECT CAST(mb_name AS CHAR) AS mb_name, CAST(mb_nick AS CHAR) AS mb_nick
       FROM bomiora_member WHERE mb_id = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) return '';
    const name = String(rows[0].mb_name || '').trim();
    const nick = String(rows[0].mb_nick || '').trim();
    return name || nick;
  }

  async create(fields) {
    const textOrEmpty = (v) => (v == null ? '' : String(v));
    const [result] = await pool.query(
      `INSERT INTO bomiora_shop_item_use
      (mb_id, od_id, it_id, is_name, is_time, is_confirm, is_score1, is_score2, is_score3, is_score4, total_is_score, is_rvkind, is_recommend, is_good,
       is_positive_review_text, is_negative_review_text, is_more_review_text,
       is_img1, is_img2, is_img3, is_img4, is_img5, is_img6, is_img7, is_img8, is_img9, is_img10,
       is_birthday, is_weight, is_height, is_pay_mthod, is_outage_num)
      VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fields.mb_id, fields.od_id, fields.it_id, fields.is_name, fields.is_confirm,
        fields.is_score1, fields.is_score2, fields.is_score3, fields.is_score4, fields.total_is_score ?? null,
        fields.is_rvkind, fields.is_recommend, fields.is_good,
        textOrEmpty(fields.is_positive_review_text),
        textOrEmpty(fields.is_negative_review_text),
        textOrEmpty(fields.is_more_review_text),
        fields.is_img1, fields.is_img2, fields.is_img3, fields.is_img4, fields.is_img5, fields.is_img6, fields.is_img7, fields.is_img8, fields.is_img9, fields.is_img10,
        fields.is_birthday, fields.is_weight, fields.is_height, fields.is_pay_mthod, fields.is_outage_num
      ]
    );

    return this.findById(result.insertId);
  }

  async findById(isId) {
    const [rows] = await pool.query(
      `SELECT r.*,
              CAST(mem.mb_name AS CHAR) AS member_name,
              CAST(mem.mb_nick AS CHAR) AS member_nick,
${JOIN_SHOP_ITEM_NEW_SELECT}
       FROM bomiora_shop_item_use r
       LEFT JOIN bomiora_member mem ON mem.mb_id = r.mb_id
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

  async deleteByIdAndMbId(isId, mbId) {
    const [result] = await pool.query(
      'DELETE FROM bomiora_shop_item_use WHERE is_id = ? AND mb_id = ?',
      [isId, String(mbId || '').trim()]
    );
    return result.affectedRows > 0;
  }

  async updateById(isId, fields) {
    return this.updateByIdAndMbId(isId, null, fields);
  }

  async updateByIdAndMbId(isId, mbId, fields) {
    const pairs = [];
    const values = [];
    Object.entries(fields).forEach(([k, v]) => {
      pairs.push(`${k} = ?`);
      values.push(v);
    });
    if (!pairs.length) return 0;
    values.push(isId);
    let sql = `UPDATE bomiora_shop_item_use SET ${pairs.join(', ')} WHERE is_id = ?`;
    if (mbId != null && String(mbId).trim() !== '') {
      sql += ' AND mb_id = ?';
      values.push(String(mbId).trim());
    }
    const [result] = await pool.query(sql, values);
    return result.affectedRows;
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

  rawReviewLink(product) {
    if (!product || product.it_review_link == null) return '';
    const raw = product.it_review_link;
    const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
    return text.trim();
  }

  /**
   * PHP get_it_review 와 같음.
   * it_review_link 를 한 단계 더 올라가 최상위 상품을 고르고, 없으면 자기 자신.
   */
  async resolvePhpReviewTop(itId) {
    const self = this.normalizeItId(itId);
    const product = await this.getProductForReview(self);
    const link1 = this.normalizeItId(this.rawReviewLink(product));
    if (!link1) return self;
    const parent = await this.getProductForReview(link1);
    const link2 = this.normalizeItId(this.rawReviewLink(parent));
    return link2 || link1;
  }

  /**
   * 상품 상세에 노출할 리뷰의 it_id 목록.
   * PHP: top 상품 + it_review_link 가 top 인 상품 + 링크가 비고 it_org_id 가 top 인 상품.
   */
  async getReviewSourceItIds(itId) {
    const self = this.normalizeItId(itId);
    if (!self) return [];
    const hit = reviewSourceIdCache.get(self);
    if (hit) {
      if (hit.ids && Date.now() - hit.at < REVIEW_SOURCE_TTL_MS) return hit.ids;
      if (hit.pending) return hit.pending;
    }
    const pending = this._loadReviewSourceItIds(self)
      .then((ids) => {
        reviewSourceIdCache.set(self, { ids, at: Date.now() });
        return ids;
      })
      .catch((err) => {
        const current = reviewSourceIdCache.get(self);
        if (current && current.pending) reviewSourceIdCache.delete(self);
        throw err;
      });
    reviewSourceIdCache.set(self, { pending });
    return pending;
  }

  async _loadReviewSourceItIds(self) {
    try {
      const top = await this.resolvePhpReviewTop(self);
      const poolIds = await this.collectShopItemIdsForReviewTop(top || self);
      return poolIds.length ? poolIds : [self];
    } catch (err) {
      if (this.isUnknownColumnError(err, 'it_review_link')) return [self];
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

    const offset = page * size;
    const [[countRows], [rows]] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS count FROM bomiora_shop_item_use r WHERE ${where.join(' AND ')}`,
        params
      ),
      pool.query(
        `SELECT
${PRODUCT_REVIEW_LIST_COLUMNS},
${JOIN_SHOP_ITEM_NEW_SELECT}
         FROM bomiora_shop_item_use r
         LEFT JOIN bomiora_member mem ON mem.mb_id = r.mb_id
         LEFT JOIN bomiora_shop_item_new n ON n.it_id = r.it_id
         WHERE ${where.join(' AND ')}
         ORDER BY r.is_id DESC
         LIMIT ? OFFSET ?`,
        [...params, size, offset]
      ),
    ]);
    return { rows, total: countRows[0].count };
  }

  async findByMember(mbId, page, size) {
    const offset = page * size;
    const take = Math.max(1, Number(size) || 20);
    const [rows] = await pool.query(
      `SELECT
         r.is_id,
         r.it_id,
         r.mb_id,
         r.is_name,
         CAST(mem.mb_name AS CHAR) AS member_name,
              CAST(mem.mb_nick AS CHAR) AS member_nick,
         r.is_time,
         r.is_confirm,
         r.is_score1, r.is_score2, r.is_score3, r.is_score4, r.total_is_score,
         r.is_rvkind,
         r.is_recommend, r.is_good, r.cz_download,
         LEFT(IFNULL(r.is_positive_review_text, ''), 400) AS is_positive_review_text,
         LEFT(IFNULL(r.is_negative_review_text, ''), 400) AS is_negative_review_text,
         LEFT(IFNULL(r.is_more_review_text, ''), 200) AS is_more_review_text,
         r.is_img1,
         r.is_img2,
         r.is_img3,
         r.is_outage_num,
         r.od_id,
         n.it_subject,
         COALESCE(n.it_name, n.it_subject) AS it_name,
         n.it_kind,
         n.it_flutter_image_url,
         LEFT(IFNULL(n.it_img1, ''), 255) AS shop_it_img1,
         LEFT(IFNULL(n.it_img1, ''), 255) AS it_img1
       FROM bomiora_shop_item_use r
       LEFT JOIN bomiora_member mem ON mem.mb_id = r.mb_id
       LEFT JOIN bomiora_shop_item_new n ON n.it_id = r.it_id
       WHERE r.mb_id = ?
       ORDER BY r.is_id DESC
       LIMIT ? OFFSET ?`,
      [mbId, take + 1, offset]
    );
    const hasMore = rows.length > take;
    const pageRows = hasMore ? rows.slice(0, take) : rows;
    const total = offset + pageRows.length + (hasMore ? 1 : 0);
    return { rows: pageRows, total, hasMore };
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
              CAST(mem.mb_name AS CHAR) AS member_name,
              CAST(mem.mb_nick AS CHAR) AS member_nick,
${JOIN_SHOP_ITEM_NEW_SELECT}
       FROM bomiora_shop_item_use r
       LEFT JOIN bomiora_member mem ON mem.mb_id = r.mb_id
       LEFT JOIN bomiora_shop_item_new n ON n.it_id = r.it_id
       WHERE ${where.join(' AND ')}
       ORDER BY r.is_id DESC
       LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );
    return { rows, total };
  }

  _statNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  _emptyProductStats() {
    return {
      totalCount: 0,
      supporterCount: 0,
      averageScore: 0,
      score1Avg: 0,
      score2Avg: 0,
      score3Avg: 0,
      score4Avg: 0,
      supporterAverage: 0,
      supporterScore1Avg: 0,
      supporterScore2Avg: 0,
      supporterScore3Avg: 0,
      supporterScore4Avg: 0,
    };
  }

  _mapProductStats(row) {
    const src = row || {};
    return {
      totalCount: this._statNum(src.totalCount),
      supporterCount: this._statNum(src.supporterCount),
      averageScore: this._statNum(src.averageScore),
      score1Avg: this._statNum(src.score1Avg),
      score2Avg: this._statNum(src.score2Avg),
      score3Avg: this._statNum(src.score3Avg),
      score4Avg: this._statNum(src.score4Avg),
      supporterAverage: this._statNum(src.supporterAverage),
      supporterScore1Avg: this._statNum(src.supporterScore1Avg),
      supporterScore2Avg: this._statNum(src.supporterScore2Avg),
      supporterScore3Avg: this._statNum(src.supporterScore3Avg),
      supporterScore4Avg: this._statNum(src.supporterScore4Avg),
    };
  }

  async getProductStats(itIds) {
    const ids = (Array.isArray(itIds) ? itIds : [itIds])
      .map((id) => this.normalizeItId(id))
      .filter(Boolean);
    if (!ids.length) return this._emptyProductStats();
    const ph = ids.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT
         COUNT(*) AS totalCount,
         SUM(CASE WHEN CAST(is_rvkind AS CHAR) = 'supporter' THEN 1 ELSE 0 END) AS supporterCount,
         AVG((COALESCE(is_score1,0) + COALESCE(is_score2,0) + COALESCE(is_score3,0) + COALESCE(is_score4,0))/4.0) AS averageScore,
         AVG(COALESCE(is_score1,0)) AS score1Avg,
         AVG(COALESCE(is_score2,0)) AS score2Avg,
         AVG(COALESCE(is_score3,0)) AS score3Avg,
         AVG(COALESCE(is_score4,0)) AS score4Avg,
         AVG(CASE WHEN CAST(is_rvkind AS CHAR) = 'supporter'
           THEN (COALESCE(is_score1,0) + COALESCE(is_score2,0) + COALESCE(is_score3,0) + COALESCE(is_score4,0))/4.0
           END) AS supporterAverage,
         AVG(CASE WHEN CAST(is_rvkind AS CHAR) = 'supporter' THEN COALESCE(is_score1,0) END) AS supporterScore1Avg,
         AVG(CASE WHEN CAST(is_rvkind AS CHAR) = 'supporter' THEN COALESCE(is_score2,0) END) AS supporterScore2Avg,
         AVG(CASE WHEN CAST(is_rvkind AS CHAR) = 'supporter' THEN COALESCE(is_score3,0) END) AS supporterScore3Avg,
         AVG(CASE WHEN CAST(is_rvkind AS CHAR) = 'supporter' THEN COALESCE(is_score4,0) END) AS supporterScore4Avg
       FROM bomiora_shop_item_use
       WHERE it_id IN (${ph}) AND is_confirm = 1`,
      ids
    );
    return this._mapProductStats(rows[0]);
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
    try {
      const [rows] = await pool.query(
        `SELECT it_id FROM bomiora_shop_item_new
         WHERE it_review_link IS NOT NULL
           AND it_review_link LIKE CONCAT('%', ?, '%')`,
        [R]
      );
      for (const row of rows) {
        const id = this.normalizeItId(row.it_id);
        if (id) affected.add(id);
      }
    } catch (err) {
      if (!this.isUnknownColumnError(err, 'it_review_link')) throw err;
    }
    return [...affected];
  }

  /** 특정 리뷰 it_id 에 속한 리뷰가 바뀌었을 때 영향 받는 모든 상품 행 집계 동기화 */
  async syncAggregatesForReviewItId(reviewItId) {
    const baseIds = await this.collectShopItemIdsToRefreshForReviewItId(reviewItId);
    const toRefresh = new Set(baseIds);
    try {
      const top = await this.resolvePhpReviewTop(reviewItId);
      const batch = await this.collectShopItemIdsForReviewTop(top);
      batch.forEach((id) => toRefresh.add(id));
    } catch (err) {
      if (!this.isUnknownColumnError(err, 'it_review_link')) throw err;
    }
    for (const id of toRefresh) {
      await this.refreshItemReviewAggregates(id);
    }
  }

}

module.exports = new ReviewRepository();
