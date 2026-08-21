const qaRepository = require('../repositories/QaRepository');
const fs = require('fs');
const path = require('path');

const QA_UPLOAD_DIR =
  process.env.QA_IMAGE_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'qa_images');
const QA_IMAGE_MIRROR_URL = (process.env.QA_IMAGE_MIRROR_URL || '').trim();
const QA_IMAGE_MIRROR_SECRET = (
  process.env.QA_IMAGE_MIRROR_SECRET ||
  process.env.INTERNAL_NOTIFY_SECRET ||
  ''
).trim();
const QA_IMAGE_PUBLIC_BASE = (
  process.env.QA_IMAGE_PUBLIC_BASE ||
  'https://bomiora0.mycafe24.com/data/qa_images'
).replace(/\/$/, '');

class QaController {
  getUploadDir() {
    return QA_UPLOAD_DIR;
  }

  /** Cafe24 data/qa_images ? ?? (??? ????? ????) */
  _mirrorQaImageToCafe24(filename, buf, mime) {
    if (!QA_IMAGE_MIRROR_URL || !buf || !buf.length) return Promise.resolve(false);
    const https = require('https');
    const http = require('http');
    return new Promise((resolve) => {
      try {
        const body = new URLSearchParams({
          filename,
          data: buf.toString('base64'),
          mime: mime || 'application/octet-stream',
        }).toString();
        const target = new URL(QA_IMAGE_MIRROR_URL);
        const lib = target.protocol === 'https:' ? https : http;
        const req = lib.request(
          {
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port || (target.protocol === 'https:' ? 443 : 80),
            path: `${target.pathname}${target.search || ''}`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(body),
              'X-Internal-Secret': QA_IMAGE_MIRROR_SECRET,
            },
            timeout: 20000,
            rejectUnauthorized: false,
          },
          (res) => {
            let raw = '';
            res.on('data', (chunk) => {
              raw += chunk;
            });
            res.on('end', () => {
              if (res.statusCode < 200 || res.statusCode >= 300) {
                return resolve(false);
              }
              try {
                const parsed = JSON.parse(raw);
                return resolve(!!(parsed && parsed.success));
              } catch (_) {
                return resolve(false);
              }
            });
          }
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        req.write(body);
        req.end();
      } catch (_) {
        resolve(false);
      }
    });
  }

  /** create body.images: [{ filename, mime, data(base64) }] ? ?? ? URL */
  _saveBase64Images(images) {
    const urls = [];
    const mirrorJobs = [];
    if (!Array.isArray(images) || images.length === 0) return { urls, mirrorJobs };
    if (!fs.existsSync(QA_UPLOAD_DIR)) {
      fs.mkdirSync(QA_UPLOAD_DIR, { recursive: true });
    }
    const mimeExt = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
    };
    for (const item of images.slice(0, 3)) {
      if (!item || typeof item !== 'object') continue;
      let raw = String(item.data || item.base64 || '').trim();
      if (!raw) continue;
      raw = raw.replace(/^data:[^;]+;base64,/i, '');
      let buf;
      try {
        buf = Buffer.from(raw, 'base64');
      } catch (_) {
        continue;
      }
      if (!buf.length || buf.length > 5 * 1024 * 1024) continue;

      const mime = String(item.mime || item.contentType || '').toLowerCase();
      let ext = mimeExt[mime] || path.extname(String(item.filename || item.name || '')).toLowerCase();
      if (!ext || ext.length > 5) ext = '.jpg';
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`;
      fs.writeFileSync(path.join(QA_UPLOAD_DIR, filename), buf);
      // Cafe24 ?? ?? ? ?? URL, ?? ? data URI (????? ?? ???)
      if (QA_IMAGE_MIRROR_URL) {
        const publicUrl = `${QA_IMAGE_PUBLIC_BASE}/${filename}`;
        urls.push(publicUrl);
        mirrorJobs.push(
          this._mirrorQaImageToCafe24(filename, buf, mime || 'image/jpeg').then((ok) => {
            if (!ok) {
              const idx = urls.indexOf(publicUrl);
              if (idx >= 0) {
                urls[idx] = `data:${mime || 'image/png'};base64,${buf.toString('base64')}`;
              }
            }
            return ok;
          })
        );
      } else {
        urls.push(`data:${mime || 'image/png'};base64,${buf.toString('base64')}`);
      }
    }
    return { urls, mirrorJobs };
  }

  async uploadImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: '??? ????.',
        });
      }
      const filename = req.file.filename;
      const buf = fs.readFileSync(req.file.path);
      const mime = req.file.mimetype || 'application/octet-stream';
      if (QA_IMAGE_MIRROR_URL) {
        await this._mirrorQaImageToCafe24(filename, buf, mime);
      }
      const fileUrl = QA_IMAGE_MIRROR_URL
        ? `${QA_IMAGE_PUBLIC_BASE}/${filename}`
        : `/api/qa/images/${filename}`;
      return res.json({
        success: true,
        filename,
        url: fileUrl,
        message: '??? ??',
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `??? ??: ${error.message}`,
      });
    }
  }

  async getImage(req, res) {
    try {
      const filePath = path.join(QA_UPLOAD_DIR, req.params.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).end();
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentTypeMap = {
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
      };
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', contentTypeMap[ext] || 'application/octet-stream');
      return fs.createReadStream(filePath).pipe(res);
    } catch (_) {
      return res.status(404).end();
    }
  }

  _asText(value) {
    if (value == null) return value;
    if (Buffer.isBuffer(value)) return value.toString('utf8');
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

  /** ????(ca_name) / ????(wr_6) ? ? ?? */
  _normalizeInquiryFields(body = {}) {
    const caName = (body.ca_name || body.primary_type || body.primaryType || '')
      .toString()
      .trim();
    const wr6 = (
      body.wr_6 ||
      body.inquiry_detail_type ||
      body.detail_type ||
      body.detailType ||
      ''
    )
      .toString()
      .trim();
    return { caName, wr6 };
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
      wr_datetime: contact.thread_last_datetime ?? contact.wr_datetime,
      wr_last: contact.wr_last,
      wr_comment: this._asInt(contact.wr_comment, 0),
      wr_reply: this._asText(contact.wr_reply) ?? '',
      wr_parent: this._asInt(contact.wr_parent, 0),
      // ???? / ????
      ca_name: this._asText(contact.ca_name) ?? '',
      wr_6: this._asText(contact.wr_6) ?? '',
      wr_hit: this._asInt(contact.wr_hit, 0),
      wr_option: this._asText(contact.wr_option),
      wr_is_comment: this._asInt(contact.wr_is_comment, 0),
      wr_8: wr8,
      is_closed: closed ? 1 : 0,
      // ???? ??: ?? ?? ??? ??(?? 0 / ??)
      followup_count: 0,
      thread_last_datetime: contact.thread_last_datetime ?? contact.wr_datetime ?? null,
      latest_wr_id: this._asInt(contact.latest_wr_id || contact.wr_id, 0),
      latest_wr_is_comment: this._asInt(
        contact.latest_wr_is_comment ?? contact.wr_is_comment,
        0,
      ),
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
      return res.status(500).json({
        success: false,
        message: `???? ?? ??: ${error.message}`,
      });
    }
  }

  async getDetail(req, res) {
    try {
      const wrId = Number(req.params.wrId);
      const contact = await qaRepository.findById(wrId);
      if (!contact) {
        return res.status(404).json({ success: false, message: '???? ?? ? ????.' });
      }

      await qaRepository.update(wrId, { wr_hit: (contact.wr_hit || 0) + 1 });
      const rootId = await qaRepository.findRootIdByWrId(wrId);
      if (rootId) {
        await qaRepository.autoCloseThreadIfExpired(rootId);
      }
      const updated = await qaRepository.findById(wrId);
      // ?? Q&A: ??? ?? 1?? ???? ??? (??? ????? ?????? ??)
      const root = rootId ? await qaRepository.findById(rootId) : updated;
      const thread = root ? [root] : [];
      return res.json({
        success: true,
        data: this.toMap(updated),
        thread: thread.map((c) => this.toMap(c)),
        root_wr_id: rootId,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `?? ?? ?? ??: ${error.message}`,
      });
    }
  }

  async create(req, res) {
    try {
      const parentWrIdRaw = req.body.parent_wr_id ?? req.body.parentWrId ?? null;
      if (parentWrIdRaw != null && String(parentWrIdRaw).trim() !== '') {
        return res.status(400).json({
          success: false,
          message: '?? ??? ???? ????. ? ??? ??? ???.',
        });
      }

      const nextWrId = (await qaRepository.findMaxWrId()) + 1;
      const nextWrNum = (await qaRepository.findMaxWrNum()) + 1;
      const now = new Date();
      const { caName, wr6 } = this._normalizeInquiryFields(req.body);

      let content = String(req.body.wr_content ?? '');
      const imageSaved = this._saveBase64Images(req.body.images);
      const imageUrls = imageSaved.urls || [];
      if (imageSaved.mirrorJobs && imageSaved.mirrorJobs.length) {
        await Promise.all(imageSaved.mirrorJobs);
      }
      if (imageUrls.length > 0) {
        const imgs = imageUrls.map((u) => `<img src="${u}">`).join('\n');
        content = `${content}\n${imgs}`;
      }

      const contact = {
        wr_id: nextWrId,
        wr_num: nextWrNum,
        wr_reply: '',
        wr_parent: nextWrId, // single Q&A root
        wr_comment: 0,
        wr_comment_reply: '',
        wr_is_comment: 0,
        ca_name: caName,
        wr_option: req.body.wr_option || '',
        wr_subject: req.body.wr_subject,
        wr_content: content,
        wr_hit: 0,
        mb_id: req.body.mb_id,
        wr_password: '',
        wr_name: req.body.wr_name,
        wr_email: req.body.wr_email,
        wr_datetime: now,
        wr_file: imageUrls.length,
        wr_last: now,
        wr_ip: this.getClientIp(req),
        wr_1: req.body.wr_name || '',
        wr_2: '',
        wr_3: '',
        wr_4: '',
        wr_5: req.body.wr_5 || '',
        wr_6: wr6,
        wr_7: '',
        wr_8: '',
        wr_9: '',
        wr_10: '',
      };

      const saved = await qaRepository.create(contact);
      return res.status(201).json({
        success: true,
        message: '??? ???????.',
        data: this.toMap(saved),
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `?? ?? ??: ${error.message}`,
      });
    }
  }

  async update(req, res) {
    try {
      const wrId = Number(req.params.wrId);
      const current = await qaRepository.findById(wrId);
      if (!current) {
        return res.status(404).json({ success: false, message: '???? ?? ? ????.' });
      }

      const mbId = req.body.mb_id || req.body.mbId;

      if (this._isCloseRequest(req.body)) {
        return this._close(req, res, current, mbId);
      }

      const rootId = await qaRepository.findRootIdByWrId(wrId);
      const root = rootId ? await qaRepository.findById(rootId) : current;
      if (root && this._isClosedRow(root)) {
        return res.status(400).json({
          success: false,
          message: '??? ??? ??? ? ????.',
        });
      }

      if (mbId && String(current.mb_id).trim() !== String(mbId).trim()) {
        return res.status(403).json({ success: false, message: '?? ??? ????.' });
      }

      if ((current.wr_is_comment ?? 0) === 1) {
        return res.status(400).json({
          success: false,
          message: '??? ??? ??? ??? ? ????.',
        });
      }

      const fields = { wr_last: new Date() };
      if (req.body.wr_subject != null) fields.wr_subject = req.body.wr_subject;
      if (req.body.wr_content != null) fields.wr_content = req.body.wr_content;

      const { caName, wr6 } = this._normalizeInquiryFields(req.body);
      if (req.body.ca_name != null || req.body.primary_type != null || req.body.primaryType != null) {
        fields.ca_name = caName;
      }
      if (
        req.body.wr_6 != null ||
        req.body.inquiry_detail_type != null ||
        req.body.detail_type != null ||
        req.body.detailType != null
      ) {
        fields.wr_6 = wr6;
      }

      await qaRepository.update(wrId, fields);

      // ??? ??? ?? ??
      if (rootId && rootId !== wrId) {
        const rootFields = { wr_last: new Date() };
        if (fields.ca_name != null) rootFields.ca_name = fields.ca_name;
        if (fields.wr_6 != null) rootFields.wr_6 = fields.wr_6;
        if (Object.keys(rootFields).length > 1) {
          await qaRepository.update(rootId, rootFields);
        }
      }

      const updated = await qaRepository.findById(wrId);
      return res.json({
        success: true,
        message: '??? ???????.',
        data: this.toMap(updated),
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `?? ?? ??: ${error.message}`,
      });
    }
  }

  async _close(req, res, current, mbId) {
    const rootId = await qaRepository.findRootIdByWrId(current.wr_id);
    if (!rootId) {
      return res.status(404).json({ success: false, message: '???? ?? ? ????.' });
    }

    const root = await qaRepository.findById(rootId);
    if (!root) {
      return res.status(404).json({ success: false, message: '???? ?? ? ????.' });
    }

    if (mbId && String(root.mb_id).trim() !== String(mbId).trim()) {
      return res.status(403).json({ success: false, message: '?? ??? ????.' });
    }

    if (this._isClosedRow(root)) {
      return res.json({
        success: true,
        message: '?? ??? ?????.',
        data: this.toMap(root),
      });
    }

    const updated = await qaRepository.closeThread(rootId);
    return res.json({
      success: true,
      message: '??? ???????.',
      data: this.toMap(updated),
    });
  }

  async delete(req, res) {
    try {
      const wrId = Number(req.params.wrId);
      const mbId = req.query.mb_id || req.query.mbId;
      if (!mbId || !String(mbId).trim()) {
        return res.status(400).json({ success: false, message: '?? ??? ?????.' });
      }
      const row = await qaRepository.findById(wrId);
      if (!row) {
        return res.status(404).json({ success: false, message: '???? ?? ? ????.' });
      }
      if (String(row.mb_id).trim() !== String(mbId).trim()) {
        return res.status(403).json({ success: false, message: '?? ??? ????.' });
      }

      const rootId = await qaRepository.findRootIdByWrId(wrId);
      const root = rootId ? await qaRepository.findById(rootId) : row;
      if (root && this._isClosedRow(root)) {
        return res.status(400).json({
          success: false,
          message: '??? ??? ??? ? ????.',
        });
      }

      if ((row.wr_is_comment ?? 0) === 1) {
        return res.status(400).json({
          success: false,
          message: '??? ??? ??? ??? ? ????.',
        });
      }

      const ok = await qaRepository.deleteByIdAndMbId(wrId, mbId);
      if (!ok) {
        return res.status(400).json({ success: false, message: '?? ??? ??????.' });
      }
      return res.json({ success: true, message: '??? ???????.' });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `?? ?? ??: ${error.message}`,
      });
    }
  }

  async getReplies(req, res) {
    try {
      const wrId = Number(req.params.wrId);
      const contact = await qaRepository.findById(wrId);
      if (!contact) {
        return res.json({ success: false, message: '???? ?? ? ????.' });
      }

      // ?? 1? ? ?? 1? (wr_7)
      if ((contact.wr_is_comment ?? 0) === 1 && contact.wr_7) {
        return res.json({
          success: true,
          data: [
            {
              wr_id: contact.wr_id,
              wr_content: contact.wr_7,
              wr_datetime: contact.wr_last || contact.wr_datetime,
              wr_name: '???',
              wr_option: contact.wr_option,
            },
          ],
        });
      }

      return res.json({ success: true, data: [] });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `?? ?? ??: ${error.message}`,
      });
    }
  }
}

module.exports = new QaController();
