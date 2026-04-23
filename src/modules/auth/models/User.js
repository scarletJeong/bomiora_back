/**
 * User 모델
 * bomiora_member 테이블과 매핑
 */
class User {
  constructor(data) {
    const toString = (value) => {
      if (Buffer.isBuffer(value)) return value.toString('utf8');
      if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
        try {
          return Buffer.from(value.data).toString('utf8');
        } catch (e) {
          return null;
        }
      }
      return value == null ? null : String(value);
    };
    this.id = data.mb_no || null;
    this.mbId = toString(data.mb_id);
    this.email = toString(data.mb_email);
    this.password = data.mb_password || null;
    this.name = toString(data.mb_name);
    this.nickname = toString(data.mb_nick);
    this.mbHp = toString(data.mb_hp);
    this.mbBirth = User.normalizeMbBirth(data.mb_birth, toString);
    this.mbSex = toString(data.mb_sex);
    this.profileImg = toString(data.profile_img);
    this.createdAt = data.mb_datetime || null;
    this.lastLoginAt = data.mb_today_login || null;
    this.leaveDate = toString(data.mb_leave_date);
    this.memo = toString(data.mb_memo);
    this.mbDupinfo = toString(data.mb_dupinfo);
  }

  /**
   * bomiora_member.mb_birth (DATE / 문자열 / 0000-00-00) → YYYYMMDD 또는 null
   */
  static normalizeMbBirth(raw, toString) {
    if (raw == null || raw === '') return null;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      const y = raw.getFullYear();
      if (y <= 0 || y < 1900) return null;
      const m = String(raw.getMonth() + 1).padStart(2, '0');
      const d = String(raw.getDate()).padStart(2, '0');
      return `${y}${m}${d}`;
    }
    const s = String(toString(raw) || '').trim();
    if (!s || s.startsWith('0000-00-00')) return null;
    const digits = s.replace(/\D/g, '');
    if (digits.length >= 8) return digits.slice(0, 8);
    return null;
  }

  /**
   * User 객체를 응답용 객체로 변환
   */
  toResponse() {
    const birth = (this.mbBirth || '').trim();
    const sex = (this.mbSex || '').trim();
    return {
      mb_id: this.mbId || this.email,
      mb_no: this.id,
      mb_email: this.email,
      email: this.email,
      mb_name: this.name,
      name: this.name,
      mb_nick: this.nickname,
      nickname: this.nickname,
      mb_hp: this.mbHp,
      phone: this.mbHp,
      profile_img: this.profileImg || '',
      profileImage: this.profileImg || '',
      // Flutter UserModel.fromJson: birthDate / sex + mb_birth / mb_sex
      ...(birth ? { mb_birth: birth, birthDate: birth } : {}),
      ...(sex ? { mb_sex: sex, sex } : {}),
    };
  }
}

module.exports = User;
