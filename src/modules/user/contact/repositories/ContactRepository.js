const pool = require('../../../../config/database');

class ContactRepository {
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

  async findThreadByRoot(rootWrId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_write_online WHERE wr_parent = ? ORDER BY wr_datetime DESC, wr_id DESC',
      [rootWrId]
    );
    return rows;
  }

  async countFollowUpsByRoot({ rootWrId, mbId, mbEmail }) {
    const id = (mbId ?? '').toString().trim();
    const email = (mbEmail ?? '').toString().trim();
    if (!rootWrId) return 0;

    if (id && email) {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM bomiora_write_online
         WHERE wr_parent = ?
           AND wr_id <> ?
           AND (mb_id = ? OR wr_email = ?)`,
        [rootWrId, rootWrId, id, email]
      );
      return Number(rows[0]?.cnt || 0);
    }
    if (email) {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM bomiora_write_online
         WHERE wr_parent = ?
           AND wr_id <> ?
           AND wr_email = ?`,
        [rootWrId, rootWrId, email]
      );
      return Number(rows[0]?.cnt || 0);
    }
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM bomiora_write_online
       WHERE wr_parent = ?
         AND wr_id <> ?
         AND mb_id = ?`,
      [rootWrId, rootWrId, id]
    );
    return Number(rows[0]?.cnt || 0);
  }

  async findThreadsByIdentity({ mbId, mbEmail }) {
    const id = (mbId ?? '').toString().trim();
    const email = (mbEmail ?? '').toString().trim();
    if (!id && !email) return [];

    // 스레드(=wr_parent)별 최신 작성일 기준으로 "원글만" 반환
    // 목록 노출 날짜는 최신 작성일을 wr_datetime으로 내려줌 (요구사항: 최근 질문 작성일 기준 정렬)
    const where = [];
    const args = [];
    if (id) {
      where.push('mb_id = ?');
      args.push(id);
    }
    if (email) {
      where.push('wr_email = ?');
      args.push(email);
    }
    const whereSql = where.length ? `(${where.join(' OR ')})` : '1=0';

    const [rows] = await pool.query(
      `
      SELECT root.*,
             latest.latest_dt AS thread_last_datetime,
             latest.followup_cnt AS followup_count
      FROM bomiora_write_online root
      JOIN (
        SELECT wr_parent,
               MAX(wr_datetime) AS latest_dt,
               SUM(CASE WHEN wr_id <> wr_parent THEN 1 ELSE 0 END) AS followup_cnt
        FROM bomiora_write_online
        WHERE ${whereSql}
        GROUP BY wr_parent
      ) latest
        ON root.wr_id = latest.wr_parent
      ORDER BY latest.latest_dt DESC, root.wr_id DESC
      `,
      args
    );
    return rows;
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
       wr_subject, wr_content, wr_seo_title, wr_link1, wr_link2, wr_link1_hit, wr_link2_hit, wr_hit, wr_good, wr_nogood,
       mb_id, wr_password, wr_name, wr_email, wr_homepage, wr_datetime, wr_file, wr_last, wr_ip, wr_facebook_user, wr_twitter_user,
       wr_1, wr_2, wr_3, wr_4, wr_5, wr_6, wr_7, wr_8, wr_9, wr_10)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contact.wr_id, contact.wr_num, contact.wr_reply, contact.wr_parent, contact.wr_comment, contact.wr_comment_reply, contact.wr_is_comment,
        contact.ca_name, contact.wr_option, contact.wr_subject, contact.wr_content, contact.wr_seo_title, contact.wr_link1, contact.wr_link2,
        contact.wr_link1_hit, contact.wr_link2_hit, contact.wr_hit, contact.wr_good, contact.wr_nogood, contact.mb_id, contact.wr_password,
        contact.wr_name, contact.wr_email, contact.wr_homepage, contact.wr_datetime, contact.wr_file, contact.wr_last, contact.wr_ip,
        contact.wr_facebook_user, contact.wr_twitter_user, contact.wr_1, contact.wr_2, contact.wr_3, contact.wr_4, contact.wr_5, contact.wr_6,
        contact.wr_7, contact.wr_8, contact.wr_9, contact.wr_10
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

  async deleteByIdAndMbId(wrId, mbId) {
    const [result] = await pool.query(
      'DELETE FROM bomiora_write_online WHERE wr_id = ? AND mb_id = ?',
      [wrId, mbId]
    );
    return result.affectedRows > 0;
  }
}

module.exports = new ContactRepository();
