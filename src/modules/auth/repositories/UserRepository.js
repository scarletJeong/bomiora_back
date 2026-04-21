const pool = require('../../../config/database');
const User = require('../models/User');

class UserRepository {
  /**
   * 모든 사용자 조회
   */
  async findAll() {
    try {
      const [rows] = await pool.query('SELECT * FROM bomiora_member');
      return rows.map(row => new User(row));
    } catch (error) {
      console.error('❌ [UserRepository] findAll 오류:', error);
      throw error;
    }
  }

  /**
   * 이메일로 사용자 조회
   */
  async findByEmail(email) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM bomiora_member WHERE mb_email = ?',
        [email]
      );
      return rows.length > 0 ? new User(rows[0]) : null;
    } catch (error) {
      console.error('❌ [UserRepository] findByEmail 오류:', error);
      throw error;
    }
  }

  /**
   * mb_id로 사용자 조회
   */
  async findByMbId(mbId) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM bomiora_member WHERE mb_id = ?',
        [mbId]
      );
      return rows.length > 0 ? new User(rows[0]) : null;
    } catch (error) {
      console.error('❌ [UserRepository] findByMbId 오류:', error);
      throw error;
    }
  }

  async existsByMbId(mbId) {
    try {
      const [rows] = await pool.query(
        'SELECT COUNT(*) as count FROM bomiora_member WHERE mb_id = ?',
        [mbId]
      );
      return rows[0].count > 0;
    } catch (error) {
      console.error('❌ [UserRepository] existsByMbId 오류:', error);
      throw error;
    }
  }

  /**
   * 이름 + 휴대폰 번호로 사용자 목록 조회
   */
  async findByNameAndPhone(name, phone) {
    try {
      const normalizedPhone = String(phone || '').replace(/[^0-9]/g, '');
      const [rows] = await pool.query(
        `SELECT * 
         FROM bomiora_member 
         WHERE mb_name = ?
           AND REPLACE(REPLACE(REPLACE(IFNULL(mb_hp, ''), '-', ''), ' ', ''), '.', '') = ?
         ORDER BY mb_no DESC`,
        [name, normalizedPhone]
      );
      return rows.map(row => new User(row));
    } catch (error) {
      console.error('❌ [UserRepository] findByNameAndPhone 오류:', error);
      throw error;
    }
  }

  async findByEmailNameAndPhone(email, name, phone) {
    try {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const normalizedPhone = String(phone || '').replace(/[^0-9]/g, '');
      const [rows] = await pool.query(
        `SELECT *
         FROM bomiora_member
         WHERE LOWER(IFNULL(mb_email, '')) = ?
           AND mb_name = ?
           AND REPLACE(REPLACE(REPLACE(IFNULL(mb_hp, ''), '-', ''), ' ', ''), '.', '') = ?
         ORDER BY mb_no DESC
         LIMIT 1`,
        [normalizedEmail, name, normalizedPhone]
      );
      return rows.length > 0 ? new User(rows[0]) : null;
    } catch (error) {
      console.error('❌ [UserRepository] findByEmailNameAndPhone 오류:', error);
      throw error;
    }
  }

  /**
   * 이메일 존재 여부 확인
   */
  async existsByEmail(email) {
    try {
      const [rows] = await pool.query(
        'SELECT COUNT(*) as count FROM bomiora_member WHERE mb_email = ?',
        [email]
      );
      return rows[0].count > 0;
    } catch (error) {
      console.error('❌ [UserRepository] existsByEmail 오류:', error);
      throw error;
    }
  }

  /**
   * 본인인증 고유값(dupinfo/mb_dupinfo) 존재 여부 확인
   * - bomiora_member.mb_dupinfo 에 저장된 값 기준
   * - 탈퇴 시 mb_dupinfo='' 로 비워지므로, 재가입을 허용하려면 DB 정책대로 동작
   */
  async existsByDupInfo(dupInfo) {
    try {
      const v = String(dupInfo || '').trim();
      if (!v) return false;
      const [rows] = await pool.query(
        'SELECT COUNT(*) as count FROM bomiora_member WHERE mb_dupinfo = ?',
        [v]
      );
      return rows[0].count > 0;
    } catch (error) {
      console.error('❌ [UserRepository] existsByDupInfo 오류:', error);
      throw error;
    }
  }

  /**
   * 사용자 생성
   */
  async create(userData) {
    let conn;
    try {
      const {
        email,
        password,
        name,
        mbHp,
        birthday,
        gender,
        certInfo,
        agreements,
        clientIp,
        mbIdPrefix,
      } = userData;
      const nowKstDateTime = getKstDateTimeString();
      const nowKstDate = getKstDateString();
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const mbNo = await this.generateNextMbNo(conn);
      const mbId = await this.generateUniqueMbId(email, mbIdPrefix || 'direct', conn);
      const normalizedBirth = normalizeBirth(birthday || certInfo?.birthday || '');
      const normalizedSex = normalizeSex(gender || certInfo?.gender || certInfo?.sex_code || '');
      const dupInfo = String(
        certInfo?.mb_dupinfo ||
        certInfo?.mbDupinfo ||
        certInfo?.dupinfo ||
        certInfo?.dupInfo ||
        certInfo?.di ||
        ''
      ).trim();
      const ip = String(clientIp || '');
      const marketingEmail = agreements?.marketingEmail === true ? 1 : 0;
      const marketingSms = agreements?.marketingSms === true ? 1 : 0;
      const initialPoint = 5000;

      console.log('[UserRepository.create] 저장 요청 부가 데이터:', {
        mbNo,
        mbId,
        birthday: normalizedBirth || null,
        gender: normalizedSex || null,
        clientIp: ip || null,
        hasCertInfo: !!certInfo,
        agreements: agreements || null,
      });
      
      await conn.query(
        `INSERT INTO bomiora_member 
         (
           mb_no, mb_id, mb_email, mb_password, mb_name, mb_nick, mb_nick_date,
           mb_sex, mb_birth, mb_hp, mb_certify, mb_dupinfo, mb_point,
           mb_datetime, mb_today_login, mb_email_certify, mb_login_ip, mb_ip,
           mb_mailling, mb_sms
         ) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mbNo,
          mbId,
          email,
          password,
          name,
          name,
          nowKstDate,
          normalizedSex,
          normalizedBirth,
          mbHp || '',
          'hp',
          dupInfo,
          initialPoint,
          nowKstDateTime,
          nowKstDateTime,
          nowKstDateTime,
          ip,
          ip,
          marketingEmail,
          marketingSms,
        ]
      );

      await conn.query(
        `INSERT INTO bomiora_point
         (
           mb_id, po_datetime, po_content, po_point, po_use_point,
           po_mb_point, po_expired, po_expire_date, po_rel_table, po_rel_id, po_rel_action
         )
         VALUES (?, ?, ?, ?, 0, ?, 0, DATE_ADD(?, INTERVAL 1 YEAR), '@member', ?, '회원가입')`,
        [mbId, nowKstDateTime, '회원가입 축하', initialPoint, initialPoint, nowKstDateTime, mbId]
      );

      if (normalizedBirth || normalizedSex || dupInfo || (mbHp && mbHp.length > 0)) {
        try {
          await conn.query(
            `INSERT INTO bomiora_member_cert_history
             (mb_id, ch_name, ch_hp, ch_birth, ch_type, ch_datetime)
             VALUES (?, ?, ?, ?, 'hp', ?)`,
            [mbId, name, mbHp || '', normalizedBirth || '', nowKstDateTime]
          );
        } catch (historyError) {
          console.warn('⚠️ [UserRepository] cert history 저장 스킵:', historyError?.message || historyError);
        }
      }

      await conn.commit();

      // 생성된 사용자 조회
      const [rows] = await conn.query(
        'SELECT * FROM bomiora_member WHERE mb_no = ?',
        [mbNo]
      );

      return rows.length > 0 ? new User(rows[0]) : null;
    } catch (error) {
      if (conn) {
        try {
          await conn.rollback();
        } catch (_) {}
      }
      console.error('❌ [UserRepository] create 오류:', error);
      throw error;
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }

  async generateNextMbNo(executor = pool) {
    try {
      const [rows] = await executor.query(
        'SELECT COALESCE(MAX(mb_no), 0) + 1 AS nextMbNo FROM bomiora_member FOR UPDATE'
      );
      return Number(rows[0].nextMbNo);
    } catch (error) {
      console.error('❌ [UserRepository] generateNextMbNo 오류:', error);
      throw error;
    }
  }

  async generateUniqueMbId(email, prefix = 'direct', executor = pool) {
    const base = this.buildMbIdBase(email, prefix);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-(10 + attempt % 3));
      const candidate = `${base}_${suffix}`.slice(0, 30);
      const [rows] = await executor.query(
        'SELECT COUNT(*) as count FROM bomiora_member WHERE mb_id = ?',
        [candidate]
      );
      const exists = rows[0].count > 0;
      if (!exists) {
        return candidate;
      }
    }

    throw new Error('고유한 회원 ID 생성에 실패했습니다.');
  }

  buildMbIdBase(email, prefix = 'direct') {
    const normalizedPrefix = String(prefix || 'direct').toLowerCase().replace(/[^a-z0-9]/g, '') || 'direct';
    const localPart = String(email || '')
      .split('@')
      .shift()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'member';

    const base = localPart.slice(0, 18);
    return `${normalizedPrefix}_${base || 'member'}`;
  }

  /**
   * 사용자 업데이트
   */
  async update(user) {
    try {
      const updateFields = [];
      const updateValues = [];

      if (user.name !== undefined) {
        updateFields.push('mb_name = ?');
        updateValues.push(user.name);
      }
      if (user.nickname !== undefined) {
        updateFields.push('mb_nick = ?');
        updateValues.push(user.nickname);
      }
      if (user.mbHp !== undefined) {
        updateFields.push('mb_hp = ?');
        updateValues.push(user.mbHp);
      }
      if (user.profileImg !== undefined) {
        updateFields.push('profile_img = ?');
        updateValues.push(user.profileImg);
      }
      if (user.lastLoginAt !== undefined) {
        updateFields.push('mb_today_login = ?');
        updateValues.push(user.lastLoginAt);
      }

      if (updateFields.length === 0) {
        return user;
      }

      updateValues.push(user.id);

      await pool.query(
        `UPDATE bomiora_member 
         SET ${updateFields.join(', ')} 
         WHERE mb_no = ?`,
        updateValues
      );

      // 업데이트된 사용자 조회
      const [rows] = await pool.query(
        'SELECT * FROM bomiora_member WHERE mb_no = ?',
        [user.id]
      );

      return rows.length > 0 ? new User(rows[0]) : null;
    } catch (error) {
      console.error('❌ [UserRepository] update 오류:', error);
      throw error;
    }
  }

  async updatePasswordByMbNo(mbNo, passwordHash) {
    try {
      await pool.query(
        `UPDATE bomiora_member
         SET mb_password = ?
         WHERE mb_no = ?`,
        [passwordHash, mbNo]
      );

      const [rows] = await pool.query(
        'SELECT * FROM bomiora_member WHERE mb_no = ?',
        [mbNo]
      );

      return rows.length > 0 ? new User(rows[0]) : null;
    } catch (error) {
      console.error('❌ [UserRepository] updatePasswordByMbNo 오류:', error);
      throw error;
    }
  }

  /**
   * 회원 본인 탈퇴(Soft Delete)
   * - bomiora_member: leave_date/memo/본인인증 관련 필드 갱신
   * - bomiora_member_social_profiles: 정책값에 따라 익명화 또는 즉시 삭제
   */
  async softDeleteMember({ mbId, reason = '', socialDeleteDay = 0 }) {
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [rows] = await conn.query(
        `SELECT mb_id, mb_leave_date, mb_memo
         FROM bomiora_member
         WHERE mb_id = ?
         LIMIT 1
         FOR UPDATE`,
        [mbId]
      );

      if (!rows.length) {
        await conn.rollback();
        return { success: false, code: 'NOT_FOUND' };
      }

      const member = rows[0];
      const todayYmd = getYmdString();
      const alreadyLeft = String(member.mb_leave_date || '').trim();
      if (alreadyLeft && alreadyLeft <= todayYmd) {
        await conn.rollback();
        return { success: true, alreadyLeft: true };
      }

      const safeReason = String(reason || '').trim().replace(/\s+/g, ' ').slice(0, 200);
      const leaveLine = safeReason
        ? `${todayYmd} 탈퇴함_${safeReason}`
        : `${todayYmd} 탈퇴함`;
      const oldMemo = String(member.mb_memo || '').trim();
      const nextMemo = oldMemo ? `${leaveLine}\n${oldMemo}` : leaveLine;

      await conn.query(
        `UPDATE bomiora_member
         SET mb_leave_date = ?,
             mb_memo = ?,
             mb_email = '',
             mb_sex = '',
             mb_birth = '',
             mb_hp = '',
             mb_point = 0,
             mb_certify = '',
             mb_adult = 0,
             mb_dupinfo = ''
         WHERE mb_id = ?`,
        [todayYmd, nextMemo, mbId]
      );

      const nowDateTime = getKstDateTimeString();

      if (Number(socialDeleteDay) > 0) {
        await conn.query(
          `UPDATE bomiora_member_social_profiles
           SET mb_id = '',
               object_sha = '',
               profileurl = '',
               photourl = '',
               displayname = '',
               mp_latest_day = ?
           WHERE mb_id = ?`,
          [nowDateTime, mbId]
        );

        const cutoffDateTime = getKstDateTimeBeforeDays(Number(socialDeleteDay));
        await conn.query(
          `DELETE FROM bomiora_member_social_profiles
           WHERE mb_id = ''
             AND mp_latest_day < ?`,
          [cutoffDateTime]
        );
      } else {
        await conn.query(
          'DELETE FROM bomiora_member_social_profiles WHERE mb_id = ?',
          [mbId]
        );
      }

      await conn.commit();
      return { success: true, alreadyLeft: false };
    } catch (error) {
      if (conn) {
        try {
          await conn.rollback();
        } catch (_) {}
      }
      console.error('❌ [UserRepository] softDeleteMember 오류:', error);
      throw error;
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }
}

module.exports = new UserRepository();

function getKstDateTimeString() {
  const now = new Date(Date.now() + (9 * 60 * 60 * 1000));
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const minute = String(now.getUTCMinutes()).padStart(2, '0');
  const second = String(now.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function getKstDateString() {
  return getKstDateTimeString().slice(0, 10);
}

function normalizeBirth(value) {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 8);
}

function normalizeSex(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'M' || normalized === 'MALE' || normalized === '01' || normalized === '1') {
    return 'M';
  }
  if (normalized === 'F' || normalized === 'FEMALE' || normalized === '02' || normalized === '2') {
    return 'F';
  }
  return '';
}

function getYmdString() {
  const now = new Date(Date.now() + (9 * 60 * 60 * 1000));
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function getKstDateTimeBeforeDays(days) {
  const ms = Date.now() + (9 * 60 * 60 * 1000) - (days * 24 * 60 * 60 * 1000);
  const dt = new Date(ms);
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  const hour = String(dt.getUTCHours()).padStart(2, '0');
  const minute = String(dt.getUTCMinutes()).padStart(2, '0');
  const second = String(dt.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
