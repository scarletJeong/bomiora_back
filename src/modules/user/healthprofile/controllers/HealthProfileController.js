const healthProfileRepository = require('../repositories/HealthProfileRepository');

class HealthProfileController {
  formatMultipleChoice(value) {
    if (!value || !String(value).trim()) return '';
    const unique = [];
    String(value)
      .split(/[,|]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((item) => {
        if (!unique.includes(item)) unique.push(item);
      });
    return unique.join('|');
  }

  toResponse(row) {
    if (!row) return null;
    return {
      pfNo: row.pf_no,
      mbId: row.mb_id,
      answer1: row.answer_1,
      answer2: row.answer_2,
      answer3: row.answer_3,
      answer4: row.answer_4,
      answer5: row.answer_5,
      answer6: row.answer_6,
      answer7: row.answer_7,
      answer8: row.answer_8,
      answer9: row.answer_9,
      answer10: row.answer_10,
      answer11: row.answer_11,
      answer12: row.answer_12,
      answer13: row.answer_13,
      answer13Period: row.answer_13_period,
      answer13Dosage: row.answer_13_dosage,
      answer13Medicine: row.answer_13_medicine,
      answer71: row.answer_7_1,
      answer13Sideeffect: row.answer_13_sideeffect,
      pfWdatetime: row.pf_wdatetime,
      pfMdatetime: row.pf_mdatetime,
      pfIp: row.pf_ip,
      pfMemo: row.pf_memo
    };
  }

  bodyToFields(body) {
    return {
      mb_id: body.mbId,
      answer_1: body.answer1,
      answer_2: body.answer2,
      answer_3: body.answer3,
      answer_4: body.answer4,
      answer_5: body.answer5,
      answer_6: body.answer6,
      answer_7: body.answer7,
      answer_8: this.formatMultipleChoice(body.answer8),
      answer_9: this.formatMultipleChoice(body.answer9),
      answer_10: body.answer10,
      answer_11: this.formatMultipleChoice(body.answer11),
      answer_12: this.formatMultipleChoice(body.answer12),
      answer_13: body.answer13,
      answer_13_period: body.answer13Period,
      answer_13_dosage: body.answer13Dosage,
      answer_13_medicine: body.answer13Medicine,
      answer_7_1: body.answer71,
      answer_13_sideeffect: body.answer13Sideeffect,
      pf_ip: '127.0.0.1',
      pf_memo: body.pfMemo
    };
  }

  async getHealthProfile(req, res) {
    try {
      const row = await healthProfileRepository.findByMbId(req.params.userId);
      if (!row) return res.json({ success: true, message: '문진표가 없습니다', data: null });
      return res.json({ success: true, message: '문진표 조회 성공', data: this.toResponse(row) });
    } catch (error) {
      return res.status(500).json({ success: false, message: '문진표 조회 중 오류가 발생했습니다', error: error.message });
    }
  }

  async saveHealthProfile(req, res) {
    try {
      const fields = this.bodyToFields(req.body);
      const exists = await healthProfileRepository.findByMbId(fields.mb_id);
      const saved = exists
        ? await healthProfileRepository.update(exists.pf_no, fields.mb_id, fields)
        : await healthProfileRepository.create(fields);

      return res.status(201).json({ success: true, message: '문진표가 저장되었습니다', data: this.toResponse(saved) });
    } catch (error) {
      return res.status(500).json({ success: false, message: '문진표 저장 중 오류가 발생했습니다', error: error.message });
    }
  }

  async updateHealthProfile(req, res) {
    try {
      const pfNo = Number(req.params.pfNo);
      const mbId = req.body.mbId;
      const current = await healthProfileRepository.findByPfNoAndMbId(pfNo, mbId);
      if (!current) {
        return res.status(404).json({ success: false, message: `문진표를 찾을 수 없습니다. 문진표 번호: ${pfNo}, 사용자 ID: ${mbId}`, error: `문진표를 찾을 수 없습니다. 문진표 번호: ${pfNo}, 사용자 ID: ${mbId}` });
      }
      const updated = await healthProfileRepository.update(pfNo, mbId, this.bodyToFields(req.body));
      return res.json({ success: true, message: '문진표가 수정되었습니다', data: this.toResponse(updated) });
    } catch (error) {
      return res.status(500).json({ success: false, message: '문진표 수정 중 오류가 발생했습니다', error: error.message });
    }
  }

  async deleteHealthProfile(req, res) {
    try {
      const pfNo = Number(req.params.pfNo);
      const mbId = req.query.mbId;
      const deleted = await healthProfileRepository.delete(pfNo, mbId);
      if (!deleted) {
        return res.status(404).json({ success: false, message: `문진표를 찾을 수 없습니다. 문진표 번호: ${pfNo}, 사용자 ID: ${mbId}`, error: `문진표를 찾을 수 없습니다. 문진표 번호: ${pfNo}, 사용자 ID: ${mbId}` });
      }
      return res.json({ success: true, message: '문진표가 삭제되었습니다', data: null });
    } catch (error) {
      return res.status(500).json({ success: false, message: '문진표 삭제 중 오류가 발생했습니다', error: error.message });
    }
  }

  async hasHealthProfile(req, res) {
    try {
      const exists = await healthProfileRepository.existsByMbId(req.params.userId);
      return res.json({ success: true, message: '조회 완료', data: exists });
    } catch (error) {
      return res.status(500).json({ success: false, message: '문진표 존재 여부 확인 중 오류가 발생했습니다', error: error.message });
    }
  }

  async analyzeHealthProfile(req, res) {
    try {
      const row = await healthProfileRepository.findByMbId(req.params.userId);
      if (!row) {
        return res.status(404).json({ success: false, message: '문진표를 찾을 수 없습니다', error: '문진표를 찾을 수 없습니다' });
      }
      return res.json({ success: true, message: '건강 상태 분석 완료', data: null });
    } catch (error) {
      return res.status(500).json({ success: false, message: '건강 상태 분석 중 오류가 발생했습니다', error: error.message });
    }
  }
}

module.exports = new HealthProfileController();
