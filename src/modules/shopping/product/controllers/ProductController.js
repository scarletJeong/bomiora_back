const productRepository = require('../repositories/ProductRepository');
const productOptionRepository = require('../option/repositories/ProductOptionRepository');
const reviewRepository = require('../../../user/review/repositories/ReviewRepository');
const shopDefaultRepository = require('../../../common/shopdefault/repositories/ShopDefaultRepository');
const imageProxyController = require('../../../common/imageProxy/controllers/ImageProxyController');
const userRepository = require('../../../auth/repositories/UserRepository');
const { TtlCache } = require('../../../../utils/ttlCache');
const { registerPublicCache } = require('../../../internal/cache/publicCacheRegistry');

const homeProductCache = new TtlCache(90_000);
const productListCache = new TtlCache(120_000);
const optionCache = new TtlCache(90_000);
const PRODUCT_DETAIL_FRESH_MS = 5 * 60 * 1000;
const PRODUCT_DETAIL_STALE_MS = 24 * 60 * 60 * 1000;
const productDetailCache = new TtlCache(PRODUCT_DETAIL_FRESH_MS);
registerPublicCache('product', homeProductCache);
registerPublicCache('product', productListCache);
registerPublicCache('product', optionCache);
registerPublicCache('product', productDetailCache);

class ProductController {
  constructor() {
    this._shopDefaultCache = null;
    this._shopDefaultCacheAt = 0;
  }

  categoryName(categoryId) {
    switch (String(categoryId)) {
      case '10':
        return '다이어트';
      case '20':
        return '디톡스';
      case '50':
        return '건강/면역';
      case '80':
        return '심신안정';
      default:
        return '기타';
    }
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

  normalizeImageUrl(path) {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return path.startsWith('/') ? path : `/${path}`;
  }

  productImageOriginUrl(raw) {
    const value = String(raw || '').trim().replace(/^\/+/, '');
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    const path = value.toLowerCase().startsWith('data/item/')
      ? value
      : `data/item/${value}`;
    return `https://bomiora0.mycafe24.com/${path}`;
  }

  async getShopDefaultCached() {
    const now = Date.now();
    if (this._shopDefaultCache && now - this._shopDefaultCacheAt < 300_000) {
      return this._shopDefaultCache;
    }
    this._shopDefaultCache = await shopDefaultRepository.findFirst();
    this._shopDefaultCacheAt = now;
    return this._shopDefaultCache;
  }

  /** 서버 기동 시 shopDefault 미리 로드 — 목록 API 2번째 RTT 제거 */
  warmShopDefault() {
    return this.getShopDefaultCached().catch(() => null);
  }

  /** 홈 신상품 캐시 선적재 — 첫 방문 1초대 대기 방지 */
  async warmHomeProductCaches() {
    await this.warmShopDefault();
    const homePayload = await homeProductCache
      .getOrSetStale('new:4', async () => {
        const [rows, shopDefault] = await Promise.all([
          productRepository.findNewProducts(4),
          this.getShopDefaultCached(),
        ]);
        return {
          success: true,
          data: (rows || []).map((r) => this.toProductSearchDto(r, shopDefault)),
        };
      })
      .catch(() => null);
    for (const product of homePayload?.data || []) {
      this.warmProductDetailCache(product.id).catch(() => {});
    }
    this.warmCatalogCaches().catch(() => {});
  }

  async warmProductDetailCache(productId) {
    const id = String(productId || '').trim();
    if (!id) return null;
    const payload = await productDetailCache.getOrSetStale(
      `detail:${id}`,
      async () => {
        const [row, shopDefault] = await Promise.all([
          productRepository.findById(id),
          this.getShopDefaultCached(),
        ]);
        if (!row) {
          return { success: false, status: 404, message: '상품을 찾을 수 없습니다' };
        }
        return { success: true, data: this.toProductDto(row, shopDefault) };
      },
      PRODUCT_DETAIL_FRESH_MS,
      PRODUCT_DETAIL_STALE_MS,
    );
    const imageUrl = this.productImageOriginUrl(
      payload?.data?.additionalInfo?.it_img10 || payload?.data?.imageUrl,
    );
    // 상세 상단은 1000px 리사이즈본만 표시한다. 상세 API 캐시를 데울 때
    // 같은 캐시 키의 이미지를 미리 만들어 첫 요청의 원본 fetch/Sharp 변환을 없앤다.
    if (imageUrl) imageProxyController.warmThumb(imageUrl, 1000).catch(() => {});
    return payload;
  }

  async _categoriesPayload(itKind) {
    const kind = String(itKind || '').trim();
    return homeProductCache.getOrSetStale(`categories-with-products:${kind}`, async () => {
      const rows = await productRepository.findCategoriesWithProducts(kind);
      const categories = rows.map((row) => ({
        categoryId: this.bufferToString(row.ca_id),
        categoryName: this.bufferToString(row.ca_name),
        productKind: kind,
        sortOrder: row.ca_order != null ? Number(row.ca_order) : 0,
      }));
      return { success: true, data: categories };
    });
  }

  async _listPayload(categoryId, itKind, page, pageSize) {
    const cacheKey = `list:${categoryId}:${itKind || ''}:${page}:${pageSize}`;
    return productListCache.getOrSetStale(cacheKey, async () => {
      const [rows, shopDefault] = await Promise.all([
        productRepository.findByCategory(categoryId, itKind, page, pageSize),
        this.getShopDefaultCached(),
      ]);
      const products = (rows || []).map((r) => this.toProductSearchDto(r, shopDefault));
      return {
        success: true,
        data: products,
        total: products.length,
        page,
        pageSize,
      };
    });
  }

  /** 스토어 탭·카테고리 목록 선적재 — 첫 진입 380ms DB 왕복 제거 */
  async warmCatalogCaches() {
    await this.warmShopDefault();
    for (const kind of ['prescription', 'general']) {
      try {
        const payload = await this._categoriesPayload(kind);
        const cats = Array.isArray(payload?.data) ? payload.data : [];
        await Promise.all(
          cats
            .map((c) => String(c.categoryId || '').trim())
            .filter(Boolean)
            .flatMap((id) => [
              this._listPayload(id, kind, 1, 4).catch(() => null),
              this._listPayload(id, kind, 1, 20).catch(() => null),
            ])
        );
      } catch (_) {}
    }
  }

  _toInt(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }

  _formatWon(amount) {
    return `${this._toInt(amount).toLocaleString('ko-KR')}원`;
  }

  /**
   * 상세 제품정보 섹션용 배송비 문구
   * it_sc_type: 0=쇼핑몰기본, 1=무료, 2=조건부무료, 3=유료, 4=수량별
   */
  buildShippingFeeLabel(row, shopDefault) {
    const type = this._toInt(row.it_sc_type, 0);
    const price = this._toInt(row.it_sc_price, 0);
    const minimum = this._toInt(row.it_sc_minimum, 0);

    if (type === 1) return '무료배송';
    if (type === 3) return '유료배송';
    if (type === 2) {
      if (minimum > 0) {
        return `조건부 무료배송 (${this._formatWon(minimum)} 이상 무료)`;
      }
      if (price > 0) return `조건부 무료배송 (${this._formatWon(price)})`;
      return '조건부 무료배송';
    }
    if (type === 4) {
      const qty = this._toInt(row.it_sc_qty, 0);
      const unit = qty > 0 ? qty : 1;
      if (price > 0) return `${unit}개마다 ${this._formatWon(price)}`;
      return '수량별 배송비';
    }

    // type 0 — bomiora_shop_default
    return this.buildDefaultShippingFeeLabel(shopDefault);
  }

  buildDefaultShippingFeeLabel(shopDefault) {
    if (!shopDefault) return '';
    const caseRaw = this.bufferToString(shopDefault.de_send_cost_case);
    const caseStr = caseRaw != null ? String(caseRaw).trim() : '';

    if (caseStr === '무료') return '무료배송';
    if (caseStr === '착불') return '착불';

    const limits = String(this.bufferToString(shopDefault.de_send_cost_limit) || '')
      .split(';')
      .map((s) => String(s).replace(/[^0-9]/g, ''))
      .filter(Boolean)
      .map((s) => Number(s));
    const fees = String(this.bufferToString(shopDefault.de_send_cost_list) || '')
      .split(';')
      .map((s) => String(s).replace(/[^0-9]/g, ''))
      .filter(Boolean)
      .map((s) => Number(s));

    // 금액별차등: 기본 배송비 + (마지막 상한가 이상 무료)
    if (caseStr === '차등' || limits.length > 0 || fees.length > 0) {
      const freeThreshold = limits.length ? limits[limits.length - 1] : 0;
      const baseFee = fees.length ? fees[0] : 0;
      if (freeThreshold > 0 && baseFee > 0) {
        return `${this._formatWon(baseFee)} (${this._formatWon(freeThreshold)} 이상 무료)`;
      }
      if (freeThreshold > 0) {
        return `조건부 무료배송 (${this._formatWon(freeThreshold)} 이상 무료)`;
      }
      if (baseFee > 0) return this._formatWon(baseFee);
      return '금액별 차등 배송비';
    }

    return caseStr;
  }

  async mapProductDtos(rows) {
    const shopDefault = await this.getShopDefaultCached();
    return (rows || []).map((r) => this.toProductDto(r, shopDefault));
  }

  async mapProductSearchDtos(rows) {
    const shopDefault = await this.getShopDefaultCached();
    return (rows || []).map((r) => this.toProductSearchDto(r, shopDefault));
  }

  buildFlutterImageUrl(folderPath, productId) {
    if (!folderPath) return null;
    let base = folderPath.trim();
    if (!base.endsWith('/')) base += '/';

    if (base.startsWith('http://') || base.startsWith('https://')) {
      const normalized = base.endsWith('/') ? base.slice(0, -1) : base;
      return `${normalized}/${productId}_list.jpg`;
    }
    if (!base.startsWith('/')) base = `/${base}`;
    return `${base}${productId}_list.jpg`;
  }

  processImageUrl(row, maxImages = 9) {
    const cardImage = row.it_img1;
    if (cardImage != null && String(cardImage).trim() !== '') {
      return this.normalizeImageUrl(String(cardImage).trim());
    }
    if (row.it_flutter_image_url && String(row.it_flutter_image_url).trim()) {
      return this.buildFlutterImageUrl(String(row.it_flutter_image_url).trim(), row.it_id);
    }
    const limit = Math.min(Math.max(Number(maxImages) || 9, 1), 9);
    for (let i = 1; i <= limit; i += 1) {
      const key = `it_img${i}`;
      const value = row[key];
      if (value != null && String(value).trim() !== '') {
        return this.normalizeImageUrl(String(value).trim());
      }
    }
    return null;
  }

  /** 웹 `$_const['certification']` / agency{n}.png 과 동일 */
  static get CERTIFICATION_LABELS() {
    return {
      1: 'HGMP 인증',
      2: '기관2',
      3: '기관3',
      4: '기관4',
      5: '기관5',
      6: '기관6',
      7: '기관7',
      8: '기관8',
      9: '기관9',
      10: '기관10',
    };
  }

  buildCertifications(row) {
    const labels = ProductController.CERTIFICATION_LABELS;
    const out = [];
    for (let i = 1; i <= 10; i += 1) {
      const raw = row[`it_certification${i}`];
      const on = Number(raw) === 1 || String(raw).trim() === '1';
      if (!on) continue;
      out.push({
        id: i,
        label: labels[i] || `기관${i}`,
        imageUrl: `https://bomiora.net/img/detail/agency${i}.png`,
      });
    }
    return out;
  }

  toProductDto(row, shopDefault = null) {
    // Buffer를 문자열로 변환
    const itIdStr = this.bufferToString(row.it_id);
    const itKindStr = this.bufferToString(row.it_kind);
    const itExplain = row.it_explain ?? row.it_explan ?? null;
    const itSubjectRaw = this.bufferToString(row.it_subject);
    const itSubjectStr =
      itSubjectRaw != null && String(itSubjectRaw).trim() !== ''
        ? String(itSubjectRaw).trim()
        : null;
    const itBasicRaw = this.bufferToString(row.it_basic);
    const itBasicStr =
      itBasicRaw != null && String(itBasicRaw).trim() !== ''
        ? String(itBasicRaw).trim()
        : null;
    const itPrecautionsRaw = this.bufferToString(row.it_precautions);
    const itPrecautionsStr =
      itPrecautionsRaw != null && String(itPrecautionsRaw).trim() !== ''
        ? String(itPrecautionsRaw).trim()
        : null;
    const itBaesongContentRaw = this.bufferToString(row.it_baesong_content);
    const itBaesongContentStr =
      itBaesongContentRaw != null && String(itBaesongContentRaw).trim() !== ''
        ? String(itBaesongContentRaw).trim()
        : null;
    const itShippingProcessRaw = this.bufferToString(row.it_shipping_process);
    const itShippingProcessStr =
      itShippingProcessRaw != null && String(itShippingProcessRaw).trim() !== ''
        ? String(itShippingProcessRaw).trim()
        : null;
    const itChangeContentRaw = this.bufferToString(row.it_change_content);
    const itChangeContentStr =
      itChangeContentRaw != null && String(itChangeContentRaw).trim() !== ''
        ? String(itChangeContentRaw).trim()
        : null;
    const textOrNull = (raw) => {
      const s = this.bufferToString(raw);
      if (s == null) return null;
      const t = String(s).trim();
      return t !== '' ? t : null;
    };
    const imageFields = {};
    for (let i = 1; i <= 9; i += 1) {
      const key = `it_img${i}`;
      const value = row[key];
      imageFields[key] = value != null && String(value).trim() !== '' ? String(value).trim() : null;
    }
    const detailImage = row.it_img10;
    imageFields.it_img10 = detailImage != null && String(detailImage).trim() !== ''
      ? String(detailImage).trim()
      : null;

    const scType = this._toInt(row.it_sc_type, 0);
    const scPrice = this._toInt(row.it_sc_price, 0);
    const scMinimum = this._toInt(row.it_sc_minimum, 0);
    const shippingFeeLabel = this.buildShippingFeeLabel(row, shopDefault);
    const certifications = this.buildCertifications(row);
    
    return {
      id: itIdStr,
      name: this.bufferToString(row.it_name),
      // 목록용 짧은 설명(it_basic). 상세 본문은 it_explain → description
      description: this.bufferToString(itExplain),
      it_basic: itBasicStr,
      it_subject: itSubjectStr,
      it_precautions: itPrecautionsStr,
      it_baesong_content: itBaesongContentStr,
      it_shipping_process: itShippingProcessStr,
      it_change_content: itChangeContentStr,
      certifications,
      shippingFeeLabel,
      price: row.it_price,
      originalPrice: row.it_cust_price,
      imageUrl: this.processImageUrl(row),
      categoryId: this.bufferToString(row.ca_id),
      categoryName: this.categoryName(row.ca_id),
      productKind: itKindStr,
      isNew: Number(row.it_type3 || 0) === 1,
      isBest: Number(row.it_type4 || 0) === 1,
      stock: row.it_stock_qty ?? 0,
      it_soldout: this.bufferToString(row.it_soldout),
      it_stock_sms: this._toInt(row.it_stock_sms, 0),
      it_use: this.bufferToString(row.it_use),
      rating: row.it_use_avg != null ? Number(row.it_use_avg) : null,
      reviewCount: row.it_use_cnt ?? 0,
      additionalInfo: {
        it_id: itIdStr,
        it_kind: itKindStr,
        it_soldout: this.bufferToString(row.it_soldout),
        it_stock_sms: this._toInt(row.it_stock_sms, 0),
        it_use: this.bufferToString(row.it_use),
        it_explain: this.bufferToString(itExplain),
        it_subject: itSubjectStr,
        it_basic: itBasicStr,
        it_precautions: itPrecautionsStr,
        it_baesong_content: itBaesongContentStr,
        it_shipping_process: itShippingProcessStr,
        it_change_content: itChangeContentStr,
        it_prescription: textOrNull(row.it_prescription),
        it_takeway: textOrNull(row.it_takeway),
        it_package: textOrNull(row.it_package),
        it_maker: textOrNull(row.it_maker),
        it_origin: textOrNull(row.it_origin),
        it_brand: textOrNull(row.it_brand),
        it_model: textOrNull(row.it_model),
        it_option_subject: textOrNull(row.it_option_subject),
        it_supply_subject: textOrNull(row.it_supply_subject),
        it_supply_items: textOrNull(row.it_supply_items) || '',
        it_depopt1_subject: textOrNull(row.it_depopt1_subject) || '',
        it_depopt1_label: textOrNull(row.it_depopt1_label) || '',
        it_depopt2_subject: textOrNull(row.it_depopt2_subject) || '',
        it_depopt2_label: textOrNull(row.it_depopt2_label) || '',
        it_weight: textOrNull(row.it_weight),
        it_sc_type: scType,
        it_sc_method: this._toInt(row.it_sc_method, 0),
        it_sc_price: scPrice,
        it_sc_minimum: scMinimum,
        it_sc_qty: this._toInt(row.it_sc_qty, 0),
        shippingFeeLabel,
        it_point: row.it_point,
        it_point_type: row.it_point_type,
        it_buy_min_qty: this._toInt(row.it_buy_min_qty, 0),
        it_buy_max_qty: this._toInt(row.it_buy_max_qty, 0),
        it_tel_inq: this._toInt(row.it_tel_inq, 0),
        it_mb_inf: textOrNull(row.it_mb_inf) || '',
        certifications,
        ...imageFields
      },
      depOption1Subject: textOrNull(row.it_depopt1_subject) || '',
      depOption1Label: textOrNull(row.it_depopt1_label) || '',
      depOption2Subject: textOrNull(row.it_depopt2_subject) || '',
      depOption2Label: textOrNull(row.it_depopt2_label) || '',
      supplyItemIds: this.parseSupplyItemIds(row.it_supply_items, itIdStr),
      it_supply_items: textOrNull(row.it_supply_items) || '',
    };
  }

  /** it_supply_items CSV → id 배열 (자기 자신 제외) */
  parseSupplyItemIds(raw, selfId = '') {
    const self = String(selfId || '').trim();
    const csv = this.bufferToString(raw) || '';
    return String(csv)
      .split(',')
      .map((s) => s.replace(/[^0-9]/g, '').trim())
      .filter((id) => id && id !== self);
  }

  /**
   * 검색/목록용: 상세 DTO를 거치지 않고 카드에 필요한 필드만 직렬화
   */
  toProductSearchDto(row, shopDefault = null) {
    const id = this.bufferToString(row.it_id);
    const kind = this.bufferToString(row.it_kind);
    const textOrNull = (raw) => {
      const s = this.bufferToString(raw);
      if (s == null) return null;
      const t = String(s).trim();
      return t !== '' ? t : null;
    };
    const itBasic = textOrNull(row.it_basic);
    const itSubject = textOrNull(row.it_subject);
    const shippingFeeLabel = this.buildShippingFeeLabel(row, shopDefault);
    const supplyCsv = textOrNull(row.it_supply_items) || '';

    return {
      id,
      name: this.bufferToString(row.it_name),
      it_basic: itBasic,
      it_subject: itSubject,
      price: row.it_price,
      originalPrice: row.it_cust_price,
      imageUrl: this.processImageUrl(row, 3),
      categoryId: this.bufferToString(row.ca_id),
      categoryName: this.categoryName(row.ca_id),
      productKind: kind,
      isNew: Number(row.it_type3 || 0) === 1,
      isBest: Number(row.it_type4 || 0) === 1,
      stock: row.it_stock_qty ?? 0,
      rating: row.it_use_avg != null ? Number(row.it_use_avg) : null,
      reviewCount: row.it_use_cnt ?? 0,
      shippingFeeLabel,
      depOption1Subject: textOrNull(row.it_depopt1_subject) || '',
      depOption1Label: textOrNull(row.it_depopt1_label) || '',
      depOption2Subject: textOrNull(row.it_depopt2_subject) || '',
      depOption2Label: textOrNull(row.it_depopt2_label) || '',
      supplyItemIds: this.parseSupplyItemIds(row.it_supply_items, id),
      additionalInfo: {
        it_id: id,
        it_kind: kind,
        it_img10: textOrNull(row.it_img10),
        it_subject: itSubject,
        it_basic: itBasic,
        shippingFeeLabel,
        it_supply_items: supplyCsv,
      },
    };
  }

  toOptionDto(row) {
    const id = String(row.io_id || '');
    const axis = id.split('\u001e').map((part) => part.trim()).filter(Boolean);
    const optionName = axis[0] || id;
    const subOption = axis.slice(1).join(' > ');
    const ioType = Number(row.io_type);
    return {
      id,
      productId: row.it_id,
      optionName,
      subOption,
      days: null,
      price: row.io_price,
      stock: row.io_stock_qty,
      type: Number.isFinite(ioType) ? ioType : 0,
      io_type: Number.isFinite(ioType) ? ioType : 0,
    };
  }

  async getProductsByCategory(req, res) {
    try {
      const categoryId = req.query.ca_id;
      const itKind = req.query.it_kind || null;
      const page = Number(req.query.page || 1);
      const pageSize = Number(req.query.pageSize || 20);
      const payload = await this._listPayload(categoryId, itKind, page, pageSize);
      res.set('Cache-Control', 'public, max-age=120');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `상품 목록 조회 실패: ${error.message}`,
        data: []
      });
    }
  }

  async getProductDetail(req, res) {
    const started = Date.now();
    try {
      const productId = String(req.query.id || '').trim();
      const detailKey = `detail:${productId}`;
      const existing = productDetailCache.store.get(detailKey);
      const cacheState = !existing
        ? 'MISS'
        : Date.now() <= existing.expiresAt
          ? 'HIT'
          : 'STALE';
      if (productId && !existing) {
        reviewRepository.refreshItemReviewAggregates(productId).catch(() => {});
      }
      const payload = await this.warmProductDetailCache(productId);
      const elapsed = Date.now() - started;
      console.log(`[상품상세] ${productId} ${cacheState} ${elapsed}ms`);
      res.set('X-Product-Detail-Cache', cacheState);
      if (payload.status === 404 || payload.success === false) {
        return res.json({ success: false, message: payload.message || '상품을 찾을 수 없습니다' });
      }
      res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ success: false, message: `상품 상세 조회 실패: ${error.message}` });
    }
  }

  async getPopularProducts(req, res) {
    try {
      const limit = Number(req.query.limit || 10);
      const payload = await homeProductCache.getOrSetStale(`best:${limit}`, async () => ({
        success: true,
        data: await this.mapProductSearchDtos(
          await productRepository.findBestProducts(limit)
        ),
      }));
      res.set('Cache-Control', 'public, max-age=30');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ success: false, message: `인기 상품 조회 실패: ${error.message}`, data: [] });
    }
  }

  async getNewProducts(req, res) {
    try {
      const limit = Number(req.query.limit || 10);
      const payload = await homeProductCache.getOrSetStale(`new:${limit}`, async () => {
        const [rows, shopDefault] = await Promise.all([
          productRepository.findNewProducts(limit),
          this.getShopDefaultCached(),
        ]);
        return {
          success: true,
          data: (rows || []).map((r) => this.toProductSearchDto(r, shopDefault)),
        };
      });
      res.set('Cache-Control', 'public, max-age=60');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ success: false, message: `신상품 조회 실패: ${error.message}`, data: [] });
    }
  }

  async getCategoriesWithProducts(req, res) {
    try {
      const itKind = String(req.query.it_kind || '').trim();
      if (!itKind) {
        return res.status(400).json({
          success: false,
          message: 'it_kind 파라미터가 필요합니다.',
          data: []
        });
      }

      const payload = await this._categoriesPayload(itKind);

      res.set('Cache-Control', 'public, max-age=120');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `카테고리 목록 조회 실패: ${error.message}`,
        data: []
      });
    }
  }

  async getMdPickProducts(req, res) {
    try {
      const limit = Number(req.query.limit || 4);
      const itKind = req.query.it_kind || null;
      const payload = await homeProductCache.getOrSetStale(
        `md:${limit}:${itKind || ''}`,
        async () => ({
          success: true,
          data: await this.mapProductSearchDtos(
            await productRepository.findMdPickProducts(limit, itKind)
          ),
        })
      );
      res.set('Cache-Control', 'public, max-age=30');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `MD pick 조회 실패: ${error.message}`,
        data: []
      });
    }
  }

  async getProductOptions(req, res) {
    try {
      const productId = String(req.params.productId || '').trim();
      const ioType =
        req.query.io_type != null ? req.query.io_type : req.query.type;
      const cacheKey = `opt:${productId}:${ioType == null ? '' : String(ioType)}`;
      const payload = await optionCache.getOrSet(cacheKey, async () => {
        const rows = await productOptionRepository.findByProductId(
          productId,
          ioType
        );
        return {
          success: true,
          data: rows.map((r) => this.toOptionDto(r)),
          message: '옵션 목록 조회 성공',
        };
      });
      res.set('Cache-Control', 'public, max-age=60');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `옵션 목록 조회 실패: ${error.message}`,
      });
    }
  }

  /** 휴대폰을 010-1234-5678 형태로 맞춤 (웹 hyphen_hp_number와 동일) */
  hyphenHpNumber(raw) {
    const digits = String(raw || '').replace(/[^0-9]/g, '');
    if (!digits) return '';
    const matched = digits.match(/^([0-9]{3})([0-9]{3,4})([0-9]{4})$/);
    if (!matched) return digits;
    return `${matched[1]}-${matched[2]}-${matched[3]}`;
  }

  clientIp(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim();
    return forwarded || req.socket?.remoteAddress || req.ip || '';
  }

  /**
   * POST /api/products/stock-sms
   * 로그인 회원 휴대폰으로 재입고 SMS 신청 저장
   * body: { it_id, mb_id }
   */
  async requestStockSms(req, res) {
    try {
      const itId = String(req.body?.it_id || req.body?.productId || '').trim();
      const mbId = String(req.body?.mb_id || req.body?.mbId || '').trim();
      if (!itId) {
        return res.status(400).json({
          success: false,
          message: '상품정보가 존재하지 않습니다.',
        });
      }
      if (!mbId) {
        return res.status(401).json({
          success: false,
          message: '로그인 후 이용할 수 있습니다.',
        });
      }

      const item = await productRepository.findById(itId);
      if (!item) {
        return res.status(404).json({
          success: false,
          message: '상품정보가 존재하지 않습니다.',
        });
      }

      const soldout = String(item.it_soldout ?? '').trim();
      const stockSms = Number(item.it_stock_sms || 0);
      if (soldout !== '1' || stockSms !== 1) {
        return res.status(400).json({
          success: false,
          message: '재입고SMS 알림을 신청할 수 없는 상품입니다.',
        });
      }

      const member = await userRepository.findByMbId(mbId);
      if (!member) {
        return res.status(404).json({
          success: false,
          message: '회원 정보를 찾을 수 없습니다.',
        });
      }

      const ssHp = this.hyphenHpNumber(member.mbHp);
      if (!ssHp) {
        return res.status(400).json({
          success: false,
          message: '등록된 휴대폰번호가 없습니다. 회원정보에서 번호를 등록해 주세요.',
        });
      }

      const pending = await productRepository.countPendingStockSms(itId, ssHp);
      if (pending > 0) {
        return res.status(409).json({
          success: false,
          message: '해당 상품에 대하여 이전에 알림 요청을 등록한 내역이 있습니다.',
        });
      }

      await productRepository.insertStockSms({
        itId,
        ssHp,
        ssIp: this.clientIp(req),
      });

      return res.json({
        success: true,
        message: '재입고SMS 알림 요청 등록이 완료됐습니다.',
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `재입고SMS 신청 실패: ${error.message}`,
      });
    }
  }

  /** GET /api/products/:productId/supply-products — 연결상품 요약 목록 */
  async getSupplyProducts(req, res) {
    try {
      const productId = String(req.params.productId || '').trim();
      const cacheKey = `supply:${productId}`;
      const payload = await optionCache.getOrSet(cacheKey, async () => {
        const parent = await productRepository.findSupplyItemIds(productId);
        if (!parent) {
          return {
            success: false,
            status: 404,
            message: '상품을 찾을 수 없습니다.',
            data: [],
          };
        }

        const ids = this.parseSupplyItemIds(parent.it_supply_items, productId);
        if (!ids.length) {
          return { success: true, data: [], message: '연결상품 없음' };
        }

        const rows = await productRepository.findSupplySummariesByIds(ids);
        const data = rows
          .filter((r) => {
            const inf = this.bufferToString(r.it_mb_inf);
            return !(inf != null && String(inf).trim() !== '');
          })
          .map((r) => {
            const id = this.bufferToString(r.it_id);
            const optionSubject = this.bufferToString(r.it_option_subject) || '';
            const itSubjectRaw = this.bufferToString(r.it_subject);
            const itSubject =
              itSubjectRaw != null && String(itSubjectRaw).trim() !== ''
                ? String(itSubjectRaw).trim()
                : null;
            return {
              id,
              name: this.bufferToString(r.it_name),
              price: r.it_price,
              originalPrice: r.it_cust_price,
              imageUrl: this.processImageUrl(r),
              it_subject: itSubject,
              productKind: this.bufferToString(r.it_kind),
              stock: r.it_stock_qty ?? 0,
              it_option_subject: optionSubject,
              additionalInfo: {
                it_id: id,
                it_kind: this.bufferToString(r.it_kind),
                it_subject: itSubject,
                it_basic: this.bufferToString(r.it_basic),
                it_option_subject: optionSubject,
                it_supply_items: this.bufferToString(r.it_supply_items) || '',
              },
            };
          });

        return {
          success: true,
          data,
          message: '연결상품 목록 조회 성공',
        };
      });

      if (payload.status === 404) {
        return res.status(404).json({
          success: false,
          message: payload.message,
          data: [],
        });
      }

      res.set('Cache-Control', 'public, max-age=60');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `연결상품 조회 실패: ${error.message}`,
        data: [],
      });
    }
  }
}

module.exports = new ProductController();
