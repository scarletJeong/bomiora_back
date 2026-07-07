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

  formatDateYmd(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  isWithinPeriod(beginDate, endDate, now = new Date()) {
    if (beginDate && endDate) {
      const start = new Date(beginDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      return now >= start && now <= end;
    }
    if (beginDate) {
      const start = new Date(beginDate);
      start.setHours(0, 0, 0, 0);
      return now >= start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      return now <= end;
    }
    return true;
  }

  normalizeImagePath(value) {
    return (this.normalizeText(value) || '').trim();
  }

  toMap(row) {
    const beginDate = this.normalizeDate(row.begin_time);
    const endDate = this.normalizeDate(row.end_time);
    const active = this.isWithinPeriod(beginDate, endDate);
    const imagePath = this.normalizeImagePath(row.image_path);

    return {
      id: row.id,
      // 앱·검색 호환용 레거시 필드
      wr_id: row.id,
      wr_num: row.id,
      ca_name: active ? '진행중인 이벤트' : '종료된 이벤트',
      wr_subject: this.normalizeText(row.title) || '',
      wr_content: this.normalizeText(row.content) || '',
      wr_link1: imagePath,
      wr_datetime: row.created_at ? String(row.created_at) : null,
      wr_last: this.normalizeText(row.writer_name),
      wr_hit: Number(row.view_count || 0),
      wr_1: beginDate ? this.formatDateYmd(beginDate) : null,
      wr_2: endDate ? this.formatDateYmd(endDate) : null,
      is_active: active,
      // bm_event 신규 필드
      title: this.normalizeText(row.title) || '',
      content: this.normalizeText(row.content) || '',
      writer_name: this.normalizeText(row.writer_name) || '',
      image_path: imagePath,
      begin_time: row.begin_time ? String(row.begin_time) : null,
      end_time: row.end_time ? String(row.end_time) : null,
      is_use: Number(row.is_use || 0),
      view_count: Number(row.view_count || 0),
      created_by: this.normalizeText(row.created_by) || '',
      created_at: row.created_at ? String(row.created_at) : null,
      updated_by: this.normalizeText(row.updated_by),
      updated_at: row.updated_at ? String(row.updated_at) : null,
    };
  }

  async getActiveEvents(req, res) {
    try {
      const rows = await eventRepository.findActiveEvents();
      return res.json({
        success: true,
        data: rows.map((row) => this.toMap(row)),
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `진행중인 이벤트 목록 조회 실패: ${error.message}`,
      });
    }
  }

  async getEndedEvents(req, res) {
    try {
      const rows = await eventRepository.findEndedEvents();
      return res.json({
        success: true,
        data: rows.map((row) => this.toMap(row)),
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `종료된 이벤트 목록 조회 실패: ${error.message}`,
      });
    }
  }

  async getEventDetail(req, res) {
    try {
      const id = Number(req.params.wrId);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: '올바른 이벤트 ID가 아닙니다.',
        });
      }

      const row = await eventRepository.findById(id);
      if (!row) {
        return res.status(404).json({
          success: false,
          message: '이벤트를 찾을 수 없습니다.',
        });
      }

      await eventRepository.increaseViewCount(id);
      const updated = {
        ...row,
        view_count: Number(row.view_count || 0) + 1,
      };

      return res.json({
        success: true,
        data: this.toMap(updated),
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `이벤트 상세 조회 실패: ${error.message}`,
      });
    }
  }
}

module.exports = new EventController();
