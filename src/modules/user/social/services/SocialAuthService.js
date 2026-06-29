const crypto = require('crypto');
const pool = require('../../../../config/database');
const userRepository = require('../../../auth/repositories/UserRepository');
const pointRepository = require('../../point/repositories/PointRepository');
const { createPBKDF2Password } = require('../../../../utils/passwordUtil');
const socialProfileRepository = require('../repositories/SocialProfileRepository');
const {
  getSocialConvertId,
  normalizeProvider,
  sanitizeSocialNick,
} = require('../utils/socialIdUtil');
const {
  normalizeEmail,
  normalizePhone,
  getClientIp,
  getKstDateTimeString,
  getKstDateString,
  isWithdrawnMember,
  normalizeSex,
  normalizeBirth,
} = require('../utils/requestUtil');

class SocialAuthService {
  parseLoginPayload(body = {}, defaultProvider = '') {
    const provider = normalizeProvider(
      body.provider || defaultProvider || body.socialProvider
    );
    const identifier = String(
      body.identifier ||
        body.kakaoId ||
        body.kakao_id ||
        body.naverId ||
        body.naver_id ||
        ''
    ).trim();

    return {
      provider,
      identifier,
      email: normalizeEmail(body.email),
      nickname: sanitizeSocialNick(body.nickname || body.displayName),
      name: String(body.name || '').trim(),
      profileImageUrl: String(body.profileImageUrl || body.photoUrl || '').trim(),
      gender: body.gender,
      birthday: body.birthday || body.birth,
    };
  }

  async resolveMemberBySocial(provider, identifier) {
    let socialRow = await socialProfileRepository.findByProviderAndIdentifier(
      provider,
      identifier
    );

    if (!socialRow) {
      socialRow = await socialProfileRepository.findByProviderAndOldIdentifier(
        provider,
        identifier
      );
    }

    if (socialRow?.mb_id) {
      const user = await userRepository.findByMbId(socialRow.mb_id);
      if (user) {
        return { user, socialRow };
      }
    }

    const legacyMbId = getSocialConvertId(identifier, provider);
    const legacyUser = await userRepository.findByMbId(legacyMbId);
    if (legacyUser) {
      return { user: legacyUser, socialRow: null, legacyMbId };
    }

    return { user: null, socialRow: null, legacyMbId };
  }

  buildNeedRegisterResponse(provider, identifier, prefill = {}) {
    const proposedMbId = getSocialConvertId(identifier, provider);
    return {
      success: false,
      needRegister: true,
      code: 'SOCIAL_NEED_REGISTER',
      message: '소셜 계정으로 가입된 회원이 없습니다. 회원가입을 진행해 주세요.',
      provider,
      identifier,
      proposedMbId,
      prefill: {
        mbId: proposedMbId,
        email: prefill.email || '',
        nickname: prefill.nickname || '',
        name: prefill.name || prefill.nickname || '',
        gender: prefill.gender || '',
        birthday: prefill.birthday || '',
        profileImageUrl: prefill.profileImageUrl || '',
      },
    };
  }

  async completeLogin(user, req, provider, identifier, profileMeta = {}) {
    if (isWithdrawnMember(user)) {
      return {
        success: false,
        message: '탈퇴한 계정입니다.',
      };
    }

    const clientIp = getClientIp(req);
    try {
      await pointRepository.grantDailyFirstLoginPoint({
        mbId: user.mbId,
        ip: clientIp,
      });
    } catch (e) {
      console.error('[SOCIAL LOGIN] 첫로그인 포인트 지급 실패(로그인은 계속):', e?.message || e);
    }

    user.lastLoginAt = getKstDateTimeString();
    const updatedUser = await userRepository.update(user);

    if (provider && identifier) {
      try {
        await socialProfileRepository.upsertProfile(user.mbId, provider, {
          identifier,
          displayName: profileMeta.nickname || profileMeta.name || '',
          photoUrl: profileMeta.profileImageUrl || '',
          email: profileMeta.email || '',
        });
      } catch (e) {
        console.warn('[SOCIAL LOGIN] social_profiles 갱신 스킵:', e?.message || e);
      }
    }

    return {
      success: true,
      user: updatedUser.toResponse(),
      token: `token_${Date.now()}`,
      message: '로그인 성공',
    };
  }

  async login(req, defaultProvider = '') {
    const payload = this.parseLoginPayload(req.body, defaultProvider);

    if (!payload.provider) {
      return {
        status: 400,
        body: {
          success: false,
          message: '지원하지 않는 소셜 provider 입니다.',
        },
      };
    }

    if (!payload.identifier) {
      return {
        status: 400,
        body: {
          success: false,
          message: '소셜 identifier가 필요합니다.',
        },
      };
    }

    const { user } = await this.resolveMemberBySocial(
      payload.provider,
      payload.identifier
    );

    if (!user) {
      return {
        status: 200,
        body: this.buildNeedRegisterResponse(payload.provider, payload.identifier, payload),
      };
    }

    return {
      status: 200,
      body: await this.completeLogin(user, req, payload.provider, payload.identifier, payload),
    };
  }

  async resolveUniqueNick(baseNick, conn) {
    let nick = sanitizeSocialNick(baseNick);
    if (!nick) {
      nick = 'member';
    }

    for (let i = 0; i < 50; i += 1) {
      const candidate = i === 0 ? nick : `${nick}${i}`;
      const [rows] = await conn.query(
        'SELECT COUNT(*) AS cnt FROM bomiora_member WHERE mb_nick = ?',
        [candidate]
      );
      if (Number(rows[0]?.cnt || 0) === 0) {
        return candidate;
      }
    }

    return `${nick}${Date.now()}`.slice(0, 20);
  }

  async register(req) {
    const provider = normalizeProvider(req.body?.provider);
    const identifier = String(
      req.body?.identifier ||
        req.body?.kakaoId ||
        req.body?.kakao_id ||
        req.body?.naverId ||
        req.body?.naver_id ||
        ''
    ).trim();

    if (!provider || !identifier) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'provider와 identifier가 필요합니다.',
        },
      };
    }

    const agreements = req.body?.agreements || {};
    if (agreements.terms !== true || agreements.privacy !== true) {
      return {
        status: 400,
        body: {
          success: false,
          message: '필수 약관 동의가 필요합니다.',
        },
      };
    }

    const phone = normalizePhone(req.body?.phone || req.body?.mb_hp || req.body?.mbHp);
    if (!phone || phone.replace(/[^0-9]/g, '').length < 10) {
      return {
        status: 400,
        body: {
          success: false,
          message: '휴대폰 번호를 입력해 주세요.',
        },
      };
    }

    const linked = await socialProfileRepository.existsLinkedAccount(provider, identifier);
    if (linked) {
      return {
        status: 409,
        body: {
          success: false,
          message: '이미 연결된 소셜 계정입니다. 로그인해 주세요.',
        },
      };
    }

    const mbId = getSocialConvertId(identifier, provider);
    if (await userRepository.existsByMbId(mbId)) {
      return {
        status: 409,
        body: {
          success: false,
          message: '이미 가입된 회원입니다. 로그인해 주세요.',
        },
      };
    }

    let email = normalizeEmail(req.body?.email || req.body?.mb_email);
    if (!email && provider === 'kakao') {
      return {
        status: 400,
        body: {
          success: false,
          message: '카카오 이메일 동의가 필요합니다. 이메일 제공에 동의 후 다시 시도해 주세요.',
        },
      };
    }
    if (!email) {
      return {
        status: 400,
        body: {
          success: false,
          message: '이메일을 입력해 주세요.',
        },
      };
    }

    if (await userRepository.existsByEmail(email)) {
      return {
        status: 409,
        body: {
          success: false,
          message: '이미 사용 중인 이메일입니다.',
        },
      };
    }

    const name = String(req.body?.name || req.body?.mb_name || req.body?.nickname || '').trim();
    if (!name) {
      return {
        status: 400,
        body: {
          success: false,
          message: '이름이 필요합니다.',
        },
      };
    }

    const nicknameBase = req.body?.nickname || req.body?.mb_nick || name;
    const gender = normalizeSex(req.body?.gender || req.body?.mb_sex);
    const birthday = normalizeBirth(req.body?.birthday || req.body?.mb_birth);
    const profileImageUrl = String(req.body?.profileImageUrl || '').trim();
    const clientIp = getClientIp(req);
    const nowKstDateTime = getKstDateTimeString();
    const nowKstDate = getKstDateString();
    const randomPassword = crypto.randomBytes(16).toString('hex');
    const pbkdf2Hash = createPBKDF2Password(randomPassword);
    const marketingEmail = agreements?.marketingEmail === true ? 1 : 0;
    const marketingSms = agreements?.marketingSms === true ? 1 : 0;
    const initialPoint = 5000;

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const mbNo = await userRepository.generateNextMbNo(conn);
      const mbNick = await this.resolveUniqueNick(nicknameBase, conn);

      await conn.query(
        `INSERT INTO bomiora_member
         (
           mb_no, mb_id, mb_email, mb_password, mb_name, mb_nick, mb_nick_date,
           mb_sex, mb_birth, mb_hp, mb_certify, mb_dupinfo, mb_point,
           mb_datetime, mb_today_login, mb_email_certify, mb_login_ip, mb_ip,
           mb_mailling, mb_sms
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mbNo,
          mbId,
          email,
          pbkdf2Hash,
          name,
          mbNick,
          nowKstDate,
          gender,
          birthday || '',
          phone,
          initialPoint,
          nowKstDateTime,
          nowKstDateTime,
          nowKstDateTime,
          clientIp,
          clientIp,
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

      await conn.commit();

      await socialProfileRepository.upsertProfile(mbId, provider, {
        identifier,
        displayName: mbNick,
        photoUrl: profileImageUrl,
        email,
        name,
      });

      const user = await userRepository.findByMbId(mbId);
      if (!user) {
        throw new Error('소셜 회원가입 후 회원 조회에 실패했습니다.');
      }

      return {
        status: 200,
        body: await this.completeLogin(user, req, provider, identifier, {
          email,
          nickname: mbNick,
          name,
          profileImageUrl,
        }),
      };
    } catch (error) {
      if (conn) {
        try {
          await conn.rollback();
        } catch (_) {}
      }
      console.error('❌ [SOCIAL REGISTER] 오류:', error);
      return {
        status: 500,
        body: {
          success: false,
          message: '소셜 회원가입 중 오류가 발생했습니다.',
        },
      };
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }
}

module.exports = new SocialAuthService();
