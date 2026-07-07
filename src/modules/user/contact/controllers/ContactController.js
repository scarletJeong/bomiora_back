const contactRepository = require('../repositories/ContactRepository');

class ContactController {
  _asText(value) {
    if (value == null) return value;
    // mysql2가 Buffer로 주는 케이스
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    // JSON stringify 이후에도 남는 { type: 'Buffer', data: [...] } 형태 방어
    if (typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
      try {
        return Buffer.from(value.data).toString('utf8');
      } catch (_) {
        return value;
      }
    }
    return value;
  }

  _asInt(value, fallback = 0) {
    if (value == null) return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  _isClosedRow(contact) {
    if (!contact) return false;
    if (contact.is_closed != null && contact.is_closed !== undefined) {
      return Number(contact.is_closed) === 1;
    }
    const wr8 = String(contact.wr_8 ?? '').trim();
    return wr8 === '1' || wr8.toLowerCase() === 'closed' || wr8 === 'Y';
  }

  _isCloseRequest(body) {
    if (body == null) return false;
    const closed = body.is_closed;
    if (closed === 1 || closed === '1' || closed === true) return true;
    const wr8 = String(body.wr_8 ?? '').trim();
    return wr8 === '1' || wr8.toLowerCase() === 'closed' || wr8 === 'Y';
  }

  toMap(contact) {
    const wr8 = this._asText(contact.wr_8) ?? '';
    const closed = this._isClosedRow(contact);
    return {
      wr_id: this._asInt(contact.wr_id, 0),
      wr_subject: this._asText(contact.wr_subject) ?? '',
      wr_content: this._asText(contact.wr_content) ?? '',
      mb_id: this._asText(contact.mb_id) ?? '',
      wr_name: this._asText(contact.wr_name) ?? '',
      wr_email: this._asText(contact.wr_email) ?? '',
      // 목록에서는 스레드의 최신 작성일(추가질문 포함)을 표시/정렬 기준으로 사용
      wr_datetime: contact.thread_last_datetime ?? contact.wr_datetime,
      wr_last: contact.wr_last,
      wr_comment: this._asInt(contact.wr_comment, 0),
      wr_reply: this._asText(contact.wr_reply) ?? '',
      wr_parent: this._asInt(contact.wr_parent, 0),
      ca_name: this._asText(contact.ca_name) ?? '',
      wr_6: this._asText(contact.wr_6) ?? '',
      wr_hit: this._asInt(contact.wr_hit, 0),
      wr_option: this._asText(contact.wr_option),
      wr_is_comment: this._asInt(contact.wr_is_comment, 0),
      wr_8: wr8,
      is_closed: closed ? 1 : 0,
      followup_count: this._asInt(contact.followup_count, 0),
      thread_last_datetime: contact.thread_last_datetime ?? null,
      latest_wr_id: this._asInt(contact.latest_wr_id, 0),
      latest_wr_is_comment: this._asInt(contact.latest_wr_is_comment, 0),
    };
  }

  getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
    return req.socket?.remoteAddress || '0.0.0.0';
  }

  async getMyContacts(req, res) {
    try {
      const contacts = await contactRepository.findThreadsByIdentity({
        mbId: req.query.mb_id || req.query.mbId,
        mbEmail: req.query.mb_email || req.query.mbEmail,
      });
      const processed = [];
      for (const c of contacts) {
        const updated = await contactRepository.autoCloseThreadIfExpired(c.wr_id);
        if (updated && this._isClosedRow(updated)) {
          processed.push({ ...c, is_closed: 1, wr_last: updated.wr_last });
        } else {
          processed.push(c);
        }
      }
      return res.json({ success: true, data: processed.map((c) => this.toMap(c)) });
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
      const rootId = await contactRepository.findRootIdByWrId(wrId);
      if (rootId) {
        await contactRepository.autoCloseThreadIfExpired(rootId);
      }
      const updated = await contactRepository.findById(wrId);
      const thread = rootId ? await contactRepository.findThreadByRoot(rootId) : [];
      return res.json({
        success: true,
        data: this.toMap(updated),
        thread: thread.map((c) => this.toMap(c)),
        root_wr_id: rootId,
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: `문의 상세 조회 실패: ${error.message}` });
    }
  }

  async createContact(req, res) {
    try {
      const nextWrId = (await contactRepository.findMaxWrId()) + 1;
      const nextWrNum = (await contactRepository.findMaxWrNum()) + 1;
      const now = new Date();

      const parentWrIdRaw = req.body.parent_wr_id ?? req.body.parentWrId ?? null;
      const parentWrId = parentWrIdRaw != null ? Number(parentWrIdRaw) : null;
      const rootId = parentWrId ? await contactRepository.findRootIdByWrId(parentWrId) : null;

      if (parentWrId && !rootId) {
        return res.status(400).json({ success: false, message: '연결할 문의를 찾을 수 없습니다.' });
      }

      if (rootId) {
        const rootRow = await contactRepository.findById(rootId);
        if (rootRow && this._isClosedRow(rootRow)) {
          return res.status(400).json({ success: false, message: '종료된 문의에는 추가질문을 할 수 없습니다.' });
        }
      }

      const contact = {
        wr_id: nextWrId,
        wr_num: nextWrNum,
        wr_reply: '',
        wr_parent: rootId ?? nextWrId,
        wr_comment: 0,
        wr_comment_reply: '',
        wr_is_comment: 0,
        ca_name: req.body.ca_name || '',
        wr_option: req.body.wr_option || '',
        wr_subject: req.body.wr_subject,
        wr_content: req.body.wr_content,
        wr_hit: 0,
        mb_id: req.body.mb_id,
        wr_password: '',
        wr_name: req.body.wr_name,
        wr_email: req.body.wr_email,
        wr_datetime: now,
        wr_file: 0,
        wr_last: now,
        wr_ip: this.getClientIp(req),
        wr_1: req.body.wr_name || '',
        wr_2: '',
        wr_3: '',
        wr_4: '',
        wr_5: req.body.wr_5 || '',
        wr_6: (req.body.wr_6 || req.body.inquiry_detail_type || req.body.detail_type || '').toString().trim(),
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

      const mbId = req.body.mb_id || req.body.mbId;

      if (this._isCloseRequest(req.body)) {
        return this._closeContact(req, res, current, mbId);
      }

      const rootId = await contactRepository.findRootIdByWrId(wrId);
      const root = rootId ? await contactRepository.findById(rootId) : current;
      if (root && this._isClosedRow(root)) {
        return res.status(400).json({ success: false, message: '종료된 문의는 수정할 수 없습니다.' });
      }

      if (mbId && String(current.mb_id).trim() !== String(mbId).trim()) {
        return res.status(403).json({ success: false, message: '수정할 권한이 없습니다.' });
      }

      if ((current.wr_is_comment ?? 0) === 1) {
        return res.status(400).json({ success: false, message: '답변이 완료된 문의는 수정할 수 없습니다.' });
      }

      const fields = { wr_last: new Date() };
      if (req.body.wr_subject != null) fields.wr_subject = req.body.wr_subject;
      if (req.body.wr_content != null) fields.wr_content = req.body.wr_content;
      if (req.body.wr_6 != null) {
        fields.wr_6 = (req.body.wr_6 || req.body.inquiry_detail_type || req.body.detail_type || '').toString().trim();
      }

      await contactRepository.update(wrId, fields);

      if (req.body.ca_name != null && rootId) {
        await contactRepository.update(rootId, {
          ca_name: req.body.ca_name,
          wr_last: new Date(),
        });
      }
      if (req.body.wr_6 != null && rootId) {
        await contactRepository.update(rootId, {
          wr_6: fields.wr_6,
          wr_last: new Date(),
        });
      }

      const updated = await contactRepository.findById(wrId);
      return res.json({ success: true, message: '문의가 수정되었습니다.', data: this.toMap(updated) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `문의 수정 실패: ${error.message}` });
    }
  }

  async _closeContact(req, res, current, mbId) {
    const rootId = await contactRepository.findRootIdByWrId(current.wr_id);
    if (!rootId) {
      return res.status(404).json({ success: false, message: '문의를 찾을 수 없습니다.' });
    }

    const root = await contactRepository.findById(rootId);
    if (!root) {
      return res.status(404).json({ success: false, message: '문의를 찾을 수 없습니다.' });
    }

    if (mbId && String(root.mb_id).trim() !== String(mbId).trim()) {
      return res.status(403).json({ success: false, message: '종료할 권한이 없습니다.' });
    }

    if (this._isClosedRow(root)) {
      return res.json({
        success: true,
        message: '이미 종료된 문의입니다.',
        data: this.toMap(root),
      });
    }

    const updated = await contactRepository.closeThread(rootId);
    return res.json({
      success: true,
      message: '문의가 종료되었습니다.',
      data: this.toMap(updated),
    });
  }

  async deleteContact(req, res) {
    try {
      const wrId = Number(req.params.wrId);
      const mbId = req.query.mb_id || req.query.mbId;
      if (!mbId || !String(mbId).trim()) {
        return res.status(400).json({ success: false, message: '회원 정보가 필요합니다.' });
      }
      const row = await contactRepository.findById(wrId);
      if (!row) {
        return res.status(404).json({ success: false, message: '문의를 찾을 수 없습니다.' });
      }
      if (String(row.mb_id).trim() !== String(mbId).trim()) {
        return res.status(403).json({ success: false, message: '삭제할 권한이 없습니다.' });
      }

      const rootId = await contactRepository.findRootIdByWrId(wrId);
      const root = rootId ? await contactRepository.findById(rootId) : row;
      if (root && this._isClosedRow(root)) {
        return res.status(400).json({ success: false, message: '종료된 문의는 삭제할 수 없습니다.' });
      }

      if ((row.wr_is_comment ?? 0) === 1) {
        return res.status(400).json({ success: false, message: '답변이 완료된 문의는 삭제할 수 없습니다.' });
      }

      const ok = await contactRepository.deleteByIdAndMbId(wrId, mbId);
      if (!ok) {
        return res.status(400).json({ success: false, message: '문의 삭제에 실패했습니다.' });
      }
      return res.json({ success: true, message: '문의가 삭제되었습니다.' });
    } catch (error) {
      return res.status(500).json({ success: false, message: `문의 삭제 실패: ${error.message}` });
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
