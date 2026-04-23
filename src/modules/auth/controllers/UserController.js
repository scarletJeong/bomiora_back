const userRepository = require('../repositories/UserRepository');
const pointRepository = require('../../user/point/repositories/PointRepository');
const otpRepository = require('../repositories/OtpRepository');
const { verifyPBKDF2Password, mysqlPassword, createPBKDF2Password } = require('../../../utils/passwordUtil');
const fs = require('fs');
const path = require('path');

class UserController {
  async checkDupInfo(req, res) {
    try {
      const dup = String(req.body?.mb_dupinfo || req.body?.dupinfo || req.body?.di || '').trim();
      if (!dup) {
        return res.json({ success: true, exists: false });
      }
      const exists = await userRepository.existsByDupInfo(dup);
      return res.json({
        success: true,
        exists,
        message: exists ? '이미 가입된 본인인증 정보입니다.' : '사용 가능한 본인인증 정보입니다.',
      });
    } catch (error) {
      console.error('❌ [CHECK DUPINFO] 오류:', error);
      return res.status(500).json({
        success: false,
        exists: false,
        message: '본인인증 중복 확인 중 오류가 발생했습니다.',
      });
    }
  }
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

      if (isWithdrawnMember(user)) {
        console.log('❌ [LOGIN] 탈퇴 회원 로그인 차단:', user.mbId || email);
        return res.json({
          success: false,
          message: '탈퇴한 계정입니다.',
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
        // 오늘 첫 로그인 포인트는 mb_today_login 갱신 "전"에 판별해야 함 (그누보드 common.php와 동일)
        const clientIp = getClientIp(req);
        try {
          await pointRepository.grantDailyFirstLoginPoint({
            mbId: user.mbId,
            ip: clientIp,
          });
        } catch (e) {
          console.error('[LOGIN] 첫로그인 포인트 지급 실패(로그인은 계속):', e?.message || e);
        }

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
        mb_dupinfo,
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

      // 0. 본인인증 고유값(dupinfo) 중복 확인
      const dupInfo = String(
        mb_dupinfo ||
        certInfo?.mb_dupinfo ||
        certInfo?.mbDupinfo ||
        certInfo?.dupinfo ||
        certInfo?.dupInfo ||
        certInfo?.di ||
        ''
      ).trim();
      if (!dupInfo) {
        return res.status(400).json({
          success: false,
          message: '본인인증 고유값(dupinfo)이 누락되었습니다.',
        });
      }
      const dupExists = await userRepository.existsByDupInfo(dupInfo);
      if (dupExists) {
        return res.status(409).json({
          success: false,
          message: '이미 가입된 본인인증 정보입니다.',
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
        certInfo: {
          ...(certInfo || {}),
          mb_dupinfo: dupInfo,
        },
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
            : duplicateMessage.includes('mb_dupinfo')
              ? '본인인증 정보'
            : '중복 데이터';

        return res.status(409).json({
          success: false,
          message: duplicateField === '이메일'
            ? '이미 존재하는 이메일입니다.'
            : duplicateField === '본인인증 정보'
              ? '이미 가입된 본인인증 정보입니다.'
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
   * - 본인인증(KCP): `from_kcp` + `mb_dupinfo` 로만 조회
   * - 소유인증(OTP): `otpToken`(용도 id_find 검증) + 이름 + 휴대폰
   */
  async findId(req, res) {
    try {
      const name = String(req.body?.name || '').trim();
      const phone = String(req.body?.phone || '').trim();
      const otpToken = String(req.body?.otpToken || req.body?.otp_token || '').trim();
      const fromKcp = req.body?.from_kcp === true || req.body?.from_kcp === 1 || req.body?.fromKcp === true;
      const mbDupinfo = String(req.body?.mb_dupinfo || req.body?.mbDupinfo || '').trim();

      // 본인인증: 본인인증값(mb_dupinfo)으로만 조회 (이름·휴대폰은 인증서와 교차검증용으로 선택)
      if (fromKcp && mbDupinfo) {
        let users = await userRepository.findByMbDupinfo(mbDupinfo);
        if (!users.length) {
          return res.json({
            success: false,
            message: '일치하는 회원 정보를 찾을 수 없습니다.',
          });
        }
        if (name && phone) {
          const reqDigits = String(phone).replace(/[^0-9]/g, '');
          const narrowed = users.filter((u) => {
            const uDigits = String(u.mbHp || '')
              .replace(/[^0-9]/g, '');
            return (
              String(u.name || '').trim() === name &&
              uDigits &&
              reqDigits &&
              uDigits === reqDigits
            );
          });
          if (!narrowed.length) {
            return res.json({
              success: false,
              message: '일치하는 회원 정보를 찾을 수 없습니다.',
            });
          }
          users = narrowed;
        }

        return res.json({
          success: true,
          accounts: users.map((user) => ({
            email: user.email,
            name: user.name,
            mb_id: user.mbId,
          })),
          message: '등록된 아이디를 찾았습니다.',
        });
      }

      // 소유인증: OTP 검증 후 이름 + 휴대폰만 조회
      if (otpToken) {
        if (!name || !phone) {
          return res.status(400).json({
            success: false,
            message: '이름과 휴대폰 번호를 입력해 주세요.',
          });
        }
        const otpCheck = await assertOtpVerifiedForPasswordFind({
          otpToken,
          name,
          phone,
          purpose: 'id_find',
        });
        if (!otpCheck.ok) {
          return res.status(400).json({
            success: false,
            message: otpCheck.message,
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
            mb_id: user.mbId,
          })),
          message: '등록된 아이디를 찾았습니다.',
        });
      }

      return res.status(400).json({
        success: false,
        message: '본인인증을 완료하거나 휴대폰 인증을 완료해 주세요.',
      });
    } catch (error) {
      console.error('❌ [FIND ID] 오류:', error);
      return res.status(500).json({
        success: false,
        message: '아이디 찾기 중 오류가 발생했습니다.',
      });
    }
  }

  async forgotPassword(req, res) {
    try {
      const name = String(req.body?.name || '').trim();
      const phone = String(req.body?.phone || '').trim();
      const otpToken = String(req.body?.otpToken || req.body?.otp_token || '').trim();
      const identifierRaw =
        req.body?.identifier ??
        req.body?.loginOrEmail ??
        req.body?.ss_pwfind_pw_reset_email ??
        req.body?.email;
      const fromKcp = req.body?.from_kcp === true || req.body?.from_kcp === 1 || req.body?.fromKcp === true;
      const mbDupinfo = String(req.body?.mb_dupinfo || req.body?.mbDupinfo || '').trim();

      // 본인인증(KCP): 가입 이메일(mb_email) + 본인인증값(mb_dupinfo) — 아이디 찾기는 소유인증(OTP)였어도 동일
      if (fromKcp && mbDupinfo) {
        const emailForMatch = normalizeEmail(identifierRaw);
        if (!emailForMatch) {
          return res.status(400).json({
            success: false,
            message: '가입 이메일을 입력해 주세요.',
          });
        }
        const user = await userRepository.findByDupinfoAndEmail(mbDupinfo, emailForMatch);
        if (!user) {
          return res.json({
            success: false,
            message: '일치하는 회원 정보를 찾을 수 없습니다.',
          });
        }
        if (isWithdrawnMember(user)) {
          return res.json({
            success: false,
            message: '탈퇴한 계정입니다.',
          });
        }
        return res.json({
          success: true,
          message: '비밀번호 재설정이 가능합니다.',
          account: {
            email: user.email,
            name: user.name,
            mbId: user.mbId,
            hasDupinfo: String(user.mbDupinfo || '').trim().length > 0,
          },
        });
      }

      if (!name || !phone) {
        return res.status(400).json({
          success: false,
          message: '이름과 휴대폰 번호를 입력해 주세요.',
        });
      }

      // 소유인증(OTP) 후: 가입 이메일(mb_email) + 이름 + 휴대폰 — 본인인증값이 있는 회원은 OTP로 재설정 불가
      if (otpToken) {
        const emailForMatch = normalizeEmail(identifierRaw);
        if (!emailForMatch) {
          return res.status(400).json({
            success: false,
            message: '가입 이메일을 입력해 주세요.',
          });
        }
        const otpCheck = await assertOtpVerifiedForPasswordFind({
          otpToken,
          name,
          phone,
          purpose: 'password_find',
        });
        if (!otpCheck.ok) {
          return res.status(400).json({
            success: false,
            message: otpCheck.message,
          });
        }

        const matched = await userRepository.findMembersMatchingPasswordEmail(
          name,
          phone,
          emailForMatch
        );
        if (!matched.length) {
          return res.json({
            success: false,
            message: '일치하는 회원 정보를 찾을 수 없습니다.',
          });
        }
        if (matched.length > 1) {
          return res.json({
            success: false,
            message: '동일 정보로 조회된 계정이 여러 개입니다. 고객센터로 문의해 주세요.',
          });
        }

        const user = matched[0];
        if (isWithdrawnMember(user)) {
          return res.json({
            success: false,
            message: '탈퇴한 계정입니다.',
          });
        }

        return res.json({
          success: true,
          message: '비밀번호 재설정이 가능합니다.',
          account: {
            email: user.email,
            name: user.name,
            mbId: user.mbId,
            hasDupinfo: String(user.mbDupinfo || '').trim().length > 0,
          },
        });
      }

      // 레거시: 이메일(정확히 로그인 이메일) + 이름 + 휴대폰
      const email = normalizeEmail(req.body?.email);
      if (!email || !name || !phone) {
        return res.status(400).json({
          success: false,
          message: '이메일, 이름, 휴대폰 번호를 입력해 주세요.',
        });
      }

      const user = await userRepository.findByEmailNameAndPhone(email, name, phone);
      if (!user) {
        return res.json({
          success: false,
          message: '일치하는 회원 정보를 찾을 수 없습니다.',
        });
      }

      return res.json({
        success: true,
        message: '비밀번호 재설정이 가능합니다.',
        account: {
          email: user.email,
          name: user.name,
          mbId: user.mbId,
          hasDupinfo: String(user.mbDupinfo || '').trim().length > 0,
        },
      });
    } catch (error) {
      console.error('❌ [FORGOT PASSWORD] 오류:', error);
      return res.status(500).json({
        success: false,
        message: '비밀번호 찾기 중 오류가 발생했습니다.',
      });
    }
  }

  async resetPassword(req, res) {
    try {
      const name = String(req.body?.name || '').trim();
      const phone = String(req.body?.phone || '').trim();
      const password = String(req.body?.password || '');
      const otpToken = String(req.body?.otpToken || req.body?.otp_token || '').trim();
      const fromKcp = req.body?.from_kcp === true || req.body?.from_kcp === 1 || req.body?.fromKcp === true;
      const mbDupinfoBody = String(req.body?.mb_dupinfo || req.body?.mbDupinfo || '').trim();

      if (!password) {
        return res.status(400).json({
          success: false,
          message: '새 비밀번호를 입력해 주세요.',
        });
      }

      const passwordRule =
        /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>_\-[\]\\/~`+=;]).{8,16}$/;
      if (!passwordRule.test(password)) {
        return res.status(400).json({
          success: false,
          message: '비밀번호는 8~16자의 영문, 숫자, 특수문자를 모두 포함해야 합니다.',
        });
      }

      let user = null;

      // 본인인증: mb_dupinfo + 가입 이메일(mb_email)
      if (fromKcp && mbDupinfoBody) {
        const emailForMatch = normalizeEmail(
          req.body?.identifier ??
            req.body?.loginOrEmail ??
            req.body?.ss_pwfind_pw_reset_email ??
            req.body?.email
        );
        if (!emailForMatch) {
          return res.status(400).json({
            success: false,
            message: '가입 이메일을 입력해 주세요.',
          });
        }
        user = await userRepository.findByDupinfoAndEmail(mbDupinfoBody, emailForMatch);
      } else if (otpToken) {
        if (!name || !phone) {
          return res.status(400).json({
            success: false,
            message: '이름, 휴대폰 번호, 새 비밀번호를 입력해 주세요.',
          });
        }
        const emailForMatch = normalizeEmail(
          req.body?.identifier ??
            req.body?.loginOrEmail ??
            req.body?.ss_pwfind_pw_reset_email ??
            req.body?.email
        );
        if (!emailForMatch) {
          return res.status(400).json({
            success: false,
            message: '가입 이메일을 입력해 주세요.',
          });
        }
        const otpCheck = await assertOtpVerifiedForPasswordFind({
          otpToken,
          name,
          phone,
          purpose: 'password_find',
        });
        if (!otpCheck.ok) {
          return res.status(400).json({
            success: false,
            message: otpCheck.message,
          });
        }

        const matched = await userRepository.findMembersMatchingPasswordEmail(
          name,
          phone,
          emailForMatch
        );
        if (!matched.length || matched.length > 1) {
          return res.json({
            success: false,
            message: '일치하는 회원 정보를 찾을 수 없습니다.',
          });
        }
        user = matched[0];
      } else {
        if (!name || !phone) {
          return res.status(400).json({
            success: false,
            message: '이름, 휴대폰 번호, 새 비밀번호를 입력해 주세요.',
          });
        }
        const email = normalizeEmail(req.body?.email);
        if (!email) {
          return res.status(400).json({
            success: false,
            message: '이메일, 이름, 휴대폰 번호, 새 비밀번호를 입력해 주세요.',
          });
        }
        user = await userRepository.findByEmailNameAndPhone(email, name, phone);
      }

      if (!user) {
        return res.json({
          success: false,
          message: '일치하는 회원 정보를 찾을 수 없습니다.',
        });
      }

      if (isWithdrawnMember(user)) {
        return res.json({
          success: false,
          message: '탈퇴한 계정입니다.',
        });
      }

      const nextPasswordHash = createPBKDF2Password(password);
      await userRepository.updatePasswordByMbNo(user.id, nextPasswordHash);

      return res.json({
        success: true,
        message: '비밀번호가 변경되었습니다.',
      });
    } catch (error) {
      console.error('❌ [RESET PASSWORD] 오류:', error);
      return res.status(500).json({
        success: false,
        message: '비밀번호 재설정 중 오류가 발생했습니다.',
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
   * 세션 유효성(탈퇴 여부) 확인
   * - 다른 탭/세션에서 탈퇴된 경우, 다음 액션/새로고침 시 즉시 로그아웃 처리용
   * @route GET /api/auth/session?mb_id=...  (mbId도 허용)
   */
  async session(req, res) {
    try {
      const mbId = String(req.query?.mb_id || req.query?.mbId || '').trim();
      if (!mbId) {
        return res.status(400).json({
          success: false,
          active: false,
          message: 'mb_id가 필요합니다.',
        });
      }

      const user = await userRepository.findByMbId(mbId);
      if (!user) {
        return res.json({
          success: true,
          active: false,
          message: '사용자를 찾을 수 없습니다.',
        });
      }

      if (isWithdrawnMember(user)) {
        return res.json({
          success: true,
          active: false,
          message: '탈퇴한 계정입니다.',
        });
      }

      return res.json({
        success: true,
        active: true,
        message: '정상 회원입니다.',
      });
    } catch (error) {
      console.error('❌ [SESSION] 오류:', error);
      return res.status(500).json({
        success: false,
        active: false,
        message: '세션 확인 중 오류가 발생했습니다.',
      });
    }
  }

  /**
   * 비밀번호 확인(재인증)
   * - Flutter에서 SHA1 해시된 비밀번호 문자열을 전달받아 로그인과 동일한 방식으로 검증
   */
  /**
   * 카카오 로그인 (이미 `mb_id = kakao_{kakaoId}` 형태로 가입된 회원만)
   */
  async loginWithKakao(req, res) {
    try {
      const kakaoId = String(req.body?.kakaoId || '').trim();
      if (!kakaoId) {
        return res.status(400).json({
          success: false,
          message: 'kakaoId가 필요합니다.',
        });
      }

      const sidTail = kakaoId.replace(/[^0-9a-z_]/gi, '');
      const mbId = `kakao_${sidTail || kakaoId}`.slice(0, 30);

      const user = await userRepository.findByMbId(mbId);
      if (!user) {
        return res.json({
          success: false,
          message: '카카오로 가입된 회원을 찾을 수 없습니다.',
        });
      }

      if (isWithdrawnMember(user)) {
        return res.json({
          success: false,
          message: '탈퇴한 계정입니다.',
        });
      }

      const clientIp = getClientIp(req);
      try {
        await pointRepository.grantDailyFirstLoginPoint({
          mbId: user.mbId,
          ip: clientIp,
        });
      } catch (e) {
        console.error('[KAKAO LOGIN] 첫로그인 포인트 지급 실패(로그인은 계속):', e?.message || e);
      }

      user.lastLoginAt = getKstDateTimeString();
      const updatedUser = await userRepository.update(user);

      return res.json({
        success: true,
        user: updatedUser.toResponse(),
        token: 'token_' + Date.now(),
        message: '로그인 성공',
      });
    } catch (error) {
      console.error('❌ [KAKAO LOGIN] 오류:', error);
      return res.json({
        success: false,
        message: '카카오 로그인 처리 중 오류가 발생했습니다.',
      });
    }
  }

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

      if (isWithdrawnMember(user)) {
        return res.json({
          success: false,
          message: '탈퇴한 계정입니다.',
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

  async changePassword(req, res) {
    try {
      const mbId = String(req.body?.mbId || req.body?.mb_id || '').trim();
      const currentPassword = String(
        req.body?.currentPassword ?? req.body?.current_password ?? req.body?.password ?? ''
      );
      const newPassword = String(
        req.body?.newPassword ??
          req.body?.new_password ??
          req.body?.password_new ??
          req.body?.new_pw ??
          req.body?.newPw ??
          ''
      );

      // currentPassword는 선택(이미 verify-password로 재인증을 끝낸 플로우 대응)
      if (!mbId || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'mbId와 newPassword가 필요합니다.',
        });
      }

      const user = await userRepository.findByMbId(mbId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: '사용자를 찾을 수 없습니다.',
        });
      }

      if (isWithdrawnMember(user)) {
        return res.json({
          success: false,
          message: '탈퇴한 계정입니다.',
        });
      }

      const storedHash = Buffer.isBuffer(user.password)
        ? user.password.toString('utf8')
        : String(user.password || '');

      if (!storedHash) {
        return res.status(400).json({
          success: false,
          message: '비밀번호가 설정되어 있지 않습니다.',
        });
      }

      // currentPassword가 들어오면 검증까지 수행 (클라이언트 구현에 따라 선택적으로 사용)
      if (currentPassword) {
        let passwordMatch = false;
        if (storedHash.startsWith('sha256:')) {
          passwordMatch = verifyPBKDF2Password(currentPassword, storedHash);
        } else if (storedHash.startsWith('*') && storedHash.length === 41) {
          const mysqlHash = mysqlPassword(currentPassword);
          passwordMatch = mysqlHash === storedHash;
        } else {
          return res.status(400).json({
            success: false,
            message: '비밀번호 형식 오류',
          });
        }

        if (!passwordMatch) {
          return res.status(400).json({
            success: false,
            message: '현재 비밀번호가 일치하지 않습니다.',
          });
        }
      }

      // newPassword가 평문일 때만 정책 검사. (SHA1/hex 등 이미 해시된 값이면 클라이언트에서 정책 검증됨)
      const looksHashed = /^[a-f0-9]{40}$/i.test(newPassword);
      if (!looksHashed) {
        const passwordRule =
          /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>_\-[\]\\/~`+=;]).{8,16}$/;
        if (!passwordRule.test(newPassword)) {
          return res.status(400).json({
            success: false,
            message: '비밀번호는 8~16자의 영문, 숫자, 특수문자를 모두 포함해야 합니다.',
          });
        }
      }

      const nextPasswordHash = createPBKDF2Password(newPassword);
      await userRepository.updatePasswordByMbNo(user.id, nextPasswordHash);

      return res.json({
        success: true,
        message: '비밀번호가 변경되었습니다.',
      });
    } catch (error) {
      console.error('❌ [CHANGE PASSWORD] 오류:', error);
      return res.status(500).json({
        success: false,
        message: '비밀번호 변경 중 오류가 발생했습니다.',
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

async function assertOtpVerifiedForPasswordFind({ otpToken, name, phone, purpose }) {
  const row = await otpRepository.findByToken(otpToken);
  if (!row) {
    return {
      ok: false,
      message: '유효하지 않은 인증 요청입니다. 인증번호를 다시 발송해 주세요.',
    };
  }
  if (String(row.verified_yn || '').toUpperCase() !== 'Y') {
    return { ok: false, message: '휴대폰 인증을 완료해 주세요.' };
  }
  const rowPurpose = String(row.otp_purpose || '').trim();
  if (purpose && rowPurpose && rowPurpose !== purpose) {
    return { ok: false, message: '인증 용도가 일치하지 않습니다.' };
  }
  const rowDigits = String(row.mb_hp || '').replace(/[^0-9]/g, '');
  const reqDigits = String(phone || '').replace(/[^0-9]/g, '');
  if (!rowDigits || rowDigits !== reqDigits) {
    return { ok: false, message: '인증된 휴대폰 번호가 일치하지 않습니다.' };
  }
  const rowName = String(row.mb_name || '').trim();
  const reqName = String(name || '').trim();
  if (rowName !== reqName) {
    return { ok: false, message: '인증된 이름이 일치하지 않습니다.' };
  }
  return { ok: true };
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

function isWithdrawnMember(user) {
  if (!user) {
    return false;
  }

  const leaveDateRaw = String(user.leaveDate || '').trim();
  if (!leaveDateRaw) {
    return false;
  }

  const leaveDateDigits = leaveDateRaw.replace(/[^0-9]/g, '').slice(0, 8);
  if (leaveDateDigits.length !== 8) {
    // 형식이 애매해도 leave_date 값이 채워져 있으면 탈퇴 회원으로 본다.
    return true;
  }

  const todayYmd = getKstDateTimeString().slice(0, 10).replace(/-/g, '');
  return leaveDateDigits <= todayYmd;
}

module.exports = new UserController();
