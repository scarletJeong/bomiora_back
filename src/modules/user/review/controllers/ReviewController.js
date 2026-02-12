const reviewRepository = require('../repositories/ReviewRepository');

class ReviewController {
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
    const totalPages = Math.ceil(total / size);
    return {
      currentPage: page,
      totalPages,
      totalElements: total,
      hasNext: page + 1 < totalPages
    };
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
        is_img1: images[0] || null,
        is_img2: images[1] || null,
        is_img3: images[2] || null,
        is_img4: images[3] || null,
        is_img5: images[4] || null,
        is_img6: images[5] || null,
        is_img7: images[6] || null,
        is_img8: images[7] || null,
        is_img9: images[8] || null,
        is_img10: images[9] || null,
        is_birthday: req.body.isBirthday || null,
        is_weight: req.body.isWeight || null,
        is_height: req.body.isHeight || null,
        is_pay_mthod: req.body.isPayMthod || null,
        is_outage_num: req.body.isOutageNum || null
      });

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
      const page = Number(req.query.page || 0);
      const size = Number(req.query.size || 20);
      const product = await reviewRepository.getProductForReview(req.params.itId);
      const reviewItId = product?.it_org_id ? product.it_org_id : req.params.itId;
      const result = await reviewRepository.findByProduct(reviewItId, req.query.rvkind, page, size);

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
      const page = Number(req.query.page || 0);
      const size = Number(req.query.size || 20);
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
      const page = Number(req.query.page || 0);
      const size = Number(req.query.size || 20);
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

  async getProductReviewStats(req, res) {
    try {
      const stats = await reviewRepository.getProductStats(req.params.itId);
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

  async updateReview(req, res) {
    try {
      const isId = Number(req.params.isId);
      const row = await reviewRepository.findById(isId);
      if (!row) return res.json({ success: false, message: '리뷰를 찾을 수 없습니다.' });
      if (row.mb_id !== req.body.mbId) return res.json({ success: false, message: '리뷰를 수정할 권한이 없습니다.' });

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
        fields.is_img1 = images[0] || null;
        fields.is_img2 = images[1] || null;
        fields.is_img3 = images[2] || null;
        fields.is_img4 = images[3] || null;
        fields.is_img5 = images[4] || null;
        fields.is_img6 = images[5] || null;
        fields.is_img7 = images[6] || null;
        fields.is_img8 = images[7] || null;
        fields.is_img9 = images[8] || null;
        fields.is_img10 = images[9] || null;
      }

      const updated = await reviewRepository.updateById(isId, fields);
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
      if (row.mb_id !== req.query.mbId) return res.json({ success: false, message: '리뷰를 삭제할 권한이 없습니다.' });
      await reviewRepository.deleteById(isId);
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
