const eventRepository = require('../repositories/EventRepository');

class EventController {
  normalizeText(value) {
    if (value == null) return null;
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    if (typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
      return Buffer.from(value.data).toString('utf8');
    }
    return String(value);
  }

  normalizeDate(value) {
    const text = this.normalizeText(value);
    if (!text) return null;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  /**
   * 진행 이벤트(ca_name) + 기간(wr_1, wr_2) 기준.
   * - wr_2 없음: wr_1 이후면 진행으로 간주(종료일 미입력 게시물 대응).
   * - wr_2 있음: 해당일 23:59:59.999까지 포함(날짜만 저장된 DB 대응).
   */
  isActive(row) {
    try {
      const caName = this.normalizeText(row.ca_name);
      if (caName !== '진행중인 이벤트') return false;
      const now = new Date();
      const startDate = this.normalizeDate(row.wr_1);
      const endDate = this.normalizeDate(row.wr_2);

      if (startDate && endDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return now >= start && now <= end;
      }

      if (startDate && !endDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        return now >= start;
      }

      if (!startDate && endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return now <= end;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  toMap(row) {
    return {
      wr_id: row.wr_id,
      wr_num: row.wr_num,
      ca_name: this.normalizeText(row.ca_name),
      wr_subject: this.normalizeText(row.wr_subject),
      wr_content: this.normalizeText(row.wr_content),
      wr_link1: this.normalizeText(row.wr_link1),
      wr_datetime: row.wr_datetime ? String(row.wr_datetime) : null,
      wr_last: row.wr_last,
      wr_hit: row.wr_hit ?? 0,
      wr_1: this.normalizeText(row.wr_1),
      wr_2: this.normalizeText(row.wr_2),
      is_active: this.isActive(row)
    };
  }

  async getActiveEvents(req, res) {
    try {
      const rows = await eventRepository.findActiveEvents();
      return res.json({
        success: true,
        data: rows.filter((r) => this.isActive(r)).map((r) => this.toMap(r))
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: `진행중인 이벤트 목록 조회 실패: ${error.message}` });
    }
  }

  async getEndedEvents(req, res) {
    try {
      const rows = await eventRepository.findEndedEvents();
      return res.json({ success: true, data: rows.map((r) => this.toMap(r)) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `종료된 이벤트 목록 조회 실패: ${error.message}` });
    }
  }

  async getEventDetail(req, res) {
    try {
      const wrId = Number(req.params.wrId);
      const row = await eventRepository.findByWrId(wrId);
      if (!row) return res.status(404).json({ success: false, message: '이벤트를 찾을 수 없습니다.' });
      await eventRepository.increaseHit(wrId, row.wr_hit);
      const updated = { ...row, wr_hit: Number(row.wr_hit || 0) + 1 };
      return res.json({ success: true, data: this.toMap(updated) });
    } catch (error) {
      return res.status(500).json({ success: false, message: `이벤트 상세 조회 실패: ${error.message}` });
    }
  }
}

module.exports = new EventController();
