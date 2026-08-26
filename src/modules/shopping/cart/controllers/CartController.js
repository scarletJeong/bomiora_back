const cartRepository = require('../repositories/CartRepository');
const healthProfileCartRepository = require('../repositories/HealthProfileCartRepository');
const cartRecommendService = require('../services/CartRecommendService');
const productController = require('../../product/controllers/ProductController');
const { TtlCache } = require('../../../../utils/ttlCache');

const cartRecommendCache = new TtlCache(60_000);
const cartListCache = new TtlCache(30_000);

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

  /** 장바구니 insert 시 인플루언서 추적·정산 필드 (inf_code, ct_mb_inf, ct_inf_price) */
  buildInfluencerCartFields(product, body = {}) {
    const infCode = String(body.inf_code || body.infcode || '').trim();
    const itMbInf = this.bufferToString(product.it_mb_inf || '').trim();
    const itInfPrice = itMbInf ? this.toInt(product.it_inf_price, 0) : 0;
    return {
      inf_code: infCode,
      ct_mb_inf: itMbInf,
      ct_inf_price: itInfPrice
    };
  }

  async generateOrderId(mbId, itId) {
    const now = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    const timestamp =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const random = pad(Math.floor(Math.random() * 10000), 4);
    // 18자리 — Number로 바꾸면 JS 정밀도 손실이 나므로 문자열로 유지
    return `${timestamp}${random}`;
  }

  /** 요청/DB od_id를 안전한 숫자 문자열로 정규화 */
  normalizeOdId(value) {
    if (value == null || value === '') return null;
    const digits = String(this.bufferToString(value) ?? '')
      .replace(/[^0-9]/g, '')
      .trim();
    return digits || null;
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
    // flutter 전용 경로가 있으면 리스트 썸네일(_list.jpg) 사용
    if (product.it_flutter_image_url && String(product.it_flutter_image_url).trim()) {
      let base = String(product.it_flutter_image_url).trim();
      if (!base.endsWith('/')) base += '/';
      const id = String(itId || product.it_id || '').trim();
      if (base.startsWith('http://') || base.startsWith('https://')) {
        const normalized = base.endsWith('/') ? base.slice(0, -1) : base;
        return `${normalized}/${id}_list.jpg`;
      }
      if (!base.startsWith('/')) base = `/${base}`;
      return `${base}${id}_list.jpg`;
    }

    // 썸네일은 it_img1~it_img9 중 첫 번째 유효값 사용
    for (let i = 1; i <= 9; i += 1) {
      const key = `it_img${i}`;
      const value = product[key];
      if (value == null) continue;
      const trimmed = String(value).trim();
      if (!trimmed) continue;
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

  async convertCartToMap(cart, opts = {}) {
    const clean = (value) =>
      String(this.bufferToString(value) ?? '')
        .replace(/\u0000/g, '')
        .trim();
    const cleanNumberString = (value) =>
      clean(value).replace(/[^0-9]/g, '');
    const itId = clean(cart.it_id);
    const mbId = clean(cart.mb_id);
    const odId = cleanNumberString(cart.od_id);

    const hasJoinedProduct =
      !!(cart.it_img1 || cart.it_flutter_image_url || cart.product_it_kind);
    let product = hasJoinedProduct ? cart : null;
    if (!product && itId && opts.skipProductLookup !== true) {
      product = await cartRepository.findProductById(itId);
    }

    const imageUrl = product ? this.buildImageUrl(product, itId) : null;

    let reservation = null;
    if (opts.reservationMap instanceof Map) {
      reservation = opts.reservationMap.get(`${odId}:${itId}`) || null;
    } else if (opts.skipReservationLookup !== true) {
      reservation = await healthProfileCartRepository.findLatestByOrderAndItem({
        mbId,
        odId,
        itId
      });
    }

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

    const cartSubject =
      this.bufferToString(cart.resolved_it_subject) ||
      this.bufferToString(cart.it_subject) ||
      '';
    const productSubject = product
      ? this.bufferToString(product.it_subject) || ''
      : '';
    const itSubject = cartSubject || productSubject || '';
    const itBrand =
      this.bufferToString(cart.product_it_brand) ||
      this.bufferToString(cart.product_it_maker) ||
      (product
        ? this.bufferToString(product.it_brand) ||
          this.bufferToString(product.it_maker) ||
          ''
        : '');
      const productType = product
      ? this.bufferToString(product.it_type) ||
        this.bufferToString(product.product_it_type) ||
        this.bufferToString(product.product_type) ||
        this.bufferToString(product.ca_name) ||
        ''
      : '';

    const parentRaw = this.normalizeParent(
      this.bufferToString(cart.parent) ||
        this.parseLegacyParentFromCtKind(cart.ct_kind)
    );
    const ctKindRaw = this.normalizeProductKind(
      this.bufferToString(cart.ct_kind) || '',
      this.bufferToString(cart.product_it_kind) ||
        (product ? this.bufferToString(product.it_kind) : '') ||
        ''
    );
    const effectiveParent = ctKindRaw === 'general' ? '' : parentRaw;
    const itKindRaw =
      this.bufferToString(cart.product_it_kind) ||
      (product ? this.bufferToString(product.it_kind) : '') ||
      '';
    const itKind =
      String(itKindRaw).trim().toLowerCase() === 'prescription'
        ? 'prescription'
        : String(itKindRaw).trim()
          ? String(itKindRaw).trim().toLowerCase()
          : ctKindRaw;
    const kind = effectiveParent ? 'supply_add' : ctKindRaw;
    const attachReservation = ctKindRaw === 'prescription';

    return {
      ct_id: cart.ct_id,
      od_id: odId,
      mb_id: mbId,
      it_id: itId,
      it_name: this.bufferToString(cart.it_name),
      it_subject: itSubject,
      it_brand: itBrand,
      it_kind: itKind,
      product_kind: itKind,
      product_type: productType,
      ct_status: this.bufferToString(cart.ct_status),
      ct_price: cart.ct_price,
      ct_option: this.bufferToString(cart.ct_option) || '',
      ct_qty: cart.ct_qty,
      io_id: this.bufferToString(cart.io_id) || '',
      io_price: cart.io_price,
      io_type: this.toInt(cart.io_type, 0),
      ct_select: this.toInt(cart.ct_select, 0) ? 1 : 0,
      ct_kind: ctKindRaw,
      kind,
      parent: effectiveParent,
      parent_it_id: effectiveParent || null,
      it_supply_items: this.bufferToString(cart.product_it_supply_items) || '',
      ct_mb_inf: this.bufferToString(cart.ct_mb_inf) || '',
      point_usage_rate: this.toInt(
        (product && (product.point_usage_rate ?? product.it_point_usage_rate)) ?? 10,
        10
      ),
      ct_time: cart.ct_time,
      image_url: imageUrl,
      it_img: imageUrl,
      it_img1: imageUrl,
      hp_rsvt_date: attachReservation ? hpRsvtDate : null,
      hp_rsvt_stime: attachReservation ? hpRsvtStime : null,
      hp_rsvt_etime: attachReservation ? hpRsvtEtime : null,
      hp_doc_name: attachReservation ? hpDocName : null,
      doctor_name: attachReservation ? hpDocName : null,
      reservation_date: attachReservation ? hpRsvtDate : null,
      reservation_time: attachReservation ? reservationTimeRange : null
    };
  }

  normalizeParent(value) {
    const s = String(this.bufferToString(value) || '').trim();
    if (!s) return '';
    if (s.toLowerCase().startsWith('supply_add|')) {
      return s.slice('supply_add|'.length).trim();
    }
    return s;
  }

  parseLegacyParentFromCtKind(ctKind) {
    const s = String(this.bufferToString(ctKind) || '').trim();
    if (s.toLowerCase().startsWith('supply_add|')) {
      return s.slice('supply_add|'.length).trim();
    }
    return '';
  }

  /** ct_kind / it_kind → prescription | general */
  normalizeProductKind(ctKind, itKindFallback = '') {
    const ck = String(this.bufferToString(ctKind) || '').trim().toLowerCase();
    if (ck === 'prescription' || ck === 'general') return ck;
    if (ck.startsWith('supply_add|')) {
      const ik = String(this.bufferToString(itKindFallback) || '')
        .trim()
        .toLowerCase();
      return ik === 'prescription' ? 'prescription' : 'general';
    }
    const ik = String(this.bufferToString(itKindFallback) || '')
      .trim()
      .toLowerCase();
    return ik === 'prescription' ? 'prescription' : 'general';
  }

  /** FIND_IN_SET 스타일: CSV에 itId 포함 여부 */
  isInSupplyItems(csv, itId) {
    const id = String(itId || '').trim();
    if (!id) return false;
    return String(csv || '')
      .split(',')
      .map((x) => x.replace(/[^0-9]/g, '').trim())
      .includes(id);
  }

  /**
   * 담기 시 부모 it_id 결정 (본품이면 '')
   * - body.parent / parent_it_id / legacy ct_kind=supply_add|…
   * - 본품 명시(prescription|general)면 복원 안 함
   * - kind 미지정 시에만 it_supply_items 복원
   */
  async resolveParent({ reqBody, mbId, itId, ctStatus }) {
    const bodyParent = this.normalizeParent(
      reqBody.parent ?? reqBody.parent_it_id ?? reqBody.parentItId ?? ''
    );
    if (bodyParent) return bodyParent;

    const bodyKind = String(
      this.bufferToString(reqBody.ct_kind || reqBody.ctKind || '') || ''
    )
      .trim()
      .toLowerCase();
    if (bodyKind.startsWith('supply_add|')) {
      return bodyKind.slice('supply_add|'.length).trim();
    }

    // 본품으로 명시 담기 — supply 복원 금지
    if (bodyKind === 'prescription' || bodyKind === 'general') {
      return '';
    }

    const ioType = this.toInt(reqBody.io_type ?? reqBody.ioType, 0);
    // 본품 옵션(io_type 0)은 ct_kind 미전달 레거시만 supply 복원 (신규 담기는 ct_kind=general|prescription)
    if (ioType === 0) {
      return '';
    }

    try {
      const parents = await cartRepository.findParentCandidates(mbId, ctStatus);
      for (const p of parents) {
        const parentId = this.bufferToString(p.it_id);
        if (!parentId || parentId === String(itId)) continue;
        const supply = this.bufferToString(p.it_supply_items) || '';
        if (this.isInSupplyItems(supply, itId)) {
          return parentId;
        }
      }
    } catch (_) {}

    return '';
  }

  /** 상품 종류 ct_kind (prescription|general) — 관계와 분리 */
  resolveProductKind({ reqBody, product }) {
    const bodyKind = String(
      this.bufferToString(reqBody.ct_kind || reqBody.ctKind || '') || ''
    )
      .trim()
      .toLowerCase();
    if (bodyKind === 'prescription' || bodyKind === 'general') return bodyKind;
    // legacy supply_add| 는 상품 종류로 쓰지 않음
    return this.bufferToString(product.it_kind) === 'prescription'
      ? 'prescription'
      : 'general';
  }

  /** 장바구니 라인 결제금액 (ct_price 총액 규칙 + io_type 1~3의 io_price) */
  cartLineAmount(cart) {
    const ioType = this.toInt(cart.io_type);
    const ioPrice = this.toInt(cart.io_price);
    const ctPrice = this.toInt(cart.ct_price);
    const ctQty = this.toInt(cart.ct_qty, 1);
    // io_type 1/2/3: ct_price(연결상품 본가 총액 또는 0) + io_price*qty
    if (ioType === 1 || ioType === 2 || ioType === 3) {
      return ctPrice + ioPrice * ctQty;
    }
    // io_type 0: 기존 클라가 본가(+옵션) 총액을 ct_price에 넣는 계약 유지
    return ctPrice;
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
        productTotalPrice += this.cartLineAmount(c);
        productTotalQty += this.toInt(c.ct_qty, 1);
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
      let ioType = this.toInt(req.body.io_type ?? req.body.ioType, 0);
      if (ioType < 0 || ioType > 3) ioType = 0;
      let odId = this.normalizeOdId(req.body.od_id ?? req.body.odId);

      if (!mbId || !itId) return res.status(400).json({ success: false, message: 'mb_id와 it_id가 필요합니다.' });
      const product = await cartRepository.findProductById(itId);
      if (!product) return res.status(404).json({ success: false, message: '제품을 찾을 수 없습니다.' });

      const productBasePrice = this.toInt(product.it_price, 0);
      const resolvedParent = await this.resolveParent({
        reqBody: req.body,
        mbId,
        itId,
        ctStatus,
      });
      const resolvedKind = this.resolveProductKind({
        reqBody: req.body,
        product,
      });
      const effectiveParent =
        resolvedKind === 'general' ? '' : resolvedParent;
      const isSupplyLine = Boolean(effectiveParent);

      // ct_price는 라인 총액(단가*수량). io_type 1~3은 본가 미포함(연결상품만 본가 총액).
      if (!price) {
        if (ioType === 1 || ioType === 2 || ioType === 3) {
          price = isSupplyLine ? productBasePrice * quantity : 0;
        } else {
          price = productBasePrice * quantity;
        }
      } else if (ioType === 1 || ioType === 2 || ioType === 3) {
        price = isSupplyLine ? productBasePrice * quantity : 0;
      }

      const itKindStr = this.bufferToString(product.it_kind);
      const ioIdForSearch = optionId || '';
      const existing = await cartRepository.findSameItemOption(
        mbId,
        itId,
        ioIdForSearch,
        ctStatus,
        effectiveParent
      );
      if (existing) {
        const newQty = this.toInt(existing.ct_qty, 0) + quantity;
        const prevQty = Math.max(this.toInt(existing.ct_qty, 1), 1);
        const unitCt = Math.floor(this.toInt(existing.ct_price, 0) / prevQty);
        const updateFields = {
          ct_qty: newQty,
          ct_price: unitCt * newQty,
          ct_kind: resolvedKind,
          parent: effectiveParent,
          io_type: this.toInt(existing.io_type, ioType),
          ct_time: new Date(),
          ct_point: this.calculatePoint(product, optionId, optionPrice, newQty),
          ct_select: 1,
          ct_select_time: new Date()
        };
        if (odId) updateFields.od_id = odId;
        const updated = await cartRepository.updateCart(existing.ct_id, updateFields);
        const updatedData = await this.convertCartToMap(updated);

        this.invalidateCartListCache(mbId, ctStatus);
        this.warmCartListCache(mbId, ctStatus);
        return res.json({
          success: true,
          message: '장바구니에 추가되었습니다.',
          data: updatedData,
          it_kind: itKindStr,
          ct_kind: this.bufferToString(updatedData.ct_kind),
          parent: this.bufferToString(updatedData.parent) || '',
        });
      }

      if (!odId) odId = await this.generateOrderId(mbId, itId);
      const influencerFields = this.buildInfluencerCartFields(product, req.body);
      const payload = {
        od_id: odId,
        mb_id: mbId,
        it_id: itId,
        it_name: product.it_name || '',
        it_subject: this.bufferToString(product.it_subject) || '',
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
        io_type: ioType,
        io_price: optionPrice,
        ct_ip: '127.0.0.1',
        ct_send_cost: this.calculateSendCost(product),
        ct_direct: 0,
        ct_select: 1,
        inf_code: influencerFields.inf_code,
        ct_output: 'Y',
        ct_kind: resolvedKind,
        parent: effectiveParent,
        ct_mb_inf: influencerFields.ct_mb_inf,
        ct_inf_price: influencerFields.ct_inf_price,
        ct_settlement_status: 'N'
      };
      const cart = await cartRepository.insertCart(payload);

      const cartData = await this.convertCartToMap(cart);

      this.invalidateCartListCache(mbId, ctStatus);
      this.warmCartListCache(mbId, ctStatus);
      return res.json({
        success: true,
        message: '장바구니에 추가되었습니다.',
        data: cartData,
        it_kind: itKindStr,
        ct_kind: this.bufferToString(cartData.ct_kind),
        parent: this.bufferToString(cartData.parent) || '',
        ct_status: ctStatus
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: '장바구니 추가 중 오류가 발생했습니다.', error: error.message });
    }
  }

  async loadCartPayload(mbId, ctStatus) {
    const [carts, reservationMap] = await Promise.all([
      cartRepository.findByMbIdAndStatus(mbId, ctStatus),
      healthProfileCartRepository.findLatestMapByMbId(mbId).catch((e) => {
        console.warn('[getCart] 예약정보 스킵:', e?.message || e);
        return new Map();
      }),
    ]);
    const data = [];
    for (const c of carts) {
      try {
        data.push(
          await this.convertCartToMap(c, {
            reservationMap,
            skipProductLookup: true,
            skipReservationLookup: true,
          })
        );
      } catch (rowErr) {
        console.warn('[getCart] 행 스킵', c?.ct_id, rowErr?.message || rowErr);
      }
    }
    return {
      success: true,
      data,
      total: data.length,
      shipping_cost: this.calculateShippingCost(carts),
      total_price: carts.reduce((sum, c) => sum + this.cartLineAmount(c), 0),
    };
  }

  warmCartListCache(mbId, ctStatus = '쇼핑') {
    const status = this.normalizeCartStatus(ctStatus);
    const id = String(mbId || '').trim();
    if (!id) return;
    const key = `${id}:${status}`;
    cartListCache
      .getOrSet(key, () => this.loadCartPayload(id, status), 30_000)
      .catch(() => {});
  }

  async getCart(req, res) {
    try {
      const mbId = String(req.query.mb_id || '').trim();
      const ctStatus = this.normalizeCartStatus(req.query.ct_status);
      if (!mbId) {
        return res.status(400).json({ success: false, message: 'mb_id가 필요합니다.' });
      }

      const cacheKey = `${mbId}:${ctStatus}`;
      const forceRefresh = String(req.query.refresh || '').trim() === '1';
      if (forceRefresh) {
        cartListCache.store.delete(cacheKey);
      }

      const payload = await cartListCache.getOrSet(
        cacheKey,
        () => this.loadCartPayload(mbId, ctStatus),
        30_000
      );

      return res.json(payload);
    } catch (error) {
      console.error('[getCart]', error);
      return res.status(500).json({ success: false, message: '장바구니 조회 중 오류가 발생했습니다.', error: error.message });
    }
  }

  invalidateCartListCache(mbId, ctStatus = '쇼핑') {
    const status = this.normalizeCartStatus(ctStatus);
    cartListCache.remove(`${String(mbId || '').trim()}:${status}`);
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
      const odId = this.normalizeOdId(odIdRaw);
      if (!odId) throw new Error('od_id는 필수입니다.');
      const reservationTime = req.body.reservationTime || '';
      let reservationEndTime = reservationTime;
      if (reservationTime && reservationTime.includes(':')) {
        const [h, m] = reservationTime.split(':').map((v) => Number(v));
        const d = new Date();
        d.setHours(h, m + 30, 0, 0);
        reservationEndTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      const reservationDate = req.body.reservationDate ? String(req.body.reservationDate).substring(0, 10) : null;

      await healthProfileCartRepository.upsertByOdIdAndItId({
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
      const odId = this.normalizeOdId(odIdRaw);
      if (!odId) throw new Error('od_id는 필수입니다.');
      const reservationTime = req.body.reservationTime || '';
      let reservationEndTime = reservationTime;
      if (reservationTime && reservationTime.includes(':')) {
        const [h, m] = reservationTime.split(':').map((v) => Number(v));
        const d = new Date();
        d.setHours(h, m + 30, 0, 0);
        reservationEndTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      const reservationDate = req.body.reservationDate ? String(req.body.reservationDate).substring(0, 10) : null;
      const cartCtIds = (Array.isArray(req.body.cart_ct_ids) ? req.body.cart_ct_ids : [])
        .map((id) => Number(id))
        .filter((id) => id > 0);

      if (cartCtIds.length > 0) {
        const cartIds = [];
        const failedItems = [];
        let firstItKind = null;
        let firstCtKind = null;

        const cartRows = await cartRepository.findByIds(cartCtIds);
        const cartById = new Map(cartRows.map((row) => [Number(row.ct_id), row]));

        const profilePayload = {
          mb_id: mbId,
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
          hp_ip: '127.0.0.1',
        };

        const now = new Date();
        for (const ctId of cartCtIds) {
          const cart = cartById.get(Number(ctId));
          if (!cart) {
            failedItems.push({ ct_id: ctId, message: '장바구니 항목을 찾을 수 없습니다.' });
            continue;
          }
          if (this.bufferToString(cart.mb_id) !== String(mbId)) {
            failedItems.push({ ct_id: ctId, message: '권한이 없습니다.' });
            continue;
          }
          if (!this.bufferToString(cart.product_it_kind || '').trim()) {
            failedItems.push({ ct_id: ctId, message: '제품을 찾을 수 없습니다.' });
            continue;
          }
          cartIds.push(ctId);
          if (firstItKind == null) {
            firstItKind = this.bufferToString(cart.product_it_kind);
          }
          if (firstCtKind == null) firstCtKind = this.bufferToString(cart.ct_kind);
        }

        const profileItIds = [...new Set(
          cartIds
            .map((ctId) => String(this.bufferToString(cartById.get(ctId)?.it_id) || '').trim())
            .filter(Boolean)
        )];
        await Promise.all([
          Promise.all(
            profileItIds.map((itId) =>
              healthProfileCartRepository.upsertByOdIdAndItId({
                ...profilePayload,
                it_id: itId,
              })
            )
          ),
          cartRepository.markReservedByIds(cartIds, mbId, odId, now),
        ]);

        this.invalidateCartListCache(mbId, ctStatus);
        this.warmCartListCache(mbId, ctStatus);
        if (!cartIds.length) {
          return res.status(404).json({
            success: false,
            message: '예약 가능한 장바구니 항목을 찾지 못했습니다.',
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
      }

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
      const profileItIdsDone = new Set();
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

        if (!profileItIdsDone.has(item.itId)) {
          await healthProfileCartRepository.upsertByOdIdAndItId({
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
          profileItIdsDone.add(item.itId);
        }

        const cart = await cartRepository.insertCart({
          od_id: odId,
          mb_id: mbId,
          it_id: item.itId,
          it_name: product.it_name || '',
          it_subject: this.bufferToString(product.it_subject) || '',
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
          ct_select: 1,
          ...this.buildInfluencerCartFields(product, req.body),
          ct_output: 'Y',
          ct_kind: finalCtKind,
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
      const ctId = Number(req.params.ctId);
      const cart = await cartRepository.findById(ctId);
      if (!cart) return res.status(404).json({ success: false, message: '장바구니 항목을 찾을 수 없습니다.' });

      const mbId = this.bufferToString(cart.mb_id);
      const itId = this.bufferToString(cart.it_id);
      const ctStatus = this.normalizeCartStatus(cart.ct_status);
      const parentOfRow = this.normalizeParent(cart.parent);

      const deleted = await cartRepository.deleteById(ctId);
      if (!deleted) return res.status(404).json({ success: false, message: '장바구니 항목을 찾을 수 없습니다.' });

      // 본품 삭제 시 parent=본품it_id 인 추가상품도 삭제
      if (!parentOfRow && itId) {
        await cartRepository.deleteSupplyChildren(mbId, itId, ctStatus);
      }

      return res.json({ success: true, message: '장바구니에서 삭제되었습니다.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: '장바구니 삭제 중 오류가 발생했습니다.', error: error.message });
    }
  }

  normalizeCartKind(value) {
    const normalized = this.bufferToString(value);
    if (normalized == null) return null;
    const kind = String(normalized).trim();
    const lower = kind.toLowerCase();
    if (lower === 'prescription' || lower === 'general') return lower;
    if (lower.startsWith('supply_add|')) return kind;
    return null;
  }

  async syncCartSelection(req, res) {
    try {
      const mbId = req.body.mb_id || req.body.mbId;
      if (!mbId) {
        return res.status(400).json({ success: false, message: 'mb_id가 필요합니다.' });
      }

      const ctStatus = this.normalizeCartStatus(req.body.ct_status || req.body.ctStatus);
      const ctKind = this.normalizeCartKind(req.body.ct_kind || req.body.ctKind);
      const rawIds = req.body.ct_ids || req.body.ctIds || [];
      const selectedCtIds = Array.isArray(rawIds) ? rawIds : [];

      await cartRepository.syncSelection({
        mbId,
        ctStatus,
        ctKind,
        selectedCtIds
      });

      const carts = await cartRepository.findByMbIdAndStatus(mbId, ctStatus);
      const scoped = ctKind
        ? carts.filter((c) => this.normalizeCartKind(c.ct_kind) === ctKind)
        : carts;
      let reservationMap = new Map();
      try {
        reservationMap = await healthProfileCartRepository.findLatestMapByMbId(mbId);
      } catch (_) {}
      const data = [];
      for (const c of scoped) {
        try {
          data.push(
            await this.convertCartToMap(c, {
              reservationMap,
              skipProductLookup: true,
              skipReservationLookup: true,
            })
          );
        } catch (_) {}
      }

      return res.json({
        success: true,
        message: '장바구니 선택이 저장되었습니다.',
        data,
        selected_count: selectedCtIds.length
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '장바구니 선택 저장 중 오류가 발생했습니다.',
        error: error.message
      });
    }
  }

  async getRecommendProducts(req, res) {
    try {
      const itId = String(req.query.it_id || '').trim();
      const mbId = String(req.query.mb_id || '').trim();
      const ctStatus = this.normalizeCartStatus(req.query.ct_status);
      const cacheKey = `rec:${itId || '-'}:${mbId || '-'}:${ctStatus}`;

      const payload = await cartRecommendCache.getOrSet(cacheKey, async () => {
        let cartList = [];

        if (itId) {
          const product = await cartRepository.findProductById(itId);
          if (!product) {
            return { success: true, data: [], count: 0 };
          }

          let cartItIds = [];
          if (mbId) {
            const carts = await cartRepository.findByMbIdAndStatusAsc(mbId, ctStatus);
            cartItIds = carts.map((cart) => this.bufferToString(cart.it_id));
          }

          const rows = await cartRecommendService.getProductDetailRecommendProducts(
            itId,
            cartItIds
          );
          const data = await productController.mapProductSearchDtos(rows);
          return { success: true, data, count: data.length };
        }

        if (!mbId) {
          return { success: false, status: 400, message: 'mb_id 또는 it_id가 필요합니다.', data: [], count: 0 };
        }
        const carts = await cartRepository.findByMbIdAndStatusAsc(mbId, ctStatus);
        if (!carts.length) {
          return { success: true, data: [], count: 0 };
        }
        cartList = carts.map((cart) => ({
          it_id: this.bufferToString(cart.it_id),
          it_name: this.bufferToString(cart.it_name)
        }));

        const rows = await cartRecommendService.getRecommendProducts(cartList);
        const data = await productController.mapProductSearchDtos(rows);
        return { success: true, data, count: data.length };
      });

      if (payload.status === 400) {
        return res.status(400).json({
          success: false,
          message: payload.message,
          data: [],
        });
      }
      res.set('Cache-Control', 'private, max-age=30');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '장바구니 추천 상품 조회 중 오류가 발생했습니다.',
        error: error.message,
        data: []
      });
    }
  }
}

module.exports = new CartController();
