const recentViewRepository = require('../repositories/RecentViewRepository');

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

  toImage(product) {
    if (product.it_flutter_image_url && String(product.it_flutter_image_url).trim()) {
      const folder = String(product.it_flutter_image_url).trim().replace(/\/+$/, '');
      return `${folder}/${product.it_id}_list.jpg`;
    }
    if (!product.it_img1) return null;
    const v = String(product.it_img1);
    return v.startsWith('/') || v.startsWith('http') ? v : `/${v}`;
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
      await recentViewRepository.pruneOldForMember(mbId);

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
      const views = await recentViewRepository.findByMbIdOrderByTimeDesc(mbId, limit);
      const itIds = [
        ...new Set(
          views
            .map((v) => this.bufferToString(v.it_id || '').trim())
            .filter((id) => id.length > 0)
        ),
      ];
      const products = await recentViewRepository.findProductsByIds(itIds);
      const map = {};
      for (const p of products) {
        const pid = this.bufferToString(p.it_id || '').trim();
        if (pid) map[pid] = p;
      }

      const data = views
        .map((v) => {
          const itIdKey = this.bufferToString(v.it_id || '').trim() || v.it_id;
          const p = map[itIdKey] || map[v.it_id];
          const kindFromView = this.bufferToString(v.it_kind || '').trim();
          const kindFromProduct = p ? this.bufferToString(p.it_kind || '').trim() : '';
          const productKind = kindFromView || kindFromProduct || '';

          const row = {
            rv_id: v.rv_id,
            it_id: itIdKey,
            rv_time: v.rv_time,
          };
          if (kindFromView) {
            row.it_kind = kindFromView;
          }
          if (productKind) {
            row.product_kind = productKind;
            row.it_kind = productKind;
          }
          if (p) {
            row.product_name = p.it_name;
            row.product_price = p.it_price;
            if (!productKind) {
              row.product_kind = this.bufferToString(p.it_kind || '').trim() || null;
              row.it_kind = row.product_kind;
            }
            row.image_url = this.toImage(p);
            row.it_img = this.toImage(p);
            row.it_img1 = this.toImage(p);
            row.it_basic = p.it_basic;
          }
          return row;
        })
        .filter((row) => row.product_name || row.it_id);

      return res.json({ success: true, data, count: data.length });
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
