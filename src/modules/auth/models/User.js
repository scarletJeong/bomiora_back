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
    this.profileImg = toString(data.profile_img);
    this.createdAt = data.mb_datetime || null;
    this.lastLoginAt = data.mb_today_login || null;
  }

  /**
   * User 객체를 응답용 객체로 변환
   */
  toResponse() {
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
      profileImage: this.profileImg || ''
    };
  }
}

module.exports = User;
