const userRepository = require('../repositories/UserRepository');
const { verifyPBKDF2Password, mysqlPassword, createPBKDF2Password } = require('../../../utils/passwordUtil');
const fs = require('fs');
const path = require('path');

class UserController {
  async checkEmail(req, res) {
    try {
      const email = normalizeEmail(req.body?.email);

      if (!email) {
        return res.status(400).json({
          success: false,
          message: '이메일을 입력해 주세요.',
        });
      }

      const exists = await userRepository.existsByEmail(email);
      return res.json({
        success: true,
        exists,
        message: exists ? '이미 존재하는 이메일입니다.' : '사용 가능한 이메일입니다.',
      });
    } catch (error) {
      console.error('❌ [CHECK EMAIL] 이메일 중복 확인 오류:', error);
      return res.status(500).json({
        success: false,
        message: '이메일 중복 확인 중 오류가 발생했습니다.',
      });
    }
  }

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
        user.lastLoginAt = getKstDateTimeString();
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
      const {
        email,
        password,
        name,
        phone,
        birthday,
        gender,
        certInfo,
        agreements,
      } = req.body;

      const normalizedEmail = normalizeEmail(email);
      const resolvedName = String(name || certInfo?.name || '').trim();
      const resolvedPhone = normalizePhone(phone || certInfo?.phone || '');
      const resolvedBirthday = String(birthday || certInfo?.birthday || '').trim() || null;
      const resolvedGender = String(gender || certInfo?.gender || '').trim() || null;
      
      console.log('[REGISTER] 회원가입 시도:', normalizedEmail);
      console.log('[REGISTER] 본인인증 완료 여부:', certInfo ? true : false);
      console.log('[REGISTER] 약관 동의 데이터:', agreements || null);

      if (!normalizedEmail || !password || !resolvedName) {
        return res.status(400).json({
          success: false,
          message: '이메일, 비밀번호, 이름은 필수입니다.',
        });
      }

      if (!agreements || agreements.terms !== true || agreements.privacy !== true) {
        return res.status(400).json({
          success: false,
          message: '필수 약관 동의가 필요합니다.',
        });
      }

      if (!certInfo || certInfo.cert_completed !== true) {
        return res.status(400).json({
          success: false,
          message: '본인인증 완료 정보가 필요합니다.',
        });
      }

      // 1. 이메일 중복 확인
      const exists = await userRepository.existsByEmail(normalizedEmail);
      if (exists) {
        console.log('❌ [REGISTER] 이미 존재하는 이메일');
        return res.json({
          success: false,
          message: '이미 존재하는 이메일입니다.'
        });
      }

      // 2. PHP 회원가입 포맷과 동일하게 PBKDF2 저장 문자열 생성
      const pbkdf2Hash = createPBKDF2Password(password);
      console.log('[REGISTER] PBKDF2 저장 포맷 해시 생성 완료');

      // 3. 사용자 생성 및 저장
      const userData = {
        email: normalizedEmail,
        password: pbkdf2Hash,
        name: resolvedName,
        mbHp: resolvedPhone,
        birthday: resolvedBirthday,
        gender: resolvedGender,
        certInfo,
        agreements,
        clientIp: getClientIp(req),
        mbIdPrefix: 'direct',
      };

      const savedUser = await userRepository.create(userData);

      console.log('[REGISTER] 회원가입 성공!');
      
      return res.json({
        success: true,
        user: savedUser.toResponse(),
        token: 'token_' + Date.now(),
        autoLogin: true,
        certInfo: certInfo || null,
        agreements: agreements || null,
        message: '회원가입이 완료되었습니다.'
      });

    } catch (error) {
      console.error('❌ [REGISTER] 회원가입 오류:', error);
      console.error('❌ [REGISTER] 상세:', {
        code: error?.code,
        errno: error?.errno,
        sqlMessage: error?.sqlMessage,
      });

      if (error?.code === 'ER_DUP_ENTRY') {
        const duplicateMessage = String(error?.sqlMessage || '');
        const duplicateField = duplicateMessage.includes("for key 'mb_id'")
          ? '회원 ID'
          : duplicateMessage.includes("for key 'PRIMARY'")
            ? '회원 번호'
          : duplicateMessage.includes('mb_email')
            ? '이메일'
            : '중복 데이터';

        return res.status(409).json({
          success: false,
          message: duplicateField === '이메일'
            ? '이미 존재하는 이메일입니다.'
            : `${duplicateField}가 중복되어 회원가입에 실패했습니다.`,
        });
      }

      return res.json({
        success: false,
        message: '회원가입 중 오류가 발생했습니다.'
      });
    }
  }

  /**
   * 아이디 찾기
   */
  async findId(req, res) {
    try {
      const { name, phone } = req.body;

      if (!name || !phone) {
        return res.status(400).json({
          success: false,
          message: '이름과 휴대폰 번호를 입력해 주세요.',
        });
      }

      const users = await userRepository.findByNameAndPhone(name, phone);
      if (!users.length) {
        return res.json({
          success: false,
          message: '일치하는 회원 정보를 찾을 수 없습니다.',
        });
      }

      return res.json({
        success: true,
        accounts: users.map((user) => ({
          email: user.email,
          name: user.name,
        })),
        message: '등록된 아이디를 찾았습니다.',
      });
    } catch (error) {
      console.error('❌ [FIND ID] 오류:', error);
      return res.status(500).json({
        success: false,
        message: '아이디 찾기 중 오류가 발생했습니다.',
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

  /**
   * 회원 본인 탈퇴(Soft Delete)
   */
  async withdraw(req, res) {
    try {
      const mbId = String(req.body?.mbId || req.body?.mb_id || '').trim();
      const reason = String(req.body?.reason || '').trim();

      if (!mbId) {
        return res.status(400).json({
          success: false,
          message: 'mbId가 필요합니다.',
        });
      }

      const socialDeleteDay = Number(process.env.G5_SOCIAL_DELETE_DAY || 0);
      const result = await userRepository.softDeleteMember({
        mbId,
        reason,
        socialDeleteDay: Number.isNaN(socialDeleteDay) ? 0 : socialDeleteDay,
      });

      if (result.success !== true) {
        if (result.code === 'NOT_FOUND') {
          return res.status(404).json({
            success: false,
            message: '사용자를 찾을 수 없습니다.',
          });
        }
        return res.status(500).json({
          success: false,
          message: '회원 탈퇴 처리에 실패했습니다.',
        });
      }

      if (result.alreadyLeft) {
        return res.json({
          success: true,
          message: '이미 탈퇴 처리된 회원입니다.',
        });
      }

      return res.json({
        success: true,
        message: '회원 탈퇴가 처리되었습니다.',
      });
    } catch (error) {
      console.error('❌ [WITHDRAW] 오류:', error);
      return res.status(500).json({
        success: false,
        message: '회원 탈퇴 처리 중 오류가 발생했습니다.',
      });
    }
  }

  /**
   * 비밀번호 확인(재인증)
   * - Flutter에서 SHA1 해시된 비밀번호 문자열을 전달받아 로그인과 동일한 방식으로 검증
   */
  async verifyPassword(req, res) {
    try {
      const { mbId, password } = req.body;

      if (!mbId || !password) {
        return res.status(400).json({
          success: false,
          message: 'mbId와 password가 필요합니다.',
        });
      }

      const user = await userRepository.findByMbId(mbId);
      if (!user) {
        return res.json({
          success: false,
          message: '사용자를 찾을 수 없습니다.',
        });
      }

      const storedHash = Buffer.isBuffer(user.password)
        ? user.password.toString('utf8')
        : String(user.password || '');

      if (!storedHash) {
        return res.json({
          success: false,
          message: '비밀번호가 일치하지 않습니다.',
        });
      }

      let passwordMatch = false;

      if (storedHash.startsWith('sha256:')) {
        passwordMatch = verifyPBKDF2Password(password, storedHash);
      } else if (storedHash.startsWith('*') && storedHash.length === 41) {
        const mysqlHash = mysqlPassword(password);
        passwordMatch = mysqlHash === storedHash;
      } else {
        return res.json({
          success: false,
          message: '비밀번호 형식 오류',
        });
      }

      if (!passwordMatch) {
        return res.json({
          success: false,
          message: '비밀번호가 일치하지 않습니다.',
        });
      }

      return res.json({
        success: true,
        message: '비밀번호 확인 완료',
      });
    } catch (error) {
      console.error('❌ [VERIFY PASSWORD] 오류:', error);
      return res.status(500).json({
        success: false,
        message: '비밀번호 확인 중 오류가 발생했습니다.',
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

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');

  if (!digits) {
    return '';
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  return String(value || '').trim();
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '');
  const first = raw.split(',')[0].trim();
  const ip = first || req.ip || req.connection?.remoteAddress || '';
  return String(ip).replace('::ffff:', '').trim();
}

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

module.exports = new UserController();
