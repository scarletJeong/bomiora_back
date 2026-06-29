const crypto = require('crypto');
const pool = require('../../../../config/database');

function hashFcmToken(fcmToken) {
  return crypto.createHash('sha256').update(fcmToken, 'utf8').digest('hex');
}

class NotificationRepository {
  async findSettingsByMbId(mbId) {
    const [rows] = await pool.query(
      `SELECT mb_notif_order, mb_notif_marketing, mb_notif_app_push, mb_notif_sms
       FROM bomiora_member
       WHERE mb_id = ?
       LIMIT 1`,
      [mbId]
    );
    return rows[0] || null;
  }

  async updateSettings(mbId, settings) {
    await pool.query(
      `UPDATE bomiora_member
       SET mb_notif_order = ?,
           mb_notif_marketing = ?,
           mb_notif_app_push = ?,
           mb_notif_sms = ?
       WHERE mb_id = ?`,
      [
        settings.orderAgree ? 1 : 0,
        settings.marketingAgree ? 1 : 0,
        settings.appPushAgree ? 1 : 0,
        settings.smsAgree ? 1 : 0,
        mbId,
      ]
    );
  }

  async upsertFcmToken({ mbId, fcmToken, platform }) {
    const tokenHash = hashFcmToken(fcmToken);
    await pool.query(
      `INSERT INTO bomiora_member_fcm_token (mb_id, fcm_token, fcm_token_hash, platform)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         mb_id = VALUES(mb_id),
         fcm_token = VALUES(fcm_token),
         platform = VALUES(platform),
         updated_at = CURRENT_TIMESTAMP`,
      [mbId, fcmToken, tokenHash, platform]
    );
  }

  async deleteFcmToken(fcmToken) {
    const tokenHash = hashFcmToken(fcmToken);
    await pool.query(
      'DELETE FROM bomiora_member_fcm_token WHERE fcm_token_hash = ?',
      [tokenHash]
    );
  }

  async findTokensByMbId(mbId) {
    const [rows] = await pool.query(
      `SELECT fcm_token, platform
       FROM bomiora_member_fcm_token
       WHERE mb_id = ?`,
      [mbId]
    );
    return rows;
  }

  async memberExists(mbId) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM bomiora_member WHERE mb_id = ?',
      [mbId]
    );
    return rows[0]?.cnt > 0;
  }
}

module.exports = new NotificationRepository();
