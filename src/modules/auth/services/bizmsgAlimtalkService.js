function toE164Korea82(phone) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('82')) return digits;
  if (digits.startsWith('0')) return `82${digits.slice(1)}`;
  return `82${digits}`;
}

class BizmsgAlimtalkService {
  getConfig() {
    const userid = String(process.env.BOMIORA_OTP_BIZM_USERID || 'bomioramall01').trim();
    const profile = String(process.env.BOMIORA_OTP_BIZM_PROFILE || '').trim();
    const tmplId = String(process.env.BOMIORA_OTP_TMPL_ID || 'bomiora_pwfind_otp').trim();
    const endpoint = String(process.env.BOMIORA_OTP_BIZM_ENDPOINT || 'https://alimtalk-api.bizmsg.kr/v2/sender/send').trim();
    return { userid, profile, tmplId, endpoint };
  }

  mask(value, { head = 4, tail = 4 } = {}) {
    const s = String(value || '');
    if (!s) return '';
    if (s.length <= head + tail) return `${s.slice(0, 1)}***`;
    return `${s.slice(0, head)}***${s.slice(-tail)}`;
  }

  maskPhone(phone) {
    const digits = String(phone || '').replace(/[^0-9]/g, '');
    if (digits.length < 7) return this.mask(digits, { head: 2, tail: 2 });
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  }

  async sendOtp({ phone, otp }) {
    const { userid, profile, tmplId, endpoint } = this.getConfig();
    if (!profile) {
      return { ok: false, errorMessage: 'BOMIORA_OTP_BIZM_PROFILE 설정이 없습니다.' };
    }

    const phn = toE164Korea82(phone);
    if (!phn || phn.length < 11) {
      return { ok: false, errorMessage: '휴대폰 번호 형식이 올바르지 않습니다.' };
    }
    const msg = `[보미오라]인증번호는 ${otp}입니다.`;

    // Bizmsg 문서/레거시 연동에서 필드명이 혼재되어 있어,
    // 실서비스에서 통과하는 키들을 동시에 넣어 호환성을 확보합니다.
    const payload = {
      message_type: 'at',
      phn,
      // 발신프로필 키
      profile, // legacy key
      senderKey: profile,
      // 템플릿 코드
      tmplId, // legacy key
      templateCode: tmplId,
      msg,
      // 주의: 기본형 템플릿이면 title 보내면 K109
    };

    // 요청 트러블슈팅용 로그 (민감정보 마스킹)
    try {
      console.log('[BizmsgAlimtalkService] sendOtp request:', {
        endpoint,
        headers: {
          userid: this.mask(userid, { head: 2, tail: 2 }),
        },
        body: [
          {
            message_type: payload.message_type,
            phn: this.maskPhone(payload.phn),
            profile: this.mask(payload.profile, { head: 6, tail: 4 }),
            senderKey: this.mask(payload.senderKey, { head: 6, tail: 4 }),
            tmplId: payload.tmplId,
            templateCode: payload.templateCode,
            msg: String(payload.msg || '').replace(String(otp), '******'),
          },
        ],
      });
    } catch (_) {}

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // 비즈엠 API는 userid 헤더만 사용(여러 키를 같이 보내면 계정이 꼬여 실패할 수 있음)
        userid,
      },
      // Bizmsg v2 sender/send 는 단건이어도 JSON 배열 포맷을 요구하는 케이스가 있어
      // 항상 배열로 감싸 전송합니다.
      body: JSON.stringify([payload]),
    });

    let raw = null;
    try {
      raw = await res.json();
    } catch (_) {}

    const extractFailureMessage = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      return obj.message || obj.msg || obj.error || obj.errorMessage || obj.code || obj.resultCode || obj.result_code;
    };

    const isSuccessLike = (obj) => {
      if (!obj || typeof obj !== 'object') return false;
      if (obj.code === 'success') return true;
      if (String(obj.result || '').toUpperCase() === 'Y') return true;
      if (obj.success === true) return true;
      return false;
    };

    // 운영 이슈 트러블슈팅을 위해 raw를 최소한으로 로그(민감정보 제외)
    try {
      const safe = Array.isArray(raw)
        ? raw.map((x) => ({ code: x?.code, resultCode: x?.resultCode, message: x?.message, msg: x?.msg, status: x?.status }))
        : (raw && typeof raw === 'object')
          ? { code: raw.code, resultCode: raw.resultCode, message: raw.message, msg: raw.msg, status: raw.status }
          : raw;
      console.log('[BizmsgAlimtalkService] sendOtp response:', {
        httpStatus: res.status,
        ok: res.ok,
        body: safe,
      });
    } catch (_) {}

    // Bizmsg는 HTTP 200이어도 body에 오류 코드가 담기는 케이스가 있어
    // "res.ok + body 성공신호"를 함께 확인한다.
    if (res.ok) {
      // 배열 응답(복수건) 케이스 지원
      if (Array.isArray(raw)) {
        if (raw.length === 0) {
          return { ok: false, errorMessage: 'Bizmsg 응답이 비어 있습니다.', raw };
        }
        const anyFail = raw.some((x) => !isSuccessLike(x) && !!extractFailureMessage(x));
        if (anyFail) {
          const firstFail = raw.find((x) => !isSuccessLike(x) && !!extractFailureMessage(x));
          return { ok: false, errorMessage: String(extractFailureMessage(firstFail)), raw };
        }
        // 성공 신호가 명확히 없더라도, 실패 메시지가 없으면 일단 성공으로 간주
        return { ok: true, raw };
      }

      if (raw && typeof raw === 'object') {
        if (!isSuccessLike(raw) && extractFailureMessage(raw)) {
          return { ok: false, errorMessage: String(extractFailureMessage(raw)), raw };
        }
      }

      return { ok: true, raw };
    }

    const msgFromBody = Array.isArray(raw)
      ? extractFailureMessage(raw[0]) || '알림톡 발송 실패'
      : extractFailureMessage(raw);
    return {
      ok: false,
      errorMessage: msgFromBody ? String(msgFromBody) : `알림톡 발송 실패 (${res.status})`,
      raw,
    };
  }
}

module.exports = new BizmsgAlimtalkService();
module.exports.toE164Korea82 = toE164Korea82;

