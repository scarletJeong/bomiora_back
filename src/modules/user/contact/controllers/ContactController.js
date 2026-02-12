const contactRepository = require('../repositories/ContactRepository');

class ContactController {
  toMap(contact) {
    return {
      wr_id: contact.wr_id,
      wr_subject: contact.wr_subject,
      wr_content: contact.wr_content,
      mb_id: contact.mb_id,
      wr_name: contact.wr_name,
      wr_email: contact.wr_email,
      wr_datetime: contact.wr_datetime,
      wr_last: contact.wr_last,
      wr_comment: contact.wr_comment ?? 0,
      wr_reply: contact.wr_reply,
      wr_parent: contact.wr_parent,
      ca_name: contact.ca_name,
      wr_hit: contact.wr_hit ?? 0,
      wr_option: contact.wr_option,
      wr_is_comment: contact.wr_is_comment ?? 0
    };
  }

  getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
    return req.socket?.remoteAddress || '0.0.0.0';
  }

  async getMyContacts(req, res) {
    try {
      const contacts = await contactRepository.findByMbId(req.query.mb_id);
      return res.json({ success: true, data: contacts.map((c) => this.toMap(c)) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `문의내역 조회 실패: ${error.message}` });
    }
  }

  async getContactDetail(req, res) {
    try {
      const wrId = Number(req.params.wrId);
      const contact = await contactRepository.findById(wrId);
      if (!contact) {
        return res.status(404).json({ success: false, message: '문의를 찾을 수 없습니다.' });
      }

      await contactRepository.update(wrId, { wr_hit: (contact.wr_hit || 0) + 1 });
      const updated = await contactRepository.findById(wrId);
      return res.json({ success: true, data: this.toMap(updated) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `문의 상세 조회 실패: ${error.message}` });
    }
  }

  async createContact(req, res) {
    try {
      const nextWrId = (await contactRepository.findMaxWrId()) + 1;
      const nextWrNum = (await contactRepository.findMaxWrNum()) + 1;
      const now = new Date();

      const contact = {
        wr_id: nextWrId,
        wr_num: nextWrNum,
        wr_reply: '',
        wr_parent: nextWrId,
        wr_comment: 0,
        wr_comment_reply: '',
        wr_is_comment: 0,
        ca_name: req.body.ca_name || '',
        wr_option: req.body.wr_option || '',
        wr_subject: req.body.wr_subject,
        wr_content: req.body.wr_content,
        wr_seo_title: '',
        wr_link1: '',
        wr_link2: '',
        wr_link1_hit: 0,
        wr_link2_hit: 0,
        wr_hit: 0,
        wr_good: 0,
        wr_nogood: 0,
        mb_id: req.body.mb_id,
        wr_password: '',
        wr_name: req.body.wr_name,
        wr_email: req.body.wr_email,
        wr_homepage: '',
        wr_datetime: now,
        wr_file: 0,
        wr_last: now,
        wr_ip: this.getClientIp(req),
        wr_facebook_user: '',
        wr_twitter_user: '',
        wr_1: req.body.wr_name || '',
        wr_2: '',
        wr_3: '',
        wr_4: '',
        wr_5: req.body.wr_5 || '',
        wr_6: '',
        wr_7: '',
        wr_8: '',
        wr_9: '',
        wr_10: ''
      };

      const saved = await contactRepository.create(contact);
      return res.status(201).json({ success: true, message: '문의가 등록되었습니다.', data: this.toMap(saved) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `문의 등록 실패: ${error.message}` });
    }
  }

  async updateContact(req, res) {
    try {
      const wrId = Number(req.params.wrId);
      const current = await contactRepository.findById(wrId);
      if (!current) {
        return res.status(404).json({ success: false, message: '문의를 찾을 수 없습니다.' });
      }
      if ((current.wr_is_comment ?? 0) === 1) {
        return res.status(400).json({ success: false, message: '답변이 완료된 문의는 수정할 수 없습니다.' });
      }

      const fields = { wr_last: new Date() };
      if (req.body.wr_subject != null) fields.wr_subject = req.body.wr_subject;
      if (req.body.wr_content != null) fields.wr_content = req.body.wr_content;
      const updated = await contactRepository.update(wrId, fields);
      return res.json({ success: true, message: '문의가 수정되었습니다.', data: this.toMap(updated) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `문의 수정 실패: ${error.message}` });
    }
  }

  async getContactReplies(req, res) {
    try {
      const wrId = Number(req.params.wrId);
      const contact = await contactRepository.findById(wrId);
      if (!contact) {
        return res.json({ success: false, message: '문의를 찾을 수 없습니다.' });
      }

      if ((contact.wr_is_comment ?? 0) === 1 && contact.wr_7) {
        return res.json({
          success: true,
          data: [{
            wr_id: contact.wr_id,
            wr_content: contact.wr_7,
            wr_datetime: contact.wr_last || contact.wr_datetime,
            wr_name: '관리자',
            wr_option: contact.wr_option
          }]
        });
      }

      return res.json({ success: true, data: [] });
    } catch (error) {
      return res.status(500).json({ success: false, message: `답변 조회 실패: ${error.message}` });
    }
  }
}

module.exports = new ContactController();
