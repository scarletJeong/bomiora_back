const productRepository = require('../repositories/ProductRepository');
const productOptionRepository = require('../option/repositories/ProductOptionRepository');
const reviewRepository = require('../../../user/review/repositories/ReviewRepository');

class ProductController {
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

  processImageUrl(row) {
    if (row.it_flutter_image_url && String(row.it_flutter_image_url).trim()) {
      return this.buildFlutterImageUrl(String(row.it_flutter_image_url).trim(), row.it_id);
    }
    for (let i = 1; i <= 9; i += 1) {
      const key = `it_img${i}`;
      const value = row[key];
      if (value != null && String(value).trim() !== '') {
        return this.normalizeImageUrl(String(value).trim());
      }
    }
    return null;
  }

  toProductDto(row) {
    // Buffer를 문자열로 변환
    const itIdStr = this.bufferToString(row.it_id);
    const itKindStr = this.bufferToString(row.it_kind);
    const itExplain = row.it_explain ?? row.it_explan ?? null;
    const imageFields = {};
    for (let i = 1; i <= 9; i += 1) {
      const key = `it_img${i}`;
      const value = row[key];
      imageFields[key] = value != null && String(value).trim() !== '' ? String(value).trim() : null;
    }
    
    return {
      id: itIdStr,
      name: row.it_name,
      description: itExplain,
      price: row.it_price,
      originalPrice: row.it_cust_price,
      imageUrl: this.processImageUrl(row),
      categoryId: row.ca_id,
      categoryName: this.categoryName(row.ca_id),
      productKind: itKindStr,
      isNew: Number(row.it_type3 || 0) === 1,
      isBest: Number(row.it_type4 || 0) === 1,
      stock: row.it_stock_qty ?? 0,
      rating: row.it_use_avg != null ? Number(row.it_use_avg) : null,
      reviewCount: row.it_use_cnt ?? 0,
      additionalInfo: {
        it_id: itIdStr,
        it_kind: itKindStr,
        it_explain: itExplain,
        it_basic: row.it_basic,
        it_prescription: row.it_prescription,
        it_takeway: row.it_takeway,
        it_package: row.it_package,
        it_weight: row.it_weight,
        it_point: row.it_point,
        it_point_type: row.it_point_type,
        it_option_subject: row.it_option_subject,
        ...imageFields
      }
    };
  }

  toOptionDto(row) {
    const id = String(row.io_id || '');
    const optionName = id.replace(/\d+.*/, '');
    const matched = id.match(/\d+/);
    return {
      id,
      productId: row.it_id,
      optionName,
      days: matched ? Number(matched[0]) : null,
      price: row.io_price,
      stock: row.io_stock_qty,
      type: row.io_type
    };
  }

  async getProductsByCategory(req, res) {
    try {
      const categoryId = req.query.ca_id;
      const itKind = req.query.it_kind || null;
      const page = Number(req.query.page || 1);
      const pageSize = Number(req.query.pageSize || 20);
      const rows = await productRepository.findByCategory(categoryId, itKind, page, pageSize);
      const products = rows.map((r) => this.toProductDto(r));

      return res.json({
        success: true,
        data: products,
        total: products.length,
        page,
        pageSize
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `상품 목록 조회 실패: ${error.message}`,
        data: []
      });
    }
  }

  async getProductDetail(req, res) {
    try {
      if (req.query.id != null && String(req.query.id).trim() !== '') {
        await reviewRepository.refreshItemReviewAggregates(req.query.id);
      }
      const row = await productRepository.findById(req.query.id);
      if (!row) {
        return res.json({ success: false, message: '상품을 찾을 수 없습니다' });
      }
      
      // bomiora_shop_item_new 테이블에서 가져온 원본 데이터 로그 출력
      const itIdStr = this.bufferToString(row.it_id);
      const itKindStr = this.bufferToString(row.it_kind);
      
      console.log('📦 [상품 상세 조회] bomiora_shop_item_new 테이블 원본 데이터:');
      console.log('  - it_id (원본):', row.it_id);
      console.log('  - it_id (문자열):', itIdStr);
      console.log('  - it_kind (원본):', row.it_kind);
      console.log('  - it_kind (문자열):', itKindStr);
      
      return res.json({ success: true, data: this.toProductDto(row) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `상품 상세 조회 실패: ${error.message}` });
    }
  }

  async getPopularProducts(req, res) {
    try {
      const limit = Number(req.query.limit || 10);
      const rows = await productRepository.findBestProducts(limit);
      return res.json({ success: true, data: rows.map((r) => this.toProductDto(r)) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `인기 상품 조회 실패: ${error.message}`, data: [] });
    }
  }

  async getNewProducts(req, res) {
    try {
      const limit = Number(req.query.limit || 10);
      const rows = await productRepository.findNewProducts(limit);
      return res.json({ success: true, data: rows.map((r) => this.toProductDto(r)) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `신상품 조회 실패: ${error.message}`, data: [] });
    }
  }

  async getProductOptions(req, res) {
    try {
      const rows = await productOptionRepository.findByProductId(req.params.productId);
      return res.json({
        success: true,
        data: rows.map((r) => this.toOptionDto(r)),
        message: '옵션 목록 조회 성공'
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: `옵션 목록 조회 실패: ${error.message}` });
    }
  }
}

module.exports = new ProductController();
