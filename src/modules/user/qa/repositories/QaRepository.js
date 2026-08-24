const pool = require('../../../../config/database');

class QaRepository {
  async findRootIdByWrId(wrId) {
    const [rows] = await pool.query(
      'SELECT wr_id, wr_parent FROM bomiora_write_online WHERE wr_id = ?',
      [wrId]
    );
    if (!rows.length) return null;
    const row = rows[0];
    const parent = Number(row.wr_parent || 0);
    const id = Number(row.wr_id || 0);
    if (!parent) return id;
    return parent === id ? id : parent;
  }

  /** ??? ??? ??(????). ? ??? ?????? ?? 1?? ?? */
  async findThreadByRoot(rootWrId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_write_online WHERE wr_parent = ? ORDER BY wr_datetime ASC, wr_id ASC',
      [rootWrId]
    );
    return rows;
  }

  _identityWhere({ mbId, mbEmail, alias = '' }) {
    const id = (mbId ?? '').toString().trim();
    const email = (mbEmail ?? '').toString().trim();
    if (!id && !email) return { where: '', args: [] };
    const col = alias ? `${alias}.` : '';

    const where = [`${col}wr_parent = ${col}wr_id`];
    const args = [];
    if (id && email) {
      where.push(`(${col}mb_id = ? OR ${col}wr_email = ?)`);
      args.push(id, email);
    } else if (email) {
      where.push(`${col}wr_email = ?`);
      args.push(email);
    } else {
      where.push(`${col}mb_id = ?`);
      args.push(id);
    }
    return { where: where.join(' AND '), args };
  }

  /**
   * 내 문의 목록(원글만). 본문 LONGTEXT·첨부 대신 미리보기만 조회.
   * is_closed 는 DB 값 + 답변 후 2일 경과를 SELECT에서 계산(목록 N+1 방지).
   */
  async findThreadsByIdentity({ mbId, mbEmail }) {
    const { where, args } = this._identityWhere({ mbId, mbEmail, alias: 'root' });
    if (!where) return [];

    const [rows] = await pool.query(
      `
      SELECT
        root.wr_id,
        CAST(root.wr_subject AS CHAR) AS wr_subject,
        CAST(LEFT(IFNULL(root.wr_content, ''), 800) AS CHAR) AS wr_content,
        CAST(root.mb_id AS CHAR) AS mb_id,
        CAST(root.wr_name AS CHAR) AS wr_name,
        CAST(root.wr_email AS CHAR) AS wr_email,
        root.wr_datetime,
        root.wr_last,
        root.wr_comment,
        CAST(LEFT(IFNULL(root.wr_reply, ''), 200) AS CHAR) AS wr_reply,
        root.wr_parent,
        CAST(root.ca_name AS CHAR) AS ca_name,
        CAST(root.wr_6 AS CHAR) AS wr_6,
        root.wr_hit,
        CAST(root.wr_option AS CHAR) AS wr_option,
        root.wr_is_comment,
        CAST(root.wr_8 AS CHAR) AS wr_8,
        CASE
          WHEN IFNULL(root.is_closed, 0) = 1 THEN 1
          WHEN LOWER(TRIM(CAST(IFNULL(root.wr_8, '') AS CHAR))) IN ('1', 'y', 'closed') THEN 1
          WHEN IFNULL(root.wr_is_comment, 0) = 1
            AND (
              TRIM(CAST(IFNULL(root.wr_7, '') AS CHAR)) <> ''
              OR TRIM(CAST(IFNULL(root.wr_reply, '') AS CHAR)) <> ''
            )
            AND DATE(IFNULL(root.wr_last, root.wr_datetime)) <= DATE_SUB(CURDATE(), INTERVAL 2 DAY)
          THEN 1
          ELSE 0
        END AS is_closed,
        root.wr_datetime AS thread_last_datetime,
        0 AS followup_count,
        root.wr_id AS latest_wr_id,
        root.wr_is_comment AS latest_wr_is_comment
      FROM bomiora_write_online root
      WHERE ${where}
      ORDER BY root.wr_datetime DESC, root.wr_id DESC
      `,
      args
    );
    return rows;
  }

  /** 답변 후 2일 경과 원글을 한 번에 종료. 목록 응답을 막지 않도록 호출측에서 fire-and-forget. */
  async autoCloseExpiredForIdentity({ mbId, mbEmail }) {
    const { where, args } = this._identityWhere({ mbId, mbEmail, alias: 'root' });
    if (!where) return 0;
    const [result] = await pool.query(
      `
      UPDATE bomiora_write_online root
      SET is_closed = 1, wr_last = NOW()
      WHERE ${where}
        AND IFNULL(root.is_closed, 0) <> 1
        AND LOWER(TRIM(CAST(IFNULL(root.wr_8, '') AS CHAR))) NOT IN ('1', 'y', 'closed')
        AND IFNULL(root.wr_is_comment, 0) = 1
        AND (
          TRIM(CAST(IFNULL(root.wr_7, '') AS CHAR)) <> ''
          OR TRIM(CAST(IFNULL(root.wr_reply, '') AS CHAR)) <> ''
        )
        AND DATE(IFNULL(root.wr_last, root.wr_datetime)) <= DATE_SUB(CURDATE(), INTERVAL 2 DAY)
      `,
      args
    );
    return Number(result?.affectedRows || 0);
  }

  async findById(wrId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_write_online WHERE wr_id = ?',
      [wrId]
    );
    return rows.length ? rows[0] : null;
  }

  async findMaxWrId() {
    const [rows] = await pool.query('SELECT MAX(wr_id) AS max_id FROM bomiora_write_online');
    return rows[0].max_id || 0;
  }

  async findMaxWrNum() {
    const [rows] = await pool.query('SELECT MAX(wr_num) AS max_num FROM bomiora_write_online');
    return rows[0].max_num || 0;
  }

  async create(contact) {
    await pool.query(
      `INSERT INTO bomiora_write_online
      (wr_id, wr_num, wr_reply, wr_parent, wr_comment, wr_comment_reply, wr_is_comment, ca_name, wr_option,
       wr_subject, wr_content, wr_hit, mb_id, wr_password, wr_name, wr_email, wr_datetime, wr_file, wr_last, wr_ip,
       wr_1, wr_2, wr_3, wr_4, wr_5, wr_6, wr_7, wr_8, wr_9, wr_10)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contact.wr_id, contact.wr_num, contact.wr_reply, contact.wr_parent, contact.wr_comment,
        contact.wr_comment_reply, contact.wr_is_comment,
        contact.ca_name, contact.wr_option, contact.wr_subject, contact.wr_content, contact.wr_hit,
        contact.mb_id, contact.wr_password,
        contact.wr_name, contact.wr_email, contact.wr_datetime, contact.wr_file, contact.wr_last,
        contact.wr_ip,
        contact.wr_1, contact.wr_2, contact.wr_3, contact.wr_4, contact.wr_5, contact.wr_6,
        contact.wr_7, contact.wr_8, contact.wr_9, contact.wr_10,
      ]
    );

    return this.findById(contact.wr_id);
  }

  async update(wrId, fields) {
    const pairs = [];
    const values = [];
    Object.entries(fields).forEach(([key, value]) => {
      pairs.push(`${key} = ?`);
      values.push(value);
    });

    if (!pairs.length) {
      return this.findById(wrId);
    }

    values.push(wrId);
    await pool.query(`UPDATE bomiora_write_online SET ${pairs.join(', ')} WHERE wr_id = ?`, values);
    return this.findById(wrId);
  }

  _startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  _isClosedRow(contact) {
    if (!contact) return false;
    if (contact.is_closed != null && contact.is_closed !== undefined) {
      return Number(contact.is_closed) === 1;
    }
    const wr8 = String(contact.wr_8 ?? '').trim();
    return wr8 === '1' || wr8.toLowerCase() === 'closed' || wr8 === 'Y';
  }

  _isAnsweredRow(row) {
    if (!row || Number(row.wr_is_comment) !== 1) return false;
    const wr7 = String(row.wr_7 ?? '').trim();
    const wrReply = String(row.wr_reply ?? '').trim();
    return wr7.length > 0 || wrReply.length > 0;
  }

  /**
   * ?? Q&A: ?? ?? ????? ? ???(wr_last) ??
   * (??? ???? ??? ??? ?? ??)
   */
  async findLastQuestionAnswerDate(rootWrId) {
    const root = await this.findById(rootWrId);
    if (!root) return null;

    const rows = await this.findThreadByRoot(rootWrId);
    const target = rows.length
      ? [...rows].sort((a, b) => {
          const dtCmp = new Date(a.wr_datetime) - new Date(b.wr_datetime);
          if (dtCmp !== 0) return dtCmp;
          return Number(a.wr_id) - Number(b.wr_id);
        }).pop()
      : root;

    if (!this._isAnsweredRow(target)) return null;
    return target.wr_last || null;
  }

  /** ??? + 2? ?? ? ?? ?? */
  async autoCloseThreadIfExpired(rootWrId) {
    const root = await this.findById(rootWrId);
    if (!root || this._isClosedRow(root)) return root;

    const answerDateRaw = await this.findLastQuestionAnswerDate(rootWrId);
    if (!answerDateRaw) return root;

    const answerDay = this._startOfDay(answerDateRaw);
    const closeDay = new Date(answerDay);
    closeDay.setDate(closeDay.getDate() + 2);

    const today = this._startOfDay(new Date());
    if (today >= closeDay) {
      return this.closeThread(rootWrId);
    }
    return root;
  }

  async closeThread(rootWrId) {
    return this.update(rootWrId, {
      is_closed: 1,
      wr_last: new Date(),
    });
  }

  async deleteByIdAndMbId(wrId, mbId) {
    const [result] = await pool.query(
      'DELETE FROM bomiora_write_online WHERE wr_id = ? AND mb_id = ?',
      [wrId, mbId]
    );
    return result.affectedRows > 0;
  }
}

module.exports = new QaRepository();
