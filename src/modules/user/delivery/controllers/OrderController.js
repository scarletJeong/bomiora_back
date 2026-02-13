const orderRepository = require('../repositories/OrderRepository');
const orderCartRepository = require('../repositories/OrderCartRepository');

class OrderController {
  toInt(value) {
    return value == null ? 0 : Number(value);
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

  toOrderItem(cart, imageUrlMap) {
    const ctPrice = this.toInt(cart.ct_price);
    const ioPrice = this.toInt(cart.io_price);
    const ctQty = this.toInt(cart.ct_qty);
    return {
      ctId: cart.ct_id,
      itId: cart.it_id,
      itName: cart.it_name,
      itSubject: cart.it_subject,
      ctOption: cart.ct_option,
      ctQty,
      ctPrice,
      ioPrice,
      totalPrice: (ctPrice + ioPrice) * ctQty,
      ctStatus: cart.ct_status,
      imageUrl: imageUrlMap[cart.it_id] || ''
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
      const odIds = rows.map((r) => Number(r.od_id));

      const allCarts = await orderCartRepository.findByOdIds(odIds);
      const cartsByOrder = {};
      allCarts.forEach((c) => {
        const key = Number(c.od_id);
        if (!cartsByOrder[key]) cartsByOrder[key] = [];
        cartsByOrder[key].push(c);
      });

      const itIds = [...new Set(allCarts.map((c) => c.it_id).filter(Boolean))];
      const imageRows = await orderRepository.getItemImagesByItIds(itIds);
      const imageUrlMap = {};
      imageRows.forEach((row) => {
        if (row.it_img1) imageUrlMap[row.it_id] = row.it_img1;
      });

      const orders = rows.map((row) => {
        const items = (cartsByOrder[Number(row.od_id)] || []).map((c) => this.toOrderItem(c, imageUrlMap));
        return {
          odId: String(row.od_id),
          orderDate: this.formatDate(row.od_time, false),
          orderDateTime: this.formatDate(row.od_time, true),
          displayStatus: this.getDisplayStatus(row.od_status, row.delivery_completed, row.admin_completed, row.auto_confirm_at),
          odStatus: row.od_status,
          totalPrice: this.toInt(row.od_receipt_price),
          odCartCount: this.toInt(row.od_cart_count),
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
      const odId = Number(req.params.odId);
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
        totalPrice: this.toInt(row.od_receipt_price),
        paymentMethod: row.od_settle_case,
        paymentMethodDetail: null,
        ordererName: row.od_b_name,
        ordererPhone: row.od_b_hp,
        ordererEmail: row.od_email,
        cancelReason: null,
        cancelType: null,
        reservationDate: null,
        reservationTime: null
      };

      if (row.od_bank_account && (String(row.od_settle_case || '').includes('간편결제') || String(row.od_settle_case || '').includes('신용카드'))) {
        if (String(row.od_bank_account).includes('카카오')) detail.paymentMethodDetail = ' (카카오페이)';
        else if (String(row.od_bank_account).includes('네이버')) detail.paymentMethodDetail = ' (네이버페이)';
        else if (String(row.od_bank_account).includes('토스')) detail.paymentMethodDetail = ' (토스페이)';
        else if (String(row.od_bank_account) !== '0') detail.paymentMethodDetail = ` (${row.od_bank_account})`;
      }

      if (row.od_status === '취소' || row.od_status === '반품') {
        this.parseCancelInfo(detail, row.od_shop_memo, row.od_mod_history);
      }

      const reservation = await orderRepository.getReservation(mbId, odId);
      if (reservation) {
        detail.reservationDate = reservation.hp_rsvt_date ? String(reservation.hp_rsvt_date).substring(0, 10) : null;
        detail.reservationTime = reservation.hp_rsvt_stime || null;
      }

      return res.json(detail);
    } catch (error) {
      return res.status(404).json({ error: '주문 정보를 불러올 수 없습니다.' });
    }
  }

  async cancelOrder(req, res) {
    try {
      const odId = Number(req.params.odId);
      const mbId = req.body.mbId;
      if (!mbId || !String(mbId).trim()) return res.status(400).json({ error: '회원 ID가 필요합니다.' });

      const order = await orderRepository.findById(odId);
      if (!order) throw new Error('주문을 찾을 수 없습니다.');
      if (order.mb_id !== mbId) throw new Error('주문 정보가 일치하지 않습니다.');
      if (!['주문', '입금', '준비'].includes(order.od_status)) throw new Error('취소할 수 없는 상태입니다.');
      if (this.toInt(order.od_cancel_price) > 0) throw new Error('이미 취소된 주문입니다.');

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
      const odId = Number(req.params.odId);
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
      const odId = Number(req.params.odId);
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
}

module.exports = new OrderController();
