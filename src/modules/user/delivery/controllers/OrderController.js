const orderRepository = require('../repositories/OrderRepository');
const orderCartRepository = require('../repositories/OrderCartRepository');
const kcpApprovalService = require('../../../shopping/kcp_pay/services/kcpApprovalService');
const { TtlCache } = require('../../../../utils/ttlCache');

const orderDetailCache = new TtlCache(10_000);
const orderListCache = new TtlCache(45_000);

class OrderController {
  invalidateOrderDetailCache(mbId, odId) {
    if (mbId && odId) {
      orderDetailCache.store.delete(`detail:${mbId}:${odId}`);
    }
    this.invalidateOrderListCache(mbId);
  }

  invalidateOrderListCache(mbId) {
    const id = String(mbId || '').trim();
    if (!id) return;
    for (const key of orderListCache.store.keys()) {
      if (key.startsWith(`list:${id}:`)) orderListCache.store.delete(key);
    }
  }
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
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}.${mm}.${dd} ${hh}:${mi}:${ss}`;
    }

  /**
   * MySQL DATE가 mysql2에서 Date 객체로 올 때 String().substring(0,10) → "Mon Apr 21" 등으로 잘림.
   * CartController.formatSqlDateForApi 와 동일하게 YYYY-MM-DD 로 정규화.
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

  /** 라인아이템 상품유형 (`prescription` | `general` | '') — ct_kind 우선 */
  getItemProductKind(item) {
    const ck = String(item?.ctKind || item?.ct_kind || '').toLowerCase().trim();
    if (ck === 'prescription' || ck === 'general') return ck;
    const ik = String(item?.itKind || item?.it_kind || '').toLowerCase().trim();
    if (ik === 'prescription' || ik === 'general') return ik;
    return '';
  }

  /**
   * 주문 비대면 여부.
   * kind가 있으면 우선. 전부 비어 있을 때만 health_profiles_cart 플래그 사용.
   */
  resolveIsPrescriptionOrder(items = [], healthProfileFlag = false) {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) return healthProfileFlag === true;
    const mains = list.filter((i) => !String(i?.parent || i?.parent_it_id || '').trim());
    const check = mains.length > 0 ? mains : list;
    const kinds = check.map((i) => this.getItemProductKind(i));
    if (kinds.some((k) => k === 'prescription')) return true;
    if (kinds.some((k) => k === 'general')) return false;
    return healthProfileFlag === true;
  }

  getDisplayStatus(odStatus, deliveryCompleted, adminCompleted, autoConfirmAt, isConsultationDone = false) {
    const status = this.bufferToString(odStatus || '').trim();
    if (Number(deliveryCompleted || 0) === 1) return '배송완료';
    if (Number(adminCompleted || 0) === 1 && autoConfirmAt && new Date(autoConfirmAt) < new Date()) return '배송완료';
    if (Number(adminCompleted || 0) === 1 && (status === '배송' || status === '완료')) return '배송중';

    // 처방 완료 후·배송 전 → 상담완료
    if (isConsultationDone && (status === '입금' || status === '준비')) {
      return '상담완료';
    }

    switch (status) {
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
        return status;
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
    const ioId = this.bufferToString(cart.io_id) || '';
    const ctKindRaw = this.bufferToString(cart.ct_kind) || '';
    let parent = String(this.bufferToString(cart.parent) || '').trim();
    if (!parent && ctKindRaw.toLowerCase().startsWith('supply_add|')) {
      parent = ctKindRaw.slice('supply_add|'.length).trim();
    }
    const ctKind = ctKindRaw.toLowerCase().startsWith('supply_add|')
      ? (String(itKind || '').toLowerCase() === 'prescription'
          ? 'prescription'
          : 'general')
      : ctKindRaw;
    const ioType = this.toInt(cart.io_type);
    const listImage = this.buildOrderItemListImageUrl(cart, itId);
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
      ioId,
      io_id: ioId,
      ctKind,
      ct_kind: ctKind,
      parent,
      parent_it_id: parent || null,
      ioType,
      io_type: ioType,
      totalPrice: (ctPrice + ioPrice) * ctQty,
      ctStatus,
      imageUrl: listImage || imageUrlMap[itId] || cart.it_img1 || ''
    };
  }

  /** 주문 목록/상세 카드용 — flutter 경로면 `{id}_list.jpg` */
  buildOrderItemListImageUrl(cart, itId) {
    const id = String(itId || '').trim();
    const folderRaw = this.bufferToString(cart.it_flutter_image_url);
    if (folderRaw && id) {
      let base = String(folderRaw).trim();
      if (base.startsWith('http://') || base.startsWith('https://')) {
        const normalized = base.endsWith('/') ? base.slice(0, -1) : base;
        return `${normalized}/${id}_list.jpg`;
      }
      if (!base.endsWith('/')) base += '/';
      if (!base.startsWith('/')) base = `/${base}`;
      return `${base}${id}_list.jpg`;
    }
    const img1 = this.bufferToString(cart.it_img1);
    return img1 && String(img1).trim() ? String(img1).trim() : '';
  }

  extractCancelDate(...texts) {
    for (const text of texts) {
      const src = this.bufferToString(text || '') || '';
      if (!src) continue;
      // 취소 관련 줄의 시각 우선
      const lines = src.split(/\r?\n/);
      for (const line of lines) {
        if (
          line.includes('시스템 자동 취소') ||
          line.includes('주문자 본인 직접 취소') ||
          line.includes('고객 직접 취소') ||
          line.includes('주문취소 처리') ||
          /주문\s*취소\s*처리/.test(line) ||
          line.includes('입금기한')
        ) {
          const m = line.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
          if (m) return m[1];
        }
      }
      const any = src.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
      if (any) return any[1];
    }
    return null;
  }

  parseCancelInfo(detail, odShopMemo, odModHistory) {
    const memo = this.bufferToString(odShopMemo || '') || '';
    const modHistory = this.bufferToString(odModHistory || '') || '';
    const memoTrim = memo.trim();
    const modTrim = modHistory.trim();

    // 1) 시스템 자동 취소 → 입금기한만료 (od_shop_memo 기준)
    if (
      memoTrim.includes('시스템 자동 취소') ||
      memoTrim.includes('가상계좌 입금기한') ||
      (memoTrim.includes('입금기한') && memoTrim.includes('초과'))
    ) {
      detail.cancelType = '시스템자동';
      detail.cancelReasonLabel = '입금기한만료';
      detail.cancelReason = '가상계좌 입금기한 초과';
      detail.cancelDate = this.extractCancelDate(memo, modHistory);
      return;
    }

    // 2) 고객 직접 취소 → 고객요청 (od_shop_memo 기준)
    if (
      memoTrim.includes('주문자 본인 직접 취소') ||
      memoTrim.includes('고객 직접 취소') ||
      memoTrim.includes('고객직접취소') ||
      memoTrim.includes('USER_ORDER_CANCEL')
    ) {
      detail.cancelType = '고객직접';
      detail.cancelReasonLabel = '고객요청';
      detail.cancelReason = '고객직접취소';
      detail.cancelDate = this.extractCancelDate(memo, modHistory);
      return;
    }

    // 3) od_shop_memo에 취소사유 없고 od_mod_history에 관리자 취소 흔적
    //    예: "2026-07-30 11:00:03 skcompany 주문취소 처리"
    const memoHasCancelReason =
      memoTrim.includes('시스템 자동') ||
      memoTrim.includes('본인 직접') ||
      memoTrim.includes('고객직접') ||
      memoTrim.includes('입금기한') ||
      memoTrim.includes('USER_ORDER_CANCEL');
    const modHasAdminCancel =
      /주문\s*취소\s*처리/.test(modTrim) ||
      modTrim.includes('주문취소 처리') ||
      modTrim.includes('주문취소처리') ||
      (modTrim.includes('취소') &&
        /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(modTrim));

    if (!memoHasCancelReason && modTrim && modHasAdminCancel) {
      detail.cancelType = '관리자';
      detail.cancelReasonLabel = '고객요청(관리자)';
      detail.cancelReason = '관리자 주문취소 처리';
      detail.cancelDate = this.extractCancelDate(modHistory, memo);
      return;
    }

    // 4) 그 외 → 기타
    detail.cancelType = '기타';
    detail.cancelReasonLabel = '기타';
    detail.cancelReason = '기타';
    detail.cancelDate = this.extractCancelDate(memo, modHistory);
  }

  /** 주문 취소 메모 한 줄 (parseCancelInfo가 고객 요청으로 인식) */
  buildCustomerCancelMemo(existingMemo = '') {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const line = `(${stamp}) 주문자 본인 직접 취소`;
    const prev = this.bufferToString(existingMemo || '').trim();
    return prev ? `${prev}\n${line}` : line;
  }

  async getOrderList(req, res) {
    try {
      const mbId = req.query.mbId || req.query.mb_id;
      const period = Number(req.query.period || 0);
      const status = req.query.status || 'all';
      const page = Number(req.query.page || 0);
      const size = Number(req.query.size || 10);
      const cacheKey = `list:${mbId}:${period}:${status}:${page}:${size}`;

      const payload = await orderListCache.getOrSet(cacheKey, async () => {
        const { rows, total } = await orderRepository.getOrders(
          mbId,
          period,
          status,
          page,
          size
        );
        const odIds = rows.map((r) => this.toOdId(r.od_id)).filter(Boolean);

        // size=1(마이페이지 미리보기)은 헬스플래그 생략 → RTT 1회 절약
        const [allCarts, healthFlags] = await Promise.all([
          orderCartRepository.findByOdIds(odIds),
          size <= 1
            ? Promise.resolve({})
            : orderRepository.getHealthProfileFlagsByOdIds(mbId, odIds),
        ]);

        const cartsByOrder = {};
        allCarts.forEach((c) => {
          const key = this.toOdId(c.od_id);
          if (!cartsByOrder[key]) cartsByOrder[key] = [];
          cartsByOrder[key].push(c);
        });

        const imageUrlMap = {};
        allCarts.forEach((row) => {
          if (row.it_id && row.it_img1) imageUrlMap[row.it_id] = row.it_img1;
        });

        const orders = rows.map((row) => {
          const odId = this.toOdId(row.od_id);
          const items = (cartsByOrder[odId] || []).map((c) => this.toOrderItem(c, imageUrlMap));
          const flags = healthFlags[odId] || {};
          const isPrescriptionOrder = this.resolveIsPrescriptionOrder(
            items,
            flags.isPrescriptionOrder === true
          );
          const isConsultationDone =
            isPrescriptionOrder && flags.isConsultationDone === true;
          return {
            odId,
            orderDate: this.formatDate(row.od_time, false),
            orderDateTime: this.formatDate(row.od_time, true),
            displayStatus: this.getDisplayStatus(
              row.od_status,
              row.delivery_completed,
              row.admin_completed,
              row.auto_confirm_at,
              isConsultationDone
            ),
            odStatus: row.od_status,
            totalPrice: this.computeOrderTotal(row),
            deliveryFee: this.toInt(row.od_send_cost) + this.toInt(row.od_send_cost2),
            recipientName: this.bufferToString(row.od_name) || '',
            recipientPhone: this.bufferToString(row.od_hp) || '',
            recipientAddress: this.bufferToString(row.od_addr1) || '',
            recipientAddressDetail: `${this.bufferToString(row.od_addr2) || ''} ${this.bufferToString(row.od_addr3) || ''}`.trim(),
            odCartCount: this.toInt(row.od_cart_count),
            isPrescriptionOrder,
            isConsultationDone,
            canConfirmReceipt: this.canConfirmReceipt(row.od_status, row.delivery_completed),
            items,
            firstProductName: items[0]?.itName || null,
            firstProductOption: items[0]?.ctOption || null,
            firstProductQty: items[0]?.ctQty || null,
            firstProductPrice: items[0]?.totalPrice || null,
          };
        });

        const totalPages = Math.ceil(total / size) || 0;
        return {
          orders,
          currentPage: page,
          totalPages,
          totalElements: total,
          totalItems: total,
          hasNext: page + 1 < totalPages,
        };
      });

      res.set('Cache-Control', 'private, max-age=30');
      return res.json(payload);
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
      const cacheKey = `detail:${mbId}:${odId}`;
      const cached = orderDetailCache.get(cacheKey);
      if (cached) {
        res.set('Cache-Control', 'private, max-age=5');
        return res.json(cached);
      }

      const row = await orderRepository.getOrderDetail(odId, mbId);
      if (!row) return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });

      const [carts, healthBundle] = await Promise.all([
        orderCartRepository.findByOdIdAndMbId(odId, mbId),
        orderRepository.getHealthAndReservation(mbId, odId),
      ]);

      const imageUrlMap = {};
      carts.forEach((c) => {
        if (c.it_id && c.it_img1) imageUrlMap[c.it_id] = c.it_img1;
      });
      const products = carts.map((c) => this.toOrderItem(c, imageUrlMap));
      const settleCase = this.bufferToString(row.od_settle_case) || '';
      const bankAccount = this.bufferToString(row.od_bank_account) || '';
      const depositName = this.bufferToString(row.od_deposit_name || '').trim() || null;
      const odTno = this.bufferToString(row.od_tno || '').trim() || null;
      const odAppNo = this.bufferToString(row.od_app_no || '').trim() || null;
      const couponDiscount =
        this.toInt(row.od_cart_coupon) + this.toInt(row.od_send_coupon) + this.toInt(row.od_coupon);
      const pointDiscount = this.toInt(row.od_receipt_point);

      const isPrescriptionOrder = this.resolveIsPrescriptionOrder(
        products,
        healthBundle.isPrescriptionOrder === true
      );
      const isConsultationDone =
        isPrescriptionOrder && healthBundle.isConsultationDone === true;

      const t = (v) => this.bufferToString(v) || '';
      const detail = {
        odId: String(row.od_id),
        orderDate: this.formatDate(row.od_time, true),
        displayStatus: this.getDisplayStatus(
          row.od_status,
          row.delivery_completed,
          row.admin_completed,
          row.auto_confirm_at,
          isConsultationDone
        ),
        odStatus: t(row.od_status),
        recipientName: t(row.od_name),
        recipientPhone: t(row.od_hp),
        recipientAddress: t(row.od_addr1),
        recipientAddressDetail: `${t(row.od_addr2)} ${t(row.od_addr3)}`.trim(),
        deliveryMessage: t(row.od_memo) || null,
        deliveryCompany: t(row.od_delivery_company) || null,
        trackingNumber: t(row.od_invoice) || null,
        products,
        productPrice: this.toInt(row.od_cart_price),
        deliveryFee: this.toInt(row.od_send_cost) + this.toInt(row.od_send_cost2),
        discountAmount: couponDiscount + pointDiscount,
        couponDiscount,
        pointDiscount,
        totalPrice: this.computeOrderTotal(row),
        cancelPrice: this.toInt(row.od_cancel_price),
        isPrescriptionOrder,
        isConsultationDone,
        canConfirmReceipt: this.canConfirmReceipt(row.od_status, row.delivery_completed),
        paymentMethod: settleCase || ((this.toInt(row.od_misu) > 0 && bankAccount.includes('/')) ? '가상계좌' : ''),
        paymentMethodDetail: null,
        odTno,
        od_tno: odTno,
        odAppNo,
        od_app_no: odAppNo,
        odBankAccount: bankAccount || null,
        odDepositName: depositName,
        od_deposit_name: depositName,
        ordererName: t(row.od_b_name),
        ordererPhone: t(row.od_b_hp),
        ordererEmail: t(row.od_email),
        cancelReason: null,
        cancelType: null,
        cancelDate: null,
        cancelReasonLabel: null,
        reservationDate: null,
        reservationTime: null,
        reservationEndTime: null
      };

      if (bankAccount && (settleCase.includes('가상계좌') || settleCase.includes('무통장'))) {
        detail.paymentMethodDetail = bankAccount;
      } else if (bankAccount && (settleCase.includes('간편결제') || settleCase.includes('신용카드'))) {
        if (bankAccount.includes('카카오')) detail.paymentMethodDetail = ' (카카오페이)';
        else if (bankAccount.includes('네이버')) detail.paymentMethodDetail = ' (네이버페이)';
        else if (bankAccount.includes('토스')) detail.paymentMethodDetail = ' (토스페이)';
        else if (bankAccount !== '0') detail.paymentMethodDetail = ` (${bankAccount})`;
      }

      const odStatusText = t(row.od_status).trim();
      if (odStatusText === '취소' || odStatusText === '반품') {
        this.parseCancelInfo(detail, row.od_shop_memo, row.od_mod_history);
      }

      const reservation = healthBundle.reservation;
      if (reservation) {
        let rawDate = reservation.hp_rsvt_date;
        if (rawDate != null && !(rawDate instanceof Date)) {
          rawDate = this.bufferToString(rawDate) || rawDate;
        }
        detail.reservationDate = this.formatSqlDateForApi(rawDate);
        const stime = reservation.hp_rsvt_stime
          ? String(this.bufferToString(reservation.hp_rsvt_stime) || reservation.hp_rsvt_stime).trim()
          : null;
        const etime = reservation.hp_rsvt_etime
          ? String(this.bufferToString(reservation.hp_rsvt_etime) || reservation.hp_rsvt_etime).trim()
          : null;
        detail.reservationTime = stime;
        detail.reservationEndTime = etime;
      }
      const cardReceiptUrl = this.buildKcpCardReceiptUrl(row);
      if (cardReceiptUrl) {
        detail.cardReceiptUrl = cardReceiptUrl;
      }

      orderDetailCache.set(cacheKey, detail);
      res.set('Cache-Control', 'private, max-age=5');
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

      const cancelMemo = this.buildCustomerCancelMemo(order.od_shop_memo);
      await orderRepository.updateOrder(odId, {
        od_status: '취소',
        status_changed_at: new Date(),
        od_shop_memo: cancelMemo,
      });
      this.invalidateOrderDetailCache(mbId, odId);
      return res.json({ success: true, message: '주문이 취소되었습니다.' });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async confirmPurchase(req, res) {
    try {
      const odId = this.toOdId(req.params.odId);
      if (!odId) return res.status(400).json({ error: '주문번호가 필요합니다.', message: '주문번호가 필요합니다.' });

      const mbIdRaw = req.body?.mbId ?? req.body?.mb_id;
      const mbId = mbIdRaw != null ? String(mbIdRaw).trim() : '';
      if (!mbId) {
        return res.status(400).json({ error: '회원 ID가 필요합니다.', message: '회원 ID가 필요합니다.' });
      }

      // 토큰 회원이 있으면 body mbId와 반드시 일치
      const tokenMbId = this.bufferToString(
        req.user?.mb_id || req.user?.mbId || req.auth?.mb_id || req.auth?.mbId || ''
      )?.trim();
      if (tokenMbId && tokenMbId !== mbId) {
        return res.status(403).json({ error: '권한이 없습니다.', message: '권한이 없습니다.' });
      }

      const order = await orderRepository.findById(odId);
      if (!order) {
        return res.status(404).json({ error: '주문을 찾을 수 없습니다.', message: '주문을 찾을 수 없습니다.' });
      }

      const orderMbId = this.bufferToString(order.mb_id || '').trim();
      if (orderMbId !== mbId) {
        return res.status(403).json({ error: '권한이 없습니다.', message: '권한이 없습니다.' });
      }

      const clientIp =
        (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim()) ||
        req.ip ||
        '';

      const result = await orderRepository.confirmOrderReceipt(odId, mbId, {
        actorId: mbId,
        clientIp,
      });

      const earnedPoint =
        result.point?.granted && Number(result.point.poPoint) > 0
          ? Number(result.point.poPoint)
          : 0;

      if (result.auto) {
        // 웹: alert 후 중단 — 앱은 상태 갱신을 위해 200 + 안내 메시지
        this.invalidateOrderDetailCache(mbId, odId);
        return res.json({
          success: true,
          message: '수령 확인 기한이 지나 자동으로 수령 완료 처리되었습니다.',
          odId: String(odId),
          odStatus: '완료',
          deliveryCompleted: 1,
          displayStatus: '배송완료',
          autoConfirmed: true,
          earnedPoint,
        });
      }

      this.invalidateOrderDetailCache(mbId, odId);
      return res.json({
        success: true,
        message: '수령 확인되었습니다.',
        odId: String(odId),
        odStatus: '완료',
        deliveryCompleted: 1,
        displayStatus: '배송완료',
        autoConfirmed: false,
        earnedPoint,
      });
    } catch (error) {
      const status = Number(error.statusCode) || 400;
      const message = error.message || '수령확인에 실패했습니다.';
      return res.status(status).json({ error: message, message });
    }
  }

  async processAutoConfirm(req, res) {
    try {
      const limit = Number(req.body?.limit || req.query?.limit || 100);
      const result = await orderRepository.processDueAutoConfirms(limit);
      return res.json({
        success: true,
        message: '자동 확정 처리가 완료되었습니다.',
        processed: result.processed,
        failed: result.failed,
        odIds: result.odIds,
      });
    } catch (error) {
      return res.status(400).json({ error: error.message, message: error.message });
    }
  }

  canConfirmReceipt(odStatus, deliveryCompleted) {
    if (Number(deliveryCompleted || 0) === 1) return false;
    const status = String(odStatus || '').trim();
    return status === '배송' || status === '완료';
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
      if (this.bufferToString(order.mb_id || '').trim() !== String(mbId || '').trim()) {
        throw new Error('주문 정보가 일치하지 않습니다.');
      }
      const odStatus = this.bufferToString(order.od_status || '').trim();
      if (!['주문', '입금', '준비'].includes(odStatus)) {
        throw new Error('예약 시간은 결제 완료·배송준비 단계에서만 변경할 수 있습니다.');
      }
      if (await orderRepository.isConsultationDone(mbId, odId)) {
        throw new Error('처방 주문은 예약 시간 변경이 불가능합니다.');
      }

      const date = String(reservationDate).includes('T')
        ? String(reservationDate).substring(0, String(reservationDate).indexOf('T'))
        : String(reservationDate);
      const changed = await orderRepository.updateReservation(mbId, odId, date, reservationTime);
      if (!changed) throw new Error('예약 정보를 찾을 수 없습니다.');

      this.invalidateOrderDetailCache(mbId, odId);
      return res.json({ success: true, message: '예약 시간이 변경되었습니다.' });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  /** bomiora_shop_order_address 한 행 — mysql2 Buffer 필드를 문자열로 정규화 */
  normalizeAddressRowForOrder(row) {
    if (!row) return null;
    return {
      ad_name: this.bufferToString(row.ad_name) || '',
      ad_tel: this.bufferToString(row.ad_tel) || '',
      ad_hp: this.bufferToString(row.ad_hp) || '',
      ad_zip1: this.bufferToString(row.ad_zip1) || '',
      ad_zip2: this.bufferToString(row.ad_zip2) || '',
      ad_addr1: this.bufferToString(row.ad_addr1) || '',
      ad_addr2: this.bufferToString(row.ad_addr2) || '',
      ad_addr3: this.bufferToString(row.ad_addr3) || '',
      ad_jibeon: this.bufferToString(row.ad_jibeon) || '',
    };
  }

  async changeDeliveryAddress(req, res) {
    try {
      const odId = this.toOdId(req.params.odId);
      if (!odId) return res.status(400).json({ error: '주문번호가 필요합니다.' });
      const mbIdRaw = req.body.mbId ?? req.body.mb_id;
      const mbId = mbIdRaw != null ? String(mbIdRaw).trim() : '';
      const addressId = Number(req.body.addressId ?? req.body.adId);

      if (!mbId) return res.status(400).json({ error: '회원 ID가 필요합니다.' });
      if (!addressId || Number.isNaN(addressId)) return res.status(400).json({ error: '배송지 ID가 필요합니다.' });

      const order = await orderRepository.findById(odId);
      if (!order) throw new Error('주문을 찾을 수 없습니다.');
      if (this.bufferToString(order.mb_id || '').trim() !== mbId) {
        throw new Error('주문 정보가 일치하지 않습니다.');
      }
      const odStatus = this.bufferToString(order.od_status || '').trim();
      if (!['주문', '입금', '준비'].includes(odStatus)) {
        throw new Error('배송지는 결제대기/배송준비 상태에서만 변경할 수 있습니다.');
      }
      if (await orderRepository.isConsultationDone(mbId, odId)) {
        throw new Error('처방 주문은 배송지 변경이 불가능합니다.');
      }

      const addressRow = await orderRepository.getAddressById(mbId, addressId);
      if (!addressRow) throw new Error('선택한 배송지를 찾을 수 없습니다.');

      const address = this.normalizeAddressRowForOrder(addressRow);
      const changed = await orderRepository.updateOrderAddress(odId, mbId, address);
      if (!changed) throw new Error('배송지 변경에 실패했습니다.');

      this.invalidateOrderDetailCache(mbId, odId);
      return res.json({ success: true, message: '배송지가 변경되었습니다.' });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  /** 배송요청사항(od_memo) 변경 */
  async updateDeliveryMemo(req, res) {
    try {
      const odId = this.toOdId(req.params.odId);
      if (!odId) return res.status(400).json({ error: '주문번호가 필요합니다.' });

      const mbIdRaw = req.body.mbId ?? req.body.mb_id;
      const mbId = mbIdRaw != null ? String(mbIdRaw).trim() : '';
      if (!mbId) return res.status(400).json({ error: '회원 ID가 필요합니다.' });

      const memo = String(
        req.body.od_memo ?? req.body.memo ?? req.body.deliveryMessage ?? ''
      ).trim();

      const order = await orderRepository.findById(odId);
      if (!order) throw new Error('주문을 찾을 수 없습니다.');
      if (this.bufferToString(order.mb_id || '').trim() !== mbId) {
        throw new Error('주문 정보가 일치하지 않습니다.');
      }

      const odStatus = this.bufferToString(order.od_status || '').trim();
      if (!['주문', '입금', '준비'].includes(odStatus)) {
        throw new Error('배송요청사항은 결제대기/배송준비 상태에서만 변경할 수 있습니다.');
      }
      if (await orderRepository.isConsultationDone(mbId, odId)) {
        throw new Error('처방 주문은 배송요청사항 변경이 불가능합니다.');
      }

      const changed = await orderRepository.updateOrderMemo(odId, mbId, memo);
      if (!changed) throw new Error('배송요청사항 변경에 실패했습니다.');

      this.invalidateOrderDetailCache(mbId, odId);
      return res.json({
        success: true,
        message: '배송요청사항이 변경되었습니다.',
        od_memo: memo,
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
}

module.exports = new OrderController();
