const cartRepository = require('../repositories/CartRepository');
const healthProfileCartRepository = require('../repositories/HealthProfileCartRepository');

class CartController {
  toInt(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  normalizeCartStatus(value) {
    const normalized = this.bufferToString(value);
    if (normalized == null) return '쇼핑';
    return String(normalized).trim() === '임시' ? '임시' : '쇼핑';
  }

  // Buffer를 문자열로 변환하는 헬퍼 함수
  bufferToString(value) {
    if (Buffer.isBuffer(value)) {
      return value.toString('utf8');
    }
    if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
      return Buffer.from(value.data).toString('utf8');
    }
    return value != null ? String(value) : null;
  }

  async generateOrderId(mbId, itId) {
    const now = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const timestamp =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const random = pad(Math.floor(Math.random() * 10000), 4);
    return Number(`${timestamp}${random}`);
  }

  calculateSendCost(product) {
    const type = this.toInt(product.it_sc_type);
    const method = this.toInt(product.it_sc_method);
    if (type === 1) return 2;
    if (type > 1 && method === 1) return 1;
    return 0;
  }

  calculatePoint(product, optionId, optionPrice, qty) {
    if (optionId) {
      const base = this.toInt(product.it_price);
      const totalPrice = base + this.toInt(optionPrice);
      const pointType = this.toInt(product.it_point_type);
      const point = this.toInt(product.it_point);
      if (pointType === 1) return point * qty;
      if (pointType === 2) return Math.floor((totalPrice * point) / 100) * qty;
      return Math.floor(totalPrice * 0.01) * qty;
    }
    return this.toInt(product.it_supply_point) * qty;
  }

  buildImageUrl(product, itId) {
    // flutter 전용 경로가 있으면 우선 사용
    if (product.it_flutter_image_url && String(product.it_flutter_image_url).trim()) {
      return String(product.it_flutter_image_url).trim();
    }

    // 썸네일은 it_img1~it_img9 중 첫 번째 유효값 사용
    for (let i = 1; i <= 9; i += 1) {
      const key = `it_img${i}`;
      const value = product[key];
      if (value == null) continue;
      const trimmed = String(value).trim();
      if (!trimmed) continue;
      // DB에 저장된 경로를 그대로 사용한다.
      // 예: 1682401752/file.jpg 또는 /1682401752/file.jpg 또는 /data/item/...
      return trimmed;
    }

    return null;
  }

  /**
   * MySQL DATE/DATETIME이 mysql2에서 Date 객체로 올 때 String().substring(0,10) 하면
   * "Mon Apr 21" 처럼 잘려 Dart DateTime.tryParse 실패 → 항상 YYYY-MM-DD로 정규화.
   */
  formatSqlDateForApi(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const s = String(value).trim();
    if (!s) return null;
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const parsed = new Date(s);
    if (Number.isNaN(parsed.getTime())) return null;
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  async convertCartToMap(cart) {
    const clean = (value) =>
      String(this.bufferToString(value) ?? '')
        .replace(/\u0000/g, '')
        .trim();
    const cleanNumberString = (value) =>
      clean(value).replace(/[^0-9]/g, '');
    const itId = clean(cart.it_id);
    const mbId = clean(cart.mb_id);
    const odId = cleanNumberString(cart.od_id);
    const product = await cartRepository.findProductById(itId);
    const imageUrl = product ? this.buildImageUrl(product, itId) : null;
    const reservation =
      await healthProfileCartRepository.findLatestByOrderAndItem({
        mbId,
        odId,
        itId
      });

    const rawDate = reservation?.hp_rsvt_date;
    const hpRsvtDate = this.formatSqlDateForApi(rawDate);
    const hpDocName = reservation?.hp_doc_name
      ? String(reservation.hp_doc_name).trim()
      : null;
    const hpRsvtStime = reservation?.hp_rsvt_stime
      ? String(reservation.hp_rsvt_stime).trim()
      : null;
    const hpRsvtEtime = reservation?.hp_rsvt_etime
      ? String(reservation.hp_rsvt_etime).trim()
      : null;
    const reservationTimeRange = hpRsvtStime && hpRsvtEtime
      ? `${hpRsvtStime} ~ ${hpRsvtEtime}`
      : (hpRsvtStime || hpRsvtEtime || null);

    return {
      ct_id: cart.ct_id,
      od_id: cart.od_id,
      mb_id: mbId,
      it_id: itId,
      it_name: this.bufferToString(cart.it_name),
      it_subject: this.bufferToString(cart.it_subject) || '',
      ct_status: this.bufferToString(cart.ct_status),
      ct_price: cart.ct_price,
      ct_option: this.bufferToString(cart.ct_option) || '',
      ct_qty: cart.ct_qty,
      io_id: this.bufferToString(cart.io_id) || '',
      io_price: cart.io_price,
      ct_kind: this.bufferToString(cart.ct_kind) || 'general',
      ct_mb_inf: this.bufferToString(cart.ct_mb_inf) || '',
      point_usage_rate: this.toInt(
        (product && (product.point_usage_rate ?? product.it_point_usage_rate)) ?? 10,
        10
      ),
      ct_time: cart.ct_time,
      image_url: imageUrl,
      it_img: imageUrl,
      it_img1: imageUrl,
      hp_rsvt_date: hpRsvtDate,
      hp_rsvt_stime: hpRsvtStime,
      hp_rsvt_etime: hpRsvtEtime,
      hp_doc_name: hpDocName,
      doctor_name: hpDocName,
      reservation_date: hpRsvtDate,
      reservation_time: reservationTimeRange
    };
  }

  calculateItemShippingCost(price, qty, cart) {
    const type = this.toInt(cart.it_sc_type);
    const shipPrice = this.toInt(cart.it_sc_price);
    const minimum = this.toInt(cart.it_sc_minimum);
    const scQty = this.toInt(cart.it_sc_qty);
    if (type === 0) return -1;
    if (type === 1) return 0;
    if (type === 2) return price >= minimum ? 0 : shipPrice;
    if (type === 3) return shipPrice;
    if (type === 4) return scQty > 0 ? shipPrice * Math.ceil(qty / scQty) : 0;
    return 0;
  }

  calculateShippingCost(carts) {
    if (!carts.length) return 0;
    const group = {};
    carts.forEach((c) => {
      if (!group[c.it_id]) group[c.it_id] = [];
      group[c.it_id].push(c);
    });

    let totalShipping = 0;
    let defaultPriceSum = 0;
    let defaultCount = 0;

    Object.keys(group).forEach((itId) => {
      const productCarts = group[itId];
      let productTotalPrice = 0;
      let productTotalQty = 0;
      productCarts.forEach((c) => {
        const ioType = this.toInt(c.io_type);
        const ioPrice = this.toInt(c.io_price);
        const ctPrice = this.toInt(c.ct_price);
        const ctQty = this.toInt(c.ct_qty, 1);
        if (ioType === 1) productTotalPrice += ioPrice * ctQty;
        else productTotalPrice += (ctPrice + ioPrice) * ctQty;
        productTotalQty += ctQty;
      });

      const shipping = this.calculateItemShippingCost(productTotalPrice, productTotalQty, productCarts[0]);
      if (shipping === -1) {
        defaultPriceSum += productTotalPrice;
        defaultCount += 1;
      } else if (shipping > 0) {
        totalShipping += shipping;
      }
    });

    let defaultShipping = 0;
    if (defaultCount > 0 && defaultPriceSum > 0) {
      defaultShipping = defaultPriceSum < 30000 ? 3000 : 0;
    }
    return totalShipping + defaultShipping;
  }

  async addToCart(req, res) {
    try {
      const mbId = req.body.mb_id;
      const itId = req.body.it_id;
      const ctStatus = this.normalizeCartStatus(req.body.ct_status);
      const quantity = this.toInt(req.body.quantity, 1);
      let price = this.toInt(req.body.price, 0);
      const optionId = req.body.option_id || '';
      const optionText = req.body.option_text || '';
      const optionPrice = req.body.option_price != null ? this.toInt(req.body.option_price, 0) : 0;
      let odId = req.body.od_id != null ? Number(req.body.od_id) : null;

      if (!mbId || !itId) return res.status(400).json({ success: false, message: 'mb_id와 it_id가 필요합니다.' });
      const product = await cartRepository.findProductById(itId);
      if (!product) return res.status(404).json({ success: false, message: '제품을 찾을 수 없습니다.' });
      if (!price) price = this.toInt(product.it_price, 0);

      const itIdStr = this.bufferToString(product.it_id);
      const itKindStr = this.bufferToString(product.it_kind);

      const ioIdForSearch = optionId || '';
      const existing = await cartRepository.findSameItemOption(
        mbId,
        itId,
        ioIdForSearch,
        ctStatus
      );
      if (existing) {
        const newQty = this.toInt(existing.ct_qty, 0) + quantity;
        const updated = await cartRepository.updateCart(existing.ct_id, {
          ct_qty: newQty,
          ct_price: this.toInt(existing.ct_price, 0) + price,
          ct_time: new Date(),
          ct_point: this.calculatePoint(product, optionId, optionPrice, newQty)
        });
        const updatedData = await this.convertCartToMap(updated);
        const ctKindStr = this.bufferToString(updatedData.ct_kind);

        return res.json({ 
          success: true, 
          message: '장바구니에 추가되었습니다.', 
          data: updatedData,
          it_kind: itKindStr,
          ct_kind: ctKindStr
        });
      }

      if (!odId) odId = await this.generateOrderId(mbId, itId);
      const payload = {
        od_id: odId,
        mb_id: mbId,
        it_id: itId,
        it_name: product.it_name || '',
        it_subject: '',
        it_sc_type: this.toInt(product.it_sc_type, 0),
        it_sc_method: this.toInt(product.it_sc_method, 0),
        it_sc_price: this.toInt(product.it_sc_price, 0),
        it_sc_minimum: this.toInt(product.it_sc_minimum, 0),
        it_sc_qty: this.toInt(product.it_sc_qty, 0),
        ct_status: ctStatus,
        ct_history: '',
        ct_price: price,
        ct_point: this.calculatePoint(product, optionId, optionPrice, quantity),
        cp_price: 0,
        ct_point_use: 0,
        ct_stock_use: 0,
        ct_option: optionText,
        ct_qty: quantity,
        ct_notax: 0,
        io_id: optionId,
        io_type: 0,
        io_price: optionPrice,
        ct_ip: '127.0.0.1',
        ct_send_cost: this.calculateSendCost(product),
        ct_direct: 0,
        ct_select: 0,
        inf_code: '',
        ct_output: 'Y',
        ct_kind: req.body.ct_kind || (this.bufferToString(product.it_kind) === 'prescription' ? 'prescription' : 'general'),
        ct_mb_inf: '',
        ct_inf_price: 0,
        ct_settlement_status: 'N'
      };
      const cart = await cartRepository.insertCart(payload);

      if (this.bufferToString(product.it_kind) === 'prescription' && ctStatus === '쇼핑') {
        const carts = await healthProfileCartRepository.findRecentByMbIdAndItIdAndStatus(mbId, itId, '쇼핑');
        if (carts.length) await healthProfileCartRepository.updateOdId(carts[0].hp_no, odId);
      }

      const cartData = await this.convertCartToMap(cart);
      const ctKindStr = this.bufferToString(cartData.ct_kind);

      return res.json({ 
        success: true, 
        message: '장바구니에 추가되었습니다.', 
        data: cartData,
        it_kind: itKindStr,
        ct_kind: ctKindStr,
        ct_status: ctStatus
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: '장바구니 추가 중 오류가 발생했습니다.', error: error.message });
    }
  }

  async getCart(req, res) {
    try {
      const mbId = req.query.mb_id;
      const ctStatus = this.normalizeCartStatus(req.query.ct_status);
      const carts = await cartRepository.findByMbIdAndStatus(mbId, ctStatus);
      const data = await Promise.all(carts.map((c) => this.convertCartToMap(c)));
      const shippingCost = this.calculateShippingCost(carts);
      const totalPrice = carts.reduce((sum, c) => sum + this.toInt(c.ct_price, 0), 0);
      return res.json({
        success: true,
        data,
        total: data.length,
        shipping_cost: shippingCost,
        total_price: totalPrice
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: '장바구니 조회 중 오류가 발생했습니다.', error: error.message });
    }
  }

  async generateOrderIdEndpoint(req, res) {
    try {
      const mbId = req.body.mb_id;
      const itId = req.body.it_id;
      if (!mbId || !itId) return res.status(400).json({ success: false, message: 'mb_id와 it_id가 필요합니다.' });
      const odId = await this.generateOrderId(mbId, itId);
      return res.json({ success: true, od_id: odId, message: '주문 ID가 생성되었습니다.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: '주문 ID 생성 중 오류가 발생했습니다.', error: error.message });
    }
  }

  async saveHealthProfileCart(req, res) {
    try {
      const odIdRaw = req.body.od_id;
      if (odIdRaw == null) throw new Error('od_id는 필수입니다.');
      const odId = Number(odIdRaw);
      const reservationTime = req.body.reservationTime || '';
      let reservationEndTime = reservationTime;
      if (reservationTime && reservationTime.includes(':')) {
        const [h, m] = reservationTime.split(':').map((v) => Number(v));
        const d = new Date();
        d.setHours(h, m + 30, 0, 0);
        reservationEndTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      const reservationDate = req.body.reservationDate ? String(req.body.reservationDate).substring(0, 10) : null;

      await healthProfileCartRepository.insert({
        mb_id: req.body.mb_id,
        it_id: req.body.it_id,
        od_id: odId,
        answer1: req.body.answer1,
        answer2: req.body.answer2,
        answer3: req.body.answer3,
        answer4: req.body.answer4,
        answer5: req.body.answer5,
        answer6: req.body.answer6,
        answer7: req.body.answer7,
        answer8: req.body.answer8,
        answer9: req.body.answer9,
        answer10: req.body.answer10,
        answer11: req.body.answer11,
        answer12: req.body.answer12,
        answer13: req.body.answer13,
        answer13Period: req.body.answer13Period,
        answer13Dosage: req.body.answer13Dosage,
        answer13Medicine: req.body.answer13Medicine,
        answer71: req.body.answer71,
        answer13Sideeffect: req.body.answer13Sideeffect,
        reservationDate,
        reservationTime,
        reservationEndTime,
        reservationName: req.body.reservationName,
        reservationTel: req.body.reservationTel,
        doctorName: req.body.doctorName,
        hpMemo: req.body.pfMemo || '',
        hp_ip: '127.0.0.1'
      });

      return res.json({ success: true, message: 'HealthProfileCart 저장 완료' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'HealthProfileCart 저장 중 오류가 발생했습니다.', error: error.message });
    }
  }

  async saveHealthProfileForPrescription(req, res) {
    try {
      const mbId = req.body.mb_id;
      if (!mbId) {
        return res.status(400).json({ success: false, message: 'mb_id는 필수입니다.' });
      }

      const ctStatus = this.normalizeCartStatus(req.body.ct_status);
      const odIdRaw = req.body.od_id;
      if (odIdRaw == null) throw new Error('od_id는 필수입니다.');
      const odId = Number(odIdRaw);
      const reservationTime = req.body.reservationTime || '';
      let reservationEndTime = reservationTime;
      if (reservationTime && reservationTime.includes(':')) {
        const [h, m] = reservationTime.split(':').map((v) => Number(v));
        const d = new Date();
        d.setHours(h, m + 30, 0, 0);
        reservationEndTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      const reservationDate = req.body.reservationDate ? String(req.body.reservationDate).substring(0, 10) : null;
      const incomingItems = Array.isArray(req.body.items) && req.body.items.length
        ? req.body.items
        : [
            {
              it_id: req.body.it_id,
              quantity: req.body.quantity,
              price: req.body.price,
              option_id: req.body.option_id,
              option_text: req.body.option_text,
              option_price: req.body.option_price,
              ct_kind: req.body.ct_kind
            }
          ];

      const normalizedItems = incomingItems
        .map((item) => ({
          itId: item?.it_id != null ? String(item.it_id).trim() : '',
          quantity: this.toInt(item?.quantity, 1),
          price: this.toInt(item?.price, 0),
          optionId: item?.option_id != null ? String(item.option_id) : '',
          optionText: item?.option_text != null ? String(item.option_text) : '',
          optionPrice: item?.option_price != null ? this.toInt(item.option_price, 0) : 0,
          ctKind: item?.ct_kind != null ? String(item.ct_kind).trim() : ''
        }))
        .filter((item) => item.itId);

      if (!normalizedItems.length) {
        return res.status(400).json({ success: false, message: 'it_id 또는 items[].it_id가 필요합니다.' });
      }

      const cartIds = [];
      const failedItems = [];
      let firstItKind = null;
      let firstCtKind = null;

      for (const item of normalizedItems) {
        const product = await cartRepository.findProductById(item.itId);
        if (!product) {
          failedItems.push({ it_id: item.itId, message: '제품을 찾을 수 없습니다.' });
          continue;
        }

        const finalPrice = item.price || this.toInt(product.it_price, 0);
        const finalCtKind =
          item.ctKind || (this.bufferToString(product.it_kind) === 'prescription' ? 'prescription' : 'general');

        await healthProfileCartRepository.insert({
          mb_id: mbId,
          it_id: item.itId,
          od_id: odId,
          answer1: req.body.answer1,
          answer2: req.body.answer2,
          answer3: req.body.answer3,
          answer4: req.body.answer4,
          answer5: req.body.answer5,
          answer6: req.body.answer6,
          answer7: req.body.answer7,
          answer8: req.body.answer8,
          answer9: req.body.answer9,
          answer10: req.body.answer10,
          answer11: req.body.answer11,
          answer12: req.body.answer12,
          answer13: req.body.answer13,
          answer13Period: req.body.answer13Period,
          answer13Dosage: req.body.answer13Dosage,
          answer13Medicine: req.body.answer13Medicine,
          answer71: req.body.answer71,
          answer13Sideeffect: req.body.answer13Sideeffect,
          reservationDate,
          reservationTime,
          reservationEndTime,
          reservationName: req.body.reservationName,
          reservationTel: req.body.reservationTel,
          doctorName: req.body.doctorName,
          hpMemo: req.body.pfMemo || '',
          hp_ip: '127.0.0.1'
        });

        const cart = await cartRepository.insertCart({
          od_id: odId,
          mb_id: mbId,
          it_id: item.itId,
          it_name: product.it_name || '',
          it_subject: '',
          it_sc_type: this.toInt(product.it_sc_type, 0),
          it_sc_method: this.toInt(product.it_sc_method, 0),
          it_sc_price: this.toInt(product.it_sc_price, 0),
          it_sc_minimum: this.toInt(product.it_sc_minimum, 0),
          it_sc_qty: this.toInt(product.it_sc_qty, 0),
          ct_status: ctStatus,
          ct_history: '',
          ct_price: finalPrice,
          ct_point: this.calculatePoint(product, item.optionId, item.optionPrice, item.quantity),
          cp_price: 0,
          ct_point_use: 0,
          ct_stock_use: 0,
          ct_option: item.optionText,
          ct_qty: item.quantity,
          ct_notax: 0,
          io_id: item.optionId,
          io_type: 0,
          io_price: item.optionPrice,
          ct_ip: '127.0.0.1',
          ct_send_cost: this.calculateSendCost(product),
          ct_direct: 0,
          ct_select: 0,
          inf_code: '',
          ct_output: 'Y',
          ct_kind: finalCtKind,
          ct_mb_inf: '',
          ct_inf_price: 0,
          ct_settlement_status: 'N'
        });

        cartIds.push(cart.ct_id);
        if (firstItKind == null) firstItKind = this.bufferToString(product.it_kind);
        if (firstCtKind == null) firstCtKind = this.bufferToString(cart.ct_kind);
      }

      if (!cartIds.length) {
        return res.status(404).json({
          success: false,
          message: '예약 가능한 상품을 찾지 못했습니다.',
          failed_items: failedItems
        });
      }

      const partial = failedItems.length > 0;
      return res.json({
        success: true,
        message: partial ? '일부 상품 예약이 완료되었습니다.' : '처방 예약이 완료되었습니다.',
        cart_id: cartIds[0],
        cart_ids: cartIds,
        od_id: odId,
        it_kind: firstItKind,
        ct_kind: firstCtKind,
        ct_status: ctStatus,
        failed_items: failedItems
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: '처방 예약 중 오류가 발생했습니다.', error: error.message });
    }
  }

  async updateCartQuantity(req, res) {
    try {
      const ctId = Number(req.params.ctId);
      const quantity = this.toInt(req.body.quantity, 0);
      if (quantity < 1) return res.status(400).json({ success: false, message: '수량은 1개 이상이어야 합니다.' });

      const cart = await cartRepository.findById(ctId);
      if (!cart) return res.status(404).json({ success: false, message: '장바구니 항목을 찾을 수 없습니다.' });
      const unitPrice = Math.floor(this.toInt(cart.ct_price, 0) / Math.max(this.toInt(cart.ct_qty, 1), 1));
      const product = await cartRepository.findProductById(cart.it_id);
      const updated = await cartRepository.updateCart(ctId, {
        ct_qty: quantity,
        ct_price: unitPrice * quantity,
        ct_time: new Date(),
        ct_point: this.calculatePoint(product || {}, cart.io_id, cart.io_price, quantity)
      });
      return res.json({ success: true, message: '수량이 변경되었습니다.', data: await this.convertCartToMap(updated) });
    } catch (error) {
      return res.status(500).json({ success: false, message: '장바구니 수량 업데이트 중 오류가 발생했습니다.', error: error.message });
    }
  }

  async removeCartItem(req, res) {
    try {
      const deleted = await cartRepository.deleteById(Number(req.params.ctId));
      if (!deleted) return res.status(404).json({ success: false, message: '장바구니 항목을 찾을 수 없습니다.' });
      return res.json({ success: true, message: '장바구니에서 삭제되었습니다.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: '장바구니 삭제 중 오류가 발생했습니다.', error: error.message });
    }
  }
}

module.exports = new CartController();
