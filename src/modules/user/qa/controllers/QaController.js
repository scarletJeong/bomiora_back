const qaRepository = require('../repositories/QaRepository');

class QaController {
  _asText(value) {
    if (value == null) return value;
    // mysql2ê°€ Bufferë¡?ì£¼ëŠ” ì¼€?´ìŠ¤
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    // JSON stringify ?´í›„?ë„ ?¨ëŠ” { type: 'Buffer', data: [...] } ?•íƒœ ë°©ì–´
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
      // ëª©ë¡?ì„œ???¤ë ˆ?œì˜ ìµœì‹  ?‘ì„±??ì¶”ê?ì§ˆë¬¸ ?¬í•¨)???œì‹œ/?•ë ¬ ê¸°ì??¼ë¡œ ?¬ìš©
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

  async getMyList(req, res) {
    try {
      const contacts = await qaRepository.findThreadsByIdentity({
        mbId: req.query.mb_id || req.query.mbId,
        mbEmail: req.query.mb_email || req.query.mbEmail,
      });
      const processed = [];
      for (const c of contacts) {
        const updated = await qaRepository.autoCloseThreadIfExpired(c.wr_id);
        if (updated && this._isClosedRow(updated)) {
          processed.push({ ...c, is_closed: 1, wr_last: updated.wr_last });
        } else {
          processed.push(c);
        }
      }
      return res.json({ success: true, data: processed.map((c) => this.toMap(c)) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `ë¬¸ì˜?´ì—­ ì¡°íšŒ ?¤íŒ¨: ${error.message}` });
    }
  }

  async getDetail(req, res) {
    try {
      const wrId = Number(req.params.wrId);
      const contact = await qaRepository.findById(wrId);
      if (!contact) {
        return res.status(404).json({ success: false, message: 'ë¬¸ì˜ë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.' });
      }

      await qaRepository.update(wrId, { wr_hit: (contact.wr_hit || 0) + 1 });
      const rootId = await qaRepository.findRootIdByWrId(wrId);
      if (rootId) {
        await qaRepository.autoCloseThreadIfExpired(rootId);
      }
      const updated = await qaRepository.findById(wrId);
      const thread = rootId ? await qaRepository.findThreadByRoot(rootId) : [];
      return res.json({
        success: true,
        data: this.toMap(updated),
        thread: thread.map((c) => this.toMap(c)),
        root_wr_id: rootId,
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: `ë¬¸ì˜ ?ì„¸ ì¡°íšŒ ?¤íŒ¨: ${error.message}` });
    }
  }

  async create(req, res) {
    try {
      const nextWrId = (await qaRepository.findMaxWrId()) + 1;
      const nextWrNum = (await qaRepository.findMaxWrNum()) + 1;
      const now = new Date();

      const parentWrIdRaw = req.body.parent_wr_id ?? req.body.parentWrId ?? null;
      const parentWrId = parentWrIdRaw != null ? Number(parentWrIdRaw) : null;
      const rootId = parentWrId ? await qaRepository.findRootIdByWrId(parentWrId) : null;

      if (parentWrId && !rootId) {
        return res.status(400).json({ success: false, message: '?°ê²°??ë¬¸ì˜ë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.' });
      }

      if (rootId) {
        const rootRow = await qaRepository.findById(rootId);
        if (rootRow && this._isClosedRow(rootRow)) {
          return res.status(400).json({ success: false, message: 'ì¢…ë£Œ??ë¬¸ì˜?ëŠ” ì¶”ê?ì§ˆë¬¸???????†ìŠµ?ˆë‹¤.' });
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

      const saved = await qaRepository.create(contact);
      return res.status(201).json({ success: true, message: 'ë¬¸ì˜ê°€ ?±ë¡?˜ì—ˆ?µë‹ˆ??', data: this.toMap(saved) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `ë¬¸ì˜ ?±ë¡ ?¤íŒ¨: ${error.message}` });
    }
  }

  async update(req, res) {
    try {
      const wrId = Number(req.params.wrId);
      const current = await qaRepository.findById(wrId);
      if (!current) {
        return res.status(404).json({ success: false, message: 'ë¬¸ì˜ë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.' });
      }

      const mbId = req.body.mb_id || req.body.mbId;

      if (this._isCloseRequest(req.body)) {
        return this._close(req, res, current, mbId);
      }

      const rootId = await qaRepository.findRootIdByWrId(wrId);
      const root = rootId ? await qaRepository.findById(rootId) : current;
      if (root && this._isClosedRow(root)) {
        return res.status(400).json({ success: false, message: 'ì¢…ë£Œ??ë¬¸ì˜???˜ì •?????†ìŠµ?ˆë‹¤.' });
      }

      if (mbId && String(current.mb_id).trim() !== String(mbId).trim()) {
        return res.status(403).json({ success: false, message: '?˜ì •??ê¶Œí•œ???†ìŠµ?ˆë‹¤.' });
      }

      if ((current.wr_is_comment ?? 0) === 1) {
        return res.status(400).json({ success: false, message: '?µë????„ë£Œ??ë¬¸ì˜???˜ì •?????†ìŠµ?ˆë‹¤.' });
      }

      const fields = { wr_last: new Date() };
      if (req.body.wr_subject != null) fields.wr_subject = req.body.wr_subject;
      if (req.body.wr_content != null) fields.wr_content = req.body.wr_content;
      if (req.body.wr_6 != null) {
        fields.wr_6 = (req.body.wr_6 || req.body.inquiry_detail_type || req.body.detail_type || '').toString().trim();
      }

      await qaRepository.update(wrId, fields);

      if (req.body.ca_name != null && rootId) {
        await qaRepository.update(rootId, {
          ca_name: req.body.ca_name,
          wr_last: new Date(),
        });
      }
      if (req.body.wr_6 != null && rootId) {
        await qaRepository.update(rootId, {
          wr_6: fields.wr_6,
          wr_last: new Date(),
        });
      }

      const updated = await qaRepository.findById(wrId);
      return res.json({ success: true, message: 'ë¬¸ì˜ê°€ ?˜ì •?˜ì—ˆ?µë‹ˆ??', data: this.toMap(updated) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `ë¬¸ì˜ ?˜ì • ?¤íŒ¨: ${error.message}` });
    }
  }

  async _close(req, res, current, mbId) {
    const rootId = await qaRepository.findRootIdByWrId(current.wr_id);
    if (!rootId) {
      return res.status(404).json({ success: false, message: 'ë¬¸ì˜ë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.' });
    }

    const root = await qaRepository.findById(rootId);
    if (!root) {
      return res.status(404).json({ success: false, message: 'ë¬¸ì˜ë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.' });
    }

    if (mbId && String(root.mb_id).trim() !== String(mbId).trim()) {
      return res.status(403).json({ success: false, message: 'ì¢…ë£Œ??ê¶Œí•œ???†ìŠµ?ˆë‹¤.' });
    }

    if (this._isClosedRow(root)) {
      return res.json({
        success: true,
        message: '?´ë? ì¢…ë£Œ??ë¬¸ì˜?…ë‹ˆ??',
        data: this.toMap(root),
      });
    }

    const updated = await qaRepository.closeThread(rootId);
    return res.json({
      success: true,
      message: 'ë¬¸ì˜ê°€ ì¢…ë£Œ?˜ì—ˆ?µë‹ˆ??',
      data: this.toMap(updated),
    });
  }

  async delete(req, res) {
    try {
      const wrId = Number(req.params.wrId);
      const mbId = req.query.mb_id || req.query.mbId;
      if (!mbId || !String(mbId).trim()) {
        return res.status(400).json({ success: false, message: '?Œì› ?•ë³´ê°€ ?„ìš”?©ë‹ˆ??' });
      }
      const row = await qaRepository.findById(wrId);
      if (!row) {
        return res.status(404).json({ success: false, message: 'ë¬¸ì˜ë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.' });
      }
      if (String(row.mb_id).trim() !== String(mbId).trim()) {
        return res.status(403).json({ success: false, message: '?? œ??ê¶Œí•œ???†ìŠµ?ˆë‹¤.' });
      }

      const rootId = await qaRepository.findRootIdByWrId(wrId);
      const root = rootId ? await qaRepository.findById(rootId) : row;
      if (root && this._isClosedRow(root)) {
        return res.status(400).json({ success: false, message: 'ì¢…ë£Œ??ë¬¸ì˜???? œ?????†ìŠµ?ˆë‹¤.' });
      }

      if ((row.wr_is_comment ?? 0) === 1) {
        return res.status(400).json({ success: false, message: '?µë????„ë£Œ??ë¬¸ì˜???? œ?????†ìŠµ?ˆë‹¤.' });
      }

      const ok = await qaRepository.deleteByIdAndMbId(wrId, mbId);
      if (!ok) {
        return res.status(400).json({ success: false, message: 'ë¬¸ì˜ ?? œ???¤íŒ¨?ˆìŠµ?ˆë‹¤.' });
      }
      return res.json({ success: true, message: 'ë¬¸ì˜ê°€ ?? œ?˜ì—ˆ?µë‹ˆ??' });
    } catch (error) {
      return res.status(500).json({ success: false, message: `ë¬¸ì˜ ?? œ ?¤íŒ¨: ${error.message}` });
    }
  }

  async getReplies(req, res) {
    try {
      const wrId = Number(req.params.wrId);
      const contact = await qaRepository.findById(wrId);
      if (!contact) {
        return res.json({ success: false, message: 'ë¬¸ì˜ë¥?ì°¾ì„ ???†ìŠµ?ˆë‹¤.' });
      }

      if ((contact.wr_is_comment ?? 0) === 1 && contact.wr_7) {
        return res.json({
          success: true,
          data: [{
            wr_id: contact.wr_id,
            wr_content: contact.wr_7,
            wr_datetime: contact.wr_last || contact.wr_datetime,
            wr_name: 'ê´€ë¦¬ì',
            wr_option: contact.wr_option
          }]
        });
      }

      return res.json({ success: true, data: [] });
    } catch (error) {
      return res.status(500).json({ success: false, message: `?µë? ì¡°íšŒ ?¤íŒ¨: ${error.message}` });
    }
  }
}

module.exports = new QaController();
