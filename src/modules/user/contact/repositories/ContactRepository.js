const pool = require('../../../../config/database');

class ContactRepository {
  async findByMbId(mbId) {
    const [rows] = await pool.query(
      'SELECT * FROM bomiora_write_online WHERE mb_id = ? ORDER BY wr_datetime DESC',
      [mbId]
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
}

module.exports = new ContactRepository();
