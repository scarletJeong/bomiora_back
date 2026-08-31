const recentViewRepository = require('../repositories/RecentViewRepository');
const { TtlCache } = require('../../../../utils/ttlCache');

const recentListCache = new TtlCache(90_000);

class RecentViewController {
  bufferToString(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
      return Buffer.from(value.data).toString('utf8');
    }
    return String(value);
  }

  toNumber(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const n = Number(String(this.bufferToString(value)).replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  toImage(product) {
    if (product.it_flutter_image_url && String(product.it_flutter_image_url).trim()) {
      const folder = String(product.it_flutter_image_url).trim().replace(/\/+$/, '');
      return `${folder}/${product.it_id}_list.jpg`;
    }
    if (!product.it_img1) return null;
    const v = String(product.it_img1);
    return v.startsWith('/') || v.startsWith('http') ? v : `/${v}`;
  }

  invalidateList(mbId) {
    const id = String(mbId || '').trim();
    if (!id) return;
    for (const key of recentListCache.store.keys()) {
      if (key.startsWith(`list:${id}:`)) recentListCache.store.delete(key);
    }
  }

  resolveItKind(req, itId) {
    const explicit = String(
      req.body.it_kind || req.body.item_kind || req.body.product_kind || ''
    )
      .trim()
      .toLowerCase();
    if (explicit === 'prescription' || explicit === 'general') {
      return explicit;
    }
    return '';
  }

  /** POST /api/recent-view/record */
  async recordView(req, res) {
    try {
      const mbId = req.body.mb_id;
      const itId = req.body.it_id;
      if (!mbId || !itId) {
        return res.status(400).json({
          success: false,
          message: 'mb_id와 it_id가 필요합니다.',
        });
      }

      let itKind = this.resolveItKind(req, itId);
      if (!itKind) {
        try {
          const pRow = await recentViewRepository.findProductKindByItId(itId);
          if (pRow) {
            const k = this.bufferToString(pRow.it_kind || '').trim().toLowerCase();
            if (k === 'prescription') itKind = 'prescription';
            else if (k === 'general') itKind = 'general';
            else itKind = k || 'general';
          } else {
            itKind = 'general';
          }
        } catch (_) {
          itKind = 'general';
        }
      }

      await recentViewRepository.upsertRecentView({
        mbId,
        itId,
        itKind,
        rvIp: req.ip,
      });
      this.invalidateList(mbId);
      recentViewRepository.pruneOldForMember(mbId).catch(() => {});

      return res.json({
        success: true,
        message: '최근 본 상품이 기록되었습니다.',
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '최근 본 상품 기록 중 오류가 발생했습니다.',
      });
    }
  }

  /** POST /api/recent-view/sync — 로그인 전 로컬 기록 일괄 반영 */
  async syncViews(req, res) {
    try {
      const mbId = String(req.body.mb_id || '').trim();
      const items = Array.isArray(req.body.items) ? req.body.items : [];
      if (!mbId) {
        return res.status(400).json({
          success: false,
          message: 'mb_id가 필요합니다.',
        });
      }
      const affected = await recentViewRepository.upsertRecentViews(
        mbId,
        items,
        req.ip
      );
      this.invalidateList(mbId);
      recentViewRepository.pruneOldForMember(mbId).catch(() => {});
      return res.json({ success: true, affected });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '최근 본 상품 동기화 중 오류가 발생했습니다.',
      });
    }
  }

  /** GET /api/recent-view/list?mb_id=&limit=4 */
  async getRecentList(req, res) {
    try {
      const mbId = req.query.mb_id;
      if (!mbId) {
        return res.status(400).json({
          success: false,
          message: 'mb_id가 필요합니다.',
        });
      }

      const limit = Number(req.query.limit) || 4;
      const payload = await recentListCache.getOrSet(
        `list:${mbId}:${limit}`,
        async () => {
          // JOIN 1회로 views+상품 조회 (기존 2 RTT → 1 RTT)
          const rows = await recentViewRepository.findByMbIdOrderByTimeDesc(
            mbId,
            limit
          );
          const data = rows
            .map((v) => {
              const itIdKey = this.bufferToString(v.it_id || '').trim();
              const kindFromView = this.bufferToString(v.it_kind || '').trim();
              const kindFromProduct = this.bufferToString(
                v.product_it_kind || ''
              ).trim();
              const productKind = kindFromView || kindFromProduct || '';
              const hasProduct = !!(v.it_name || v.it_img1 || v.it_flutter_image_url);

              const row = {
                rv_id: v.rv_id,
                it_id: itIdKey,
                rv_time: v.rv_time,
              };
              if (kindFromView) row.it_kind = kindFromView;
              if (productKind) {
                row.product_kind = productKind;
                row.it_kind = productKind;
              }
              if (hasProduct) {
                const salePrice = this.toNumber(v.it_price);
                const listPrice = this.toNumber(v.it_cust_price);
                row.product_name = v.it_name;
                row.it_name = v.it_name;
                row.price = salePrice;
                row.it_price = salePrice;
                row.product_price = salePrice;
                row.originalPrice = listPrice;
                row.it_cust_price = listPrice;
                row.image_url = this.toImage(v);
                row.it_img = row.image_url;
                row.it_img1 = row.image_url;
                row.it_basic = v.it_basic;
                if (v.it_subject) row.it_subject = v.it_subject;
                if (v.it_maker) row.it_maker = v.it_maker;
              }
              return row;
            })
            .filter((row) => row.product_name || row.it_id);

          return { success: true, data, count: data.length };
        }
      );

      res.set('Cache-Control', 'private, max-age=60');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '최근 본 상품 목록 조회 중 오류가 발생했습니다.',
      });
    }
  }

  /** DELETE /api/recent-view/remove */
  async removeView(req, res) {
    try {
      const mbId = req.body.mb_id;
      const itId = req.body.it_id;
      if (!mbId || !itId) {
        return res.status(400).json({
          success: false,
          message: 'mb_id와 it_id가 필요합니다.',
        });
      }
      await recentViewRepository.deleteByMbIdAndItId(mbId, itId);
      this.invalidateList(mbId);
      return res.json({ success: true, message: '최근 본 상품이 삭제되었습니다.' });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '최근 본 상품 삭제 중 오류가 발생했습니다.',
      });
    }
  }

  /** DELETE /api/recent-view/clear */
  async clearAll(req, res) {
    try {
      const mbId = req.body.mb_id || req.query.mb_id;
      if (!mbId) {
        return res.status(400).json({
          success: false,
          message: 'mb_id가 필요합니다.',
        });
      }
      const removed = await recentViewRepository.deleteAllByMbId(mbId);
      this.invalidateList(mbId);
      return res.json({
        success: true,
        removed,
        message: '최근 본 상품이 모두 삭제되었습니다.',
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '최근 본 상품 전체 삭제 중 오류가 발생했습니다.',
      });
    }
  }
}

module.exports = new RecentViewController();
