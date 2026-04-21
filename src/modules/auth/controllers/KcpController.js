const kcpService = require('../services/kcpService');
const kcpResultStore = require('../services/kcpResultStore');

class KcpController {
  async request(req, res) {
    try {
      const pending = kcpResultStore.createPendingToken({
        ip: req.ip,
        userAgent: req.get('user-agent') || '',
      });

      const rawCallbackUrl = process.env.KCP_CALLBACK_URL
        || `${req.protocol}://${req.get('host')}/api/auth/kcp/callback`;
      // 일부 KCP 리턴에서는 param_opt_1 등이 POST body로 전달되지 않는 케이스가 있어,
      // 토큰을 쿼리로도 함께 전달해 결과 저장 토큰을 확실히 매칭한다.
      const callbackUrl = appendQueryToken(rawCallbackUrl, pending.token);

      const payload = await kcpService.createRequestPayload({
        callbackUrl,
        token: pending.token,
        paramOpt2: req.query.flow || 'register',
        paramOpt3: req.query.returnTo || '',
      });

      // callback에서 token이 유실되는 케이스 대비: orderId로도 역추적 가능하도록 저장한다.
      kcpResultStore.saveResult(pending.token, {
        status: 'pending',
        cert_completed: false,
        success: false,
        ordr_idxx: payload.orderId,
      });

      return res.json({
        success: true,
        token: pending.token,
        certUrl: payload.certUrl,
        site_cd: payload.siteCd,
        ordr_idxx: payload.orderId,
        Ret_URL: payload.fields.Ret_URL,
        up_hash: payload.upHash,
        cert_otp_use: payload.fields.cert_otp_use,
        cert_enc_use: payload.fields.cert_enc_use,
        param_opt_1: payload.fields.param_opt_1,
        param_opt_2: payload.fields.param_opt_2,
        param_opt_3: payload.fields.param_opt_3,
        fields: payload.fields,
        html: payload.html,
      });
    } catch (error) {
      console.error('❌ [KcpController] request 오류:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'KCP 요청 데이터 생성 중 오류가 발생했습니다.',
      });
    }
  }

  async callback(req, res) {
    let token = req.body.param_opt_1 || req.query.token || '';

    try {
      console.log('[KCP] callback hit', { token, res_cd: req.body?.res_cd, ip: req.ip });
      const {
        site_cd: siteCd = '',
        ordr_idxx: orderId = '',
        cert_no: certNo = '',
        cert_enc_use: certEncUse = '',
        enc_cert_data: encCertData = '',
        dn_hash: dnHash = '',
        res_cd: resCd = '',
        res_msg: resMsg = '',
      } = req.body;

      if (!token && orderId) {
        const found = kcpResultStore.findTokenByOrderId(orderId);
        if (found) {
          token = found;
          console.log('[KCP] token recovered from orderId', { orderId, token });
        }
      }

      if (!token) {
        throw new Error('KCP 결과 토큰이 없습니다. (param_opt_1/token 누락)');
      }

      if (certEncUse !== 'Y') {
        const cancelled = kcpResultStore.saveResult(token, {
          status: 'cancelled',
          cert_completed: false,
          success: false,
          res_cd: resCd,
          res_msg: resMsg,
          message: '본인인증이 취소되었습니다.',
        });

        return res
          .status(200)
          .type('html')
          .send(kcpService.buildCallbackHtml({
            token,
            success: false,
            message: cancelled.message,
          }));
      }

      if (resCd !== '0000') {
        const failed = kcpResultStore.saveResult(token, {
          status: 'failed',
          cert_completed: false,
          success: false,
          res_cd: resCd,
          res_msg: resMsg,
          message: decodeURIComponentSafe(resMsg) || '본인인증에 실패했습니다.',
        });

        return res
          .status(200)
          .type('html')
          .send(kcpService.buildCallbackHtml({
            token,
            success: false,
            message: failed.message,
          }));
      }

      const config = kcpService.getConfig();
      const verifyString = `${siteCd}${orderId}${certNo}`;
      const checkResult = await kcpService.checkValidHash(
        config.homeDir,
        config.encKey,
        dnHash,
        verifyString
      );

      if (checkResult !== '1') {
        throw new Error(`dn_hash 검증 실패: ${checkResult}`);
      }

      const decrypted = await kcpService.decryptEncCert(
        config.homeDir,
        config.encKey,
        siteCd,
        certNo,
        encCertData,
        '1'
      );

      const data = decrypted.parsed;
      const phone = normalizePhone(data.phone_no || '');
      const sexCode = data.sex_code || '';

      if (!phone) {
        throw new Error('복호화된 인증 정보에 휴대폰 번호가 없습니다.');
      }

      const result = kcpResultStore.saveResult(token, {
        status: 'success',
        success: true,
        cert_completed: true,
        site_cd: siteCd,
        ordr_idxx: orderId,
        cert_no: certNo,
        res_cd: resCd,
        res_msg: decodeURIComponentSafe(resMsg),
        name: data.user_name || '',
        phone,
        birthday: data.birth_day || '',
        sex_code: sexCode,
        gender: convertSexCode(sexCode),
        ci: data.ci || '',
        di: data.di || '',
        local_code: data.local_code || '',
        comm_id: data.comm_id || '',
        raw: {
          callback: req.body,
          decrypted: data,
        },
      });

      return res
        .status(200)
        .type('html')
        .send(kcpService.buildCallbackHtml({
          token,
          success: true,
          message: '인증 결과가 저장되었습니다. 앱으로 돌아가 주세요.',
        }));
    } catch (error) {
      console.error('❌ [KcpController] callback 오류:', error);

      if (token) {
        kcpResultStore.saveResult(token, {
          status: 'failed',
          cert_completed: false,
          success: false,
          message: error.message || 'KCP 콜백 처리 중 오류가 발생했습니다.',
          raw: {
            callback: req.body,
          },
        });
      }

      return res
        .status(200)
        .type('html')
        .send(kcpService.buildCallbackHtml({
          token,
          success: false,
          message: error.message || 'KCP 콜백 처리 중 오류가 발생했습니다.',
        }));
    }
  }

  async getResult(req, res) {
    try {
      const result = kcpResultStore.getResult(req.params.token);

      if (!result) {
        return res.status(404).json({
          success: false,
          cert_completed: false,
          message: '인증 결과를 찾을 수 없거나 만료되었습니다.',
        });
      }

      return res.json({
        success: result.success === true,
        status: result.status,
        cert_completed: result.cert_completed === true,
        token: result.token,
        name: result.name || null,
        phone: result.phone || null,
        birthday: result.birthday || null,
        sex_code: result.sex_code || null,
        gender: result.gender || null,
        ci: result.ci || null,
        di: result.di || null,
        res_cd: result.res_cd || null,
        res_msg: result.res_msg || null,
        message: result.message || null,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      console.error('❌ [KcpController] getResult 오류:', error);
      return res.status(500).json({
        success: false,
        cert_completed: false,
        message: '인증 결과 조회 중 오류가 발생했습니다.',
      });
    }
  }
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  return value || '';
}

function convertSexCode(sexCode) {
  if (sexCode === '01') {
    return 'M';
  }

  if (sexCode === '02') {
    return 'F';
  }

  return '';
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value || '');
  } catch (_) {
    return value || '';
  }
}

module.exports = new KcpController();

function appendQueryToken(url, token) {
  if (!url) return url;
  const hasQuery = url.includes('?');
  const sep = hasQuery ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}
