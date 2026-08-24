const wishRepository = require('../repositories/WishRepository');
const { TtlCache } = require('../../../../utils/ttlCache');

const wishListCache = new TtlCache(20_000);

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

  invalidateList(mbId) {
    if (!mbId) return;
    for (const key of wishListCache.store.keys()) {
      if (key.startsWith(`list:${mbId}`) || key.startsWith(`check:${mbId}:`)) {
        wishListCache.store.delete(key);
      }
    }
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
        this.invalidateList(mbId);
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
      await wishRepository.insertWish({
        mbId,
        itId,
        wiIp: req.ip,
        wiItKind,
        infCode: String(req.body.inf_code || req.body.infcode || req.body.in_id || '').trim()
      });
      this.invalidateList(mbId);
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
      const mbId = req.query.mb_id;
      const itId = req.query.it_id;
      const isWished = await wishListCache.getOrSet(
        `check:${mbId}:${itId}`,
        () => wishRepository.existsByMbIdAndItId(mbId, itId)
      );
      return res.json({ success: true, is_wished: isWished });
    } catch (error) {
      return res.status(500).json({ success: false, message: '찜하기 확인 중 오류가 발생했습니다.' });
    }
  }

  async getWishList(req, res) {
    try {
      const mbId = req.query.mb_id;
      const category = req.query.category || 'all';
      const payload = await wishListCache.getOrSet(`list:${mbId}:${category}`, async () => {
        const rows = await wishRepository.findListByMbId(mbId);
        const data = rows
          .map((w) => {
            const itIdKey = this.bufferToString(w.it_id || '').trim();
            const kindFromWish = this.bufferToString(w.wi_it_kind || '').trim();
            const kindFromProduct = this.bufferToString(w.it_kind || '').trim();
            const productKind = kindFromWish || kindFromProduct || '';
            const hasProduct = !!(w.it_name || w.it_img1 || w.it_flutter_image_url);

            const row = {
              wi_id: w.wi_id,
              it_id: itIdKey,
              wi_time: w.wi_time,
            };
            if (kindFromWish) row.wi_it_kind = kindFromWish;
            if (productKind) {
              row.product_kind = productKind;
              row.it_kind = productKind;
            }
            if (hasProduct) {
              row.product_name = w.it_name;
              row.product_price = w.it_price;
              if (!productKind) {
                row.product_kind = kindFromProduct || null;
                row.it_kind = row.product_kind;
              }
              const image = this.toImage(w);
              row.image_url = image;
              row.it_img = image;
              row.it_img1 = image;
              row.it_basic = w.it_basic;
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

        return { success: true, data, count: data.length };
      });
      res.set('Cache-Control', 'private, max-age=10');
      return res.json(payload);
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
      this.invalidateList(mbId);
      return res.json({ success: true, message: '찜하기가 삭제되었습니다.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: '찜하기 삭제 중 오류가 발생했습니다.' });
    }
  }
}

module.exports = new WishController();
