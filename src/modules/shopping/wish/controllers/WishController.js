const wishRepository = require('../repositories/WishRepository');

class WishController {
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

      await wishRepository.insertWish({ mbId, itId, wiIp: req.ip });
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
      const itIds = [...new Set(wishes.map((w) => w.it_id).filter(Boolean))];
      const products = await wishRepository.findProductsByIds(itIds);
      const map = {};
      products.forEach((p) => {
        map[p.it_id] = p;
      });

      const data = wishes
        .map((w) => {
          const p = map[w.it_id];
          const row = {
            wi_id: w.wi_id,
            it_id: w.it_id,
            wi_time: w.wi_time
          };
          if (p) {
            row.product_name = p.it_name;
            row.product_price = p.it_price;
            row.product_kind = p.it_kind;
            row.image_url = this.toImage(p);
            row.it_img = this.toImage(p);
            row.it_img1 = this.toImage(p);
          }
          return row;
        })
        .filter((w) => {
          if (category === 'all') return true;
          if (category === 'prescription') return w.product_kind === 'prescription';
          if (category === 'product') return w.product_kind === 'general';
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
