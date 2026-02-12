/**
 * User 모델
 * bomiora_member 테이블과 매핑
 */
class User {
  constructor(data) {
    this.id = data.mb_no || null;
    this.mbId = data.mb_id || null;
    this.email = data.mb_email || null;
    this.password = data.mb_password || null;
    this.name = data.mb_name || null;
    this.nickname = data.mb_nick || null;
    this.mbHp = data.mb_hp || null;
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
      phone: this.mbHp
    };
  }
}

module.exports = User;
