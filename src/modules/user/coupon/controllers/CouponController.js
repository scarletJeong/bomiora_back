const pool = require('../../../../config/database');
const couponRepository = require('../repositories/CouponRepository');

class CouponController {
  toMap(c) {
    return {
      cp_no: c.cp_no,
      cp_id: c.cp_id,
      cp_subject: c.cp_subject,
      cp_method: c.cp_method,
      cp_target: c.cp_target,
      mb_id: c.mb_id,
      cz_id: c.cz_id,
      cp_start: c.cp_start,
      cp_end: c.cp_end,
      cp_price: c.cp_price,
      cp_type: c.cp_type,
      cp_trunc: c.cp_trunc,
      cp_minimum: c.cp_minimum,
      cp_maximum: c.cp_maximum,
      od_id: c.od_id,
      cp_datetime: c.cp_datetime
    };
  }

  async getUserCoupons(req, res) {
    try {
      const rows = await couponRepository.findByUserId(req.query.mb_id);
      return res.json({ success: true, data: rows.map((r) => this.toMap(r)) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `쿠폰 목록 조회 실패: ${error.message}` });
    }
  }

  async getAvailableCoupons(req, res) {
    try {
      const rows = await couponRepository.findAvailableCoupons(req.query.mb_id);
      return res.json({ success: true, data: rows.map((r) => this.toMap(r)) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `사용가능한 쿠폰 조회 실패: ${error.message}` });
    }
  }

  async getUsedCoupons(req, res) {
    try {
      const rows = await couponRepository.findUsedCoupons(req.query.mb_id);
      return res.json({ success: true, data: rows.map((r) => this.toMap(r)) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `사용한 쿠폰 조회 실패: ${error.message}` });
    }
  }

  async getExpiredCoupons(req, res) {
    try {
      const rows = await couponRepository.findExpiredCoupons(req.query.mb_id);
      return res.json({ success: true, data: rows.map((r) => this.toMap(r)) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `만료된 쿠폰 조회 실패: ${error.message}` });
    }
  }

  async registerCoupon(req, res) {
    try {
      const userId = req.body.mb_id;
      const couponCode = req.body.cp_id;

      const coupon = await couponRepository.findByCouponId(couponCode);
      if (!coupon) {
        return res.json({ success: false, message: '유효하지 않은 쿠폰 코드입니다.' });
      }

      const existing = await couponRepository.findByCouponIdAndUserId(couponCode, userId);
      if (existing) {
        return res.json({ success: false, message: '이미 등록된 쿠폰입니다.' });
      }

      await couponRepository.create({
        cp_id: coupon.cp_id,
        cp_subject: coupon.cp_subject,
        cp_method: coupon.cp_method,
        cp_target: coupon.cp_target,
        mb_id: userId,
        cz_id: coupon.cz_id,
        cp_start: coupon.cp_start,
        cp_end: coupon.cp_end,
        cp_price: coupon.cp_price,
        cp_type: coupon.cp_type,
        cp_trunc: coupon.cp_trunc,
        cp_minimum: coupon.cp_minimum,
        cp_maximum: coupon.cp_maximum,
        od_id: 0,
        cp_datetime: new Date(),
        mb_inf_id: coupon.mb_inf_id || '',
        is_id: coupon.is_id || null
      });

      return res.json({ success: true, message: '쿠폰이 등록되었습니다.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: `쿠폰 등록 실패: ${error.message}` });
    }
  }

  async downloadHelpCoupon(req, res) {
    try {
      const mbId = req.body.mbId;
      const itId = req.body.itId;
      const isId = Number(req.body.isId);

      const [reviewRows] = await pool.query(
        'SELECT * FROM bomiora_shop_item_use WHERE is_id = ? LIMIT 1',
        [isId]
      );
      if (!reviewRows.length) return res.json({ success: false, message: '리뷰가 존재하지 않습니다.' });
      const review = reviewRows[0];

      if (review.is_rvkind !== 'supporter') {
        return res.json({ success: false, message: '서포터 리뷰만 도움쿠폰을 다운로드할 수 있습니다.' });
      }
      if (Number(review.is_confirm || 0) !== 1) {
        return res.json({ success: false, message: '승인된 리뷰만 도움쿠폰을 다운로드할 수 있습니다.' });
      }

      const alreadyDownloaded = await couponRepository.existsByUserIdAndReviewId(mbId, isId);
      if (alreadyDownloaded) {
        return res.json({ success: false, message: '이미 다운로드하신 쿠폰입니다.' });
      }

      const cpId = await couponRepository.createHelpCoupon({
        mbId,
        itId,
        reviewId: isId,
        reviewerName: review.is_name,
        productName: review.it_name
      });

      const nextDownload = Number(review.cz_download || 0) + 1;
      await pool.query(
        'UPDATE bomiora_shop_item_use SET cz_download = ? WHERE is_id = ?',
        [nextDownload, isId]
      );

      return res.json({
        success: true,
        message: '쿠폰 발급이 완료되었습니다.\n지금 바로 할인 받고 구매해보세요!\n쿠폰은 [마이페이지 > 내쿠폰] 또는 결제 전 [쿠폰 선택]에서 확인할 수 있습니다.',
        downloadCount: nextDownload,
        cpId
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: '쿠폰 다운로드 중 오류가 발생했습니다.' });
    }
  }
}

module.exports = new CouponController();
