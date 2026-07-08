const pool = require('../../../../config/database');

const MAX_PRODUCTS = 4;

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
      `SELECT it_id, it_name, it_mb_inf, it_related_products
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
   * 상품 상세 하단 추천: 인플루언서 다른 제품 + MD픽 (최대 4)
   * - 인플루언서 제품이 모두 장바구니/현재상품에 있으면 MD픽만
   * - 인플루언서·MD픽 모두 있으면 체험분 우선
   */
  async getProductDetailRecommendProducts(currentItId, ownedItIds = []) {
    const currentId = bufferToString(currentItId).trim();
    if (!currentId) return [];

    const excludeItIds = uniqueItIds([currentId, ...ownedItIds]);
    const productRows = await this.findProductsByItIds([currentId]);
    const current = productRows[0];
    if (!current) return [];

    const influencerId = bufferToString(current.it_mb_inf).trim();
    const cartCategory = analyzeCartCategory([{ it_name: current.it_name }]);
    const orderClause = buildOrderClause(cartCategory);

    const results = [];
    const addedIds = new Set(excludeItIds);

    const tryAdd = (row, isMdProduct) => {
      const pid = bufferToString(row.it_id).trim();
      if (!pid || addedIds.has(pid) || results.length >= MAX_PRODUCTS) return false;
      addedIds.add(pid);
      results.push({ row, is_md_product: isMdProduct });
      return true;
    };

    if (!influencerId) {
      const mdRows = await this.findMdPickProducts(MAX_PRODUCTS, [...addedIds]);
      for (const row of mdRows) tryAdd(row, true);

      if (results.length < MAX_PRODUCTS) {
        const totalMd = await this.countAllMdPickProducts();
        const ownedMd = await this.countOwnedMdPickInList(excludeItIds);
        if (totalMd > 0 && ownedMd >= totalMd) {
          const trialRows = await this.findTrialProducts(
            '',
            [...addedIds],
            MAX_PRODUCTS - results.length,
            orderClause
          );
          for (const row of trialRows) tryAdd(row, false);
        }
      }

      return results.map((entry) => ({
        ...entry.row,
        is_md_product: entry.is_md_product
      }));
    }

    const totalInf = await this.countInfluencerProducts(influencerId, []);
    const ownedInf = await this.countOwnedInfluencerProducts(influencerId, excludeItIds);
    const allInfluencerOwned = totalInf > 0 && ownedInf >= totalInf;

    const totalMd = await this.countAllMdPickProducts();
    const ownedMd = await this.countOwnedMdPickInList(excludeItIds);
    const allMdOwned = totalMd > 0 && ownedMd >= totalMd;

    if (allInfluencerOwned && allMdOwned) {
      const trialRows = await this.findTrialProducts(
        influencerId,
        [...addedIds],
        MAX_PRODUCTS,
        orderClause
      );
      for (const row of trialRows) tryAdd(row, false);
    } else if (allInfluencerOwned) {
      const mdRows = await this.findMdPickProducts(MAX_PRODUCTS, [...addedIds]);
      for (const row of mdRows) tryAdd(row, true);
    } else {
      const infRows = await this.findInfluencerOtherProducts(
        influencerId,
        [...addedIds],
        MAX_PRODUCTS,
        orderClause
      );
      for (const row of infRows) {
        if (results.length >= MAX_PRODUCTS) break;
        tryAdd(row, false);
      }

      if (results.length < MAX_PRODUCTS) {
        const mdRows = await this.findMdPickProducts(
          MAX_PRODUCTS - results.length,
          [...addedIds]
        );
        for (const row of mdRows) tryAdd(row, true);
      }
    }

    return results.map((entry) => ({
      ...entry.row,
      is_md_product: entry.is_md_product
    }));
  }
}

module.exports = new CartRecommendService();
