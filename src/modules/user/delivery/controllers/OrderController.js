const orderRepository = require('../repositories/OrderRepository');
const orderCartRepository = require('../repositories/OrderCartRepository');
const kcpApprovalService = require('../../../shopping/kcp_pay/services/kcpApprovalService');

class OrderController {
  bufferToString(value) {
    if (value == null) return null;
    if (typeof value === 'string') return value;
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
      return Buffer.from(value.data).toString('utf8');
    }
    return String(value);
  }

  toInt(value) {
    return value == null ? 0 : Number(value);
  }

  toOdId(value) {
    return value == null ? '' : String(value).trim();
  }

  formatDate(dateValue, withTime) {
    if (!dateValue) return '';
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    if (!withTime) return `${yyyy}.${mm}.${dd}`;
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
    }

  getDisplayStatus(odStatus, deliveryCompleted, adminCompleted, autoConfirmAt) {
    if (Number(deliveryCompleted || 0) === 1) return '배송완료';
    if (Number(adminCompleted || 0) === 1 && autoConfirmAt && new Date(autoConfirmAt) < new Date()) return '배송완료';
    if (Number(adminCompleted || 0) === 1 && (odStatus === '배송' || odStatus === '완료')) return '배송중';

    switch (odStatus) {
      case '주문':
        return '결제대기중';
      case '입금':
        return '결제완료';
      case '준비':
        return '배송준비중';
      case '배송':
      case '완료':
        return '배송중';
      case '취소':
      case '반품':
        return '취소/반품';
      default:
        return odStatus;
    }
  }

  /**
   * KCP 매출전표(구매 영수증) URL — NHN KCP 매출전표 연동(cmd=card_bill).
   * @see https://developer.kcp.co.kr/page/document/bill
   */
  buildKcpCardReceiptUrl(row) {
    const odPg = this.bufferToString(row.od_pg || '').toLowerCase();
    if (odPg !== 'kcp') return null;

    const tno = this.bufferToString(row.od_tno || '').trim();
    if (!tno || tno.startsWith('PENDING-')) return null;

    const settleRaw = this.bufferToString(row.od_settle_case || '');
    const blockSubstrings = ['가상', '무통장', '계좌이체', '휴대폰'];
    for (const s of blockSubstrings) {
      if (settleRaw.includes(s)) return null;
    }

    const tradeMony = this.toInt(row.od_receipt_price) > 0
      ? this.toInt(row.od_receipt_price)
      : this.computeOrderTotal(row);
    if (!Number.isFinite(tradeMony) || tradeMony <= 0) return null;

    const orderNo = this.toOdId(row.od_id);
    if (!orderNo) return null;

    const isTest = Number(row.od_test || 0) === 1;
    const defaultBase = isTest
      ? 'https://testadmin8.kcp.co.kr/assist/bill.BillActionNew.do'
      : 'https://admin8.kcp.co.kr/assist/bill.BillActionNew.do';
    const base = String(process.env.KCP_BILL_BASE_URL || defaultBase).trim() || defaultBase;

    const qs = new URLSearchParams({
      cmd: 'card_bill',
      tno,
      order_no: orderNo,
      trade_mony: String(tradeMony),
    });
    return `${base}?${qs.toString()}`;
  }

  /**
   * 주문 취소 시 KCP 망취소 대상 여부 (신용카드 승인 건, 가상계좌·휴대폰 등 제외).
   * buildKcpCardReceiptUrl 과 동일한 PG/결제수단 판별을 사용한다.
   */
  isKcpCardNetworkCancelTarget(row) {
    if (this.bufferToString(row.od_pg || '').toLowerCase() !== 'kcp') return false;
    const tno = this.bufferToString(row.od_tno || '').trim();
    if (!tno || tno.startsWith('PENDING-')) return false;
    const settleRaw = this.bufferToString(row.od_settle_case || '');
    const blockSubstrings = ['가상', '무통장', '계좌이체', '휴대폰'];
    for (const s of blockSubstrings) {
      if (settleRaw.includes(s)) return false;
    }
    return true;
  }

  /** KCP Pay 취소 mod_type — 에스크로는 STE2, 일반 카드는 STSC (KcpPayController.resolveCancelModType 와 정합). */
  resolveKcpCancelModTypeForOrder(row) {
    const isEscrow = this.toInt(row.od_escrow) === 1;
    if (isEscrow) return 'STE2';
    return 'STSC';
  }

  resolveClientIp(req) {
    const xff = String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim();
    const raw = xff || String(req.ip || req.connection?.remoteAddress || '127.0.0.1');
    return raw.replace(/^::ffff:/, '').trim();
  }

  /**
   * KCP 취소(mod_ip)는 "파트너관리자에 등록된 결제서버 IP"가 들어가야 하는 케이스가 있다.
   * 프록시 환경에서는 req.ip가 ::1/127.0.0.1 로 잡히므로 환경변수로 고정 IP를 우선 사용한다.
   */
  resolveKcpModIp(req) {
    const fromEnv = String(
      process.env.KCP_PAY_MOD_IP ||
      process.env.KCP_MOD_IP ||
      process.env.KCP_CANCEL_MOD_IP ||
      ''
    ).trim();
    if (fromEnv) return fromEnv.replace(/^::ffff:/, '').trim();
    return this.resolveClientIp(req);
  }

  computeOrderTotal(row) {
    const receipt = this.toInt(row.od_receipt_price);
    if (receipt > 0) return receipt;
    return (
      this.toInt(row.od_cart_price) +
      this.toInt(row.od_send_cost) +
      this.toInt(row.od_send_cost2) -
      this.toInt(row.od_send_coupon) -
      this.toInt(row.od_cart_coupon) -
      this.toInt(row.od_coupon) -
      this.toInt(row.od_receipt_point)
    );
  }

  toOrderItem(cart, imageUrlMap) {
    const ctPrice = this.toInt(cart.ct_price);
    const ioPrice = this.toInt(cart.io_price);
    const ctQty = this.toInt(cart.ct_qty);
    const itId = this.bufferToString(cart.it_id) || '';
    const itName = this.bufferToString(cart.item_name || cart.it_name) || '';
    const itSubject = this.bufferToString(cart.it_subject) || '';
    const itKind = this.bufferToString(cart.it_kind);
    const ctOption = this.bufferToString(cart.ct_option);
    const ctStatus = this.bufferToString(cart.ct_status);
    return {
      ctId: cart.ct_id,
      itId,
      itName,
      itKind,
      itSubject,
      ctOption,
      ctQty,
      ctPrice,
      ioPrice,
      totalPrice: (ctPrice + ioPrice) * ctQty,
      ctStatus,
      imageUrl: imageUrlMap[itId] || ''
    };
  }

  parseCancelInfo(detail, odShopMemo, odModHistory) {
    if (odShopMemo && odShopMemo.includes('주문자 본인 직접 취소')) {
      detail.cancelType = '고객직접';
      if (odShopMemo.includes('취소이유')) {
        const reason = odShopMemo.split('취소이유')[1].replace(':', '').replace(')', '').trim();
        detail.cancelReason = reason;
      }
      return;
    }
    if (odShopMemo && odShopMemo.includes('시스템 자동 취소')) {
      detail.cancelType = '시스템자동';
      if (odShopMemo.includes('취소이유')) {
        const reason = odShopMemo.split('취소이유')[1].replace(':', '').replace(')', '').trim();
        detail.cancelReason = reason;
      }
      return;
    }
    if (odModHistory && odModHistory.includes('주문취소 처리')) {
      detail.cancelType = '관리자';
      detail.cancelReason = '관리자가 주문을 취소했습니다.';
    }
  }

  async getOrderList(req, res) {
    try {
      const mbId = req.query.mbId;
      const period = Number(req.query.period || 0);
      const status = req.query.status || 'all';
      const page = Number(req.query.page || 0);
      const size = Number(req.query.size || 10);

      const { rows, total } = await orderRepository.getOrders(mbId, period, status, page, size);
      const odIds = rows.map((r) => this.toOdId(r.od_id)).filter(Boolean);

      const allCarts = await orderCartRepository.findByOdIds(odIds);
      const cartsByOrder = {};
      allCarts.forEach((c) => {
        const key = this.toOdId(c.od_id);
        if (!cartsByOrder[key]) cartsByOrder[key] = [];
        cartsByOrder[key].push(c);
      });

      const itIds = [...new Set(allCarts.map((c) => c.it_id).filter(Boolean))];
      const imageRows = await orderRepository.getItemImagesByItIds(itIds);
      const imageUrlMap = {};
      imageRows.forEach((row) => {
        if (row.it_img1) imageUrlMap[row.it_id] = row.it_img1;
      });
      const prescriptionFlags = await orderRepository.getPrescriptionFlagsByOdIds(mbId, odIds);

      const orders = rows.map((row) => {
        const odId = this.toOdId(row.od_id);
        const items = (cartsByOrder[odId] || []).map((c) => this.toOrderItem(c, imageUrlMap));
        return {
          odId,
          orderDate: this.formatDate(row.od_time, false),
          orderDateTime: this.formatDate(row.od_time, true),
          displayStatus: this.getDisplayStatus(row.od_status, row.delivery_completed, row.admin_completed, row.auto_confirm_at),
          odStatus: row.od_status,
          totalPrice: this.computeOrderTotal(row),
          odCartCount: this.toInt(row.od_cart_count),
          isPrescriptionOrder: prescriptionFlags[odId] === true,
          items,
          firstProductName: items[0]?.itName || null,
          firstProductOption: items[0]?.ctOption || null,
          firstProductQty: items[0]?.ctQty || null,
          firstProductPrice: items[0]?.totalPrice || null
        };
      });

      const totalPages = Math.ceil(total / size);
      return res.json({
        orders,
        currentPage: page,
        totalPages,
        totalElements: total,
        totalItems: total,
        hasNext: page + 1 < totalPages
      });
    } catch (error) {
      return res.json({
        orders: [],
        currentPage: Number(req.query.page || 0),
        totalPages: 0,
        totalElements: 0,
        totalItems: 0,
        hasNext: false
      });
    }
  }

  async getOrderDetail(req, res) {
    try {
      const odId = this.toOdId(req.params.odId);
      if (!odId) return res.status(400).json({ error: '주문번호가 필요합니다.' });
      const mbId = req.query.mbId;
      const row = await orderRepository.getOrderDetail(odId, mbId);
      if (!row) return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });

      const carts = await orderCartRepository.findByOdIdAndMbId(odId, mbId);
      const itIds = [...new Set(carts.map((c) => c.it_id).filter(Boolean))];
      const imageRows = await orderRepository.getItemImagesByItIds(itIds);
      const imageUrlMap = {};
      imageRows.forEach((img) => {
        if (img.it_img1) imageUrlMap[img.it_id] = img.it_img1;
      });
      const products = carts.map((c) => this.toOrderItem(c, imageUrlMap));
      const settleCase = this.bufferToString(row.od_settle_case) || '';
      const bankAccount = this.bufferToString(row.od_bank_account) || '';

      const detail = {
        odId: String(row.od_id),
        orderDate: this.formatDate(row.od_time, true),
        displayStatus: this.getDisplayStatus(row.od_status, row.delivery_completed, row.admin_completed, row.auto_confirm_at),
        odStatus: row.od_status,
        recipientName: row.od_name,
        recipientPhone: row.od_hp,
        recipientAddress: row.od_addr1,
        recipientAddressDetail: `${row.od_addr2 || ''} ${row.od_addr3 || ''}`.trim(),
        deliveryMessage: row.od_memo,
        deliveryCompany: row.od_delivery_company,
        trackingNumber: row.od_invoice,
        products,
        productPrice: this.toInt(row.od_cart_price),
        deliveryFee: this.toInt(row.od_send_cost) + this.toInt(row.od_send_cost2),
        discountAmount: this.toInt(row.od_cart_coupon) + this.toInt(row.od_send_coupon) + this.toInt(row.od_coupon) + this.toInt(row.od_receipt_point),
        totalPrice: this.computeOrderTotal(row),
        isPrescriptionOrder: false,
        paymentMethod: settleCase || ((this.toInt(row.od_misu) > 0 && bankAccount.includes('/')) ? '가상계좌' : ''),
        paymentMethodDetail: null,
        ordererName: row.od_b_name,
        ordererPhone: row.od_b_hp,
        ordererEmail: row.od_email,
        cancelReason: null,
        cancelType: null,
        reservationDate: null,
        reservationTime: null
      };

      if (bankAccount && (settleCase.includes('가상계좌') || settleCase.includes('무통장'))) {
        detail.paymentMethodDetail = bankAccount;
      } else if (bankAccount && (settleCase.includes('간편결제') || settleCase.includes('신용카드'))) {
        if (bankAccount.includes('카카오')) detail.paymentMethodDetail = ' (카카오페이)';
        else if (bankAccount.includes('네이버')) detail.paymentMethodDetail = ' (네이버페이)';
        else if (bankAccount.includes('토스')) detail.paymentMethodDetail = ' (토스페이)';
        else if (bankAccount !== '0') detail.paymentMethodDetail = ` (${bankAccount})`;
      }

      if (row.od_status === '취소' || row.od_status === '반품') {
        this.parseCancelInfo(detail, row.od_shop_memo, row.od_mod_history);
      }

      const reservation = await orderRepository.getReservation(mbId, odId);
      if (reservation) {
        detail.reservationDate = reservation.hp_rsvt_date ? String(reservation.hp_rsvt_date).substring(0, 10) : null;
        detail.reservationTime = reservation.hp_rsvt_stime || null;
      }
      detail.isPrescriptionOrder = await orderRepository.isPrescriptionOrder(mbId, odId);

      const cardReceiptUrl = this.buildKcpCardReceiptUrl(row);
      if (cardReceiptUrl) {
        detail.cardReceiptUrl = cardReceiptUrl;
      }

      return res.json(detail);
    } catch (error) {
      return res.status(404).json({ error: '주문 정보를 불러올 수 없습니다.' });
    }
  }

  async cancelOrder(req, res) {
    try {
      const odId = this.toOdId(req.params.odId);
      if (!odId) return res.status(400).json({ error: '주문번호가 필요합니다.' });
      const mbId = req.body.mbId;
      if (!mbId || !String(mbId).trim()) return res.status(400).json({ error: '회원 ID가 필요합니다.' });

      const order = await orderRepository.findById(odId);
      if (!order) throw new Error('주문을 찾을 수 없습니다.');
      if (this.bufferToString(order.mb_id || '').trim() !== String(mbId || '').trim()) {
        throw new Error('주문 정보가 일치하지 않습니다.');
      }
      const odStatus = this.bufferToString(order.od_status || '').trim();
      if (!['주문', '입금', '준비'].includes(odStatus)) {
        throw new Error(`취소할 수 없는 상태입니다. (현재상태: ${odStatus || 'UNKNOWN'})`);
      }
      if (this.toInt(order.od_cancel_price) > 0) throw new Error('이미 취소된 주문입니다.');

      if (this.isKcpCardNetworkCancelTarget(order)) {
        const tno = this.bufferToString(order.od_tno || '').trim();
        const modType = this.resolveKcpCancelModTypeForOrder(order);
        const clientIp = this.resolveKcpModIp(req);
        let kcpResult;
        try {
          kcpResult = await kcpApprovalService.cancel({
            orderId: odId,
            tno,
            modType,
            modDesc: 'USER_ORDER_CANCEL',
            clientIp,
          });
        } catch (kcpErr) {
          console.error('[OrderController] KCP 망취소(브리지) 실패', { odId, message: kcpErr.message });
          return res.status(400).json({
            error: kcpErr.message || '카드 승인 취소(망취소) 처리에 실패했습니다.',
            kcp: { code: 'BRIDGE', message: kcpErr.message },
          });
        }
        if (!kcpResult.success) {
          const resCd = String(kcpResult.res_cd || '');
          const resMsg = String(kcpResult.res_msg || '승인 취소에 실패했습니다.');
          console.error('[OrderController] KCP 망취소 거절', { odId, res_cd: resCd, res_msg: resMsg, modType });
          return res.status(400).json({
            error: `결제 취소에 실패했습니다. (${resCd}) ${resMsg}`,
            kcp: { code: resCd, message: resMsg, modType },
          });
        }
      }

      await orderRepository.updateOrder(odId, {
        od_status: '취소',
        status_changed_at: new Date()
      });
      return res.json({ success: true, message: '주문이 취소되었습니다.' });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async confirmPurchase(req, res) {
    try {
      const odId = this.toOdId(req.params.odId);
      if (!odId) return res.status(400).json({ error: '주문번호가 필요합니다.' });
      const mbId = req.body.mbId;
      if (!mbId || !String(mbId).trim()) return res.status(400).json({ error: '회원 ID가 필요합니다.' });

      const order = await orderRepository.findById(odId);
      if (!order) throw new Error('주문을 찾을 수 없습니다.');
      if (order.mb_id !== mbId) throw new Error('주문 정보가 일치하지 않습니다.');
      if (!['배송', '완료'].includes(order.od_status)) throw new Error('구매 확정할 수 없는 상태입니다.');
      if (this.toInt(order.delivery_completed) === 1) throw new Error('이미 구매가 확정된 주문입니다.');

      await orderRepository.updateOrder(odId, {
        delivery_completed: 1,
        delivery_completed_at: new Date(),
        od_status: '완료'
      });
      return res.json({ success: true, message: '구매가 확정되었습니다.' });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async processAutoConfirm(req, res) {
    return res.json({ success: true, message: '자동 확정 처리가 완료되었습니다.' });
  }

  async changeReservationTime(req, res) {
    try {
      const odId = this.toOdId(req.params.odId);
      if (!odId) return res.status(400).json({ error: '주문번호가 필요합니다.' });
      const { mbId, reservationDate, reservationTime } = req.body;
      if (!mbId || !String(mbId).trim()) return res.status(400).json({ error: '회원 ID가 필요합니다.' });
      if (!reservationDate || !String(reservationDate).trim()) return res.status(400).json({ error: '예약 날짜가 필요합니다.' });
      if (!reservationTime || !String(reservationTime).trim()) return res.status(400).json({ error: '예약 시간이 필요합니다.' });

      const order = await orderRepository.findById(odId);
      if (!order) throw new Error('주문을 찾을 수 없습니다.');
      if (order.mb_id !== mbId) throw new Error('주문 정보가 일치하지 않습니다.');
      if (!['주문', '입금'].includes(order.od_status)) {
        throw new Error('예약 시간은 결제 완료 상태에서만 변경할 수 있습니다.');
      }
      if (await orderRepository.isPrescriptionOrder(mbId, odId)) {
        throw new Error('처방 주문은 예약 시간 변경이 불가능합니다.');
      }

      const date = String(reservationDate).includes('T')
        ? String(reservationDate).substring(0, String(reservationDate).indexOf('T'))
        : String(reservationDate);
      const changed = await orderRepository.updateReservation(mbId, odId, date, reservationTime);
      if (!changed) throw new Error('예약 정보를 찾을 수 없습니다.');

      return res.json({ success: true, message: '예약 시간이 변경되었습니다.' });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async changeDeliveryAddress(req, res) {
    try {
      const odId = this.toOdId(req.params.odId);
      if (!odId) return res.status(400).json({ error: '주문번호가 필요합니다.' });
      const mbId = req.body.mbId;
      const addressId = Number(req.body.addressId || req.body.adId);

      if (!mbId || !String(mbId).trim()) return res.status(400).json({ error: '회원 ID가 필요합니다.' });
      if (!addressId || Number.isNaN(addressId)) return res.status(400).json({ error: '배송지 ID가 필요합니다.' });

      const order = await orderRepository.findById(odId);
      if (!order) throw new Error('주문을 찾을 수 없습니다.');
      if (order.mb_id !== mbId) throw new Error('주문 정보가 일치하지 않습니다.');
      if (!['주문', '입금', '준비'].includes(order.od_status)) {
        throw new Error('배송지는 결제대기/배송준비 상태에서만 변경할 수 있습니다.');
      }
      if (await orderRepository.isPrescriptionOrder(mbId, odId)) {
        throw new Error('처방 주문은 배송지 변경이 불가능합니다.');
      }

      const address = await orderRepository.getAddressById(mbId, addressId);
      if (!address) throw new Error('선택한 배송지를 찾을 수 없습니다.');

      const changed = await orderRepository.updateOrderAddress(odId, mbId, address);
      if (!changed) throw new Error('배송지 변경에 실패했습니다.');

      return res.json({ success: true, message: '배송지가 변경되었습니다.' });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
}

module.exports = new OrderController();
