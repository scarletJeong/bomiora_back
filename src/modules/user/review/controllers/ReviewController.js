const reviewRepository = require('../repositories/ReviewRepository');
const mainReviewRepository = require('../repositories/MainReviewRepository');

/** 리뷰 목록 한 번에 가져올 수 있는 최대 건수 (무제한에 가깝게; 과도한 부하 방지용 상한) */
const MAX_REVIEW_PAGE_SIZE = 100000;

class ReviewController {
  /**
   * mysql2 가 BINARY/VARBINARY/BLOB 등을 Buffer 로 반환할 때 JSON 에는 { type, data } 로 나가
   * 앱에서 한글이 깨지므로 응답 직전 UTF-8 문자열로 통일
   */
  normalizeSqlUtf8(v) {
    if (v === undefined || v === null) return null;
    if (Buffer.isBuffer(v)) {
      const s = v.toString('utf8');
      return s.length ? s : null;
    }
    if (typeof v === 'object' && v && v.type === 'Buffer' && Array.isArray(v.data)) {
      const s = Buffer.from(v.data).toString('utf8');
      return s.length ? s : null;
    }
    return v;
  }

  trimSqlText(v) {
    const n = this.normalizeSqlUtf8(v);
    if (n === null || n === undefined) return '';
    const s = String(n).trim();
    return s;
  }

  toReviewResponse(row) {
    const images = [
      row.is_img1, row.is_img2, row.is_img3, row.is_img4, row.is_img5,
      row.is_img6, row.is_img7, row.is_img8, row.is_img9, row.is_img10
    ].filter((x) => x);

    const s1 = Number(row.is_score1 || 0);
    const s2 = Number(row.is_score2 || 0);
    const s3 = Number(row.is_score3 || 0);
    const s4 = Number(row.is_score4 || 0);

    return {
      isId: row.is_id,
      itId: row.it_id,
      itName: row.it_name,
      itKind: row.it_kind,
      mbId: row.mb_id,
      isName: row.is_name,
      isTime: row.is_time,
      isConfirm: row.is_confirm,
      isScore1: row.is_score1,
      isScore2: row.is_score2,
      isScore3: row.is_score3,
      isScore4: row.is_score4,
      averageScore: (s1 + s2 + s3 + s4) / 4,
      isRvkind: row.is_rvkind,
      isRecommend: row.is_recommend,
      isGood: row.is_good,
      czDownload: row.cz_download,
      isPositiveReviewText: row.is_positive_review_text,
      isNegativeReviewText: row.is_negative_review_text,
      isMoreReviewText: row.is_more_review_text,
      images,
      isBirthday: row.is_birthday,
      isWeight: row.is_weight,
      isHeight: row.is_height,
      isPayMthod: row.is_pay_mthod,
      isOutageNum: row.is_outage_num,
      odId: row.od_id
    };
  }

  pagePayload(page, size, total) {
    const safeSize = Math.max(1, size);
    const totalPages = Math.ceil(total / safeSize);
    return {
      currentPage: page,
      totalPages,
      totalElements: total,
      hasNext: page + 1 < totalPages
    };
  }

  /**
   * ?all=1 | true | yes → 0페이지부터 최대 MAX_REVIEW_PAGE_SIZE건
   * 그 외 ?size= 숫자 (1 ~ MAX), 기본 20
   */
  _reviewListPagination(req) {
    const allRaw = req.query.all;
    const all =
      allRaw === '1' ||
      allRaw === 'true' ||
      allRaw === 'yes' ||
      String(allRaw || '').toLowerCase() === 'all';
    let page = Number(req.query.page);
    if (!Number.isFinite(page) || page < 0) page = 0;
    if (all) {
      return { page: 0, size: MAX_REVIEW_PAGE_SIZE };
    }
    let size = Number(req.query.size);
    if (!Number.isFinite(size) || size < 1) size = 20;
    size = Math.min(size, MAX_REVIEW_PAGE_SIZE);
    return { page, size };
  }

  async createReview(req, res) {
    try {
      if (req.body.odId != null) {
        const exists = await reviewRepository.existsByMbIdAndOdId(req.body.mbId, req.body.odId);
        if (exists) {
          return res.json({ success: false, message: '이미 해당 주문에 대한 리뷰를 작성하셨습니다.' });
        }
      }

      const images = Array.isArray(req.body.images) ? req.body.images : [];
      const imageOrEmpty = (index) => images[index] || '';
      const saved = await reviewRepository.create({
        mb_id: req.body.mbId,
        od_id: req.body.odId ?? null,
        it_id: req.body.itId,
        is_name: req.body.isName,
        is_confirm: 0,
        is_score1: req.body.isScore1 ?? 0,
        is_score2: req.body.isScore2 ?? 0,
        is_score3: req.body.isScore3 ?? 0,
        is_score4: req.body.isScore4 ?? 0,
        is_rvkind: req.body.isRvkind || 'general',
        is_recommend: req.body.isRecommend || 'y',
        is_good: 0,
        is_positive_review_text: req.body.isPositiveReviewText || null,
        is_negative_review_text: req.body.isNegativeReviewText || null,
        is_more_review_text: req.body.isMoreReviewText || null,
        is_img1: imageOrEmpty(0),
        is_img2: imageOrEmpty(1),
        is_img3: imageOrEmpty(2),
        is_img4: imageOrEmpty(3),
        is_img5: imageOrEmpty(4),
        is_img6: imageOrEmpty(5),
        is_img7: imageOrEmpty(6),
        is_img8: imageOrEmpty(7),
        is_img9: imageOrEmpty(8),
        is_img10: imageOrEmpty(9),
        is_birthday: req.body.isBirthday || null,
        is_weight: req.body.isWeight || null,
        is_height: req.body.isHeight || null,
        is_pay_mthod: req.body.isPayMthod || null,
        is_outage_num: req.body.isOutageNum || null
      });

      await reviewRepository.syncAggregatesForReviewItId(req.body.itId);

      return res.json({
        success: true,
        message: '리뷰가 성공적으로 작성되었습니다. 관리자 승인 후 게시됩니다.',
        review: this.toReviewResponse(saved)
      });
    } catch (error) {
      return res.json({ success: false, message: `리뷰 작성 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  async getProductReviews(req, res) {
    try {
      const { page, size } = this._reviewListPagination(req);
      const itIds = await reviewRepository.getReviewSourceItIds(req.params.itId);
      const result = await reviewRepository.findByProduct(itIds, req.query.rvkind, page, size);

      return res.json({
        success: true,
        reviews: result.rows.map((r) => this.toReviewResponse(r)),
        ...this.pagePayload(page, size, result.total)
      });
    } catch (error) {
      return res.json({ success: false, message: `리뷰 목록 조회 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  async getMemberReviews(req, res) {
    try {
      const { page, size } = this._reviewListPagination(req);
      const result = await reviewRepository.findByMember(req.params.mbId, page, size);
      return res.json({
        success: true,
        reviews: result.rows.map((r) => this.toReviewResponse(r)),
        ...this.pagePayload(page, size, result.total)
      });
    } catch (error) {
      return res.json({ success: false, message: `리뷰 목록 조회 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  async getAllReviews(req, res) {
    try {
      const { page, size } = this._reviewListPagination(req);
      const result = await reviewRepository.findAll(req.query.rvkind, page, size);
      return res.json({
        success: true,
        reviews: result.rows.map((r) => this.toReviewResponse(r)),
        ...this.pagePayload(page, size, result.total)
      });
    } catch (error) {
      return res.json({ success: false, message: `리뷰 목록 조회 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  /**
   * 메인 홈 — bomiora_main_review 승인 건만 (썸네일·문구용)
   * ?size= 기본 8, 최대 50
   */
  toMainReviewRow(row) {
    const t = (x) => this.trimSqlText(x);
    const images = [
      row.mr_img1, row.mr_img2, row.mr_img3, row.mr_img4, row.mr_img5,
      row.mr_img6, row.mr_img7, row.mr_img8, row.mr_img9, row.mr_img10
    ]
      .map((x) => t(x))
      .filter(Boolean);
    const productImages = [
      row.it_img1,
      row.it_img2,
      row.it_img3,
      row.it_img4,
      row.it_img5
    ]
      .map((x) => t(x))
      .filter(Boolean);

    const s1 = Number(row.mr_score1 || 0);
    const s2 = Number(row.mr_score2 || 0);
    const s3 = Number(row.mr_score3 || 0);
    const s4 = Number(row.mr_score4 || 0);

    const title = t(row.mr_title);
    const content = t(row.mr_content);
    const summary = t(row.mr_summary);
    const link = t(row.mr_link);
    const itId = t(row.it_id);
    const mbId = t(row.mb_id);
    const infId = t(row.inf_id);

    return {
      mrNo: row.mr_no,
      itId: itId || null,
      mbId: mbId || null,
      infId: infId || null,
      mrScore1: row.mr_score1,
      mrScore2: row.mr_score2,
      mrScore3: row.mr_score3,
      mrScore4: row.mr_score4,
      averageScore: (s1 + s2 + s3 + s4) / 4,
      mrTitle: title || null,
      mrContent: content || null,
      mrSummary: summary || null,
      mrLink: link || null,
      mrDatetime: row.mr_datetime,
      mrOrderNum: row.mr_order_num,
      images,
      productImage: productImages[0] || null
    };
  }

  async getMainReviews(req, res) {
    try {
      let size = Number(req.query.size);
      if (!Number.isFinite(size) || size < 1) size = 8;
      size = Math.min(size, 50);
      const rows = await mainReviewRepository.findPublished(size);
      return res.json({
        success: true,
        reviews: rows.map((r) => this.toMainReviewRow(r))
      });
    } catch (error) {
      return res.json({
        success: false,
        message: `메인 리뷰 조회 중 오류가 발생했습니다: ${error.message}`
      });
    }
  }

  async getProductReviewStats(req, res) {
    try {
      const itIds = await reviewRepository.getReviewSourceItIds(req.params.itId);
      const stats = await reviewRepository.getProductStats(itIds);
      return res.json({ success: true, stats });
    } catch (error) {
      return res.json({ success: false, message: `리뷰 통계 조회 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  async getReviewById(req, res) {
    try {
      const row = await reviewRepository.findById(Number(req.params.isId));
      if (!row) return res.json({ success: false, message: '리뷰를 찾을 수 없습니다.' });
      return res.json({ success: true, review: this.toReviewResponse(row) });
    } catch (error) {
      return res.json({ success: false, message: `리뷰 조회 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  /** DB/API에서 mb_id·mbId 타입이 숫자·문자열로 섞여 strict 비교 시 권한 오류가 나지 않도록 통일 */
  _isSameMember(dbRowMbId, bodyMbId) {
    if (bodyMbId === undefined || bodyMbId === null || String(bodyMbId).trim() === '') return false;
    if (dbRowMbId === undefined || dbRowMbId === null) return false;
    return String(dbRowMbId).trim() === String(bodyMbId).trim();
  }

  async updateReview(req, res) {
    try {
      const isId = Number(req.params.isId);
      const row = await reviewRepository.findById(isId);
      if (!row) return res.json({ success: false, message: '리뷰를 찾을 수 없습니다.' });
      if (!this._isSameMember(row.mb_id, req.body.mbId)) {
        return res.json({ success: false, message: '리뷰를 수정할 권한이 없습니다.' });
      }

      const images = Array.isArray(req.body.images) ? req.body.images : null;
      const fields = {};
      if (req.body.isScore1 != null) fields.is_score1 = req.body.isScore1;
      if (req.body.isScore2 != null) fields.is_score2 = req.body.isScore2;
      if (req.body.isScore3 != null) fields.is_score3 = req.body.isScore3;
      if (req.body.isScore4 != null) fields.is_score4 = req.body.isScore4;
      if (req.body.isPositiveReviewText != null) fields.is_positive_review_text = req.body.isPositiveReviewText;
      if (req.body.isNegativeReviewText != null) fields.is_negative_review_text = req.body.isNegativeReviewText;
      if (req.body.isMoreReviewText != null) fields.is_more_review_text = req.body.isMoreReviewText;
      if (req.body.isRecommend != null) fields.is_recommend = req.body.isRecommend;
      if (images) {
        fields.is_img1 = images[0] || '';
        fields.is_img2 = images[1] || '';
        fields.is_img3 = images[2] || '';
        fields.is_img4 = images[3] || '';
        fields.is_img5 = images[4] || '';
        fields.is_img6 = images[5] || '';
        fields.is_img7 = images[6] || '';
        fields.is_img8 = images[7] || '';
        fields.is_img9 = images[8] || '';
        fields.is_img10 = images[9] || '';
      }

      const updated = await reviewRepository.updateById(isId, fields);
      if (updated?.it_id != null) {
        await reviewRepository.syncAggregatesForReviewItId(updated.it_id);
      }
      return res.json({ success: true, message: '리뷰가 성공적으로 수정되었습니다.', review: this.toReviewResponse(updated) });
    } catch (error) {
      return res.json({ success: false, message: `리뷰 수정 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  async deleteReview(req, res) {
    try {
      const isId = Number(req.params.isId);
      const row = await reviewRepository.findById(isId);
      if (!row) return res.json({ success: false, message: '리뷰를 찾을 수 없습니다.' });
      if (!this._isSameMember(row.mb_id, req.query.mbId)) {
        return res.json({ success: false, message: '리뷰를 삭제할 권한이 없습니다.' });
      }
      const reviewItId = row.it_id;
      await reviewRepository.deleteById(isId);
      await reviewRepository.syncAggregatesForReviewItId(reviewItId);
      return res.json({ success: true, message: '리뷰가 성공적으로 삭제되었습니다.' });
    } catch (error) {
      return res.json({ success: false, message: `리뷰 삭제 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  async incrementReviewHelpful(req, res) {
    try {
      const isId = Number(req.params.isId);
      const mbId = req.body.mbId;
      if (!mbId || !String(mbId).trim()) return res.json({ success: false, message: '회원 ID가 필요합니다.' });

      const row = await reviewRepository.findById(isId);
      if (!row) return res.json({ success: false, message: '리뷰를 찾을 수 없습니다.' });

      const already = await reviewRepository.hasHelpful(row.it_id, isId, mbId);
      if (already) {
        return res.json({ success: false, message: '이미 추천 하신 리뷰 입니다.', isGood: row.is_good });
      }

      await reviewRepository.addHelpful(row.it_id, isId, mbId);
      const nextGood = Number(row.is_good || 0) + 1;
      await reviewRepository.updateById(isId, { is_good: nextGood });
      return res.json({ success: true, message: '도움이 돼요가 증가했습니다.', isGood: nextGood });
    } catch (error) {
      return res.json({ success: false, message: `처리 중 오류가 발생했습니다: ${error.message}` });
    }
  }

  async checkUserHelpful(req, res) {
    const hasHelpful = await reviewRepository.hasHelpful(req.query.itId, Number(req.params.isId), req.query.mbId);
    return res.json({ hasHelpful });
  }

  async checkReviewExists(req, res) {
    try {
      const exists = await reviewRepository.existsByMbIdAndOdId(req.query.mbId, Number(req.query.odId));
      return res.json({ success: true, exists });
    } catch (error) {
      return res.json({ success: false, message: `확인 중 오류가 발생했습니다: ${error.message}` });
    }
  }
}

module.exports = new ReviewController();
