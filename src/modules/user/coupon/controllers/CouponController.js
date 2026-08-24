const couponRepository = require('../repositories/CouponRepository');
const { HelpCouponError } = couponRepository;
const { TtlCache } = require('../../../../utils/ttlCache');

const couponResponseCache = new TtlCache(60_000);

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
      // 사용완료(사용한 쿠폰) 기준 시각: coupon_log.cl_datetime 우선
      // repository에서 DATE_FORMAT으로 문자열로 내려줌(타임존 변형 방지)
      cl_datetime: c.cl_datetime ?? null,
      cp_datetime: c.cp_datetime,
      applied_product: c._applied_product ?? null
    };
  }

  _invalidate(mbId) {
    const id = String(mbId || '').trim();
    if (!id) return;
    for (const key of couponResponseCache.store.keys()) {
      if (key.includes(`:${id}`)) couponResponseCache.store.delete(key);
    }
    if (typeof couponRepository.invalidateMemberCoupons === 'function') {
      couponRepository.invalidateMemberCoupons(id);
    }
  }

  async getUserCoupons(req, res) {
    try {
      const mbId = String(req.query.mb_id || '').trim();
      const payload = await couponResponseCache.getOrSet(`all:${mbId}`, async () => {
        const rows = await couponRepository.findByUserId(mbId);
        return { success: true, data: rows.map((r) => this.toMap(r)) };
      });
      res.set('Cache-Control', 'private, max-age=20');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ success: false, message: `쿠폰 목록 조회 실패: ${error.message}` });
    }
  }

  async getAvailableCoupons(req, res) {
    try {
      const mbId = String(req.query.mb_id || '').trim();
      const payload = await couponResponseCache.getOrSet(`avail:${mbId}`, async () => {
        const rows = await couponRepository.findAvailableCoupons(mbId);
        return { success: true, data: rows.map((r) => this.toMap(r)) };
      });
      res.set('Cache-Control', 'private, max-age=20');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ success: false, message: `사용가능한 쿠폰 조회 실패: ${error.message}` });
    }
  }

  async getUsedCoupons(req, res) {
    try {
      const mbId = String(req.query.mb_id || '').trim();
      const payload = await couponResponseCache.getOrSet(`used:${mbId}`, async () => {
        const rows = await couponRepository.findUsedCoupons(mbId);
        return { success: true, data: rows.map((r) => this.toMap(r)) };
      });
      res.set('Cache-Control', 'private, max-age=20');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ success: false, message: `사용한 쿠폰 조회 실패: ${error.message}` });
    }
  }

  async getExpiredCoupons(req, res) {
    try {
      const mbId = String(req.query.mb_id || '').trim();
      const payload = await couponResponseCache.getOrSet(`exp:${mbId}`, async () => {
        const rows = await couponRepository.findExpiredCoupons(mbId);
        return { success: true, data: rows.map((r) => this.toMap(r)) };
      });
      res.set('Cache-Control', 'private, max-age=20');
      return res.json(payload);
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

      this._invalidate(userId);
      return res.json({ success: true, message: '쿠폰이 등록되었습니다.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: `쿠폰 등록 실패: ${error.message}` });
    }
  }

  async downloadHelpCoupon(req, res) {
    try {
      const mbId = String(req.body.mbId ?? req.body.mb_id ?? '').trim();
      const itId = String(req.body.itId ?? req.body.it_id ?? '').trim();
      const isId = Number(req.body.isId ?? req.body.is_id);

      if (!mbId) {
        return res.json({ success: false, message: '회원 로그인 후 이용해 주십시오.' });
      }
      if (!itId || !Number.isFinite(isId) || isId <= 0) {
        return res.json({ success: false, message: '올바른 방법으로 이용해 주십시오.' });
      }

      const authMbId = req.user?.mb_id ?? req.user?.mbId;
      if (authMbId && String(authMbId).trim() !== mbId) {
        return res.json({ success: false, message: '회원 정보가 일치하지 않습니다.' });
      }

      const { cpId, downloadCount } = await couponRepository.downloadHelpCoupon({
        mbId,
        itId,
        isId
      });

      this._invalidate(mbId);
      return res.json({
        success: true,
        message: '쿠폰 발급이 완료되었습니다.',
        downloadCount,
        cpId
      });
    } catch (error) {
      if (error instanceof HelpCouponError) {
        return res.json({ success: false, message: error.message });
      }
      console.error('[downloadHelpCoupon]', error);
      return res.status(500).json({ success: false, message: '쿠폰 다운로드 중 오류가 발생했습니다.' });
    }
  }
}

module.exports = new CouponController();
