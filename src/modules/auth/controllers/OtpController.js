const crypto = require('crypto');
const otpRepository = require('../repositories/OtpRepository');
const bizmsgAlimtalkService = require('../services/bizmsgAlimtalkService');

// PHP와 env 이름 호환: BOMIORA_OTP_EXPIRE_SEC
const OTP_EXPIRE_SECONDS = Number(process.env.BOMIORA_OTP_EXPIRE_SEC || 180);
const RESEND_COOLDOWN_SECONDS = 5;
const MAX_TRY_COUNT = Number(process.env.BOMIORA_OTP_MAX_TRY || 5);

function normalizePhoneHyphen(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return String(value || '').trim();
}

function getDigits(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function makeToken32() {
  return crypto.randomBytes(16).toString('hex'); // 32 chars
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '');
  const first = raw.split(',')[0].trim();
  const ip = first || req.ip || req.connection?.remoteAddress || '';
  return String(ip).replace('::ffff:', '').trim();
}

class OtpController {
  async send(req, res) {
    try {
      const purpose = String(req.body?.purpose || req.body?.otp_purpose || 'password_find').trim();
      const name = String(req.body?.name || req.body?.mb_name || '').trim();
      const phoneRaw = String(req.body?.phone || req.body?.mb_hp || '').trim();

      if (!phoneRaw) {
        return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: '휴대폰 번호를 입력해 주세요.' });
      }

      const mbHp = normalizePhoneHyphen(phoneRaw);
      const phoneDigits = getDigits(phoneRaw);
      if (phoneDigits.length < 10) {
        return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: '휴대폰 번호 형식이 올바르지 않습니다.' });
      }

      const latest = await otpRepository.getLatestByPhoneAndPurpose(mbHp, purpose);
      if (latest?.reg_time) {
        const last = new Date(latest.reg_time);
        const diffSec = Math.floor((Date.now() - last.getTime()) / 1000);
        if (diffSec < RESEND_COOLDOWN_SECONDS) {
          return res.status(429).json({
            success: false,
            code: 'RESEND_TOO_FAST',
            retryAfterSec: RESEND_COOLDOWN_SECONDS - diffSec,
            message: `재전송은 ${RESEND_COOLDOWN_SECONDS - diffSec}초 후에 가능합니다.`,
          });
        }
      }

      const otp = String(100000 + Math.floor(Math.random() * 900000));
      const token = makeToken32();
      const codeHash = sha256Hex(otp);
      const ipAddr = getClientIp(req);

      const otpId = await otpRepository.insertOtp({
        token,
        purpose,
        mbHp,
        mbName: name,
        codeHash,
        expireSeconds: OTP_EXPIRE_SECONDS,
        ipAddr,
      });

      const sendResult = await bizmsgAlimtalkService.sendOtp({
        phone: phoneDigits,
        otp,
      });

      if (!sendResult.ok) {
        // 발송 실패 시 토큰이 남지 않도록 정리
        try {
          await otpRepository.deleteById(otpId);
        } catch (_) {}
        return res.status(502).json({
          success: false,
          code: 'BIZMSG_SEND_FAILED',
          message: sendResult.errorMessage || '인증번호 발송에 실패했습니다.',
        });
      }

      const saved = await otpRepository.findByToken(token);
      const expiresAtStr = saved?.expires_at || null;

      return res.json({
        success: true,
        otpToken: token,
        purpose,
        expiresAt: expiresAtStr,
        ttlSeconds: OTP_EXPIRE_SECONDS,
        resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
        message: '인증번호가 발송되었습니다.',
      });
    } catch (error) {
      console.error('❌ [OTP SEND] 오류:', error);
      return res.status(500).json({
        success: false,
        code: 'SERVER_ERROR',
        message: '인증번호 발송 중 오류가 발생했습니다.',
      });
    }
  }

  async verify(req, res) {
    try {
      const token = String(req.body?.otpToken || req.body?.otp_token || '').trim();
      const code = String(req.body?.code || req.body?.otp || '').trim();
      const purpose = String(req.body?.purpose || req.body?.otp_purpose || '').trim();

      if (!token || !code) {
        return res.status(400).json({
          success: false,
          code: 'BAD_REQUEST',
          message: 'otpToken과 인증번호를 입력해 주세요.',
        });
      }

      const row = await otpRepository.findByToken(token);
      if (!row) {
        return res.status(404).json({ success: false, code: 'INVALID_TOKEN', message: '인증 요청을 찾을 수 없습니다.' });
      }

      if (purpose && String(row.otp_purpose || '') !== purpose) {
        return res.status(400).json({ success: false, code: 'PURPOSE_MISMATCH', message: '인증 용도가 일치하지 않습니다.' });
      }

      const verified = String(row.verified_yn || 'N');
      if (verified === 'Y') {
        return res.json({ success: true, code: 'ALREADY_VERIFIED', message: '이미 인증이 완료되었습니다.' });
      }
      if (verified === 'X') {
        return res.status(423).json({ success: false, code: 'LOCKED', message: '인증 시도 횟수를 초과했습니다. 다시 발송해 주세요.' });
      }

      const expiresAt = new Date(row.expires_at);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        return res.status(410).json({
          success: false,
          code: 'EXPIRED',
          expiresAt: row.expires_at,
          message: '인증시간이 만료되었습니다. 다시 발송해 주세요.',
        });
      }

      const expectedHash = String(row.otp_code_hash || '');
      const actualHash = sha256Hex(code);
      if (actualHash !== expectedHash) {
        const nextTry = Math.min(Number(row.try_count || 0) + 1, 255);
        const lock = nextTry >= MAX_TRY_COUNT;
        await otpRepository.incrementTryCountAndMaybeLock(row.otp_id, nextTry, lock);
        return res.status(401).json({
          success: false,
          code: lock ? 'LOCKED' : 'WRONG_CODE',
          tryCount: nextTry,
          remainingAttempts: Math.max(0, MAX_TRY_COUNT - nextTry),
          message: lock
            ? '인증 시도 횟수를 초과했습니다. 다시 발송해 주세요.'
            : '인증번호가 일치하지 않습니다.',
        });
      }

      await otpRepository.markVerified(row.otp_id);
      return res.json({
        success: true,
        code: 'VERIFIED',
        message: '인증이 완료되었습니다.',
      });
    } catch (error) {
      console.error('❌ [OTP VERIFY] 오류:', error);
      return res.status(500).json({
        success: false,
        code: 'SERVER_ERROR',
        message: '인증번호 확인 중 오류가 발생했습니다.',
      });
    }
  }
}

module.exports = new OtpController();

