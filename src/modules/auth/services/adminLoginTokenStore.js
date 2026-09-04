const crypto = require('crypto');
const pool = require('../../../config/database');

const TABLE = 'bm_admin_login_token';

function ttlSeconds() {
  const ms = Number(process.env.ADMIN_AUTO_LOGIN_TTL_MS || 10 * 60 * 1000);
  return Math.max(60, Math.floor(ms / 1000));
}

class AdminLoginTokenStore {
  constructor() {
    this.ensured = false;
  }

  async ensureTable() {
    if (this.ensured) return;
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (
         token VARCHAR(64) NOT NULL,
         mb_id VARCHAR(50) NOT NULL,
         used_yn CHAR(1) NOT NULL DEFAULT 'N',
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         used_at DATETIME NULL,
         PRIMARY KEY (token),
         KEY idx_mb_id (mb_id),
         KEY idx_created_at (created_at)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    this.ensured = true;
  }

  async issue(mbId) {
    await this.ensureTable();
    const id = String(mbId || '').trim();
    const token = crypto.randomBytes(32).toString('hex');

    // 이 계정의 안 쓴 옛 토큰은 버리고, 이번 클릭분 하나만 남김
    await pool.query(
      `DELETE FROM ${TABLE} WHERE mb_id = ? AND used_yn = 'N'`,
      [id]
    );
    await pool.query(
      `DELETE FROM ${TABLE}
        WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)
           OR (used_yn = 'Y' AND used_at < DATE_SUB(NOW(), INTERVAL 1 DAY))`
    );

    await pool.query(
      `INSERT INTO ${TABLE} (token, mb_id, used_yn, created_at)
       VALUES (?, ?, 'N', NOW())`,
      [token, id]
    );
    return { token, mbId: id };
  }

  /**
   * 미사용: 발급 후 TTL(기본 10분) 안에만 유효
   * 사용됨: 거절 (브라우저가 같은 URL을 두 번 치는 경우만 60초 유예)
   */
  async consume(token) {
    await this.ensureTable();
    const key = String(token || '').trim();
    if (!key) return { ok: false, reason: 'not_found' };

    const [rows] = await pool.query(
      `SELECT token, mb_id, used_yn, created_at, used_at
         FROM ${TABLE}
        WHERE token = ?
        LIMIT 1`,
      [key]
    );
    const row = rows?.[0];
    if (!row) return { ok: false, reason: 'not_found' };

    const mbId = String(row.mb_id || '').trim();
    const used = String(row.used_yn || 'N').toUpperCase() === 'Y';
    const ttl = ttlSeconds();

    if (used) {
      const [grace] = await pool.query(
        `SELECT 1 FROM ${TABLE}
          WHERE token = ?
            AND used_yn = 'Y'
            AND used_at IS NOT NULL
            AND used_at >= DATE_SUB(NOW(), INTERVAL 60 SECOND)
          LIMIT 1`,
        [key]
      );
      if (grace?.length) return { ok: true, mbId };
      return { ok: false, reason: 'used' };
    }

    const [fresh] = await pool.query(
      `SELECT 1 FROM ${TABLE}
        WHERE token = ?
          AND used_yn = 'N'
          AND created_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)
        LIMIT 1`,
      [key, ttl]
    );
    if (!fresh?.length) return { ok: false, reason: 'expired' };

    await pool.query(
      `UPDATE ${TABLE}
          SET used_yn = 'Y', used_at = NOW()
        WHERE token = ? AND used_yn = 'N'`,
      [key]
    );
    return { ok: true, mbId };
  }
}

module.exports = new AdminLoginTokenStore();
