const eventRepository = require('../repositories/EventRepository');

class EventController {
  isActive(row) {
    try {
      if (row.ca_name !== '진행중인 이벤트') return false;
      if (!row.wr_1 || !row.wr_2) return false;
      const now = new Date();
      const start = new Date(row.wr_1);
      const end = new Date(row.wr_2);
      return now >= start && now <= end;
    } catch (error) {
      return false;
    }
  }

  toMap(row) {
    return {
      wr_id: row.wr_id,
      wr_num: row.wr_num,
      ca_name: row.ca_name,
      wr_subject: row.wr_subject,
      wr_content: row.wr_content,
      wr_link1: row.wr_link1,
      wr_datetime: row.wr_datetime ? String(row.wr_datetime) : null,
      wr_last: row.wr_last,
      wr_hit: row.wr_hit ?? 0,
      wr_1: row.wr_1,
      wr_2: row.wr_2,
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
