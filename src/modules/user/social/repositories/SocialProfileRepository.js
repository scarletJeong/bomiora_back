const crypto = require('crypto');
const pool = require('../../../../config/database');
const {
  getKstDateTimeString,
} = require('../utils/requestUtil');

const SOCIAL_TABLE = 'bomiora_member_social_profiles';

class SocialProfileRepository {
  async findByProviderAndIdentifier(provider, identifier) {
    const [rows] = await pool.query(
      `SELECT *
       FROM ${SOCIAL_TABLE}
       WHERE provider = ?
         AND identifier = ?
         AND mb_id IS NOT NULL
         AND mb_id != ''
       ORDER BY mp_no DESC
       LIMIT 1`,
      [provider, String(identifier)]
    );
    return rows[0] || null;
  }

  async findByProviderAndOldIdentifier(provider, identifier) {
    try {
      const [rows] = await pool.query(
        `SELECT *
         FROM ${SOCIAL_TABLE}
         WHERE provider = ?
           AND old_identifier = ?
           AND mb_id IS NOT NULL
           AND mb_id != ''
         ORDER BY mp_no DESC
         LIMIT 1`,
        [provider, String(identifier)]
      );
      return rows[0] || null;
    } catch (error) {
      if (error?.code === 'ER_BAD_FIELD_ERROR') {
        return null;
      }
      throw error;
    }
  }

  async existsLinkedAccount(provider, identifier) {
    const row = await this.findByProviderAndIdentifier(provider, identifier);
    return !!row?.mb_id;
  }

  /**
   * PHP social_user_profile_replace() — REPLACE INTO social_profiles
   */
  async upsertProfile(mbId, provider, profile = {}) {
    const now = getKstDateTimeString();
    const identifier = String(profile.identifier || '').trim();
    if (!mbId || !provider || !identifier) {
      throw new Error('소셜 프로필 저장에 필요한 값이 없습니다.');
    }

    const objectSha = crypto
      .createHash('sha1')
      .update(JSON.stringify(profile))
      .digest('hex');

    const [existingRows] = await pool.query(
      `SELECT mp_no, mp_register_day
       FROM ${SOCIAL_TABLE}
       WHERE mb_id = ? AND provider = ? AND identifier = ?
       LIMIT 1`,
      [mbId, provider, identifier]
    );
    const existing = existingRows[0] || null;

    await pool.query(
      `REPLACE INTO ${SOCIAL_TABLE}
       (mp_no, mb_id, provider, object_sha, identifier, profileurl, photourl,
        displayname, description, mp_register_day, mp_latest_day)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        existing?.mp_no || null,
        mbId,
        provider,
        objectSha,
        identifier,
        String(profile.profileUrl || profile.profileurl || ''),
        String(profile.photoUrl || profile.photourl || ''),
        String(profile.displayName || profile.displayname || ''),
        String(profile.description || ''),
        existing?.mp_register_day || now,
        now,
      ]
    );
  }
}

module.exports = new SocialProfileRepository();
