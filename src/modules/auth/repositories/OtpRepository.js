const pool = require('../../../config/database');

class OtpRepository {
  async getLatestByPhoneAndPurpose(mbHp, purpose) {
    const [rows] = await pool.query(
      `SELECT otp_id, otp_token, otp_purpose, mb_hp, expires_at, verified_yn, try_count, reg_time
       FROM bm_member_sms_otp
       WHERE mb_hp = ?
         AND otp_purpose = ?
       ORDER BY otp_id DESC
       LIMIT 1`,
      [mbHp, purpose]
    );
    return rows?.[0] || null;
  }

  async findByToken(token) {
    const [rows] = await pool.query(
      `SELECT otp_id, otp_token, otp_purpose, mb_hp, mb_name, otp_code_hash, expires_at, verified_yn, try_count, ip_addr, reg_time
       FROM bm_member_sms_otp
       WHERE otp_token = ?
       LIMIT 1`,
      [token]
    );
    return rows?.[0] || null;
  }

  async insertOtp({
    token,
    purpose,
    mbHp,
    mbName,
    codeHash,
    expiresAt,
    ipAddr,
  }) {
    const [result] = await pool.query(
      `INSERT INTO bm_member_sms_otp
       (otp_token, otp_purpose, mb_hp, mb_name, otp_code_hash, expires_at, verified_yn, try_count, ip_addr, reg_time)
       VALUES (?, ?, ?, ?, ?, ?, 'N', 0, ?, NOW())`,
      [token, purpose, mbHp, mbName, codeHash, expiresAt, ipAddr]
    );
    return result?.insertId;
  }

  async deleteById(otpId) {
    await pool.query('DELETE FROM bm_member_sms_otp WHERE otp_id = ?', [otpId]);
  }

  async markVerified(otpId) {
    await pool.query(
      `UPDATE bm_member_sms_otp
       SET verified_yn = 'Y'
       WHERE otp_id = ?`,
      [otpId]
    );
  }

  async incrementTryCountAndMaybeLock(otpId, nextTryCount, lock) {
    await pool.query(
      `UPDATE bm_member_sms_otp
       SET try_count = ?,
           verified_yn = ?
       WHERE otp_id = ?`,
      [nextTryCount, lock ? 'X' : 'N', otpId]
    );
  }
}

module.exports = new OtpRepository();

