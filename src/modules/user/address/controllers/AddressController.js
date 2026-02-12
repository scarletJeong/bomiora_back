const addressRepository = require('../repositories/AddressRepository');

class AddressController {
  mapAddress(row) {
    return {
      ad_id: row.ad_id,
      mb_id: row.mb_id,
      ad_subject: row.ad_subject,
      ad_default: row.ad_default,
      ad_name: row.ad_name,
      ad_tel: row.ad_tel,
      ad_hp: row.ad_hp,
      ad_zip1: row.ad_zip1,
      ad_zip2: row.ad_zip2,
      ad_addr1: row.ad_addr1,
      ad_addr2: row.ad_addr2,
      ad_addr3: row.ad_addr3,
      ad_jibeon: row.ad_jibeon
    };
  }

  async getAddressList(req, res) {
    try {
      const addresses = await addressRepository.findByMbId(req.query.mbId);
      return res.json({ success: true, data: addresses.map((a) => this.mapAddress(a)) });
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
      if (Number(dto.ad_default || 0) === 1) {
        await addressRepository.clearDefaultByMbId(dto.mb_id || dto.mbId);
      }

      const saved = await addressRepository.create({
        mb_id: dto.mb_id || dto.mbId,
        ad_subject: dto.ad_subject || dto.adSubject,
        ad_default: Number(dto.ad_default ?? dto.adDefault ?? 0),
        ad_name: dto.ad_name || dto.adName,
        ad_tel: dto.ad_tel || dto.adTel || '',
        ad_hp: dto.ad_hp || dto.adHp || '',
        ad_zip1: dto.ad_zip1 || dto.adZip1 || '',
        ad_zip2: dto.ad_zip2 || dto.adZip2 || '',
        ad_addr1: dto.ad_addr1 || dto.adAddr1 || '',
        ad_addr2: dto.ad_addr2 || dto.adAddr2 || '',
        ad_addr3: dto.ad_addr3 || dto.adAddr3 || '',
        ad_jibeon: dto.ad_jibeon || dto.adJibeon || ''
      });

      return res.json({ success: true, data: this.mapAddress(saved), message: '배송지가 추가되었습니다.' });
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
        ad_subject: dto.ad_subject || dto.adSubject,
        ad_default: Number(dto.ad_default ?? dto.adDefault ?? 0),
        ad_name: dto.ad_name || dto.adName,
        ad_tel: dto.ad_tel || dto.adTel || '',
        ad_hp: dto.ad_hp || dto.adHp || '',
        ad_zip1: dto.ad_zip1 || dto.adZip1 || '',
        ad_zip2: dto.ad_zip2 || dto.adZip2 || '',
        ad_addr1: dto.ad_addr1 || dto.adAddr1 || '',
        ad_addr2: dto.ad_addr2 || dto.adAddr2 || '',
        ad_addr3: dto.ad_addr3 || dto.adAddr3 || '',
        ad_jibeon: dto.ad_jibeon || dto.adJibeon || ''
      });
      if (!updated) {
        return res.status(400).json({ error: '배송지를 찾을 수 없습니다.' });
      }

      return res.json({ success: true, data: this.mapAddress(updated), message: '배송지가 수정되었습니다.' });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  async deleteAddress(req, res) {
    try {
      const deleted = await addressRepository.delete(Number(req.params.id), req.query.mbId);
      if (!deleted) {
        return res.status(400).json({ error: '배송지를 찾을 수 없습니다.' });
      }
      return res.json({ success: true, message: '배송지가 삭제되었습니다.' });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
}

module.exports = new AddressController();
