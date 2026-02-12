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
   * 사용자 생성
   */
  async create(userData) {
    try {
      const { email, password, name, mbHp } = userData;
      const now = new Date();
      
      const [result] = await pool.query(
        `INSERT INTO bomiora_member 
         (mb_email, mb_password, mb_name, mb_hp, mb_datetime) 
         VALUES (?, ?, ?, ?, ?)`,
        [email, password, name, mbHp, now]
      );

      // 생성된 사용자 조회
      const [rows] = await pool.query(
        'SELECT * FROM bomiora_member WHERE mb_no = ?',
        [result.insertId]
      );

      return rows.length > 0 ? new User(rows[0]) : null;
    } catch (error) {
      console.error('❌ [UserRepository] create 오류:', error);
      throw error;
    }
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
}

module.exports = new UserRepository();
