const pool = require('../../../../config/database');

const MAX_PRODUCTS = 4;
/** 상품 상세 / 바텀시트 추천 최대 개수 */
const DETAIL_MAX_PRODUCTS = 3;

function bufferToString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data).toString('utf8');
  }
  return String(value);
}

function getProductCategory(productName) {
  const name = String(productName || '');
  if (name.includes('체험분') || name.includes('체험')) {
    if (name.includes('디톡스환')) return 'detox_trial';
    if (name.includes('다이어트환')) return 'diet_trial';
  }
  if (name.includes('디톡스환')) return 'detox_full';
  if (name.includes('다이어트환')) return 'diet_full';
  return 'general';
}

function analyzeCartCategory(cartList) {
  for (const item of cartList) {
    const category = getProductCategory(item.it_name);
    if (category === 'diet_full' || category === 'diet_trial') return 'diet';
    if (category === 'detox_full' || category === 'detox_trial') return 'detox';
  }
  return 'general';
}

function buildOrderClause(cartCategory) {
  if (cartCategory === 'diet') {
    return `CASE 
      WHEN it_name LIKE '%디톡스환%' AND it_name NOT LIKE '%체험%' THEN 1
      WHEN it_name LIKE '%디톡스환%' AND it_name LIKE '%체험%' THEN 2
      WHEN it_name LIKE '%다이어트환%' AND it_name LIKE '%체험%' THEN 3
      ELSE 4
    END, it_update_time DESC`;
  }
  if (cartCategory === 'detox') {
    return `CASE 
      WHEN it_name LIKE '%다이어트환%' AND it_name NOT LIKE '%체험%' THEN 1
      WHEN it_name LIKE '%다이어트환%' AND it_name LIKE '%체험%' THEN 2
      WHEN it_name LIKE '%디톡스환%' AND it_name LIKE '%체험%' THEN 3
      ELSE 4
    END, it_update_time DESC`;
  }
  return 'it_update_time DESC';
}

function isEmptyRelated(value) {
  const s = bufferToString(value).trim();
  return !s || s === '0';
}

function isTrialProductName(name) {
  const n = String(name || '');
  return n.includes('체험분') || n.includes('체험');
}

function uniqueItIds(ids) {
  return [...new Set(ids.map((id) => bufferToString(id).trim()).filter(Boolean))];
}

class CartRecommendService {
  async findProductsByItIds(itIds) {
    if (!itIds.length) return [];
    const placeholders = itIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT it_id, it_name, it_mb_inf, it_related_products,
              ca_id, it_kind, it_type5
       FROM bomiora_shop_item_new
       WHERE it_id IN (${placeholders})`,
      itIds
    );
    return rows;
  }

  async countInfluencerProducts(influencerId, excludeItIds) {
    const params = [influencerId];
    let excludeSql = '';
    if (excludeItIds.length) {
      excludeSql = ` AND it_id NOT IN (${excludeItIds.map(() => '?').join(', ')})`;
      params.push(...excludeItIds);
    }
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM bomiora_shop_item_new
       WHERE it_mb_inf = ?
         AND it_stock_qty > 0
         AND it_use = '1'
         ${excludeSql}`,
      params
    );
    return Number(rows[0]?.cnt || 0);
  }

  async queryInfluencerRecommendRows(sql, params) {
    const [rows] = await pool.query(sql, params);
    return rows;
  }

  async countAllMdPickProducts() {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM bomiora_shop_item_new
       WHERE it_use = '1'
         AND (it_soldout IS NULL OR it_soldout != '1')
         AND (it_mb_inf = '' OR it_mb_inf IS NULL OR it_mb_inf = '0')
         AND it_type5 = 1`
    );
    return Number(rows[0]?.cnt || 0);
  }

  async countOwnedMdPickInList(itIds) {
    const ids = uniqueItIds(itIds);
    if (!ids.length) return 0;
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM bomiora_shop_item_new
       WHERE it_use = '1'
         AND (it_soldout IS NULL OR it_soldout != '1')
         AND (it_mb_inf = '' OR it_mb_inf IS NULL OR it_mb_inf = '0')
         AND it_type5 = 1
         AND it_id IN (${placeholders})`,
      ids
    );
    return Number(rows[0]?.cnt || 0);
  }

  async countOwnedInfluencerProducts(influencerId, itIds) {
    const ids = uniqueItIds(itIds);
    if (!influencerId || !ids.length) return 0;
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM bomiora_shop_item_new
       WHERE it_mb_inf = ?
         AND it_stock_qty > 0
         AND it_use = '1'
         AND it_id IN (${placeholders})`,
      [influencerId, ...ids]
    );
    return Number(rows[0]?.cnt || 0);
  }

  async findInfluencerOtherProducts(influencerId, excludeItIds, limit, orderClause) {
    const ids = uniqueItIds(excludeItIds);
    if (!influencerId || limit <= 0) return [];
    const excludeSql = ids.length
      ? ` AND it_id NOT IN (${ids.map(() => '?').join(', ')})`
      : '';
    const params = ids.length ? [influencerId, ...ids] : [influencerId];
    const [rows] = await pool.query(
      `SELECT *
       FROM bomiora_shop_item_new
       WHERE it_mb_inf = ?
         AND it_stock_qty > 0
         AND it_use = '1'
         AND it_name NOT LIKE '%체험%'
         ${excludeSql}
       ORDER BY ${orderClause}
       LIMIT ${Number(limit)}`,
      params
    );
    return rows;
  }

  async findTrialProducts(influencerId, excludeItIds, limit, orderClause) {
    const ids = uniqueItIds(excludeItIds);
    if (limit <= 0) return [];
    const excludeSql = ids.length
      ? ` AND it_id NOT IN (${ids.map(() => '?').join(', ')})`
      : '';
    const params = [];
    let whereSql = `it_stock_qty > 0
         AND it_use = '1'
         AND (it_name LIKE '%체험분%' OR it_name LIKE '%체험%')`;

    if (influencerId) {
      whereSql += ' AND it_mb_inf = ?';
      params.push(influencerId);
    }
    if (ids.length) params.push(...ids);

    const [rows] = await pool.query(
      `SELECT *
       FROM bomiora_shop_item_new
       WHERE ${whereSql}
         ${excludeSql}
       ORDER BY CASE WHEN it_name LIKE '%체험분%' THEN 0 ELSE 1 END, ${orderClause}
       LIMIT ${Number(limit)}`,
      params
    );
    return rows;
  }

  async findMdPickProducts(limit, excludeItIds) {
    const params = [];
    let excludeSql = '';
    if (excludeItIds.length) {
      excludeSql = ` AND it_id NOT IN (${excludeItIds.map(() => '?').join(', ')})`;
      params.push(...excludeItIds);
    }
    params.push(Number(limit));
    const [rows] = await pool.query(
      `SELECT *
       FROM bomiora_shop_item_new
       WHERE it_use = '1'
         AND (it_soldout IS NULL OR it_soldout != '1')
         AND (it_mb_inf = '' OR it_mb_inf IS NULL)
         AND it_type5 = 1
         AND ca_id NOT LIKE 'a0%'
         ${excludeSql}
       ORDER BY it_order ASC, it_id DESC
       LIMIT ?`,
      params
    );
    return rows;
  }

  /**
   * PHP `get_influencer_recommend_products($cart_list)` 포팅
   * @param {Array<{it_id:string,it_name?:string}>} cartList ct_time ASC 순서 권장
   */
  async getRecommendProducts(cartList) {
    if (!Array.isArray(cartList) || cartList.length === 0) return [];

    const cartItIds = cartList
      .map((item) => bufferToString(item.it_id).trim())
      .filter(Boolean);

    if (!cartItIds.length) return [];

    const productRows = await this.findProductsByItIds(cartItIds);
    const productById = {};
    for (const row of productRows) {
      productById[bufferToString(row.it_id).trim()] = row;
    }

    const cartInfluencerOrder = [];
    for (const cartItem of cartList) {
      const itId = bufferToString(cartItem.it_id).trim();
      const row = productById[itId];
      const infId = bufferToString(row?.it_mb_inf).trim();
      if (infId && !cartInfluencerOrder.includes(infId)) {
        cartInfluencerOrder.push(infId);
      }
    }

    const influencerProducts = {};
    let remainingSlots = MAX_PRODUCTS;
    let currentSlot = 1;
    const cartCategory = analyzeCartCategory(cartList);
    const orderClause = buildOrderClause(cartCategory);

    if (remainingSlots > 0 && cartInfluencerOrder.length > 0) {
      const influencerAvailableProducts = {};
      for (const influencerId of cartInfluencerOrder) {
        const totalInfProducts = await this.countInfluencerProducts(influencerId, []);
        let cartInfProducts = 0;
        for (const itId of cartItIds) {
          const row = productById[itId];
          if (bufferToString(row?.it_mb_inf).trim() === influencerId) {
            cartInfProducts += 1;
          }
        }
        const available = totalInfProducts - cartInfProducts;
        if (available > 0) {
          influencerAvailableProducts[influencerId] = available;
        }
      }

      const reversedInfluencerOrder = [...cartInfluencerOrder].reverse();

      for (let index = 0; index < reversedInfluencerOrder.length; index += 1) {
        if (remainingSlots <= 0) break;

        const influencerId = reversedInfluencerOrder[index];
        if (influencerAvailableProducts[influencerId] == null) continue;

        let slotsForThisInfluencer = 1;
        let firstProduct = null;
        let relatedIds = [];
        let hasRelatedProducts = false;

        const cartProductsWithRelated = [];
        for (const itId of cartItIds) {
          const row = productById[itId];
          if (bufferToString(row?.it_mb_inf).trim() !== influencerId) continue;
          if (!isEmptyRelated(row?.it_related_products)) {
            cartProductsWithRelated.push(row);
          }
        }

        if (cartProductsWithRelated.length > 0) {
          firstProduct = cartProductsWithRelated[0];
          hasRelatedProducts = true;
        } else {
          const excludePlaceholders = cartItIds.map(() => '?').join(', ');
          const [rows] = await pool.query(
            `SELECT it_id, it_related_products
             FROM bomiora_shop_item_new
             WHERE it_mb_inf = ?
               AND it_stock_qty > 0
               AND it_use = '1'
               AND it_id NOT IN (${excludePlaceholders})
               AND (it_related_products IS NULL OR it_related_products = '' OR it_related_products = '0')
             ORDER BY it_update_time DESC
             LIMIT 1`,
            [influencerId, ...cartItIds]
          );
          firstProduct = rows[0] || null;
          hasRelatedProducts = false;
        }

        if (!firstProduct) continue;

        let relatedProductsCount = 0;
        if (hasRelatedProducts) {
          relatedIds = bufferToString(firstProduct.it_related_products)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          for (const relatedId of relatedIds) {
            if (!cartItIds.includes(relatedId)) {
              relatedProductsCount += 1;
            }
          }
          if (relatedProductsCount > 0) {
            slotsForThisInfluencer = Math.min(relatedProductsCount + 1, 3);
          }
        }

        if (slotsForThisInfluencer <= 0) continue;

        const excludePlaceholders = cartItIds.map(() => '?').join(', ');
        let infRows = [];

        if (hasRelatedProducts && relatedProductsCount > 0) {
          const relatedPlaceholders = relatedIds.map(() => '?').join(', ');
          const firstId = bufferToString(firstProduct.it_id).trim();
          infRows = await this.queryInfluencerRecommendRows(
            `SELECT *
             FROM bomiora_shop_item_new
             WHERE it_mb_inf = ?
               AND it_stock_qty > 0
               AND it_use = '1'
               AND it_id NOT IN (${excludePlaceholders})
               AND (it_id = ? OR it_id IN (${relatedPlaceholders}))
             ORDER BY FIELD(it_id, ?) DESC, ${orderClause}
             LIMIT ${Number(slotsForThisInfluencer)}`,
            [influencerId, ...cartItIds, firstId, ...relatedIds, firstId]
          );
        } else {
          infRows = await this.queryInfluencerRecommendRows(
            `SELECT *
             FROM bomiora_shop_item_new
             WHERE it_mb_inf = ?
               AND it_stock_qty > 0
               AND it_use = '1'
               AND (it_related_products IS NULL OR it_related_products = '' OR it_related_products = '0')
               AND it_id NOT IN (${excludePlaceholders})
             ORDER BY ${orderClause}
             LIMIT 1`,
            [influencerId, ...cartItIds]
          );
        }

        let addedCount = 0;
        for (const infRow of infRows) {
          const pid = bufferToString(infRow.it_id).trim();
          if (!pid || influencerProducts[pid] || addedCount >= slotsForThisInfluencer) continue;
          influencerProducts[pid] = {
            row: infRow,
            sort_order: currentSlot,
            is_md_product: false
          };
          addedCount += 1;
          currentSlot += 1;
          remainingSlots -= 1;
        }
      }
    }

    if (remainingSlots > 0) {
      const mdRows = await this.findMdPickProducts(remainingSlots, cartItIds);
      for (const mdRow of mdRows) {
        const pid = bufferToString(mdRow.it_id).trim();
        if (!pid || influencerProducts[pid]) continue;
        influencerProducts[pid] = {
          row: mdRow,
          sort_order: currentSlot,
          is_md_product: true
        };
        currentSlot += 1;
        remainingSlots -= 1;
      }
    }

    return Object.values(influencerProducts)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((entry) => ({
        ...entry.row,
        is_md_product: entry.is_md_product
      }));
  }

  /**
   * 추천 슬롯용 1건 조회 — ORDER BY it_order ASC, it_id DESC
   */
  async findFirstRecommendCandidate({
    excludeItIds = [],
    itKind = null,
    caPrefix = null,
    caExact = null,
    trialOnly = false,
    trialKind = null,
    excludeTrial = false,
    proteinShake = false,
    mdPick = false,
    influencerId = null,
    nonInfluencerOnly = false
  }) {
    const params = [];
    let where = `it_use = '1'
      AND (it_soldout IS NULL OR it_soldout != '1')
      AND it_stock_qty > 0`;

    const ids = uniqueItIds(excludeItIds);
    if (ids.length) {
      where += ` AND it_id NOT IN (${ids.map(() => '?').join(', ')})`;
      params.push(...ids);
    }

    if (itKind) {
      where += ' AND it_kind = ?';
      params.push(itKind);
    }

    if (caExact) {
      where += ' AND ca_id = ?';
      params.push(caExact);
    } else if (caPrefix) {
      where += ' AND ca_id LIKE ?';
      params.push(`${caPrefix}%`);
    }

    if (trialOnly) {
      where += ` AND (it_name LIKE '%체험분%' OR it_name LIKE '%체험%')`;
      if (trialKind === 'diet') {
        where += ` AND (it_name LIKE '%다이어트%' OR ca_id LIKE '10%' OR ca_id LIKE '11%')`;
      } else if (trialKind === 'detox') {
        where += ` AND (it_name LIKE '%디톡스%' OR ca_id LIKE '20%' OR ca_id LIKE '21%')`;
      }
    } else if (excludeTrial) {
      where += ` AND it_name NOT LIKE '%체험%' AND it_name NOT LIKE '%체험분%'`;
    }

    if (proteinShake) {
      // 레거시 플래그 — 카테고리 a0 만 (이름 매칭으로 다른 상품 끼어들지 않음)
      where += ` AND ca_id LIKE 'a0%'`;
    }

    if (mdPick) {
      // 홈 MD's Pick과 동일: 단백질 카테고리(a0) 제외
      where += ` AND it_type5 = 1
        AND (it_mb_inf = '' OR it_mb_inf IS NULL OR it_mb_inf = '0')
        AND ca_id NOT LIKE 'a0%'`;
    }

    if (influencerId) {
      where += ' AND it_mb_inf = ?';
      params.push(influencerId);
    } else if (nonInfluencerOnly) {
      where += ` AND (it_mb_inf = '' OR it_mb_inf IS NULL OR it_mb_inf = '0')`;
    }

    const [rows] = await pool.query(
      `SELECT *
       FROM bomiora_shop_item_new
       WHERE ${where}
       ORDER BY it_order ASC, it_id DESC
       LIMIT 1`,
      params
    );
    return rows[0] || null;
  }

  /**
   * 현재/장바구니 상품이 속한 추천 슬롯
   * 우선순위: 체험(다이어트/디톡스) → 단백질쉐이크 → 심신안정 → 디톡스본품 → 다이어트본품 → MD픽
   */
  resolveDetailRecommendSlot(product) {
    if (!product) return null;
    const name = bufferToString(product.it_name).replace(/\s/g, '');
    const ca = bufferToString(product.ca_id).trim().toLowerCase();
    const type5 = Number(product.it_type5);
    const isTrial = name.includes('체험분') || name.includes('체험');

    if (isTrial) {
      if (
        name.includes('디톡스') ||
        ca.startsWith('20') ||
        ca.startsWith('21')
      ) {
        return 'detoxTrial';
      }
      if (
        name.includes('다이어트') ||
        ca.startsWith('10') ||
        ca.startsWith('11')
      ) {
        return 'dietTrial';
      }
      // 체험분이지만 이름/카테고리 불명 → 다이어트 체험으로 취급하지 않고 null
      return null;
    }
    if (
      ca === 'a0' ||
      ca.startsWith('a0') ||
      name.includes('단백질') ||
      name.includes('쉐이크') ||
      name.includes('셰이크')
    ) {
      return 'proteinShake';
    }
    if (ca.startsWith('80') || name.includes('심신안정')) return 'calm';
    if (ca.startsWith('20') || ca.startsWith('21') || name.includes('디톡스')) {
      return 'detox';
    }
    if (ca.startsWith('10') || ca.startsWith('11') || name.includes('다이어트')) {
      return 'diet';
    }
    if (type5 === 1) return 'mdPick';
    return null;
  }

  /**
   * 추천 슬롯 우선순위.
   * 기본: 다 → 디 → 다체험 → 디체험 → 단백질 → 심신 → MD
   * 호출측에서 skipSlots(보유 슬롯)를 제외하고 최대 3컷.
   *
   * 예외(기본 순서를 깨는 경우만):
   *  1) 일반 상세 + 비대면 없음 + 단백질 없음 → 단백질 우선
   *  2) 다+디 보유 + 현재가 다 계열이 아님 → 디체험 ↔ 다체험 교체
   *  3) 다+단백질 보유(디 없음) → 디체험 ↔ 다체험 교체
   * (인프/101 경로는 getProductDetailRecommendProducts에서 별도 처리)
   */
  buildPrescriptionRecommendSlotOrder(
    skipSlots,
    currentSlot = null,
    { proteinFirstIfEmpty = false } = {}
  ) {
    const has = (s) => skipSlots.has(s);
    const hasDiet = has('diet');
    const hasDetox = has('detox');
    const hasProtein = has('proteinShake');
    const hasAnyRx =
      hasDiet ||
      hasDetox ||
      has('dietTrial') ||
      has('detoxTrial') ||
      has('calm');

    const BASE = [
      'diet',
      'detox',
      'dietTrial',
      'detoxTrial',
      'proteinShake',
      'calm',
      'mdPick'
    ];

    // 예외 1: 일반 상세 + 비대면 없음 + 단백질 없음 → 단백질 우선
    if (!hasAnyRx && !hasProtein && proteinFirstIfEmpty) {
      return [
        'proteinShake',
        'diet',
        'detox',
        'dietTrial',
        'detoxTrial',
        'calm',
        'mdPick'
      ];
    }

    let order = [...BASE];

    const swapTrials = (arr) => {
      const i1 = arr.indexOf('dietTrial');
      const i2 = arr.indexOf('detoxTrial');
      if (i1 < 0 || i2 < 0) return arr;
      const next = [...arr];
      next[i1] = 'detoxTrial';
      next[i2] = 'dietTrial';
      return next;
    };

    // 예외 2: 다+디 → 현재가 다 계열이 아니면 디체험 우선
    if (hasDiet && hasDetox) {
      const dietFamily =
        currentSlot === 'diet' || currentSlot === 'dietTrial';
      if (!dietFamily) order = swapTrials(order);
    } else if (hasDiet && hasProtein && !hasDetox) {
      // 예외 3: 다+단백질(디 없음) → 디체험 우선
      order = swapTrials(order);
    }

    return order;
  }

  /** 상품 1건 → 추천 스킵 슬롯 Set에 추가 */
  addRecommendSkipSlotsFromProduct(product, skipSlots) {
    if (!product || !skipSlots) return;
    const slot = this.resolveDetailRecommendSlot(product);
    if (slot) skipSlots.add(slot);

    // resolve 실패/누락 보강 (단백질 a0, ca 본품 등)
    const ca = bufferToString(product.ca_id).trim().toLowerCase();
    const name = bufferToString(product.it_name);
    const isTrial = name.includes('체험분') || name.includes('체험');
    if (ca === 'a0' || ca.startsWith('a0')) skipSlots.add('proteinShake');
    if (ca.startsWith('10') && !isTrial) skipSlots.add('diet');
    if (ca.startsWith('20') && !isTrial) skipSlots.add('detox');
    if (ca.startsWith('80')) skipSlots.add('calm');
  }

  prescriptionSlotQuery(slotId) {
    switch (slotId) {
      case 'diet':
        return {
          itKind: 'prescription',
          caPrefix: '10',
          excludeTrial: true,
          nonInfluencerOnly: true
        };
      case 'detox':
        return {
          itKind: 'prescription',
          caPrefix: '20',
          excludeTrial: true,
          nonInfluencerOnly: true
        };
      case 'dietTrial':
        return {
          trialOnly: true,
          trialKind: 'diet',
          nonInfluencerOnly: true
        };
      case 'detoxTrial':
        return {
          trialOnly: true,
          trialKind: 'detox',
          nonInfluencerOnly: true
        };
      case 'proteinShake':
        // 다이어트(ca 10)와 동일: 단백질 카테고리(a0)에서 it_order 맨 앞 1건만
        return {
          caPrefix: 'a0',
          excludeTrial: true,
          nonInfluencerOnly: true
        };
      case 'calm':
        return {
          itKind: 'prescription',
          caPrefix: '80',
          excludeTrial: true,
          nonInfluencerOnly: true
        };
      case 'mdPick':
        return { mdPick: true };
      default:
        return null;
    }
  }

  /**
   * 상품 상세 하단 추천 (최대 3)
   *
   * 【ID 제외】현재 상품 + 장바구니 → 전 경로 공통
   * 【슬롯 스킵】
   *   1) 장바구니 카테고리
   *   2) 장바구니가 비어 있지 않으면 + 지금 보는 상품 카테고리
   *
   * 【순서】기본 다→디→다체험→디체험→단백질→심신→MD + 보유 슬롯 스킵
   *   예외: 일반 단백질 우선 / 다+디 체험 선후 / 다+단백질 체험 선후
   *   인프: 인프 상품 + 채움 / influencer_101: MD만
   *
   * @param {string} currentItId 상세 상품
   * @param {string[]} cartItIds 장바구니 it_id만
   */
  async getProductDetailRecommendProducts(currentItId, cartItIds = []) {
    const currentId = bufferToString(currentItId).trim();
    if (!currentId) return [];

    const cartIds = uniqueItIds(cartItIds);
    const excludedProductIds = uniqueItIds([currentId, ...cartIds]);
    const ownedRows = await this.findProductsByItIds(excludedProductIds);
    const productById = new Map(
      ownedRows.map((r) => [bufferToString(r.it_id).trim(), r])
    );
    const current = productById.get(currentId) || null;
    if (!current) return [];

    const currentSlot = this.resolveDetailRecommendSlot(current);

    // 슬롯 스킵: 장바구니 + (장바구니 있을 때) 현재 상품
    const skipSlots = new Set();
    for (const cartId of cartIds) {
      this.addRecommendSkipSlotsFromProduct(productById.get(cartId), skipSlots);
    }
    if (cartIds.length > 0 && current) {
      this.addRecommendSkipSlotsFromProduct(current, skipSlots);
    }

    const maxItems = DETAIL_MAX_PRODUCTS;
    const results = [];
    const blockedIds = new Set(excludedProductIds);

    const pushRow = (row, isMdProduct = false, { ignoreMax = false } = {}) => {
      if (!row) return false;
      if (!ignoreMax && results.length >= maxItems) return false;
      const pid = bufferToString(row.it_id).trim();
      if (!pid || blockedIds.has(pid)) return false;
      blockedIds.add(pid);
      results.push({ ...row, is_md_product: isMdProduct });
      return true;
    };

    const excludeNow = () => [...blockedIds];
    const shouldSkip = (slotId) => skipSlots.has(slotId);
    const notExcluded = (r) =>
      !excludedProductIds.includes(bufferToString(r.it_id).trim());

    // 인프: 현재 + 장바구니 인프 (101 제외)
    const influencerOrder = this.buildOwnedInfluencerOrder({
      currentId,
      ownedItIdsOrdered: excludedProductIds,
      productById
    });

    if (influencerOrder.length > 0) {
      await this.appendInfluencerDetailRecommends({
        influencerOrder,
        pushRow,
        excludeNow,
        shouldSkip
      });
      return results.filter(notExcluded);
    }

    const currentInf = bufferToString(current.it_mb_inf).trim();
    if (currentInf === 'influencer_101') {
      const mdRows = await this.findMdPickProducts(maxItems, excludeNow());
      for (const row of mdRows) {
        pushRow(row, true);
      }
      return results.filter(notExcluded);
    }

    const isGeneral =
      bufferToString(current.it_kind).trim().toLowerCase() === 'general';
    const slotOrder = this.buildPrescriptionRecommendSlotOrder(
      skipSlots,
      currentSlot,
      { proteinFirstIfEmpty: isGeneral }
    );
    for (const slotId of slotOrder) {
      if (results.length >= maxItems) break;
      if (shouldSkip(slotId)) continue;
      const query = this.prescriptionSlotQuery(slotId);
      if (!query) continue;
      pushRow(
        await this.findFirstRecommendCandidate({
          excludeItIds: excludeNow(),
          ...query
        }),
        Boolean(query.mdPick)
      );
    }

    return results.filter(notExcluded);
  }

  /**
   * 보유 상품 기준 인플루언서 순서 (최근 본/담은 순, influencer_101 제외)
   * ownedItIdsOrdered: [현재, ...장바구니 ct_time ASC]
   */
  buildOwnedInfluencerOrder({ currentId, ownedItIdsOrdered, productById }) {
    const HIDE = 'influencer_101';
    const order = [];
    const seen = new Set();

    const pushInf = (raw) => {
      const id = bufferToString(raw).trim();
      if (!id || id === '0' || id === HIDE || seen.has(id)) return;
      seen.add(id);
      order.push(id);
    };

    const current = productById.get(currentId);
    if (current) pushInf(current.it_mb_inf);

    // 장바구니 ASC의 역순 = 최근에 담긴 인플루언서 우선
    const rest = ownedItIdsOrdered.filter((id) => id !== currentId);
    for (let i = rest.length - 1; i >= 0; i -= 1) {
      const row = productById.get(rest[i]);
      if (row) pushInf(row.it_mb_inf);
    }

    return order;
  }

  /**
   * 인플루언서 상세 추천 본문
   * fill:
   *   · 1명 + 진행수 2개 이하 → 다체험 → 디체험 → 단백질 → 심신 → MD
   *   · 1명 + 진행수 3개 이상 → 다체험 → 디체험 → MD
   *   · 2명 이상 + 한 명이라도 3개 이상 → 다체험 → 디체험 → MD
   *   · 2명 이상 + 모두 2개 이하 → 다체험 → 디체험 → 단백질 → 심신 → MD
   */
  async appendInfluencerDetailRecommends({
    influencerOrder,
    pushRow,
    excludeNow,
    shouldSkip
  }) {
    const counts = {};
    for (const infId of influencerOrder) {
      counts[infId] = await this.countInfluencerProducts(infId, []);
    }
    const anyHasThreeOrMore = influencerOrder.some(
      (id) => (counts[id] || 0) >= 3
    );

    for (const infId of influencerOrder) {
      const rows = await this.findInfluencerOtherProducts(
        infId,
        excludeNow(),
        50,
        'it_order ASC, it_id DESC'
      );
      for (const row of rows) {
        pushRow(row, false, { ignoreMax: true });
      }
    }

    let fillSlots;
    if (influencerOrder.length <= 1) {
      const cnt = counts[influencerOrder[0]] || 0;
      fillSlots =
        cnt >= 3
          ? ['dietTrial', 'detoxTrial', 'mdPick']
          : ['dietTrial', 'detoxTrial', 'proteinShake', 'calm', 'mdPick'];
    } else if (anyHasThreeOrMore) {
      fillSlots = ['dietTrial', 'detoxTrial', 'mdPick'];
    } else {
      fillSlots = ['dietTrial', 'detoxTrial', 'proteinShake', 'calm', 'mdPick'];
    }

    for (const slotId of fillSlots) {
      if (shouldSkip(slotId)) continue;
      const query = this.prescriptionSlotQuery(slotId);
      if (!query) continue;
      pushRow(
        await this.findFirstRecommendCandidate({
          excludeItIds: excludeNow(),
          ...query
        }),
        Boolean(query.mdPick),
        { ignoreMax: true }
      );
    }
  }
}

module.exports = new CartRecommendService();
