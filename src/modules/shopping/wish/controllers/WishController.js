const wishRepository = require('../repositories/WishRepository');

class WishController {
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

  async toggleWish(req, res) {
    try {
      const mbId = req.body.mb_id;
      const itId = req.body.it_id;
      if (!mbId || !itId) {
        return res.status(400).json({ success: false, message: 'mb_id와 it_id가 필요합니다.' });
      }

      const existing = await wishRepository.findByMbIdAndItId(mbId, itId);
      if (existing) {
        await wishRepository.deleteById(existing.wi_id);
        return res.json({
          success: true,
          is_wished: false,
          message: '찜하기가 제거되었습니다.'
        });
      }

      /** 찜 유형: prescription | general | content (콘텐츠는 body로 명시) */
      const explicit = String(
        req.body.wi_it_kind || req.body.item_kind || req.body.wish_kind || ''
      )
        .trim()
        .toLowerCase();
      let wiItKind = '';
      if (explicit === 'content') {
        wiItKind = 'content';
      } else if (explicit === 'prescription' || explicit === 'general') {
        wiItKind = explicit;
      } else {
        try {
          const pRow = await wishRepository.findProductKindByItId(itId);
          if (pRow) {
            const k = this.bufferToString(pRow.it_kind || '').trim().toLowerCase();
            if (k === 'prescription') wiItKind = 'prescription';
            else if (k === 'general') wiItKind = 'general';
            else wiItKind = k || 'general';
          } else {
            wiItKind = 'general';
          }
        } catch (_) {
          wiItKind = 'general';
        }
      }
      await wishRepository.insertWish({ mbId, itId, wiIp: req.ip, wiItKind });
      return res.json({
        success: true,
        is_wished: true,
        message: '찜하기가 추가되었습니다.'
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: '찜하기 처리 중 오류가 발생했습니다.' });
    }
  }

  async checkWish(req, res) {
    try {
      const isWished = await wishRepository.existsByMbIdAndItId(req.query.mb_id, req.query.it_id);
      return res.json({ success: true, is_wished: isWished });
    } catch (error) {
      return res.status(500).json({ success: false, message: '찜하기 확인 중 오류가 발생했습니다.' });
    }
  }

  async getWishList(req, res) {
    try {
      const mbId = req.query.mb_id;
      const category = req.query.category || 'all';
      const wishes = await wishRepository.findByMbIdOrderByTimeDesc(mbId);
      const itIds = [
        ...new Set(
          wishes
            .map((w) => this.bufferToString(w.it_id || '').trim())
            .filter((id) => id.length > 0)
        )
      ];
      const products = await wishRepository.findProductsByIds(itIds);
      const map = {};
      for (const p of products) {
        const pid = this.bufferToString(p.it_id || '').trim();
        if (pid) map[pid] = p;
      }

      const data = wishes
        .map((w) => {
          const itIdKey = this.bufferToString(w.it_id || '').trim() || w.it_id;
          const p = map[itIdKey] || map[w.it_id];
          const kindFromWish = this.bufferToString(w.wi_it_kind || '').trim();
          const kindFromProduct = p ? this.bufferToString(p.it_kind || '').trim() : '';
          const productKind = kindFromWish || kindFromProduct || '';

          const row = {
            wi_id: w.wi_id,
            it_id: itIdKey,
            wi_time: w.wi_time
          };
          if (kindFromWish) {
            row.wi_it_kind = kindFromWish;
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
        .filter((w) => {
          if (category === 'all') return true;
          const pk = String(w.product_kind || '').toLowerCase();
          if (category === 'prescription') return pk === 'prescription';
          if (category === 'product') return pk === 'general';
          if (category === 'content') return pk === 'content';
          return true;
        });

      return res.json({ success: true, data, count: data.length });
    } catch (error) {
      return res.status(500).json({ success: false, message: '찜목록 조회 중 오류가 발생했습니다.' });
    }
  }

  async removeWish(req, res) {
    try {
      const mbId = req.body.mb_id;
      const itId = req.body.it_id;
      if (!mbId || !itId) {
        return res.status(400).json({ success: false, message: 'mb_id와 it_id가 필요합니다.' });
      }
      await wishRepository.deleteByMbIdAndItId(mbId, itId);
      return res.json({ success: true, message: '찜하기가 삭제되었습니다.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: '찜하기 삭제 중 오류가 발생했습니다.' });
    }
  }
}

module.exports = new WishController();
