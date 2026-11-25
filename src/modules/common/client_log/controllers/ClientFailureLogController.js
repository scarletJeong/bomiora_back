const clientFailureLogRepository = require('../repositories/ClientFailureLogRepository');

class ClientFailureLogController {
  async create(req, res) {
    try {
      const body = req.body || {};
      const code = String(body.code || body.actionCode || '').trim();
      if (!code) {
        return res.status(400).json({ success: false, message: 'code가 필요합니다.' });
      }
      if (code.endsWith('.image')) {
        return res.json({ success: true, skipped: true });
      }
      await clientFailureLogRepository.insert({
        mbId: body.mbId ?? body.mb_id ?? '',
        phone: body.phone ?? '',
        occurredAt: body.occurredAt ?? body.occurred_at ?? '',
        page: body.page ?? '',
        code,
        reason: body.reason ?? '',
        detail: body.detail ?? null,
        device: body.device ?? '',
      });
      return res.json({ success: true });
    } catch (error) {
      console.error('[ClientFailureLog]', error?.message || error);
      return res.status(500).json({ success: false, message: '실패 로그를 저장하지 못했습니다.' });
    }
  }
}

module.exports = new ClientFailureLogController();
