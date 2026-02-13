const userRepository = require('../repositories/UserRepository');
const { verifyPBKDF2Password, mysqlPassword } = require('../../../utils/passwordUtil');
const fs = require('fs');
const path = require('path');

class UserController {
  /**
   * 서버 상태 확인
   */
  async test(req, res) {
    try {
      res.json({ message: 'Node.js 서버 실행 중!' });
    } catch (error) {
      console.error('❌ [UserController] test 오류:', error);
      res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다.'
      });
    }
  }

  /**
   * 모든 사용자 조회
   */
  async getAllUsers(req, res) {
    try {
      const users = await userRepository.findAll();
      res.json(users.map(user => user.toResponse()));
    } catch (error) {
      console.error('❌ [UserController] getAllUsers 오류:', error);
      res.status(500).json({
        success: false,
        message: '사용자 목록 조회 중 오류가 발생했습니다.'
      });
    }
  }

  /**
   * 로그인
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;
      
      console.log('🔐 [LOGIN] 로그인 시도:', email);

      // 1. 이메일로 사용자 조회
      const user = await userRepository.findByEmail(email);
      
      if (!user) {
        console.log('❌ [LOGIN] 사용자를 찾을 수 없음');
        return res.json({
          success: false,
          message: '가입된 회원이 아니거나 비밀번호가 틀립니다.'
        });
      }

      const storedHash = Buffer.isBuffer(user.password)
        ? user.password.toString('utf8')
        : String(user.password || '');
      const sha1PasswordFromFlutter = password; // Flutter에서 SHA1 해시된 값
      
      console.log('[LOGIN] DB 저장된 해시:', storedHash);
      console.log('[LOGIN] Flutter에서 받은 SHA1:', sha1PasswordFromFlutter);

      // 2. DB 저장된 해시 형식 확인
      let passwordMatch = false;
      
      if (!storedHash) {
        console.log('❌ [LOGIN] 저장된 비밀번호 해시가 비어 있음');
        return res.json({
          success: false,
          message: '가입된 회원이 아니거나 비밀번호가 틀립니다.'
        });
      }

      if (storedHash.startsWith('sha256:')) {
        // PBKDF2 방식 (PHP password_hash)
        console.log('[LOGIN] PBKDF2 방식으로 검증');
        passwordMatch = verifyPBKDF2Password(sha1PasswordFromFlutter, storedHash);
        
      } else if (storedHash.startsWith('*') && storedHash.length === 41) {
        // MySQL PASSWORD() 방식
        console.log('[LOGIN] MySQL PASSWORD() 방식으로 검증');
        const mysqlHash = mysqlPassword(sha1PasswordFromFlutter);
        console.log('[LOGIN] MySQL PASSWORD() 해시:', mysqlHash);
        passwordMatch = mysqlHash === storedHash;
        
      } else {
        // 알 수 없는 형식
        console.log('❌ [LOGIN] 알 수 없는 해시 형식');
        return res.json({
          success: false,
          message: '비밀번호 형식 오류'
        });
      }

      console.log('[LOGIN] 비밀번호 일치 여부:', passwordMatch);

      if (passwordMatch) {
        // 로그인 성공 - 마지막 로그인 시간 업데이트
        user.lastLoginAt = new Date();
        const updatedUser = await userRepository.update(user);

        const response = {
          success: true,
          user: updatedUser.toResponse(),
          token: 'token_' + Date.now(), // JWT 토큰으로 대체 가능
          message: '로그인 성공'
        };

        console.log('[LOGIN] 로그인 성공!');
        return res.json(response);
      } else {
        console.log('❌ [LOGIN] 비밀번호 불일치');
        return res.json({
          success: false,
          message: '가입된 회원이 아니거나 비밀번호가 틀립니다.'
        });
      }

    } catch (error) {
      console.error('❌ [LOGIN] 로그인 오류:', error);
      return res.json({
        success: false,
        message: '로그인 중 오류가 발생했습니다.'
      });
    }
  }

  /**
   * 회원가입
   */
  async register(req, res) {
    try {
      const { email, password, name, phone } = req.body;
      
      console.log('[REGISTER] 회원가입 시도:', email);

      // 1. 이메일 중복 확인
      const exists = await userRepository.existsByEmail(email);
      if (exists) {
        console.log('❌ [REGISTER] 이미 존재하는 이메일');
        return res.json({
          success: false,
          message: '이미 존재하는 이메일입니다.'
        });
      }

      // 2. Flutter에서 받은 SHA1 해시를 MySQL PASSWORD() 방식으로 해싱
      console.log('[REGISTER] Flutter에서 받은 SHA1:', password);
      const mysqlHash = mysqlPassword(password);
      console.log('[REGISTER] MySQL PASSWORD() 해시:', mysqlHash);

      // 3. 사용자 생성 및 저장
      const userData = {
        email,
        password: mysqlHash,
        name,
        mbHp: phone
      };

      const savedUser = await userRepository.create(userData);

      console.log('[REGISTER] 회원가입 성공!');
      
      return res.json({
        success: true,
        user: savedUser.toResponse(),
        message: '회원가입이 완료되었습니다.'
      });

    } catch (error) {
      console.error('❌ [REGISTER] 회원가입 오류:', error);
      return res.json({
        success: false,
        message: '회원가입 중 오류가 발생했습니다.'
      });
    }
  }

  /**
   * 프로필 수정
   */
  async updateProfile(req, res) {
    try {
      const { mbId, name, nickname, phone } = req.body;
      
      console.log('[UPDATE PROFILE] 프로필 수정 시도:', mbId);

      // 1. 사용자 조회 (mb_id로)
      const user = await userRepository.findByMbId(mbId);
      
      if (!user) {
        console.log('❌ [UPDATE PROFILE] 사용자를 찾을 수 없음');
        return res.json({
          success: false,
          message: '사용자를 찾을 수 없습니다.'
        });
      }

      // 2. 정보 업데이트
      if (name !== undefined && name !== null && name !== '') {
        user.name = name;
      }
      
      if (nickname !== undefined && nickname !== null) {
        user.nickname = nickname;
      }
      
      if (phone !== undefined && phone !== null) {
        user.mbHp = phone;
      }

      // 3. 저장
      const updatedUser = await userRepository.update(user);
      
      console.log('[UPDATE PROFILE] 프로필 수정 완료');
      
      return res.json({
        success: true,
        user: updatedUser.toResponse(),
        message: '프로필이 수정되었습니다.'
      });

    } catch (error) {
      console.error('❌ [UPDATE PROFILE] 프로필 수정 오류:', error);
      return res.json({
        success: false,
        message: '프로필 수정 중 오류가 발생했습니다.'
      });
    }
  }

  async uploadProfileImage(req, res) {
    try {
      const mbId = req.body.mbId || req.body.mb_id || req.query.mbId || req.query.mb_id;
      if (!mbId) {
        return res.status(400).json({
          success: false,
          message: 'mbId가 필요합니다.',
        });
      }
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: '업로드할 이미지 파일이 없습니다.',
        });
      }

      const user = await userRepository.findByMbId(mbId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: '사용자를 찾을 수 없습니다.',
        });
      }

      const relativePath = `/uploads/profiles/${mbId}/${req.file.filename}`;

      // 기존 파일 정리(같은 사용자 경로 내에서 현재 업로드 파일 제외)
      try {
        const userDir = path.join(process.cwd(), 'uploads', 'profiles', mbId);
        const files = fs.readdirSync(userDir);
        files
          .filter((f) => f !== req.file.filename)
          .forEach((f) => {
            const target = path.join(userDir, f);
            if (fs.existsSync(target)) fs.unlinkSync(target);
          });
      } catch (e) {
        // 파일 정리 실패는 업로드 성공에 영향 주지 않음
      }

      user.profileImg = relativePath;
      const updatedUser = await userRepository.update(user);

      return res.json({
        success: true,
        message: '프로필 이미지가 업로드되었습니다.',
        user: updatedUser.toResponse(),
      });
    } catch (error) {
      console.error('❌ [UPLOAD PROFILE IMAGE] 오류:', error);
      return res.status(500).json({
        success: false,
        message: '프로필 이미지 업로드 중 오류가 발생했습니다.',
      });
    }
  }
}

module.exports = new UserController();
