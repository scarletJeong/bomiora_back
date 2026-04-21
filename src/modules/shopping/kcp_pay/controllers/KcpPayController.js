const kcpPayService = require('../services/kcpPayService');
const kcpPayStore = require('../services/kcpPayStore');
const kcpPayRepository = require('../repositories/KcpPayRepository');
const kcpApprovalService = require('../services/kcpApprovalService');

const KCP_ERROR_MESSAGE_MAP = {
  '3001': '결제 요청 정보가 올바르지 않습니다.',
  '3002': '유효하지 않은 거래 요청입니다.',
  '3003': '결제 인증이 올바르지 않습니다.',
  '3004': '결제 세션이 만료되었습니다. 다시 시도해 주세요.',
  '3005': '결제 진행 중 통신 오류가 발생했습니다.',
  '3011': '결제가 중단되었습니다. 다시 시도해 주세요.',
  '3014': '미등록 또는 사용불가 사이트 코드입니다. KCP 등록 정보를 확인해 주세요.',
  '9562': 'KCP 연동 모듈 설정이 올바르지 않습니다.',
  '9002': '서버 KCP 환경변수(SITE_CD/SITE_KEY) 설정이 누락되었습니다.',
  '9003': '서버 KCP 라이브러리 경로를 찾을 수 없습니다.',
  '9004': 'KCP 승인 필수 파라미터가 누락되었습니다.',
  '9005': 'KCP 자동취소 필수 파라미터가 누락되었습니다.',
};

class KcpPayController {
  applyKcpHtmlCsp(res) {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self' https: data: blob:",
        "script-src 'self' 'unsafe-inline' https://pay.kcp.co.kr https://*.kcp.co.kr",
        "script-src-elem 'self' 'unsafe-inline' https://pay.kcp.co.kr https://*.kcp.co.kr",
        "script-src-attr 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https:",
        "frame-src 'self' https://pay.kcp.co.kr https://*.kcp.co.kr",
        "form-action 'self' https://pay.kcp.co.kr https://*.kcp.co.kr",
        "base-uri 'self'",
      ].join('; ')
    );
  }

  async request(req, res) {
    try {
      const {
        mb_id: mbId,
        cart_ids: rawCartIds,
        payment_method: paymentMethod,
        escrow_use: escrowUse,
        shipping_cost: shippingCost,
        coupon_discount: couponDiscount,
        used_point: usedPoint,
        final_amount: finalAmount,
        goods_name: goodsName,
        orderer,
        receiver,
      } = req.body || {};

      if (!mbId) {
        return res.status(400).json({ success: false, message: 'mb_id가 필요합니다.' });
      }

      const cartIds = (Array.isArray(rawCartIds) ? rawCartIds : [])
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0);

      if (!cartIds.length) {
        return res.status(400).json({ success: false, message: 'cart_ids가 비어 있습니다.' });
      }

      const carts = await kcpPayRepository.getCartItemsByIds(mbId, cartIds);
      if (carts.length !== cartIds.length) {
        return res.status(400).json({
          success: false,
          message: '유효하지 않은 장바구니 항목이 포함되어 있습니다.',
        });
      }

      const cartPrice = carts.reduce((sum, row) => sum + Number(row.ct_price || 0), 0);
      const safeShippingCost = Number(shippingCost || 0);
      const safeCouponDiscount = Number(couponDiscount || 0);
      const safeUsedPoint = Number(usedPoint || 0);
      const computedFinalAmount = Math.max(
        0,
        cartPrice + safeShippingCost - safeCouponDiscount - safeUsedPoint
      );
      const requestFinalAmount = Number(finalAmount || 0);

      if (requestFinalAmount !== computedFinalAmount) {
        return res.status(400).json({
          success: false,
          message: '결제 금액 검증에 실패했습니다.',
          expected: computedFinalAmount,
          received: requestFinalAmount,
        });
      }

      const config = kcpPayService.getConfig();
      const mapped = kcpPayService.mapMethod(paymentMethod);
      const orderId = this.generateOrderId();
      const basketCount = await kcpPayRepository.getDistinctItemCountByCartIds(mbId, cartIds);

      const pending = kcpPayStore.createPending({
        mbId,
        orderId,
        cartIds,
        paymentMethod: mapped,
        escrowUse: escrowUse === true,
        amount: computedFinalAmount,
        goodsName: String(goodsName || '').trim() || this.buildGoodsName(carts),
        orderer: this.normalizeOrderer(orderer),
        receiver: this.normalizeReceiver(receiver),
        shippingCost: safeShippingCost,
        couponDiscount: safeCouponDiscount,
        usedPoint: safeUsedPoint,
      });

      const callbackUrl = this.resolveCallbackUrl(req, config.callbackUrl);

      const html = kcpPayService.buildRequestHtml({
        jsUrl: config.jsUrl,
        callbackUrl,
        token: pending.token,
        siteCd: config.siteCd,
        siteName: config.siteName,
        orderId,
        goodsName: pending.request.goodsName,
        amount: computedFinalAmount,
        buyer: pending.request.orderer,
        receiver: pending.request.receiver,
        payMethod: mapped.payMethod,
        escrowUse: escrowUse === true,
        basketCount,
      });

      kcpPayStore.saveResult(pending.token, {
        request_html: html,
      });

      return res.json({
        success: true,
        token: pending.token,
        order_id: orderId,
        amount: computedFinalAmount,
        settle_case: mapped.settleCase,
        html,
      });
    } catch (error) {
      console.error('❌ [KcpPayController] request 오류:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'KCP 결제 요청 생성 중 오류가 발생했습니다.',
      });
    }
  }

  async launch(req, res) {
    const token = String(req.params.token || '').trim();
    const row = kcpPayStore.get(token);
    if (!row || !row.request_html) {
      return res
        .status(404)
        .type('html')
        .send('<html><body><h3>결제 세션을 찾을 수 없습니다.</h3></body></html>');
    }

    this.applyKcpHtmlCsp(res);

    return res.status(200).type('html').send(String(row.request_html));
  }

  async callback(req, res) {
    this.applyKcpHtmlCsp(res);
    const token = String(req.body.kcp_token || req.query.token || '').trim();
    const pending = kcpPayStore.get(token);

    console.log('🧾 [KCP callback] inbound', {
      token,
      res_cd: String(req.body.res_cd || '').trim(),
      tno: String(req.body.tno || '').trim(),
      use_pay_method: String(req.body.use_pay_method || req.body.pay_method || '').trim(),
      order_no: String(req.body.order_no || req.body.ordr_idxx || '').trim(),
    });

    if (!pending) {
      console.warn('⚠️ [KCP callback] pending not found', {
        token,
        order_no: String(req.body.order_no || req.body.ordr_idxx || '').trim(),
      });
      return res
        .status(200)
        .type('html')
        .send(kcpPayService.buildCallbackHtml({
          token,
          success: false,
          message: '결제 세션이 만료되었습니다. 다시 시도해 주세요.',
        }));
    }

    try {
      const resCd = String(req.body.res_cd || '').trim();
      const resMsg = String(req.body.res_msg || '').trim();

      if (resCd !== '0000') {
        const mappedMessage = this.mapKcpErrorMessage(resCd, resMsg || '결제가 취소되었거나 실패했습니다.');
        const failed = kcpPayStore.saveResult(token, {
          status: 'failed',
          success: false,
          message: mappedMessage,
          error_code: resCd || null,
          raw: req.body,
        });
        return res
          .status(200)
          .type('html')
          .send(kcpPayService.buildCallbackHtml({
            token,
            success: false,
            message: failed.message,
          }));
      }

      const tranCd = this.pickFirstValue(req.body, [
        'tran_cd',
        'tr_cd',
        'tx_cd',
        'tranCd',
      ]) || '00100000';
      const encData = this.pickFirstValue(req.body, [
        'enc_data',
        'encData',
        'ENC_DATA',
      ]);
      const encInfo = this.pickFirstValue(req.body, [
        'enc_info',
        'encInfo',
        'ENC_INFO',
      ]);

      if (!encData || !encInfo) {
        console.warn('⚠️ [KCP callback] enc payload missing', {
          token,
          has_enc_data: Boolean(encData),
          has_enc_info: Boolean(encInfo),
          keys: Object.keys(req.body || {}),
        });
      }

      const approval = await kcpApprovalService.approve({
        orderId: pending.request.orderId,
        amount: pending.request.amount,
        tranCd,
        encData,
        encInfo,
        clientIp: this.resolveClientIp(req),
      });

      if (!approval.success) {
        throw this.buildHandledError({
          code: String(approval.res_cd || 'NO_CODE'),
          defaultMessage: String(approval.res_msg || 'KCP 서버 승인에 실패했습니다.'),
          raw: { approval },
        });
      }

      const settleInfo = this.resolveSettleInfo(approval, pending.request);
      const isVirtualAccount = settleInfo.settleCase === '가상계좌';
      const tno = String(approval.tno || '').trim();
      const appNo = settleInfo.appNo;
      const bankAccount = settleInfo.bankAccount;
      const depositName = settleInfo.depositName || pending.request.orderer.name;

      if (!tno) {
        throw this.buildHandledError({
          code: 'KCP_TNO_EMPTY',
          defaultMessage: 'KCP 승인번호(tno)를 확인할 수 없습니다. 서버 승인 연동을 점검해 주세요.',
          raw: { approval },
        });
      }

      const approvedAmount = Number(approval.amount || 0);
      const expectedAmount = Number(pending.request.amount || 0);
      if (!Number.isFinite(approvedAmount) || approvedAmount !== expectedAmount) {
        const cancel = await this.tryAutoCancel({
          orderId: pending.request.orderId,
          tno,
          pendingRequest: pending.request,
          approval,
          clientIp: this.resolveClientIp(req),
          reason: `AMOUNT_MISMATCH:${expectedAmount}->${approvedAmount}`,
        });
        throw this.buildHandledError({
          code: 'KCP_AMOUNT_MISMATCH',
          defaultMessage: '결제 금액 검증에 실패하여 자동으로 승인취소 처리했습니다.',
          raw: { approval, expectedAmount, approvedAmount, cancel },
          cancel,
        });
      }

      let orderResult;
      try {
        orderResult = await kcpPayRepository.createPaidOrder({
          orderId: pending.request.orderId,
          mbId: pending.request.mbId,
          cartIds: pending.request.cartIds,
          ordererName: pending.request.orderer.name,
          ordererEmail: pending.request.orderer.email,
          ordererTel: pending.request.orderer.tel,
          ordererHp: pending.request.orderer.hp,
          receiverName: pending.request.receiver.name,
          receiverTel: pending.request.receiver.tel,
          receiverHp: pending.request.receiver.hp,
          receiverZip1: pending.request.receiver.zip1,
          receiverZip2: pending.request.receiver.zip2,
          receiverAddr1: pending.request.receiver.addr1,
          receiverAddr2: pending.request.receiver.addr2,
          receiverAddr3: pending.request.receiver.addr3,
          depositName,
          memo: pending.request.receiver.memo,
          cartCount: pending.request.cartIds.length,
          cartPrice: pending.request.amount - pending.request.shippingCost + pending.request.couponDiscount + pending.request.usedPoint,
          sendCost: pending.request.shippingCost,
          sendCoupon: 0,
          cartCoupon: pending.request.couponDiscount,
          orderCoupon: 0,
          totalAmount: pending.request.amount,
          usedPoint: pending.request.usedPoint,
          bankAccount,
          tno,
          appNo,
          appTime: settleInfo.appTime,
          escrow: pending.request.escrowUse,
          ipAddress: req.ip,
          settleCase: settleInfo.settleCase,
          otherPayType: settleInfo.otherPayType,
        });
      } catch (dbError) {
        const cancel = await this.tryAutoCancel({
          orderId: pending.request.orderId,
          tno,
          pendingRequest: pending.request,
          approval,
          clientIp: this.resolveClientIp(req),
          reason: 'DB_SAVE_FAILED',
        });
        throw this.buildHandledError({
          code: 'KCP_DB_SAVE_FAILED',
          defaultMessage: '주문 저장 중 오류가 발생하여 자동으로 승인취소 처리했습니다.',
          raw: { dbError: dbError.message, approval, cancel },
          cancel,
        });
      }

      const doneMessage = isVirtualAccount
        ? '가상계좌가 발급되었습니다. 입금 완료 후 주문이 확정됩니다.'
        : '결제가 완료되었습니다.';
      const done = kcpPayStore.saveResult(token, {
        status: 'success',
        success: true,
        message: doneMessage,
        order_id: String(pending.request.orderId),
        tno,
        app_no: appNo || null,
        settle_case: settleInfo.settleCase,
        order_status: isVirtualAccount ? '주문' : '입금',
        duplicated: orderResult?.duplicated === true,
        raw: {
          callback: req.body,
          approval,
        },
      });

      console.log('✅ [KCP callback] processed', {
        token,
        order_id: String(pending.request.orderId),
        settle_case: settleInfo.settleCase,
        res_cd: resCd,
        tno,
      });

      return res
        .status(200)
        .type('html')
        .send(kcpPayService.buildCallbackHtml({
          token,
          success: true,
          message: done.message,
        }));
    } catch (error) {
      console.error('❌ [KcpPayController] callback 오류:', error);
      console.error('❌ [KCP callback] payload snapshot', {
        token,
        res_cd: String(req.body.res_cd || '').trim(),
        tno: String(req.body.tno || '').trim(),
        use_pay_method: String(req.body.use_pay_method || req.body.pay_method || '').trim(),
        order_no: String(req.body.order_no || req.body.ordr_idxx || '').trim(),
      });
      kcpPayStore.saveResult(token, {
        status: 'failed',
        success: false,
        message: this.resolveClientErrorMessage(error),
        error_code: this.resolveClientErrorCode(error),
        raw: {
          callback: req.body,
          detail: error?.raw || null,
          cancel: error?.cancel || null,
        },
      });
      return res
        .status(200)
        .type('html')
        .send(kcpPayService.buildCallbackHtml({
          token,
          success: false,
          message: this.resolveClientErrorMessage(error),
        }));
    }
  }

  async getResult(req, res) {
    const row = kcpPayStore.get(req.params.token);
    if (!row) {
      return res.status(404).json({
        success: false,
        status: 'expired',
        message: '결제 결과를 찾을 수 없거나 만료되었습니다.',
      });
    }

    return res.json({
      success: row.success === true,
      status: row.status,
      message: row.message || '',
      error_code: row.error_code || null,
      order_id: row.order_id ? String(row.order_id) : null,
      tno: row.tno || null,
      app_no: row.app_no || null,
      settle_case: row.settle_case || null,
      order_status: row.order_status || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      expiresAt: row.expiresAt,
    });
  }

  async common(req, res) {
    try {
      const txCd = String(req.body.tx_cd || '').trim();
      console.log('🧾 [KCP common] inbound', {
        tx_cd: txCd,
        res_cd: String(req.body.res_cd || '').trim(),
        tno: String(req.body.tno || '').trim(),
        use_pay_method: String(req.body.use_pay_method || req.body.pay_method || '').trim(),
        order_no: String(req.body.order_no || req.body.ordr_idxx || '').trim(),
      });
      if (txCd !== 'TX00') {
        return res.status(200).type('text/plain').send('0000');
      }

      const orderId = String(req.body.order_no || '').trim();
      const tno = String(req.body.tno || '').trim();
      const amount = Number(req.body.ipgm_mnyx || 0);
      const txTime = String(req.body.tx_tm || '').trim();

      if (!orderId) {
        return res.status(200).type('text/plain').send('9999');
      }

      const updated = await kcpPayRepository.markVirtualAccountDeposit({
        orderId,
        tno,
        amount,
        txTime,
      });

      if (updated.success) {
        console.log('✅ [KCP common] TX00 applied', {
          order_no: orderId,
          tno,
          amount,
          status: updated.status,
          misu: updated.misu,
        });
        return res.status(200).type('text/plain').send('0000');
      }

      console.warn('⚠️ [KCP common] TX00 not applied', {
        order_no: orderId,
        tno,
        amount,
        message: updated.message || '',
      });
      return res.status(200).type('text/plain').send('9999');
    } catch (error) {
      console.error('❌ [KcpPayController] common 오류:', error);
      return res.status(200).type('text/plain').send('9999');
    }
  }

  normalizeOrderer(source) {
    const row = source || {};
    return {
      name: String(row.name || '').trim(),
      email: String(row.email || '').trim(),
      tel: String(row.tel || '').trim(),
      hp: String(row.hp || row.tel || '').trim(),
    };
  }

  normalizeReceiver(source) {
    const row = source || {};
    const zip = String(row.zip || '').trim().replace(/[^0-9]/g, '');
    return {
      name: String(row.name || '').trim(),
      tel: String(row.tel || '').trim(),
      hp: String(row.hp || row.tel || '').trim(),
      zip1: zip.slice(0, 3),
      zip2: zip.slice(3),
      addr1: String(row.addr1 || '').trim(),
      addr2: String(row.addr2 || '').trim(),
      addr3: String(row.addr3 || '').trim(),
      memo: String(row.memo || '').trim(),
    };
  }

  generateOrderId() {
    const now = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(Math.floor(Math.random() * 10000), 4)}`;
  }

  buildGoodsName(carts) {
    if (!Array.isArray(carts) || !carts.length) return '주문 상품';
    const first = String(carts[0].it_name || '').trim() || '주문 상품';
    if (carts.length === 1) return first;
    return `${first} 외 ${carts.length - 1}건`;
  }

  resolveSettleInfo(body, pendingRequest) {
    const usePayMethod = String(body.use_pay_method || body.pay_method || '').trim();
    const requested = String(pendingRequest?.paymentMethod?.settleCase || '').trim();

    let settleCase = requested || '신용카드';
    if (usePayMethod === '001000000000') {
      settleCase = '가상계좌';
    } else if (usePayMethod === '010000000000') {
      settleCase = '계좌이체';
    } else if (usePayMethod === '000010000000') {
      settleCase = '휴대폰';
    } else if (usePayMethod === '100000000000') {
      settleCase = requested || '신용카드';
    }

    let bankAccount = '';
    let depositName = String(pendingRequest?.orderer?.name || '').trim();
    if (settleCase === '가상계좌') {
      const bankName = String(body.bankname || body.bank_name || body.bank_nm || '').trim();
      const account = String(body.account || body.vacct_no || body.vact_num || '').trim();
      const vaDate = String(body.va_date || body.vact_expire_dt || body.vact_expire || '').trim();
      bankAccount = [bankName, account, vaDate].filter((v) => v && v.length > 0).join('/');
      depositName = String(body.depositor || '').trim() || depositName;
    } else if (settleCase === '계좌이체') {
      bankAccount = String(body.bank_name || body.bankname || '').trim();
    } else {
      bankAccount = String(body.card_name || body.bank_name || body.commid || '').trim();
    }

    const appNo = String(body.app_no || '').trim();
    const appTime = this.parseAppTime(body.app_time);
    const otherPayType = String(body.card_other_pay_type || '').trim();
    return { settleCase, bankAccount, depositName, appNo, appTime, otherPayType };
  }

  parseAppTime(raw) {
    const value = String(raw || '').trim();
    if (!/^\d{14}$/.test(value)) return null;
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}`;
  }

  resolveClientIp(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').trim();
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    const ip = String(req.ip || req.connection?.remoteAddress || '').trim();
    return ip || '127.0.0.1';
  }

  pickFirstValue(source, keys) {
    const obj = source && typeof source === 'object' ? source : {};
    for (const key of keys || []) {
      const raw = obj[key];
      const value = String(raw == null ? '' : raw).trim();
      if (value) return value;
    }
    return '';
  }

  mapKcpErrorMessage(code, fallbackMessage) {
    const key = String(code || '').trim();
    return KCP_ERROR_MESSAGE_MAP[key] || fallbackMessage || '결제 처리 중 오류가 발생했습니다.';
  }

  buildHandledError({ code, defaultMessage, raw, cancel }) {
    const error = new Error(this.mapKcpErrorMessage(code, defaultMessage));
    error.code = String(code || 'UNKNOWN');
    error.raw = raw || null;
    error.cancel = cancel || null;
    return error;
  }

  resolveClientErrorMessage(error) {
    if (!error) return '결제 처리 중 오류가 발생했습니다.';
    return String(error.message || '결제 처리 중 오류가 발생했습니다.');
  }

  resolveClientErrorCode(error) {
    if (!error) return null;
    const code = String(error.code || '').trim();
    return code || null;
  }

  resolveCancelModType({ escrowUse, usePayMethod }) {
    const isEscrow = escrowUse === true;
    const method = String(usePayMethod || '').trim();
    if (isEscrow && method === '001000000000') return 'STE5';
    if (isEscrow) return 'STE2';
    return 'STSC';
  }

  async tryAutoCancel({ orderId, tno, pendingRequest, approval, clientIp, reason }) {
    const txn = String(tno || '').trim();
    if (!txn) {
      return { attempted: false, success: false, reason: 'NO_TNO' };
    }

    const modType = this.resolveCancelModType({
      escrowUse: pendingRequest?.escrowUse === true || String(approval?.escw_yn || '').trim().toUpperCase() === 'Y',
      usePayMethod: approval?.use_pay_method,
    });

    try {
      const result = await kcpApprovalService.cancel({
        orderId,
        tno: txn,
        modType,
        modDesc: reason || 'AUTO_CANCEL',
        clientIp,
      });
      console.log('↩️ [KCP auto-cancel] result', {
        order_id: String(orderId || ''),
        tno: txn,
        mod_type: modType,
        res_cd: String(result?.res_cd || ''),
      });
      return {
        attempted: true,
        success: result.success === true,
        mod_type: modType,
        res_cd: result?.res_cd || null,
        res_msg: result?.res_msg || null,
      };
    } catch (cancelError) {
      console.error('❌ [KCP auto-cancel] failed', {
        order_id: String(orderId || ''),
        tno: txn,
        mod_type: modType,
        message: cancelError.message,
      });
      return {
        attempted: true,
        success: false,
        mod_type: modType,
        error: cancelError.message,
      };
    }
  }

  resolveCallbackUrl(req, configuredUrl) {
    const requestHost = String(req.get('host') || '').trim();
    const requestOrigin = `${req.protocol}://${requestHost}`;
    const fallback = `${requestOrigin}/api/kcp-pay/callback`;
    const configured = String(configuredUrl || '').trim();

    if (!configured) {
      return fallback;
    }

    const isLocalHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(requestHost);
    if (isLocalHost) {
      return fallback;
    }

    return configured;
  }
}

module.exports = new KcpPayController();
