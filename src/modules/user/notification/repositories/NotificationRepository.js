const crypto = require('crypto');
const pool = require('../../../../config/database');
const { TtlCache } = require('../../../../utils/ttlCache');

const settingsCache = new TtlCache(180_000);

function hashFcmToken(fcmToken) {
  return crypto.createHash('sha256').update(fcmToken, 'utf8').digest('hex');
}

class NotificationRepository {
  cacheKey(mbId) {
    return `settings:${String(mbId || '').trim()}`;
  }

  rememberSettings(mbId, row) {
    const id = String(mbId || '').trim();
    if (!id || !row) return;
    settingsCache.set(this.cacheKey(id), row);
  }

  warmSettings(mbId) {
    const id = String(mbId || '').trim();
    if (!id) return;
    this.findSettingsByMbId(id).catch(() => {});
  }

  async findSettingsByMbId(mbId) {
    const id = String(mbId || '').trim();
    if (!id) return null;
    return settingsCache.getOrSet(this.cacheKey(id), async () => {
      const [rows] = await pool.query(
        `SELECT mb_notif_order, mb_notif_marketing, mb_notif_app_push, mb_notif_sms
         FROM bomiora_member
         WHERE mb_id = ?
         LIMIT 1`,
        [id]
      );
      return rows[0] || null;
    });
  }

  async updateSettings(mbId, settings) {
    const id = String(mbId || '').trim();
    const order = settings.orderAgree ? 1 : 0;
    const marketing = settings.marketingAgree ? 1 : 0;
    const appPush = settings.appPushAgree ? 1 : 0;
    const sms = settings.smsAgree ? 1 : 0;
    const [result] = await pool.query(
      `UPDATE bomiora_member
       SET mb_notif_order = ?,
           mb_notif_marketing = ?,
           mb_notif_app_push = ?,
           mb_notif_sms = ?,
           mb_mailling = ?,
           mb_sms = ?
       WHERE mb_id = ?`,
      [order, marketing, appPush, sms, marketing, marketing, id]
    );
    if (!result.affectedRows) return false;
    this.rememberSettings(id, {
      mb_notif_order: order,
      mb_notif_marketing: marketing,
      mb_notif_app_push: appPush,
      mb_notif_sms: sms,
    });
    return true;
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
    const row = await this.findSettingsByMbId(mbId);
    return !!row;
  }
}

module.exports = new NotificationRepository();
