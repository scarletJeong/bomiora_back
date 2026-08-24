const addressRepository = require('../repositories/AddressRepository');
const { TtlCache } = require('../../../../utils/ttlCache');

const addressListCache = new TtlCache(60_000);

class AddressController {
  toText(value) {
    if (value == null) return '';
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    if (typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
      return Buffer.from(value.data).toString('utf8');
    }
    return String(value);
  }

  mapAddress(row) {
    return {
      adId: row.ad_id,
      mbId: this.toText(row.mb_id),
      adSubject: this.toText(row.ad_subject),
      adDefault: Number(row.ad_default || 0),
      adName: this.toText(row.ad_name),
      adTel: this.toText(row.ad_tel),
      adHp: this.toText(row.ad_hp),
      adZip1: this.toText(row.ad_zip1),
      adZip2: this.toText(row.ad_zip2),
      adAddr1: this.toText(row.ad_addr1),
      adAddr2: this.toText(row.ad_addr2),
      adAddr3: this.toText(row.ad_addr3),
      adJibeon: this.toText(row.ad_jibeon),
      adMemo: this.toText(row.ad_memo),
    };
  }

  invalidateList(mbId) {
    if (mbId) addressListCache.store.delete(`list:${mbId}`);
  }

  async getAddressList(req, res) {
    try {
      const mbId = req.query.mbId || req.query.mb_id;
      const payload = await addressListCache.getOrSet(`list:${mbId}`, async () => {
        const addresses = await addressRepository.findByMbId(mbId);
        return {
          success: true,
          data: addresses.map((a) => this.mapAddress(a)),
        };
      });
      res.set('Cache-Control', 'private, max-age=30');
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async getAddressDetail(req, res) {
    try {
      const address = await addressRepository.findByIdAndMbId(Number(req.params.id), req.query.mbId);
      if (!address) {
        return res.status(404).json({ error: '배송지를 찾을 수 없습니다.' });
      }
      return res.json({ success: true, data: this.mapAddress(address) });
    } catch (error) {
      return res.status(404).json({ error: error.message });
    }
  }

  async addAddress(req, res) {
    try {
      const dto = req.body;
      const mbId = dto.mb_id || dto.mbId;
      let adDefault = Number(dto.ad_default ?? dto.adDefault ?? 0);

      // 목록 캐시가 있으면 COUNT RTT 생략
      const cached = addressListCache.get(`list:${mbId}`);
      let forceFirstDefault = null;
      if (cached && Array.isArray(cached.data)) {
        if (cached.data.length === 0) {
          adDefault = 1;
          forceFirstDefault = true;
        } else {
          forceFirstDefault = false;
        }
      }

      const saved = await addressRepository.createFast(
        {
          mb_id: mbId,
          ad_subject: dto.ad_subject ?? dto.adSubject ?? '',
          ad_default: adDefault,
          ad_name: dto.ad_name || dto.adName,
          ad_tel: dto.ad_tel || dto.adTel || '',
          ad_hp: dto.ad_hp || dto.adHp || '',
          ad_zip1: dto.ad_zip1 || dto.adZip1 || '',
          ad_zip2: dto.ad_zip2 || dto.adZip2 || '',
          ad_addr1: dto.ad_addr1 || dto.adAddr1 || '',
          ad_addr2: dto.ad_addr2 || dto.adAddr2 || '',
          ad_addr3: dto.ad_addr3 || dto.adAddr3 || '',
          ad_jibeon: dto.ad_jibeon || dto.adJibeon || '',
          ad_memo: dto.ad_memo ?? dto.adMemo ?? '',
        },
        { forceFirstDefault }
      );

      this.invalidateList(mbId);
      return res.json({
        success: true,
        data: this.mapAddress(saved),
        message: '배송지가 추가되었습니다.',
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async updateAddress(req, res) {
    try {
      const id = Number(req.params.id);
      const dto = req.body;
      const mbId = dto.mb_id || dto.mbId;
      if (Number(dto.ad_default ?? dto.adDefault ?? 0) === 1) {
        await addressRepository.clearDefaultByMbId(mbId);
      }

      const updated = await addressRepository.update(id, mbId, {
        ad_subject: dto.ad_subject ?? dto.adSubject ?? '',
        ad_default: Number(dto.ad_default ?? dto.adDefault ?? 0),
        ad_name: dto.ad_name || dto.adName,
        ad_tel: dto.ad_tel || dto.adTel || '',
        ad_hp: dto.ad_hp || dto.adHp || '',
        ad_zip1: dto.ad_zip1 || dto.adZip1 || '',
        ad_zip2: dto.ad_zip2 || dto.adZip2 || '',
        ad_addr1: dto.ad_addr1 || dto.adAddr1 || '',
        ad_addr2: dto.ad_addr2 || dto.adAddr2 || '',
        ad_addr3: dto.ad_addr3 || dto.adAddr3 || '',
        ad_jibeon: dto.ad_jibeon || dto.adJibeon || '',
        ad_memo: dto.ad_memo ?? dto.adMemo ?? '',
      });
      if (!updated) {
        return res.status(400).json({ error: '배송지를 찾을 수 없습니다.' });
      }

      this.invalidateList(mbId);
      return res.json({ success: true, data: this.mapAddress(updated), message: '배송지가 수정되었습니다.' });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async deleteAddress(req, res) {
    try {
      const mbId = req.query.mbId;
      const deleted = await addressRepository.delete(Number(req.params.id), mbId);
      if (!deleted) {
        return res.status(400).json({ error: '배송지를 찾을 수 없습니다.' });
      }
      this.invalidateList(mbId);
      return res.json({ success: true, message: '배송지가 삭제되었습니다.' });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async setDefaultAddress(req, res) {
    try {
      const id = Number(req.params.id);
      const mbId = req.body.mb_id || req.body.mbId || req.query.mbId;
      if (!mbId) {
        return res.status(400).json({ error: 'mb_id가 필요합니다.' });
      }

      const updated = await addressRepository.setDefault(id, mbId);
      if (!updated) {
        return res.status(404).json({ error: '배송지를 찾을 수 없습니다.' });
      }

      this.invalidateList(mbId);
      return res.json({
        success: true,
        data: this.mapAddress(updated),
        message: '기본 배송지로 설정되었습니다.',
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
}

module.exports = new AddressController();
